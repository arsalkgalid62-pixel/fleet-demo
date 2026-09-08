/**
 * Starts a real single-node MongoDB replica set for local development.
 *
 * A replica set (not a standalone mongod) is required because the booking
 * service relies on multi-document transactions. Data is written to .data/mongo
 * so bookings survive a restart of this process. Nothing here is a substitute
 * database: mongodb-memory-server only downloads and supervises the official
 * mongod binary.
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

const PORT = Number(process.env.MONGO_PORT ?? 27018);
const REPL_SET = process.env.MONGO_REPLSET ?? 'fleet-demo';
const DB_PATH = resolve(process.env.MONGO_DBPATH ?? '.data/mongo');

mkdirSync(DB_PATH, { recursive: true });

const replSet = await MongoMemoryReplSet.create({
  replSet: { name: REPL_SET, count: 1, storageEngine: 'wiredTiger' },
  instanceOpts: [{ port: PORT, dbPath: DB_PATH }],
});

const uri = `mongodb://127.0.0.1:${PORT}/fleet_demo?replicaSet=${REPL_SET}`;
console.log(`[mongo] replica set "${REPL_SET}" ready on ${uri}`);
console.log(`[mongo] data directory: ${DB_PATH} (persistent across restarts)`);
console.log('[mongo] press Ctrl+C to stop');

/**
 * Hold the event loop open.
 *
 * Signal handlers do not count as pending work, so without a referenced handle
 * Node would exit as soon as startup finished — and mongodb-memory-server would
 * shut mongod down with it, taking every interface offline. The interval also
 * doubles as a liveness check.
 */
const heartbeat = setInterval(() => {
  if (!replSet.servers.some((server) => server.instanceInfo)) {
    console.error('[mongo] mongod is no longer running — exiting so the failure is visible');
    process.exit(1);
  }
}, 10_000);

let stopping = false;
const shutdown = async () => {
  if (stopping) return;
  stopping = true;
  clearInterval(heartbeat);
  // doCleanup:false keeps the dbPath so saved bookings survive a restart.
  await replSet.stop({ doCleanup: false, force: false });
  console.log('[mongo] stopped; data retained');
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
