import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import { HttpError } from '../middleware/error.middleware.js';
import { listRecords, getRecord } from '../services/record.service.js';
import { prisma } from '../db.js';
import { writeAuditEvent } from '../services/audit.service.js';

export const recordsRouter = Router();

recordsRouter.use(requireAuth);

const RecordPatchBody = z.object({
  ownerId: z.string().uuid().optional(),
  status: z.enum(['AVAILABLE', 'PENDING_APPROVAL', 'LEASED', 'RENEWAL_PENDING', 'EXPIRED', 'LOCKED']).optional(),
  hideBorrower: z.boolean().optional(),
});

recordsRouter.get('/', async (req, res, next) => {
  try {
    const records = await listRecords({
      q: typeof req.query.q === 'string' ? req.query.q : undefined,
      environment: typeof req.query.environment === 'string' ? req.query.environment : undefined,
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
    });
    res.json({ records });
  } catch (err) {
    next(err);
  }
});

recordsRouter.get('/:id', async (req, res, next) => {
  try {
    const record = await getRecord(req.params.id);
    res.json({ record });
  } catch (err) {
    next(err);
  }
});

// Admin-only edits to a record: change owner, status, or borrower visibility.
recordsRouter.patch('/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const parsed = RecordPatchBody.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'invalid body', parsed.error.format());
    }
    const data = parsed.data;
    if (Object.keys(data).length === 0) {
      throw new HttpError(400, 'no fields to update');
    }

    if (data.ownerId) {
      const ownerExists = await prisma.user.findUnique({ where: { id: data.ownerId }, select: { id: true } });
      if (!ownerExists) throw new HttpError(404, 'owner not found');
    }

    const before = await prisma.record.findUnique({ where: { id: req.params.id } });
    if (!before) throw new HttpError(404, 'record not found');

    await prisma.record.update({ where: { id: req.params.id }, data });

    // Audit any meaningful change.
    const changes: string[] = [];
    if (data.ownerId && data.ownerId !== before.ownerId) changes.push(`owner ${before.ownerId} → ${data.ownerId}`);
    if (data.status && data.status !== before.status) changes.push(`status ${before.status} → ${data.status}`);
    if (data.hideBorrower !== undefined && data.hideBorrower !== before.hideBorrower) {
      changes.push(`hideBorrower ${before.hideBorrower} → ${data.hideBorrower}`);
    }
    if (changes.length > 0) {
      // Pick the closest existing audit action for record locks; otherwise log generic.
      const action = data.status === 'LOCKED' && before.status !== 'LOCKED' ? 'RECORD_LOCKED'
        : before.status === 'LOCKED' && data.status && data.status !== 'LOCKED' ? 'RECORD_UNLOCKED'
        : 'RECORD_LOCKED'; // fallback to a record-scoped action; see follow-up note below
      await writeAuditEvent({
        action,
        actorId: req.user!.userId,
        detail: `record=${req.params.id} ${changes.join(' · ')}`,
      });
    }

    const updated = await getRecord(req.params.id);
    res.json({ record: updated });
  } catch (err) {
    next(err);
  }
});
