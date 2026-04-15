import cron from 'node-cron';
import { prisma } from '../db.js';
import { expireLease, promptRenewal } from '../services/lease.service.js';

/**
 * Scheduler runs every 60 seconds and performs two sweeps:
 *   1. Expiry check — any LEASED/RENEWAL_PENDING request past leaseExpiresAt is expired.
 *   2. Renewal prompt — any LEASED request whose renewalWindowStart has passed but who has
 *      not yet been prompted transitions to RENEWAL_PENDING and gets a notification.
 *
 * Idempotent: both operations no-op if the request has already moved on.
 */
export function startLeaseScheduler(): () => void {
  const task = cron.schedule('*/1 * * * *', async () => {
    const tick = new Date().toISOString();
    try {
      await runExpirySweep();
      await runRenewalSweep();
    } catch (err) {
      console.error(`[scheduler] tick ${tick} failed`, err);
    }
  });
  console.log('[scheduler] lease expiry + renewal sweeps running every 60s');
  return () => task.stop();
}

export async function runExpirySweep(): Promise<{ expired: number }> {
  const now = new Date();
  const overdue = await prisma.request.findMany({
    where: {
      status: { in: ['APPROVED', 'RENEWAL_PENDING'] },
      leaseExpiresAt: { lt: now },
    },
    select: { id: true },
  });
  for (const r of overdue) {
    await expireLease(r.id);
  }
  if (overdue.length > 0) {
    console.log(`[scheduler] expired ${overdue.length} lease${overdue.length === 1 ? '' : 's'}`);
  }
  return { expired: overdue.length };
}

export async function runRenewalSweep(): Promise<{ prompted: number }> {
  const now = new Date();
  const due = await prisma.request.findMany({
    where: {
      status: 'APPROVED',
      renewalWindowStart: { lt: now },
      leaseExpiresAt: { gt: now },
    },
    select: { id: true },
  });
  for (const r of due) {
    await promptRenewal(r.id);
  }
  if (due.length > 0) {
    console.log(`[scheduler] prompted ${due.length} renewal${due.length === 1 ? '' : 's'}`);
  }
  return { prompted: due.length };
}
