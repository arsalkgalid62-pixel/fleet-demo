import { DateTime } from 'luxon';
import { Booking, Driver, Vehicle } from './db.js';
import { addresses } from '../shared/domain.js';
import { endpoint } from './geo.js';
import { canRead, present, type Actor } from './service.js';

const SIM_SECONDS = 120;
const point = (id: string) => addresses.find((a) => a.id === id)!;

/**
 * Derives the simulated vehicle position from server-stored simulation state so
 * passenger, dispatch and driver views always agree. This is a schematic
 * interpolation between two demo coordinates, not a real GPS fix or road route.
 */
export function simulationView(b: any) {
  const sim = b.simulation ?? { running: false, elapsed: 0, since: null };
  const drift = sim.running && sim.since ? (Date.now() - Date.parse(sim.since)) / 1000 : 0;
  const elapsed = Math.min(SIM_SECONDS, (sim.elapsed ?? 0) + drift);
  const fraction = elapsed / SIM_SECONDS;
  const from = endpoint(b.input,'pickup');
  const to = endpoint(b.input,'destination');
  return {
    label: 'Simulated vehicle location',
    running: !!sim.running,
    fraction,
    elapsed,
    totalSeconds: SIM_SECONDS,
    lat: from.lat + (to.lat - from.lat) * fraction,
    lng: from.lng + (to.lng - from.lng) * fraction,
    updatedAt: new Date().toISOString(),
  };
}

/** Adds display-only fields. All authority stays with the stored document. */
export function decorate(actor: Actor, b: any) {
  const value = present(actor, b);
  const showSim =
    ['confirmed', 'in_progress'].includes(b.status) ||
    (actor.role !== 'passenger' && b.status === 'completed');
  return {
    ...value,
    pickupLocalText: DateTime.fromJSDate(b.pickupAt, { zone: 'Europe/London' }).toFormat(
      "cccc d LLLL yyyy 'at' HH:mm ZZZZ",
    ),
    fromLabel: endpoint(b.input,'pickup').label,
    toLabel: endpoint(b.input,'destination').label,
    fromPoint:endpoint(b.input,'pickup'),toPoint:endpoint(b.input,'destination'),
    offerExpiresInMs: b.offerExpires ? Math.max(0, +b.offerExpires - Date.now()) : null,
    simulation: showSim ? simulationView(b) : null,
  };
}

/** Role-scoped booking list. Passengers and drivers never receive other people's jobs. */
export async function listBookings(actor: Actor) {
  const filter =
    actor.role === 'dispatch'
      ? {}
      : actor.role === 'passenger'
        ? { owner: actor.id }
        : { driverId: actor.driverId };
  const rows = await Booking.find(filter).sort({ pickupAt: 1 }).limit(200);
  return rows.filter((b) => canRead(actor, b)).map((b) => decorate(actor, b));
}

/** Fleet view for staff and drivers. Passengers never see other vehicles. */
export async function fleetState(actor: Actor) {
  if (actor.role === 'passenger') return null;
  const [vehicles, drivers, active] = await Promise.all([
    Vehicle.find().sort({ _id: 1 }).lean(),
    Driver.find().sort({ _id: 1 }).lean(),
    Booking.find({ status: { $in: ['confirmed', 'in_progress'] } })
      .sort({ pickupAt: 1 })
      .lean(),
  ]);
  const visible = actor.role === 'dispatch' ? drivers : drivers.filter((d) => d._id === actor.driverId);
  return {
    vehicles: vehicles.map((v) => {
      const jobs = active.filter((b) => b.vehicleId === v._id);
      const current = jobs.find((b) => b.status === 'in_progress' || b.progress !== 'unassigned');
      return {
        ...v,
        driver: drivers.find((d) => d.vehicleId === v._id)?.name ?? null,
        currentJob: current ? { reference: current.reference, status: current.status, progress: current.progress } : null,
        nextCommitment: jobs.find((b) => b._id !== current?._id)?.reference ?? null,
      };
    }),
    drivers: visible,
  };
}
