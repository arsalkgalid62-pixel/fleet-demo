import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import { EmptyState, ErrorNote, Panel, SimulationNotice, Spinner } from './ui.jsx';

/**
 * Dispatch-only view of the message previews the server records when a booking
 * is confirmed, offered or cancelled.
 *
 * These are records of messages that were deliberately **not** sent. The demo
 * has no SMS or email provider installed at all, so nothing can be delivered
 * regardless of what address a booking carries. Every row says so:
 * the point of this panel is to make that visible rather than merely implied.
 *
 * Refetched on the same ~3s cadence as the rest of dispatch, keyed off the
 * poll tick so it stays in step with the booking list.
 */
export default function NotificationPreviews({ api, tick }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let live = true;
    api
      .notifications()
      .then((rows) => live && setData(rows))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [api, tick]);

  const rows = data?.rows ?? [];

  return (
    <Panel title={`Message previews (${rows.length})`} icon="bell" subtitle="Messages that would have been sent">
      <SimulationNotice className="mb-3">
        {data?.notice ?? 'preview only. No SMS or email is sent.'}
      </SimulationNotice>

      <ErrorNote onDismiss={() => setError(null)}>{error}</ErrorNote>

      {!data && !error ? <Spinner label="Loading message previews" /> : null}

      {data && rows.length === 0 ? (
        <EmptyState title="No previews yet">
          Confirming, offering or cancelling a booking records the message that would have been sent.
        </EmptyState>
      ) : null}

      {rows.length > 0 ? (
        <ul className="divide-y divide-ink-100">
          {rows.map((row) => (
            <li key={row._id} className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 py-2.5 text-sm">
              <span className="tabular font-mono text-[11px] text-ink-400">
                {new Date(row.createdAt).toLocaleTimeString('en-GB', { timeZone: 'Europe/London' })}
              </span>
              <span className="min-w-0 flex-1 text-ink-900">{row.text}</span>
              <span className="inline-flex items-center gap-1 rounded bg-ink-100 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-ink-600">
                <Icon name="bell" size={11} />
                {row.channel}
              </span>
              <span className="rounded bg-status-wait-bg px-1.5 py-0.5 text-[11px] font-semibold text-status-wait">
                Not sent · {row.state}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </Panel>
  );
}
