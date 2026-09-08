# Fleet Demo — product specification

## Purpose

A repeatable client demonstration of a branded booking and dispatch platform for **one UK taxi
company** that currently has no dispatch software. Roughly four cars and five drivers. Journeys are
local trips and airport transfers.

The demo must show a passenger booking flowing through dispatch assignment, driver acceptance and
trip completion, with all three interfaces reading and writing the same saved bookings.

iCabbi is a functional reference only. All interface work and branding here is original. No
proprietary assets are copied and no feature parity is claimed. Placeholder brand: **Fleet Demo**.

## Not confirmed by the client

City, licensing authority, licence type (taxi vs private hire), service area, operating hours,
fares and tariff rules, airport buffers, cancellation and no-show policy, payment and refund policy,
driver settlement, accessibility commitments, company name and final branding.

Every fare, buffer and policy in this build is a **demo assumption, not a company-approved rule**,
and is labelled as such in the interface.

## Roles

| Role | Can do |
|---|---|
| Passenger | Create a request, see its own bookings, cancel before pickup |
| Dispatch | See everything; confirm, offer, withdraw, cancel, record no-show, record simulated payment, override fare, drive the simulation |
| Driver | Change duty, accept/decline offers assigned to them, advance their own job |

Enforced server-side on every route. A passenger cannot read another passenger's booking; a driver
cannot read a job offered to someone else. Both cases return the same 404 as a nonexistent booking.

## Domain model

Three independent status axes:

- **Booking lifecycle** — `requested` (awaiting review) → `confirmed` → `in_progress` →
  `completed`; plus `cancelled` and `no_show`
- **Assignment progress** — `unassigned` → `offered` → `accepted` → `on_the_way` → `arrived`
- **Payment** — `outstanding` / `paid` / `pending` / `failed`

Consequences the design depends on:

- A confirmed booking may hold reserved capacity with **no driver assigned**.
- A completed journey may remain **unpaid**. Payment never gates completion.
- Cancelling releases reserved capacity for other bookings.

### Transition rules (enforced in `server/service.ts`)

| Action | Actor | Requires | Result |
|---|---|---|---|
| `confirm` | dispatch | `requested`; a feasible vehicle for the full buffered interval | `confirmed`, vehicle reserved |
| `offer` | dispatch | `confirmed` + `unassigned`; driver on duty in the reserved vehicle | `offered`, 60s deadline |
| `withdraw` | dispatch | `confirmed`, assigned | back to `unassigned` |
| `accept` | driver | `offered`, not expired, driver on duty in that vehicle | `accepted` |
| `decline` | driver | `offered` | back to `unassigned` |
| `on_the_way` / `arrived` | driver | previous step | next progress |
| `start` | driver | `arrived` | `in_progress`, simulation starts |
| `complete` | driver | `in_progress` | `completed` |
| `cancel` | passenger / dispatch | `requested` or `confirmed`; reason required | `cancelled`, capacity released |
| `no_show` | dispatch | `arrived`; reason required | `no_show`, capacity released |
| `payment` | dispatch | `completed`, not already paid | records a simulated payment |
| `fare_override` | dispatch | not closed, not paid; amount and reason required | final fare replaced |

Invalid transitions return 409. Every accepted action appends an audit event and consumes an
idempotency key.

## Capacity check

Deliberately conservative. Confirmation does **not** simply count free cars. For each candidate
vehicle, inside one transaction:

1. Increment the vehicle's `scheduleVersion` — the shared lock that serialises reservations.
2. Reject if seats, luggage capacity or accessibility do not suit the party.
3. Reject if the requested interval overlaps any confirmed or in-progress booking on that vehicle.

The interval is `pickup − 15 min` to `pickup + estimated duration + 15 min`. Estimated duration is a
labelled demo assumption (30 min local, 60 min airport), not a routing calculation.

If nothing is feasible, the booking **stays awaiting review**. It is never falsely confirmed.

## Simulation boundaries

| Area | Status |
|---|---|
| Vehicle movement | Simulated. Server-held state, interpolated between two demo coordinates. |
| Map | Schematic diagram. **No map provider configured.** Not presented as geographic. |
| Fares | Demo tariff. Labelled "not company-approved". Not a taxi meter. |
| Payments | Simulated cash/card outcomes. No processor. Receipts marked "not proof of payment". |
| Flight delays | Operator-triggered simulation. Flags affected jobs for review; never reschedules silently. |
| SMS / email | Preview records only, `state: preview_only`. Nothing is sent. |
| Addresses | Five fixed sample locations. No live address search. |
| Booking assistant | Drafts a form only. Falls back to server-side keyword matching when no `OPENAI_API_KEY` is set, and says which produced each draft. Cannot book, price, confirm or assign. |

## Acceptance criteria for the demo

1. A passenger booking appears in dispatch without a page reload.
2. Dispatch can confirm only when capacity genuinely exists.
3. A driver offer expires on its own and returns to the queue with a dispatcher-visible event.
4. Two concurrent acceptances of one job produce exactly one winner.
5. Two overlapping journeys cannot both reserve the same vehicle.
6. Driver progress updates appear to passenger and dispatch.
7. Cancellation releases capacity for a previously blocked booking.
8. A completed journey can be recorded as paid, failed or pending, and stays consistent in both views.
9. Bookings, audit history and sessions survive a full server restart.
10. Three tabs hold three independent identities.
11. The booking assistant can fill the form in but cannot create, price, confirm or assign anything,
    and bookings it helps draft arrive as awaiting review.

All eleven are covered by automated tests and were verified over real HTTP — see
`docs/verification.md` for what was run and `docs/progress.md` for current status.

## Out of scope for the demo

Real payments, real messaging, live maps or address search, live flight data, native mobile apps,
background location, production identity management, backups and observability. These belong to the
post-demo scope (prompts 11–13) and must not be implied as working.
