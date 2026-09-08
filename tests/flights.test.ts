import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import type { Express } from 'express';
import { bootstrap, client, localJourney, type Client } from './helpers.ts';
import { FlightLookupCache } from '../server/db.ts';
import { baseUrl, lookupFlight, warnIfInsecure } from '../server/flights.ts';

/**
 * Flight lookup is read-only and quota-bound. These tests never touch the
 * network: every provider branch is driven through an injected fetch.
 */

let app: Express;
let passenger: Client;
let dispatch: Client;
let driver: Client;
let airportId: string;
let localId: string;
let savedKey: string | undefined;
let savedInsecure: string | undefined;

const ok = (body: unknown) => async () => new Response(JSON.stringify(body), { status: 200 });

const flightPayload = (over: Record<string, unknown> = {}) => ({
  data: [
    {
      flight_date: '2026-09-08',
      flight_status: 'active',
      airline: { name: 'Demo Airways' },
      flight: { iata: 'DM1234', number: '1234' },
      departure: { airport: 'Demo Origin', iata: 'ORI', terminal: '1', gate: 'A1', scheduled: '2026-09-08T04:00:00+00:00', delay: null },
      arrival: { airport: 'Demo Airport', iata: 'DEM', terminal: '2', gate: 'B5', scheduled: '2026-09-08T06:00:00+00:00', estimated: '2026-09-08T06:35:00+00:00', delay: 35 },
      ...over,
    },
  ],
});

before(async () => {
  savedKey = process.env.AVIATIONSTACK_API_KEY;
  savedInsecure = process.env.AVIATIONSTACK_ALLOW_INSECURE_HTTP;
  app = await bootstrap('flights');
  passenger = client(app, 'passenger');
  dispatch = client(app, 'dispatch');
  driver = client(app, 'driver');
  await passenger.signIn('passenger');
  await dispatch.signIn('dispatch');
  await driver.signIn('drv-ashton');

  const airport = await passenger.create(
    localJourney({ destination: 'airport', flightNumber: 'DM1234', flightDate: '2026-09-08', meetingPoint: 'Terminal 2 arrivals' }),
  );
  airportId = airport.body._id;
  localId = (await passenger.create(localJourney())).body._id;
});

