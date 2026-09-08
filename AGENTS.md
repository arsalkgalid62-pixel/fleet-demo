# Fleet Demo — project conventions

Build prompts 0–10 in milestone order. Prompts 11–13 need separately approved production scope.
Preserve existing work; read `docs/progress.md` before starting a milestone.

## Stack (settled — do not substitute)

Frontend: **React JSX** (not TSX), Vite, React Router, Tailwind CSS v4.
Backend: Express 5 + TypeScript, Mongoose, MongoDB **replica set**.
Shared request/response definitions live in `shared/`. One repository, one React app, one Express
backend. No microservices. No other database, ever — if MongoDB is unavailable, report it as a
blocker rather than substituting.

Client code is `.jsx` and is not type-checked by `tsc`; server, shared, scripts and tests are `.ts`
and are.

## Non-negotiable rules

- Synthetic data only. Passenger contacts must match `@example.invalid` **unless**
  `ALLOW_REAL_CONTACTS=true` is set deliberately. The flag defaults off and `.env.example` ships it
  off. Never remove the check itself — and never wire up a mail or SMS provider while real addresses
  can be stored, because the two together would send real messages to real people.
- Label every simulation in the UI: movement, maps, fares, payments, flights, messages. Never let a
  simulated surface read as real.
- No deployment, purchases, real messages or real payments.
- Never claim production readiness. Report what was actually run, not what should work.
- Money is integer pence. Times are stored UTC, displayed `Europe/London`.
- Drivers and vehicles are separate records: five drivers share four cars.

## Server rules

- All writes go through validated service functions in `server/service.ts`. Routes never write
  directly.
- Every write needs: session auth, CSRF, server-side role **and** ownership checks, an expected
  `version`, an idempotency key, and an audit event.
- Never trust a role supplied by the browser. `X-Fleet-Seat` selects a cookie jar only; the role
  comes from the session record.
- Reservation transactions must increment the vehicle's `scheduleVersion` **before** the overlap
  check. That shared lock is what serialises competing reservations — Mongoose validation alone does
  not prevent double booking.
- Forbidden and missing bookings must return an identical 404.
- The booking assistant drafts a form and nothing else. It gets no database access and no write
  path: `POST /api/assistant/draft` returns a draft, and the booking is created only when the
  passenger submits the reviewed form through `createBooking`. Never add a fare, status, vehicle or
  driver field to the draft schema, and never let it confirm, assign or mark anything paid.

## Authorised support extension

The user authorised company-document answers and live booking information together.
`POST /api/assistant/ask` is read-only and separate from the draft endpoint. Its server service
may read bookings within the session actor's scope. The language model has no database access,
booking records or tools. Filter knowledge audiences before retrieval or provider calls.
Keep citations, document versions, demo labels and booking snapshot times visible.

## Flight data

`GET /api/bookings/:id/flight` is read-only and quota-bound. It reports; it never reschedules,
cancels or writes anything — a dispatcher reviews a real delay exactly as with the simulated one.
Never give it a write path. Never bypass the MongoDB cache: the free provider plan allows ~100
requests a month against a 3-second poll. HTTPS is the default and the insecure opt-in must keep
warning at startup. See `docs/flight-data.md`.

## Location and tracking

Cities live in `shared/cities.ts`. The five slot ids are **categories**; each city fills them with
its own real landmarks. Never reintroduce a single hardcoded service-area rectangle — a booking is
validated against its own city, and so is driver GPS for that booking.

Driver positions are visible only to the assigned driver, the owning passenger and dispatch, and
only while the job is accepted and active — a completed or cancelled trip hides the location. Never
widen that scope. `uk-test` positions require `DEMO_MODE=true`. A booking carrying a custom map pin
must not be confirmed without a road travel estimate: it stays awaiting review rather than reusing
the sample journeys' fixed duration. `VITE_`-prefixed keys are bundled into the browser — never put
the server Geoapify key in one. See `docs/location-setup.md`.

## Design system

## Authorised location extension

The user authorised UK location search, manual pins and driver GPS with Pakistan-based UK test mode.
Keep driver telemetry scoped to an accepted active booking. Coordinates are device-reported,
not attested. Test movement must always be labelled simulated. Do not auto-grant browser location
permission. Custom journeys require a provider travel estimate before capacity confirmation.
Read `docs/location-setup.md` for keys and the Manchester demo service-area boundary.

## Design system tokens

Tokens live in `client/index.css`; primitives in `client/components/ui.jsx`; icons in `Icon.jsx`.
Midnight green structures, warm off-white is the canvas, lime is a restrained accent.

- **Lime is never text on a light surface.** It appears as a filled chip behind dark ink, or as a
  small non-text indicator.
- **`ink-400` is the lightest permitted text colour on light surfaces.** `ink-300` and lighter are
  icons, borders and dividers only. On dark panels use `ink-300` or lighter for text — `ink-400`
  is only 3.05:1 on `ink-900`.
- Status is always colour **and** text, never colour alone.
- No emoji. Use `Icon`, which is `aria-hidden` unless given a title.
- Never add a control that looks interactive but does nothing.

## Verification

```bash
npm run db:local     # required for tests; real mongod replica set
npm run build        # tsc --noEmit && vite build
npm test             # 123 tests, real MongoDB
npm run ui:smoke     # server-renders every component; catches runtime crashes tsc/vite cannot
```

Concurrency tests must use `Promise.all`, never sequential calls — a sequential test passes against
a broken design. Each test file uses its own `fleet_demo_test_*` database.

Do not infer a pass from reading code. Run it, and record real results in `docs/progress.md`.
