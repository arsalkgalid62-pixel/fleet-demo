import { DateTime } from 'luxon';
import { addresses, assistantDraft, type AssistantDraft } from '../shared/domain.js';
import { Fault, pickupTime, quote } from './service.js';

/**
 * Text booking assistant (prompt 8).
 *
 * The assistant's entire authority is to fill in a draft of the booking form.
 * It cannot create, confirm, price or assign anything: the route below returns
 * a draft, the passenger reviews it on screen, and the booking is only created
 * when they submit the ordinary form through createBooking. That keeps every
 * existing guard — validation, capacity, idempotency, audit — on the path a
 * booking actually takes, whatever the model returns.
 *
 * Deliberately absent from the draft schema: fare, status, vehicle, driver.
 */

const FIELDS = ['pickup', 'destination', 'timing', 'passengers'] as const;

/** Fields still needed before the passenger can sensibly submit the form. */
export function missingFields(draft: AssistantDraft): string[] {
  const missing = FIELDS.filter((f) => draft[f] === undefined) as string[];
  if (draft.timing === 'scheduled' && !draft.pickupLocal) missing.push('pickupLocal');
  const airport = draft.pickup === 'airport' || draft.destination === 'airport';
  if (airport) {
    if (!draft.flightNumber) missing.push('flightNumber');
    if (!draft.flightDate) missing.push('flightDate');
    if (!draft.meetingPoint) missing.push('meetingPoint');
  }
  return missing;
}

const ASK: Record<string, string> = {
  pickup: 'Where should the car collect you?',
  destination: 'Where are you heading?',
  timing: 'Do you need the car as soon as possible, or at a specific time?',
  passengers: 'How many people are travelling?',
  pickupLocal: 'What UK date and time should the pickup be?',
  flightNumber: 'What is the flight number?',
  flightDate: 'What date does the flight operate?',
  meetingPoint: 'Where at the terminal should the driver meet you?',
};

const question = (missing: string[]) =>
  missing.length === 0
    ? 'That is everything I need. Please check the details below before requesting the journey.'
    : (ASK[missing[0]!] ?? `Please provide ${missing[0]}.`);

/** Drops nulls and unknown keys so a loose model reply still parses cleanly. */
function clean(value: unknown): AssistantDraft {
  if (!value || typeof value !== 'object') return {};
  const entries = Object.entries(value as Record<string, unknown>).filter(
    ([, v]) => v !== null && v !== '' && v !== undefined,
  );
  const parsed = assistantDraft.safeParse(Object.fromEntries(entries));
  return parsed.success ? parsed.data : {};
}

/**
 * Rejects anything the assistant proposed that the passenger is not allowed to
 * have, regardless of where the values came from. A model that invents a
 * non-synthetic contact, an impossible clock time or a seventh passenger gets
 * its suggestion dropped rather than shown as a valid draft.
 */
function sanitise(draft: AssistantDraft, now: Date): { draft: AssistantDraft; dropped: string[] } {
  const out: AssistantDraft = { ...draft };
  const dropped: string[] = [];
  const drop = (field: keyof AssistantDraft, why: string) => {
    delete out[field];
    dropped.push(why);
  };
  if (out.contact && process.env.ALLOW_REAL_CONTACTS !== 'true' && !/^[a-zA-Z0-9._+-]+@example\.invalid$/.test(out.contact))
    drop('contact', 'a contact address that was not a synthetic @example.invalid one');
  if (out.pickup && out.pickup === out.destination)
    drop('destination', 'a destination identical to the pickup');
  if (out.pickupLocal) {
    try {
      pickupTime({ timing: 'scheduled', pickupLocal: out.pickupLocal } as never, now);
      out.timing = 'scheduled';
    } catch {
      drop('pickupLocal', 'a pickup time that was in the past, ambiguous, or not a real UK clock time');
      if (out.timing === 'scheduled') delete out.timing;
    }
  }
  if (out.flightDate && !/^\d{4}-\d{2}-\d{2}$/.test(out.flightDate))
    drop('flightDate', 'a flight date that was not a real calendar date');
  return { draft: out, dropped };
}

