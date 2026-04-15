# Keeper Shell

A brokered credential request shell over Keeper-backed records. Designed to run as a Microsoft Teams tab SPA — a lease-and-approval surface, not a vault browser.

Status: all 6 build phases complete. Every integration seam has a working mock; real Entra / Keeper Commander / Teams SDK swap in at the file boundaries noted below.

## Contents

1. [Quickstart](#quickstart)
2. [Architecture](#architecture)
3. [Data model](#data-model)
4. [API](#api)
5. [Lease lifecycle](#lease-lifecycle)
6. [Policy](#policy)
7. [Integration seams — how to swap in real services](#integration-seams)
8. [Development](#development)
9. [Done criteria — verification evidence](#done-criteria)

---

## Quickstart

Requires Docker Desktop (Docker Compose v2). Node not required on the host.

```bash
cd keeper-shell
cp .env.example .env
docker compose up --build
```

On first boot the backend runs `prisma db push` to sync the schema, then seeds 5 users / 10 records / an active lease / a pending approval / five historical requests with full audit trails, then listens on `:4000` and starts the scheduler. The frontend serves on `:5173` via Vite.

- **Frontend:** http://localhost:5173
- **Backend health:** http://localhost:4000/healthz
- **Postgres:** `localhost:5432` (user `keeper`, password `keeper`, db `keepershell`)

Open http://localhost:5173, pick a mock identity, and you're in.

## Seeded users

| Email                 | Role      | Use for                              |
| --------------------- | --------- | ------------------------------------ |
| alice@example.com     | REQUESTER | Requester side of the flow           |
| bob@example.com       | REQUESTER | Second requester (pending approval)  |
| carol@example.com     | APPROVER  | Approve / deny                       |
| dave@example.com      | APPROVER  | Approve / deny                       |
| erin@example.com      | ADMIN     | Audit log, manual scheduler triggers |

---

## Architecture

```
keeper-shell/
├── frontend/          # React 18 + Vite + TS + Fluent UI v9 + Tailwind + Zustand
│   └── src/
│       ├── components/   # AppShell, IdentityPicker, StatusBadge,
│       │                 # RequestAccessModal, RenewalPromptDialog, NotificationsBell
│       ├── pages/        # RecordsPage, MyRequestsPage, ApprovalsPage, AuditPage
│       ├── hooks/        # useCountdown
│       ├── services/     # api (typed fetch client)
│       ├── stores/       # auth.store (Zustand + persist)
│       └── App.tsx
├── backend/           # Node 20 + Express + TS + Prisma 5 + Zod + node-cron + JWT
│   └── src/
│       ├── routes/       # auth, records, requests, leases, audit, notifications
│       ├── services/
│       │   ├── record.service.ts
│       │   ├── request.service.ts
│       │   ├── approval.service.ts
│       │   ├── lease.service.ts
│       │   ├── audit.service.ts
│       │   ├── identity.service.ts      ← integration seam
│       │   ├── keeper.service.ts        ← integration seam
│       │   └── notification.service.ts  ← integration seam
│       ├── middleware/   # requireAuth, requireRole, errorHandler
│       ├── jobs/         # lease-scheduler (60s sweeps: expiry + renewal)
│       ├── policy/       # lease-policy (caps + clamps)
│       └── server.ts
├── shared/            # DTO + enum types shared across frontend and backend
├── seed/              # Prisma seed script (tsx)
├── docker-compose.yml # postgres + backend + frontend with dev volumes
└── .env.example
```

**Flow at a glance**

```
browser ── HTTP(S) ──▶ Vite dev server (:5173)
                        │
                        │  /api/* proxied via BACKEND_URL
                        ▼
                       Express (:4000)
                        │
                        ├── middleware/auth (JWT → UserIdentity)
                        ├── services/ (record, request, approval, lease, audit)
                        │       │
                        │       ▼
                        │     Prisma ──▶ Postgres (:5432)
                        │
                        └── jobs/lease-scheduler (every 60s)
                                │
                                ├── runExpirySweep → expireLease
                                └── runRenewalSweep → promptRenewal
```

---

## Data model

Prisma schema in [`backend/prisma/schema.prisma`](backend/prisma/schema.prisma). Core entities:

- **User** — role: `REQUESTER | APPROVER | ADMIN`; `entraObjectId` is the Entra seam.
- **Record** — the credential target. `status: AVAILABLE | PENDING_APPROVAL | LEASED | RENEWAL_PENDING | EXPIRED | LOCKED`; `keeperRecordUid` is the Keeper seam.
- **Request** — a single access request. `status: PENDING | APPROVED | DENIED | EXPIRED | RELEASED | RENEWAL_PENDING`; `type: INITIAL | EXTENSION | RENEWAL`.
- **AuditEvent** — immutable trail of every state transition. One of 13 `AuditAction` values.
- **Notification** — backs the mock `NotificationService`; real deployments replace with Teams Adaptive Cards and drop this table.

Note: an "active lease" = `Request` with `status = APPROVED` and `leaseExpiresAt > now`. The `LEASED` value lives on `Record.status` only, reflecting the physical state of the record; the request's approval state is tracked separately.

---

## API

Every route (except the two dev helpers below) requires `Authorization: Bearer <jwt>`.

### Auth
- `POST /api/auth/mock-login` `{ userId }` → `{ token, user }`
- `GET /api/auth/me` → `{ user }`
- `GET /api/auth/users` — all users (auth-only)
- `GET /api/auth/resolve?email=...` — dev-only helper (no auth, disabled when `NODE_ENV=production`)

### Records
- `GET /api/records?q=...&environment=...&status=...`
- `GET /api/records/:id` — includes active lease + last 5 history items

### Requests
- `POST /api/requests` `{ recordId, reason, requestedDurationMin, notes? }` → **201**
- `GET /api/requests?status=&recordId=&requesterId=` — requesters see only their own
- `GET /api/requests/:id`
- `POST /api/requests/:id/approve` `{ approvedDurationMin? }` — approver/admin only; routes to extension approval if `type=EXTENSION`
- `POST /api/requests/:id/deny` `{ reason? }` — approver/admin only
- `POST /api/requests/:id/release` — requester only
- `POST /api/requests/:id/extend` `{ requestedDurationMin }` → **201** (creates EXTENSION request)

### Audit
- `GET /api/audit?action=&recordId=&requestId=&actorId=` — admin only

### Notifications
- `GET /api/notifications` — current user's inbox
- `POST /api/notifications/:id/read`

### Leases (scheduler-facing)
- `POST /api/leases/check-expiry` — admin (also runs automatically every 60s)
- `POST /api/leases/send-renewals` — admin (also runs automatically every 60s)

---

## Lease lifecycle

```
AVAILABLE
  │
  ▼ POST /api/requests
PENDING_APPROVAL ─── deny ────▶ AVAILABLE
  │
  ▼ approve  (startLease issues one-time share, sets expiry, writes LEASE_STARTED + SHARE_ISSUED)
LEASED
  │
  ├─▶ renewal window reached (scheduler)       ─▶ RENEWAL_PENDING
  │        │
  │        ├── POST /api/requests/:id/extend   ─▶ new EXTENSION request (PENDING)
  │        │        │
  │        │        ├── approve ─▶ parent.leaseExpiresAt += clamped(duration), record → LEASED
  │        │        └── deny    ─▶ parent continues on original expiry
  │        │
  │        └── no action + expiry              ─▶ AVAILABLE (+ LEASE_EXPIRED audit, EXPIRY_NOTICE to requester)
  │
  ├─▶ POST /api/requests/:id/release           ─▶ AVAILABLE
  │
  └─▶ past leaseExpiresAt (scheduler)          ─▶ AVAILABLE (+ EXPIRY_NOTICE)
```

Every transition (a) updates `Request.status` and `Record.status` in a single Prisma transaction, (b) writes an `AuditEvent`, (c) emits a notification where relevant.

---

## Policy

[`backend/src/policy/lease-policy.ts`](backend/src/policy/lease-policy.ts) — single source of truth for all caps:

```ts
export const LeasePolicy = {
  maxDurationMinutes: 480,       // 8h hard cap on any single lease
  defaultDurationMinutes: 30,
  renewalWindowMinutes: 5,       // renewal prompt fires this far before expiry
  maxExtensionMinutes: 240,      // 4h max extension per request
  maxExtensionsPerLease: 3,
  requireApprovalForExtension: true,
};
```

All request / approval / extension paths call `clampDuration()` or `clampExtension()`. Changing this file is the entire policy surface.

---

## Integration seams

Three interfaces delimit the replaceable boundaries. Each file ships with a `Mock*` concrete class and exports a singleton typed as the interface. Swap-in = add the real client library, implement the interface, replace the exported singleton.

### 1. Identity — [`backend/src/services/identity.service.ts`](backend/src/services/identity.service.ts)

```ts
export interface IIdentityService {
  validateToken(token: string): Promise<UserIdentity>;
  getUserGroups(userId: string): Promise<string[]>;
  issueToken(userId: string): Promise<string>;
}
```

- **Mock:** signs/decodes local JWTs, looks users up in Postgres.
- **Real (Entra ID):**
  1. `npm i @azure/msal-node jwks-rsa` in `backend`, add `@azure/msal-browser` in `frontend`.
  2. Replace `validateToken` with JWKS validation against the Entra tenant's `/.well-known/openid-configuration`.
  3. Replace `getUserGroups` with a Microsoft Graph `/me/memberOf` call.
  4. `issueToken` is no longer needed (Entra issues tokens directly); remove `/api/auth/mock-login` + `/api/auth/resolve` on the backend and the `IdentityPicker` component on the frontend — use MSAL popup login in `App.tsx` instead.
  5. Add `entraObjectId` population on first login to link Entra users to the `User` table.

### 2. Vault — [`backend/src/services/keeper.service.ts`](backend/src/services/keeper.service.ts)

```ts
export interface IKeeperService {
  createOneTimeShare(keeperRecordUid: string, ttlMinutes: number): Promise<OneTimeShare>;
  removeOneTimeShare(shareLink: string): Promise<void>;
}
```

- **Mock:** returns `https://mock-keeper.local/ots/<uid>/<uuid>` with a computed expiry. No real credentials are ever stored or fetched.
- **Real (Keeper Commander):**
  1. Install Keeper Commander (`pip install keepercommander`) in the backend image; add a headless config file mounted as a secret.
  2. In `createOneTimeShare`, spawn `keeper one-time-share-create <recordUid> --expire <ttl>m` via `child_process.execFile`, parse the URL from stdout.
  3. In `removeOneTimeShare`, call `keeper one-time-share-remove <shareLink>` (or its `record get --shares` + `share revoke` equivalent).
  4. Populate `Record.keeperRecordUid` for each real record (either at creation time or via a one-off sync script hitting `keeper search`).

### 3. Notifications — [`backend/src/services/notification.service.ts`](backend/src/services/notification.service.ts)

```ts
export interface INotificationService {
  sendApprovalRequest(p: ApprovalCardParams): Promise<void>;
  sendShareLink(p: ShareLinkParams): Promise<void>;
  sendRenewalPrompt(p: RenewalPromptParams): Promise<void>;
  sendExpiryNotice(p: ExpiryNoticeParams): Promise<void>;
}
```

- **Mock:** writes rows into the `Notification` table; frontend polls `GET /api/notifications` every 10s for the bell.
- **Real (Teams Adaptive Cards via Bot Framework / Microsoft Graph):**
  1. Register a Bot Framework app registration; add `botframework-connector` + `botbuilder` to the backend.
  2. Replace each `send*` method with a Bot Framework proactive message to the approver/requester's Teams channel, using an Adaptive Card JSON template per kind.
  3. Adaptive Card actions (Approve/Deny/Extend) POST back to `/api/requests/:id/*` with the same Bearer JWT, so the flow survives the seam.
  4. Delete the `Notification` model + `GET /api/notifications` route; the frontend bell component can be removed, since notifications live entirely in Teams.

### Teams embedding

The frontend intentionally has **no Teams SDK dependency**. In dev the app works standalone at `localhost:5173`. To embed as a Teams tab:

1. `npm i @microsoft/teams-js` in `frontend`.
2. Wrap `main.tsx` in `app.initialize()` and toggle a `useIsInTeams()` hook.
3. In `AppShell`, hide the chrome sidebar + topbar when `isInTeams === true` and use Teams' own back nav.
4. Add a Teams manifest (`manifest.json` + icons) and submit via Teams Developer Portal.

None of this affects the API or services layer.

---

## Development

```bash
# Install deps at the root (uses npm workspaces)
npm install

# Run stack
docker compose up --build

# Regenerate Prisma client after schema changes
docker compose exec backend npx prisma generate

# Re-sync schema (dev; migrations are next step for prod)
docker compose exec backend npx prisma db push

# Re-seed (wipes all data)
docker compose exec backend npm run db:seed

# Prisma Studio
docker compose exec backend npm run db:studio  # http://localhost:5555
```

**Hot reload.** Backend uses `tsx watch`; frontend uses Vite HMR. Both source trees are host-mounted into the containers via `docker-compose.yml`, so edits land immediately.

**Env vars.**
| Var | Service | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | backend | Postgres connection |
| `JWT_SECRET` | backend | Signs mock JWTs — **rotate** when deploying |
| `PORT` | backend | API port (default 4000) |
| `FRONTEND_ORIGIN` | backend | CORS allowlist |
| `NODE_ENV` | backend | `production` disables `/api/auth/resolve` |
| `BACKEND_URL` | frontend | Internal Vite proxy target (Docker DNS) |

**Tests.** Services are injectable (interfaces + singleton exports), so unit tests against `request.service.ts` et al. can pass in-memory fakes without touching Postgres. No test runner is wired yet — that's a good first follow-up.

**Migrations → Production.** Phase 2 uses `prisma db push` for speed. Before prod: `npx prisma migrate dev --name init` to generate the migration files, commit them, then switch the Dockerfile CMD to `npx prisma migrate deploy`.

---

## Done criteria

Verified end-to-end against the live stack (evidence captured during phase 6 validation):

| # | Criterion | Status | Evidence |
| --- | --- | --- | --- |
| 1 | `docker compose up` starts Postgres + API + frontend and seeds the DB | ✅ | 3 containers healthy; `/healthz` 200; frontend HTTP 200; seed reports 5 users / 10 records / 33 audit events |
| 2 | Select mock identity, see records, search/filter, request access, see request go to pending | ✅ | IdentityPicker → records table with 10 records; search `billing` narrows to 1; env chip `staging` narrows to 2 + shows "1 filter active"; **Request access** button POSTs → record flips to `PENDING_APPROVAL` |
| 3 | Switch to approver, see pending request, approve, requester sees share link | ✅ | Dave's Approvals queue showed 2 cards incl. pending + extension; clicking **Approve** issued share link via `keeperService` mock, record flipped to `LEASED`, Alice received `SHARE_LINK` notification |
| 4 | Lease countdown visible; renewal window triggers prompt | ✅ | `useCountdown` ticks 1Hz, turns red <60s or in renewal window; scheduler's `runRenewalSweep()` flipped seeded lease to `RENEWAL_PENDING` → `MyRequestsPage` auto-opened `RenewalPromptDialog` |
| 5 | Releasing a lease returns record to available with audit trail | ✅ | `POST /release` → request `RELEASED`, record `AVAILABLE`, `LEASE_RELEASED` audit row + Keeper share revoked |
| 6 | Lease expiry job auto-expires overdue leases | ✅ | Scheduler sweep reported `{expired: 1}` on a backdated lease; request → `EXPIRED`, record → `AVAILABLE`, `LEASE_EXPIRED` audit, `EXPIRY_NOTICE` notification |
| 7 | Audit log shows complete event history | ✅ | 5 event types captured for a single request lifecycle: `REQUEST_CREATED → REQUEST_APPROVED → LEASE_STARTED → SHARE_ISSUED → LEASE_RELEASED`; extension flow adds `RENEWAL_PROMPTED → RENEWAL_REQUESTED → EXTENSION_APPROVED`; admin `/api/audit` filterable by action / record / request / actor |
| 8 | All three integration seams documented with working mocks | ✅ | `IIdentityService` + `MockIdentityService`, `IKeeperService` + `MockKeeperService`, `INotificationService` + `MockNotificationService` — each a single file, each with swap-in steps in the section above |
| 9 | README explains run, swap-in path, architecture | ✅ | This document |

---

## License

Private. Internal tool scaffold.
