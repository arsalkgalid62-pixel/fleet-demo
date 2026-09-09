# Hosted operator model — local preparation

The platform owner retains and operates the source repository and backend. The taxi
company keeps its existing main website and links customers to the hosted passenger
workspace. Browser-delivered JavaScript is still visible to visitors; hosting does not
make frontend code secret.

## Initial scope

One operator with the existing four cars, five drivers and role-scoped sessions.
No multi-company tenancy is implemented. Branding settings must never be treated as
an authorization boundary. Serving multiple companies requires separately designed
company isolation throughout sessions, queries, writes, reservations and documents.

## Local preview

Run the existing MongoDB/API services and `npx vite`. Vite reads the local port from
ORIGIN and proxies API calls to PORT (default 3001). It refuses an occupied port,
preventing the previous silent port change and cross-origin write rejection.
With the current configuration open http://127.0.0.1:5173, not port 5184.
Do not remove CSRF checks or allow arbitrary origins to fix local setup.

## Public branding settings

Optional settings in the local environment:

```dotenv
VITE_OPERATOR_NAME=Fleet
VITE_OPERATOR_TAGLINE=Your local journey, connected.
```

These change the shared wordmark and landing tagline. Restart Vite after changing them;
rebuild for a packaged preview. They are public browser values, never secrets.
Defaults preserve Fleet branding until the client supplies an approved name.
Logo and palette customization are not implemented in this preparation step.

## Proposed addresses — not provisioned

| Address | Purpose |
|---|---|
| company.co.uk | Existing company website |
| book.company.co.uk/book | Passenger booking and tracking |
| book.company.co.uk/admin | Dispatcher/admin login and workspace |
| book.company.co.uk/driver | Driver login and workspace |

Tracking remains behind the owning passenger session. No public tracking links are added.
The `/admin` route currently aliases the dispatcher workspace for this one-operator demo;
it is a stable hosted URL, not yet a separate platform-owner administration panel.

The proposed booking subdomain needs DNS pointing to the hosting service, a verified
hostname, HTTPS and exact allowed-origin configuration. DNS alone does not configure
the application or route a path. Hosting only company.co.uk/admin on a different server
requires a reverse proxy or equivalent routing at the existing website host.
No domains, DNS records, certificates or public hosting have been changed.

## Remaining demo and client decisions

- Free sufficient local disk space, rerun the database suite and finish browser rehearsal.
- Supply the company name, logo, approved guidance and desired booking subdomain.
- Confirm one operator initially versus multiple isolated operators at launch.
- Agree who controls DNS and the existing website's Book button.
- Approve hosting/security scope separately before deployment; see hosting.md.
- Retain simulated payment, message and movement labels throughout the demo.

## Implemented local integration

The React router now exposes `/book` and `/login` as passenger entry points and `/admin`
as the dispatcher entry point. Existing `/passenger`, `/dispatch` and `/driver` routes remain
available, so the operator website can link to stable hosted paths without changing API calls.
