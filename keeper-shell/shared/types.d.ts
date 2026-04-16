export type Role = 'REQUESTER' | 'APPROVER' | 'ADMIN';
export type Environment = 'SHARED' | 'POD' | 'PHARMACY' | 'WIKI';
export type RecordStatus = 'AVAILABLE' | 'PENDING_APPROVAL' | 'LEASED' | 'RENEWAL_PENDING' | 'EXPIRED' | 'LOCKED';
export type RequestStatus = 'PENDING' | 'APPROVED' | 'DENIED' | 'EXPIRED' | 'RELEASED' | 'RENEWAL_PENDING';
export type RequestType = 'INITIAL' | 'EXTENSION' | 'RENEWAL';
export type AuditAction = 'REQUEST_CREATED' | 'REQUEST_APPROVED' | 'REQUEST_DENIED' | 'LEASE_STARTED' | 'SHARE_ISSUED' | 'RENEWAL_PROMPTED' | 'RENEWAL_REQUESTED' | 'EXTENSION_APPROVED' | 'EXTENSION_DENIED' | 'LEASE_RELEASED' | 'LEASE_EXPIRED' | 'RECORD_LOCKED' | 'RECORD_UNLOCKED' | 'CREDENTIAL_ROTATED' | 'RECORD_ORPHANED' | 'VAULT_SYNC_DETECTED_CHANGES';
/**
 * Sync freshness of a local Record vs. the Keeper vault source of truth.
 * UNKNOWN = never synced. FRESH = synced within staleSinceMinutes (30).
 * STALE = synced but past the threshold. ORPHANED = keeperRecordUid no
 * longer resolves.
 */
export type SyncStatus = 'UNKNOWN' | 'FRESH' | 'STALE' | 'ORPHANED';
export interface UserDTO {
    id: string;
    displayName: string;
    email: string;
    role: Role;
    /** When true, this user can hold multiple concurrent passkeys (admin override). */
    allowMultipleLeases?: boolean;
}
export interface RecordDTO {
    id: string;
    name: string;
    systemName: string;
    environment: Environment;
    status: RecordStatus;
    ownerId: string;
    owner: UserDTO;
    currentLease?: RequestDTO | null;
    approverGroupId?: string | null;
    /** Admin-toggled: when true, regular users don't see the borrower or message them */
    hideBorrower?: boolean;
    createdAt: string;
    updatedAt: string;
}
export interface RequestDTO {
    id: string;
    recordId: string;
    record?: RecordDTO;
    requesterId: string;
    requester?: UserDTO;
    approverId?: string | null;
    approver?: UserDTO | null;
    reason: string;
    notes?: string | null;
    requestedDurationMin: number;
    approvedDurationMin?: number | null;
    status: RequestStatus;
    type: RequestType;
    leaseStartedAt?: string | null;
    leaseExpiresAt?: string | null;
    renewalWindowStart?: string | null;
    shareLink?: string | null;
    shareLinkExpiresAt?: string | null;
    parentRequestId?: string | null;
    createdAt: string;
    updatedAt: string;
}
export interface AuditEventDTO {
    id: string;
    requestId?: string | null;
    action: AuditAction;
    actorId: string;
    actor?: UserDTO;
    detail?: string | null;
    createdAt: string;
}
export interface CreateRequestInput {
    recordId: string;
    reason: string;
    requestedDurationMin: number;
    notes?: string;
}
export interface ApproveRequestInput {
    approvedDurationMin?: number;
}
export interface DenyRequestInput {
    reason?: string;
}
export interface ExtendRequestInput {
    requestedDurationMin: number;
}
export interface MockLoginInput {
    userId: string;
}
export interface AuthMeResponse {
    user: UserDTO;
}
export interface LoginResponse {
    token: string;
    user: UserDTO;
}
export interface TeamsContext {
    userId: string;
    displayName: string;
    userObjectId?: string;
    email?: string;
    theme?: 'light' | 'dark' | 'highContrast';
    locale?: string;
    /** True when running embedded in Teams; false in a standalone browser */
    isInTeams: boolean;
}
/**
 * Adaptive Card payload contract — what the backend would post via Bot Framework
 * for proactive 1:1 chat messages. We model the minimum surface the frontend
 * needs to know about; the backend can serialize the full card.
 */
export interface AdaptiveCardSummary {
    /** AdaptiveCard schema version (we target 1.4) */
    version: '1.4';
    title: string;
    body: string;
    /** Buttons rendered in the card; each is a deep link back into the tab or chat */
    actions: Array<{
        title: string;
        url: string;
    }>;
}
export interface VaultSyncRecordDTO {
    id: string;
    name: string;
    keeperUid: string | null;
    status: RecordStatus;
    syncStatus: SyncStatus;
    syncedAt: string;
    revision: number;
    keeperOwner: string | null;
    /** Derived: floor minutes since syncedAt, server-side */
    ageMinutes: number;
    /** Derived label: 'FRESH' / 'STALE' / 'ORPHANED' / 'UNKNOWN' */
    healthLabel: 'FRESH' | 'STALE' | 'ORPHANED' | 'UNKNOWN';
}
export interface VaultSyncSummary {
    totalRecords: number;
    syncedInLastHour: number;
    stale: number;
    orphaned: number;
}
export interface VaultSyncStatusResponse {
    summary: VaultSyncSummary;
    records: VaultSyncRecordDTO[];
    /** Server-stamped so the UI can display 'last refreshed' */
    generatedAt: string;
    /** Stale-threshold used (minutes); surfaced so the UI matches server semantics */
    staleSinceMinutes: number;
}
export interface NotificationDTO {
    id: string;
    recipientId: string;
    kind: 'APPROVAL_REQUEST' | 'SHARE_LINK' | 'RENEWAL_PROMPT' | 'EXPIRY_NOTICE';
    title: string;
    body: string;
    requestId?: string;
    recordId?: string;
    shareLink?: string;
    createdAt: string;
    read: boolean;
}
