// Integration seam — real Keeper Commander goes here.
// Mock: returns fake share URL with UUID and computed expiry, plus a seeded
// in-memory "vault" so getRecord can answer read queries for eager-sync.
//
// Reference: https://docs.keeper.io/en/keeperpam/commander-cli/command-reference/sharing-commands
// Real CLI commands this service stands in for:
//   one-time-share create <RECORD_UID> -e <TIME>
//   one-time-share remove <SHARE>
//   one-time-share list
//   record-get <RECORD_UID> --format json     ← intent 144 getRecord reads this
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

/**
 * Canonical shape of a Keeper vault record, as returned by the Keeper Commander
 * CLI `record-get <uid> --format json` (or its SDK equivalent). Added in
 * intent 144 Phase 1 to support vault hydration: approval.service reads this
 * BEFORE issuing a share so stale local state can be detected (rotation,
 * owner change, deletion).
 *
 * The real Commander exposes many more fields (custom fields, attachments,
 * folder paths, ACLs); this interface is the narrow subset keeper-shell
 * actually reasons about.
 */
export interface KeeperRecord {
  /** Keeper record UID — primary key in the vault */
  uid: string;
  /** Human-readable title */
  title: string;
  /** Login/username field, if any */
  login?: string;
  /** Monotonically-increasing integer; Keeper bumps this on every edit */
  revision: number;
  /** Owner email (NOT the borrower — that's a Keeper-Shell concept) */
  owner: string;
  /** Tags array (may be empty) */
  tags: string[];
  /** Folder path in the vault */
  folder: string;
  /** Last-modified timestamp from the vault */
  lastModified: Date;
  /** Creation timestamp */
  createdAt: Date;
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

  /**
   * Read a record from the Keeper vault (source of truth). Returns null if the
   * UID no longer resolves (record deleted in Keeper) — callers MUST treat
   * null as an ORPHANED signal, not a transient failure.
   *
   * Used by intent 144 Phase 1 eager-sync in approval.service.approveRequest
   * to:
   *   (a) detect orphaning before issuing a share link against a ghost record
   *   (b) detect revision bumps (rotation) and write CREDENTIAL_ROTATED audit
   *   (c) refresh Record.keeperRevision / keeperOwner / syncedAt / syncStatus
   *
   * When the real Keeper Commander is wired, this shells out to:
   *   keeper record-get <uid> --format json
   * and parses the response into a KeeperRecord. Transient Keeper API errors
   * (timeout, 5xx) should throw — the approval path propagates as HTTP 503 so
   * callers know to retry, rather than silently falling back to stale data.
   */
  getRecord(keeperRecordUid: string): Promise<KeeperRecord | null>;
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

  /**
   * Seeded in-memory "vault" — used by getRecord to answer read queries.
   * Keys are Keeper record UIDs (matching the `kpr-<slug>` format produced by
   * seed.ts). Revisions are deterministic (derived from the UID's char codes)
   * so the same UID returns the same revision across calls — enables tests
   * and manual retries to get consistent behavior.
   *
   * To simulate a rotation: bump the revision via bumpRevision(uid) in a test.
   * To simulate an orphan: call forgetRecord(uid) (not wired for routes; use
   * from tests).
   */
  private readonly vault = new Map<string, KeeperRecord>();

  /**
   * Deterministic revision derivation: sum of UID char codes modulo 100, plus
   * a baseline of 1 so we never hand out revision 0 (which is the local
   * Record.keeperRevision default and would make every fresh record look like
   * it just synced).
   */
  private deriveRevision(uid: string): number {
    let sum = 0;
    for (let i = 0; i < uid.length; i++) sum += uid.charCodeAt(i);
    return 1 + (sum % 100);
  }

  private deriveOwner(uid: string): string {
    // Alternate owner email by parity of the first char code.
    return uid.charCodeAt(0) % 2 === 0 ? 'carol@example.com' : 'dave@example.com';
  }

  /**
   * Lazy-populate a record into the mock vault the first time it's asked for.
   * Seed.ts creates records with UIDs like 'kpr-ardent-3817-4049-4316-4561';
   * we don't want seed.ts to have to also call a mock-vault setter, so we
   * create the KeeperRecord on demand the first time approval.service asks.
   *
   * UIDs that START with 'orphan-' return null (not inserted into the vault)
   * so tests / manual demos can create orphaned records easily — seed an
   * orphan by giving the Record.keeperRecordUid an 'orphan-…' prefix.
   */
  async getRecord(keeperRecordUid: string): Promise<KeeperRecord | null> {
    if (keeperRecordUid.startsWith('orphan-')) return null;

    let record = this.vault.get(keeperRecordUid);
    if (!record) {
      record = {
        uid: keeperRecordUid,
        title: keeperRecordUid.replace(/^kpr-/, '').replace(/-/g, ' '),
        login: `svc_${keeperRecordUid.replace(/^kpr-/, '').slice(0, 20)}`,
        revision: this.deriveRevision(keeperRecordUid),
        owner: this.deriveOwner(keeperRecordUid),
        tags: ['mock', 'seeded'],
        folder: 'Keeper-Shell / Mock Vault',
        lastModified: new Date(),
        createdAt: new Date('2026-01-01T00:00:00Z'),
      };
      this.vault.set(keeperRecordUid, record);
    }
    return record;
  }

  /**
   * Test helper: bump the stored revision for a UID to simulate a rotation.
   * Not exported on IKeeperService — the real Commander has no such method.
   * Accessible only by casting to MockKeeperService (see tests).
   */
  bumpRevision(keeperRecordUid: string, newRevision?: number): void {
    const rec = this.vault.get(keeperRecordUid);
    if (!rec) return;
    rec.revision = newRevision ?? rec.revision + 1;
    rec.lastModified = new Date();
  }

  async createOneTimeShare(keeperRecordUid: string, ttlMinutes: number): Promise<OneTimeShare> {
    // formatKeeperExpire (inside buildKeeperCreateArgs) enforces the positive-
    // integer invariant; keep this call first so bad input surfaces before we
    // allocate a token. (Closes CF-3 from intent 142 pressure-test — previously
    // inlined the argv literal; now we reuse the canonical builder.)
    const commanderArgs = buildKeeperCreateArgs(keeperRecordUid, ttlMinutes);
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
