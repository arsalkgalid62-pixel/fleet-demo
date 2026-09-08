# UK location integration

React JSX + Leaflet map controls, browser geolocation, server-side Geoapify UK address search,
custom booking pins and MongoDB-backed driver location sharing are implemented.
The fleet and fares remain a demo. No native navigation or background GPS guarantee is provided.

## Setup

Merge `.env.locations.example` into your local `.env` without replacing existing settings.
Use `GEOAPIFY_API_KEY` for server-side search and routing. Use a separate browser-visible,
origin-restricted key as `VITE_GEOAPIFY_MAP_KEY` for street-map tiles. Restart the API and rebuild
the frontend after configuring keys. No external API calls are made if the relevant key is missing.
Never use a secret server key as a VITE variable. Provider usage may incur charges.

Without keys: UK test points, manual coordinates, a blank coordinate canvas and scoped driver
telemetry work. The canvas explicitly says it is not a street map. Search returns unavailable.
Custom journeys save as requested but cannot confirm without a road travel estimate. Existing
five-address demo bookings remain usable with their labelled estimated travel times.

## Passenger flow

Select the sample journey type, then expand Pickup/Destination custom location controls. Search a
UK address, click the map, enter coordinates or select a UK test point. Press Apply, review the
pin description, and submit the ordinary booking form. Selecting another sample address clears
its custom pin. Choose the Airport option if airport fields are required; pin labels do not
automatically classify airports. Existing sample fares are still demo flat quotes, not a mileage
tariff. Server confirmation fetches a road-time estimate before checking the buffered reservation.

The current service-area rectangle is latitude 53.2–53.7 and longitude -2.6–-1.9. It is a Manchester
demo assumption, not a UK national border or the client's approved operating area. Search is
restricted to country code GB but results outside this rectangle cannot be booked. Pickpoints
require human review; the system does not establish road access, wheelchair access or taxi ranks.

## Test from Pakistan

1. Use UK test Piccadilly and Manchester Airport buttons; they never overwrite real device GPS.
2. Use My Location can locate your actual Pakistan phone with permission. The coordinates stay
   in the form until Apply/Submit; outside-area points cannot be applied. Denied permission has
   a manual fallback. HTTPS (or localhost) is required by browsers.
3. Create a normal sample journey, confirm, offer and accept as driver. Press Advance UK test
   position; the same simulated coordinate appears in passenger and dispatch tracking views.
4. Stop and hide location clears the shared position. Cancel or withdraw the booking to verify
   the old driver loses access. Expired or completed trip locations are not exposed.
5. Test device GPS on an actual UK phone with the client before operational use. Browser GPS
   overrides and test movement validate app behaviour, not hardware accuracy or background tracking.

## Driver tracking

Share Device GPS prompts for permission and sends at most one sample every ten seconds while
the page is visible. Views poll every five seconds. Samples are labelled device-reported (not
attested GPS) or UK test simulation. Samples older than 30 seconds show stale; records expire
after 15 minutes via MongoDB TTL. Trip ownership and active accepted state are checked on every
read/write; cancellation/withdrawal are authoritative. Closing or hiding the page stops capture;
last-known data becomes stale. Explicit Stop also hides the saved point.

Writes require auth, CSRF, booking version, telemetry version, idempotency and an audit event.
The service takes a booking write lock within the telemetry transaction to serialize assignment
changes. Audit details omit coordinates. Idempotency fingerprints and event metadata follow the
existing demo retention behaviour. This is not a full location-retention or compliance programme.

Live GPS is shown in tracking panels, not sent to the chatbot model. No live traffic ETA,
turn-by-turn instructions, map matching, continuous passenger tracking or fleet-wide GPS map
has been added. Route estimates are used conservatively for custom booking capacity.

Sources: [Leaflet](https://leafletjs.com/reference),
[Geoapify geocoding](https://apidocs.geoapify.com/docs/geocoding/),
[Geoapify routing](https://apidocs.geoapify.com/docs/routing/),
[browser geolocation](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API).

## Live verification (7 September 2026)

The server-side adapter was tested against the real Geoapify API with a free key:

| Endpoint | Result |
|---|---|
| `v1/geocode/search` | 5 UK results for "Manchester Piccadilly", `countrycode:gb` filter applied, attribution returned |
| `v1/routing` | Piccadilly → Manchester Airport: 996s (~17 min), 15.6 km |
| Custom map-pin journey through the app | Confirmed, vehicle reserved, route stored as `Geoapify · 17 min · 15.6 km` |

Only three Geoapify products are used: **Geocoding**, **Routing** and **Map Tiles**. Nothing calls
Autocomplete, Reverse Geocoding, Batch, Postcode, IP Geolocation, Route Matrix, Map Matching, Route
Planner, Isolines, Geometry, Elevation, Places, Place Details, Boundaries or Static Maps.

Map tiles remain untested: `VITE_GEOAPIFY_MAP_KEY` needs a **separate, origin-restricted** key
because `VITE_` values are bundled into the browser. Do not reuse the server key there.

Tests never reach the live provider — `tests/location.test.ts` removes `GEOAPIFY_API_KEY` for the
duration of the suite and restores it afterwards.

## Map tiles enabled (8 September 2026)

`VITE_GEOAPIFY_MAP_KEY` is set and the basemap renders. The tile endpoint was verified directly:
`maps.geoapify.com/v1/tile/osm-carto/12/2016/1341.png` returned HTTP 200, `image/png`, 23 kB.

`VITE_`-prefixed values are compiled into the JavaScript bundle and are readable by every visitor —
this was confirmed by searching the built output. Restrict the key to your origin in the Geoapify
dashboard, and prefer a separate key from the server-side `GEOAPIFY_API_KEY`.
