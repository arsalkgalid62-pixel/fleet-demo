import mongoose from 'mongoose';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import argon2 from 'argon2';
import { rateLimit } from 'express-rate-limit';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { RequestHandler, Request, Response, NextFunction } from 'express';
import { roles, type Role } from '../shared/domain.js';
import { User } from './db.js';
import type { Actor } from './service.js';

declare module 'express-session' {
  interface SessionData {
    csrf?: string;
    user?: { id: string; role: Role; driverId?: string; name: string };
  }
}
declare global {
  namespace Express {
    interface Request {
      seat?: Role;
      actor?: Actor;
    }
  }
}

const isRole = (value: string): value is Role => (roles as readonly string[]).includes(value);

/**
 * Three separate session cookie jars, one per demo role.
 *
 * The browser sends X-Fleet-Seat to choose which jar this request uses. That
 * header selects a cookie name only — it never grants a role. The effective
 * role always comes from the server-side session record, and requireAuth
 * rejects a session whose stored role does not match the jar it came from.
 * This lets passenger, dispatch and driver tabs stay signed in independently
 * in one browser profile, which a single shared cookie could not do.
 */
export function seatSessions(secret: string, secure: boolean): RequestHandler {
  // Share the existing mongoose connection rather than opening a second pool,
  // so closing the database closes the session store with it.
  const store = MongoStore.create({
    // connect-mongo and mongoose resolve separate copies of the mongodb driver
    // types; the runtime client is the same object.
    client: mongoose.connection.getClient() as unknown as Parameters<typeof MongoStore.create>[0]['client'],
    collectionName: 'sessions',
    ttl: 8 * 60 * 60,
  });
  const perRole = new Map<Role, RequestHandler>(
    roles.map((role) => [
      role,
      session({
        name: `fd.sid.${role}`,
        secret,
        store,
        resave: false,
        saveUninitialized: false,
        rolling: true,
        cookie: { httpOnly: true, sameSite: 'lax', secure, maxAge: 8 * 60 * 60 * 1000, path: '/' },
      }),
    ]),
  );
  return (req, res, next) => {
    const seat = String(req.get('x-fleet-seat') ?? '');
    if (!isRole(seat)) {
      res.status(400).json({ error: 'Missing or invalid X-Fleet-Seat header' });
      return;
    }
    req.seat = seat;
    perRole.get(seat)!(req, res, next);
  };
}

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Rejects cross-site writes: same-origin check plus a session-bound CSRF token. */
export function csrfGuard(allowedOrigins: string[]): RequestHandler {
  return (req, res, next) => {
    if (SAFE.has(req.method)) {
      next();
      return;
    }
    const origin = req.get('origin');
    if (origin && !allowedOrigins.includes(origin)) {
      res.status(403).json({ error: 'Cross-origin write rejected' });
      return;
    }
    const expected = req.session?.csrf;
    const sent = req.get('x-csrf-token') ?? '';
    const ok =
      !!expected &&
      sent.length === expected.length &&
      timingSafeEqual(Buffer.from(sent), Buffer.from(expected));
    if (!ok) {
      res.status(403).json({ error: 'CSRF token missing or invalid' });
      return;
    }
    next();
  };
}

export function issueCsrf(req: Request): string {
  if (!req.session.csrf) req.session.csrf = randomBytes(32).toString('hex');
  return req.session.csrf;
}

/** Per-IP sign-in throttle. The limit is configurable so tests can exercise both sides. */
export const makeLoginLimiter = (limit: number) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many sign-in attempts. Wait 15 minutes.' },
  });

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const user = req.session?.user;
  if (!user) {
    res.status(401).json({ error: 'Sign in required' });
    return;
  }
  if (user.role !== req.seat) {
    res.status(403).json({ error: 'Session role does not match this seat' });
    return;
  }
  req.actor = { id: user.id, role: user.role, driverId: user.driverId };
  next();
}

export function requireRole(...allowed: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.actor || !allowed.includes(req.actor.role)) {
      res.status(403).json({ error: 'Not permitted for this role' });
      return;
    }
    next();
  };
}

/** Verifies credentials against the stored argon2 hash. Never trusts a browser role. */
export async function verifyLogin(username: string, password: string, seat: Role) {
  const user = await User.findById(username);
  // Compare against a dummy hash when the user is absent so timing does not leak existence.
  const hash = user?.passwordHash ?? '$argon2id$v=19$m=65536,t=3,p=4$c2FsdHNhbHRzYWx0$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
  let ok = false;
  try {
    ok = await argon2.verify(hash, password);
  } catch {
    ok = false;
  }
  if (!ok || !user || user.role !== seat) return null;
  return { id: user._id!, role: user.role as Role, driverId: user.driverId ?? undefined, name: user.name! };
}

export const hashPassword = (password: string) => argon2.hash(password, { type: argon2.argon2id });