const PLACES = addresses.map((a) => a.id);

/**
 * Deterministic keyword extractor.
 *
 * Used verbatim when no OPENAI_API_KEY is configured, and as the base layer the
 * model's reply is merged over when one is. It is plain pattern matching, not a
 * language model, and the UI says so whenever it is the only thing running.
 */
export function extract(message: string, now: Date): AssistantDraft {
  const text = message.toLowerCase();
  const draft: AssistantDraft = {};

  // "from the hotel to the airport" — order the two places by where they appear.
  const hits = PLACES.map((id) => ({ id, at: text.indexOf(id) })).filter((h) => h.at >= 0);
  const from = text.match(/\bfrom\s+(?:the\s+)?(\w+)/)?.[1];
  const to = text.match(/\b(?:to|for)\s+(?:the\s+)?(\w+)/)?.[1];
  if (from && (PLACES as string[]).includes(from)) draft.pickup = from as AssistantDraft['pickup'];
  if (to && (PLACES as string[]).includes(to)) draft.destination = to as AssistantDraft['destination'];
  if (!draft.pickup && hits.length >= 1) draft.pickup = hits[0]!.id as AssistantDraft['pickup'];
  if (!draft.destination && hits.length >= 2)
    draft.destination = hits[1]!.id as AssistantDraft['destination'];

  const people = text.match(/(\d+)\s*(?:people|passengers|of us|adults)/)?.[1];
  if (people) draft.passengers = Math.min(6, Math.max(1, Number(people)));
  const bags = text.match(/(\d+)\s*(?:bags?|cases?|suitcases?|luggage)/)?.[1];
  if (bags) draft.luggage = Math.min(6, Math.max(0, Number(bags)));
  if (/wheelchair|accessible|step[- ]free|ramp/.test(text)) draft.accessible = true;
  if (/\bcash\b/.test(text)) draft.paymentMethod = 'cash';
  else if (/\bcard\b/.test(text)) draft.paymentMethod = 'card';

  const flight = message.match(/\b([A-Z]{2}\d{2,4})\b/);
  if (flight) draft.flightNumber = flight[1];
  if (/arrivals?|terminal|meet/.test(text)) draft.meetingPoint = 'Terminal 2 arrivals';

  if (/\b(now|asap|as soon as possible|right away|straight away)\b/.test(text)) {
    draft.timing = 'now';
  } else {
    // A bare number is only a time when something marks it as one. Without
    // this, "3 of us with 4 bags" reads as 03:00 and quietly overwrites a
    // pickup time the passenger already agreed on an earlier turn.
    const clock =
      text.match(/\b(\d{1,2}):(\d{2})\s*(am|pm)?\b/) ??
      text.match(/\b(\d{1,2})()\s*(am|pm)\b/) ??
      text.match(/\bat\s+(\d{1,2})()\b(?!\s*(?:people|passengers|bags|cases|suitcases|adults|of)\b)()/);
    const local = DateTime.fromJSDate(now, { zone: 'Europe/London' });
    if (clock) {
      let hour = Number(clock[1]);
      const minute = Number(clock[2] || 0);
      if (clock[3] === 'pm' && hour < 12) hour += 12;
      if (clock[3] === 'am' && hour === 12) hour = 0;
      if (hour <= 23 && minute <= 59) {
        const days = /tomorrow/.test(text) ? 1 : 0;
        let when = local.plus({ days }).set({ hour, minute, second: 0, millisecond: 0 });
        // A bare time already gone today means the next occurrence, not the past.
        if (when < local) when = when.plus({ days: 1 });
        draft.timing = 'scheduled';
        draft.pickupLocal = when.toFormat("yyyy-MM-dd'T'HH:mm");
      }
    }
  }
  return draft;
}

/**
 * Fills the flight date in from the pickup date as a starting suggestion.
 *
 * Applied after the turns are merged, not inside extract(), so it behaves the
 * same whether the flight number and the pickup time arrived together or on
 * separate turns. The passenger still sees and can correct it.
 */
