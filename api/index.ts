import type { IncomingMessage, ServerResponse } from 'node:http';
import mongoose from 'mongoose';
import type { Express } from 'express';
import { connectDb, setupIndexes } from '../server/db.js';
import { createApp } from '../server/app.js';

/**
 * Serverless entry point (Vercel).
 *
 * `server/index.ts` remains the real server for local use and for any host that
 * runs a long-lived process. This wrapper exists only because a serverless
 * platform starts a fresh invocation per request, which breaks two assumptions
 * that file makes:
 *
 *   1. **One connection per process.** A cold start would otherwise open a new
 *      MongoDB connection every request and exhaust the Atlas connection limit.
 *      The connection promise is cached on globalThis, which survives warm
 *      invocations in the same container.
 *
 *   2. **A background timer for offer expiry.** There is none here. Expiry now
 *      also runs on the /state poll (see server/app.ts), so it works without a
 *      long-lived process and without Vercel Cron — which on the Hobby plan
 *      fires once a day and would be useless against a 60-second offer.
 *
 * Everything else — sessions, CSRF, roles, transactions — is unchanged, because
 * this only wraps the same Express app.
 */

type Cache = { app?: Promise<Express> };
const globalCache = globalThis as typeof globalThis & { __fleet?: Cache };
const cache: Cache = (globalCache.__fleet ??= {});

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set in the deployment environment`);
  return value;
}

async function build(): Promise<Express> {
  const uri = required('MONGODB_URI');
  const secret = required('SESSION_SECRET');
  if (secret.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters');

  // Atlas free tier (M0) is a real 3-node replica set, so transactions work.
  // connectDb refuses to start against a standalone mongod.
  if (mongoose.connection.readyState !== 1) {
    await connectDb(uri);
    await setupIndexes();
  }

  // Writes are same-origin only, so the deployed URL must be declared. Vercel
  // sets VERCEL_URL for preview deployments; ORIGIN pins the production one.
  const origins = [
    process.env.ORIGIN,
    process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`,
    process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`,
  ].filter((o): o is string => !!o);
  if (origins.length === 0) throw new Error('Set ORIGIN to the deployed https:// URL');

  return createApp({
    sessionSecret: secret,
    origins,
    // Cookies are only marked Secure over HTTPS, which Vercel always provides.
    secureCookies: true,
  });
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const app = await (cache.app ??= build());
    return (app as unknown as (q: IncomingMessage, s: ServerResponse) => void)(req, res);
  } catch (error) {
    // A failed cold start must not be cached, or every later request repeats it.
    cache.app = undefined;
    console.error('[api] cold start failed', error);
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'Server misconfigured. Check the deployment environment variables.' }));
  }
}
