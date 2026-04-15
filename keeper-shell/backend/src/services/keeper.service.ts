// Integration seam — real Keeper Commander goes here.
// Mock: returns fake share URL with UUID and computed expiry.
import { randomUUID } from 'node:crypto';

export interface OneTimeShare {
  shareLink: string;
  expiresAt: Date;
}

export interface IKeeperService {
  /**
   * Create a one-time share for a Keeper record.
   *
   * @param keeperRecordUid  Keeper record UID (populated on Record.keeperRecordUid
   *                         at record creation time, or via a one-off sync script).
   * @param ttlMinutes       Share lifetime in minutes. MUST be passed through to
   *                         Keeper Commander as the `--expire <ttl>m` arg on
   *                         `keeper one-time-share-create`. Callers propagate the
   *                         clamped `approvedDurationMin` from the approval path
   *                         (see lease.service.startLease). No default — if the
   *                         caller does not pass a TTL, reject rather than fall
   *                         back to a magic number.
   */
  createOneTimeShare(keeperRecordUid: string, ttlMinutes: number): Promise<OneTimeShare>;
  removeOneTimeShare(shareLink: string): Promise<void>;
}

export class MockKeeperService implements IKeeperService {
  // Track which fake shares have been revoked (purely for audit/observability).
  private readonly revoked = new Set<string>();

  async createOneTimeShare(keeperRecordUid: string, ttlMinutes: number): Promise<OneTimeShare> {
    if (!Number.isFinite(ttlMinutes) || ttlMinutes <= 0) {
      throw new Error(`createOneTimeShare: ttlMinutes must be a positive number, got ${ttlMinutes}`);
    }
    const token = randomUUID();
    const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);
    const shareLink = `https://mock-keeper.local/ots/${keeperRecordUid}/${token}`;
    return { shareLink, expiresAt };
  }

  async removeOneTimeShare(shareLink: string): Promise<void> {
    this.revoked.add(shareLink);
  }
}

export const keeperService: IKeeperService = new MockKeeperService();
