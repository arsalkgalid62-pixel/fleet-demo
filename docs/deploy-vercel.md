# Deploying the demo to Vercel

Prepared 8 September 2026, **not deployed** — no deployment has been made from this workspace, and
none can be without your Vercel credentials.

This is a *demo* deployment. The build is not production-ready; see
"Before anyone calls this production" in `docs/hosting.md`.

## Read this first: Vercel is a compromise

The app is a stateful Express server with sessions, short polling and MongoDB transactions. Vercel
runs serverless functions. It works, but two things had to change and one limitation remains:

| Issue | Handling |
|---|---|
| No long-lived process for the offer-expiry timer | Expiry now also runs on the `/state` poll, which every client hits every ~3s. Works with no timer and no cron. |
| A new MongoDB connection per invocation would exhaust Atlas | The connection is cached on `globalThis`, surviving warm invocations. |
| **Cold starts** | The first request after idle takes several seconds. There is no fix on Hobby — warm it before a demo. |

Render or Fly.io run the app as an ordinary long-lived process and are a better fit. Vercel is fine
for showing it to someone.

## 1 · Database — MongoDB Atlas M0 (free)

The app **refuses to start** without a replica set, because reservations use transactions. Atlas M0
is a real 3-node replica set, so it qualifies. A standalone `mongod` does not.

1. Create a free M0 cluster.
2. Database Access → add a user with read/write on one database.
3. Network Access → allow `0.0.0.0/0` (Vercel's egress IPs are not fixed).
4. Copy the `mongodb+srv://…` connection string.

## 2 · Environment variables

Set these in **Vercel → Settings → Environment Variables**, not in the repo:

| Variable | Value | Notes |
|---|---|---|
| `MONGODB_URI` | Atlas `mongodb+srv://…` | Must be the replica set |
| `SESSION_SECRET` | 32+ random characters | Rotating it signs everyone out |
| `ORIGIN` | `https://your-app.vercel.app` | **Must match exactly.** Wrong value = every write fails CSRF |
| `DEMO_MODE` | `true` | Seed and reset refuse to run without it |
| `ALLOW_REAL_CONTACTS` | `false` | Set false before deploying — see warning below |
| `OPENAI_API_KEY` | optional | Booking assistant + Ask Fleet wording |
| `SUPPORT_AI_ENABLED` | `true` if using OpenAI | Ask Fleet is opt-in even with a key |
| `AVIATIONSTACK_API_KEY` | optional | ~100 requests/month on free |
| `GEOAPIFY_API_KEY` | optional | Address search and routing |
| `VITE_GEOAPIFY_MAP_KEY` | optional | **Compiled into the browser bundle** — restrict it to your Vercel domain first |

`NODE_ENV` is set to `production` by Vercel automatically; cookies are marked Secure regardless,
since Vercel is always HTTPS.

## 3 · Seed the database once

Nothing seeds itself. From your machine, pointed at Atlas:

```bash
MONGODB_URI="mongodb+srv://…" DEMO_MODE=true npm run db:setup
```

That creates the indexes and the demo fleet, drivers and accounts. Without it, sign-in fails because
no users exist.

## 4 · Deploy

```bash
npx vercel          # preview
npx vercel --prod   # production
```

`vercel.json` already routes `/api/*` to the serverless function and everything else to the built
client.

## 5 · Check it worked

```bash
curl https://your-app.vercel.app/api/health
```

Expect `{"ok":true,"mode":"demo",…}`. Then sign in as `passenger` / `demo-fleet-2026`.

## Things that will catch you out

**Wrong `ORIGIN`.** Reads work, every write returns 403 "Cross-origin write rejected". It is the
single most likely failure and the error does not name the cause. Check it first.

**Cold start.** The first hit after idle is slow. Call `/api/health` a few minutes before a demo.

**AviationStack quota.** ~100 requests/month. The cache protects it, but repeated "Check now"
presses during a demo will eat into it.

**Anyone with the URL can sign in.** Every account shares the published password `demo-fleet-2026`,
so a visitor can sign in as dispatch and cancel bookings. Do not index the URL, take it down after
the demo, and keep `ALLOW_REAL_CONTACTS=false` so no real email address is stored in a
publicly reachable database.

**Rotate the API keys** before deploying if they have ever been shared — and restrict
`VITE_GEOAPIFY_MAP_KEY` to the Vercel domain, because it is readable in the client bundle.

## Not verified

**This configuration has never been deployed or run on Vercel.** It type-checks, the full test suite
passes, and the serverless-specific changes (request-path offer expiry, cached connection) are
tested locally — but no real deployment has been made from this workspace. Expect the first deploy
to need a round of iteration, most likely around TypeScript resolution of the `.js` import
specifiers in `api/index.ts`.
