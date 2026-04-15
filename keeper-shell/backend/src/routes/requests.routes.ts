import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.middleware.js';
import { HttpError } from '../middleware/error.middleware.js';
import { createRequest, listRequests, getRequest } from '../services/request.service.js';
import { approveRequest, denyRequest, extendLease, approveExtension, denyExtension } from '../services/approval.service.js';
import { releaseLease } from '../services/lease.service.js';

export const requestsRouter = Router();
requestsRouter.use(requireAuth);

const CreateBody = z.object({
  recordId: z.string().uuid(),
  reason: z.string().min(1).max(2000),
  requestedDurationMin: z.number().int().positive().max(10_000),
  notes: z.string().max(4000).optional(),
});

const ApproveBody = z.object({
  approvedDurationMin: z.number().int().positive().max(10_000).optional(),
});

const DenyBody = z.object({
  reason: z.string().max(2000).optional(),
});

const ExtendBody = z.object({
  requestedDurationMin: z.number().int().positive().max(10_000),
});

function parseOrThrow<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new HttpError(400, 'invalid body', parsed.error.format());
  }
  return parsed.data;
}

// POST /api/requests — create a new access request
requestsRouter.post('/', async (req, res, next) => {
  try {
    const body = parseOrThrow(CreateBody, req.body);
    const created = await createRequest({
      recordId: body.recordId,
      requesterId: req.user!.userId,
      reason: body.reason,
      requestedDurationMin: body.requestedDurationMin,
      notes: body.notes,
    });
    res.status(201).json({ request: serializeRequest(created) });
  } catch (err) {
    next(err);
  }
});

// GET /api/requests — list requests (filterable)
requestsRouter.get('/', async (req, res, next) => {
  try {
    const me = req.user!;
    const requesterFilter = typeof req.query.requesterId === 'string' ? req.query.requesterId : undefined;
    // Requesters can only see their own requests. Approvers/Admins can see all.
    const effectiveRequesterId =
      me.role === 'REQUESTER' ? me.userId : requesterFilter;

    const rows = await listRequests({
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
      recordId: typeof req.query.recordId === 'string' ? req.query.recordId : undefined,
      requesterId: effectiveRequesterId,
      approverId: typeof req.query.approverId === 'string' ? req.query.approverId : undefined,
    });
    res.json({ requests: rows.map(serializeRequest) });
  } catch (err) {
    next(err);
  }
});

// GET /api/requests/:id
requestsRouter.get('/:id', async (req, res, next) => {
  try {
    const request = await getRequest(req.params.id);
    // Requesters can only see their own. Approvers/Admins can see all.
    if (req.user!.role === 'REQUESTER' && request.requesterId !== req.user!.userId) {
      throw new HttpError(403, 'forbidden');
    }
    res.json({ request: serializeRequest(request) });
  } catch (err) {
    next(err);
  }
});

// POST /api/requests/:id/approve — approver-only
requestsRouter.post('/:id/approve', async (req, res, next) => {
  try {
    const me = req.user!;
    if (me.role !== 'APPROVER' && me.role !== 'ADMIN') {
      throw new HttpError(403, 'only approvers can approve');
    }
    const body = parseOrThrow(ApproveBody, req.body);
    const existing = await getRequest(req.params.id);
    const updated =
      existing.type === 'EXTENSION'
        ? await approveExtension({
            extensionRequestId: req.params.id,
            approverId: me.userId,
            approvedDurationMin: body.approvedDurationMin,
          })
        : await approveRequest({
            requestId: req.params.id,
            approverId: me.userId,
            approvedDurationMin: body.approvedDurationMin,
          });
    res.json({ request: serializeRequest(updated) });
  } catch (err) {
    next(err);
  }
});

// POST /api/requests/:id/deny — approver-only
requestsRouter.post('/:id/deny', async (req, res, next) => {
  try {
    const me = req.user!;
    if (me.role !== 'APPROVER' && me.role !== 'ADMIN') {
      throw new HttpError(403, 'only approvers can deny');
    }
    const body = parseOrThrow(DenyBody, req.body);
    const existing = await getRequest(req.params.id);
    const updated =
      existing.type === 'EXTENSION'
        ? await denyExtension({
            extensionRequestId: req.params.id,
            approverId: me.userId,
            reason: body.reason,
          })
        : await denyRequest({
            requestId: req.params.id,
            approverId: me.userId,
            reason: body.reason,
          });
    res.json({ request: serializeRequest(updated) });
  } catch (err) {
    next(err);
  }
});

// POST /api/requests/:id/release — requester releases their own lease early
requestsRouter.post('/:id/release', async (req, res, next) => {
  try {
    const updated = await releaseLease({
      requestId: req.params.id,
      actorId: req.user!.userId,
    });
    res.json({ request: serializeRequest(updated) });
  } catch (err) {
    next(err);
  }
});

// POST /api/requests/:id/extend — requester asks for more time
requestsRouter.post('/:id/extend', async (req, res, next) => {
  try {
    const body = parseOrThrow(ExtendBody, req.body);
    const extension = await extendLease({
      parentRequestId: req.params.id,
      requesterId: req.user!.userId,
      requestedDurationMin: body.requestedDurationMin,
    });
    res.status(201).json({ request: serializeRequest(extension) });
  } catch (err) {
    next(err);
  }
});

// Helper to keep API shape consistent with shared types.
function serializeRequest(r: Awaited<ReturnType<typeof getRequest>>) {
  return {
    id: r.id,
    recordId: r.recordId,
    record: r.record ? { id: r.record.id, name: r.record.name, systemName: r.record.systemName, environment: r.record.environment, status: r.record.status } : undefined,
    requesterId: r.requesterId,
    requester: r.requester,
    approverId: r.approverId,
    approver: r.approver ?? null,
    reason: r.reason,
    notes: r.notes,
    requestedDurationMin: r.requestedDurationMin,
    approvedDurationMin: r.approvedDurationMin,
    status: r.status,
    type: r.type,
    leaseStartedAt: r.leaseStartedAt?.toISOString() ?? null,
    leaseExpiresAt: r.leaseExpiresAt?.toISOString() ?? null,
    renewalWindowStart: r.renewalWindowStart?.toISOString() ?? null,
    shareLink: r.shareLink,
    shareLinkExpiresAt: r.shareLinkExpiresAt?.toISOString() ?? null,
    parentRequestId: r.parentRequestId,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}
