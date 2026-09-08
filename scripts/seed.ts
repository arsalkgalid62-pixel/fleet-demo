/**
 * CLI wrapper around the synthetic demo dataset.
 *
 *   npm run db:setup    add demo data if absent
 *   npm run db:reset    wipe and recreate demo data
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDb, setupIndexes } from '../server/db.js';
import { DEMO_PASSWORD, DRIVERS, seedDemo } from '../server/demo-data.js';

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error('MONGODB_URI is required. Copy .env.example to .env.');

await connectDb(uri);
await setupIndexes();

const result = await seedDemo({ reset: process.argv.includes('--reset') });
const dbName = mongoose.connection.db!.databaseName;

console.log(`[seed] database "${dbName}" ready: ${result.vehicles} vehicles, ${result.drivers} drivers, ${result.users} accounts, ${result.journeys} new sample journeys`);
console.log(`[seed] demo sign-ins (synthetic): passenger / dispatch / ${DRIVERS.map((d) => d._id).join(' / ')}`);
console.log(`[seed] demo password for every account: ${DEMO_PASSWORD}`);
await mongoose.disconnect();
