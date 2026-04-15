// Phase-2 seed: 5 users (2 requesters, 2 approvers, 1 admin), 10 records across
// environments with varied statuses, 5 historical requests with audit trails,
// 1 active lease approaching renewal, 1 pending approval.
import { PrismaClient, Role, Environment, RecordStatus, RequestStatus, RequestType, AuditAction } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Seed reasons. MUST match the frontend's DEFAULT_REASON_CATEGORIES in
 * frontend/src/stores/settings.store.ts so the Terminal tiles / My Requests
 * panel / Approvals show reasons that are actually present in the user-facing
 * dropdown. If you change the frontend list, mirror it here.
 */
const SEED_REASONS = ['Email', 'Imaging', 'Statements', 'ERP'] as const;
const pickReason = (i: number): string => SEED_REASONS[i % SEED_REASONS.length];

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

  /**
   * Hospital-system record titles sourced from the reference screenshots.
   * Each string is the display name the user sees in the records list.
   * 23 records total — distributed round-robin across the 4 environments
   * and the 2 approver users so every environment + owner has representation.
   * The trailing "/N/M/..." segments are ticket/reference IDs kept inline
   * with the hospital name, matching the reference data.
   */
  const HOSPITAL_RECORD_NAMES: string[] = [
    'Ardent 3817/4049/4316/4561',
    'Arnot Health 4690/5064/5152/5153',
    'Aspirus 5324/5325',
    'Aspirus Health 5390',
    'Aspuris Health 5397',
    'Atrium / Navicent 3070/3773/3971/4305/4351/4672/4785/5192',
    'Baptist Health South Florida 2978/3348/3425/3946/4218/4244/4312/4413',
    'Barnabas 2667/2746/4761/2805/2860/2927/2995/3175/4062/4071',
    'Catholic Health Systems of Long Island 3186/4302/5289/5290',
    'Cayuga 5228/5229',
    'Centra Health 2461/2587/2649/3352/3353/3432/3433/5147/5400',
    'Central Maine Healthcare 3415/3853',
    'Charter Communication 4150',
    'CHI - Clinical Engineering 2954/3328/3419',
    "Children's National Hospital 4966/4967/5248",
    'Cleveland Clinic Foundation 3030/3391/3676/4700',
    'Integris Health 5017',
    'Intermountain Healthcare 3038',
    'IU - Indiana University Health 4368',
    'Johns Hopkins 3967',
    'Jupiter Medical Center 5434',
    'Kaiser 3818',
    'Kaleida 3825/5401',
  ];

  const ENV_ROTATION: Environment[] = [
    Environment.SHARED,
    Environment.POD,
    Environment.PHARMACY,
    Environment.WIKI,
  ];
  const OWNER_ROTATION: string[] = [carol.id, dave.id];

  /**
   * Derive a short, stable slug from a record name. systemName / keeperRecordUid
   * are no longer surfaced in the UI but are still used by search and by the
   * Keeper integration seam — keeping them meaningful helps debugging.
   */
  const toSlug = (s: string, maxLen = 40): string =>
    s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, maxLen) || 'record';

  const recordSeeds: Array<{
    name: string;
    systemName: string;
    environment: Environment;
    status: RecordStatus;
    ownerId: string;
    keeperRecordUid: string;
  }> = HOSPITAL_RECORD_NAMES.map((name, i) => {
    const slug = toSlug(name);
    return {
      name,
      systemName: slug,
      environment: ENV_ROTATION[i % ENV_ROTATION.length],
      // One LOCKED record for status-variety in the vault view; everything
      // else starts AVAILABLE. Historical/active/pending seeds further down
      // will flip specific records to LEASED / PENDING_APPROVAL.
      status: i === 12 ? RecordStatus.LOCKED : RecordStatus.AVAILABLE,
      ownerId: OWNER_ROTATION[i % OWNER_ROTATION.length],
      keeperRecordUid: `kpr-${slug}`,
    };
  });

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
        reason: pickReason(h.recordIdx),
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
      reason: pickReason(3),
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
      reason: pickReason(5),
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
      body: `${bob.displayName} requested 60 min — "${pickReason(5)}"`,
      requestId: pending.id,
    },
  });
  await prisma.notification.create({
    data: {
      recipientId: dave.id,
      kind: 'APPROVAL_REQUEST',
      title: `Approval needed: ${records[5].name}`,
      body: `${bob.displayName} requested 60 min — "${pickReason(5)}"`,
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
