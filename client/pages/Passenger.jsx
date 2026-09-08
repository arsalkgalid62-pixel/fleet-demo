import WorkspaceIntro from '../components/WorkspaceIntro.jsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSession, usePoll } from '../lib/session.jsx';
import PlaceField from '../components/PlaceField.jsx';
import LocationPicker from '../components/LocationPicker.jsx';

import LiveTracking from '../components/LiveTracking.jsx';
import BookingAssistant from '../components/BookingAssistant.jsx';
import BookingSummary, { Journey } from '../components/BookingSummary.jsx';
import RouteMap from '../components/RouteMap.jsx';
import FlightStatus from '../components/FlightStatus.jsx';
import Icon from '../components/Icon.jsx';
import {
  Button,
  ConnectionStatus,
  EmptyState,
  ErrorNote,
  Field,
  FieldGroup,
  Panel,
  SegmentedControl,
  SimulationNotice,
  Spinner,
  StatusPill,
  Timeline,
  inputClass,
  pence,
} from '../components/ui.jsx';

const BLANK = {
  passengerName: '',
  contact: '',
  city: 'manchester',
  pickup: 'station',
  destination: 'airport',
  timing: 'scheduled',
  pickupLocal: '',
  passengers: 1,
  luggage: 1,
  accessible: false,
  instructions: '',
  paymentMethod: 'card',
  flightNumber: '',
  flightDate: '',
  meetingPoint: '',
};

/**
 * Local mirror of the demo tariff, shown only as an indication before
 * submission. Airport-ness follows the effective endpoint: a custom pin
 * overrides the slot, so a city-centre pin is not an airport transfer even if
 * the untouched slot still says 'airport'.
 */
const AIRPORT_RADIUS_KM = 3;
function nearAirport(point, city) {
  const airport = city?.places?.find((p) => p.id === 'airport');
  if (!point || !airport) return false;
  const R = 6371, rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(airport.lat - point.lat), dLng = rad(airport.lng - point.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(point.lat)) * Math.cos(rad(airport.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h))) <= AIRPORT_RADIUS_KM;
}
function airportSide(form, city, side) {
  const point = side === 'pickup' ? form.pickupPoint : form.destinationPoint;
  return point ? nearAirport(point, city) : form[side] === 'airport';
}
function estimate(form, city) {
  const airport = airportSide(form, city, 'pickup') || airportSide(form, city, 'destination');
  const base = airport ? 4500 : 1600;
  const extras = form.passengers > 4 ? 1000 : 0;
  return { base, extras, total: base + extras, airport };
}

/** Lifecycle and assignment shown to the passenger as one readable sequence. */
function timelineFor(b) {
  const order = ['requested', 'confirmed', 'assigned', 'on_the_way', 'in_progress', 'completed'];
  let stage = 'requested';
  if (b.status === 'confirmed') {
    stage = b.progress === 'unassigned' ? 'confirmed' : b.progress === 'on_the_way' || b.progress === 'arrived' ? 'on_the_way' : 'assigned';
  }
  if (b.status === 'in_progress') stage = 'in_progress';
  if (b.status === 'completed') stage = 'completed';

  const index = order.indexOf(stage);
  const steps = [
    { key: 'requested', title: 'Request received', detail: 'Awaiting review by the office' },
    { key: 'confirmed', title: 'Vehicle reserved', detail: b.vehicleId ? `Car ${b.vehicleId}` : 'A car is held for your time slot' },
    { key: 'assigned', title: 'Driver assigned', detail: b.driverId ?? 'Waiting for a driver to accept' },
    { key: 'on_the_way', title: 'Driver on the way', detail: b.progress === 'arrived' ? 'Your driver has arrived' : 'Heading to your pickup' },
    { key: 'in_progress', title: 'On the journey', detail: 'Travelling to your destination' },
    { key: 'completed', title: 'Journey complete', detail: 'Trip finished' },
  ];
  return steps.map((step, i) => ({
    ...step,
    state: i < index ? 'done' : i === index ? 'current' : 'todo',
  }));
}

