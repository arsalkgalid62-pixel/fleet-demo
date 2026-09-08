import 'dotenv/config';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import express from 'express';
import { connectDb, setupIndexes } from './db.js';
import { expireOffers } from './service.js';
import { createApp } from './app.js';
import { warnIfInsecure } from './flights.js';

const uri = process.env.MONGODB_URI;
const secret = process.env.SESSION_SECRET;
const port = Number(process.env.PORT ?? 3001);
const origin = process.env.ORIGIN ?? 'http://localhost:5173';

if (!uri) throw new Error('MONGODB_URI is required. Copy .env.example to .env.');
if (!secret || secret.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters.');

await connectDb(uri);
await setupIndexes();
console.log('[api] connected to MongoDB replica set and ensured indexes');
warnIfInsecure();

// Accept both hostname spellings of each dev origin: Vite prints 127.0.0.1
// while the docs say localhost, and a write from the "wrong" one would
// otherwise be rejected as cross-origin.
const bothHosts = (url: string) =>
  url.includes('localhost')
    ? [url, url.replace('localhost', '127.0.0.1')]
    : [url, url.replace('127.0.0.1', 'localhost')];

const app = createApp({
  sessionSecret: secret,
  origins: [...bothHosts(origin), `http://127.0.0.1:${port}`, `http://localhost:${port}`],
  secureCookies: process.env.NODE_ENV === 'production',
});

// In production the same Node service serves the built React app, keeping the
// frontend and API same-origin so session cookies need no cross-site handling.
const dist = resolve('dist');
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(resolve(dist, 'index.html')));
}

// Offer expiry is a scheduled server sweep; the browser never decides expiry.
const sweep = setInterval(() => {
  expireOffers().catch((e) => console.error('[api] offer sweep failed', e));
}, 5000);

const server = app.listen(port, () => {
  console.log(`[api] listening on http://127.0.0.1:${port} (demo mode, synthetic data only)`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    clearInterval(sweep);
    server.close(() => process.exit(0));
  });
}
