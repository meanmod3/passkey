import { prisma } from '../db.js';
import { HttpError } from '../middleware/error.middleware.js';
import { LeasePolicy, clampDuration, clampExtension } from '../policy/lease-policy.js';
import { writeAuditEvent } from './audit.service.js';
import { keeperService } from './keeper.service.js';
import { startLease } from './lease.service.js';

/**
 * Approve a PENDING request: pick approved duration (override or originally requested,
 * clamped to policy), eager-sync against the Keeper vault (intent 144 Phase 1),
 * then start the lease.
 *
 * Eager sync detects:
 *   - Orphan: the Record.keeperRecordUid no longer resolves in Keeper → 409,
 *     flip record.syncStatus=ORPHANED, write RECORD_ORPHANED audit, do NOT issue share
 *   - Rotation: Keeper's revision > our keeperRevision → write CREDENTIAL_ROTATED
 *     audit, update local cache, proceed with share
 *   - Owner change: Keeper's owner != our keeperOwner → logged in the
 *     CREDENTIAL_ROTATED detail (Phase 2 will add a dedicated notification)
 *
 * On a transient Keeper failure (network / 5xx) the thrown error propagates as
 * HTTP 503 — we do NOT fall back to stale local data, because issuing a share
 * against a rotated-but-unknown credential is worse than a visible failure.
 */
export async function approveRequest(params: {
  requestId: string;
  approverId: string;
  approvedDurationMin?: number;
}) {
  const req = await prisma.request.findUnique({
    where: { id: params.requestId },
    include: { record: true },
  });
  if (!req) throw new HttpError(404, 'request not found');
  if (req.status !== 'PENDING') {
    throw new HttpError(409, `cannot approve request in status ${req.status}`);
  }

  // ── Eager vault sync (Pattern 1) ──────────────────────────────────────────
  // Fire BEFORE startLease so a rotation / orphan is caught before we commit
  // lease + share-link state to the DB.
  const record = req.record;
  const keeperUid = record.keeperRecordUid ?? `mock-${record.id}`;

  let keeperLatest;
  try {
    keeperLatest = await keeperService.getRecord(keeperUid);
  } catch (err) {
    // Transient failure: propagate as 503. No fallback to stale data.
    const msg = err instanceof Error ? err.message : 'keeper vault unreachable';
    throw new HttpError(503, `vault sync failed: ${msg}`);
  }

  if (keeperLatest === null) {
    // Record deleted from Keeper. Flip local status, audit, and reject.
    await prisma.record.update({
      where: { id: record.id },
      data: { syncStatus: 'ORPHANED', syncedAt: new Date() },
    });
    await writeAuditEvent({
      action: 'RECORD_ORPHANED',
      actorId: params.approverId,
      requestId: req.id,
      detail: `keeperUid=${keeperUid} (record no longer exists in Keeper)`,
    });
    throw new HttpError(
      409,
      `record orphaned in Keeper (uid ${keeperUid}); cannot issue share`,
    );
  }

  // Detect rotation or owner change and audit accordingly.
  const rotationDetected = keeperLatest.revision > record.keeperRevision;
  const ownerChanged =
    record.keeperOwner !== null && record.keeperOwner !== keeperLatest.owner;
  if (rotationDetected) {
    await writeAuditEvent({
      action: 'CREDENTIAL_ROTATED',
      actorId: params.approverId,
      requestId: req.id,
      detail:
        `keeperUid=${keeperUid} revision ${record.keeperRevision}→${keeperLatest.revision}` +
        (ownerChanged ? ` owner ${record.keeperOwner}→${keeperLatest.owner}` : ''),
    });
  }

  // Refresh the local cache. We do this even when nothing changed so syncedAt
  // moves forward — the admin vault-sync dashboard uses syncedAt to colour
  // rows FRESH/STALE.
  await prisma.record.update({
    where: { id: record.id },
    data: {
      keeperRevision: keeperLatest.revision,
      keeperOwner: keeperLatest.owner,
      syncedAt: new Date(),
      syncStatus: 'FRESH',
    },
  });
  // ── End eager vault sync ──────────────────────────────────────────────────

  const approvedDuration = clampDuration(
    params.approvedDurationMin ?? req.requestedDurationMin,
  );

  await writeAuditEvent({
    action: 'REQUEST_APPROVED',
    actorId: params.approverId,
    requestId: req.id,
    detail: `approvedDurationMin=${approvedDuration}`,
  });

  return startLease({
    requestId: req.id,
    approverId: params.approverId,
    durationMinutes: approvedDuration,
  });
}

/**
 * Deny a PENDING request. Record goes back to AVAILABLE (unless some other state applies).
 */
export async function denyRequest(params: {
  requestId: string;
  approverId: string;
  reason?: string;
}) {
  const req = await prisma.request.findUnique({
    where: { id: params.requestId },
    include: { record: true },
  });
  if (!req) throw new HttpError(404, 'request not found');
  if (req.status !== 'PENDING') {
    throw new HttpError(409, `cannot deny request in status ${req.status}`);
  }

  await prisma.$transaction(async (tx) => {
    await tx.request.update({
      where: { id: req.id },
      data: { status: 'DENIED', approverId: params.approverId },
    });
    // If record was moved to PENDING_APPROVAL for this request, restore it to AVAILABLE.
    // If another active state applies (unusual), leave it alone.
    if (req.record.status === 'PENDING_APPROVAL') {
      await tx.record.update({
        where: { id: req.recordId },
        data: { status: 'AVAILABLE' },
      });
    }
  });

  await writeAuditEvent({
    action: 'REQUEST_DENIED',
    actorId: params.approverId,
    requestId: req.id,
    detail: params.reason ? `reason=${params.reason}` : null,
  });

  return prisma.request.findUniqueOrThrow({
    where: { id: req.id },
    include: { record: true, requester: true, approver: true },
  });
}

