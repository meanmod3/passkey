// Phase-2 seed: 5 users (2 requesters, 2 approvers, 1 admin), 10 records across
// environments with varied statuses, 5 historical requests with audit trails,
// 1 active lease approaching renewal, 1 pending approval.
import { PrismaClient, Role, Environment, RecordStatus, RequestStatus, RequestType, AuditAction } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log('[seed] truncating existing data...');
  await prisma.notification.deleteMany();
  await prisma.auditEvent.deleteMany();
  await prisma.request.deleteMany();
  await prisma.record.deleteMany();
  await prisma.user.deleteMany();

  console.log('[seed] creating users...');
  const [alice, bob, carol, dave, erin] = await Promise.all([
    prisma.user.create({
      data: { displayName: 'Alice Requester', email: 'alice@example.com', role: Role.REQUESTER },
    }),
    prisma.user.create({
      data: {
        displayName: 'Bob Requester',
        email: 'bob@example.com',
        role: Role.REQUESTER,
        // Demo: Bob is allowed to hold multiple passkeys at once (admin override).
        allowMultipleLeases: true,
      },
    }),
    prisma.user.create({
      data: { displayName: 'Carol Approver', email: 'carol@example.com', role: Role.APPROVER },
    }),
    prisma.user.create({
      data: { displayName: 'Dave Approver', email: 'dave@example.com', role: Role.APPROVER },
    }),
    prisma.user.create({
      data: { displayName: 'Erin Admin', email: 'erin@example.com', role: Role.ADMIN },
    }),
  ]);

  console.log('[seed] creating records...');
  const recordSeeds: Array<{
    name: string;
    systemName: string;
    environment: Environment;
    status: RecordStatus;
    ownerId: string;
    keeperRecordUid: string;
  }> = [
    { name: 'Billing DB prod-admin', systemName: 'billing-db-01', environment: Environment.PRODUCTION, status: RecordStatus.AVAILABLE, ownerId: carol.id, keeperRecordUid: 'kpr-billing-prod' },
    { name: 'Auth Service prod-root', systemName: 'auth-svc', environment: Environment.PRODUCTION, status: RecordStatus.LOCKED, ownerId: dave.id, keeperRecordUid: 'kpr-auth-prod' },
    { name: 'CRM Read Replica', systemName: 'crm-replica-02', environment: Environment.PRODUCTION, status: RecordStatus.AVAILABLE, ownerId: carol.id, keeperRecordUid: 'kpr-crm-prod' },
    { name: 'Analytics Warehouse', systemName: 'snowflake-wh', environment: Environment.PRODUCTION, status: RecordStatus.AVAILABLE, ownerId: dave.id, keeperRecordUid: 'kpr-wh-prod' },
    { name: 'Payments Gateway staging', systemName: 'stripe-test', environment: Environment.STAGING, status: RecordStatus.AVAILABLE, ownerId: carol.id, keeperRecordUid: 'kpr-pay-stg' },
    { name: 'Search Cluster staging', systemName: 'elastic-stg', environment: Environment.STAGING, status: RecordStatus.AVAILABLE, ownerId: dave.id, keeperRecordUid: 'kpr-search-stg' },
    { name: 'Dev Postgres', systemName: 'pg-dev-main', environment: Environment.DEVELOPMENT, status: RecordStatus.AVAILABLE, ownerId: carol.id, keeperRecordUid: 'kpr-pg-dev' },
    { name: 'Dev Redis', systemName: 'redis-dev-01', environment: Environment.DEVELOPMENT, status: RecordStatus.AVAILABLE, ownerId: dave.id, keeperRecordUid: 'kpr-redis-dev' },
    { name: 'CI Secrets Vault', systemName: 'ci-vault', environment: Environment.SHARED, status: RecordStatus.AVAILABLE, ownerId: carol.id, keeperRecordUid: 'kpr-ci-shared' },
    { name: 'Monitoring Datadog', systemName: 'dd-admin', environment: Environment.SHARED, status: RecordStatus.AVAILABLE, ownerId: dave.id, keeperRecordUid: 'kpr-dd-shared' },
  ];

  const records = [];
  for (const seed of recordSeeds) {
    records.push(await prisma.record.create({ data: seed }));
  }

  // 5 historical completed requests with audit trails
  console.log('[seed] creating historical requests...');
  const now = Date.now();
  const hour = 60 * 60_000;

  const historical: Array<{ recordIdx: number; requesterId: string; approverId: string; durationMin: number; startedHoursAgo: number; endsAs: RequestStatus }> = [
    { recordIdx: 0, requesterId: alice.id, approverId: carol.id, durationMin: 60, startedHoursAgo: 48, endsAs: RequestStatus.EXPIRED },
    { recordIdx: 2, requesterId: bob.id, approverId: dave.id, durationMin: 30, startedHoursAgo: 36, endsAs: RequestStatus.RELEASED },
    { recordIdx: 4, requesterId: alice.id, approverId: carol.id, durationMin: 120, startedHoursAgo: 24, endsAs: RequestStatus.EXPIRED },
    { recordIdx: 6, requesterId: bob.id, approverId: dave.id, durationMin: 30, startedHoursAgo: 12, endsAs: RequestStatus.RELEASED },
    { recordIdx: 8, requesterId: alice.id, approverId: carol.id, durationMin: 60, startedHoursAgo: 6, endsAs: RequestStatus.EXPIRED },
  ];

  for (const h of historical) {
    const startedAt = new Date(now - h.startedHoursAgo * hour);
    const expiresAt = new Date(startedAt.getTime() + h.durationMin * 60_000);
    const req = await prisma.request.create({
      data: {
        recordId: records[h.recordIdx].id,
        requesterId: h.requesterId,
        approverId: h.approverId,
        reason: 'Historical seeded request',
        requestedDurationMin: h.durationMin,
        approvedDurationMin: h.durationMin,
        status: h.endsAs,
        type: RequestType.INITIAL,
        leaseStartedAt: startedAt,
        leaseExpiresAt: expiresAt,
        shareLink: `https://mock-keeper.local/ots/${records[h.recordIdx].keeperRecordUid}/seed-${h.recordIdx}`,
        shareLinkExpiresAt: expiresAt,
        createdAt: new Date(startedAt.getTime() - 5 * 60_000),
      },
    });
    await prisma.auditEvent.createMany({
      data: [
        { action: AuditAction.REQUEST_CREATED, actorId: h.requesterId, requestId: req.id, detail: 'seeded' },
        { action: AuditAction.REQUEST_APPROVED, actorId: h.approverId, requestId: req.id, detail: 'seeded' },
        { action: AuditAction.LEASE_STARTED, actorId: h.approverId, requestId: req.id, detail: 'seeded' },
        { action: AuditAction.SHARE_ISSUED, actorId: h.approverId, requestId: req.id, detail: 'seeded' },
        { action: h.endsAs === RequestStatus.RELEASED ? AuditAction.LEASE_RELEASED : AuditAction.LEASE_EXPIRED, actorId: h.requesterId, requestId: req.id, detail: 'seeded' },
      ],
    });
  }

  // 1 active lease with renewal window approaching
  console.log('[seed] creating active lease approaching renewal...');
  const activeStartedAt = new Date(now - 26 * 60_000); // 26 min ago
  const activeExpiresAt = new Date(now + 4 * 60_000);  // 4 min from now (inside 5-min renewal window)
  const renewalWindowStart = new Date(activeExpiresAt.getTime() - 5 * 60_000);
  const activeRequest = await prisma.request.create({
    data: {
      recordId: records[3].id, // Analytics Warehouse
      requesterId: alice.id,
      approverId: dave.id,
      reason: 'Debugging data pipeline latency',
      notes: 'On-call rotation',
      requestedDurationMin: 30,
      approvedDurationMin: 30,
      // Active lease = APPROVED + leaseStartedAt set + leaseExpiresAt in future.
      // RequestStatus doesn't have a LEASED value (that's on Record.status).
      status: RequestStatus.APPROVED,
      type: RequestType.INITIAL,
      leaseStartedAt: activeStartedAt,
      leaseExpiresAt: activeExpiresAt,
      renewalWindowStart,
      shareLink: `https://mock-keeper.local/ots/${records[3].keeperRecordUid}/active-seed`,
      shareLinkExpiresAt: activeExpiresAt,
    },
  });
  await prisma.record.update({ where: { id: records[3].id }, data: { status: RecordStatus.LEASED } });
  await prisma.auditEvent.createMany({
    data: [
      { action: AuditAction.REQUEST_CREATED, actorId: alice.id, requestId: activeRequest.id, detail: 'seeded active' },
      { action: AuditAction.REQUEST_APPROVED, actorId: dave.id, requestId: activeRequest.id, detail: 'seeded active' },
      { action: AuditAction.LEASE_STARTED, actorId: dave.id, requestId: activeRequest.id, detail: 'seeded active' },
      { action: AuditAction.SHARE_ISSUED, actorId: dave.id, requestId: activeRequest.id, detail: 'seeded active' },
    ],
  });

  // 1 pending approval
  console.log('[seed] creating pending approval...');
  const pending = await prisma.request.create({
    data: {
      recordId: records[5].id, // Search Cluster staging
      requesterId: bob.id,
      reason: 'Reindex investigation',
      requestedDurationMin: 60,
      status: RequestStatus.PENDING,
      type: RequestType.INITIAL,
    },
  });
  await prisma.record.update({ where: { id: records[5].id }, data: { status: RecordStatus.PENDING_APPROVAL } });
  await prisma.auditEvent.create({
    data: { action: AuditAction.REQUEST_CREATED, actorId: bob.id, requestId: pending.id, detail: 'seeded pending' },
  });
  await prisma.notification.create({
    data: {
      recipientId: carol.id,
      kind: 'APPROVAL_REQUEST',
      title: `Approval needed: ${records[5].name}`,
      body: `${bob.displayName} requested 60 min — "Reindex investigation"`,
      requestId: pending.id,
    },
  });
  await prisma.notification.create({
    data: {
      recipientId: dave.id,
      kind: 'APPROVAL_REQUEST',
      title: `Approval needed: ${records[5].name}`,
      body: `${bob.displayName} requested 60 min — "Reindex investigation"`,
      requestId: pending.id,
    },
  });

  console.log('[seed] done.');
  console.log(`[seed] users: ${alice.email} (REQUESTER), ${bob.email} (REQUESTER), ${carol.email} (APPROVER), ${dave.email} (APPROVER), ${erin.email} (ADMIN)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
