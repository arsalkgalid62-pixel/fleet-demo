import WorkspaceIntro from '../components/WorkspaceIntro.jsx';
import { useEffect, useMemo, useState } from 'react';
import { useSession, usePoll } from '../lib/session.jsx';
import BookingSummary from '../components/BookingSummary.jsx';
import NotificationPreviews from '../components/NotificationPreviews.jsx';
import RouteMap from '../components/RouteMap.jsx';
import LiveTracking from '../components/LiveTracking.jsx';
import FlightStatus from '../components/FlightStatus.jsx';
import Icon from '../components/Icon.jsx';
import {
  Button,
  ConnectionStatus,
  EmptyState,
  ErrorNote,
  Metric,
  Panel,
  SegmentedControl,
  SimulationNotice,
  Spinner,
  StatusPill,
  inputClass,
  label,
  pence,
} from '../components/ui.jsx';

const QUEUES = [
  { id: 'requested', name: 'Awaiting', match: (b) => b.status === 'requested' },
  {
    id: 'unassigned',
    name: 'Unassigned',
    match: (b) => b.status === 'confirmed' && b.progress === 'unassigned',
  },
  { id: 'offered', name: 'Offered', match: (b) => b.progress === 'offered' },
  {
    id: 'assigned',
    name: 'Assigned',
    match: (b) =>
      b.status === 'confirmed' && ['accepted', 'on_the_way', 'arrived'].includes(b.progress),
  },
  { id: 'active', name: 'Active', match: (b) => b.status === 'in_progress' },
  {
    id: 'closed',
    name: 'Closed',
    match: (b) => ['completed', 'cancelled', 'no_show'].includes(b.status),
  },
];

