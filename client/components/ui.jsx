import { useEffect, useId, useState } from 'react';
import Icon from './Icon.jsx';

export const pence = (value) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format((value ?? 0) / 100);

export const label = (value) => String(value ?? '').replace(/_/g, ' ');

/**
 * Status vocabulary.
 *
 * Every status is expressed as colour **and** text — colour never carries the
 * meaning alone, so the UI still reads correctly in greyscale or with a colour
 * vision deficiency.
 */
const STATUS = {
  requested: { tone: 'wait', text: 'Awaiting review' },
  confirmed: { tone: 'ok', text: 'Confirmed' },
  in_progress: { tone: 'live', text: 'In progress' },
  completed: { tone: 'done', text: 'Completed' },
  cancelled: { tone: 'stop', text: 'Cancelled' },
  no_show: { tone: 'stop', text: 'No show' },
  unassigned: { tone: 'wait', text: 'Unassigned' },
  offered: { tone: 'live', text: 'Offered' },
  accepted: { tone: 'ok', text: 'Accepted' },
  on_the_way: { tone: 'live', text: 'On the way' },
  arrived: { tone: 'live', text: 'Arrived' },
  outstanding: { tone: 'wait', text: 'Outstanding' },
  paid: { tone: 'ok', text: 'Paid' },
  pending: { tone: 'wait', text: 'Pending' },
  failed: { tone: 'stop', text: 'Failed' },
  available: { tone: 'ok', text: 'Available' },
  break: { tone: 'wait', text: 'On break' },
  off_duty: { tone: 'done', text: 'Off duty' },
};

const TONES = {
  wait: 'bg-status-wait-bg text-status-wait ring-status-wait/25',
  ok: 'bg-status-ok-bg text-status-ok ring-status-ok/25',
  live: 'bg-status-live-bg text-status-live ring-status-live/25',
  stop: 'bg-status-stop-bg text-status-stop ring-status-stop/25',
  done: 'bg-ink-100 text-ink-600 ring-ink-300/40',
};

