import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import type { Express } from 'express';
import { bootstrap, client, localJourney, ORIGIN } from './helpers.ts';

let app: Express;
before(async () => {
  app = await bootstrap('journey');
});
after(async () => {
  // Drop this suite's database so the next run starts from nothing.
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

describe('validation errors explain themselves', () => {
  // Regression (QA TC-06): every Zod failure used to collapse to a bare
  // "Invalid input", so a passenger was told something was wrong but never
  // what. The schema message was being dropped instead of returned.
  it('names the field and the reason for a malformed contact', async () => {
    const p = client(app, 'passenger');
    await p.signIn('passenger');
    const res = await p.create(localJourney({ contact: 'not-an-email' }));
    assert.equal(res.status, 400);
    assert.notEqual(res.body.error, 'Invalid input');
    assert.match(res.body.error, /Contact/i);
    // The structured issues are still available for anything that wants them.
    assert.ok(Array.isArray(res.body.issues) && res.body.issues.length > 0);
  });

  it('explains the synthetic-contact policy separately from schema errors', async () => {
    // A well-formed real address is a policy refusal, not a format error, so it
    // carries no Zod issues — but it must still say what to do about it.
    const p = client(app, 'passenger');
    await p.signIn('passenger');
    const res = await p.create(localJourney({ contact: 'someone@gmail.com' }));
    assert.equal(res.status, 400);
    assert.match(res.body.error, /Contact/i);
    assert.match(res.body.error, /example\.invalid/);
    assert.match(res.body.error, /ALLOW_REAL_CONTACTS/);
  });

  it('names the field for an out-of-range passenger count', async () => {
    const p = client(app, 'passenger');
    await p.signIn('passenger');
    const res = await p.create(localJourney({ passengers: 99 }));
    assert.equal(res.status, 400);
    assert.match(res.body.error, /Passengers/i);
  });

  it('reports several problems at once without dumping all of them', async () => {
    const p = client(app, 'passenger');
    await p.signIn('passenger');
    const res = await p.create(
      localJourney({ passengers: 99, luggage: 99, passengerName: '', instructions: 'x'.repeat(600) }),
    );
    assert.equal(res.status, 400);
    // Capped at three described issues, with the remainder counted.
    assert.match(res.body.error, /And \d+ more problem/);
  });
});

describe('a reason is required for destructive actions', () => {
  // QA reported that a blank reason "goes through". It does not: the client
  // blocks it in Dispatch.withReason, and the server independently rejects it
  // here. These tests pin the server half, which no browser tooling can bypass.
  it('refuses a cancel with a blank reason', async () => {
    const p = client(app, 'passenger');
    const d = client(app, 'dispatch');
    await p.signIn('passenger');
    await d.signIn('dispatch');
    const created = await p.create(localJourney());

    const blank = await d.act(created.body._id, { action: 'cancel', version: 0, reason: '   ' });
    assert.equal(blank.status, 409);
    assert.match(blank.body.error, /reason is required/i);

    const missing = await d.act(created.body._id, { action: 'cancel', version: 0 });
    assert.equal(missing.status, 409);

    // Still cancellable with a real reason, and the reason is what gets stored.
    const ok = await d.act(created.body._id, {
      action: 'cancel',
      version: 0,
      reason: 'Passenger no longer needs the car',
    });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.status, 'cancelled');
    const detail = await d.booking(created.body._id);
    const event = detail.body.events.find((e: { type: string }) => e.type === 'cancel');
    assert.equal(event.details.reason, 'Passenger no longer needs the car');
  });

  it('records the passenger cancel reason verbatim', async () => {
    // The passenger interface always sends this exact string, from behind a
    // window.confirm(). Its presence in the audit trail proves the confirm
    // path ran — the app has no other way to produce it.
    const p = client(app, 'passenger');
    await p.signIn('passenger');
    const created = await p.create(localJourney());
    await p.act(created.body._id, {
      action: 'cancel',
      version: 0,
      reason: 'Cancelled by passenger',
    });
    const detail = await p.booking(created.body._id);
    assert.equal(detail.body.booking.status, 'cancelled');
  });
});

describe('notification previews', () => {
  // Regression (QA TC-51): the endpoint existed and was tested, but no view in
  // the client ever called it, so the previews were unreachable in the UI.
  it('returns preview-only rows to dispatch, labelled as not sent', async () => {
    const p = client(app, 'passenger');
    const d = client(app, 'dispatch');
    await p.signIn('passenger');
    await d.signIn('dispatch');
    const created = await p.create(localJourney());
    await d.act(created.body._id, { action: 'confirm', version: 0 });

    const res = await d.agent.get('/api/notifications').set('X-Fleet-Seat', 'dispatch');
    assert.equal(res.status, 200);
    assert.match(res.body.notice, /No SMS or email is sent/i);
    const row = res.body.rows.find((r: { bookingId: string }) => r.bookingId === created.body._id);
    assert.ok(row, 'confirming a booking records a preview');
    assert.equal(row.state, 'preview_only');
    assert.match(row.text, /Demo preview/);
  });

  it('refuses the passenger seat', async () => {
    const p = client(app, 'passenger');
    await p.signIn('passenger');
    const res = await p.agent.get('/api/notifications').set('X-Fleet-Seat', 'passenger');
    assert.equal(res.status, 403);
  });
});

describe('sessions and role isolation', () => {
  it('rejects requests without a seat header', async () => {
    const res = await client(app, 'passenger').agent.get('/api/state');
    assert.equal(res.status, 400);
  });

  it('rejects an unauthenticated read', async () => {
    const res = await client(app, 'passenger').state();
    assert.equal(res.status, 401);
  });

  it('refuses a dispatcher account on the passenger seat', async () => {
    const res = await client(app, 'passenger').signIn('dispatch');
    assert.equal(res.status, 401);
  });

  it('refuses a wrong password', async () => {
    const res = await client(app, 'dispatch').signIn('dispatch', 'wrong-password');
    assert.equal(res.status, 401);
  });

  it('keeps three seats signed in independently', async () => {
    const p = client(app, 'passenger');
    const d = client(app, 'dispatch');
    const v = client(app, 'driver');
    assert.equal((await p.signIn('passenger')).status, 200);
    assert.equal((await d.signIn('dispatch')).status, 200);
    assert.equal((await v.signIn('drv-ashton')).status, 200);
    assert.equal((await p.state()).body.fleet, null, 'passengers must not see the fleet');
    assert.equal((await d.state()).body.fleet.vehicles.length, 4);
  });
});

describe('CSRF protection', () => {
  it('rejects a write with no CSRF token', async () => {
    const p = client(app, 'passenger');
    await p.signIn('passenger');
    const res = await p.agent
      .post('/api/bookings')
      .set({ 'X-Fleet-Seat': 'passenger', Origin: ORIGIN, 'Idempotency-Key': randomUUID() })
      .send(localJourney());
    assert.equal(res.status, 403);
  });

  it('rejects a write from another origin', async () => {
    const p = client(app, 'passenger');
    await p.signIn('passenger');
    const res = await p.agent
      .post('/api/bookings')
      .set({
        'X-Fleet-Seat': 'passenger',
        'X-CSRF-Token': p.csrf,
        Origin: 'http://evil.example',
        'Idempotency-Key': randomUUID(),
      })
      .send(localJourney());
    assert.equal(res.status, 403);
  });
});

describe('full booking journey', () => {
  it('runs passenger to dispatch to driver to completion and payment', async () => {
    const p = client(app, 'passenger');
    const d = client(app, 'dispatch');
    await p.signIn('passenger');
    await d.signIn('dispatch');

    const created = await p.create(localJourney());
    assert.equal(created.status, 201);
    const id = created.body._id;
    assert.match(created.body.reference, /^FD-[0-9A-F]{8}$/);
    assert.equal(created.body.status, 'requested');
    assert.equal(created.body.fare.currency, 'GBP');
    assert.equal(Number.isInteger(created.body.fare.amount), true, 'fare must be integer pence');

    // Dispatch sees the passenger request through the same shared service.
    const queue = await d.state();
    assert.ok(queue.body.bookings.some((b: { _id: string }) => b._id === id));

    let version = created.body.version;
    const confirm = await d.act(id, { action: 'confirm', version });
    assert.equal(confirm.status, 200, JSON.stringify(confirm.body));
    assert.equal(confirm.body.status, 'confirmed');
    assert.ok(confirm.body.vehicleId, 'confirmation must reserve a vehicle');
    version = confirm.body.version;

    const vehicleId = confirm.body.vehicleId;
    const driverForVehicle = (await d.state()).body.fleet.drivers.find(
      (dr: { vehicleId: string }) => dr.vehicleId === vehicleId,
    );
    assert.ok(driverForVehicle, 'a driver should hold the reserved vehicle');

    const offer = await d.act(id, { action: 'offer', version, driverId: driverForVehicle._id });
    assert.equal(offer.status, 200, JSON.stringify(offer.body));
    assert.equal(offer.body.progress, 'offered');
    version = offer.body.version;

    const assigned = client(app, 'driver');
    await assigned.signIn(driverForVehicle._id);

    const accept = await assigned.act(id, { action: 'accept', version });
    assert.equal(accept.status, 200, JSON.stringify(accept.body));
    assert.equal(accept.body.progress, 'accepted');
    version = accept.body.version;

    for (const action of ['on_the_way', 'arrived'] as const) {
      const res = await assigned.act(id, { action, version });
      assert.equal(res.status, 200, JSON.stringify(res.body));
      version = res.body.version;
    }

    const start = await assigned.act(id, { action: 'start', version });
    assert.equal(start.body.status, 'in_progress');
    version = start.body.version;

    // The passenger sees the same server-derived simulated position.
    const passengerView = (await p.state()).body.bookings.find((b: { _id: string }) => b._id === id);
    assert.equal(passengerView.simulation.label, 'Simulated vehicle location');
    assert.equal(passengerView.status, 'in_progress');

    const complete = await assigned.act(id, { action: 'complete', version });
    assert.equal(complete.body.status, 'completed');
    assert.equal(complete.body.paymentStatus, 'outstanding', 'completion must not imply payment');
    version = complete.body.version;

    const pay = await d.act(id, { action: 'payment', version, outcome: 'paid' });
    assert.equal(pay.status, 200, JSON.stringify(pay.body));
    assert.equal(pay.body.paymentStatus, 'paid');

    const detail = await d.booking(id);
    assert.equal(detail.body.payments.length, 1);
    assert.equal(detail.body.payments[0].simulated, true);
    const types = detail.body.events.map((e: { type: string }) => e.type);
    assert.deepEqual(types.slice(0, 3), ['requested', 'confirm', 'offer']);
  });
});

describe('permissions and scoping', () => {
  it('gives an unrelated driver the same 404 as for a missing booking', async () => {
    const p = client(app, 'passenger');
    await p.signIn('passenger');
    const created = await p.create(localJourney());
    const id = created.body._id;

    const other = client(app, 'driver');
    await other.signIn('drv-ellis');
    const forbidden = await other.booking(id);
    const missing = await other.booking('00000000-0000-4000-8000-000000000000');
    assert.equal(forbidden.status, 404);
    assert.equal(missing.status, 404);
    assert.deepEqual(forbidden.body, missing.body, 'forbidden and missing must be indistinguishable');
  });

  it('refuses a driver a dispatch-only action', async () => {
    const p = client(app, 'passenger');
    const v = client(app, 'driver');
    await p.signIn('passenger');
    await v.signIn('drv-ashton');
    const created = await p.create(localJourney());
    const res = await v.act(created.body._id, { action: 'confirm', version: created.body.version });
    assert.equal(res.status, 404, 'the driver cannot even read an unassigned booking');
  });

  it('refuses a driver seat creating a booking', async () => {
    const v = client(app, 'driver');
    await v.signIn('drv-ashton');
    const res = await v.create(localJourney());
    assert.equal(res.status, 403);
  });
});

describe('input validation', () => {
  it('rejects a non-synthetic contact address', async () => {
    const p = client(app, 'passenger');
    await p.signIn('passenger');
    const res = await p.create(localJourney({ contact: 'real.person@gmail.com' }));
    assert.equal(res.status, 400);
  });

  it('rejects identical pickup and destination', async () => {
    const p = client(app, 'passenger');
    await p.signIn('passenger');
    const res = await p.create(localJourney({ destination: 'station' }));
    assert.equal(res.status, 400);
  });

  it('requires flight details for an airport journey', async () => {
    const p = client(app, 'passenger');
    await p.signIn('passenger');
    const res = await p.create(localJourney({ destination: 'airport' }));
    assert.equal(res.status, 400);
    assert.match(res.body.error, /flight/i);
  });

  it('requires an idempotency key', async () => {
    const p = client(app, 'passenger');
    await p.signIn('passenger');
    const res = await p.agent
      .post('/api/bookings')
      .set({ 'X-Fleet-Seat': 'passenger', 'X-CSRF-Token': p.csrf, Origin: ORIGIN })
      .send(localJourney());
    assert.equal(res.status, 400);
  });
});

describe('real contact addresses are an explicit opt-in', () => {
  // The demo default protects real people: @example.invalid can never receive
  // mail. ALLOW_REAL_CONTACTS relaxes it for a realistic-looking demo, and the
  // reference endpoint reports which mode is active so the form can say so.
  const REAL = 'arsalkamran62@gmail.com';

  it('refuses a real address while the demo default is in force', async () => {
    process.env.ALLOW_REAL_CONTACTS = 'false';
    const p = client(app, 'passenger');
    await p.signIn('passenger');
    const res = await p.create(localJourney({ contact: REAL }));
    assert.equal(res.status, 400);
    assert.match(res.body.error, /example\.invalid/);
    assert.match(res.body.error, /ALLOW_REAL_CONTACTS/, 'the message says how to change it');
  });

  it('accepts a real address when explicitly allowed', async () => {
    process.env.ALLOW_REAL_CONTACTS = 'true';
    try {
      const p = client(app, 'passenger');
      await p.signIn('passenger');
      const res = await p.create(localJourney({ contact: REAL }));
      assert.equal(res.status, 201);
      assert.equal(res.body.input.contact, REAL);
    } finally {
      process.env.ALLOW_REAL_CONTACTS = 'false';
    }
  });

  it('still rejects a malformed address in either mode', async () => {
    const p = client(app, 'passenger');
    await p.signIn('passenger');
    for (const mode of ['false', 'true']) {
      process.env.ALLOW_REAL_CONTACTS = mode;
      const res = await p.create(localJourney({ contact: 'not-an-email' }));
      assert.equal(res.status, 400, `malformed address must fail with the flag ${mode}`);
    }
    process.env.ALLOW_REAL_CONTACTS = 'false';
  });

  it('reports the active mode to the client', async () => {
    const p = client(app, 'passenger');
    const res = await p.agent.get('/api/reference').set('X-Fleet-Seat', 'passenger');
    assert.equal(typeof res.body.allowRealContacts, 'boolean');
  });
});
