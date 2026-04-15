import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { authRouter } from './routes/auth.routes.js';
import { recordsRouter } from './routes/records.routes.js';
import { requestsRouter } from './routes/requests.routes.js';
import { leasesRouter } from './routes/leases.routes.js';
import { auditRouter } from './routes/audit.routes.js';
import { notificationsRouter } from './routes/notifications.routes.js';
import { errorHandler } from './middleware/error.middleware.js';
import { startLeaseScheduler } from './jobs/lease-scheduler.js';

const app = express();
const PORT = Number(process.env.PORT ?? 4000);
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173';

app.use(cors({ origin: FRONTEND_ORIGIN, credentials: true }));
app.use(express.json({ limit: '256kb' }));

app.get('/healthz', (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

app.use('/api/auth', authRouter);
app.use('/api/records', recordsRouter);
app.use('/api/requests', requestsRouter);
app.use('/api/leases', leasesRouter);
app.use('/api/audit', auditRouter);
app.use('/api/notifications', notificationsRouter);

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`[backend] listening on :${PORT} (frontend origin: ${FRONTEND_ORIGIN})`);
  startLeaseScheduler();
});
