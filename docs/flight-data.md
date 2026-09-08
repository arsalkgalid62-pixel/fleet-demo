# Flight data (AviationStack)

Live flight status for airport bookings. This is the **only** surface in the product that carries
real third-party data — everything else is simulated and labelled as such, so this panel is labelled
the other way round: it states plainly that the data is real, and where it came from.

Added 7 September 2026 and **tested against the live AviationStack API the same day** — see "Live verification" below.

## What it does

`GET /api/bookings/:id/flight` returns the flight status for one airport booking. It is read-only,
authenticated, and scoped exactly like the booking endpoints: the same ownership check (`canRead`)
and the same identical 404 for missing and forbidden bookings, so references cannot be enumerated.

Only named fields cross from the provider into the app — status, airline, departure and arrival
airport/terminal/gate/times, and the arrival delay. The rest of the payload is dropped rather than
forwarded, so whatever the provider adds later cannot leak to the browser.

## What it deliberately does not do

**A real delay does not reschedule anything.** The panel reports; a dispatcher reviews and decides.
That is the same rule the simulated delay already follows, and it is the reason a cancelled flight
cannot cancel a booking on its own. `tests/flights.test.ts` pins this: a lookup returning
`cancelled` leaves the booking document byte-identical.

The lookup has no path into the booking services — no write, no transaction, no version bump, no
audit event. It cannot create, confirm, assign, cancel or price anything.

## Setup

1. Get a key from [aviationstack.com](https://aviationstack.com).
2. Put it in **`.env`** (never `.env.example`, which is a shared template):

```
AVIATIONSTACK_API_KEY=your-key-here
```

3. Restart the API. `.env` is read once at startup.

Without a key the panel says "No flight data provider is configured" and states that flight
behaviour is simulated. Nothing breaks.

## Two constraints that shaped the implementation

### Transport security

The key travels in the query string, so HTTPS is the default. **A free key tested on 7 September
2026 answered over HTTPS correctly**, so the insecure path was not needed. Some AviationStack plans
are documented as HTTP-only; if yours refuses HTTPS, the opt-in is:

```
AVIATIONSTACK_ALLOW_INSECURE_HTTP=true
```

which logs a warning at every startup. Use it only with a throwaway key you are willing to rotate.
Never with a paid or shared key.

### The free plan cannot filter by date

Confirmed against the live API: a free key answers **403 to any request carrying `flight_date`** —
date filtering is a paid feature. `flight_iata` alone returns 200.

The client adapts rather than failing. On a 403 it drops the date parameter, records that this plan
lacks the capability (so no later lookup wastes a request rediscovering it), and asks for the
flight's current status instead. It then **checks the returned date itself**: a record for a
different day is reported as `not_found` with a note, never presented as the booking's flight.

The practical consequence: **on a free key this shows a flight's current status, not its status on a
specific future date.** A booking for next week will report `not_found` until that day. Date lookups
need a paid plan.

### The free plan allows ~100 requests per month

The app polls every three seconds. An uncached lookup would exhaust a month's quota in roughly five
minutes, so **caching is a correctness requirement here, not an optimisation**.

Results are cached in MongoDB (`flightlookupcaches`), keyed by flight number and date:

| Outcome | Held for |
|---|---|
| `landed`, `cancelled`, `diverted`, `incident` | 6 hours — it will not change again |
| `scheduled`, `active` | 10 minutes |
| Any failure | 2 minutes, so an outage cannot burn the quota either |

A Mongo TTL index reaps expired entries, so the collection cannot grow without bound. Malformed
flight numbers and dates are rejected before a request is made, so no quota is spent on input the
provider would reject. The **Check now** button re-reads through the same cache; it does not bypass
it.

## Late or on time?

Yes, when the airline publishes it — and the panel is careful to distinguish three different things:

| Provider value | Panel shows | Meaning |
|---|---|---|
| delay > 0 | **"N min late"** (amber) | The airline reports a delay |
| delay = 0 | **"On time"** (green) | The airline reports no delay |
| delay absent | **"No delay reported"** (grey) | The airline has published nothing — **not** a promise it is on time |

That third row matters. Sampling 100 live flights on 7 September 2026, **39 reported a delay and 61
published no delay figure at all**. An empty space would read as "on time" for the majority of
flights, so the state is labelled explicitly instead.

**This is a current status, not a forecast.** Nothing here predicts whether a flight will become
late; it reports what the airline says right now. Combined with the free-plan date restriction
above, that means a booking for next week shows nothing useful until the day itself.

Verified live: SQ5926 returned `delayMinutes: 100` and rendered as "100 min late".

## What the panel shows

Every outcome is a named state, because a blank space must never be mistaken for "no delay":

| State | Meaning |
|---|---|
| `ok` | Real data, with the fetch time and whether it came from cache |
| `not_found` | The provider has no record of that flight on that date — check the number with the passenger |
| `unavailable` | Provider error, timeout, or quota exhausted. The reason is shown; the pickup time is unchanged and nothing is verified |
| `unconfigured` | No key. Says plainly that flight status is simulated in this build |
| `not_applicable` | Not an airport journey; the panel does not render |

Provider error bodies are never echoed to the user: AviationStack repeats the access key back in
some error messages, so the reason strings are written by this app, not copied from the response.

## Verification

`tests/flights.test.ts` — 24 tests, none touching the network. Every provider branch is driven
through an injected `fetch`. Covered: HTTPS default and the logged opt-in; field normalisation;
unexpected provider fields not forwarded; empty result as `not_found`; provider errors not echoing
the key; the 429 quota case named specifically; network failure and malformed body; malformed input
rejected without spending quota; `unconfigured` without calling out; **21 lookups costing exactly
one provider request**; failures cached; expiry re-querying; settled flights held for hours;
authentication; identical 404s; owner and dispatch access; `not_applicable`; the key never reaching
the browser; and a lookup leaving the booking unchanged. Three further tests cover the free-plan
path: the 403 retry without the date, the remembered capability so no later lookup retries the dated
request, and a mismatched date reported as `not_found` rather than passed off as the right flight.

Confirmed over real HTTP with no key configured: airport booking → `{"state":"unconfigured"}`,
local booking → `{"state":"not_applicable"}`, unknown id → `404`, and no insecure-HTTP warning in
the startup log.

## Live verification (7 September 2026)

Tested with a real free-tier key:

- HTTPS: **200 OK**. `flight_iata` alone: **200 OK**. `flight_date`: **403** — the plan limit above.
- End to end through the app, booking against live flight **VA5537**: `state: ok`, Virgin Australia,
  Singapore Changi T3 gate A4 → Melbourne T2 gate 9, status `active`, with the free-plan note
  attached. Parsing, normalisation and labelling all correct against a real payload.
- The immediate repeat call returned `cached: true`, spending no quota.

## Not verified

- **No browser check.** The panel is server-rendered in `npm run ui:smoke` across all five states,
  which catches crashes but not layout.
- Airport identification uses the booking's own flight number and date. There is no mapping from the
  demo's fictional "Demo Airport · Terminal 2" to a real IATA code, so a real flight will not match
  the demo's sample addresses — the panel reports what the provider says about the flight, not
  whether it lands where the booking claims.
