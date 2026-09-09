import React from 'react';
/**
 * Server-render smoke check for the design system.
 *
 * Not a substitute for looking at the app in a browser, but it executes every
 * presentational component with realistic props and fails loudly on undefined
 * references, bad prop shapes and broken JSX — the crashes a Vite build cannot
 * see because it never runs the code. Run with: npm run ui:smoke
 */
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import Icon, { ICON_NAMES } from '../client/components/Icon.jsx';
import BookingSummary, { Journey } from '../client/components/BookingSummary.jsx';
import RouteMap from '../client/components/RouteMap.jsx';
import PlaceField from '../client/components/PlaceField.jsx';
import Landing from '../client/pages/Landing.jsx';
import Passenger from '../client/pages/Passenger.jsx';
import Dispatch from '../client/pages/Dispatch.jsx';
import Driver, { selectCurrentJob } from '../client/pages/Driver.jsx';
import FleetSupport, { Answer, Guidance, BookingFacts } from '../client/components/FleetSupport.jsx';
import { SessionContext } from '../client/lib/session.jsx';
import FlightStatus, { Body as FlightBody } from '../client/components/FlightStatus.jsx';
import {
  Button, ConnectionStatus, CountdownBar, DataRow, EmptyState, ErrorNote, Field, FieldGroup,
  Metric, Panel, SegmentedControl, SimulationNotice, Skeleton, Spinner, StatusPill, Timeline, pence, label,
} from '../client/components/ui.jsx';

const booking = {
  _id: 'x', reference: 'FD-ABCD1234', status: 'confirmed', progress: 'on_the_way',
  paymentStatus: 'outstanding', version: 3, vehicleId: 'FD-04', driverId: 'drv-doyle',
  fromLabel: 'Demo Riverside Hotel', toLabel: 'Demo Airport · Terminal 2',
  pickupLocalText: 'Tuesday 8 September 2026 at 06:00 BST',
  fare: { type: 'fixed', amount: 4500, pricingVersion: 'demo-v1' },
  simulation: { label: 'Simulated vehicle location', running: true, fraction: 0.42, updatedAt: new Date().toISOString() },
  delay: null,
  input: {
    passengerName: 'A Passenger', contact: 'a@example.invalid', pickup: 'hotel', destination: 'airport',
    passengers: 3, luggage: 4, accessible: true, paymentMethod: 'card',
    instructions: 'Meet at the rank', flightNumber: 'DM1234', flightDate: '2026-09-08', meetingPoint: 'Terminal 2 arrivals',
  },
};
const demoCity = {
  id: 'manchester', name: 'Manchester', region: 'North West England',
  lat: 53.4808, lng: -2.2426, radiusKm: 25, samplePostcode: 'M1 2AP',
  places: [
    { id: 'station', label: 'Manchester Piccadilly Station', lat: 53.4774, lng: -2.2309 },
    { id: 'hotel', label: 'The Midland Hotel, Manchester', lat: 53.4776, lng: -2.2452 },
    { id: 'airport', label: 'Manchester Airport', lat: 53.3654, lng: -2.2725 },
  ],
};

const knowledge = [
  { id: 'passenger-luggage', title: 'Luggage and accessibility — demo guide', version: 'vdemo-1',
    status: 'demo', reviewedAt: '2026-09-07', audience: ['passenger'], keywords: ['luggage'],
    text: 'Demo guidance about luggage allowances.' },
  { id: 'approved-example', title: 'An approved document', version: 'v2', status: 'approved',
    reviewedAt: '2026-09-01', audience: ['passenger'], keywords: ['x'], text: 'Approved wording.' },
];
const liveBooking = {
  reference: 'FD-ABCD1234', status: 'confirmed', progress: 'offered', paymentStatus: 'outstanding',
  pickup: 'Demo Riverside Hotel', destination: 'Demo Airport · Terminal 2',
  pickupTime: 'Tuesday 8 September 2026 at 06:00 BST', driver: 'A. Ashton', vehicle: 'Accessible MPV',
  farePence: 4500, fareType: 'fixed', meetingPoint: 'Terminal 2 arrivals', instructions: 'Meet at the rank', version: 3,
};
const replyBase = {
  answer: 'These company-document excerpts may help.', sources: knowledge, provider: 'document-search',
  notice: 'Document search + live database lookup. No AI-generated answer.',
  bookings: [liveBooking], fetchedAt: new Date().toISOString(), bookingNotice: 'Up to five active bookings.',
};
const flightOk = {
  state: 'ok',
  flight: {
    source: 'aviationstack', flightIata: 'DM1234', flightDate: '2026-09-08', status: 'active',
    airline: 'Demo Airways', delayMinutes: 35, fetchedAt: new Date().toISOString(), cached: true,
    departure: { airport: 'Demo Origin', iata: 'ORI', terminal: '1', gate: 'A1', scheduled: '2026-09-08T04:00:00Z', estimated: null, actual: null, delayMinutes: null },
    arrival: { airport: 'Demo Airport', iata: 'DEM', terminal: '2', gate: 'B5', scheduled: '2026-09-08T06:00:00Z', estimated: '2026-09-08T06:35:00Z', actual: null, delayMinutes: 35 },
  },
};
const flightApi = (state) => ({ flight: async () => state });

