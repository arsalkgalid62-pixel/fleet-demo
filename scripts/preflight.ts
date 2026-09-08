/**
 * Pre-deployment check. Run against the environment you are about to deploy
 * with, so a misconfiguration is caught here rather than as a confusing 403 or
 * a failed cold start in production.
 *
 *   npm run preflight
 */
import 'dotenv/config';
import mongoose from 'mongoose';

let failed = 0;
const ok = (m: string) => console.log(`  PASS  ${m}`);
const bad = (m: string) => { failed++; console.log(`  FAIL  ${m}`); };
const note = (m: string) => console.log(`  note  ${m}`);

const uri = process.env.MONGODB_URI;
const secret = process.env.SESSION_SECRET;
const origin = process.env.ORIGIN;

console.log('\nRequired settings');
if (!uri) bad('MONGODB_URI is not set');
else ok('MONGODB_URI is set');

if (!secret) bad('SESSION_SECRET is not set');
else if (secret.length < 32) bad(`SESSION_SECRET is ${secret.length} characters; 32 or more required`);
else ok('SESSION_SECRET is long enough');

if (!origin) bad('ORIGIN is not set — every write will fail the CSRF origin check');
else if (!/^https?:\/\//.test(origin)) bad(`ORIGIN must be a full URL, got "${origin}"`);
else if (origin.endsWith('/')) bad(`ORIGIN must not end with a slash: "${origin}"`);
else ok(`ORIGIN is ${origin}`);

if (process.env.DEMO_MODE !== 'true') bad('DEMO_MODE must be "true" for seeding to work');
else ok('DEMO_MODE is true');

console.log('\nSafety for a public demo');
if (process.env.ALLOW_REAL_CONTACTS === 'true') {
  bad('ALLOW_REAL_CONTACTS is true — real email addresses would be stored in a publicly reachable database');
} else ok('ALLOW_REAL_CONTACTS is off; contacts stay synthetic');

console.log('\nOptional providers');
for (const [name, label] of [
  ['OPENAI_API_KEY', 'assistant wording'],
  ['AVIATIONSTACK_API_KEY', 'flight status'],
  ['GEOAPIFY_API_KEY', 'address search and routing'],
  ['VITE_GEOAPIFY_MAP_KEY', 'map tiles'],
] as const) {
  if (process.env[name]) ok(`${name} set (${label})`);
  else note(`${name} not set — ${label} degrades with a visible label, nothing breaks`);
}
if (process.env.VITE_GEOAPIFY_MAP_KEY) {
  note('VITE_GEOAPIFY_MAP_KEY is compiled into the browser bundle. Restrict it to your domain.');
}

console.log('\nDatabase');
if (uri) {
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
    const hello = await mongoose.connection.db!.admin().command({ hello: 1 });
    if (hello.setName) ok(`connected to replica set "${hello.setName}" — transactions available`);
    else bad('connected, but this is NOT a replica set; the app will refuse to start');
    const users = await mongoose.connection.db!.collection('users').countDocuments();
    if (users > 0) ok(`${users} accounts seeded`);
    else bad('no accounts found — run: npm run db:setup against this database');
    await mongoose.disconnect();
  } catch (e) {
    bad(`could not connect: ${(e as Error).message}`);
  }
}

console.log(failed ? `\n${failed} problem(s) to fix before deploying.\n` : '\nReady to deploy.\n');
process.exit(failed ? 1 : 0);