export default function Passenger() {
  const { api } = useSession();
  const [reference, setReference] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [justBooked, setJustBooked] = useState(null);
  // One key per filled-in form, so a double click or a retry cannot book twice.
  const idempotencyKey = useRef(crypto.randomUUID());

  const { data, updatedAt, offline, refresh } = usePoll(() => api.state(), { intervalMs: 3000 });

  useEffect(() => {
    api.reference().then(setReference).catch(() => setReference(null));
  }, [api]);

  const bookings = data?.bookings ?? [];
  const active = useMemo(
    () => bookings.filter((b) => ['requested', 'confirmed', 'in_progress'].includes(b.status)),
    [bookings],
  );
  const selected = bookings.find((b) => b._id === selectedId) ?? active[0] ?? bookings[0] ?? null;
  const cities = reference?.cities ?? [];
  const city = cities.find((c) => c.id === form.city) ?? cities[0];
  const addresses = city?.places ?? reference?.addresses ?? [];
  const isAirport = airportSide(form, city, 'pickup') || airportSide(form, city, 'destination');
  const fare = estimate(form, city);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  /**
   * Copies an assistant draft into the form. Only keys the form already has are
   * taken, so an unexpected field cannot smuggle anything into the submission,
   * and the passenger still has to review and submit it themselves.
   */
  function applyDraft(draft) {
    const patch = Object.fromEntries(Object.entries(draft ?? {}).filter(([key]) => key in BLANK));
    set(patch);
    setError(null);
    setAssistantOpen(false);
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await api.createBooking(
        { ...form, passengers: Number(form.passengers), luggage: Number(form.luggage) },
        idempotencyKey.current,
      );
      setSelectedId(created._id);
      setJustBooked(created.reference);
      setForm(BLANK);
      idempotencyKey.current = crypto.randomUUID();
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function cancel(booking) {
    const message = `Cancel ${booking.reference}?\n\nDemo cancellation policy: free of charge at any time before the driver arrives. This policy is a demo assumption, not a company-approved rule.`;
    if (!window.confirm(message)) return;
    try {
      await api.act(booking._id, {
        action: 'cancel',
        version: booking.version,
        reason: 'Cancelled by passenger',
      });
      await refresh();
    } catch (e) {
      setError(e.message);
    }
  }

  if (!reference && !data) return <Spinner label="Loading booking options" />;


  return (
    <main className="passenger-workspace mx-auto max-w-6xl space-y-5 px-4 py-5 sm:px-6">
      <WorkspaceIntro eyebrow="Your next journey" title="A good journey starts here." description="Choose your pickup, plan your trip and follow your booking in one place." icon="route" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-ink-900">Book a car</h2>
          <p className="text-sm text-ink-500">
            Local trips and airport transfers across five sample locations.
          </p>
        </div>
        <ConnectionStatus updatedAt={updatedAt} offline={offline} onRefresh={refresh} compact />
      </div>

      {justBooked ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-panel bg-ink-900 p-4 text-white">
          <p className="flex items-center gap-2.5 text-sm">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-lime-500 text-ink-950">
              <Icon name="check" size={16} strokeWidth={2.4} />
            </span>
            <span>
              <strong className="font-semibold">{justBooked} requested.</strong>{' '}
              <span className="text-ink-200">
                The office will review it and reserve a car — it is not confirmed yet.
              </span>
            </span>
          </p>
          <button
            onClick={() => setJustBooked(null)}
            className="rounded text-xs font-semibold text-ink-300 underline underline-offset-2"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ---------------------------------------------------------- form */}
        <div className="space-y-5">
          <Panel
            title="Describe your journey"
            icon="sparkle"
            subtitle="Optional — fills the form in for you"
            action={
              <Button variant="quiet" size="sm" onClick={() => setAssistantOpen((v) => !v)} aria-expanded={assistantOpen}>
                {assistantOpen ? 'Hide' : 'Try it'}
              </Button>
            }
          >
            {assistantOpen ? (
              <BookingAssistant onApply={applyDraft} />
            ) : (
              <p className="text-sm text-ink-500">
                Type a journey in your own words and the assistant will fill the form in. It cannot
                book, price or confirm anything — you always review and submit it yourself.
              </p>
            )}
          </Panel>

          <Panel title="Journey details" icon="route" clip={false}>
            <form onSubmit={submit} className="space-y-6">
              <FieldGroup title="01 · Where and when" icon="pin">
                <Field label="City" hint="sets the sample places and the service area" htmlFor="city" required>
                  <select
                    id="city"
                    className={inputClass}
                    value={form.city}
                    onChange={(e) =>
                      // Pins and places belong to the old city, so clear them.
                      set({ city: e.target.value, pickupPoint: undefined, destinationPoint: undefined })
                    }
                  >
                    {cities.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} — {c.region}
                      </option>
                    ))}
                  </select>
                </Field>

                <PlaceField
                  label="Pickup"
                  icon="pin"
                  city={city}
                  slot={form.pickup}
                  point={form.pickupPoint}
                  exclude={form.pickupPoint ? undefined : form.destination}
                  onChange={({ slot, point }) =>
                    set({ pickup: slot ?? form.pickup, pickupPoint: point })
                  }
                />
                <PlaceField
                  label="Destination"
                  icon="flag"
                  city={city}
                  slot={form.destination}
                  point={form.destinationPoint}
                  exclude={form.destinationPoint ? undefined : form.pickup}
                  onChange={({ slot, point }) =>
                    set({ destination: slot ?? form.destination, destinationPoint: point })
                  }
                />
                <p className="text-xs text-ink-400">
                  Start typing to search real {city?.name ?? 'UK'} addresses, or pick one of the
                  suggested landmarks. A searched address makes this a custom journey, which dispatch
                  can confirm once a road estimate is available.
                </p>

                {/* Secondary path: map, device GPS and manual coordinates. Kept
                    out of the way now that typing is the primary interaction. */}
                <details className="rounded-lg border border-ink-100">
                  <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-ink-600">
                    Or set a point on the map, by GPS, or by coordinates
                  </summary>
                  <div className="space-y-3 border-t border-ink-100 p-3">
                    <LocationPicker title="Pickup" city={city} value={form.pickupPoint} onChange={(pickupPoint) => set({ pickupPoint })} />
                    <LocationPicker title="Destination" city={city} value={form.destinationPoint} onChange={(destinationPoint) => set({ destinationPoint })} />
                  </div>
                </details>

                <Field label="When" required>
                  <SegmentedControl
                    name="When"
                    value={form.timing}
                    onChange={(timing) => set({ timing })}
                    options={[
                      { value: 'now', label: 'As soon as possible', icon: 'clock' },
                      { value: 'scheduled', label: 'At a specific time', icon: 'calendar' },
                    ]}
                  />
                </Field>

                {form.timing === 'scheduled' ? (
                  <Field label="Pickup time" hint="UK time" htmlFor="pickupLocal" required>
                    <input
                      id="pickupLocal"
                      className={inputClass}
                      required
                      type="datetime-local"
                      value={form.pickupLocal}
                      onChange={(e) => set({ pickupLocal: e.target.value.slice(0, 16) })}
                    />
                  </Field>
                ) : null}
              </FieldGroup>

              <FieldGroup title="02 · Who is travelling" icon="users">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Passengers" htmlFor="passengers" required>
                    <input
                      id="passengers"
                      className={inputClass}
                      required
                      type="number"
                      min={1}
                      max={6}
                      value={form.passengers}
                      onChange={(e) => set({ passengers: Number(e.target.value) })}
                    />
                  </Field>
                  <Field label="Bags" htmlFor="luggage" required>
                    <input
                      id="luggage"
                      className={inputClass}
                      required
                      type="number"
                      min={0}
                      max={6}
                      value={form.luggage}
                      onChange={(e) => set({ luggage: Number(e.target.value) })}
                    />
                  </Field>
                </div>

                <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-ink-200 bg-white px-3 py-2.5 text-sm font-medium text-ink-800 hover:border-ink-400">
                  <input
                    type="checkbox"
                    className="size-4 rounded accent-ink-900"
                    checked={form.accessible}
                    onChange={(e) => set({ accessible: e.target.checked })}
                  />
                  <Icon name="accessible" size={16} className="text-ink-400" />
                  I need a wheelchair-accessible vehicle
                </label>
              </FieldGroup>

              {isAirport ? (
                <FieldGroup title="Flight details" icon="plane">
                  <div className="grid gap-4 rounded-panel bg-status-live-bg p-3 ring-1 ring-inset ring-status-live/15 sm:grid-cols-2">
                    <Field label="Flight number" htmlFor="flightNumber" required>
                      <input
                        id="flightNumber"
                        className={inputClass}
                        required
                        placeholder="DM1234"
                        value={form.flightNumber}
                        onChange={(e) => set({ flightNumber: e.target.value })}
                      />
                    </Field>
                    <Field label="Flight date" htmlFor="flightDate" required>
                      <input
                        id="flightDate"
                        className={inputClass}
                        required
                        type="date"
                        value={form.flightDate}
                        onChange={(e) => set({ flightDate: e.target.value })}
                      />
                    </Field>
                    <div className="sm:col-span-2">
                      <Field label="Meeting point" htmlFor="meetingPoint" required>
                        <input
                          id="meetingPoint"
                          className={inputClass}
                          required
                          placeholder="Terminal 2 arrivals"
                          value={form.meetingPoint}
                          onChange={(e) => set({ meetingPoint: e.target.value })}
                        />
                      </Field>
                    </div>
                    <p className="text-xs text-ink-600 sm:col-span-2">
                      {reference?.providers?.flightStatus
                        ? 'Live flight status is checked against AviationStack once the booking exists. The dispatcher’s flight-delay control stays simulated.'
                        : 'No flight data provider is configured, so flight status is simulated.'}
                    </p>
                  </div>
                </FieldGroup>
              ) : null}

              <FieldGroup title="03 · Contact and payment" icon="card">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Your name" htmlFor="passengerName" required>
                    <input
                      id="passengerName"
                      className={inputClass}
                      required
                      minLength={2}
                      autoComplete="name"
                      value={form.passengerName}
                      onChange={(e) => set({ passengerName: e.target.value })}
                    />
                  </Field>
                  <Field
                    label="Contact"
                    hint={reference?.allowRealContacts ? 'a real email address' : 'synthetic @example.invalid only'}
                    htmlFor="contact"
                    required
                  >
                    <input
                      id="contact"
                      className={inputClass}
                      required
                      type="email"
                      placeholder={reference?.allowRealContacts ? 'name@example.com' : 'you@example.invalid'}
                      value={form.contact}
                      onChange={(e) => set({ contact: e.target.value })}
                    />
                  </Field>
                </div>

                <Field label="Payment method" required>
                  <SegmentedControl
                    name="Payment method"
                    value={form.paymentMethod}
                    onChange={(paymentMethod) => set({ paymentMethod })}
                    options={[
                      { value: 'card', label: 'Card', icon: 'card' },
                      { value: 'cash', label: 'Cash', icon: 'cash' },
                    ]}
                  />
                </Field>

                <Field label="Pickup instructions" hint="optional" htmlFor="instructions">
                  <textarea
                    id="instructions"
                    className={inputClass}
                    rows={2}
                    maxLength={500}
                    placeholder="Anything the driver should know"
                    value={form.instructions}
                    onChange={(e) => set({ instructions: e.target.value })}
                  />
                </Field>
              </FieldGroup>

              {/* Review: what is being asked for, and what it would cost. */}
              <div className="rounded-panel border border-ink-200 bg-canvas-sunk p-4">
                <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.1em] text-ink-500">
                  Review
                </p>
                <Journey
                  from={form.pickupPoint?.label ?? addresses.find((a) => a.id === form.pickup)?.label ?? '—'}
                  to={form.destinationPoint?.label ?? addresses.find((a) => a.id === form.destination)?.label ?? '—'}
                />
                <dl className="mt-4 space-y-1.5 border-t border-ink-200 pt-3 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-600">
                      {fare.airport ? 'Airport transfer (fixed)' : 'Local journey (estimate)'}
                    </dt>
                    <dd className="tabular font-medium text-ink-900">{pence(fare.base)}</dd>
                  </div>
                  {fare.extras ? (
                    <div className="flex justify-between gap-3">
                      <dt className="text-ink-600">Large party supplement (5+)</dt>
                      <dd className="tabular font-medium text-ink-900">{pence(fare.extras)}</dd>
                    </div>
                  ) : null}
                  <div className="flex justify-between gap-3 border-t border-ink-200 pt-2 text-base font-bold text-ink-900">
                    <dt>Indicative total</dt>
                    <dd className="tabular">{pence(fare.total)}</dd>
                  </div>
                </dl>
                <SimulationNotice className="mt-3">
                  demo fare assumptions, not a company-approved tariff and not a taxi meter. The
                  server recalculates and stores the binding quote when the booking is created.
                </SimulationNotice>
              </div>

              <ErrorNote onDismiss={() => setError(null)}>{error}</ErrorNote>

              <div>
                <Button type="submit" loading={busy} size="lg" className="w-full">
                  {busy ? 'Submitting' : 'Request this journey'}
                </Button>
                <p className="mt-2 text-center text-xs text-ink-500">
                  Saved as <strong className="font-semibold">awaiting review</strong>. Not confirmed
                  until the office reserves a vehicle.
                </p>
              </div>
            </form>
          </Panel>
        </div>

        {/* ------------------------------------------------------- tracking */}
        <div className="space-y-5 lg:sticky lg:top-16 lg:self-start">
          {selected ? (
            <Panel
              title={`Your journey · ${selected.reference}`}
              icon="car"
              action={
                ['requested', 'confirmed'].includes(selected.status) ? (
                  <Button variant="danger" size="sm" icon="x" onClick={() => cancel(selected)}>
                    Cancel
                  </Button>
                ) : null
              }
            >
              <div className="space-y-5">
                {['requested', 'confirmed', 'in_progress', 'completed'].includes(selected.status) ? (
                  <Timeline steps={timelineFor(selected)} />
                ) : (
                  <div className="flex items-center gap-2">
                    <StatusPill value={selected.status} />
                    <span className="text-sm text-ink-500">This journey is closed.</span>
                  </div>
                )}

                {selected.driverId || selected.vehicleId ? (
                  <div className="flex flex-wrap gap-x-6 gap-y-2 rounded-panel bg-canvas-sunk px-3 py-2.5 text-sm">
                    <span className="flex items-center gap-1.5">
                      <Icon name="steering" size={15} className="text-ink-400" />
                      <span className="text-ink-500">Driver</span>
                      <strong className="font-semibold text-ink-900">
                        {selected.driverId ?? 'not yet assigned'}
                      </strong>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Icon name="car" size={15} className="text-ink-400" />
                      <span className="text-ink-500">Vehicle</span>
                      <strong className="font-semibold text-ink-900">
                        {selected.vehicleId ?? 'not yet reserved'}
                      </strong>
                    </span>
                  </div>
                ) : null}

                <BookingSummary booking={selected} showContact={false} />
                {selected.input.pickup === 'airport' || selected.input.destination === 'airport' ? (
                  <FlightStatus
                    api={api}
                    bookingId={selected._id}
                    flightNumber={selected.input.flightNumber}
                  />
                ) : null}
                <LiveTracking booking={selected}/>
                <RouteMap
                  simulation={selected.simulation}
                  fromLabel={selected.fromLabel}
                  toLabel={selected.toLabel}
                />
              </div>
            </Panel>
          ) : (
            <Panel title="Your journey" icon="car">
              <EmptyState title="No journeys yet" icon="route">
                Request a journey and it will appear here with its live status.
              </EmptyState>
            </Panel>
          )}

          <Panel title={`Booking history (${bookings.length})`} icon="history" bodyClass="p-2">
            {bookings.length === 0 ? (
              <div className="p-2">
                <EmptyState title="Nothing booked" icon="history">
                  Your booking history will appear here.
                </EmptyState>
              </div>
            ) : (
              <ul className="space-y-1">
                {bookings.map((b) => (
                  <li key={b._id}>
                    <button
                      onClick={() => setSelectedId(b._id)}
                      aria-current={b._id === selected?._id ? 'true' : undefined}
                      className={`flex w-full items-center justify-between gap-3 rounded-lg border p-2.5 text-left transition-colors ${
                        b._id === selected?._id
                          ? 'border-ink-900 bg-ink-50'
                          : 'border-transparent hover:border-ink-200 hover:bg-ink-50/60'
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-ink-900">
                          {b.fromLabel} → {b.toLabel}
                        </span>
                        <span className="block truncate font-mono text-[11px] text-ink-400">
                          {b.reference} · {b.pickupLocalText}
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <StatusPill value={b.status} size="sm" />
                        <span className="tabular text-xs font-semibold text-ink-600">
                          {pence(b.fare.finalAmount ?? b.fare.amount)}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </main>
  );
}
