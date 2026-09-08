# Fleet Demo — UK taxi booking and dispatch

A client demonstration of a branded taxi platform for one UK operator: three connected browser
interfaces (passenger, dispatch, driver) over one shared booking service.

**This is a demonstration build. It is not production-ready.** Company name, city, licensing
authority, fares and operating policies are all unconfirmed. Everything below labelled "simulated"
is exactly that.

---

## Stack

| Layer | Choice |
|---|---|
| Frontend | React 19 (JSX), Vite, React Router, Tailwind CSS v4 |
| Backend | Node 22, Express 5, TypeScript |
| Database | MongoDB 8.2 **replica set** via Mongoose |
| Sessions | `express-session` + `connect-mongo`, argon2id password hashing |

A replica set (not a standalone `mongod`) is required: the booking service uses multi-document
transactions to reserve vehicle capacity safely.

## Prerequisites

- Node.js 22.12 or newer
- No separate MongoDB install needed. `npm run db:local` downloads and supervises the official
  `mongod` binary and runs it as a single-node replica set with a persistent data directory
  (`.data/mongo`). To use MongoDB Atlas or your own replica set instead, set `MONGODB_URI`.

## First run

```bash
npm install
cp .env.example .env          # then set SESSION_SECRET to 32+ random characters

npm run db:local              # terminal 1 — starts the MongoDB replica set, keep running
npm run db:setup              # terminal 2 — creates indexes and synthetic demo data
npm run dev                   # terminal 2 — starts mongo, API and Vite together
```

Then open <http://localhost:5173>. The landing page opens each role in its own tab.

`npm run dev` starts MongoDB, the API and Vite together, so after the first setup it is the only
command you need.

### Demo accounts

All accounts share the password `demo-fleet-2026`.

| Seat | Accounts |
|---|---|
| Passenger | `passenger` |
| Dispatch | `dispatch` |
| Driver | `drv-ashton`, `drv-baker`, `drv-choudhury`, `drv-doyle`, `drv-ellis` |

These are synthetic demo credentials with a published shared password. **Demo authentication is not
production authentication.**

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | MongoDB + API (port 3001) + Vite (port 5173) |
| `npm run db:local` | Local MongoDB replica set only, persistent in `.data/mongo` |
| `npm run db:setup` | Ensure indexes and add demo data if absent |
| `npm run db:reset` | Wipe and recreate demo data (refuses non-demo databases) |
| `npm run build` | `tsc --noEmit` type check, then production client build |
| `npm start` | Single Node service: Express API **and** the built client on port 3001 |
| `npm test` | Full test suite against a real MongoDB replica set |

`npm test` needs `npm run db:local` running. Each suite uses its own `fleet_demo_test_*` database
and drops it afterwards.

## Environment

| Variable | Purpose |
|---|---|
| `MONGODB_URI` | Replica set connection string. Server-side only. |
| `SESSION_SECRET` | Session signing key, 32+ characters. Server-side only. |
| `DEMO_MODE` | Must be `"true"` for seed and reset to run at all. |
| `PORT` | API port, default 3001. |
| `ORIGIN` | Allowed browser origin for writes, default `http://localhost:5173`. |

`.env` is gitignored. No secret is ever sent to the browser.

## Data model

Money is stored as **integer pence**. Times are stored as UTC instants and displayed in
**Europe/London**.

| Collection | Notes |
|---|---|
| `users` | Role and argon2id password hash |
| `drivers` | Duty state; unique partial index on `vehicleId` so one car has at most one driver |
| `vehicles` | Capacity, accessibility, and `scheduleVersion` used as the reservation lock |
| `bookings` | Lifecycle, assignment progress and payment status kept as separate fields |
| `events` | Append-only audit trail: actor, time, change |
| `operations` | `_id` = `actor:idempotencyKey`, the unique index that makes writes idempotent |
| `payments` | Simulated outcomes only |
| `notifications` | SMS/email previews, always `state: preview_only` |
| `sessions` | Server-managed sessions |

Three status axes are deliberately independent:

- **Booking lifecycle** — `requested → confirmed → in_progress → completed`, plus `cancelled` and
  `no_show`
- **Assignment progress** — `unassigned → offered → accepted → on_the_way → arrived`
- **Payment** — `outstanding`, `paid`, `pending`, `failed`

A completed journey can remain unpaid, and a confirmed booking can hold reserved capacity with no
driver assigned yet.

## How double-booking is prevented

