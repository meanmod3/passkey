// Integration seam — real Entra ID goes here.
// Mock: decodes local JWT, returns hardcoded user profile.
import jwt from 'jsonwebtoken';
import type { Role } from '@keeper-shell/shared';
import { prisma } from '../db.js';

export interface UserIdentity {
  userId: string;
  email: string;
  displayName: string;
  role: Role;
  groups: string[];
}

export interface IIdentityService {
  validateToken(token: string): Promise<UserIdentity>;
  getUserGroups(userId: string): Promise<string[]>;
  issueToken(userId: string): Promise<string>;
}

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-only-change-me';
const JWT_TTL_SECONDS = 60 * 60 * 8; // 8h

export class MockIdentityService implements IIdentityService {
  async validateToken(token: string): Promise<UserIdentity> {
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string };
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) throw new Error('user not found');
    return {
      userId: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      groups: [user.role],
    };
  }

  async getUserGroups(userId: string): Promise<string[]> {
    const u = await prisma.user.findUnique({ where: { id: userId } });
    return u ? [u.role] : [];
  }

  async issueToken(userId: string): Promise<string> {
    return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: JWT_TTL_SECONDS });
  }
}

export const identityService: IIdentityService = new MockIdentityService();