const session = (role) => ({
  api: {
    askFleet: async () => replyBase,
    session: async () => ({}), reference: async () => ({}), state: async () => ({}),
    booking: async () => ({ events: [], payments: [] }), notifications: async () => ({ rows: [] }),
    flight: async () => ({ state: 'not_applicable' }), autocomplete: async () => ({ results: [] }),
    act: async () => ({}), createBooking: async () => ({}), setDuty: async () => ({}),
    assistantDraft: async () => ({}), searchUK: async () => ({ results: [] }),
  },
  user: { id: 'u1', role, name: 'Test User' },
  seat: role, ready: true, error: null, signIn: () => {}, signOut: () => {},
});

/* The three workspaces, rendered whole.
 *
 * Components were covered but pages were not, so a reference error in a page
 * body reached production: Passenger read `city` above its own declaration and
 * white-screened, while Dispatch and Driver were fine. Rendering each page here
 * catches that class of fault before it ships. */
const page = (El, role) => (
  <MemoryRouter>
    <SessionContext.Provider value={session(role)}>
      <El />
    </SessionContext.Provider>
  </MemoryRouter>
);

const cases = {
  'every icon': <>{ICON_NAMES.map((n) => <Icon key={n} name={n} />)}</>,
  'unknown icon degrades': <Icon name="does-not-exist" />,
  'buttons': <>{['primary','secondary','quiet','danger','accent'].map((v) => <Button key={v} variant={v} icon="check">{v}</Button>)}<Button loading>load</Button></>,
  'status pills': <>{Object.keys({requested:1,confirmed:1,in_progress:1,completed:1,cancelled:1,no_show:1,offered:1,paid:1,failed:1,unknown_value:1}).map((s) => <StatusPill key={s} value={s} prefix="x" />)}</>,
  'panel + metric': <Panel title="T" subtitle="s" icon="car" action={<StatusPill value="paid" />}><Metric caption="C" value={4} hint="h" tone="wait" icon="clock" /></Panel>,
  'booking summary': <BookingSummary booking={booking} />,
  'booking summary, no contact': <BookingSummary booking={{ ...booking, delay: { minutes: 30, proposedPickupAt: new Date().toISOString() }, fare: { ...booking.fare, finalAmount: 5000, overrideReason: 'x' } }} showContact={false} />,
  'journey long labels': <Journey from={'A very long pickup name '.repeat(4)} to={'A very long destination '.repeat(4)} size="lg" />,
  'route map running': <RouteMap simulation={booking.simulation} fromLabel="A" toLabel="B" />,
  'route map idle': <RouteMap simulation={null} fromLabel="A" toLabel="B" />,
  'place field · nothing chosen': <SessionContext.Provider value={session('passenger')}><PlaceField label="Pickup" icon="pin" city={demoCity} onChange={() => {}} /></SessionContext.Provider>,
  'place field · sample chosen': <SessionContext.Provider value={session('passenger')}><PlaceField label="Pickup" icon="pin" city={demoCity} slot="station" onChange={() => {}} /></SessionContext.Provider>,
  'place field · custom pin chosen': <SessionContext.Provider value={session('passenger')}><PlaceField label="Destination" icon="flag" city={demoCity} point={{ label: '42 Example Street, Manchester', lat: 53.48, lng: -2.24, source: 'search' }} onChange={() => {}} /></SessionContext.Provider>,
  'place field · no city yet': <SessionContext.Provider value={session('passenger')}><PlaceField label="Pickup" icon="pin" onChange={() => {}} /></SessionContext.Provider>,
  'segmented': <SegmentedControl name="n" value="a" onChange={() => {}} options={[{value:'a',label:'A',icon:'check',count:2},{value:'b',label:'B',disabled:true}]} />,
  'timeline': <Timeline steps={[{key:'1',title:'One',detail:'d',state:'done'},{key:'2',title:'Two',state:'current'},{key:'3',title:'Three',state:'todo'}]} />,
  'countdown': <><CountdownBar remainingMs={45000} /><CountdownBar remainingMs={8000} /><CountdownBar remainingMs={0} /></>,
  'states': <><EmptyState title="Empty" icon="car">body</EmptyState><ErrorNote onDismiss={() => {}}>err</ErrorNote><Spinner /><Skeleton /><SimulationNotice>note</SimulationNotice></>,
  'fields': <FieldGroup title="G" icon="users"><Field label="L" hint="h" required error="e" htmlFor="i"><input id="i" /></Field><DataRow label="D" icon="car" mono>v</DataRow></FieldGroup>,
  'connection': <><ConnectionStatus updatedAt={new Date()} offline={false} onRefresh={() => {}} /><ConnectionStatus updatedAt={null} offline compact /></>,
  'landing page': <MemoryRouter><Landing /></MemoryRouter>,
  'page · passenger workspace': page(Passenger, 'passenger'),
  'page · dispatch workspace': page(Dispatch, 'dispatch'),
  'page · driver workspace': page(Driver, 'driver'),
  'ask fleet · passenger': <SessionContext.Provider value={session('passenger')}><FleetSupport /></SessionContext.Provider>,
  'ask fleet · driver': <SessionContext.Provider value={session('driver')}><FleetSupport /></SessionContext.Provider>,
  'ask fleet · dispatch': <SessionContext.Provider value={session('dispatch')}><FleetSupport /></SessionContext.Provider>,
  'answer · document search': <Answer reply={replyBase} />,
  'answer · ai provider': <Answer reply={{ ...replyBase, provider: 'openai' }} />,
  'guidance · demo and approved': <Guidance sources={knowledge} />,
  'guidance · no sources': <Guidance sources={[]} />,
  'booking facts': <BookingFacts reply={replyBase} busy={false} onRefresh={() => {}} />,
  'booking facts · none': <BookingFacts reply={{ ...replyBase, bookings: [] }} busy={false} onRefresh={() => {}} />,
  'flight wrapper (header)': <FlightStatus api={flightApi(flightOk)} bookingId="b1" flightNumber="DM1234" />,
  'flight · ok with delay': <FlightBody data={flightOk} />,
  'flight · unconfigured': <FlightBody data={{ state: 'unconfigured' }} />,
  'flight · unavailable': <FlightBody data={{ state: 'unavailable', reason: 'The flight data plan has hit its request limit.' }} />,
  'flight · not found': <FlightBody data={{ state: 'not_found', flightIata: 'DM1234', flightDate: '2026-09-08' }} />,
  'flight · on time (delay 0)': <FlightBody data={{ state: 'ok', flight: { ...flightOk.flight, delayMinutes: 0 } }} />,
  'flight · delay not reported': <FlightBody data={{ state: 'ok', flight: { ...flightOk.flight, delayMinutes: null } }} />,
  'flight · missing times and gates': <FlightBody data={{ state: 'ok', flight: { ...flightOk.flight, airline: null, delayMinutes: null, cached: false, departure: { airport: null, iata: null, terminal: null, gate: null, scheduled: null, estimated: null, actual: null, delayMinutes: null }, arrival: { ...flightOk.flight.arrival, terminal: null, gate: null, scheduled: null, estimated: null } } }} />,
  'booking facts · unassigned + long text': <BookingFacts busy={false} onRefresh={() => {}} reply={{ ...replyBase, bookings: [{ ...liveBooking, driver: null, vehicle: null, meetingPoint: '', instructions: 'A very long pickup instruction '.repeat(8) }] }} />,
};

