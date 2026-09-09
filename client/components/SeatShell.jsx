import { useState } from 'react';
import { operator } from '../lib/operator.js';
import { Link } from 'react-router-dom';
import { SessionProvider, useSession } from '../lib/session.jsx';
import Icon from './Icon.jsx';
import FleetSupport from './FleetSupport.jsx';
import { Button, ErrorNote, Field, Spinner, inputClass } from './ui.jsx';

const DEMO_PASSWORD = 'demo-fleet-2026';

const SEAT_ICON = { passenger: 'users', dispatch: 'clipboard', driver: 'steering' };

export function Wordmark({ tone = 'dark', className = '' }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span
        className={`flex size-6 items-center justify-center rounded ${
          tone === 'dark' ? 'bg-ink-900 text-lime-400' : 'bg-lime-500 text-ink-950'
        }`}
      >
        <Icon name="car" size={15} strokeWidth={1.8} />
      </span>
      <span
        className={`text-[13px] font-bold uppercase tracking-[0.16em] ${
          tone === 'dark' ? 'text-ink-900' : 'text-white'
        }`}
      >
        {operator.name}
      </span>
    </span>
  );
}

function SignIn({ title, accounts }) {
  const { seat, signIn } = useSession();
  const [username, setUsername] = useState(accounts[0]);
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(username, password);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="sign-in-page mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-12">
      <Link to="/" className="self-start rounded">
        <Wordmark />
      </Link>

      <h1 className="mt-6 text-2xl font-bold tracking-tight text-ink-900">{title}</h1>
      <p className="mt-1.5 flex items-center gap-1.5 text-sm text-ink-600">
        <Icon name={SEAT_ICON[seat] ?? 'users'} size={15} className="text-ink-400" />
        Signing in here affects the <strong className="font-semibold">{seat}</strong> tab only.
      </p>

      <form onSubmit={submit} className="mt-6 space-y-4">
        <Field label="Demo account" htmlFor="account" required>
          <select
            id="account"
            className={inputClass}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          >
            {accounts.map((account) => (
              <option key={account} value={account}>
                {account}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Password" htmlFor="password" required>
          <input
            id="password"
            className={inputClass}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <ErrorNote>{error}</ErrorNote>
        <Button type="submit" loading={busy} size="lg" className="w-full">
          {busy ? 'Signing in' : 'Sign in'}
        </Button>
      </form>

      <p className="mt-6 flex items-start gap-2 rounded-lg bg-status-wait-bg px-3 py-2.5 text-xs text-status-wait ring-1 ring-inset ring-status-wait/20">
        <Icon name="shield" size={15} className="mt-px" />
        <span>
          Synthetic demo accounts sharing a published password. This is demo authentication, not
          production authentication.
        </span>
      </p>
    </main>
  );
}

function Gate({ title, accounts, children }) {
  const { ready, user, signOut, seat } = useSession();
  if (!ready) return <Spinner label="Starting session" />;
  if (!user) return <SignIn title={title} accounts={accounts} />;

  return (
    <div className={`fleet-shell fleet-shell-${seat} flex min-h-dvh flex-col`}>
      <a href="#main" className="skip-link">
        Skip to main content
      </a>

      <header className="sticky top-0 z-20 border-b border-ink-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[120rem] items-center justify-between gap-4 px-4 py-2.5 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link to="/" className="shrink-0 rounded" aria-label="Fleet home">
              <Wordmark />
            </Link>
            <span className="hidden h-5 w-px bg-ink-200 sm:block" aria-hidden />
            <p className="hidden truncate text-sm font-semibold text-ink-900 sm:block">{title}</p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-full bg-ink-50 px-2.5 py-1 text-xs font-semibold text-ink-700 ring-1 ring-inset ring-ink-100 sm:inline-flex">
              <Icon name={SEAT_ICON[seat] ?? 'users'} size={13} className="text-ink-400" />
              {user.name}
            </span>
            <Button variant="secondary" size="sm" icon="logout" aria-label="Sign out" onClick={signOut}>
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>
        <nav aria-label="Workspaces" className="workspace-nav mx-auto flex max-w-[120rem] gap-1 px-4 sm:px-6">
          {['passenger', 'dispatch', 'driver'].map((item) => (
            <Link key={item} to={`/${item}`} aria-current={seat === item ? 'page' : undefined}>
              <Icon name={SEAT_ICON[item]} size={15} />
              <span>{item === 'passenger' ? 'Book & track' : item === 'dispatch' ? 'Dispatch desk' : 'Driver seat'}</span>
            </Link>
          ))}
        </nav>
      </header>

      <div id="main" className="flex-1">
        {children}
      </div>

      <FleetSupport key={user.id} />
      <footer className="border-t border-ink-100 px-4 py-3 text-center text-[11px] text-ink-400 sm:px-6">
        Fleet demonstration build · synthetic data only · fares, movement, payments and messages are
        simulated · not production ready
      </footer>
    </div>
  );
}

export default function SeatShell({ seat, title, accounts, children }) {
  return (
    <SessionProvider key={seat} seat={seat}>
      <Gate title={title} accounts={accounts}>
        {children}
      </Gate>
    </SessionProvider>
  );
}
