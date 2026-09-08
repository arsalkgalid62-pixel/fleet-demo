import { useRef, useState } from 'react';
import { useSession } from '../lib/session.jsx';
import Icon from './Icon.jsx';
import { Button, ErrorNote, inputClass, pence } from './ui.jsx';

/**
 * Text booking assistant.
 *
 * This panel never books anything. It asks the server for a draft, shows what
 * the draft contains, and the passenger has to press "Use these details" to
 * copy it into the form — which they then submit themselves. Two deliberate
 * confirmation steps sit between the assistant and any stored booking.
 *
 * The provider label is load-bearing: with no API key configured this is
 * keyword matching on the server, and the UI must never imply otherwise.
 */

const FIELD_LABELS = {
  passengerName: 'Name',
  contact: 'Contact',
  pickup: 'Pickup',
  destination: 'Destination',
  timing: 'When',
  pickupLocal: 'Pickup time',
  passengers: 'Passengers',
  luggage: 'Bags',
  accessible: 'Accessible vehicle',
  instructions: 'Instructions',
  paymentMethod: 'Payment',
  flightNumber: 'Flight number',
  flightDate: 'Flight date',
  meetingPoint: 'Meeting point',
};

const show = (value) => {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
};

const EXAMPLES = [
  'Airport run from the hotel tomorrow at 6am, 2 people, 3 bags, flight DM1234',
  'I need a car from the station to the hospital now for 1 person',
];

export default function BookingAssistant({ onApply }) {
  const { api } = useSession();
  const [message, setMessage] = useState('');
  const [reply, setReply] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  // The agreed draft carries between turns so corrections build on it.
  const agreed = useRef({});

  async function send(event) {
    event.preventDefault();
    const text = message.trim();
    if (!text) return;
    setBusy(true);
    setError(null);
    try {
      const next = await api.assistantDraft(text, agreed.current);
      agreed.current = next.draft;
      setReply(next);
      setMessage('');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const entries = Object.entries(reply?.draft ?? {});

  return (
    <div className="space-y-3">
      <p className="flex items-start gap-2 rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-700 ring-1 ring-inset ring-ink-100">
        <Icon name="info" size={14} className="mt-px text-ink-400" />
        <span>
          This only fills in the form below. It cannot book, price, confirm or assign a car, and
          nothing is saved until you submit the form yourself.
        </span>
      </p>

      <form onSubmit={send} className="space-y-2">
        <label htmlFor="assistant-message" className="sr-only">
          Describe your journey
        </label>
        <textarea
          id="assistant-message"
          className={inputClass}
          rows={2}
          maxLength={600}
          placeholder="Describe the journey in your own words…"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="secondary" icon="sparkle" loading={busy} disabled={!message.trim()}>
            {busy ? 'Reading' : 'Draft it for me'}
          </Button>
          {reply ? (
            <Button
              type="button"
              variant="quiet"
              icon="rotate"
              onClick={() => {
                agreed.current = {};
                setReply(null);
                setError(null);
              }}
            >
              Start again
            </Button>
          ) : null}
        </div>
      </form>

      {!reply ? (
        <ul className="space-y-1">
          {EXAMPLES.map((example) => (
            <li key={example}>
              <button
                type="button"
                className="rounded text-left text-xs text-ink-500 underline decoration-dotted underline-offset-2 hover:text-ink-800"
                onClick={() => setMessage(example)}
              >
                “{example}”
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <ErrorNote onDismiss={() => setError(null)}>{error}</ErrorNote>

      {reply ? (
        <div className="space-y-3 rounded-panel border border-ink-200 bg-canvas-sunk p-3">
          <p className="text-sm font-semibold text-ink-900">{reply.question}</p>

          {entries.length === 0 ? (
            <p className="text-sm text-ink-500">
              Nothing could be read from that. Try naming the pickup, the destination and the time.
            </p>
          ) : (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
              {entries.map(([key, value]) => (
                <div key={key} className="contents">
                  <dt className="text-ink-500">{FIELD_LABELS[key] ?? key}</dt>
                  <dd className="font-medium text-ink-900">{show(value)}</dd>
                </div>
              ))}
            </dl>
          )}

          {reply.dropped?.length ? (
            <p className="flex items-start gap-2 rounded-lg bg-status-stop-bg px-3 py-2 text-xs text-status-stop ring-1 ring-inset ring-status-stop/20">
              <Icon name="alert" size={14} className="mt-px" />
              <span>
                The server rejected {reply.dropped.join(', ')}. Those details were left out — please
                enter them yourself.
              </span>
            </p>
          ) : null}

          {reply.quote ? (
            <p className="tabular text-xs text-ink-500">
              Indicative fare <strong className="font-semibold text-ink-800">{pence(reply.quote.amount)}</strong>{' '}
              — {reply.quote.label}. The server recalculates the binding quote when you submit; the
              assistant does not set prices.
            </p>
          ) : null}

          {/*
            Provider honesty. With no API key this says plainly that no AI is
            involved — it must never read as though a model produced the draft.
          */}
          <p
            className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs ring-1 ring-inset ${
              reply.provider === 'openai'
                ? 'bg-status-live-bg text-status-live ring-status-live/20'
                : 'bg-status-wait-bg text-status-wait ring-status-wait/20'
            }`}
          >
            <Icon name={reply.provider === 'openai' ? 'sparkle' : 'info'} size={14} className="mt-px" />
            <span>{reply.notice}</span>
          </p>

          <Button type="button" className="w-full" disabled={entries.length === 0} onClick={() => onApply(reply.draft)}>
            Use these details
          </Button>
          <p className="text-center text-xs text-ink-500">
            This only fills the form in. You still review it and press “Request this journey”.
          </p>
        </div>
      ) : null}
    </div>
  );
}
