import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import { runExpirySweep, runRenewalSweep } from '../jobs/lease-scheduler.js';

export const leasesRouter = Router();

// Internal/scheduler — admin can also trigger manually for testing.
leasesRouter.use(requireAuth, requireRole('ADMIN'));

leasesRouter.post('/check-expiry', async (_req, res, next) => {
  try {
    const result = await runExpirySweep();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

leasesRouter.post('/send-renewals', async (_req, res, next) => {
  try {
    const result = await runRenewalSweep();
    res.json(result);
  } catch (err) {
    next(err);
  }
});
