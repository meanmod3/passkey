import type { Request, Response, NextFunction } from 'express';
import type { Role } from '@keeper-shell/shared';
import { identityService, type UserIdentity } from '../services/identity.service.js';

declare module 'express-serve-static-core' {
  interface Request {
    user?: UserIdentity;
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.header('authorization') ?? req.header('Authorization');
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'missing bearer token' });
    return;
  }
  const token = header.slice('Bearer '.length);
  try {
    req.user = await identityService.validateToken(token);
    next();
  } catch {
    res.status(401).json({ error: 'invalid token' });
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'unauthenticated' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'forbidden', required: roles });
      return;
    }
    next();
  };
}
