import Icon from './Icon.jsx';
import { SimulationNotice } from './ui.jsx';

/**
 * A schematic route view, not a geographic map.
 *
 * No map provider is configured in this build. Rather than dress a diagram up
 * as a live map, it is drawn explicitly as a diagram and labelled as one — the
 * gentle curve is decorative, not a road geometry. The marker position comes
 * from server state, so passenger, dispatch and driver all agree.
 */
export default function RouteMap({ simulation, fromLabel, toLabel, compact = false }) {
  const fraction = simulation ? Math.min(1, Math.max(0, simulation.fraction)) : 0;

  // Quadratic curve from (10,42) to (170,18); point at t follows the same curve.
  const p0 = { x: 10, y: 42 };
  const p1 = { x: 90, y: 6 };
  const p2 = { x: 170, y: 18 };
  const at = (t) => ({
    x: (1 - t) ** 2 * p0.x + 2 * (1 - t) * t * p1.x + t ** 2 * p2.x,
    y: (1 - t) ** 2 * p0.y + 2 * (1 - t) * t * p1.y + t ** 2 * p2.y,
  });
  const marker = at(fraction);
  const path = `M${p0.x} ${p0.y} Q${p1.x} ${p1.y} ${p2.x} ${p2.y}`;
  const LENGTH = 180;

  return (
    <div className="space-y-2">
      <div className="on-dark overflow-hidden rounded-panel bg-ink-900 p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-ink-300">
            <Icon name="route" size={12} />
            Schematic route
          </span>
          {simulation ? (
            <span className="tabular inline-flex items-center gap-1.5 text-[11px] font-semibold text-ink-200">
              <span
                className={`size-1.5 rounded-full ${simulation.running ? 'pulse-dot bg-lime-400' : 'bg-ink-400'}`}
                aria-hidden
              />
              {simulation.running ? 'Moving' : 'Paused'} · {Math.round(fraction * 100)}%
            </span>
          ) : null}
        </div>

        <svg
          viewBox="0 0 180 52"
          className="w-full"
          role="img"
          aria-label={`Schematic diagram of the route from ${fromLabel} to ${toLabel}${
            simulation ? `, ${Math.round(fraction * 100)} per cent complete` : ''
          }. Not a geographic map.`}
        >
          <path d={path} stroke="#1b423a" strokeWidth="3" strokeLinecap="round" fill="none" />
          <path
            d={path}
            stroke="#b2dc22"
            strokeWidth="3"
            strokeLinecap="round"
            fill="none"
            strokeDasharray={LENGTH}
            strokeDashoffset={LENGTH * (1 - fraction)}
            className="transition-[stroke-dashoffset] duration-1000 ease-linear"
          />
          <circle cx={p0.x} cy={p0.y} r="4" fill="#0c211d" stroke="#9bb4af" strokeWidth="1.5" />
          <circle cx={p2.x} cy={p2.y} r="4" fill="#0c211d" stroke="#9bb4af" strokeWidth="1.5" />
          {simulation ? (
            <g className="transition-transform duration-1000 ease-linear" style={{ transform: `translate(${marker.x - 90}px, ${marker.y - 24}px)` }}>
              <circle cx="90" cy="24" r="7" fill="#b2dc22" />
              <circle cx="90" cy="24" r="2.5" fill="#0c211d" />
            </g>
          ) : null}
        </svg>

        <div className="mt-2 flex items-start justify-between gap-4">
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-ink-200">
            <Icon name="pin" size={13} className="text-ink-300" />
            <span className="truncate">{fromLabel}</span>
          </span>
          <span className="flex min-w-0 items-center justify-end gap-1.5 text-right text-xs text-ink-200">
            <span className="truncate">{toLabel}</span>
            <Icon name="flag" size={13} className="text-ink-300" />
          </span>
        </div>
      </div>

      {compact ? null : simulation ? (
        <SimulationNotice>
          {simulation.label}. This is a diagram, not a geographic map, and no location is tracked.
          Updated{' '}
          {new Date(simulation.updatedAt).toLocaleTimeString('en-GB', { timeZone: 'Europe/London' })}.
        </SimulationNotice>
      ) : (
        <SimulationNotice>
          vehicle movement appears once the journey starts. No live location is tracked.
        </SimulationNotice>
      )}
    </div>
  );
}
