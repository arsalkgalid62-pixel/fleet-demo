/**
 * Line icon set, drawn on a 24×24 grid and inheriting `currentColor`.
 *
 * Deliberately hand-drawn rather than an icon package: the demo ships no
 * external assets, and a small set kept in one file is easier to keep visually
 * consistent than a dependency full of mixed styles.
 *
 * Icons are decorative by default (`aria-hidden`). Pass a `title` only when the
 * icon is the sole carrier of meaning — everywhere in this UI it sits beside
 * text, so it usually should not be announced.
 */

const PATHS = {
  car: 'M5 17h14M6.5 17v1.5a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1V17M20.5 17v1.5a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1V17M3 17v-4.2a2 2 0 0 1 .3-1L5.6 8A2 2 0 0 1 7.3 7h9.4a2 2 0 0 1 1.7 1l2.3 3.8a2 2 0 0 1 .3 1V17M6 13.5h1.5M16.5 13.5H18',
  pin: 'M12 21s7-5.4 7-11a7 7 0 1 0-14 0c0 5.6 7 11 7 11Z M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  flag: 'M5 21V4M5 4h11l-1.8 3.5L16 11H5',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7.5V12l3 1.8',
  calendar: 'M7 3v3M17 3v3M4 9.5h16M5.5 5.5h13a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19V7a1.5 1.5 0 0 1 1.5-1.5Z',
  users: 'M15.5 20v-1.6a3.4 3.4 0 0 0-3.4-3.4H6.9A3.4 3.4 0 0 0 3.5 18.4V20M9.5 11.6a3.8 3.8 0 1 0 0-7.6 3.8 3.8 0 0 0 0 7.6ZM20.5 20v-1.6a3.4 3.4 0 0 0-2.6-3.3M15.6 4.2a3.4 3.4 0 0 1 0 6.6',
  bag: 'M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M4.5 7h15A1.5 1.5 0 0 1 21 8.5V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8.5A1.5 1.5 0 0 1 4.5 7ZM9 11v5M15 11v5',
  plane: 'M10.5 20.5 12 17l1.5 3.5M3.5 12.8 21 7.5a1.6 1.6 0 0 0-1-3L3 9.6a.7.7 0 0 0-.1 1.3l3.4 1.7 1.4 3.1a.7.7 0 0 0 1.3 0l1.3-2.8',
  accessible: 'M12 6.2a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2ZM10 9.2V13h4.2M18 20l-2.4-4.5H10V9.2M13 15.5a4.2 4.2 0 1 1-4.6-2.3',
  card: 'M3 7.5A1.5 1.5 0 0 1 4.5 6h15A1.5 1.5 0 0 1 21 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 16.5v-9ZM3 10.5h18M6.5 14.5h3',
  cash: 'M3 7.5A1.5 1.5 0 0 1 4.5 6h15A1.5 1.5 0 0 1 21 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 16.5v-9ZM12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM6 9.5h.01M18 14.5h.01',
  check: 'M4.5 12.5 9.5 17.5 19.5 7',
  x: 'M6 6l12 12M18 6 6 18',
  alert: 'M12 8.5V13M12 16.5h.01M10.3 4.3 2.9 17a2 2 0 0 0 1.7 3h14.8a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 11v5M12 8h.01',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-4-4',
  refresh: 'M20 11a8 8 0 1 0-.7 4.3M20 5v6h-6',
  wifiOff: 'M2 2l20 20M8.6 15.3a5 5 0 0 1 6.8 0M12 19.5h.01M5 11.8A11 11 0 0 1 8.5 9.6M19 11.8a11 11 0 0 0-3.3-2.2M2.5 8.3A15 15 0 0 1 6 6M21.5 8.3a15 15 0 0 0-9.6-3',
  play: 'M7 4.5 19 12 7 19.5V4.5Z',
  pause: 'M9 4.5v15M15 4.5v15',
  rotate: 'M4 11a8 8 0 1 1 2.3 5.7M4 17v-6h6',
  arrowRight: 'M4 12h15M13 6l6 6-6 6',
  chevronDown: 'M6 9.5 12 15.5 18 9.5',
  bell: 'M18 8.5a6 6 0 1 0-12 0c0 5-2 6.5-2 6.5h16s-2-1.5-2-6.5ZM10.3 19a2 2 0 0 0 3.4 0',
  logout: 'M9 20H5.5A1.5 1.5 0 0 1 4 18.5v-13A1.5 1.5 0 0 1 5.5 4H9M16 16l4-4-4-4M20 12H9',
  shield: 'M12 21s7-3.2 7-9V6.2l-7-2.7-7 2.7V12c0 5.8 7 9 7 9Z',
  sparkle: 'M12 3.5 13.7 9l5.5 1.7-5.5 1.7L12 18l-1.7-5.6L4.8 10.7 10.3 9 12 3.5ZM18.5 16.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2Z',
  route: 'M6.5 8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM17.5 20.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM6.5 8.5V13a5 5 0 0 0 5 5h1.5',
  steering: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3.3 10.5h17.4M12 12v9',
  clipboard: 'M9 4.5H7.5A1.5 1.5 0 0 0 6 6v13a1.5 1.5 0 0 0 1.5 1.5h9A1.5 1.5 0 0 0 18 19V6a1.5 1.5 0 0 0-1.5-1.5H15M9 4.5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 4.5v.5a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-.5Z',
  history: 'M3.5 12a8.5 8.5 0 1 0 2.5-6M3.5 5.5V10H8M12 8v4.3l3 1.8',
  ban: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM5.6 5.6l12.8 12.8',
};

export const ICON_NAMES = Object.keys(PATHS);

export default function Icon({ name, size = 20, className = '', title, strokeWidth = 1.6 }) {
  const d = PATHS[name];
  if (!d) return null;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      {d.split(' M').map((segment, i) => (
        <path key={i} d={i === 0 ? segment : `M${segment}`} />
      ))}
    </svg>
  );
}
