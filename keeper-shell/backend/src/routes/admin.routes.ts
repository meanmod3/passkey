import { Router } from 'express';
import type {
  SyncStatus,
  VaultSyncRecordDTO,
  VaultSyncStatusResponse,
  VaultSyncSummary,
} from '@keeper-shell/shared';
import { prisma } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';

export const adminRouter = Router();

adminRouter.use(requireAuth);
adminRouter.use(requireRole('ADMIN'));

/**
 * Staleness threshold. Intent 144 Phase 1 inlines this as a constant; Phase 2
 * moves it (plus the other sync knobs) into a dedicated `SyncPolicy` module
 * at `backend/src/policy/sync-policy.ts`. When that happens, this file should
 * import the value instead of hard-coding it.
 */
const STALE_SINCE_MINUTES = 30;

/**
 * GET /api/admin/vault-sync-status
 *
 * Returns a snapshot of every Record's sync freshness vs. the Keeper vault.
 * Gated to ADMIN only. READ-ONLY — the manual-sync and orphan-reconciliation
 * endpoints from the architecture doc are deferred to Phase 2.
 */
adminRouter.get('/vault-sync-status', async (_req, res) => {
  const rows = await prisma.record.findMany({
    select: {
      id: true,
      name: true,
      keeperRecordUid: true,
      status: true,
      syncStatus: true,
      syncedAt: true,
      keeperRevision: true,
      keeperOwner: true,
    },
    orderBy: { syncedAt: 'asc' },
  });

  const now = Date.now();
  const oneHourAgo = now - 60 * 60_000;
  const staleCutoff = now - STALE_SINCE_MINUTES * 60_000;

  const records: VaultSyncRecordDTO[] = rows.map((r) => {
    const syncedAtMs = r.syncedAt.getTime();
    const ageMinutes = Math.max(0, Math.floor((now - syncedAtMs) / 60_000));
    // Compute a display label. ORPHANED always wins over age-based labels.
    let healthLabel: VaultSyncRecordDTO['healthLabel'];
    if (r.syncStatus === 'ORPHANED') healthLabel = 'ORPHANED';
    else if (r.syncStatus === 'UNKNOWN') healthLabel = 'UNKNOWN';
    else if (syncedAtMs < staleCutoff) healthLabel = 'STALE';
    else healthLabel = 'FRESH';
    return {
      id: r.id,
      name: r.name,
      keeperUid: r.keeperRecordUid,
      status: r.status,
      syncStatus: r.syncStatus as SyncStatus,
      syncedAt: r.syncedAt.toISOString(),
      revision: r.keeperRevision,
      keeperOwner: r.keeperOwner,
      ageMinutes,
      healthLabel,
    };
  });

  const summary: VaultSyncSummary = {
    totalRecords: records.length,
    syncedInLastHour: rows.filter((r) => r.syncedAt.getTime() >= oneHourAgo).length,
    stale: records.filter((r) => r.healthLabel === 'STALE').length,
    orphaned: records.filter((r) => r.healthLabel === 'ORPHANED').length,
  };

  const response: VaultSyncStatusResponse = {
    summary,
    records,
    generatedAt: new Date().toISOString(),
    staleSinceMinutes: STALE_SINCE_MINUTES,
  };
  res.json(response);
});
