import { z } from 'zod';

/**
 * Flight data contracts.
 *
 * The provider's response is parsed into a narrow normalised shape rather than
 * being passed through: the demo shows a handful of fields, and forwarding an
 * entire third-party payload to the browser would leak whatever else the
 * provider decides to include.
 */

/** Subset of the AviationStack payload this demo actually uses. */
const point = z
  .object({
    airport: z.string().nullish(),
    iata: z.string().nullish(),
    terminal: z.string().nullish(),
    gate: z.string().nullish(),
    scheduled: z.string().nullish(),
    estimated: z.string().nullish(),
    actual: z.string().nullish(),
    delay: z.number().nullish(),
  })
  .loose();

export const aviationStackFlight = z
  .object({
    flight_date: z.string().nullish(),
    flight_status: z.string().nullish(),
    departure: point.nullish(),
    arrival: point.nullish(),
    airline: z.object({ name: z.string().nullish() }).loose().nullish(),
    flight: z.object({ iata: z.string().nullish(), number: z.string().nullish() }).loose().nullish(),
  })
  .loose();

export const aviationStackResponse = z
  .object({
    data: z.array(aviationStackFlight).nullish(),
    error: z.object({ message: z.string().nullish(), code: z.string().nullish() }).loose().nullish(),
  })
  .loose();

export type FlightPoint = {
  airport: string | null;
  iata: string | null;
  terminal: string | null;
  gate: string | null;
  scheduled: string | null;
  estimated: string | null;
  actual: string | null;
  delayMinutes: number | null;
};

export type FlightStatus = {
  source: 'aviationstack';
  flightIata: string;
  flightDate: string;
  /** Provider value, lowercased: scheduled | active | landed | cancelled | diverted | incident. */
  status: string;
  airline: string | null;
  departure: FlightPoint;
  arrival: FlightPoint;
  /** Arrival delay in minutes when the provider reports one. */
  delayMinutes: number | null;
  fetchedAt: string;
  /** True when served from cache rather than fetched during this request. */
  cached: boolean;
};

/**
 * Every outcome is named, so the interface can say exactly what it knows
 * instead of showing a blank space that reads as "no delay".
 */
export type FlightLookup =
  | { state: 'not_applicable' }
  | { state: 'unconfigured' }
  | { state: 'not_found'; flightIata: string; flightDate: string; note?: string }
  | { state: 'unavailable'; reason: string }
  | { state: 'ok'; flight: FlightStatus; note?: string };

/** IATA flight designator, e.g. BA123 or DM1234. */
export const flightIataPattern = /^[A-Z0-9]{2}\d{1,4}$/;
