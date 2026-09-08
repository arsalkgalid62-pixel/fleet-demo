import { useRef, useState } from 'react';
import { useSession } from '../lib/session.jsx';
import Icon from './Icon.jsx';
import { Button, ErrorNote, EmptyState, Field, Spinner, StatusPill, inputClass, pence } from './ui.jsx';

/**
 * Ask Fleet — company guidance and live booking facts in one panel.
 *
 * The two halves of a reply have different authority and are presented
 * separately on purpose:
 *
 *   Company guidance — retrieved document excerpts, optionally reworded by a
 *   model. Always cited, always carrying the document's demo/approved status.
 *
 *   Booking facts — deterministic MongoDB reads scoped to the signed-in actor.
 *   The model never sees or produces these; they are rendered from the backend
 *   response as-is, with the snapshot time.
 *
 * Read-only throughout: there is no write path behind this panel.
 *
 * Private results are per-account. `SeatShell` mounts this with `key={user.id}`
 * so switching account remounts it with empty state, and signing out unmounts
 * it entirely — a previous user's answer can never persist on screen.
 */

const EXAMPLES = {
  passenger: [
    'What is your luggage policy, and is my booking confirmed?',
    'Who is my driver?',
    'What is the pickup time and meeting point?',
    'How do I cancel a booking?',
  ],
  driver: [
    'What is my next assigned job?',
    'What should I do if the passenger does not arrive?',
    'What is the breakdown procedure?',
  ],
  dispatch: [
    'What is the cancellation guidance?',
    'What is the airport meeting point procedure?',
    'Which bookings are active right now?',
  ],
};

const REFERENCE_PATTERN = /^FD-[A-Fa-f0-9]{8}$/;

