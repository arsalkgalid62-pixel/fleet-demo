# Fleet Demo — build sequence and demo plan

## Build sequence

| Day | Milestone | Status |
|---|---|---|
| 1 | Plan, foundation, booking service (prompts 0–2) | **Done** |
| 2 | Dispatch dashboard, driver interface (prompts 3–4) | **Done** |
| 3 | Passenger flow, shared updates, map simulation (prompts 5–6) | **Done** |
| 4 | Fare/payment/notification previews (prompt 7); AI assistant (prompt 8) | **Done** |
| 5 | End-to-end verification and demo package (prompts 9–10) | **Done** |

Prompts 0–10 are complete. What remains needs separately approved scope (prompts 11–13), and the
browser test pass in `docs/test-cases.md` has been written but not executed.

## Setup before the demo

```bash
npm run db:local      # terminal 1 — leave running
npm run db:reset      # terminal 2 — clean synthetic data
npm run dev           # terminal 2
```

Open <http://localhost:5173> and use the landing page to open each role in its own tab. Sign in:
`passenger`, `dispatch`, `drv-ashton` — password `demo-fleet-2026` for all.

Arrange three windows side by side. The dispatch window wants the most space.

## Five-to-seven minute walkthrough

**1 · Frame it (30s)** — One UK operator, four cars, five drivers, no dispatch software today.
Three connected interfaces over one shared booking service. Say plainly: this is a demonstration
build, not a production system.

**2 · Passenger books an airport transfer (60s)** — Riverside Hotel → Airport Terminal 2, two
passengers, two bags, flight `DM9001`. Point out the indicative fare labelled *demo assumptions —
not company-approved*. Submit. It shows **awaiting review**, not confirmed — the software does not
promise a car it has not reserved.

**3 · Dispatch confirms (60s)** — The request appears in the dispatch queue within about three
seconds. Confirm it: the server reserves a specific vehicle for the whole buffered interval before
saying yes. Show the fleet table — driver, current job, next commitment. Offer the job to the driver
holding that car.

**4 · Driver accepts (45s)** — The offer appears on the driver screen with a live countdown. Accept.
Watch dispatch and the passenger both update. Advance: on the way → arrived → passenger on board.

**5 · Simulated movement (45s)** — The marker moves along the schematic route. Say clearly that it
is a diagram, not a map, and that no map provider is connected. Pause and resume from dispatch —
position comes from server state, so all three views agree.

**6 · Completion and payment (45s)** — Complete the journey. Payment still shows **outstanding**:
finishing a trip does not mean it has been paid. Record a simulated card payment from dispatch.
Show the audit history: every actor and change, in order.

**7 · What is real (60s)** — Real: persistence, validation, permissions, transactional capacity
reservation, idempotency, audit trail. Simulated and labelled: movement, maps, fares, payments,
flights, messages. Then the honest next-phase list.

### Optional, if there is time

- **Booking assistant** — on the passenger screen, type *"I need a car from the hotel to the airport
  tomorrow at 6am"*, then *"3 of us with 4 bags, flight DM1234, meet at arrivals"*. It asks for what
  is missing rather than inventing it, and fills the form in. Say two things plainly: it only fills
  the form — the passenger still reviews it and submits it themselves, and the booking still arrives
  as **awaiting review**; and unless an API key is configured it is keyword matching on the server,
  not a language model, which the panel states on screen. It cannot price, book, confirm or assign.
- **Capacity refusal** — request an overlapping journey when the fleet is busy; it stays awaiting
  review instead of falsely confirming.
- **Offer expiry** — offer a job and leave it 60 seconds; it returns to the queue with an alert.
- **Flight delay** — trigger the simulated delay on an airport job. It flags the booking and
  *proposes* a change for the dispatcher; it never reschedules silently.

## Things to say honestly, unprompted

- Demo authentication is not production authentication — accounts share a published password.
- Fares are illustrative. This is not an approved tariff and not a taxi meter.
- No card is charged, no SMS or email is sent, no flight data is live.
- Updates arrive by polling every ~3 seconds, not instantly. The interface shows its own freshness.
- The booking assistant drafts a form and nothing more. With no API key configured it is keyword
  matching, not AI, and the OpenAI path has never been run against the live API.
- Nothing is deployed.

## Recovery during the demo

| Problem | Fix |
|---|---|
| Data looks wrong | `npm run db:reset` in a spare terminal, then reload all tabs |
| A tab lost its session | Sign in again in that tab only; other tabs are unaffected |
| API stopped | Restart `npm run dev`; bookings and sessions survive in MongoDB |
| Stale-data banner | Expected on network loss. The screen says so and recovers by itself. |
| MongoDB stopped | `npm run db:local` in a spare terminal. Data survives in `.data/mongo`; the API reconnects on its own |
| API serving stale code | On Windows a second `node` can bind an already-bound port and receive nothing. Kill the process listening on 3001 before assuming a code fault |

A dry run before the client call is worth the ten minutes.

## Related documents

- `docs/test-cases.md` — 55 browser test cases to execute by hand before a demo.
- `docs/verification.md` — what was actually tested, and what was not.
- `docs/hosting.md` — the hosting plan. Nothing has been deployed.
