import { useCallback, useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import { Button, Spinner } from './ui.jsx';

/**
 * Live flight status for an airport booking.
 *
 * This is the one surface in the product carrying **real** third-party data, so
 * it is labelled as such — the opposite of every other panel, which is labelled
 * simulated. Provenance is stated on every state, because "no delay shown"
 * must never be confusable with "we could not check".
 *
 * It reports only. A real delay does not reschedule anything: the dispatcher
 * reviews it and decides, exactly as with the simulated delay action.
 */

const STATUS_TONE = {
  scheduled: 'bg-status-live-bg text-status-live ring-status-live/25',
  active: 'bg-status-live-bg text-status-live ring-status-live/25',
  landed: 'bg-status-ok-bg text-status-ok ring-status-ok/25',
  cancelled: 'bg-status-stop-bg text-status-stop ring-status-stop/25',
  diverted: 'bg-status-wait-bg text-status-wait ring-status-wait/25',
  incident: 'bg-status-stop-bg text-status-stop ring-status-stop/25',
};

const clock = (iso) =>
  iso ? new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' }) : null;

export default function FlightStatus({ api, bookingId, flightNumber }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      setData(await api.flight(bookingId));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }, [api, bookingId]);

  useEffect(() => {
    let live = true;
    setData(null);
    api
      .flight(bookingId)
      .then((d) => live && setData(d))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [api, bookingId]);

  if (data?.state === 'not_applicable') return null;

  return (
    <section className="rounded-panel border border-ink-100 bg-white p-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-500">
          <Icon name="plane" size={13} className="text-ink-400" />
          Flight {flightNumber || '—'}
        </h3>
        <Button variant="quiet" size="sm" icon="refresh" onClick={load} disabled={busy}>
          Check now
        </Button>
      </header>

      {busy && !data ? <Spinner label="Checking flight status" /> : null}

      {error ? (
        <p className="mt-2 text-sm text-status-stop">
          Could not reach the flight service: {error}
        </p>
      ) : null}

      {data ? <Body data={data} /> : null}
    </section>
  );
}

export function Body({ data }) {
  if (data.state === 'unconfigured') {
    return (
      <Note tone="wait" icon="info">
        <strong className="font-semibold">No flight data provider is configured.</strong> Flight
        status is <strong className="font-semibold">simulated</strong> in this build — the delay
        control in dispatch produces a made-up delay for demonstration and nothing here is real.
      </Note>
    );
  }

  if (data.state === 'unavailable') {
    return (
      <Note tone="stop" icon="alert">
        <strong className="font-semibold">Flight status unavailable.</strong> {data.reason} Treat the
        scheduled pickup time as unchanged — nothing has been verified.
      </Note>
    );
  }

  if (data.state === 'not_found') {
    return (
      <Note tone="wait" icon="search">
        The provider has no record of{' '}
        <strong className="font-semibold">
          {data.flightIata} on {data.flightDate}
        </strong>
        . Check the flight number and date with the passenger. Nothing has been assumed.
        {data.note ? <span className="mt-1 block font-semibold">{data.note}</span> : null}
      </Note>
    );
  }

  const f = data.flight;
  const delayed = typeof f.delayMinutes === 'number' && f.delayMinutes > 0;
  // A missing delay figure is not the same as an on-time flight. Roughly 60% of
  // live flights publish no delay value at all, so the absence of a chip would
  // read as "on time" when it actually means "not reported".
  const punctuality = delayed
    ? { text: `${f.delayMinutes} min late`, tone: 'bg-status-wait-bg text-status-wait ring-status-wait/25' }
    : f.delayMinutes === 0
      ? { text: 'On time', tone: 'bg-status-ok-bg text-status-ok ring-status-ok/25' }
      : { text: 'No delay reported', tone: 'bg-ink-100 text-ink-600 ring-ink-300/40' };

  return (
    <div className="mt-2 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ring-1 ring-inset ${
            STATUS_TONE[f.status] ?? 'bg-ink-100 text-ink-600 ring-ink-300/40'
          }`}
        >
          {f.status}
        </span>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${punctuality.tone}`}
        >
          {punctuality.text}
        </span>
        {f.airline ? <span className="text-sm text-ink-600">{f.airline}</span> : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Leg title="Departs" point={f.departure} />
        <Leg title="Arrives" point={f.arrival} />
      </div>

      {/* Real data, and said plainly — the inverse of every simulated panel. */}
      <p className="flex items-start gap-2 rounded-lg bg-status-ok-bg px-3 py-2 text-xs text-status-ok ring-1 ring-inset ring-status-ok/20">
        <Icon name="check" size={14} className="mt-px shrink-0" />
        <span>
          <strong className="font-semibold">Real data</strong> from AviationStack, not simulated.
          Checked {new Date(f.fetchedAt).toLocaleTimeString('en-GB', { timeZone: 'Europe/London' })} UK
          time{f.cached ? ' (cached — press Check now to refresh)' : ''}. Reported only: the pickup
          time is <strong className="font-semibold">not</strong> rescheduled automatically. No
          position or ETA for the car is implied.
          {data.note ? ` ${data.note}` : ''}
          {f.delayMinutes === null || f.delayMinutes === undefined
            ? ' "No delay reported" means the airline has not published a delay figure — it is not a promise the flight is on time.'
            : ''}
        </span>
      </p>
    </div>
  );
}

function Leg({ title, point }) {
  const times = [
    ['Scheduled', point.scheduled],
    ['Estimated', point.estimated],
    ['Actual', point.actual],
  ].filter(([, v]) => v);
  return (
    <div className="rounded-lg bg-canvas-sunk p-2.5">
      <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-500">{title}</p>
      <p className="truncate text-sm font-semibold text-ink-900">
        {point.airport ?? point.iata ?? 'Unknown airport'}
      </p>
      {point.terminal || point.gate ? (
        <p className="text-xs text-ink-600">
          {point.terminal ? `Terminal ${point.terminal}` : null}
          {point.terminal && point.gate ? ' · ' : null}
          {point.gate ? `Gate ${point.gate}` : null}
        </p>
      ) : null}
      {times.length ? (
        <dl className="mt-1 space-y-0.5">
          {times.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-2 text-xs">
              <dt className="text-ink-500">{label}</dt>
              <dd className="tabular font-medium text-ink-900">{clock(value)}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-1 text-xs text-ink-500">No times published.</p>
      )}
    </div>
  );
}

function Note({ tone, icon, children }) {
  const tones = {
    wait: 'bg-status-wait-bg text-status-wait ring-status-wait/20',
    stop: 'bg-status-stop-bg text-status-stop ring-status-stop/20',
  };
  return (
    <p className={`mt-2 flex items-start gap-2 rounded-lg px-3 py-2 text-xs ring-1 ring-inset ${tones[tone]}`}>
      <Icon name={icon} size={14} className="mt-px shrink-0" />
      <span>{children}</span>
    </p>
  );
}
