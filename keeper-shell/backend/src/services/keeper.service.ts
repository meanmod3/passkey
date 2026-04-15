// Integration seam — real Keeper Commander goes here.
// Mock: returns fake share URL with UUID and computed expiry.
//
// Reference: https://docs.keeper.io/en/keeperpam/commander-cli/command-reference/sharing-commands
// Real CLI commands this service stands in for:
//   one-time-share create <RECORD_UID> -e <TIME>
//   one-time-share remove <SHARE>
//   one-time-share list
// Where <TIME> is "<NUMBER>(mi|h|d)" (minutes | hours | days), e.g. "30mi", "1h", "7d".
import { randomUUID } from 'node:crypto';

export interface OneTimeShare {
  shareLink: string;
  expiresAt: Date;
  /**
   * Exact argv that the real Keeper Commander client would be spawned with to
   * produce this share. Kept here so the swap-in from mock → real is mechanical:
   *   child_process.execFile('keeper', share.commanderArgs, ...)
   * For the mock, this reflects what WOULD have been spawned.
   */
  commanderArgs?: string[];
}

export interface IKeeperService {
  /**
   * Create a one-time share for a Keeper record.
   *
   * When the real Keeper Commander is wired in place of the mock, this method
   * shells out to:
   *
   *   keeper one-time-share create <keeperRecordUid> -e <formatKeeperExpire(ttlMinutes)>
   *
   * and parses the share URL from stdout (line prefix `       URL : `).
   *
   * @param keeperRecordUid  Keeper record UID (populated on Record.keeperRecordUid
   *                         at record creation time, or via a one-off sync script).
   * @param ttlMinutes       Share lifetime in minutes. MUST be a positive integer.
   *                         Callers propagate the clamped `approvedDurationMin`
   *                         from the approval path (see lease.service.startLease).
   *                         No default — if the caller does not pass a TTL, reject
   *                         rather than fall back to a magic number. This value is
   *                         converted to the Commander `-e` format via
   *                         `formatKeeperExpire(ttlMinutes)`.
   */
  createOneTimeShare(keeperRecordUid: string, ttlMinutes: number): Promise<OneTimeShare>;

  /**
   * Revoke a previously issued one-time share.
   *
   * Real Commander: `keeper one-time-share remove <shareLink-or-id>`.
   */
  removeOneTimeShare(shareLink: string): Promise<void>;
}

/**
 * Format a TTL (in minutes) as the Keeper Commander `-e` / `--expire` argument value.
 * Commander accepts `<NUMBER>(mi|h|d)` (minutes | hours | days). Pick the coarsest
 * unit that represents the duration exactly:
 *
 *   formatKeeperExpire(30)    => "30mi"
 *   formatKeeperExpire(60)    => "1h"
 *   formatKeeperExpire(90)    => "90mi"  // 90 min ≠ whole hours, stay in minutes
 *   formatKeeperExpire(120)   => "2h"
 *   formatKeeperExpire(1440)  => "1d"
 *   formatKeeperExpire(2880)  => "2d"
 *   formatKeeperExpire(1500)  => "25h"   // 25h ≠ whole days, stay in hours
 *
 * Throws if `ttlMinutes` is not a positive finite number.
 */
export function formatKeeperExpire(ttlMinutes: number): string {
  if (!Number.isFinite(ttlMinutes) || ttlMinutes <= 0 || !Number.isInteger(ttlMinutes)) {
    throw new Error(
      `formatKeeperExpire: ttlMinutes must be a positive integer, got ${ttlMinutes}`,
    );
  }
  if (ttlMinutes % 1440 === 0) return `${ttlMinutes / 1440}d`;
  if (ttlMinutes % 60 === 0) return `${ttlMinutes / 60}h`;
  return `${ttlMinutes}mi`;
}

/**
 * Build the argv array that would be passed to the real Keeper Commander CLI
 * to create this one-time share. Kept as a pure helper so callers can log
 * / audit / dry-run the command before real commander is wired.
 */
export function buildKeeperCreateArgs(
  keeperRecordUid: string,
  ttlMinutes: number,
): string[] {
  return ['one-time-share', 'create', keeperRecordUid, '-e', formatKeeperExpire(ttlMinutes)];
}

export class MockKeeperService implements IKeeperService {
  // Track which fake shares have been revoked (purely for audit/observability).
  private readonly revoked = new Set<string>();

  async createOneTimeShare(keeperRecordUid: string, ttlMinutes: number): Promise<OneTimeShare> {
    // formatKeeperExpire enforces positive-integer invariant; keep this call
    // first so bad input surfaces before we allocate a token.
    const expireArg = formatKeeperExpire(ttlMinutes);
    const commanderArgs = ['one-time-share', 'create', keeperRecordUid, '-e', expireArg];
    const token = randomUUID();
    const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);
    const shareLink = `https://mock-keeper.local/ots/${keeperRecordUid}/${token}`;
    return { shareLink, expiresAt, commanderArgs };
  }

  async removeOneTimeShare(shareLink: string): Promise<void> {
    this.revoked.add(shareLink);
  }
}

export const keeperService: IKeeperService = new MockKeeperService();