export default function FleetSupport() {
  const { api, user } = useSession();
  const [message, setMessage] = useState('');
  const [reference, setReference] = useState('');
  const [reply, setReply] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [refError, setRefError] = useState('');
  // What produced the visible answer, so Refresh re-asks the same thing.
  const asked = useRef(null);

  const examples = EXAMPLES[user.role] ?? EXAMPLES.passenger;

  async function run(question, bookingReference) {
    setBusy(true);
    setError('');
    // Clear the previous answer first, so a failure can never leave a stale
    // reply on screen looking like a current one.
    setReply(null);
    try {
      const next = await api.askFleet(question, bookingReference);
      asked.current = { question, bookingReference };
      setReply(next);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function submit(event) {
    event.preventDefault();
    const question = message.trim();
    if (!question) return;
    const ref = reference.trim().toUpperCase();
    if (ref && !REFERENCE_PATTERN.test(ref)) {
      setRefError('A reference looks like FD-1234ABCD (FD- then 8 characters).');
      return;
    }
    setRefError('');
    run(question, ref || undefined);
  }

  return (
    <section className="mx-auto w-full max-w-6xl px-4 pb-6 sm:px-6" aria-label="Ask Fleet">
      <details className="group overflow-hidden rounded-panel border border-ink-100 bg-white shadow-[0_1px_2px_rgba(12,33,29,0.04)]">
        <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 hover:bg-ink-50">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-ink-900 text-lime-400">
            <Icon name="sparkle" size={17} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-ink-900">Ask Fleet</span>
            <span className="block truncate text-xs text-ink-500">
              Company guidance and your current booking facts
            </span>
          </span>
          <Icon
            name="chevronDown"
            size={18}
            className="shrink-0 text-ink-400 transition-transform group-open:rotate-180"
          />
        </summary>

        <div className="border-t border-ink-100 p-4">
          <p className="flex items-start gap-2 rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-700 ring-1 ring-inset ring-ink-100">
            <Icon name="info" size={14} className="mt-px shrink-0 text-ink-400" />
            <span>
              Read-only. This cannot book, confirm, cancel, assign or take payment. Company answers
              come from cited documents — the sample corpus is{' '}
              <strong className="font-semibold">demo guidance, not company-approved policy</strong>.
              Booking facts are read from the database for your account only.
            </span>
          </p>

          <form onSubmit={submit} className="mt-4 space-y-3">
            <Field label="Your question" htmlFor="ask-message" required>
              <textarea
                id="ask-message"
                required
                maxLength={600}
                rows={2}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className={inputClass}
                placeholder={examples[0]}
              />
            </Field>

            <Field
              label="Booking reference"
              hint="optional — leave blank for your active bookings"
              htmlFor="ask-reference"
              error={refError}
            >
              <input
                id="ask-reference"
                value={reference}
                onChange={(e) => {
                  setReference(e.target.value);
                  setRefError('');
                }}
                className={`${inputClass} font-mono`}
                placeholder="FD-1234ABCD"
                maxLength={11}
                autoComplete="off"
              />
            </Field>

            <Button type="submit" icon="search" loading={busy} disabled={!message.trim()}>
              {busy ? 'Checking documents and bookings' : 'Ask Fleet'}
            </Button>
          </form>

          <div className="mt-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-500">
              Try asking
            </p>
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {examples.map((example) => (
                <li key={example}>
                  <button
                    type="button"
                    onClick={() => setMessage(example)}
                    className="rounded-full border border-ink-200 px-2.5 py-1 text-left text-xs text-ink-700 transition-colors hover:border-ink-400 hover:bg-ink-50"
                  >
                    {example}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {error ? (
            <div className="mt-4">
              <ErrorNote onDismiss={() => setError('')}>{error}</ErrorNote>
            </div>
          ) : null}

          {busy ? <Spinner label="Searching company documents and reading your bookings" /> : null}

          {reply && !busy ? (
            <div className="mt-5 space-y-5" aria-live="polite">
              <Answer reply={reply} />
              <Guidance sources={reply.sources} />
              <BookingFacts
                reply={reply}
                busy={busy}
                onRefresh={() =>
                  asked.current && run(asked.current.question, asked.current.bookingReference)
                }
              />
              <p className="border-t border-ink-100 pt-3 text-xs text-ink-500">{reply.notice}</p>
            </div>
          ) : null}
        </div>
      </details>
    </section>
  );
}

/** Provider labelling. Keyword search must never read as AI generation. */
export function Answer({ reply }) {
  const ai = reply.provider === 'openai';
  return (
    <div>
      <p
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ring-inset ${
          ai
            ? 'bg-status-live-bg text-status-live ring-status-live/25'
            : 'bg-status-wait-bg text-status-wait ring-status-wait/25'
        }`}
      >
        <Icon name={ai ? 'sparkle' : 'search'} size={12} />
        {ai ? 'AI wording from cited documents' : 'Document search · no AI generation'}
      </p>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink-900">{reply.answer}</p>
    </div>
  );
}

/** Company guidance — cited, versioned, and never presented as approved policy. */
export function Guidance({ sources }) {
  return (
    <div>
      <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-500">
        <Icon name="clipboard" size={13} className="text-ink-400" />
        Company guidance ({sources.length})
      </h3>

      {sources.length === 0 ? (
        <p className="mt-2 rounded-lg border border-dashed border-ink-200 px-3 py-2.5 text-sm text-ink-600">
          No company document available to your role covers this question. Nothing has been invented
          to fill the gap — ask the office for anything policy-related.
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {sources.map((source) => (
            <li key={source.id}>
              <details className="rounded-lg border border-ink-100 bg-canvas-sunk" open>
                <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-ink-900">
                  {source.title}
                </summary>
                <div className="border-t border-ink-100 px-3 py-2.5">
                  <p className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                        source.status === 'demo'
                          ? 'bg-status-wait-bg text-status-wait'
                          : 'bg-status-ok-bg text-status-ok'
                      }`}
                    >
                      {source.status === 'demo' ? 'Demo — not company-approved' : 'Approved'}
                    </span>
                    <span className="font-mono text-[11px] text-ink-500">
                      {source.id} · {source.version} · reviewed {source.reviewedAt}
                    </span>
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink-800">
                    {source.text}
                  </p>
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Live booking facts — backend reads, never model output. */
export function BookingFacts({ reply, busy, onRefresh }) {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-500">
          <Icon name="car" size={13} className="text-ink-400" />
          Your booking facts ({reply.bookings.length})
        </h3>
        <Button variant="quiet" size="sm" icon="refresh" onClick={onRefresh} disabled={busy}>
          Refresh
        </Button>
      </div>

      <p className="mt-1 text-xs text-ink-500">
        Snapshot taken{' '}
        {new Date(reply.fetchedAt).toLocaleTimeString('en-GB', { timeZone: 'Europe/London' })} UK
        time. Not continuously tracked — refresh for the current state.
      </p>
      {reply.bookingSummary ? (
        <p className="mt-2 rounded-lg bg-canvas-sunk px-3 py-2 text-sm font-medium text-ink-900">
          {reply.bookingSummary}
        </p>
      ) : null}
      <p className="mt-1 text-xs text-ink-500">{reply.bookingNotice}</p>

      {reply.bookings.length === 0 ? (
        <div className="mt-3">
          <EmptyState title="No bookings visible to your account" icon="car">
            Only bookings your signed-in account owns or is assigned to are shown here.
          </EmptyState>
        </div>
      ) : (
        <ul className="mt-3 space-y-2">
          {reply.bookings.map((b) => (
            <li key={b.reference}>
              <article className="rounded-lg border border-ink-100 bg-canvas-sunk p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h4 className="text-sm font-bold text-ink-900">
                    {b.pickup} → {b.destination}
                  </h4>
                  <span className="font-mono text-[11px] text-ink-500">{b.reference}</span>
                </div>

                <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-700">
                  <Icon name="clock" size={14} className="text-ink-400" />
                  {b.pickupTime}
                </p>

                {/* Lifecycle, assignment and payment are separate axes. */}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <StatusPill value={b.status} prefix="Booking" size="sm" />
                  <StatusPill value={b.progress} prefix="Assignment" size="sm" />
                  <StatusPill value={b.paymentStatus} prefix="Payment" size="sm" />
                </div>

                <dl className="mt-2.5 grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-2">
                  <Fact label="Driver" icon="steering">
                    {b.driver ?? <span className="text-ink-500">Not yet assigned</span>}
                  </Fact>
                  <Fact label="Vehicle" icon="car">
                    {b.vehicle ?? <span className="text-ink-500">Not yet assigned</span>}
                  </Fact>
                  {b.meetingPoint ? (
                    <Fact label="Meeting point" icon="pin">
                      {b.meetingPoint}
                    </Fact>
                  ) : null}
                  {b.instructions ? (
                    <Fact label="Pickup notes" icon="clipboard">
                      {b.instructions}
                    </Fact>
                  ) : null}
                </dl>

                <p className="mt-2.5 border-t border-ink-200 pt-2 text-xs text-ink-600">
                  <span className="tabular font-semibold text-ink-900">{pence(b.farePence)}</span> (
                  {b.fareType}) —{' '}
                  <span className="font-semibold">simulated demo fare, not company-approved</span>.
                  No card is charged. No live location, ETA or flight status is available.
                </p>
              </article>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Fact({ label, icon, children }) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.06em] text-ink-500">
        <Icon name={icon} size={11} />
        {label}
      </dt>
      <dd className="break-words text-ink-900">{children}</dd>
    </div>
  );
}
