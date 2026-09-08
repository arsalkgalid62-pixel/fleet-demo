import { DateTime } from 'luxon';
import {
  aviationStackResponse,
  flightIataPattern,
  type FlightLookup,
  type FlightPoint,
  type FlightStatus,
} from '../shared/flights.js';
import { FlightLookupCache } from './db.js';

/**
 * AviationStack flight lookup.
 *
 * Read-only and strictly bounded. It answers one question — "what does the
 * provider say about this flight on this date" — and has no path into the
 * booking services. Nothing here can reschedule a booking: a real delay is
 * surfaced to the dispatcher for review, exactly like the simulated one, and a
 * human decides. That separation is deliberate and should not be removed.
 *
 * Two operational constraints drive the design:
 *
 *   1. **The free plan allows ~100 requests per month.** The app polls every
 *      three seconds, so an uncached lookup would exhaust a month's quota in
 *      about five minutes. Results are therefore cached in MongoDB and the
 *      cache is authoritative until it expires. This is a correctness
 *      requirement, not a performance optimisation.
 *
 *   2. **The free plan is HTTP-only.** Sending an API key over plaintext is a
 *      real exposure, so HTTPS is the default and downgrading requires an
 *      explicit opt-in that is logged loudly at startup.
 */

const ENDPOINT_PATH = '/v1/flights';

/**
 * `flight_date` is a paid-plan parameter: a free key answers 403 to any request
 * carrying it. Rather than fail, the client drops the parameter, asks for the
 * flight's current status, and only accepts the record if its own date matches
 * what was asked for. The capability is remembered in the cache collection so a
 * free key does not burn a request rediscovering the limit on every lookup.
 */
const CAPABILITY_ID = '__plan_supports_flight_date__';
const PLAN_NOTE =
  'This API plan cannot filter by date, so the provider was asked for the current status of this flight number instead.';

async function dateFilterSupported(): Promise<boolean> {
  const row = await FlightLookupCache.findById(CAPABILITY_ID).lean();
  return (row?.result as { supported?: boolean } | undefined)?.supported !== false;
}

async function recordDateFilterUnsupported(): Promise<void> {
  await FlightLookupCache.updateOne(
    { _id: CAPABILITY_ID },
    // No expiry: a plan's capability does not change between requests.
    { $set: { result: { supported: false }, fetchedAt: new Date() }, $unset: { expiresAt: 1 } },
    { upsert: true },
  );
}

/** Longer for a flight that has already finished; short while it can still change. */
const TTL_SECONDS = { settled: 6 * 60 * 60, live: 10 * 60 } as const;
const SETTLED = new Set(['landed', 'cancelled', 'diverted', 'incident']);

export const flightsConfigured = () => !!process.env.AVIATIONSTACK_API_KEY;

/**
 * Resolves the base URL. HTTPS unless explicitly downgraded, because the key
 * travels in the query string and would otherwise be readable in transit.
 */
export function baseUrl(): string {
  const insecure = process.env.AVIATIONSTACK_ALLOW_INSECURE_HTTP === 'true';
  return `${insecure ? 'http' : 'https'}://api.aviationstack.com`;
}

export function warnIfInsecure(log: (message: string) => void = console.warn): void {
  if (process.env.AVIATIONSTACK_ALLOW_INSECURE_HTTP === 'true') {
    log(
      '[flights] AVIATIONSTACK_ALLOW_INSECURE_HTTP=true — the API key is being sent over plaintext HTTP. Only acceptable for a throwaway free-tier demo key. Never do this with a paid or shared key.',
    );
  }
}

const readPoint = (raw: unknown): FlightPoint => {
  const p = (raw ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null);
  return {
    airport: str(p.airport),
    iata: str(p.iata),
    terminal: str(p.terminal),
    gate: str(p.gate),
    scheduled: str(p.scheduled),
    estimated: str(p.estimated),
    actual: str(p.actual),
    delayMinutes: typeof p.delay === 'number' ? p.delay : null,
  };
};

/** Normalises a provider record. Only named fields cross into the app. */
function normalise(raw: unknown, flightIata: string, flightDate: string, fetchedAt: string): FlightStatus {
  const r = (raw ?? {}) as Record<string, unknown>;
  const arrival = readPoint(r.arrival);
  const airline = (r.airline ?? {}) as Record<string, unknown>;
  return {
    source: 'aviationstack',
    flightIata,
    flightDate: typeof r.flight_date === 'string' ? r.flight_date : flightDate,
    status: typeof r.flight_status === 'string' ? r.flight_status.toLowerCase() : 'unknown',
    airline: typeof airline.name === 'string' && airline.name.trim() ? airline.name : null,
    departure: readPoint(r.departure),
    arrival,
    delayMinutes: arrival.delayMinutes,
    fetchedAt,
    cached: false,
  };
}

