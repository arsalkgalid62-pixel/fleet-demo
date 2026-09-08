import WorkspaceIntro from '../components/WorkspaceIntro.jsx';
import { useEffect, useState } from 'react';
import { useSession, usePoll } from '../lib/session.jsx';
import { Journey } from '../components/BookingSummary.jsx';
import RouteMap from '../components/RouteMap.jsx';
import LiveTracking from '../components/LiveTracking.jsx';
import Icon from '../components/Icon.jsx';
import {
  Button,
  ConnectionStatus,
  CountdownBar,
  EmptyState,
  ErrorNote,
  Panel,
  SegmentedControl,
  SimulationNotice,
  Spinner,
  StatusPill,
  label,
  pence,
} from '../components/ui.jsx';

const NEXT_STEP = {
  accepted: { action: 'on_the_way', text: 'Start driving to pickup', icon: 'car' },
  on_the_way: { action: 'arrived', text: 'I have arrived', icon: 'pin' },
  arrived: { action: 'start', text: 'Passenger on board — start trip', icon: 'play' },
};

const CACHE_KEY = 'fleet-demo.driver.lastJob';

export default function Driver() {
  const { api, user } = useSession();
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [cached, setCached] = useState(null);

  const { data, updatedAt, offline, refresh } = usePoll(() => api.state(), { intervalMs: 3000 });

  const bookings = data?.bookings ?? [];
  const driver = data?.fleet?.drivers?.[0] ?? null;
  const offer = bookings.find((b) => b.progress === 'offered');
  const current = bookings.find(
    (b) => b.status === 'in_progress' || ['accepted', 'on_the_way', 'arrived'].includes(b.progress),
  );
  const upcoming = bookings.filter((b) => b.status === 'confirmed' && b !== current && b !== offer);
  const done = bookings.filter((b) => b.status === 'completed');
  const earnings = done.reduce((sum, b) => sum + (b.fare.finalAmount ?? b.fare.amount), 0);
  const unpaid = done.filter((b) => b.paymentStatus !== 'paid');

  // Keep the last known job on the device so the screen still says something
  // useful if the network drops mid-shift. It is a read-only cache: the server
  // remains the only source of truth and is re-read on reconnect.
  useEffect(() => {
    if (current) {
      const snapshot = {
        reference: current.reference,
        fromLabel: current.fromLabel,
        toLabel: current.toLabel,
        progress: current.progress,
        savedAt: Date.now(),
      };
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(snapshot));
      } catch {
        /* storage may be unavailable; the cache is optional */
      }
      setCached(snapshot);
    }
  }, [current]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) setCached(JSON.parse(raw));
    } catch {
      /* ignore unreadable cache */
    }
  }, []);

  async function run(booking, action, extra = {}) {
    setBusy(true);
    setError(null);
    try {
      await api.act(booking._id, { action, version: booking.version, ...extra });
      await refresh();
    } catch (e) {
      // A dispatcher may have cancelled or reassigned while this screen was
      // stale. Re-read rather than pushing local state over the server.
      setError(e.message);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function changeDuty(duty) {
    setBusy(true);
    setError(null);
    try {
      await api.setDuty(duty);
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <Spinner label="Loading your shift" />;

  const next = current ? NEXT_STEP[current.progress] : null;

  return (
    <main className="driver-workspace mx-auto max-w-2xl space-y-4 px-4 py-4">
      <WorkspaceIntro eyebrow="Driver workspace" title={current ? "Let’s keep you moving." : "Ready for the road."} description={current ? "Your current journey and next action, all in one place." : "Set your availability below. Your next offer will appear here."} icon="steering" />
      <div className="flex items-center justify-between gap-3">
        <ConnectionStatus updatedAt={updatedAt} offline={offline} onRefresh={refresh} compact />
      </div>

      {offline && cached ? (
        <div className="rounded-panel bg-status-wait-bg p-3 ring-1 ring-inset ring-status-wait/25">
          <p className="flex items-center gap-2 text-sm font-bold text-status-wait">
            <Icon name="wifiOff" size={16} />
            Offline — showing your last known job
          </p>
          <p className="mt-1.5 font-mono text-xs text-ink-700">
            {cached.reference} · {cached.fromLabel} → {cached.toLabel} · {label(cached.progress)}
          </p>
          <p className="mt-1.5 text-xs text-ink-600">
            Saved{' '}
            {new Date(cached.savedAt).toLocaleTimeString('en-GB', { timeZone: 'Europe/London' })}.
            <strong className="font-semibold"> Status changes are not queued while offline</strong> —
            reconnect before acting. There is no offline navigation in this demo.
          </p>
        </div>
      ) : null}

      <ErrorNote onDismiss={() => setError(null)}>{error}</ErrorNote>

      {/* ------------------------------------------------------------ shift */}
      <Panel title="Your shift" icon="steering">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-base font-bold text-ink-900">{user.name}</p>
            <p className="flex items-center gap-1.5 text-sm text-ink-500">
              <Icon name="car" size={14} className="text-ink-400" />
              {driver?.vehicleId ? `Car ${driver.vehicleId}` : 'No car allocated'}
            </p>
          </div>
          <StatusPill value={driver?.duty ?? 'unknown'} />
        </div>

        <SegmentedControl
          name="Duty state"
          className="mt-4"
          value={driver?.duty ?? ''}
          onChange={changeDuty}
          options={[
            { value: 'available', label: 'Available', icon: 'check', disabled: busy || !driver?.vehicleId },
            { value: 'break', label: 'On break', icon: 'pause', disabled: busy },
            { value: 'off_duty', label: 'Off duty', icon: 'logout', disabled: busy },
          ]}
        />

        {!driver?.vehicleId ? (
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-600">
            <Icon name="info" size={14} className="mt-px text-ink-400" />
            You have no vehicle allocated, so you cannot go on duty or accept work. Four cars are
            shared between five drivers.
          </p>
        ) : null}
      </Panel>

      {/* ------------------------------------------------------------ offer */}
      {offer ? (
        <section className="on-dark overflow-hidden rounded-panel bg-ink-900 text-white">
          <header className="flex items-center gap-2 border-b border-ink-700 px-4 py-3">
            <span className="flex size-6 items-center justify-center rounded-full bg-lime-500 text-ink-950">
              <Icon name="bell" size={14} />
            </span>
            <h2 className="text-[13px] font-bold uppercase tracking-[0.08em] text-lime-400">
              New job offer
            </h2>
          </header>

          <div className="space-y-4 p-4">
            <div className="rounded-panel bg-ink-800 p-3">
              <JourneyDark from={offer.fromLabel} to={offer.toLabel} />
            </div>

            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink-200">
              <span className="flex items-center gap-1.5">
                <Icon name="clock" size={15} className="text-ink-300" />
                {offer.pickupLocalText}
              </span>
              <span className="flex items-center gap-1.5">
                <Icon name="users" size={15} className="text-ink-300" />
                {offer.input.passengers} · {offer.input.luggage} bags
              </span>
              <span className="tabular flex items-center gap-1.5 font-bold text-lime-400">
                {pence(offer.fare.finalAmount ?? offer.fare.amount)}
              </span>
            </div>

            {offer.input.instructions ? (
              <p className="rounded-lg bg-ink-800 px-3 py-2 text-sm text-ink-100">
                {offer.input.instructions}
              </p>
            ) : null}

            {offer.offerExpiresInMs !== null ? (
              <div className="rounded-lg bg-ink-800 p-3">
                <CountdownBar remainingMs={offer.offerExpiresInMs} />
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="accent"
                size="lg"
                icon="check"
                loading={busy}
                className="touch-target"
                onClick={() => run(offer, 'accept')}
              >
                Accept
              </Button>
              <Button
                variant="secondary"
                size="lg"
                icon="x"
                disabled={busy}
                className="touch-target"
                onClick={() => run(offer, 'decline')}
              >
                Decline
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      {/* ----------------------------------------------------- current job */}
      {current ? (
        <Panel
          title="Current job"
          icon="car"
          action={<StatusPill value={current.progress} />}
          subtitle={current.reference}
        >
          <div className="space-y-4">
            <div className="rounded-panel bg-canvas-sunk p-4">
              <Journey from={current.fromLabel} to={current.toLabel} size="lg" />
            </div>

            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink-700">
              <span className="flex items-center gap-1.5">
                <Icon name="clock" size={15} className="text-ink-400" />
                {current.pickupLocalText}
              </span>
              <span className="flex items-center gap-1.5">
                <Icon name="users" size={15} className="text-ink-400" />
                {current.input.passengers} passengers · {current.input.luggage} bags
              </span>
              {current.input.accessible ? (
                <span className="flex items-center gap-1.5 font-semibold text-ink-900">
                  <Icon name="accessible" size={15} className="text-ink-400" />
                  Accessible
                </span>
              ) : null}
            </div>

            {current.input.instructions ? (
              <p className="rounded-lg bg-ink-50 px-3 py-2 text-sm text-ink-900 ring-1 ring-inset ring-ink-100">
                <span className="font-semibold">Instructions: </span>
                {current.input.instructions}
              </p>
            ) : null}

            {current.input.pickup === 'airport' || current.input.destination === 'airport' ? (
              <p className="rounded-lg bg-status-live-bg px-3 py-2 text-sm text-ink-800 ring-1 ring-inset ring-status-live/20">
                <span className="flex items-center gap-1.5 font-bold text-status-live">
                  <Icon name="plane" size={14} />
                  Airport transfer
                </span>
                Flight {current.input.flightNumber || '—'} · meet at{' '}
                {current.input.meetingPoint || '—'}
              </p>
            ) : null}

            <LiveTracking booking={current}/>
            <RouteMap
              simulation={current.simulation}
              fromLabel={current.fromLabel}
              toLabel={current.toLabel}
            />

            {next && current.status === 'confirmed' ? (
              <Button
                size="lg"
                icon={next.icon}
                loading={busy}
                className="w-full touch-target"
                onClick={() => run(current, next.action)}
              >
                {next.text}
              </Button>
            ) : null}

            {current.status === 'in_progress' ? (
              <Button
                size="lg"
                icon="flag"
                loading={busy}
                className="w-full touch-target"
                onClick={() => {
                  if (window.confirm('Complete this journey? This records the trip as finished.')) {
                    run(current, 'complete');
                  }
                }}
              >
                Complete journey
              </Button>
            ) : null}
          </div>
        </Panel>
      ) : (
        <Panel title="Current job" icon="car">
          <EmptyState title="No active job" icon="clock">
            {driver?.duty === 'available'
              ? 'You are on duty. Offers appear here when dispatch sends you one.'
              : 'Go available to start receiving job offers.'}
          </EmptyState>
        </Panel>
      )}

      {/* -------------------------------------------------------- upcoming */}
      <Panel title={`Upcoming (${upcoming.length})`} icon="calendar" bodyClass="p-2">
        {upcoming.length === 0 ? (
          <div className="p-2">
            <EmptyState title="Nothing scheduled" icon="calendar" />
          </div>
        ) : (
          <ul className="space-y-1">
            {upcoming.map((b) => (
              <li key={b._id} className="rounded-lg border border-ink-100 p-3">
                <p className="text-sm font-semibold text-ink-900">
                  {b.fromLabel} → {b.toLabel}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-3 font-mono text-[11px] text-ink-400">
                  <span>{b.reference}</span>
                  <span>{b.pickupLocalText}</span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* -------------------------------------------------------- earnings */}
      <Panel title="Earnings" icon="cash">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="tabular text-3xl font-bold leading-none text-ink-900">{pence(earnings)}</p>
            <p className="mt-1.5 text-sm text-ink-600">
              Across {done.length} completed journey{done.length === 1 ? '' : 's'}
            </p>
          </div>
          {unpaid.length > 0 ? (
            <div className="text-right">
              <StatusPill value="outstanding" />
              <p className="mt-1 text-xs text-ink-500">
                {unpaid.length} journey{unpaid.length === 1 ? '' : 's'} not yet marked paid
              </p>
            </div>
          ) : null}
        </div>
        <SimulationNotice className="mt-3">
          sample figures from demo fares. Not a settlement statement — driver settlement rules have
          not been agreed, and completing a trip does not mean it has been paid.
        </SimulationNotice>
      </Panel>

      <Panel title="Contact the office" icon="alert">
        <p className="flex items-start gap-2 text-sm text-ink-600">
          <Icon name="info" size={15} className="mt-0.5 text-ink-400" />
          No telephone or messaging service is connected in this demo, so there is nothing to call.
          In a real deployment this is where the office number would sit.
        </p>
      </Panel>
    </main>
  );
}

/** Journey block for dark surfaces, where the light-surface colours would fail. */
function JourneyDark({ from, to }) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center pt-1.5">
        <span className="size-2.5 rounded-full border-2 border-lime-400" aria-hidden />
        <span className="my-1 w-px flex-1 bg-ink-600" aria-hidden />
        <span className="size-2.5 rounded-full bg-lime-400" aria-hidden />
      </div>
      <div className="min-w-0 flex-1 space-y-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-300">Pickup</p>
          <p className="text-base font-semibold leading-snug text-white">{from}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-300">Destination</p>
          <p className="text-base font-semibold leading-snug text-white">{to}</p>
        </div>
      </div>
    </div>
  );
}