export default function Dispatch() {
  const { api } = useSession();
  const [queue, setQueue] = useState('requested');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const { data, updatedAt, offline, refresh } = usePoll(() => api.state(), { intervalMs: 3000 });

  const bookings = data?.bookings ?? [];
  const fleet = data?.fleet;

  const counts = useMemo(
    () => Object.fromEntries(QUEUES.map((q) => [q.id, bookings.filter(q.match).length])),
    [bookings],
  );

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    const matcher = QUEUES.find((q) => q.id === queue)?.match ?? (() => true);
    return bookings.filter((b) => {
      if (term) {
        const haystack =
          `${b.reference} ${b.input.passengerName} ${b.fromLabel} ${b.toLabel}`.toLowerCase();
        return haystack.includes(term);
      }
      return matcher(b);
    });
  }, [bookings, queue, search]);

  const selected = bookings.find((b) => b._id === selectedId) ?? null;

  // Keep a sensible selection as the queue changes underneath.
  useEffect(() => {
    if (!selectedId && visible.length) setSelectedId(visible[0]._id);
  }, [selectedId, visible]);

  async function run(booking, action, extra = {}) {
    setBusy(true);
    setError(null);
    try {
      await api.act(booking._id, { action, version: booking.version, ...extra });
      await refresh();
    } catch (e) {
      setError(e.message);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  function withReason(booking, action, prompt) {
    const reason = window.prompt(prompt);
    if (reason === null) return;
    if (!reason.trim()) {
      setError('A reason is required.');
      return;
    }
    run(booking, action, { reason });
  }

  if (!data) return <Spinner label="Loading the operations board" />;

  const driversForVehicle = (fleet?.drivers ?? []).filter(
    (d) => d.vehicleId === selected?.vehicleId && d.duty === 'available',
  );
  const freeCars = (fleet?.vehicles ?? []).filter((v) => !v.currentJob).length;
  const needsReview = bookings.filter((b) => b.delay).length;

  return (
    <main className="dispatch-workspace mx-auto max-w-[120rem] space-y-4 px-4 py-4 sm:px-6">
      <WorkspaceIntro eyebrow="Operations desk" title="Your fleet. In focus." description="Review incoming journeys, keep cars moving and give every request a clear next step." icon="clipboard">
        <a className="workspace-shortcut" href="#booking-queue">Booking queue <span aria-hidden="true">↗</span></a>
        <a className="workspace-shortcut" href="#fleet-status">Fleet status <span aria-hidden="true">↗</span></a>
      </WorkspaceIntro>
      {/* Command bar: status, search and the counts that drive the shift. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ConnectionStatus updatedAt={updatedAt} offline={offline} onRefresh={refresh} />
        <div className="relative w-full sm:w-80">
          <Icon
            name="search"
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400"
          />
          <input
            type="search"
            className={`${inputClass} pl-9`}
            placeholder="Search reference, name or address"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search bookings"
          />
        </div>
      </div>

      <ErrorNote onDismiss={() => setError(null)}>{error}</ErrorNote>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <Metric
          caption="Awaiting review"
          value={counts.requested}
          tone={counts.requested ? 'wait' : 'neutral'}
          icon="clock"
          hint="Not yet promised a car"
        />
        <Metric
          caption="Needs a driver"
          value={counts.unassigned}
          tone={counts.unassigned ? 'wait' : 'neutral'}
          icon="steering"
          hint="Vehicle reserved"
        />
        <Metric caption="Offered" value={counts.offered} tone="live" icon="bell" hint="Awaiting reply" />
        <Metric
          caption="On the road"
          value={counts.assigned + counts.active}
          tone={counts.active ? 'live' : 'neutral'}
          icon="car"
          hint="Assigned or in progress"
        />
        <Metric
          caption="Cars free"
          value={`${freeCars}/${fleet?.vehicles?.length ?? 0}`}
          tone={freeCars ? 'ok' : 'wait'}
          icon="check"
          hint="No job right now"
        />
      </div>

      {needsReview > 0 ? (
        <p className="flex items-center gap-2 rounded-lg bg-status-wait-bg px-3 py-2 text-sm font-semibold text-status-wait ring-1 ring-inset ring-status-wait/20">
          <Icon name="alert" size={16} />
          {needsReview} booking{needsReview === 1 ? '' : 's'} flagged by a simulated flight delay and
          waiting on your review.
        </p>
      ) : null}

      <div id="fleet-status" className="scroll-mt-32"><FleetStrip fleet={fleet} onPick={(ref) => setSearch(ref)} /></div>

      <div id="booking-queue" className="grid scroll-mt-32 gap-4 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        {/* Queue */}
        <Panel
          title="Booking queue"
          subtitle={search.trim() ? `Search results for “${search.trim()}”` : undefined}
          icon="clipboard"
          bodyClass="p-3"
          className="xl:sticky xl:top-16 xl:max-h-[calc(100dvh-5rem)] xl:overflow-y-auto"
        >
          <SegmentedControl
            name="Queue filter"
            size="sm"
            value={queue}
            onChange={(next) => {
              setQueue(next);
              setSearch('');
            }}
            options={QUEUES.map((q) => ({ value: q.id, label: q.name, count: counts[q.id] }))}
            className="mb-3"
          />

          {visible.length === 0 ? (
            <EmptyState
              title={search.trim() ? 'Nothing matches that search' : 'This queue is empty'}
              icon={search.trim() ? 'search' : 'check'}
            >
              {search.trim()
                ? 'Try a booking reference, a passenger name or an address.'
                : 'Bookings appear here as passengers request them.'}
            </EmptyState>
          ) : (
            <ul className="space-y-1.5">
              {visible.map((b) => (
                <li key={b._id}>
                  <QueueRow
                    booking={b}
                    selected={b._id === selectedId}
                    onSelect={() => setSelectedId(b._id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Detail */}
        <div className="space-y-4">
          {!selected ? (
            <Panel title="Booking detail" icon="info">
              <EmptyState title="Select a booking" icon="clipboard">
                Choose a booking from the queue to see its detail and the actions available for its
                current state.
              </EmptyState>
            </Panel>
          ) : (
            <>
              <Panel
                title={`Detail · ${selected.reference}`}
                icon="clipboard"
                action={<StatusPill value={selected.status} />}
              >
                <div className="grid gap-5 lg:grid-cols-2">
                  <BookingSummary booking={selected} />
                  <div className="space-y-3">
                    <LiveTracking booking={selected}/>
                    <RouteMap
                      simulation={selected.simulation}
                      fromLabel={selected.fromLabel}
                      toLabel={selected.toLabel}
                    />
                    {selected.input.pickup === 'airport' || selected.input.destination === 'airport' ? (
                      <FlightStatus
                        api={api}
                        bookingId={selected._id}
                        flightNumber={selected.input.flightNumber}
                      />
                    ) : null}
                    {['confirmed', 'in_progress'].includes(selected.status) ? (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          icon={selected.simulation?.running ? 'pause' : 'play'}
                          disabled={busy}
                          onClick={() =>
                            run(selected, 'simulation', {
                              control: selected.simulation?.running ? 'pause' : 'resume',
                            })
                          }
                        >
                          {selected.simulation?.running ? 'Pause' : 'Resume'} movement
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          icon="rotate"
                          disabled={busy}
                          onClick={() => run(selected, 'simulation', { control: 'reset' })}
                        >
                          Reset
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </Panel>

              <Actions
                selected={selected}
                busy={busy}
                run={run}
                withReason={withReason}
                onError={setError}
                driversForVehicle={driversForVehicle}
              />

              <AuditPanel api={api} bookingId={selected._id} version={selected.version} />
            </>
          )}

          <NotificationPreviews api={api} tick={updatedAt?.getTime() ?? 0} />
        </div>
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ pieces */

/** One row in the queue. State is carried by a colour bar *and* a status pill. */
function QueueRow({ booking: b, selected, onSelect }) {
  const tone =
    b.status === 'requested'
      ? 'bg-status-wait'
      : b.progress === 'offered'
        ? 'bg-status-live'
        : b.status === 'in_progress'
          ? 'bg-status-live'
          : b.status === 'confirmed' && b.progress === 'unassigned'
            ? 'bg-status-wait'
            : b.status === 'confirmed'
              ? 'bg-status-ok'
              : 'bg-ink-300';

  return (
    <button
      onClick={onSelect}
      aria-current={selected ? 'true' : undefined}
      className={`flex w-full gap-3 rounded-lg border p-2.5 text-left transition-colors ${
        selected
          ? 'border-ink-900 bg-ink-50'
          : 'border-ink-100 bg-white hover:border-ink-300 hover:bg-ink-50/60'
      }`}
    >
      <span className={`w-1 shrink-0 rounded-full ${tone}`} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-semibold text-ink-900">
            {b.fromLabel} → {b.toLabel}
          </span>
          <span className="tabular shrink-0 text-xs font-semibold text-ink-700">
            {pence(b.fare.finalAmount ?? b.fare.amount)}
          </span>
        </span>
        <span className="mt-0.5 block truncate font-mono text-[11px] text-ink-400">
          {b.reference} · {b.pickupLocalText}
        </span>
        <span className="mt-1.5 flex flex-wrap items-center gap-1">
          <StatusPill value={b.status} size="sm" />
          {b.status === 'confirmed' || b.status === 'in_progress' ? (
            <StatusPill value={b.progress} size="sm" />
          ) : null}
          {b.input.accessible ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-ink-100 px-1.5 py-0.5 text-[11px] font-semibold text-ink-700">
              <Icon name="accessible" size={11} />
              Accessible
            </span>
          ) : null}
          {b.delay ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-status-wait-bg px-1.5 py-0.5 text-[11px] font-semibold text-status-wait">
              <Icon name="alert" size={11} />
              Delay
            </span>
          ) : null}
        </span>
      </span>
    </button>
  );
}

/** Four cars, always visible. With a fleet this small, a full row earns its space. */
function FleetStrip({ fleet, onPick }) {
  if (!fleet) return null;
  return (
    <Panel title="Fleet" icon="car" subtitle={`${fleet.vehicles.length} vehicles · ${fleet.drivers.length} drivers`} bodyClass="p-3">
      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {fleet.vehicles.map((v) => {
          const busy = !!v.currentJob;
          return (
            <li
              key={v._id}
              className={`rounded-lg border p-3 ${busy ? 'border-ink-200 bg-ink-50' : 'border-ink-100 bg-white'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 font-mono text-xs font-bold text-ink-900">
                  <Icon name="car" size={14} className="text-ink-400" />
                  {v._id}
                </span>
                <span
                  className={`inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide ${
                    busy ? 'text-status-live' : 'text-status-ok'
                  }`}
                >
                  <span
                    className={`size-1.5 rounded-full ${busy ? 'bg-status-live' : 'bg-status-ok'}`}
                    aria-hidden
                  />
                  {busy ? 'On a job' : 'Free'}
                </span>
              </div>
              <p className="mt-1 truncate text-sm font-semibold text-ink-900">{v.label}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-ink-500">
                <span>
                  {v.seats} seats · {v.luggage} bags
                </span>
                {v.accessible ? (
                  <span className="inline-flex items-center gap-1 font-semibold text-ink-700">
                    <Icon name="accessible" size={11} />
                    Accessible
                  </span>
                ) : null}
              </p>
              <p className="mt-1.5 truncate border-t border-ink-100 pt-1.5 text-xs text-ink-600">
                {v.driver ? (
                  <>
                    <Icon name="steering" size={12} className="mr-1 inline text-ink-400" />
                    {v.driver}
                  </>
                ) : (
                  <span className="text-ink-400">No driver on duty</span>
                )}
              </p>
              {v.currentJob ? (
                <button
                  onClick={() => onPick(v.currentJob.reference)}
                  className="mt-1 truncate rounded font-mono text-[11px] font-semibold text-ink-900 underline underline-offset-2"
                >
                  {v.currentJob.reference}
                </button>
              ) : null}
              {v.nextCommitment ? (
                <p className="truncate font-mono text-[11px] text-ink-400">
                  next {v.nextCommitment}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

/** Actions change with booking state; every original operational action is kept. */
function Actions({ selected, busy, run, withReason, onError, driversForVehicle }) {
  const isAirport =
    selected.input.pickup === 'airport' || selected.input.destination === 'airport';
  const open = ['requested', 'confirmed'].includes(selected.status);

  return (
    <Panel title="Actions" icon="check">
      <div className="flex flex-wrap gap-2">
        {selected.status === 'requested' ? (
          <Button icon="check" disabled={busy} onClick={() => run(selected, 'confirm')}>
            Confirm and reserve a vehicle
          </Button>
        ) : null}

        {selected.status === 'confirmed' && selected.progress === 'unassigned' ? (
          driversForVehicle.length ? (
            driversForVehicle.map((d) => (
              <Button
                key={d._id}
                icon="steering"
                disabled={busy}
                onClick={() => run(selected, 'offer', { driverId: d._id })}
              >
                Offer to {d.name}
              </Button>
            ))
          ) : (
            <p className="flex items-center gap-2 rounded-lg bg-ink-50 px-3 py-2 text-sm text-ink-600">
              <Icon name="info" size={15} className="text-ink-400" />
              No on-duty driver is currently allocated to {selected.vehicleId}.
            </p>
          )
        ) : null}

        {selected.status === 'confirmed' && selected.progress !== 'unassigned' ? (
          <Button variant="secondary" icon="rotate" disabled={busy} onClick={() => run(selected, 'withdraw')}>
            Withdraw and return to queue
          </Button>
        ) : null}

        {open ? (
          <Button
            variant="danger"
            icon="x"
            disabled={busy}
            onClick={() => withReason(selected, 'cancel', 'Reason for cancelling this booking:')}
          >
            Cancel
          </Button>
        ) : null}

        {selected.progress === 'arrived' ? (
          <Button
            variant="danger"
            icon="ban"
            disabled={busy}
            onClick={() => withReason(selected, 'no_show', 'Reason for recording a no-show:')}
          >
            Record no-show
          </Button>
        ) : null}

        {open && isAirport && !selected.delay ? (
          <Button variant="secondary" icon="plane" disabled={busy} onClick={() => run(selected, 'delay')}>
            Simulate a flight delay
          </Button>
        ) : null}

        {selected.delay ? (
          <Button
            variant="secondary"
            icon="x"
            disabled={busy}
            onClick={() => run(selected, 'dismiss_delay')}
          >
            Dismiss delay proposal
          </Button>
        ) : null}

        {selected.status === 'completed' && selected.paymentStatus !== 'paid'
          ? ['paid', 'pending', 'failed'].map((outcome) => (
              <Button
                key={outcome}
                variant={outcome === 'paid' ? 'primary' : 'secondary'}
                icon="card"
                disabled={busy}
                onClick={() => run(selected, 'payment', { outcome })}
              >
                Record simulated {label(outcome)} payment
              </Button>
            ))
          : null}

        {!['cancelled', 'no_show'].includes(selected.status) && selected.paymentStatus !== 'paid' ? (
          <Button
            variant="secondary"
            icon="cash"
            disabled={busy}
            onClick={() => {
              const pounds = window.prompt('Override the fare. Enter an amount in pounds:');
              if (pounds === null) return;
              const amount = Math.round(Number(pounds) * 100);
              if (!Number.isFinite(amount) || amount < 0) {
                onError('Enter a valid amount in pounds.');
                return;
              }
              const reason = window.prompt('Reason for the fare override:');
              if (reason === null) return;
              if (!reason.trim()) {
                onError('An override reason is required.');
                return;
              }
              run(selected, 'fare_override', { amount, reason });
            }}
          >
            Override fare
          </Button>
        ) : null}
      </div>

      <SimulationNotice className="mt-4">
        payments, movement, flight delays and message previews. No card is charged and no SMS or
        email is sent.
      </SimulationNotice>
    </Panel>
  );
}

function AuditPanel({ api, bookingId, version }) {
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    let live = true;
    setDetail(null);
    api
      .booking(bookingId)
      .then((d) => live && setDetail(d))
      .catch(() => live && setDetail({ events: [], payments: [] }));
    return () => {
      live = false;
    };
  }, [api, bookingId, version]);

  const events = detail?.events ?? [];
  const payments = detail?.payments ?? [];

  return (
    <Panel title="Audit history" icon="history" subtitle={`Document version ${version}`}>
      {!detail ? (
        <Spinner label="Loading history" />
      ) : events.length === 0 ? (
        <EmptyState title="No events recorded yet" icon="history" />
      ) : (
        <ol className="space-y-1.5">
          {events.map((e) => (
            <li key={e._id} className="flex flex-wrap items-baseline gap-x-2 text-sm">
              <span className="tabular font-mono text-[11px] text-ink-400">
                {new Date(e.createdAt).toLocaleTimeString('en-GB', { timeZone: 'Europe/London' })}
              </span>
              <span className="font-semibold text-ink-900">{label(e.type)}</span>
              <span className="text-ink-500">by {e.actor}</span>
              {e.details?.reason ? (
                <span className="text-ink-500">— {e.details.reason}</span>
              ) : null}
            </li>
          ))}
        </ol>
      )}

      {payments.length > 0 ? (
        <div className="mt-4 border-t border-ink-100 pt-3">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-400">
            Payment records
          </h3>
          <ul className="mt-2 space-y-1.5">
            {payments.map((p) => (
              <li key={p._id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="tabular font-semibold text-ink-900">{pence(p.amount)}</span>
                <StatusPill value={p.outcome} size="sm" />
                <span className="rounded bg-status-wait-bg px-1.5 py-0.5 text-[11px] font-semibold text-status-wait">
                  Demo — not proof of payment
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Panel>
  );
}
