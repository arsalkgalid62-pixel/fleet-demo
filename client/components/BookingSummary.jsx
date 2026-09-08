import Icon from './Icon.jsx';
import { DataRow, StatusPill, pence } from './ui.jsx';

/**
 * Shared read-only summary of one booking.
 *
 * Lifecycle (`status`), assignment (`progress`) and payment stay visually
 * separate, because they are separate axes in the data and collapsing them
 * would misrepresent the record — a completed trip can still be unpaid.
 */
export default function BookingSummary({ booking, showContact = true }) {
  const b = booking;
  const fare = b.fare ?? {};
  const finalAmount = fare.finalAmount ?? fare.amount;
  const overridden = fare.finalAmount !== undefined && fare.finalAmount !== fare.amount;
  const isAirport = b.input.pickup === 'airport' || b.input.destination === 'airport';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusPill value={b.status} prefix="Booking" />
        <StatusPill value={b.progress} prefix="Driver" />
        <StatusPill value={b.paymentStatus} prefix="Payment" />
      </div>

      {/* The journey itself is the headline: everything else supports it. */}
      <div className="rounded-panel bg-canvas-sunk p-4">
        <Journey from={b.fromLabel} to={b.toLabel} />
        <p className="mt-3 flex items-center gap-1.5 border-t border-ink-200/60 pt-3 text-sm font-semibold text-ink-800">
          <Icon name="clock" size={15} className="text-ink-400" />
          {b.pickupLocalText}
        </p>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-ink-700">
        <Chip icon="users">
          {b.input.passengers} passenger{b.input.passengers === 1 ? '' : 's'}
        </Chip>
        <Chip icon="bag">
          {b.input.luggage} bag{b.input.luggage === 1 ? '' : 's'}
        </Chip>
        <Chip icon={b.input.paymentMethod === 'cash' ? 'cash' : 'card'}>{b.input.paymentMethod}</Chip>
        {b.input.accessible ? (
          <Chip icon="accessible" strong>
            Accessible vehicle required
          </Chip>
        ) : null}
      </div>

      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <DataRow label="Reference" mono>
          {b.reference}
        </DataRow>
        <DataRow label="Vehicle" icon="car">
          {b.vehicleId ?? <span className="text-ink-400">Not yet reserved</span>}
        </DataRow>
        <DataRow label="Driver" icon="steering">
          {b.driverId ?? <span className="text-ink-400">Not yet assigned</span>}
        </DataRow>
        {showContact ? (
          <>
            <DataRow label="Passenger">{b.input.passengerName}</DataRow>
            <DataRow label="Contact" mono wide>
              {b.input.contact}
            </DataRow>
          </>
        ) : null}
      </dl>

      {b.input.instructions ? (
        <p className="rounded-lg bg-ink-50 px-3 py-2 text-sm text-ink-900 ring-1 ring-inset ring-ink-100">
          <span className="font-semibold">Pickup instructions: </span>
          {b.input.instructions}
        </p>
      ) : null}

      {isAirport ? (
        <div className="rounded-lg bg-status-live-bg px-3 py-2.5 text-sm text-status-live ring-1 ring-inset ring-status-live/20">
          <p className="flex items-center gap-1.5 font-bold">
            <Icon name="plane" size={15} />
            Airport transfer
          </p>
          <p className="mt-1 text-ink-800">
            Flight <span className="font-semibold">{b.input.flightNumber || '—'}</span> on{' '}
            {b.input.flightDate || '—'} · meeting point: {b.input.meetingPoint || '—'}
          </p>
          <p className="mt-1 text-xs text-ink-600">
            The dispatcher’s flight-delay control is simulated. Live flight status, when a
            provider is configured, is shown in the flight panel with its own source label.
          </p>
        </div>
      ) : null}

      <div className="rounded-panel border border-ink-100 bg-white p-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-400">
            Fare · {fare.type}
          </span>
          <span className="tabular text-xl font-bold text-ink-900">{pence(finalAmount)}</span>
        </div>
        {overridden ? (
          <p className="tabular mt-0.5 text-right text-xs text-ink-500">
            originally {pence(fare.amount)}
          </p>
        ) : null}
        {fare.overrideReason ? (
          <p className="mt-1 text-xs text-ink-600">Override reason: {fare.overrideReason}</p>
        ) : null}
        <p className="mt-2 border-t border-ink-100 pt-2 text-xs text-ink-400">
          Demo assumptions — not company-approved. Pricing version {fare.pricingVersion}. Not an
          approved taxi meter.
        </p>
      </div>

      {b.delay ? (
        <div className="rounded-lg bg-status-wait-bg px-3 py-2.5 text-sm text-status-wait ring-1 ring-inset ring-status-wait/20">
          <p className="flex items-center gap-1.5 font-bold">
            <Icon name="alert" size={15} />
            Simulated flight delay — dispatcher review required
          </p>
          <p className="mt-1 text-ink-800">
            Proposed new pickup:{' '}
            {new Date(b.delay.proposedPickupAt).toLocaleString('en-GB', { timeZone: 'Europe/London' })} (
            {b.delay.minutes} minutes later). The confirmed trip has <strong>not</strong> been changed.
          </p>
        </div>
      ) : null}
    </div>
  );
}

/** Pickup above destination, joined by a rule — reads as one journey. */
export function Journey({ from, to, size = 'md' }) {
  const text = size === 'lg' ? 'text-lg sm:text-xl' : 'text-base';
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center pt-1.5">
        <span className="size-2.5 rounded-full border-2 border-ink-700" aria-hidden />
        <span className="my-1 w-px flex-1 bg-ink-300" aria-hidden />
        <span className="size-2.5 rounded-full bg-ink-900" aria-hidden />
      </div>
      <div className="min-w-0 flex-1 space-y-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-400">Pickup</p>
          <p className={`font-semibold leading-snug text-ink-900 ${text}`}>{from}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-400">Destination</p>
          <p className={`font-semibold leading-snug text-ink-900 ${text}`}>{to}</p>
        </div>
      </div>
    </div>
  );
}

function Chip({ icon, children, strong }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 ${strong ? 'font-semibold text-ink-900' : ''}`}
    >
      <Icon name={icon} size={15} className="text-ink-400" />
      {children}
    </span>
  );
}
