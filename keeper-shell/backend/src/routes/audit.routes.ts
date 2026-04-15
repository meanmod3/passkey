import { Router } from 'express';
import type { AuditAction } from '@keeper-shell/shared';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import { listAuditEvents } from '../services/audit.service.js';

export const auditRouter = Router();

auditRouter.use(requireAuth);

auditRouter.get('/', requireRole('ADMIN'), async (req, res) => {
  const events = await listAuditEvents({
    recordId: typeof req.query.recordId === 'string' ? req.query.recordId : undefined,
    requestId: typeof req.query.requestId === 'string' ? req.query.requestId : undefined,
    actorId: typeof req.query.actorId === 'string' ? req.query.actorId : undefined,
    action: typeof req.query.action === 'string' ? (req.query.action as AuditAction) : undefined,
    limit: typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined,
  });
  res.json({ events });
});
