import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { adminAuth } from '../lib/firebase-admin.ts';
import { getOrCreateUser } from './dbRepository.ts';

export const DEMO_UID = 'demo_indian_salaried_profile';
export const DEMO_EMAIL = 'demo.sandbox@finpilot.local';
export const DEMO_NAME = 'Aarav Sharma (Demo)';

// Ephemeral HMAC secret per process or configured secret for isolated Demo sandbox tokens
const DEMO_TOKEN_SECRET =
  process.env.DEMO_SESSION_SECRET || crypto.randomBytes(32).toString('hex');

export function createDemoSessionToken(): string {
  const issuedAt = Date.now().toString();
  const payload = `${DEMO_UID}.${issuedAt}`;
  const sig = crypto
    .createHmac('sha256', DEMO_TOKEN_SECRET)
    .update(payload)
    .digest('hex');
  return `demo.${payload}.${sig}`;
}

export function verifyDemoSessionToken(token: string): boolean {
  if (!token.startsWith('demo.')) return false;
  const parts = token.split('.');
  if (parts.length !== 4) return false;
  const [, uid, issuedAt, sig] = parts;
  if (uid !== DEMO_UID) return false;
  const ageMs = Date.now() - Number(issuedAt);
  if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > 24 * 60 * 60 * 1000) {
    return false;
  }
  const expectedSig = crypto
    .createHmac('sha256', DEMO_TOKEN_SECRET)
    .update(`${uid}.${issuedAt}`)
    .digest('hex');
  if (sig.length !== expectedSig.length) return false;
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig));
}

export interface AuthContextUser {
  uid: string;
  email: string;
  name?: string;
  isDemo: boolean;
}

export interface AuthRequest extends Request {
  authUser?: AuthContextUser;
}

export async function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: Missing authentication token' });
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    res.status(401).json({ error: 'Unauthorized: Empty authentication token' });
    return;
  }

  // Check isolated demo sandbox token first
  if (token.startsWith('demo.')) {
    if (!verifyDemoSessionToken(token)) {
      res.status(401).json({ error: 'Unauthorized: Invalid or expired demo token' });
      return;
    }
    try {
      await getOrCreateUser(DEMO_UID, DEMO_EMAIL, DEMO_NAME);
      req.authUser = {
        uid: DEMO_UID,
        email: DEMO_EMAIL,
        name: DEMO_NAME,
        isDemo: true,
      };
      next();
      return;
    } catch (error) {
      console.error('Demo user provisioning error:', error);
      res.status(500).json({ error: 'Failed to initialize demo workspace' });
      return;
    }
  }

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const email = decoded.email || `${decoded.uid}@user.local`;
    const name = typeof decoded.name === 'string' ? decoded.name : undefined;
    await getOrCreateUser(decoded.uid, email, name);
    req.authUser = {
      uid: decoded.uid,
      email,
      name,
      isDemo: false,
    };
    next();
  } catch (error) {
    console.error('Firebase ID token verification failed:', error);
    res.status(401).json({ error: 'Unauthorized: Invalid authentication token' });
  }
}
