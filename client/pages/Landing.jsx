import { Link } from 'react-router-dom';
import { operator } from '../lib/operator.js';
import Icon from '../components/Icon.jsx';
import { Wordmark } from '../components/SeatShell.jsx';
import TaxiScene from '../components/TaxiScene.jsx';

const SEATS = [
  {
    to: '/book',
    name: 'Passenger',
    icon: 'users',
    account: 'passenger',
    blurb: 'Request a local trip or airport transfer and follow it through to completion.',
  },
  {
    to: '/dispatch',
    name: 'Dispatch',
    icon: 'clipboard',
    account: 'dispatch',
    blurb: 'Review requests, reserve a vehicle, offer jobs to drivers and record outcomes.',
  },
  {
    to: '/driver',
    name: 'Driver',
    icon: 'steering',
    account: 'drv-ashton',
    blurb: 'Go on duty, accept an offer and move a job through to completion.',
  },
];

const REAL = [
  'MongoDB persistence and transactional vehicle reservation',
  'Server-side validation, role and ownership checks',
  'Idempotent writes, offer expiry and a full audit history',
];

const SIMULATED = [
  'Vehicle movement and the schematic route diagram',
  'Fares, card and cash outcomes, flight delays',
  'Every SMS and email preview — nothing is ever sent',
];

export default function Landing() {
  return (
    <main className="mx-auto landing-page max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
      <div className="flex items-center justify-between"><Wordmark /><span className="rounded-full border border-ink-200 px-3 py-1.5 text-xs font-semibold text-ink-600">Interactive fleet demo</span></div>

      <p className="mt-8 text-sm font-semibold text-ink-500">{operator.tagline}</p>
      <h1 className="mt-4 max-w-3xl text-4xl font-bold leading-tight tracking-tight text-ink-900 sm:text-6xl">
        Every journey. <br /><span className="text-ink-500">Working together.</span>
      </h1>
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-ink-600 sm:text-lg">
        One connected fleet. Book a ride, run the desk or take the wheel.
        Four cars, five drivers and three ways to explore the demo.
      </p>

      <TaxiScene />

      <div className="mt-9 flex items-end justify-between gap-4"><h2 className="text-xl font-bold tracking-tight">Choose your seat</h2><span className="text-xs text-ink-500">Independent demo sessions</span></div>
      <ul className="mt-4 grid gap-3 sm:grid-cols-3">
        {SEATS.map((seat) => (
          <li key={seat.to}>
            <Link
              to={seat.to}
              target="_blank"
              rel="noreferrer"
              className="seat-card group flex h-full flex-col rounded-panel border border-ink-100 bg-white p-5 transition-colors hover:border-ink-300"
            >
              <span className="flex size-9 items-center justify-center rounded-lg bg-ink-900 text-lime-400 transition-colors group-hover:bg-ink-800">
                <Icon name={seat.icon} size={18} />
              </span>
              <h2 className="mt-3.5 text-lg font-bold text-ink-900">{seat.name}</h2>
              <p className="mt-1.5 flex-1 text-sm leading-relaxed text-ink-600">{seat.blurb}</p>
              <p className="mt-4 font-mono text-xs text-ink-400">sign in as {seat.account}</p>
              <p className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-900">
                Open in a new tab
                <Icon
                  name="arrowRight"
                  size={15}
                  className="transition-transform group-hover:translate-x-0.5"
                />
              </p>
            </Link>
          </li>
        ))}
      </ul>

      <section className="on-dark mt-12 rounded-panel bg-ink-900 p-6 sm:p-8">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-300">
          What is real and what is simulated
        </h2>
        <div className="mt-5 grid gap-6 sm:grid-cols-2">
          <div>
            <p className="flex items-center gap-2 text-sm font-bold text-lime-400">
              <Icon name="check" size={16} strokeWidth={2.2} />
              Genuinely working
            </p>
            <ul className="mt-2.5 space-y-1.5">
              {REAL.map((item) => (
                <li key={item} className="text-sm leading-relaxed text-ink-200">
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="flex items-center gap-2 text-sm font-bold text-ink-300">
              <Icon name="info" size={16} />
              Simulated and labelled
            </p>
            <ul className="mt-2.5 space-y-1.5">
              {SIMULATED.map((item) => (
                <li key={item} className="text-sm leading-relaxed text-ink-200">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="mt-6 border-t border-ink-700 pt-4 text-xs leading-relaxed text-ink-300">
          Synthetic data only. Demo authentication is not production authentication, and this build is
          not production ready. Fares are demo assumptions, not company-approved rates, and no money
          moves. Nothing here is deployed.
        </p>
      </section>
    </main>
  );
}
