import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { HttpError } from '../middleware/error.middleware.js';
import { LeasePolicy, clampDuration } from '../policy/lease-policy.js';
import { writeAuditEvent } from './audit.service.js';
import { notificationService } from './notification.service.js';
import { pickApproverForRecord } from './record.service.js';

const userPick: Prisma.UserSelect = {
  id: true,
  displayName: true,
  email: true,
  role: true,
};

const requestInclude = {
  record: true,
  requester: { select: userPick },
  approver: { select: userPick },
} as const;

export interface CreateRequestParams {
  recordId: string;
  requesterId: string;
  reason: string;
  requestedDurationMin: number;
  notes?: string;
}

export async function createRequest(params: CreateRequestParams) {
  if (!params.reason.trim()) {
    throw new HttpError(400, 'reason is required');
  }
  const duration = clampDuration(params.requestedDurationMin);

  const record = await prisma.record.findUnique({ where: { id: params.recordId } });
  if (!record) throw new HttpError(404, 'record not found');
  if (record.status === 'LOCKED') throw new HttpError(409, 'record is locked');
  if (record.ownerId === params.requesterId) {
    throw new HttpError(400, 'owner cannot request access to their own record');
  }

  // Block duplicate outstanding requests from the same user for the same record.
  const existing = await prisma.request.findFirst({
    where: {
      recordId: params.recordId,
      requesterId: params.requesterId,
      status: { in: ['PENDING', 'APPROVED', 'RENEWAL_PENDING'] },
    },
  });
  if (existing) {
    throw new HttpError(409, 'you already have an open request or active lease for this record', {
      existingRequestId: existing.id,
    });
  }

  // One active passkey per user — unless the admin has flipped allowMultipleLeases.
  const requester = await prisma.user.findUnique({
    where: { id: params.requesterId },
    select: { allowMultipleLeases: true },
  });
  if (requester && !requester.allowMultipleLeases) {
    const otherActive = await prisma.request.findFirst({
      where: {
        requesterId: params.requesterId,
        status: { in: ['APPROVED', 'RENEWAL_PENDING'] },
        leaseExpiresAt: { gt: new Date() },
      },
      select: { id: true, recordId: true },
    });
    if (otherActive) {
      throw new HttpError(409, 'you already hold an active passkey — return it before requesting another', {
        activeRequestId: otherActive.id,
        activeRecordId: otherActive.recordId,
      });
    }
  }

  const approver = await pickApproverForRecord(record);

  const created = await prisma.$transaction(async (tx) => {
    const req = await tx.request.create({
      data: {
        recordId: params.recordId,
        requesterId: params.requesterId,
        approverId: approver.id,
        reason: params.reason.trim(),
        notes: params.notes?.trim() || null,
        requestedDurationMin: duration,
        status: 'PENDING',
        type: 'INITIAL',
      },
      include: requestInclude,
    });
    // Move record into PENDING_APPROVAL only if it was AVAILABLE.
    // If it's already LEASED/RENEWAL_PENDING, don't change status.
    if (record.status === 'AVAILABLE') {
      await tx.record.update({
        where: { id: record.id },
        data: { status: 'PENDING_APPROVAL' },
      });
    }
    return req;
  });

  await writeAuditEvent({
    action: 'REQUEST_CREATED',
    actorId: params.requesterId,
    requestId: created.id,
    detail: `duration=${duration}min`,
  });

  await notificationService.sendApprovalRequest({
    approverId: approver.id,
    requesterDisplayName: created.requester.displayName,
    recordName: created.record.name,
    requestId: created.id,
    reason: created.reason,
    requestedDurationMin: duration,
  });

  return created;
}

export interface ListRequestsQuery {
  status?: string;
  recordId?: string;
  requesterId?: string;
  approverId?: string;
}

export async function listRequests(q: ListRequestsQuery) {
  const where: Prisma.RequestWhereInput = {};
  if (q.status) where.status = q.status as Prisma.EnumRequestStatusFilter['equals'];
  if (q.recordId) where.recordId = q.recordId;
  if (q.requesterId) where.requesterId = q.requesterId;
  if (q.approverId) where.approverId = q.approverId;

  return prisma.request.findMany({
    where,
    include: requestInclude,
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
}

export async function getRequest(id: string) {
  const req = await prisma.request.findUnique({ where: { id }, include: requestInclude });
  if (!req) throw new HttpError(404, 'request not found');
  return req;
}

export const __policy_for_tests = { maxDurationMinutes: LeasePolicy.maxDurationMinutes };
