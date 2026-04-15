import { prisma } from '../db.js';
import { HttpError } from '../middleware/error.middleware.js';
import { LeasePolicy } from '../policy/lease-policy.js';
import { writeAuditEvent } from './audit.service.js';
import { keeperService, formatKeeperExpire } from './keeper.service.js';
import { notificationService } from './notification.service.js';

/**
 * Start a lease: issue one-time share from the vault, set timestamps, flip Record to LEASED.
 * Called immediately after an approval.
 */
export async function startLease(params: {
  requestId: string;
  approverId: string;
  durationMinutes: number;
}) {
  const req = await prisma.request.findUnique({
    where: { id: params.requestId },
    include: { record: true, requester: true },
  });
  if (!req) throw new HttpError(404, 'request not found');

  const record = req.record;
  if (record.status === 'LOCKED') throw new HttpError(409, 'record is locked');

  const keeperUid = record.keeperRecordUid ?? `mock-${record.id}`;
  const share = await keeperService.createOneTimeShare(keeperUid, params.durationMinutes);

  const leaseStartedAt = new Date();
  const leaseExpiresAt = new Date(leaseStartedAt.getTime() + params.durationMinutes * 60_000);
  const renewalWindowStart = new Date(
    leaseExpiresAt.getTime() - LeasePolicy.renewalWindowMinutes * 60_000,
  );

  const updated = await prisma.$transaction(async (tx) => {
    const r = await tx.request.update({
      where: { id: params.requestId },
      data: {
        status: 'APPROVED',
        approvedDurationMin: params.durationMinutes,
        approverId: params.approverId,
        leaseStartedAt,
        leaseExpiresAt,
        renewalWindowStart,
        shareLink: share.shareLink,
        shareLinkExpiresAt: share.expiresAt,
      },
      include: { record: true, requester: true },
    });
    await tx.record.update({
      where: { id: record.id },
      data: { status: 'LEASED' },
    });
    return r;
  });

  const commanderExpire = formatKeeperExpire(params.durationMinutes);
  await writeAuditEvent({
    action: 'LEASE_STARTED',
    actorId: params.approverId,
    requestId: updated.id,
    detail: `durationMin=${params.durationMinutes} expires=${leaseExpiresAt.toISOString()}`,
  });
  await writeAuditEvent({
    action: 'SHARE_ISSUED',
    actorId: params.approverId,
    requestId: updated.id,
    detail: `ttl=${commanderExpire} shareLink=${share.shareLink}`,
  });

  await notificationService.sendShareLink({
    requesterId: updated.requesterId,
    recordName: updated.record.name,
    requestId: updated.id,
    shareLink: share.shareLink,
    expiresAt: share.expiresAt,
  });

  return updated;
}

export async function releaseLease(params: { requestId: string; actorId: string }) {
  const req = await prisma.request.findUnique({
    where: { id: params.requestId },
    include: { record: true },
  });
  if (!req) throw new HttpError(404, 'request not found');
  if (req.requesterId !== params.actorId) {
    throw new HttpError(403, 'only the requester can release their lease');
  }
  if (req.status !== 'APPROVED' && req.status !== 'RENEWAL_PENDING') {
    throw new HttpError(409, `cannot release request in status ${req.status}`);
  }

  if (req.shareLink) {
    try {
      await keeperService.removeOneTimeShare(req.shareLink);
    } catch (err) {
      // Log but don't block release — the share will still expire naturally via TTL.
      console.warn('[lease] removeOneTimeShare failed', err);
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.request.update({
      where: { id: req.id },
      data: { status: 'RELEASED' },
    });
    await tx.record.update({
      where: { id: req.recordId },
      data: { status: 'AVAILABLE' },
    });
  });

  await writeAuditEvent({
    action: 'LEASE_RELEASED',
    actorId: params.actorId,
    requestId: req.id,
  });

  return prisma.request.findUniqueOrThrow({
    where: { id: req.id },
    include: { record: true, requester: true, approver: true },
  });
}

/**
 * Expire a single lease: flip request + record, revoke share, notify requester.
 */
export async function expireLease(requestId: string): Promise<void> {
  const req = await prisma.request.findUnique({
    where: { id: requestId },
    include: { record: true },
  });
  if (!req) return;

  if (req.shareLink) {
    try {
      await keeperService.removeOneTimeShare(req.shareLink);
    } catch (err) {
      console.warn('[lease] removeOneTimeShare failed during expiry', err);
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.request.update({
      where: { id: req.id },
      data: { status: 'EXPIRED' },
    });
    await tx.record.update({
      where: { id: req.recordId },
      data: { status: 'AVAILABLE' },
    });
  });

  await writeAuditEvent({
    action: 'LEASE_EXPIRED',
    actorId: req.requesterId,
    requestId: req.id,
  });

  await notificationService.sendExpiryNotice({
    requesterId: req.requesterId,
    recordName: req.record.name,
    requestId: req.id,
  });
}

/**
 * Mark a live lease as renewal-pending and send the renewal prompt.
 */
export async function promptRenewal(requestId: string): Promise<void> {
  const req = await prisma.request.findUnique({
    where: { id: requestId },
    include: { record: true },
  });
  if (!req || !req.leaseExpiresAt) return;

  await prisma.$transaction(async (tx) => {
    await tx.request.update({
      where: { id: req.id },
      data: { status: 'RENEWAL_PENDING' },
    });
    await tx.record.update({
      where: { id: req.recordId },
      data: { status: 'RENEWAL_PENDING' },
    });
  });

  await writeAuditEvent({
    action: 'RENEWAL_PROMPTED',
    actorId: req.requesterId,
    requestId: req.id,
    detail: `expires=${req.leaseExpiresAt.toISOString()}`,
  });

  await notificationService.sendRenewalPrompt({
    requesterId: req.requesterId,
    recordName: req.record.name,
    requestId: req.id,
    expiresAt: req.leaseExpiresAt,
  });
}
