import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { identityService } from '../services/identity.service.js';
import { requireAuth } from '../middleware/auth.middleware.js';

export const authRouter = Router();

const MockLoginSchema = z.object({ userId: z.string().uuid() });

authRouter.post('/mock-login', async (req, res) => {
  const parse = MockLoginSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'invalid body', detail: parse.error.format() });
    return;
  }
  const user = await prisma.user.findUnique({ where: { id: parse.data.userId } });
  if (!user) {
    res.status(404).json({ error: 'user not found' });
    return;
  }
  const token = await identityService.issueToken(user.id);
  res.json({
    token,
    user: {
      id: user.id,
      displayName: user.displayName,
      email: user.email,
      role: user.role,
      allowMultipleLeases: user.allowMultipleLeases,
    },
  });
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const u = req.user!;
  const dbUser = await prisma.user.findUnique({
    where: { id: u.userId },
    select: { id: true, displayName: true, email: true, role: true, allowMultipleLeases: true },
  });
  if (!dbUser) {
    res.status(404).json({ error: 'user not found' });
    return;
  }
  res.json({ user: dbUser });
});

// Dev-only public endpoint: resolve email → user id so the mock IdentityPicker
// can log in by email without knowing seeded UUIDs. Removed when real Entra ID ships.
authRouter.get('/resolve', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    res.status(404).end();
    return;
  }
  const email = typeof req.query.email === 'string' ? req.query.email : '';
  if (!email) {
    res.status(400).json({ error: 'email required' });
    return;
  }
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) {
    res.status(404).json({ error: 'user not found' });
    return;
  }
  res.json({ id: user.id });
});

authRouter.get('/users', requireAuth, async (_req, res) => {
  const users = await prisma.user.findMany({
    orderBy: [{ role: 'asc' }, { displayName: 'asc' }],
    select: { id: true, displayName: true, email: true, role: true },
  });
  res.json({ users });
});
