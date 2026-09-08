/**
 * Synthetic demo dataset and the seeding routine shared by the CLI and tests.
 *
 * Every person, vehicle and journey here is fictional. Contact addresses use
 * the reserved .invalid TLD so no message could ever reach a real recipient.
 */
import mongoose from 'mongoose';
import { DateTime } from 'luxon';
import { randomUUID } from 'node:crypto';
import { Booking, Driver, Event, Notification, Operation, Payment, User, Vehicle } from './db.js';
import { hashPassword } from './auth.js';
import { pickupTime, quote } from './service.js';
import type { BookingInput } from '../shared/domain.js';

export const DEMO_PASSWORD = 'demo-fleet-2026';

export const VEHICLES = [
  { _id: 'FD-01', label: 'Saloon 1', plate: 'DE01 MOA', seats: 4, luggage: 2, accessible: false },
  { _id: 'FD-02', label: 'Saloon 2', plate: 'DE02 MOB', seats: 4, luggage: 2, accessible: false },
  { _id: 'FD-03', label: 'Estate 1', plate: 'DE03 MOC', seats: 4, luggage: 4, accessible: false },
  { _id: 'FD-04', label: 'Accessible MPV', plate: 'DE04 MOD', seats: 6, luggage: 4, accessible: true },
] as const;

// Five drivers share four cars: the fifth is the relief driver with no car allocated.
export const DRIVERS = [
  { _id: 'drv-ashton', name: 'A. Ashton', vehicleId: 'FD-01', duty: 'available' },
  { _id: 'drv-baker', name: 'B. Baker', vehicleId: 'FD-02', duty: 'available' },
  { _id: 'drv-choudhury', name: 'C. Choudhury', vehicleId: 'FD-03', duty: 'available' },
  { _id: 'drv-doyle', name: 'D. Doyle', vehicleId: 'FD-04', duty: 'available' },
  { _id: 'drv-ellis', name: 'E. Ellis', vehicleId: undefined, duty: 'off_duty' },
] as const;

const soon = (opts: object) =>
  DateTime.now().setZone('Europe/London').plus(opts).startOf('hour').toFormat("yyyy-MM-dd'T'HH:mm");

export const SAMPLE_JOURNEYS: BookingInput[] = [
  {
    passengerName: 'Sample Passenger One', contact: 'sample.one@example.invalid',
    pickup: 'station', destination: 'business', timing: 'scheduled', pickupLocal: soon({ hours: 3 }),
    passengers: 2, luggage: 1, accessible: false, instructions: 'Demo sample journey. Meet at the taxi rank.',
    city: 'manchester', paymentMethod: 'card', flightNumber: '', flightDate: '', meetingPoint: '',
  },
  {
    passengerName: 'Sample Passenger Two', contact: 'sample.two@example.invalid',
    pickup: 'hotel', destination: 'airport', timing: 'scheduled', pickupLocal: soon({ days: 1, hours: 2 }),
    passengers: 3, luggage: 3, accessible: false, instructions: 'Demo airport transfer sample.',
    city: 'manchester', paymentMethod: 'card', flightNumber: 'DM1234',
    flightDate: DateTime.now().setZone('Europe/London').plus({ days: 1 }).toFormat('yyyy-MM-dd'),
    meetingPoint: 'Terminal 2 arrivals, demo meeting point',
  },
];

/**
 * Refuses to run against anything that is not an explicitly marked demo
 * database, so a stray environment variable cannot wipe real data.
 */
export function assertDemoTarget(dbName: string) {
  if (process.env.DEMO_MODE !== 'true') {
    throw new Error('Refusing to seed: DEMO_MODE must be exactly "true".');
  }
  if (!/^fleet_demo/.test(dbName)) {
    throw new Error(`Refusing to seed: database "${dbName}" is not named fleet_demo*.`);
  }
}

export async function clearDemoData() {
  await Booking.deleteMany({});
  await Driver.deleteMany({});
  await Event.deleteMany({});
  await Notification.deleteMany({});
  await Operation.deleteMany({});
  await Payment.deleteMany({});
  await User.deleteMany({});
  await Vehicle.deleteMany({});
  await mongoose.connection.db!.collection('sessions').deleteMany({});
}

export async function seedDemo({ reset = false, withJourneys = true } = {}) {
  assertDemoTarget(mongoose.connection.db!.databaseName);
  if (reset) await clearDemoData();

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  for (const v of VEHICLES) await Vehicle.updateOne({ _id: v._id }, { $set: v }, { upsert: true });
  for (const d of DRIVERS) await Driver.updateOne({ _id: d._id }, { $set: d }, { upsert: true });

  const users = [
    { _id: 'passenger', name: 'Demo Passenger', role: 'passenger' as const, passwordHash },
    { _id: 'dispatch', name: 'Demo Dispatcher', role: 'dispatch' as const, passwordHash },
    ...DRIVERS.map((d) => ({ _id: d._id, name: d.name, role: 'driver' as const, passwordHash, driverId: d._id })),
  ];
  for (const u of users) await User.updateOne({ _id: u._id }, { $set: u }, { upsert: true });

  let journeys = 0;
  if (withJourneys && (await Booking.countDocuments()) === 0) {
    for (const input of SAMPLE_JOURNEYS) {
      const id = randomUUID();
      const pickupAt = pickupTime(input);
      const fare = quote(input);
      await Booking.create({
        _id: id, reference: `FD-${id.slice(0, 8).toUpperCase()}`, owner: 'passenger', input, pickupAt,
        reservedStart: new Date(+pickupAt - 15 * 60000),
        endAt: new Date(+pickupAt + (fare.estimatedMinutes + 15) * 60000),
        fare,
      });
      await Event.create({ _id: randomUUID(), bookingId: id, actor: 'seed', type: 'requested', details: { note: 'Seeded sample journey' } });
      journeys++;
    }
  }
  return { vehicles: VEHICLES.length, drivers: DRIVERS.length, users: users.length, journeys };
}