/**
 * Request an extension on an active lease. Creates a new EXTENSION request linked to the
 * parent via parentRequestId. If policy allows auto-approval this will approve it too;
 * current policy requires approver action, so we leave it PENDING and notify.
 */
export async function extendLease(params: {
  parentRequestId: string;
  requesterId: string;
  requestedDurationMin: number;
}) {
  const parent = await prisma.request.findUnique({
    where: { id: params.parentRequestId },
    include: { record: true },
  });
  if (!parent) throw new HttpError(404, 'request not found');
  if (parent.requesterId !== params.requesterId) {
    throw new HttpError(403, 'only the lease holder can request an extension');
  }
  if (parent.status !== 'APPROVED' && parent.status !== 'RENEWAL_PENDING') {
    throw new HttpError(409, `cannot extend request in status ${parent.status}`);
  }

  // Count prior extensions for this lease chain.
  const priorExtensions = await prisma.request.count({
    where: { parentRequestId: parent.id, type: 'EXTENSION' },
  });
  if (priorExtensions >= LeasePolicy.maxExtensionsPerLease) {
    throw new HttpError(409, `max extensions per lease (${LeasePolicy.maxExtensionsPerLease}) reached`);
  }

  const clamped = clampExtension(params.requestedDurationMin);

  const ext = await prisma.request.create({
    data: {
      recordId: parent.recordId,
      requesterId: params.requesterId,
      approverId: parent.approverId,
      reason: `Extension of ${parent.reason}`,
      requestedDurationMin: clamped,
      status: 'PENDING',
      type: 'EXTENSION',
      parentRequestId: parent.id,
    },
    include: { record: true, requester: true, approver: true },
  });

  await writeAuditEvent({
    action: 'RENEWAL_REQUESTED',
    actorId: params.requesterId,
    requestId: ext.id,
    detail: `parent=${parent.id} requested=${clamped}min`,
  });

  return ext;
}

/**
 * Approve an EXTENSION request — push parent's leaseExpiresAt forward by the extension's duration.
 */
export async function approveExtension(params: {
  extensionRequestId: string;
  approverId: string;
  approvedDurationMin?: number;
}) {
  const ext = await prisma.request.findUnique({
    where: { id: params.extensionRequestId },
    include: { record: true },
  });
  if (!ext) throw new HttpError(404, 'extension not found');
  if (ext.type !== 'EXTENSION') throw new HttpError(400, 'not an extension request');
  if (ext.status !== 'PENDING') {
    throw new HttpError(409, `cannot approve extension in status ${ext.status}`);
  }
  if (!ext.parentRequestId) throw new HttpError(500, 'extension missing parent');

  const parent = await prisma.request.findUnique({ where: { id: ext.parentRequestId } });
  if (!parent || !parent.leaseExpiresAt) {
    throw new HttpError(409, 'parent lease not active');
  }

  const duration = clampExtension(params.approvedDurationMin ?? ext.requestedDurationMin);
  const newExpiresAt = new Date(parent.leaseExpiresAt.getTime() + duration * 60_000);
  const newRenewalStart = new Date(newExpiresAt.getTime() - LeasePolicy.renewalWindowMinutes * 60_000);

  await prisma.$transaction(async (tx) => {
    await tx.request.update({
      where: { id: ext.id },
      data: {
        status: 'APPROVED',
        approvedDurationMin: duration,
        approverId: params.approverId,
      },
    });
    await tx.request.update({
      where: { id: parent.id },
      data: {
        status: 'APPROVED',
        leaseExpiresAt: newExpiresAt,
        renewalWindowStart: newRenewalStart,
        approvedDurationMin: (parent.approvedDurationMin ?? 0) + duration,
      },
    });
    await tx.record.update({
      where: { id: ext.recordId },
      data: { status: 'LEASED' },
    });
  });

  await writeAuditEvent({
    action: 'EXTENSION_APPROVED',
    actorId: params.approverId,
    requestId: ext.id,
    detail: `parent=${parent.id} +${duration}min newExpires=${newExpiresAt.toISOString()}`,
  });

  return prisma.request.findUniqueOrThrow({
    where: { id: parent.id },
    include: { record: true, requester: true, approver: true },
  });
}

export async function denyExtension(params: {
  extensionRequestId: string;
  approverId: string;
  reason?: string;
}) {
  const ext = await prisma.request.findUnique({ where: { id: params.extensionRequestId } });
  if (!ext) throw new HttpError(404, 'extension not found');
  if (ext.type !== 'EXTENSION') throw new HttpError(400, 'not an extension request');
  if (ext.status !== 'PENDING') {
    throw new HttpError(409, `cannot deny extension in status ${ext.status}`);
  }

  await prisma.request.update({
    where: { id: ext.id },
    data: { status: 'DENIED', approverId: params.approverId },
  });

  await writeAuditEvent({
    action: 'EXTENSION_DENIED',
    actorId: params.approverId,
    requestId: ext.id,
    detail: params.reason ? `reason=${params.reason}` : null,
  });

  return prisma.request.findUniqueOrThrow({
    where: { id: ext.id },
    include: { record: true, requester: true, approver: true },
  });
}