after(async () => {
  if (savedKey === undefined) delete process.env.AVIATIONSTACK_API_KEY;
  else process.env.AVIATIONSTACK_API_KEY = savedKey;
  if (savedInsecure === undefined) delete process.env.AVIATIONSTACK_ALLOW_INSECURE_HTTP;
  else process.env.AVIATIONSTACK_ALLOW_INSECURE_HTTP = savedInsecure;
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

beforeEach(async () => {
  // Clears cached answers and the remembered plan capability.
  await FlightLookupCache.deleteMany({});
  process.env.AVIATIONSTACK_API_KEY = 'test-key-never-used-on-the-network';
  delete process.env.AVIATIONSTACK_ALLOW_INSECURE_HTTP;
});

describe('transport security', () => {
  it('uses HTTPS by default', () => {
    assert.match(baseUrl(), /^https:\/\//);
  });

  it('downgrades only on an explicit opt-in, and says so loudly', () => {
    process.env.AVIATIONSTACK_ALLOW_INSECURE_HTTP = 'true';
    assert.match(baseUrl(), /^http:\/\//);
    const warnings: string[] = [];
    warnIfInsecure((m) => warnings.push(m));
    assert.equal(warnings.length, 1);
    assert.match(warnings[0]!, /plaintext HTTP/);
  });

  it('stays silent when the opt-in is absent', () => {
    const warnings: string[] = [];
    warnIfInsecure((m) => warnings.push(m));
    assert.equal(warnings.length, 0);
  });
});

describe('provider outcomes', () => {
  it('normalises a flight into named fields only', async () => {
    const r = await lookupFlight('dm1234', '2026-09-08', ok(flightPayload()) as typeof fetch);
    assert.equal(r.state, 'ok');
    if (r.state !== 'ok') return;
    assert.equal(r.flight.source, 'aviationstack');
    assert.equal(r.flight.status, 'active');
    assert.equal(r.flight.airline, 'Demo Airways');
    assert.equal(r.flight.flightIata, 'DM1234', 'the flight number is upper-cased');
    assert.equal(r.flight.arrival.terminal, '2');
    assert.equal(r.flight.arrival.gate, 'B5');
    assert.equal(r.flight.delayMinutes, 35);
    assert.equal(r.flight.cached, false);
  });

  it('does not forward unexpected provider fields', async () => {
    const payload = flightPayload({ secret_internal_field: 'should not reach the browser' });
    const r = await lookupFlight('DM1234', '2026-09-08', ok(payload) as typeof fetch);
    assert.equal(r.state, 'ok');
    if (r.state !== 'ok') return;
    assert.ok(!JSON.stringify(r.flight).includes('should not reach the browser'));
  });

  it('reports an empty result as not_found rather than inventing a flight', async () => {
    const r = await lookupFlight('DM1234', '2026-09-08', ok({ data: [] }) as typeof fetch);
    assert.equal(r.state, 'not_found');
  });

  it('reports a provider error without echoing the body', async () => {
    const leaky = (async () =>
      new Response(JSON.stringify({ error: { message: 'access_key=SECRET is invalid' } }), { status: 200 })) as typeof fetch;
    const r = await lookupFlight('DM1234', '2026-09-08', leaky);
    assert.equal(r.state, 'unavailable');
    if (r.state !== 'unavailable') return;
    assert.ok(!r.reason.includes('SECRET'), 'the access key must never appear in a user-facing message');
  });

  it('names the quota case specifically', async () => {
    const r = await lookupFlight('DM1234', '2026-09-08', (async () => new Response('', { status: 429 })) as typeof fetch);
    assert.equal(r.state, 'unavailable');
    if (r.state !== 'unavailable') return;
    assert.match(r.reason, /request limit/);
  });

  it('survives a network failure and a malformed body', async () => {
    const down = await lookupFlight('DM1234', '2026-09-08', (async () => {
      throw new Error('socket hang up');
    }) as typeof fetch);
    assert.equal(down.state, 'unavailable');
    await FlightLookupCache.deleteMany({});
    const junk = await lookupFlight('DM1234', '2026-09-08', ok({ data: 'not an array' }) as typeof fetch);
    assert.equal(junk.state, 'unavailable');
  });

  it('rejects a malformed flight number or date before calling the provider', async () => {
    let called = 0;
    const counting = (async () => {
      called++;
      return new Response(JSON.stringify(flightPayload()), { status: 200 });
    }) as typeof fetch;
    assert.equal((await lookupFlight('not a flight', '2026-09-08', counting)).state, 'unavailable');
    assert.equal((await lookupFlight('DM1234', 'not-a-date', counting)).state, 'unavailable');
    assert.equal(called, 0, 'no quota is spent on input the provider would reject');
  });

  it('returns unconfigured when no key is set, without calling out', async () => {
    delete process.env.AVIATIONSTACK_API_KEY;
    let called = 0;
    const counting = (async () => {
      called++;
      return new Response('{}', { status: 200 });
    }) as typeof fetch;
    assert.equal((await lookupFlight('DM1234', '2026-09-08', counting)).state, 'unconfigured');
    assert.equal(called, 0);
  });
});

describe('quota protection', () => {
  it('serves a repeat lookup from cache instead of spending quota', async () => {
    let called = 0;
    const counting = (async () => {
      called++;
      return new Response(JSON.stringify(flightPayload()), { status: 200 });
    }) as typeof fetch;

    const first = await lookupFlight('DM1234', '2026-09-08', counting);
    assert.equal(first.state, 'ok');
    for (let i = 0; i < 20; i++) await lookupFlight('DM1234', '2026-09-08', counting);
    assert.equal(called, 1, '21 lookups must cost exactly one provider request');

    const again = await lookupFlight('DM1234', '2026-09-08', counting);
    assert.equal(again.state, 'ok');
    if (again.state !== 'ok') return;
    assert.equal(again.flight.cached, true, 'a cached answer is labelled as cached');
  });

  it('caches failures too, so an outage cannot burn the monthly quota', async () => {
    let called = 0;
    const failing = (async () => {
      called++;
      return new Response('', { status: 500 });
    }) as typeof fetch;
    await lookupFlight('DM1234', '2026-09-08', failing);
    await lookupFlight('DM1234', '2026-09-08', failing);
    await lookupFlight('DM1234', '2026-09-08', failing);
    assert.equal(called, 1);
  });

  it('re-queries once the cached entry has expired', async () => {
    let called = 0;
    const counting = (async () => {
      called++;
      return new Response(JSON.stringify(flightPayload()), { status: 200 });
    }) as typeof fetch;
    const now = new Date();
    await lookupFlight('DM1234', '2026-09-08', counting, now);
    // 'active' is a live status, so the short TTL applies.
    await lookupFlight('DM1234', '2026-09-08', counting, new Date(+now + 11 * 60 * 1000));
    assert.equal(called, 2);
  });

  it('holds a settled flight far longer than a live one', async () => {
    const landed = ok(flightPayload({ flight_status: 'landed' })) as typeof fetch;
    const now = new Date();
    await lookupFlight('DM1234', '2026-09-08', landed, now);
    const entry = await FlightLookupCache.findById('DM1234:2026-09-08').lean();
    const heldSeconds = (+entry!.expiresAt! - +now) / 1000;
    assert.ok(heldSeconds > 60 * 60, `a landed flight should be held for hours, got ${heldSeconds}s`);
  });
});

describe('free-plan date restriction', () => {
  // Discovered against the real API: a free key answers 403 to any request
  // carrying flight_date, because date filtering is a paid feature.
  const dated = (url: unknown) => String(url).includes('flight_date=');

  it('drops the date parameter after a 403 and uses the undated result', async () => {
    const calls: boolean[] = [];
    const provider = (async (url: unknown) => {
      calls.push(dated(url));
      if (dated(url)) return new Response('', { status: 403 });
      return new Response(JSON.stringify(flightPayload()), { status: 200 });
    }) as typeof fetch;

    const r = await lookupFlight('DM1234', '2026-09-08', provider);
    assert.equal(r.state, 'ok', 'a free key still gets an answer');
    if (r.state !== 'ok') return;
    assert.match(r.note ?? '', /cannot filter by date/);
    assert.deepEqual(calls, [true, false], 'tried with the date, then retried without it');
  });

  it('remembers the plan limit instead of rediscovering it every lookup', async () => {
    const calls: boolean[] = [];
    const provider = (async (url: unknown) => {
      calls.push(dated(url));
      if (dated(url)) return new Response('', { status: 403 });
      return new Response(JSON.stringify(flightPayload()), { status: 200 });
    }) as typeof fetch;

    await lookupFlight('DM1234', '2026-09-08', provider);
    await FlightLookupCache.deleteOne({ _id: 'DM1234:2026-09-08' }); // expire the answer, keep the capability
    await lookupFlight('DM1234', '2026-09-08', provider);
    assert.deepEqual(calls, [true, false, false], 'the second lookup never retries the dated request');
  });

  it('refuses to present a different day as the booking flight', async () => {
    const provider = (async (url: unknown) => {
      if (dated(url)) return new Response('', { status: 403 });
      // The provider answers with a different date than the booking asked for.
      return new Response(JSON.stringify(flightPayload({ flight_date: '2026-09-09' })), { status: 200 });
    }) as typeof fetch;

    const r = await lookupFlight('DM1234', '2026-09-08', provider);
    assert.equal(r.state, 'not_found', 'a mismatched date is not passed off as the right flight');
    if (r.state !== 'not_found') return;
    assert.match(r.note ?? '', /paid plan/);
  });
});

describe('route permissions', () => {
  const get = (c: Client, id: string) => c.agent.get(`/api/bookings/${id}/flight`).set('X-Fleet-Seat', c.seat);

  it('refuses an unauthenticated caller', async () => {
    assert.equal((await client(app, 'passenger').agent.get(`/api/bookings/${airportId}/flight`).set('X-Fleet-Seat', 'passenger')).status, 401);
  });

  it('returns identical 404s for missing and forbidden bookings', async () => {
    const forbidden = await get(driver, airportId);
    const missing = await get(driver, '00000000-0000-4000-8000-000000000000');
    assert.equal(forbidden.status, 404);
    assert.equal(missing.status, 404);
    assert.deepEqual(forbidden.body, missing.body);
  });

  it('lets the owner and dispatch read it', async () => {
    assert.equal((await get(passenger, airportId)).status, 200);
    assert.equal((await get(dispatch, airportId)).status, 200);
  });

  it('reports not_applicable for a non-airport journey', async () => {
    const r = await get(passenger, localId);
    assert.equal(r.status, 200);
    assert.equal(r.body.state, 'not_applicable');
  });

  it('never exposes the API key to the browser', async () => {
    process.env.AVIATIONSTACK_API_KEY = 'super-secret-key-value';
    const r = await get(passenger, airportId);
    assert.ok(!JSON.stringify(r.body).includes('super-secret-key-value'));
  });
});

describe('read-only guarantee', () => {
  it('a flight lookup never alters the booking', async () => {
    const before = await (await import('../server/db.ts')).Booking.findById(airportId).lean();
    await lookupFlight('DM1234', '2026-09-08', ok(flightPayload({ flight_status: 'cancelled' })) as typeof fetch);
    await passenger.agent.get(`/api/bookings/${airportId}/flight`).set('X-Fleet-Seat', 'passenger');
    const after = await (await import('../server/db.ts')).Booking.findById(airportId).lean();
    // A cancelled flight must not reschedule or cancel anything on its own.
    assert.deepEqual(after, before);
  });
});

describe('plan limitation is explained, not hidden', () => {
  it('attaches the plan note to a not_found caused by the date restriction', async () => {
    // QA TC-63: a future-date lookup returned the same bare "no record" as a
    // nonexistent flight, so a dispatcher could not tell the two apart.
    const provider = (async (url: unknown) => {
      if (String(url).includes('flight_date=')) return new Response('', { status: 403 });
      return new Response(JSON.stringify(flightPayload({ flight_date: '2026-09-01' })), { status: 200 });
    }) as typeof fetch;
    const r = await lookupFlight('DM1234', '2026-09-20', provider);
    assert.equal(r.state, 'not_found');
    if (r.state !== 'not_found') return;
    assert.match(r.note ?? '', /cannot filter by date/, 'says why, not just that nothing matched');
    assert.match(r.note ?? '', /paid plan/, 'names what would fix it');
  });

  it('leaves the note absent when the plan does support dates', async () => {
    const provider = (async () => new Response(JSON.stringify({ data: [] }), { status: 200 })) as typeof fetch;
    const r = await lookupFlight('DM1234', '2026-09-20', provider);
    assert.equal(r.state, 'not_found');
    if (r.state !== 'not_found') return;
    assert.equal(r.note, undefined, 'a genuine not-found carries no plan excuse');
  });
});
