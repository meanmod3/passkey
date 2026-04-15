import type { AuditAction } from '@keeper-shell/shared';
import { prisma } from '../db.js';

export async function writeAuditEvent(params: {
  action: AuditAction;
  actorId: string;
  requestId?: string | null;
  detail?: string | null;
}): Promise<void> {
  await prisma.auditEvent.create({
    data: {
      action: params.action,
      actorId: params.actorId,
      requestId: params.requestId ?? null,
      detail: params.detail ?? null,
    },
  });
}

export interface AuditQuery {
  recordId?: string;
  requestId?: string;
  actorId?: string;
  action?: AuditAction;
  limit?: number;
}

export async function listAuditEvents(q: AuditQuery) {
  const where: Record<string, unknown> = {};
  if (q.actorId) where.actorId = q.actorId;
  if (q.action) where.action = q.action;
  if (q.requestId) where.requestId = q.requestId;
  if (q.recordId) where.request = { recordId: q.recordId };
  return prisma.auditEvent.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: q.limit ?? 200,
    include: { actor: true, request: { include: { record: true } } },
  });
}
