# Fleet Demo — verification report

Prompt 9. Everything below was executed on 7 September 2026 against a real MongoDB replica set.
Checks that were **not** run are listed in "Not verified" rather than left implied.

## Environment used

| Item | Value |
|---|---|
| OS | Windows 11 Home 10.0.26200 |
| Node / npm | v22.14.0 / 11.1.0 |
| MongoDB | 8.2.6, real `mongod`, single-node replica set `fleet-demo`, port 27018 |
| Data directory | `.data/mongo`, persistent across restarts |
| Transactions | Available and used (`hello.setName = fleet-demo`) |
| AI provider | **None configured.** No `OPENAI_API_KEY` was set, so the assistant ran its deterministic path throughout |

MongoDB Atlas was not used; no credential was available and none was requested. The local replica
set is genuine MongoDB, not an in-memory stub, and it persists to disk.

## Automated suite — 57 tests, 57 passing, 0 failing (~30s)

`npm test` against the real replica set. Each file uses its own `fleet_demo_test_*` database and
drops it afterwards.

| Suite | Covers |
|---|---|
| assistant access control | Unauthenticated and driver-seat callers refused; CSRF required; empty message refused |
| assistant drafting | Draft extraction, missing-field questions, multi-turn carry-over, no booking created |
| assistant output is sanitised server-side | Non-synthetic contacts, past/ambiguous times, identical endpoints and injected fares/status/vehicles all discarded |
| deterministic extraction | Place order, UK local times, bare counts not read as clock times |
| idempotency | One key, one booking; reused key with different content refused 409; replayed payment creates no second record |
| optimistic concurrency | Stale `version` refused 409 |
| vehicle schedule races | Two overlapping journeys confirmed simultaneously → exactly one winner; non-overlapping both confirm; cancellation releases capacity; oversized party refused |
| driver offer races | Two simultaneous acceptances → exactly one winner; unoffered driver 404; expired offer returns to `unassigned`; off-duty driver refused |
| UK time handling | Non-existent (29 Mar 2026 01:30) and doubled (25 Oct 2026 01:30) clock times refused; past pickups refused; GMT/BST rendering |
| sessions and role isolation | Three seats signed in independently; passengers cannot see the fleet; wrong seat/password refused |
| CSRF protection | Writes without a token and from a foreign origin refused |
| full booking journey | Passenger → dispatch → driver → completion → payment with integer-pence fares and an ordered audit trail |
| permissions and scoping | Forbidden and missing bookings return byte-identical 404s; role-only actions refused |
| input validation | Non-synthetic contacts, identical endpoints, airport trips without flight details, missing idempotency keys |

Every concurrency test drives its race with `Promise.all`. A sequential version of these tests
passes against a design that double-books, which is why they are written this way.

## Manual verification over real HTTP

Driven with `curl` against `npm start` on port 3001, using separate cookie jars per seat — not
supertest, so the session cookies, CSRF tokens and headers are the real ones.

### Three isolated sessions (required by prompt 9)

All three signed in at once and stayed independent:

```
passenger -> passenger  / passenger
dispatch  -> dispatch   / dispatch
driver    -> drv-ashton / driver
```

Fleet visibility differed correctly by role in the same moment:

| Seat | `fleet` in `/api/state` |
|---|---|
| passenger | `null` — passengers never receive the fleet |
| dispatch | 4 vehicles, 5 drivers |
| driver | 4 vehicles, **1** driver (only their own record) |

### Replica-set concurrency over HTTP (required by prompt 9)

Five overlapping journeys were created for the same interval, all requiring a wheelchair-accessible
vehicle. Only one car in the fleet (`FD-04`) is accessible, so at most one can legitimately be
confirmed. All five confirms were fired simultaneously as background jobs:

```
FD-472D5678  confirmed  FD-04
-  REFUSED: No suitable capacity for the full buffered interval; request remains awaiting review
-  REFUSED: No suitable capacity for the full buffered interval; request remains awaiting review
-  REFUSED: No suitable capacity for the full buffered interval; request remains awaiting review
-  REFUSED: No suitable capacity for the full buffered interval; request remains awaiting review
```

Exactly one winner. The four losers stayed `requested` (awaiting review) rather than failing
destructively. This is the `scheduleVersion` lock in `server/service.ts` doing its job: each
reservation transaction increments the shared per-vehicle counter **before** re-checking the
interval, which serialises competing reservations that would otherwise write to different documents
and both succeed.

### Assistant flow end to end (prompt 8)

Two-turn conversation, then a real booking:

