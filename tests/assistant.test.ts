import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import type { Express } from 'express';
import { DateTime } from 'luxon';
import { bootstrap, client, type Client } from './helpers.ts';
import { extract, interpret, missingFields } from '../server/assistant.ts';

/**
 * The assistant's guarantee is negative: whatever it produces, it must not be
 * able to book, price, confirm or assign anything. These tests exercise that
 * boundary rather than the wording of any model reply.
 *
 * The suite deletes OPENAI_API_KEY in before(), so interpret() always runs its
 * deterministic path regardless of what .env holds. That is the point — the
 * guards live on the server side of the boundary and hold for either provider,
 * and the tests stay fast, free and deterministic.
 */

let app: Express;
let passenger: Client;
let driver: Client;
let savedKey: string | undefined;

before(async () => {
  // These tests assert the deterministic extractor's behaviour, so they must
  // not reach a real provider: a configured .env key would otherwise make them
  // slow, non-deterministic and chargeable. The live path is exercised
  // separately with an injected fetch in tests/support.test.ts.
  savedKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  process.env.ALLOW_REAL_CONTACTS = 'false';
  app = await bootstrap('assistant');
  passenger = client(app, 'passenger');
  driver = client(app, 'driver');
  await passenger.signIn('passenger');
  await driver.signIn('drv-ashton');
});
after(async () => {
  if (savedKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = savedKey;
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

describe('assistant access control', () => {
  it('rejects an unauthenticated caller', async () => {
    const res = await client(app, 'passenger').assistant('station to hotel now for 1');
    // 403, not 401: with no session there is no CSRF token either, and the CSRF
    // guard runs before authentication. Either way it never reaches interpret().
    assert.equal(res.status, 403);
  });

  it('refuses the driver seat', async () => {
    const res = await driver.assistant('station to hotel now for 1');
    assert.equal(res.status, 403);
  });

  it('rejects a write without a CSRF token', async () => {
    const res = await passenger.agent
      .post('/api/assistant/draft')
      .set('X-Fleet-Seat', 'passenger')
      .send({ message: 'station to hotel now' });
    assert.equal(res.status, 403);
  });

  it('rejects an empty message', async () => {
    const res = await passenger.assistant('   ');
    assert.equal(res.status, 400);
  });
});

describe('assistant drafting', () => {
  it('reads a plain local journey into a draft', async () => {
    const res = await passenger.assistant('I need a car from the station to the hospital now for 2 people with 1 bag');
    assert.equal(res.status, 200);
    assert.equal(res.body.draft.pickup, 'station');
    assert.equal(res.body.draft.destination, 'hospital');
    assert.equal(res.body.draft.timing, 'now');
    assert.equal(res.body.draft.passengers, 2);
    assert.equal(res.body.draft.luggage, 1);
    assert.equal(res.body.ready, true);
  });

  it('asks for what is still missing instead of inventing it', async () => {
    const res = await passenger.assistant('I need to get to the hospital');
    assert.equal(res.status, 200);
    assert.ok(res.body.missing.includes('passengers'));
    assert.equal(res.body.ready, false);
    assert.ok(res.body.question.length > 0);
    // Nothing invented for the fields it was not told about.
    assert.equal(res.body.draft.passengers, undefined);
  });

  it('carries an agreed draft across turns', async () => {
    const first = await passenger.assistant('from the hotel to the airport tomorrow at 6am');
    assert.equal(first.body.draft.pickup, 'hotel');
    const second = await passenger.assistant('3 of us, flight DM1234, meet at arrivals', first.body.draft);
    assert.equal(second.body.draft.pickup, 'hotel', 'earlier detail survived the second turn');
    assert.equal(second.body.draft.destination, 'airport');
    assert.equal(second.body.draft.passengers, 3);
    assert.equal(second.body.draft.flightNumber, 'DM1234');
  });

  it('never returns a booking, reference, status, vehicle or driver', async () => {
    const res = await passenger.assistant('station to hotel now for 1 person');
    for (const forbidden of ['_id', 'reference', 'status', 'vehicleId', 'driverId', 'version', 'fare']) {
      assert.equal(res.body.draft[forbidden], undefined, `draft leaked ${forbidden}`);
    }
    // The indicative quote is the server's own, not something the assistant chose.
    assert.equal(res.body.quote.amount, 1600);
    assert.equal(res.body.quote.pricingVersion, 'demo-v1');
  });

  it('creates no booking as a side effect', async () => {
    const before = (await passenger.state()).body.bookings.length;
    await passenger.assistant('airport from the hotel tomorrow at 7am, 2 people, flight DM99');
    const after = (await passenger.state()).body.bookings.length;
    assert.equal(after, before, 'drafting must not persist anything');
  });

  it('labels the provider honestly when no model is configured', async () => {
    const res = await passenger.assistant('station to hotel now for 1');
    assert.equal(res.body.provider, 'pattern-match');
    assert.match(res.body.notice, /No AI provider is configured/);
  });
});

describe('assistant output is sanitised server-side', () => {
  const now = new Date('2026-09-07T12:00:00Z');

  it('drops a contact address that is not synthetic', async () => {
    const reply = await interpret('book me a car', { contact: 'real.person@gmail.com' }, now);
    assert.equal(reply.draft.contact, undefined);
    assert.ok(reply.dropped.some((d) => d.includes('example.invalid')));
  });

  it('keeps a synthetic contact address', async () => {
    const reply = await interpret('book me a car', { contact: 'sam@example.invalid' }, now);
    assert.equal(reply.draft.contact, 'sam@example.invalid');
  });

  it('drops a pickup time in the past', async () => {
    const reply = await interpret('book me a car', { pickupLocal: '2020-01-01T09:00', timing: 'scheduled' }, now);
    assert.equal(reply.draft.pickupLocal, undefined);
    assert.equal(reply.draft.timing, undefined);
    assert.ok(reply.dropped.some((d) => d.includes('past')));
  });

  it('drops a UK clock time that does not exist', async () => {
    // 01:30 on 29 March 2026 is skipped by the BST transition.
    const reply = await interpret('book me a car', { pickupLocal: '2026-03-29T01:30', timing: 'scheduled' }, now);
    assert.equal(reply.draft.pickupLocal, undefined);
  });

  it('drops a destination identical to the pickup', async () => {
    const reply = await interpret('book me a car', { pickup: 'hotel', destination: 'hotel' }, now);
    assert.equal(reply.draft.destination, undefined);
  });

  it('discards a fare, status or vehicle the model tried to set', async () => {
    const reply = await interpret(
      'book me a car',
      { pickup: 'station', destination: 'hotel', fare: 1, status: 'confirmed', vehicleId: 'FD-01', passengers: 99 },
      now,
    );
    assert.equal((reply.draft as Record<string, unknown>).fare, undefined);
    assert.equal((reply.draft as Record<string, unknown>).status, undefined);
    assert.equal((reply.draft as Record<string, unknown>).vehicleId, undefined);
    // passengers:99 is out of range, so the whole unparseable object is refused
    // rather than partially trusted.
    assert.equal(reply.draft.passengers, undefined);
  });

  it('requires flight details before an airport journey is ready', () => {
    const missing = missingFields({ pickup: 'hotel', destination: 'airport', timing: 'now', passengers: 2 });
    assert.deepEqual(missing.sort(), ['flightDate', 'flightNumber', 'meetingPoint']);
  });
});

describe('deterministic extraction', () => {
  const now = DateTime.fromISO('2026-09-07T12:00', { zone: 'Europe/London' }).toJSDate();

  it('resolves "from X to Y" in the stated order', () => {
    const draft = extract('from the airport to the hotel', now);
    assert.equal(draft.pickup, 'airport');
    assert.equal(draft.destination, 'hotel');
  });

  it('reads tomorrow at a stated time as UK local time', () => {
    const draft = extract('hotel to station tomorrow at 6am', now);
    assert.equal(draft.timing, 'scheduled');
    assert.equal(draft.pickupLocal, '2026-09-08T06:00');
  });

  it('rolls a bare time that has already passed to the next day', () => {
    const draft = extract('station to hotel at 9am', now);
    assert.equal(draft.pickupLocal, '2026-09-08T09:00');
  });

  it('does not read a passenger count as a clock time', () => {
    const draft = extract('station to hotel now for 4 people', now);
    assert.equal(draft.passengers, 4);
    assert.equal(draft.timing, 'now');
    assert.equal(draft.pickupLocal, undefined);
  });

  it('does not read a bare count as a clock time', () => {
    // Regression: "3 of us with 4 bags" was being read as 03:00.
    const draft = extract('3 of us with 4 bags, flight DM1234, meet at arrivals', now);
    assert.equal(draft.passengers, 3);
    assert.equal(draft.luggage, 4);
    assert.equal(draft.pickupLocal, undefined, 'no time was stated, so none should be invented');
    assert.equal(draft.timing, undefined);
  });

  it('does not let a later turn overwrite an agreed pickup time', async () => {
    const first = await interpret('from the hotel to the airport tomorrow at 6am', {}, now);
    assert.equal(first.draft.pickupLocal, '2026-09-08T06:00');
    const second = await interpret('3 of us with 4 bags, flight DM1234, meet at arrivals', first.draft, now);
    assert.equal(second.draft.pickupLocal, '2026-09-08T06:00');
    assert.equal(second.draft.passengers, 3);
  });

  it('derives the flight date whether or not it arrived with the time', async () => {
    // Regression: the date was only filled in when flight number and pickup
    // time were extracted on the same turn, so a two-turn booking stalled.
    const first = await interpret('from the hotel to the airport tomorrow at 6am', {}, now);
    const second = await interpret('3 of us, flight DM1234, meet at arrivals', first.draft, now);
    assert.equal(second.draft.flightDate, '2026-09-08');
    assert.deepEqual(second.missing, []);
    assert.equal(second.ready, true);
  });

  it('still accepts an explicit correction to the time', async () => {
    const first = await interpret('hotel to the station tomorrow at 6am', {}, now);
    const second = await interpret('actually make it 7:30am', first.draft, now);
    assert.equal(second.draft.pickupLocal, '2026-09-08T07:30');
  });

  it('picks up an accessibility requirement', () => {
    const draft = extract('wheelchair accessible car from the hospital to the station now', now);
    assert.equal(draft.accessible, true);
  });
});
