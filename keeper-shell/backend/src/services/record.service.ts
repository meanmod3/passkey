import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { HttpError } from '../middleware/error.middleware.js';

const userPick: Prisma.UserSelect = {
  id: true,
  displayName: true,
  email: true,
  role: true,
};

export interface ListRecordsQuery {
  q?: string;
  environment?: string;
  status?: string;
}

export async function listRecords(query: ListRecordsQuery) {
  const where: Prisma.RecordWhereInput = {};
  if (query.environment) where.environment = query.environment as Prisma.EnumEnvironmentFilter['equals'];
  if (query.status) where.status = query.status as Prisma.EnumRecordStatusFilter['equals'];
  if (query.q) {
    where.OR = [
      { name: { contains: query.q, mode: 'insensitive' } },
      { systemName: { contains: query.q, mode: 'insensitive' } },
    ];
  }

  const records = await prisma.record.findMany({
    where,
    include: {
      owner: { select: userPick },
      requests: {
        where: { status: { in: ['APPROVED', 'RENEWAL_PENDING'] } },
        include: { requester: { select: userPick } },
        orderBy: { leaseStartedAt: 'desc' },
        take: 1,
      },
    },
    orderBy: [{ environment: 'asc' }, { name: 'asc' }],
  });

  const now = Date.now();
  return records.map((r) => {
    const activeReq = r.requests[0];
    const currentLease =
      activeReq && activeReq.leaseExpiresAt && activeReq.leaseExpiresAt.getTime() > now
        ? activeReq
        : null;
    return {
      id: r.id,
      name: r.name,
      systemName: r.systemName,
      environment: r.environment,
      status: r.status,
      ownerId: r.ownerId,
      owner: r.owner,
      approverGroupId: r.approverGroupId,
      hideBorrower: r.hideBorrower,
      currentLease,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  });
}

export async function getRecord(id: string) {
  const record = await prisma.record.findUnique({
    where: { id },
    include: {
      owner: { select: userPick },
      requests: {
        include: { requester: { select: userPick } },
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
    },
  });
  if (!record) throw new HttpError(404, 'record not found');

  const now = Date.now();
  const currentLease = record.requests.find(
    (r) =>
      (r.status === 'APPROVED' || r.status === 'RENEWAL_PENDING') &&
      r.leaseExpiresAt !== null &&
      r.leaseExpiresAt.getTime() > now,
  ) ?? null;

  return {
    id: record.id,
    name: record.name,
    systemName: record.systemName,
    environment: record.environment,
    status: record.status,
    ownerId: record.ownerId,
    owner: record.owner,
    approverGroupId: record.approverGroupId,
    keeperRecordUid: record.keeperRecordUid,
    hideBorrower: record.hideBorrower,
    currentLease,
    history: record.requests.slice(0, 5),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

/**
 * Return the current active lease Request for a record, or null.
 * Active = status in (APPROVED, RENEWAL_PENDING) AND leaseExpiresAt > now.
 */
export async function findActiveLeaseForRecord(recordId: string) {
  const now = new Date();
  return prisma.request.findFirst({
    where: {
      recordId,
      status: { in: ['APPROVED', 'RENEWAL_PENDING'] },
      leaseExpiresAt: { gt: now },
    },
    orderBy: { leaseStartedAt: 'desc' },
  });
}

/**
 * Pick an approver for a record. Mock policy: round-robin-ish via "first APPROVER
 * who is not the record owner". Real policy would use approverGroupId + Entra groups.
 */
export async function pickApproverForRecord(record: { ownerId: string }) {
  const approver = await prisma.user.findFirst({
    where: { role: 'APPROVER', id: { not: record.ownerId } },
    orderBy: { displayName: 'asc' },
  });
  if (!approver) throw new HttpError(500, 'no approver available');
  return approver;
}