Mongoose validation cannot prevent a schedule race: two transactions can each check a different
booking document, both see a free slot, and both commit. Instead:

1. Every reservation opens a transaction and **first increments `scheduleVersion` on the vehicle
   document**. That shared per-vehicle record serialises competing reservations.
2. Inside the same transaction it rechecks the whole interval — pickup travel, estimated duration
   and buffers — against existing confirmed and in-progress bookings.
3. Conflicting transactions abort and retry with a bounded retry count, then surface a 409.

Confirmation reserves feasible vehicle capacity even when no driver has been assigned. If no
vehicle can be shown feasible, the booking **stays awaiting review** rather than being falsely
confirmed.

`tests/concurrency.test.ts` drives these paths with `Promise.all`, not sequentially — a sequential
test would pass even against a broken design.

## Security posture in this demo

Implemented: server-managed sessions in MongoDB, HTTP-only cookies, `SameSite=Lax`, secure cookies
under `NODE_ENV=production`, CSRF tokens bound to the session, same-origin write checks, per-IP
sign-in rate limiting, argon2id hashing, server-side role and ownership checks on every route,
identical 404s for forbidden and missing bookings so references cannot be enumerated.

Each role has its own session cookie jar (`fd.sid.passenger`, `fd.sid.dispatch`, `fd.sid.driver`)
so three tabs stay signed in independently. The browser picks the jar with an `X-Fleet-Seat`
header, which grants nothing — the effective role always comes from the server-side session record.

**Known demo shortcuts:** shared published passwords, no MFA, no account lockout, no password
rotation, no audit of sign-in attempts, and a single trusted demo operator. See
`docs/progress.md`.

## What is real and what is simulated

**Real:** MongoDB persistence, server-side validation, role and ownership enforcement,
transactional vehicle reservation, idempotent writes, optimistic version checks, offer expiry
sweeps, the audit trail, and cross-tab consistency through short polling.

**Simulated and labelled in the UI:** vehicle movement and the schematic route view (no map
provider is configured), fares, card and cash outcomes, flight delays, and all SMS/email previews.
No card is charged and no message is sent. Passenger contacts are restricted to `@example.invalid`
so no address can receive real mail.

## Booking assistant

The passenger screen has a text assistant that reads a journey description and fills the booking
form in. Its authority stops there: `POST /api/assistant/draft` returns a draft and touches no
collection, so it cannot create, price, confirm, assign or cancel anything. The passenger presses
"Use these details", reviews the form, and submits it through the ordinary validated path — so every
existing guard (validation, capacity, idempotency, audit) still applies, and the booking arrives as
**awaiting review**. Its draft schema has no fare, status, vehicle or driver field, and anything of
that kind in a model reply is discarded before the passenger sees it. Output is re-validated
server-side either way: non-synthetic contacts, past or impossible UK clock times and identical
endpoints are dropped and the passenger is told.

Set `OPENAI_API_KEY` (and optionally `OPENAI_MODEL`, default `gpt-4o-mini`) to use OpenAI. **Without
a key it runs a deterministic keyword extractor on the server and the panel says so** — no AI is
involved and nothing pretends otherwise. The OpenAI path has not been exercised against the live API;
see `docs/verification.md`. If the model call fails, the booking flow keeps working on the fallback.

## Company help and live booking information

Open **Ask Fleet** below the passenger, driver or dispatch workspace after signing in. Ask
“What is the luggage policy and my booking status?” to see document excerpts and authorised
live booking cards together. Enter a booking reference for a specific or completed journey.
The panel is read-only and displays when its booking snapshot was retrieved.

The included knowledge is labelled demo guidance. See [company assistant setup](docs/company-assistant.md)
to add approved company content and configure optional AI generation. Without that configuration,
document search and live MongoDB lookup work without AI. No model is trained on company data.

## Hosting (not deployed)

Run one Node service with `npm start`: it serves the built React app and the Express API on the
same origin, so session cookies need no cross-site handling. It requires a durable MongoDB replica
set — transactions and the session store both depend on it. Set `NODE_ENV=production` for secure
cookies, terminate HTTPS in front, and keep `MONGODB_URI` and `SESSION_SECRET` in the platform
secret store. Health check: `GET /api/health`. Nothing has been deployed or published.

The full runbook — environment variables, startup sequence, health-check caveats, database access,
backup gaps and what must change before anyone calls this production — is in `docs/hosting.md`.
