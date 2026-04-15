import { Router } from 'express';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.middleware.js';

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

notificationsRouter.get('/', async (req, res) => {
  const userId = req.user!.userId;
  const notifications = await prisma.notification.findMany({
    where: { recipientId: userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json({ notifications });
});

notificationsRouter.post('/:id/read', async (req, res) => {
  const updated = await prisma.notification.updateMany({
    where: { id: req.params.id, recipientId: req.user!.userId },
    data: { read: true },
  });
  res.json({ updated: updated.count });
});
