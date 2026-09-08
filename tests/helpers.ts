import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import request from 'supertest';
import { connectDb, setupIndexes } from '../server/db.js';
import { createApp } from '../server/app.js';
import { DEMO_PASSWORD, seedDemo } from '../server/demo-data.js';

/**
 * Each test file gets its own database on the same replica set, never the
 * fleet_demo database the app uses. Node runs test files in parallel, so a
 * shared database would let one suite wipe another suite's fixtures mid-run.
 * The process ID also isolates simultaneous runs of the same suite by different tools.
 */
const HOST = process.env.TEST_MONGO_HOST ?? '127.0.0.1:27018';
const REPL_SET = process.env.TEST_MONGO_REPLSET ?? 'fleet-demo';
export const uriFor = (suite: string) =>
  `mongodb://${HOST}/fleet_demo_test_${suite}_${process.pid}?replicaSet=${REPL_SET}`;

export const ORIGIN = 'http://localhost:5173';

export async function bootstrap(
  suite: string,
  { loginAttempts = 500, assistantRequests = 500, allowRealContacts = false } = {},
): Promise<Express> {
  process.env.DEMO_MODE = 'true';
  // Pin the contact policy so suites assert a known mode whatever .env holds.
  process.env.ALLOW_REAL_CONTACTS = allowRealContacts ? 'true' : 'false';
  await connectDb(uriFor(suite));
  await setupIndexes();
  await seedDemo({ reset: true, withJourneys: false });
  return createApp({
    sessionSecret: 'test-secret-test-secret-test-secret-32',
    origins: [ORIGIN],
    secureCookies: false,
    loginAttempts,
    assistantRequests,
  });
}

export type Client = ReturnType<typeof makeClient>;

function makeClient(app: Express, seat: string) {
  const agent = request.agent(app);
  let csrf = '';
  const headers = () => ({ 'X-Fleet-Seat': seat, 'X-CSRF-Token': csrf, Origin: ORIGIN });
  return {
    seat,
    agent,
    get csrf() {
      return csrf;
    },
    async signIn(username: string, password: string = DEMO_PASSWORD) {
      const start = await agent.get('/api/session').set('X-Fleet-Seat', seat);
      csrf = start.body.csrfToken;
      const res = await agent.post('/api/session/login').set(headers()).send({ username, password });
      if (res.status === 200) csrf = res.body.csrfToken;
      return res;
    },
    state: () => agent.get('/api/state').set('X-Fleet-Seat', seat),
    booking: (id: string) => agent.get(`/api/bookings/${id}`).set('X-Fleet-Seat', seat),
    create: (body: Record<string, unknown>, key = randomUUID()) =>
      agent.post('/api/bookings').set(headers()).set('Idempotency-Key', key).send(body),
    /** Sends one action. Pass an explicit key to replay the same request. */
    act: (id: string, body: Record<string, unknown>, key = randomUUID()) =>
      agent.post(`/api/bookings/${id}/actions`).set(headers()).send({ key, ...body }),
    duty: (duty: string) => agent.post('/api/driver/duty').set(headers()).send({ duty }),
    assistant: (message: string, draft: Record<string, unknown> = {}) =>
      agent.post('/api/assistant/draft').set(headers()).send({ message, draft }),
    raw: () => ({ agent, headers: headers() }),
  };
}

export const client = makeClient;

/** A valid local journey request, one hour from now, in Europe/London. */
export function localJourney(overrides: Record<string, unknown> = {}) {
  return {
    passengerName: 'Test Passenger',
    contact: 'test.passenger@example.invalid',
    pickup: 'station',
    destination: 'business',
    timing: 'now',
    passengers: 2,
    luggage: 1,
    accessible: false,
    instructions: 'Test journey',
    paymentMethod: 'card',
    flightNumber: '',
    flightDate: '',
    meetingPoint: '',
    ...overrides,
  };
}
