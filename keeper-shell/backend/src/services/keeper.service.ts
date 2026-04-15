// Integration seam — real Keeper Commander goes here.
// Mock: returns fake share URL with UUID and computed expiry.
import { randomUUID } from 'node:crypto';

export interface OneTimeShare {
  shareLink: string;
  expiresAt: Date;
}

export interface IKeeperService {
  createOneTimeShare(keeperRecordUid: string, ttlMinutes: number): Promise<OneTimeShare>;
  removeOneTimeShare(shareLink: string): Promise<void>;
}

export class MockKeeperService implements IKeeperService {
  // Track which fake shares have been revoked (purely for audit/observability).
  private readonly revoked = new Set<string>();

  async createOneTimeShare(keeperRecordUid: string, ttlMinutes: number): Promise<OneTimeShare> {
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
