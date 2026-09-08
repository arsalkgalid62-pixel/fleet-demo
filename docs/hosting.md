# Fleet Demo — hosting runbook

Prompt 10. **Nothing here has been executed.** This is the plan for hosting the demo when someone
asks for it; no service has been provisioned, deployed or published, and no account has been bought.
Treat every command below as untested against a real platform.

## Shape

One Node.js service, one MongoDB replica set. No microservices, no separate frontend host.

```
        HTTPS (terminated by the platform / a reverse proxy)
                              │
                    ┌─────────▼─────────┐
                    │  Node 22 service  │   npm start  →  server/index.ts
                    │  ─────────────────│
                    │  Express API      │   /api/*
                    │  React build      │   everything else, from dist/
                    └─────────┬─────────┘
                              │  mongodb+srv, TLS
                    ┌─────────▼─────────┐
                    │ MongoDB replica   │   app data + sessions + indexes
                    │ set (3 members)   │   transactions require a replica set
                    └───────────────────┘
```

The same process serves the React build and the API, so the frontend and API are **same-origin**.
That is deliberate: session cookies then need no cross-site handling, and the CSRF origin check has
one allowed value. Splitting them onto separate hosts would mean revisiting cookie `SameSite`,
`ORIGIN` and the proxy config together — do not do it casually.

## Why a replica set is not optional

A single `mongod` cannot serve this application. Two features depend on a replica set:

- **Transactions.** Every reservation, offer and payment write runs inside one. `connectDb()` checks
  `hello.setName` at startup and refuses to boot without it, on purpose.
- **The `scheduleVersion` lock.** The per-vehicle counter that serialises competing reservations is
  incremented inside those transactions. Without them, two overlapping journeys can both confirm.

For production, use three members so a node can be lost without losing writes. The demo has been run
only against a **single-node** replica set: transactions work, but failover has never been tested
(see `docs/verification.md`).

## Environment variables

| Variable | Required | Notes |
|---|---|---|
| `MONGODB_URI` | yes | Must point at a replica set. Keep in the platform secret store, never in the image |
| `SESSION_SECRET` | yes | At least 32 random characters; startup refuses anything shorter. Rotating it signs everyone out |
| `NODE_ENV` | yes | Set to `production` — this is what turns on `Secure` cookies |
| `PORT` | no | Defaults to 3001 |
| `ORIGIN` | yes | The public HTTPS origin, e.g. `https://demo.example.com`. Used for the CSRF origin check |
| `DEMO_MODE` | yes | Must stay `true` while the data is synthetic. `npm run db:reset` refuses to run without it |
| `OPENAI_API_KEY` | no | Omit and the assistant runs its deterministic path and says so in the UI |
| `OPENAI_MODEL` | no | Defaults to `gpt-4o-mini` |

Never put `MONGODB_URI`, `SESSION_SECRET` or `OPENAI_API_KEY` in the client bundle, the repository,
or a build argument. They are read server-side only.

## Startup sequence

```bash
npm ci                 # reproducible install from package-lock.json
npm run build          # tsc --noEmit && vite build  →  dist/
npm run db:setup       # creates indexes and seeds synthetic accounts
npm start              # serves dist/ and /api on $PORT
```

`npm run build` must run before `npm start`: the static handler only mounts if `dist/` exists, and
without it the service answers the API but serves no interface. `db:setup` is idempotent and safe to
re-run; `db:reset` is destructive and guarded.

## Health checks

- **Liveness and readiness**: `GET /api/health` → `{"ok":true,"mode":"demo","serverTime":"…"}`.
  It returns 200 as soon as the process is listening.
- **Caveat worth knowing before you wire an alert to it**: this endpoint does not probe MongoDB.
  The process only starts if the initial connection and the replica-set check succeed, but if
  MongoDB goes down afterwards the health check keeps returning 200 while requests fail. For a real
  deployment, either extend it with a ping or alert on API error rates instead.
- Unknown `/api/*` paths return 401 to signed-out callers rather than 404, because authentication
  runs before the not-found handler. Deliberate, but it will confuse a naive uptime probe.

## Database access

- Restrict network access to the application's egress addresses; do not expose the database publicly.
- Give the service one user scoped to its own database, with read/write only — no admin rights.
- Require TLS on the connection.
- Sessions live in the `sessions` collection with an 8-hour TTL, sharing the application's connection
  pool. Losing the database signs everyone out; it does not corrupt bookings.

## Backup and restore

Not rehearsed. Before this is used for anything that matters, run and time a full
`mongodump`/`mongorestore` cycle into an empty database, then confirm the suite passes against the
restored copy. Verified data so far extends only to surviving process and `mongod` restarts from
`.data/mongo`.

## Before anyone calls this production

Ordered by how much it matters. Items 1–3 are not negotiable for real passenger data.

1. **Replace the demo authentication.** One shared published password, no MFA, no lockout beyond a
   per-IP rate limit, no sign-in auditing. Every account currently uses the same credential.
2. **Remove the synthetic-data guards deliberately, not accidentally.** `@example.invalid` contacts,
   `DEMO_MODE`, the seed guards and the simulation labels are load-bearing safety features. Whoever
   removes them must replace them with real equivalents, not just delete them.
3. **Make the simulations real or remove them.** Vehicle movement, maps, fares, payments, flight
   updates and notifications are all simulated and labelled as such. No card is charged and no
   message is sent. A real deployment needs a payment provider, a messaging provider, a map/routing
   provider and a flight data source — each with its own contract, keys and failure handling.
4. **Three-member replica set with tested failover**, plus the backup drill above.
5. **Revisit the polling model.** ~3-second polling is fine for four cars and three tabs. It is not
   fine at scale; that is when the optional authenticated Socket.IO path becomes worth adding.
6. **Approve the tariff.** Fares are `demo-v1` demonstration assumptions, not a company-approved
   tariff and not a taxi meter.
7. **Logging and observability.** There is no structured logging, request tracing or error reporting.
8. **If the assistant is enabled**, the OpenAI path has never been run against the live API (see
   `docs/verification.md`). Budget for a key, set a spend limit, and test it before showing it.

## Deployment

Not done, and not to be done automatically. When it is requested, the decisions still open are the
hosting platform, the MongoDB provider, the domain and TLS termination, and who holds the secrets.
