# Ask Fleet: company knowledge and live bookings

The user authorised this read-only extension on 7 September 2026. Open **Ask Fleet** below the main workspace in passenger, driver or dispatch after signing in. Try “What is the luggage policy and my booking status?” Drivers can also ask “What is the breakdown procedure?”

## Two sources, one panel

- Company guidance: versioned, audience-filtered excerpts from `knowledge/company.json`. The current 23 excerpts are **demo guidance, not company-approved policies**. Search ranks matching words in titles, keywords and text. This is lexical retrieval, not embeddings or model training.
- Booking facts: MongoDB reads scoped by the authenticated actor, with a current snapshot timestamp. Passengers see their own bookings; drivers see offered/assigned jobs; dispatch sees its authorised scope. Up to five active bookings are shown, or one exact reference, including completed bookings when requested explicitly. No contact fields, other fleet vehicles, GPS or invented ETAs are added.

The model cannot select a database query, inspect bookings or perform actions. Its optional response covers the retrieved guidance only; booking cards are rendered from backend facts. `/api/assistant/draft` remains unchanged and only drafts the ordinary booking form.

## The demo corpus

23 documents, all `demo` except two kept deliberately unusable:

| Audience | Covers |
|---|---|
| Everyone (16) | luggage, cancellation, airport meeting, fares and payments, waiting time, amending a booking, lost property, child seats, assistance animals, smoking, accessible vehicles, receipts, complaints, data privacy |
| Driver and dispatch (6) | no-show, breakdown, conduct and identification, vehicle checks, incidents, hours and breaks |
| Dispatch only (1) | escalation |

`surge-pricing` is `draft` and `cancellation-v0` is `retired`. Neither is ever retrieved — they exist
so status filtering can be demonstrated live rather than only asserted in a test.

Every entry opens with "Demo guidance, not company-approved policy" and describes **what this build
actually does**, including where a real policy is missing. Nothing invents an operator rule: the
child-seat entry says seats are not modelled, the assistance-animal entry says UK law has not been
reviewed. That keeps the corpus useful for a demonstration without fabricating policy.

## Loading approved company information

An operator/developer can edit the server-only `knowledge/company.json` corpus. Each entry requires a unique `id`, `title`, `version`, `audience`, `status`, ISO `reviewedAt` date, `keywords` and `text` (up to 4,000 characters). Split a long policy into topic sections with separate IDs and clear titles. Keep at most 200 entries in this initial implementation.

Only use `approved` after the company approves the wording. Limit internal procedures to `driver` and `dispatch`. Mark superseded sections `retired`; `draft` and `retired` documents are never retrieved. Update the version and reviewed date when wording changes. Changes are read on the next request. Validate by running the support tests and querying a representative question as each role.

No document upload UI, PDF parser, vector index, admin approval workflow or automatic expiry policy is implemented. Company documents have not yet been supplied. This small corpus is source-controlled configuration, not another database. Booking persistence remains MongoDB.

## Optional AI wording

Default: direct document excerpts + real booking lookup, labelled “no AI generation”. To enable AI wording, configure `OPENAI_API_KEY`, `OPENAI_MODEL` and `SUPPORT_AI_ENABLED=true` server-side, then restart the API. No secret belongs in client code. The provider receives the question and permitted excerpts, never the booking records; users should avoid typing sensitive data into company questions. Response storage is disabled with `store:false`.

The implementation uses the [official Responses structured-output format](https://developers.openai.com/api/docs/guides/structured-outputs), a 12-second timeout, 800 output-token limit, bounded input and the existing assistant request limiter. Invalid output, unsupported citations, refusals and provider errors fall back to source excerpts. Requests and provider payloads are not logged by the new service.

The live provider path **was tested on 7 September 2026** with a real `OPENAI_API_KEY` and
`SUPPORT_AI_ENABLED=true`, using `gpt-4o-mini`. A passenger asking "What is your luggage policy?"
returned `provider: openai` with a generated answer grounded in the cited `passenger-luggage`
excerpt and correctly describing it as demo guidance. Role filtering held with AI enabled: a driver
asking about a no-show received `driver-no-show`, while a passenger asking the same question
received no sources and no leaked driver guidance. The booking draft assistant also returned
`provider: openai` and produced a correct multi-field draft. Fallback behaviour remains covered by
an injected HTTP adapter in the tests, which never call the network. Generated answers can still misinterpret sources; inspect citations and conduct company-specific evaluations before enabling this for real customers.

## The panel

`client/components/FleetSupport.jsx`, mounted by `SeatShell` in all three signed-in workspaces and
collapsed by default. It is a native `<details>`, so it opens from the keyboard without custom key
handling, and the whole panel works at 390 px.

A reply is shown in three clearly separated parts, because they carry different authority:

1. **Provider label** — "Document search · no AI generation" or "AI wording from cited documents".
   Keyword search is never presented as AI.
2. **Company guidance** — one expandable card per source, each carrying title, source ID, version,
   reviewed date, and a `Demo — not company-approved` or `Approved` chip. When retrieval finds
   nothing, the panel says so and states plainly that nothing was invented.
3. **Your booking facts** — deterministic backend cards with lifecycle, assignment and payment as
   three separate status pills, plus the snapshot time and a **Refresh** button that re-asks the
   same question. Every card repeats that the fare is a simulated demo figure and that no live
   location, ETA or flight status exists.

Role-specific example questions are offered as one-tap chips. A malformed booking reference is
caught in the form before a request is sent. Submitting clears the previous answer first, so a
failure can never leave a stale reply looking current.

`SeatShell` mounts the panel with `key={user.id}`: switching account remounts it with empty state,
and signing out unmounts it. A previous user's private results cannot persist on screen.

## Answering booking questions

"Is my booking confirmed?" is answered by the database, not by a document and not by the model. The
reply opens with a sentence computed from the same rows shown in the cards below:

> You have 5 active bookings: 2 confirmed, 3 awaiting review. None has a driver assigned yet.

With one booking, or when a reference was supplied, it names that booking instead:

> FD-87097D2B is confirmed, no driver assigned yet, payment outstanding.

This is arithmetic over backend results — lifecycle, assignment and payment stay separate, exactly as
in the cards. The model is never consulted for it, so a booking fact cannot be hallucinated. The
policy caveat still follows, because a booking summary is not a company policy.

## When no document matches

Retrieval is a lexical score with a threshold, so many reasonable questions match nothing — "Who is
my driver?" and "is my booking confirmed?" are answered entirely by the booking data. The reply used
to say only "ask the office", which read as a failure when the backend had in fact answered the
question; it now leads with the factual summary above. It now still refuses to
invent a policy and still refers policy questions to the office, but also states what the
deterministic lookup found: that the booking details are shown below, or that the account has no
active bookings, or that a driver has no offered or assigned jobs. This wording describes backend
results only; it never answers the policy question itself.

## Freshness and permissions

Answers are snapshots. Submit again to refresh; the support panel does not poll. Requests clear prior answers, so an error does not masquerade as a current response. Session auth and CSRF protect the POST read endpoint. Missing and forbidden references share the same 404. No writes occur, so booking versions/idempotency/audits remain on the existing action services rather than being invented for a read.

No deployment, real payment, notification or production rollout is included.