function deriveFlightDate(draft: AssistantDraft): AssistantDraft {
  if (draft.flightNumber && !draft.flightDate && draft.pickupLocal)
    return { ...draft, flightDate: draft.pickupLocal.slice(0, 10) };
  return draft;
}

const SYSTEM = `You take booking notes for a small UK taxi demo. Reply with JSON only.

Return an object with any of these keys you are confident about, and omit the rest:
pickup, destination (one of: ${PLACES.join(', ')}), timing ("now" or "scheduled"),
pickupLocal ("YYYY-MM-DDTHH:mm", UK local time, future only), passengers (1-6),
luggage (0-6), accessible (boolean), paymentMethod ("cash" or "card"),
flightNumber, flightDate ("YYYY-MM-DD"), meetingPoint, instructions,
passengerName, contact (must end @example.invalid).

Never invent a detail the passenger did not give. Omit anything you are unsure about.
Never output a price, fare, vehicle, driver, booking reference or status: you do not
decide those, and any you produce are discarded before the passenger sees them.`;

/** Calls OpenAI for the draft. Throws on failure; the caller falls back. */
async function askModel(message: string, draft: AssistantDraft, now: Date) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const local = DateTime.fromJSDate(now, { zone: 'Europe/London' });
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `${SYSTEM}\n\nUK local time now: ${local.toFormat("yyyy-MM-dd'T'HH:mm")} (${local.toFormat('ZZZZ')}).`,
        },
        {
          role: 'user',
          content: `Details agreed so far: ${JSON.stringify(draft)}\n\nPassenger said: ${message}`,
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI returned ${res.status}`);
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = body.choices?.[0]?.message?.content;
  if (!content) return null;
  return clean(JSON.parse(content));
}

export type AssistantReply = {
  draft: AssistantDraft;
  missing: string[];
  question: string;
  quote: ReturnType<typeof quote> | null;
  provider: 'openai' | 'pattern-match';
  notice: string;
  dropped: string[];
  ready: boolean;
};

/**
 * One assistant turn. `draft` is the state the passenger has already reviewed;
 * the new message may add to it or correct it, and nothing else persists —
 * there is no server-side conversation store to carry content between sessions.
 */
export async function interpret(
  rawMessage: unknown,
  rawDraft: unknown,
  now = new Date(),
): Promise<AssistantReply> {
  const message = String(rawMessage ?? '').trim();
  if (!message) throw new Fault(400, 'Type what you need and the assistant will draft it');
  if (message.length > 600) throw new Fault(400, 'Keep the request under 600 characters');

  const agreed = clean(rawDraft);
  const base = extract(message, now);
  let proposed: AssistantDraft = { ...agreed, ...base };
  let provider: AssistantReply['provider'] = 'pattern-match';

  if (process.env.OPENAI_API_KEY) {
    try {
      const model = await askModel(message, agreed, now);
      if (model) {
        proposed = { ...agreed, ...base, ...model };
        provider = 'openai';
      }
    } catch (e) {
      // A model outage must not take the booking flow down with it.
      console.error('[assistant] model call failed, using pattern matching', e);
    }
  }

  const { draft: checked, dropped } = sanitise(proposed, now);
  const draft = deriveFlightDate(checked);
  const missing = missingFields(draft);
  return {
    draft,
    missing,
    question: question(missing),
    // Shown for information only. The server re-quotes on submission and that
    // stored figure is the binding one; the assistant never sets a price.
    quote:
      draft.pickup && draft.destination
        ? quote({
            pickup: draft.pickup,
            destination: draft.destination,
            passengers: draft.passengers ?? 1,
          } as never)
        : null,
    provider,
    notice:
      provider === 'openai'
        ? 'Drafted by an AI assistant. Nothing is booked until you review these details and submit the form yourself.'
        : 'No AI provider is configured, so this draft came from simple keyword matching on the server, not from a language model.',
    dropped,
    ready: missing.length === 0,
  };
}