export function StatusPill({ value, prefix, size = 'md' }) {
  const meta = STATUS[value] ?? { tone: 'done', text: label(value) };
  const pad = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold ring-1 ring-inset ${TONES[meta.tone]} ${pad}`}
    >
      {prefix ? <span className="font-normal opacity-70">{prefix}</span> : null}
      {meta.text}
    </span>
  );
}

/** Kept as an alias so existing call sites keep working. */
export const Badge = StatusPill;

const BUTTON_VARIANTS = {
  primary: 'bg-ink-900 text-white hover:bg-ink-800 active:bg-ink-950 disabled:bg-ink-300',
  secondary:
    'bg-white text-ink-900 ring-1 ring-inset ring-ink-200 hover:bg-ink-50 hover:ring-ink-300 disabled:text-ink-300 disabled:ring-ink-100',
  quiet: 'text-ink-600 hover:bg-ink-100 hover:text-ink-900 disabled:text-ink-300',
  danger: 'bg-status-stop text-white hover:brightness-110 disabled:bg-ink-300',
  /* Lime only ever sits behind dark ink, never as light text. */
  accent: 'bg-lime-500 text-ink-950 hover:bg-lime-400 active:bg-lime-600 disabled:bg-ink-200 disabled:text-ink-400',
};

const BUTTON_SIZES = {
  sm: 'gap-1.5 px-2.5 py-1.5 text-xs',
  md: 'gap-2 px-3.5 py-2 text-sm',
  lg: 'gap-2 px-5 py-3 text-base',
};

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  loading = false,
  className = '',
  children,
  disabled,
  ...props
}) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-lg font-semibold transition-colors disabled:cursor-not-allowed ${BUTTON_VARIANTS[variant]} ${BUTTON_SIZES[size]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span
          className="size-4 spin rounded-full border-2 border-current border-t-transparent opacity-70"
          aria-hidden
        />
      ) : icon ? (
        <Icon name={icon} size={size === 'lg' ? 20 : 16} />
      ) : null}
      {children}
    </button>
  );
}

/* ---------------------------------------------------------------- surfaces */

export function Panel({
  title,
  subtitle,
  action,
  icon,
  children,
  className = '',
  bodyClass = 'p-4',
  /* Clipping keeps the header's rounded corners tidy, but it also cuts off any
     absolutely-positioned child such as a combobox dropdown. */
  clip = true,
}) {
  return (
    <section
      className={`fleet-panel ${clip ? 'overflow-hidden' : ''} rounded-panel border border-ink-100 bg-white shadow-[0_1px_2px_rgba(12,33,29,0.04)] ${className}`}
    >
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-ink-100 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            {icon ? <Icon name={icon} size={16} className="text-ink-400" /> : null}
            <div className="min-w-0">
              <h2 className="truncate text-[13px] font-bold uppercase tracking-[0.08em] text-ink-600">
                {title}
              </h2>
              {subtitle ? <p className="truncate text-xs text-ink-400">{subtitle}</p> : null}
            </div>
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </header>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

/** Kept as an alias so existing call sites keep working. */
export function Card({ title, action, children, className = '' }) {
  return (
    <Panel title={title} action={action} className={className} bodyClass="p-4">
      {children}
    </Panel>
  );
}

/** A single operational figure. `hint` explains what it counts. */
export function Metric({ value, caption, hint, tone = 'neutral', icon }) {
  const accent = {
    neutral: 'text-ink-900',
    wait: 'text-status-wait',
    live: 'text-status-live',
    ok: 'text-status-ok',
  }[tone];
  return (
    <div className="rounded-panel border border-ink-100 bg-white px-4 py-3">
      <div className="flex items-center gap-1.5 text-ink-400">
        {icon ? <Icon name={icon} size={14} /> : null}
        <p className="text-[11px] font-bold uppercase tracking-[0.08em]">{caption}</p>
      </div>
      <p className={`tabular mt-1 text-2xl font-bold leading-none ${accent}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-ink-400">{hint}</p> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ inputs */

export const inputClass =
  'w-full rounded-lg border-0 bg-white px-3 py-2.5 text-sm text-ink-900 ring-1 ring-inset ring-ink-200 transition placeholder:text-ink-400 hover:ring-ink-300 focus:ring-2 focus:ring-ink-700 disabled:bg-ink-50 disabled:text-ink-400';

export function Field({ label: text, hint, error, children, required, htmlFor }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 flex flex-wrap items-baseline gap-x-2 text-sm font-semibold text-ink-800">
        {text}
        {required ? (
          <span className="text-status-stop" aria-hidden>
            *
          </span>
        ) : null}
        {hint ? <span className="text-xs font-normal text-ink-400">{hint}</span> : null}
      </label>
      {children}
      {error ? (
        <p className="mt-1 flex items-center gap-1 text-xs font-medium text-status-stop">
          <Icon name="alert" size={13} />
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Groups related fields under one heading, so long forms stay scannable. */
export function FieldGroup({ title, icon, children, className = '' }) {
  return (
    <fieldset className={className}>
      <legend className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.1em] text-ink-500">
        {icon ? <Icon name={icon} size={14} className="text-ink-400" /> : null}
        {title}
      </legend>
      <div className="space-y-4">{children}</div>
    </fieldset>
  );
}

/**
 * Radio group styled as buttons. Used for duty state and queue filters.
 * Arrow keys work because these are real radio inputs behind the labels.
 */
export function SegmentedControl({ name, value, onChange, options, size = 'md', className = '' }) {
  const group = useId();
  return (
    <div role="radiogroup" aria-label={name} className={`flex flex-wrap gap-1 rounded-lg bg-ink-50 p-1 ${className}`}>
      {options.map((option) => {
        const id = `${group}-${option.value}`;
        const active = value === option.value;
        return (
          <label
            key={option.value}
            htmlFor={id}
            className={`flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md font-semibold transition-colors ${
              size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-2 text-sm'
            } ${
              active
                ? 'bg-white text-ink-900 shadow-[0_1px_2px_rgba(12,33,29,0.08)] ring-1 ring-ink-200'
                : 'text-ink-500 hover:text-ink-800'
            } ${option.disabled ? 'cursor-not-allowed opacity-40' : ''}`}
          >
            <input
              id={id}
              type="radio"
              name={group}
              className="sr-only"
              checked={active}
              disabled={option.disabled}
              onChange={() => onChange(option.value)}
            />
            {option.icon ? <Icon name={option.icon} size={14} /> : null}
            <span className="truncate">{option.label}</span>
            {option.count !== undefined ? (
              <span
                className={`tabular ml-0.5 rounded px-1 text-[11px] font-bold ${
                  active ? 'bg-ink-900 text-white' : 'bg-ink-200 text-ink-600'
                }`}
              >
                {option.count}
              </span>
            ) : null}
          </label>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ states */

export function EmptyState({ title, icon = 'info', children, action }) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed border-ink-200 px-4 py-10 text-center">
      <Icon name={icon} size={22} className="text-ink-300" />
      <p className="mt-2 font-semibold text-ink-700">{title}</p>
      {children ? <p className="mt-1 max-w-sm text-sm text-ink-500">{children}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorNote({ children, onDismiss }) {
  if (!children) return null;
  return (
    <div
      role="alert"
      className="flex items-start justify-between gap-3 rounded-lg bg-status-stop-bg px-3 py-2.5 text-sm text-status-stop ring-1 ring-inset ring-status-stop/20"
    >
      <span className="flex items-start gap-2">
        <Icon name="alert" size={16} className="mt-0.5" />
        <span>{children}</span>
      </span>
      {onDismiss ? (
        <button onClick={onDismiss} className="shrink-0 rounded font-semibold underline underline-offset-2">
          Dismiss
        </button>
      ) : null}
    </div>
  );
}

export function Spinner({ label: text = 'Loading' }) {
  return (
    <p className="flex items-center justify-center gap-2 py-10 text-sm text-ink-500" role="status">
      <span className="size-4 spin rounded-full border-2 border-ink-200 border-t-ink-700" aria-hidden />
      {text}…
    </p>
  );
}

/** Placeholder block for first paint, so panels do not jump as data arrives. */
export function Skeleton({ className = 'h-4 w-full' }) {
  return <span className={`block animate-pulse rounded bg-ink-100 ${className}`} aria-hidden />;
}

/**
 * Every simulated surface carries one of these. Nothing simulated goes
 * unlabelled anywhere in this product — it is a release gate, not decoration.
 */
export function SimulationNotice({ children, className = '' }) {
  return (
    <p
      className={`flex items-start gap-2 rounded-lg bg-status-wait-bg px-3 py-2 text-xs font-medium text-status-wait ring-1 ring-inset ring-status-wait/20 ${className}`}
    >
      <Icon name="info" size={14} className="mt-px" />
      <span>
        <span className="font-bold">Simulated for the demo</span> — {children}
      </span>
    </p>
  );
}

/**
 * Connection and freshness. Says plainly when data has gone stale rather than
 * presenting old data as current.
 */
export function ConnectionStatus({ updatedAt, offline, intervalMs = 3000, onRefresh, compact = false }) {
  const [, force] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = updatedAt ? Math.round((Date.now() - updatedAt.getTime()) / 1000) : null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      <span
        className={`inline-flex items-center gap-1.5 font-semibold ${
          offline ? 'text-status-stop' : 'text-ink-600'
        }`}
      >
        {offline ? (
          <Icon name="wifiOff" size={14} />
        ) : (
          <span className="pulse-dot size-2 rounded-full bg-lime-500" aria-hidden />
        )}
        {offline ? 'Reconnecting — showing last known data' : 'Live'}
      </span>
      {!compact ? (
        <span className="text-ink-400">
          Updated{' '}
          {seconds === null ? 'never' : seconds === 0 ? 'just now' : `${seconds}s ago`} · polling every{' '}
          {Math.round(intervalMs / 1000)}s
        </span>
      ) : null}
      {onRefresh ? (
        <Button variant="quiet" size="sm" icon="refresh" onClick={onRefresh}>
          Refresh
        </Button>
      ) : null}
    </div>
  );
}

/** Kept as an alias so existing call sites keep working. */
export const FreshnessBar = ConnectionStatus;

/* --------------------------------------------------------------- structure */

/** Label/value row used across summaries. */
export function DataRow({ label: text, children, mono, icon, wide }) {
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <dt className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-ink-400">
        {icon ? <Icon name={icon} size={12} /> : null}
        {text}
      </dt>
      <dd className={`mt-0.5 break-words text-sm text-ink-900 ${mono ? 'font-mono text-[13px]' : ''}`}>
        {children}
      </dd>
    </div>
  );
}

/**
 * Journey progress. Shows lifecycle and assignment as one readable sequence
 * for the passenger, while the underlying records keep them separate.
 */
export function Timeline({ steps }) {
  return (
    <ol className="relative space-y-0">
      {steps.map((step, i) => {
        const last = i === steps.length - 1;
        const tone = step.state === 'done' ? 'done' : step.state === 'current' ? 'current' : 'todo';
        return (
          <li key={step.key} className="relative flex gap-3 pb-5 last:pb-0">
            {!last ? (
              <span
                className={`absolute left-[11px] top-6 h-full w-0.5 ${tone === 'todo' ? 'bg-ink-100' : 'bg-ink-700'}`}
                aria-hidden
              />
            ) : null}
            <span
              className={`relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full ring-4 ring-white ${
                tone === 'done'
                  ? 'bg-ink-800 text-white'
                  : tone === 'current'
                    ? 'bg-lime-500 text-ink-950'
                    : 'bg-ink-100 text-ink-400'
              }`}
            >
              {tone === 'done' ? (
                <Icon name="check" size={13} strokeWidth={2.4} />
              ) : (
                <span className={`size-2 rounded-full ${tone === 'current' ? 'bg-ink-950' : 'bg-ink-300'}`} />
              )}
            </span>
            <div className="min-w-0 pt-0.5">
              <p
                className={`text-sm font-semibold ${tone === 'todo' ? 'text-ink-400' : 'text-ink-900'}`}
              >
                {step.title}
                {tone === 'current' ? (
                  <span className="ml-2 rounded bg-lime-500 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-950">
                    Now
                  </span>
                ) : null}
              </p>
              {step.detail ? <p className="text-xs text-ink-500">{step.detail}</p> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Countdown bar for a driver offer. Colour shifts as it drains, but the
 * remaining seconds are always shown as text too.
 */
export function CountdownBar({ remainingMs, totalMs = 60000 }) {
  const fraction = Math.max(0, Math.min(1, remainingMs / totalMs));
  const seconds = Math.ceil(remainingMs / 1000);
  const urgent = seconds <= 15;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-500">Offer expires</span>
        <span className={`tabular text-lg font-bold ${urgent ? 'text-status-stop' : 'text-ink-900'}`}>
          {seconds}s
        </span>
      </div>
      <div
        className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink-100"
        role="progressbar"
        aria-valuenow={seconds}
        aria-valuemin={0}
        aria-valuemax={Math.round(totalMs / 1000)}
        aria-label="Seconds remaining to respond"
      >
        <div
          className={`h-full rounded-full transition-[width] duration-1000 ease-linear ${
            urgent ? 'bg-status-stop' : 'bg-lime-500'
          }`}
          style={{ width: `${fraction * 100}%` }}
        />
      </div>
    </div>
  );
}