const cacheKey = (flightIata: string, flightDate: string) => `${flightIata}:${flightDate}`;

/**
 * Looks up one flight, preferring a fresh cache entry.
 *
 * `fetcher` is injectable so tests exercise every provider branch without ever
 * touching the network.
 */
export async function lookupFlight(
  rawNumber: string,
  rawDate: string,
  fetcher: typeof fetch = fetch,
  now: Date = new Date(),
): Promise<FlightLookup> {
  const flightIata = String(rawNumber ?? '').trim().toUpperCase();
  const flightDate = String(rawDate ?? '').trim();
  if (!flightIata || !flightDate) return { state: 'not_applicable' };
  if (!flightIataPattern.test(flightIata) || !DateTime.fromISO(flightDate).isValid) {
    return { state: 'unavailable', reason: 'That flight number or date is not in a format the provider accepts.' };
  }

  const key = process.env.AVIATIONSTACK_API_KEY;
  if (!key) return { state: 'unconfigured' };

  const id = cacheKey(flightIata, flightDate);
  const cached = await FlightLookupCache.findById(id).lean();
  if (cached && cached.expiresAt && +cached.expiresAt > +now) {
    return cached.result?.state === 'ok'
      ? { state: 'ok', flight: { ...(cached.result.flight as FlightStatus), cached: true } }
      : (cached.result as FlightLookup);
  }

  const call = async (withDate: boolean) => {
    const url = new URL(ENDPOINT_PATH, baseUrl());
    url.searchParams.set('access_key', key);
    url.searchParams.set('flight_iata', flightIata);
    if (withDate) url.searchParams.set('flight_date', flightDate);
    return fetcher(url, { signal: AbortSignal.timeout(8000), headers: { Accept: 'application/json' } });
  };

  let outcome: FlightLookup;
  try {
    let dated = await dateFilterSupported();
    let response = await call(dated);
    // 403 on a dated request means the plan does not include date filtering.
    if (dated && response.status === 403) {
      await recordDateFilterUnsupported();
      dated = false;
      response = await call(false);
    }
    const note = dated ? undefined : PLAN_NOTE;
    if (!response.ok) {
      // Never echo the provider body: it can repeat the access key back.
      outcome = {
        state: 'unavailable',
        reason:
          response.status === 429
            ? 'The flight data plan has hit its request limit.'
            : `The flight data provider returned ${response.status}.`,
      };
    } else {
      const parsed = aviationStackResponse.safeParse(await response.json());
      if (!parsed.success) {
        outcome = { state: 'unavailable', reason: 'The flight data provider sent an unexpected response.' };
      } else if (parsed.data.error) {
        outcome = { state: 'unavailable', reason: 'The flight data provider rejected the request.' };
      } else {
        const records = parsed.data.data ?? [];
        // Without a server-side date filter the provider may answer with a
        // different day's flight, so the date is checked here rather than
        // presenting whatever came back as the booking's flight.
        const record = dated ? records[0] : records.find((r) => r.flight_date === flightDate);
        outcome = record
          ? { state: 'ok', flight: normalise(record, flightIata, flightDate, now.toISOString()), note }
          : {
              state: 'not_found',
              flightIata,
              flightDate,
              note: dated
                ? undefined
                : `${PLAN_NOTE} No record for ${flightDate} was returned — a paid plan is needed to look up a specific date.`,
            };
      }
    }
  } catch {
    // Timeouts and network failures must not take the booking screens down.
    outcome = { state: 'unavailable', reason: 'The flight data provider could not be reached.' };
  }

  const settled = outcome.state === 'ok' && SETTLED.has(outcome.flight.status);
  // Cache failures briefly too, so an outage cannot burn the monthly quota.
  const ttl = outcome.state === 'ok' ? (settled ? TTL_SECONDS.settled : TTL_SECONDS.live) : 120;
  await FlightLookupCache.updateOne(
    { _id: id },
    { $set: { result: outcome, fetchedAt: now, expiresAt: new Date(+now + ttl * 1000) } },
    { upsert: true },
  );
  return outcome;
}
