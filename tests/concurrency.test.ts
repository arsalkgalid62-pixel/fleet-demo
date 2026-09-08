/**
 * These tests exercise genuinely concurrent requests against a real MongoDB
 * replica set. Sequential checks would pass even with a broken design, so every
 * race here is driven with Promise.all rather than one call after another.
 */
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { DateTime } from 'luxon';
import type { Express } from 'express';
import { bootstrap, client, localJourney, type Client } from './helpers.ts';
import { Booking, Driver, Vehicle } from '../server/db.ts';
import { seedDemo } from '../server/demo-data.ts';
import { expireOffers } from '../server/service.ts';

let app: Express;
let passenger: Client;
let dispatch: Client;

before(async () => {
  app = await bootstrap('concurrency');
});
after(async () => {
  // Drop this suite's database so the next run starts from nothing.
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

beforeEach(async () => {
  // Some tests below deliberately shrink or downgrade the fleet, so restore the
  // full four vehicles and five drivers before each one.
  await Booking.deleteMany({});
  await Vehicle.deleteMany({});
  await Driver.deleteMany({});
  await seedDemo({ withJourneys: false });
  passenger = client(app, 'passenger');
  dispatch = client(app, 'dispatch');
  await passenger.signIn('passenger');
  await dispatch.signIn('dispatch');
});

/** A scheduled journey at a fixed offset, so two of them overlap on purpose. */
const at = (minutesFromNow: number, overrides: Record<string, unknown> = {}) =>
  localJourney({
    timing: 'scheduled',
    pickupLocal: DateTime.now()
      .setZone('Europe/London')
      .plus({ minutes: minutesFromNow })
      .toFormat("yyyy-MM-dd'T'HH:mm"),
    ...overrides,
  });

describe('idempotency', () => {
  it('returns one booking for two identical concurrent submissions', async () => {
    const key = randomUUID();
    const body = at(90);
    const [a, b] = await Promise.all([passenger.create(body, key), passenger.create(body, key)]);
    assert.equal(a.status, 201);
    assert.equal(b.status, 201);
    assert.equal(a.body._id, b.body._id, 'the same key must resolve to the same booking');
    assert.equal(await Booking.countDocuments(), 1);
  });

  it('rejects the same key reused for a different journey', async () => {
    const key = randomUUID();
    await passenger.create(at(90), key);
    const res = await passenger.create(at(90, { passengers: 4 }), key);
    assert.equal(res.status, 409);
    assert.match(res.body.error, /idempotency/i);
  });

  it('does not double-record a replayed payment action', async () => {
    const created = await passenger.create(at(30));
    const id = created.body._id;
    let version = created.body.version;
    for (const action of ['confirm'] as const) {
      const r = await dispatch.act(id, { action, version });
      version = r.body.version;
    }
    await Booking.updateOne({ _id: id }, { $set: { status: 'completed' } });
    const key = randomUUID();
    const first = await dispatch.act(id, { action: 'payment', version, outcome: 'paid' }, key);
    const replay = await dispatch.act(id, { action: 'payment', version, outcome: 'paid' }, key);
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal(replay.status, 200, 'a replay must be safe, not an error');
    const payments = await mongoose.connection.db!.collection('payments').countDocuments({ bookingId: id });
    assert.equal(payments, 1, 'a replayed action must not create a second payment');
  });
});

describe('optimistic concurrency', () => {
  it('rejects a second write that used a stale version', async () => {
    const created = await passenger.create(at(90));
    const id = created.body._id;
    const version = created.body.version;
    const first = await dispatch.act(id, { action: 'confirm', version });
    assert.equal(first.status, 200);
    const stale = await dispatch.act(id, { action: 'confirm', version });
    assert.equal(stale.status, 409);
    assert.match(stale.body.error, /changed|refresh/i);
  });
});

describe('vehicle schedule races', () => {
  /** Shrinks the fleet to a single car so two overlapping trips cannot both fit. */
  async function singleVehicleFleet() {
    await Driver.updateMany({ _id: { $ne: 'drv-ashton' } }, { $unset: { vehicleId: 1 }, $set: { duty: 'off_duty' } });
    await Vehicle.deleteMany({ _id: { $ne: 'FD-01' } });
  }

  it('confirms only one of two overlapping journeys when one car remains', async () => {
    await singleVehicleFleet();
    const a = await passenger.create(at(120));
    const b = await passenger.create(at(130));

    // Both confirmations are issued at once and hit the same vehicle schedule.
    const [ra, rb] = await Promise.all([
      dispatch.act(a.body._id, { action: 'confirm', version: a.body.version }),
      dispatch.act(b.body._id, { action: 'confirm', version: b.body.version }),
    ]);

    const statuses = [ra.status, rb.status].sort();
    assert.deepEqual(statuses, [200, 409], `expected exactly one winner, got ${JSON.stringify([ra.body, rb.body])}`);
    const confirmed = await Booking.countDocuments({ status: 'confirmed' });
    assert.equal(confirmed, 1, 'exactly one booking may hold the vehicle');
    const loser = ra.status === 409 ? ra : rb;
    assert.match(loser.body.error, /capacity|conflict|changed/i);
  });

  it('keeps both journeys when the intervals do not overlap', async () => {
    await singleVehicleFleet();
    const a = await passenger.create(at(120));
    const b = await passenger.create(at(400));
    const [ra, rb] = await Promise.all([
      dispatch.act(a.body._id, { action: 'confirm', version: a.body.version }),
      dispatch.act(b.body._id, { action: 'confirm', version: b.body.version }),
    ]);
    assert.equal(ra.status, 200, JSON.stringify(ra.body));
    assert.equal(rb.status, 200, JSON.stringify(rb.body));
  });

  it('releases capacity when the first journey is cancelled', async () => {
    await singleVehicleFleet();
    const a = await passenger.create(at(120));
    const confirmA = await dispatch.act(a.body._id, { action: 'confirm', version: a.body.version });
    assert.equal(confirmA.status, 200);

    const b = await passenger.create(at(130));
    const blocked = await dispatch.act(b.body._id, { action: 'confirm', version: b.body.version });
    assert.equal(blocked.status, 409, 'the overlapping request must stay awaiting review');
    assert.equal((await Booking.findById(b.body._id))!.status, 'requested');

    const cancel = await dispatch.act(a.body._id, {
      action: 'cancel',
      version: confirmA.body.version,
      reason: 'Demo test: releasing capacity',
    });
    assert.equal(cancel.status, 200, JSON.stringify(cancel.body));

    const retry = await dispatch.act(b.body._id, { action: 'confirm', version: b.body.version });
    assert.equal(retry.status, 200, 'cancelled capacity must become available again');
  });

  it('refuses a vehicle that cannot carry the party', async () => {
    await Vehicle.updateMany({}, { $set: { seats: 2, luggage: 0, accessible: false } });
    const a = await passenger.create(at(120, { passengers: 6, luggage: 4 }));
    const res = await dispatch.act(a.body._id, { action: 'confirm', version: a.body.version });
    assert.equal(res.status, 409);
    assert.equal((await Booking.findById(a.body._id))!.status, 'requested', 'must stay awaiting review');
  });
});

describe('driver offer races', () => {
  it('lets only one of two concurrent acceptances win', async () => {
    const created = await passenger.create(at(120));
    const id = created.body._id;
    const confirm = await dispatch.act(id, { action: 'confirm', version: created.body.version });
    assert.equal(confirm.status, 200, JSON.stringify(confirm.body));
    const vehicleId = confirm.body.vehicleId;
    const driver = await Driver.findOne({ vehicleId });
    const offer = await dispatch.act(id, {
      action: 'offer',
      version: confirm.body.version,
      driverId: driver!._id,
    });
    assert.equal(offer.status, 200, JSON.stringify(offer.body));

    // The same driver, signed in twice, races itself: two tabs, one job.
    const tabA = client(app, 'driver');
    const tabB = client(app, 'driver');
    await tabA.signIn(driver!._id!);
    await tabB.signIn(driver!._id!);

    const [ra, rb] = await Promise.all([
      tabA.act(id, { action: 'accept', version: offer.body.version }),
      tabB.act(id, { action: 'accept', version: offer.body.version }),
    ]);
    assert.deepEqual([ra.status, rb.status].sort(), [200, 409], 'exactly one acceptance may succeed');
    assert.equal((await Booking.findById(id))!.progress, 'accepted');
  });

  it('refuses acceptance by a driver who was not offered the job', async () => {
    const created = await passenger.create(at(120));
    const id = created.body._id;
    const confirm = await dispatch.act(id, { action: 'confirm', version: created.body.version });
    assert.equal(confirm.status, 200, JSON.stringify(confirm.body));
    const driver = await Driver.findOne({ vehicleId: confirm.body.vehicleId });
    const offer = await dispatch.act(id, {
      action: 'offer',
      version: confirm.body.version,
      driverId: driver!._id,
    });

    const other = client(app, 'driver');
    const otherId = (await Driver.findOne({ _id: { $ne: driver!._id }, vehicleId: { $exists: true } }))!._id!;
    await other.signIn(otherId);
    const res = await other.act(id, { action: 'accept', version: offer.body.version });
    assert.equal(res.status, 404, 'a booking offered to someone else must not be readable');
  });

  it('returns an expired offer to the queue for reassignment', async () => {
    const created = await passenger.create(at(120));
    const id = created.body._id;
    const confirm = await dispatch.act(id, { action: 'confirm', version: created.body.version });
    assert.equal(confirm.status, 200, JSON.stringify(confirm.body));
    const driver = await Driver.findOne({ vehicleId: confirm.body.vehicleId });
    const offer = await dispatch.act(id, {
      action: 'offer',
      version: confirm.body.version,
      driverId: driver!._id,
    });
    assert.equal(offer.body.progress, 'offered');

    // Age the offer past its deadline, then run the server-side sweep.
    await Booking.updateOne({ _id: id }, { $set: { offerExpires: new Date(Date.now() - 1000) } });
    await expireOffers();

    const after = await Booking.findById(id);
    assert.equal(after!.progress, 'unassigned');
    assert.equal(after!.driverId, undefined);
    assert.equal(after!.status, 'confirmed', 'the booking stays confirmed and reassignable');

    const events = await mongoose.connection.db!
      .collection('events')
      .find({ bookingId: id, type: 'offer_expired' })
      .toArray();
    assert.equal(events.length, 1, 'expiry must be recorded for the dispatcher');
  });

  it('prevents an off-duty driver from accepting', async () => {
    const created = await passenger.create(at(120));
    const id = created.body._id;
    const confirm = await dispatch.act(id, { action: 'confirm', version: created.body.version });
    assert.equal(confirm.status, 200, JSON.stringify(confirm.body));
    const driver = await Driver.findOne({ vehicleId: confirm.body.vehicleId });
    const offer = await dispatch.act(id, {
      action: 'offer',
      version: confirm.body.version,
      driverId: driver!._id,
    });

    await Driver.updateOne({ _id: driver!._id }, { $set: { duty: 'off_duty' } });
    const tab = client(app, 'driver');
    await tab.signIn(driver!._id!);
    const res = await tab.act(id, { action: 'accept', version: offer.body.version });
    assert.equal(res.status, 409);
  });
});

describe('UK time handling', () => {
  it('rejects a clock time that does not exist on a spring-forward night', async () => {
    // 01:30 on 29 March 2026 is skipped when UK clocks go forward.
    const res = await passenger.create(at(0, { timing: 'scheduled', pickupLocal: '2026-03-29T01:30' }));
    assert.equal(res.status, 400);
    assert.match(res.body.error, /daylight saving|ambiguous|missing/i);
  });

  it('rejects an ambiguous clock time on an autumn fall-back night', async () => {
    // 01:30 on 25 October 2026 happens twice when UK clocks go back.
    const res = await passenger.create(at(0, { timing: 'scheduled', pickupLocal: '2026-10-25T01:30' }));
    assert.equal(res.status, 400);
    assert.match(res.body.error, /daylight saving|ambiguous|missing/i);
  });

  it('rejects a pickup time in the past', async () => {
    const res = await passenger.create(at(-120));
    assert.equal(res.status, 400);
  });

  it('formats the pickup time in Europe/London', async () => {
    const created = await passenger.create(at(120));
    assert.match(created.body.pickupLocalText, /(GMT|BST)/, 'UK timezone must be shown to the user');
  });
});

describe('offer expiry without a background process', () => {
  // A serverless host has no long-lived timer, and Vercel's Hobby cron runs
  // once a day against a 60-second offer. Expiry therefore has to happen on a
  // request path. /state is polled by every client, so it sweeps.
  it('expires a stale offer during an ordinary /state poll', async () => {
    const p = client(app, 'passenger');
    const d = client(app, 'dispatch');
    await p.signIn('passenger');
    await d.signIn('dispatch');
    const created = await p.create(localJourney());
    let r = await d.act(created.body._id, { action: 'confirm', version: 0 });
    r = await d.act(created.body._id, { action: 'offer', version: r.body.version, driverId: 'drv-ashton' });
    assert.equal(r.body.progress, 'offered');

    // Age the offer past its expiry without waiting a real minute.
    await Booking.updateOne({ _id: created.body._id }, { $set: { offerExpires: new Date(Date.now() - 1000) } });

    const state = await d.state();
    const seen = state.body.bookings.find((b: { _id: string }) => b._id === created.body._id);
    assert.equal(seen.progress, 'unassigned', 'the poll itself released the offer');
    assert.equal(seen.driverId, undefined, 'and cleared the driver');

    const detail = await d.booking(created.body._id);
    assert.ok(
      detail.body.events.some((e: { type: string }) => e.type === 'offer_expired'),
      'an audit event records why it changed',
    );
  });
});