```
turn 1  "I need a car from the hotel to the airport tomorrow at 6am"
        -> pickup hotel, destination airport, scheduled 2026-09-08T06:00, ready: false
           question: "How many people are travelling?"
turn 2  "3 of us with 4 bags, flight DM1234, meet at arrivals, paying by card"
        -> passengers 3, luggage 4, card, DM1234, Terminal 2 arrivals,
           flightDate 2026-09-08, pickup time unchanged, ready: true
submit  -> FD-F75D3944, status "requested", version 0,
           fare 4500 pence (fixed), pickup "Tuesday 8 September 2026 at 06:00 GMT+1"
replay  -> same idempotency key returned FD-F75D3944 again, no second booking
```

The booking was created by the ordinary `POST /api/bookings` path with the passenger's own
idempotency key, and it landed as `requested` — awaiting dispatch review — not confirmed. The fare
was set by the server's `quote()`, not by the assistant.

### Persistence

Carried over from the earlier session and still true of this build:

- **API restarted**: booking, audit events, payment record and the live session cookie all survived.
  Sessions live in MongoDB, not process memory.
- **`mongod` restarted**: accounts, drivers, vehicles and bookings returned from `.data/mongo`; the
  API reconnected without a restart and the suite passed again.

### Seed safety

`npm run db:reset` refuses to run when `DEMO_MODE !== "true"` and when the target database is not
named `fleet_demo*`. Both refusals were triggered deliberately and confirmed.

## Two defects found and fixed during this round

Both were in the new assistant, both found by the manual HTTP pass rather than the unit tests, and
both now have regression tests:

1. **A bare count was read as a clock time.** "3 of us with 4 bags" parsed as 03:00 and silently
   overwrote a pickup time of 06:00 the passenger had already agreed on the previous turn. A number
   is now only treated as a time when a colon, an am/pm suffix or a preceding "at" marks it as one.
2. **The flight date was derived inconsistently.** It was filled in only when the flight number and
   the pickup time were extracted on the same turn, so a natural two-turn airport booking stalled as
   permanently incomplete. Derivation now runs after the turns are merged.

A third issue was an environment trap, not a code defect: on Windows a second `node` process binds
an already-bound port and silently receives no traffic, so the first HTTP run was served by stale
code. This is item 11 in `progress.md`. Kill the listener on port 3001 before assuming a code fault.

## What the assistant is structurally prevented from doing

Verified by the tests named above, not by prompt wording:

- It cannot create, confirm, price, assign or cancel anything. `POST /api/assistant/draft` returns a
  draft form and touches no collection; booking creation stays on the existing validated path.
- Its draft schema has no fare, status, vehicle, driver, reference or version field, and injected
  ones are discarded before the passenger sees them.
- The passenger must press "Use these details" and then submit the reviewed form. Two deliberate
  confirmations sit between the model and any stored record.
- Bookings it helps draft arrive as `requested` — awaiting dispatch review.
- Output is re-validated server-side regardless of origin: non-synthetic contacts, impossible UK
  clock times, past pickups and identical endpoints are dropped and reported to the passenger.
- The driver seat cannot reach the endpoint at all; calls are rate-limited to 30 per 5 minutes.

## Not verified

Stated plainly so nothing here is read as broader than it is.

1. **The OpenAI path has never been exercised.** No API key was available, so every assistant result
   in this report came from the deterministic keyword extractor. The request shape, JSON parsing,
   timeout and failure fallback are written and type-checked but **untested against the live API**.
   The UI says which provider produced each draft. This is the one open setup dependency.
2. **No browser testing.** All three interfaces were driven over HTTP, not clicked through in a real
   browser, and no cross-browser or screen-reader testing was done. `docs/test-cases.md` is the test
   plan for closing this gap; it has been written but **not executed**.
3. **No load or soak testing.** The concurrency evidence is correctness under simultaneous writes,
   not throughput, and the fleet is four cars.
4. **Single-node replica set.** Transactions are genuine, but failover, elections and replica lag
   are untested — there is only one node.
5. **No backup or restore drill.** Data survived process restarts; a documented backup/restore cycle
   has not been rehearsed.
6. **Not deployed anywhere.** Hosting is documented in `docs/hosting.md` and has not been executed.
7. **Demo-grade authentication.** One shared published password, no MFA, no lockout, no sign-in
   auditing.

## Conclusion

Milestones 0–9 are implemented and checked as described: 57 automated tests against a real MongoDB
replica set, plus manual HTTP verification of three isolated sessions, a five-way reservation race
with exactly one winner, and the assistant-to-booking flow.

This is a demonstration build. It is **not production ready**, and the gaps above are the reason.