let failed = 0;
// Closed records keep their progress; they must not hide the next active job.
for (const status of ['completed', 'cancelled', 'no_show']) {
  const closed = { ...booking, status, progress: 'arrived' };
  const active = { ...booking, _id: 'next', status: 'confirmed', progress: 'accepted' };
  if (selectCurrentJob([closed, active]) !== active || selectCurrentJob([closed]) !== undefined) {
    failed++;
    console.log(`  FAIL driver current job ignores ${status}`);
  }
}
for (const [name, element] of Object.entries(cases)) {
  try {
    const html = renderToString(element);
    const mayBeEmpty = name === 'unknown icon degrades';
    if (!html && !mayBeEmpty) throw new Error('rendered empty');
    if (html && mayBeEmpty) throw new Error('unknown icon should render nothing');
    console.log(`  ok   ${name} (${html.length} chars)`);
  } catch (e) {
    failed++;
    console.log(`  FAIL ${name}: ${e.message}`);
  }
}
// Formatter sanity, including the nullish paths.
const checks = [[pence(4500), '£45.00'], [pence(0), '£0.00'], [pence(undefined), '£0.00'], [label('no_show'), 'no show']];
for (const [got, want] of checks) {
  if (got !== want) { failed++; console.log(`  FAIL formatter: got ${got}, want ${want}`); }
}
console.log(failed ? `\n${failed} smoke failure(s)` : `\nall ${Object.keys(cases).length} render cases + formatters passed`);
process.exit(failed ? 1 : 0);
