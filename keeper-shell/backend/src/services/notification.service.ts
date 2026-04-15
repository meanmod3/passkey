// Integration seam — every message in this interface is an adaptive card delivered
// over Microsoft Teams via Bot Framework / Graph. The frontend never sends these
// itself: the API records a request, the backend emits the card, the approver
// approves/denies directly from Teams (the Adaptive Card action posts back to
// POST /api/requests/:id/approve|deny). The Vault UI is purely a read-only surface
// for discovering records and initiating requests — it does not carry decisions.
//
// Mock: persists notifications to the `Notification` table; the frontend polls
// GET /api/notifications every 10s so the bell shows pending cards. In prod
// this table and route are removed — notifications live entirely inside Teams.
import { prisma } from '../db.js';

export interface ApprovalCardParams {
  approverId: string;
  requesterDisplayName: string;
  recordName: string;
  requestId: string;
  reason: string;
  requestedDurationMin: number;
}

export interface ShareLinkParams {
  requesterId: string;
  recordName: string;
  requestId: string;
  shareLink: string;
  expiresAt: Date;
}

export interface RenewalPromptParams {
  requesterId: string;
  recordName: string;
  requestId: string;
  expiresAt: Date;
}

export interface ExpiryNoticeParams {
  requesterId: string;
  recordName: string;
  requestId: string;
}

export interface INotificationService {
  sendApprovalRequest(params: ApprovalCardParams): Promise<void>;
  sendShareLink(params: ShareLinkParams): Promise<void>;
  sendRenewalPrompt(params: RenewalPromptParams): Promise<void>;
  sendExpiryNotice(params: ExpiryNoticeParams): Promise<void>;
}

export class MockNotificationService implements INotificationService {
  async sendApprovalRequest(p: ApprovalCardParams): Promise<void> {
    await prisma.notification.create({
      data: {
        recipientId: p.approverId,
        kind: 'APPROVAL_REQUEST',
        title: `Approval needed: ${p.recordName}`,
        body: `${p.requesterDisplayName} requested ${p.requestedDurationMin} min — "${p.reason}"`,
        requestId: p.requestId,
      },
    });
    console.log(`[notification] APPROVAL_REQUEST -> ${p.approverId} for request ${p.requestId}`);
  }

  async sendShareLink(p: ShareLinkParams): Promise<void> {
    await prisma.notification.create({
      data: {
        recipientId: p.requesterId,
        kind: 'SHARE_LINK',
        title: `Access granted: ${p.recordName}`,
        body: `Your one-time share link is ready. Expires ${p.expiresAt.toISOString()}.`,
        requestId: p.requestId,
        shareLink: p.shareLink,
      },
    });
    console.log(`[notification] SHARE_LINK -> ${p.requesterId} for request ${p.requestId}`);
  }

  async sendRenewalPrompt(p: RenewalPromptParams): Promise<void> {
    await prisma.notification.create({
      data: {
        recipientId: p.requesterId,
        kind: 'RENEWAL_PROMPT',
        title: `Lease ending soon: ${p.recordName}`,
        body: `Your lease expires at ${p.expiresAt.toISOString()}. Extend or release?`,
        requestId: p.requestId,
      },
    });
    console.log(`[notification] RENEWAL_PROMPT -> ${p.requesterId} for request ${p.requestId}`);
  }

  async sendExpiryNotice(p: ExpiryNoticeParams): Promise<void> {
    await prisma.notification.create({
      data: {
        recipientId: p.requesterId,
        kind: 'EXPIRY_NOTICE',
        title: `Lease expired: ${p.recordName}`,
        body: `Your access to ${p.recordName} has been revoked.`,
        requestId: p.requestId,
      },
    });
    console.log(`[notification] EXPIRY_NOTICE -> ${p.requesterId} for request ${p.requestId}`);
  }
}

export const notificationService: INotificationService = new MockNotificationService();
