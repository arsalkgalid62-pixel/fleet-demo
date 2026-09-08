import { useEffect, useId, useRef, useState } from 'react';
import { useSession } from '../lib/session.jsx';
import Icon from './Icon.jsx';
import { inputClass } from './ui.jsx';

/**
 * One type-ahead field for a pickup or destination.
 *
 * Replaces the old pair of controls — a five-option radio list plus a separate
 * collapsible pin panel — with the single field people expect from a ride app:
 * start typing, pick from a list.
 *
 * Two sources feed the list, in this order:
 *
 *   1. The city's own sample places, matched locally. Instant, free, and the
 *      reason the field still works with no provider key configured.
 *   2. Geoapify autocomplete for anything else in the city, debounced so a
 *      keystroke does not cost a request.
 *
 * Choosing a sample place sets the booking's slot id; choosing a searched
 * address sets a custom point instead. The backend contract is unchanged.
 */

const DEBOUNCE_MS = 300;

export default function PlaceField({ label, icon, city, slot, point, onChange, exclude }) {
  const { api } = useSession();
  const listId = useId();
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [remote, setRemote] = useState([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [active, setActive] = useState(-1);
  const box = useRef(null);
  const timer = useRef(null);

  const places = city?.places ?? [];
  const chosen = point ?? places.find((p) => p.id === slot) ?? null;

  // Local matches first: free, instant, and available with no provider key.
  const typed = text.trim().toLowerCase();
  const local = places
    .filter((p) => p.id !== exclude)
    .filter((p) => !typed || p.label.toLowerCase().includes(typed));

  useEffect(() => {
    clearTimeout(timer.current);
    if (typed.length < 2) {
      setRemote([]);
      setNote('');
      return undefined;
    }
    timer.current = setTimeout(async () => {
      setBusy(true);
      setNote('');
      try {
        const data = await api.autocomplete(typed, city?.id);
        setRemote(data.results ?? []);
        if ((data.results ?? []).length === 0) setNote(`No ${city?.name ?? 'UK'} address matched.`);
      } catch (e) {
        // A missing provider key must not break the field: sample places remain.
        setRemote([]);
        setNote(e.message);
      } finally {
        setBusy(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer.current);
  }, [typed, city?.id, api, city?.name]);

  /*
   * Close on any exit route, not just an outside click. Without the focusout
   * case the list stays open over the fields below — it was covering the
   * pickup-time calendar when the user tabbed past it.
   */
  useEffect(() => {
    const outside = (e) => {
      if (box.current && !box.current.contains(e.target)) {
        setOpen(false);
        setActive(-1);
      }
    };
    const left = (e) => {
      // relatedTarget is the element gaining focus; null means focus left the page.
      if (box.current && !box.current.contains(e.relatedTarget)) {
        setOpen(false);
        setActive(-1);
      }
    };
    document.addEventListener('mousedown', outside);
    const el = box.current;
    el?.addEventListener('focusout', left);
    return () => {
      document.removeEventListener('mousedown', outside);
      el?.removeEventListener('focusout', left);
    };
  }, []);

  const options = [
    ...local.map((p) => ({ kind: 'sample', key: `s:${p.id}`, label: p.label, place: p })),
    ...remote
      .filter((r) => r.inServiceArea)
      .map((r, i) => ({ kind: 'address', key: `a:${i}`, label: r.label, place: r })),
  ];

  function pick(option) {
    if (option.kind === 'sample') onChange({ slot: option.place.id, point: undefined });
    else onChange({ slot: undefined, point: option.place });
    setText('');
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(e) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setOpen(true);
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, options.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && active >= 0 && options[active]) { e.preventDefault(); pick(options[active]); }
    else if (e.key === 'Escape') { setOpen(false); setActive(-1); }
  }

  return (
    <div ref={box} className="relative">
      <label htmlFor={`${listId}-input`} className="mb-1.5 block text-sm font-semibold text-ink-800">
        {label}
      </label>

      {/* What is currently selected, always visible. */}
      {chosen ? (
        <div className="mb-1.5 flex items-center gap-2 rounded-lg bg-ink-900 px-3 py-2 text-sm text-white">
          <Icon name={icon} size={15} className="shrink-0 text-lime-400" />
          <span className="min-w-0 flex-1 truncate font-medium">{chosen.label}</span>
          {point ? (
            <span className="shrink-0 rounded bg-ink-700 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide">
              custom pin
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="relative">
        <Icon
          name="search"
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400"
        />
        <input
          id={`${listId}-input`}
          className={`${inputClass} pl-9`}
          value={text}
          placeholder={chosen ? 'Change — type an address' : `Search ${city?.name ?? 'UK'} addresses`}
          onChange={(e) => { setText(e.target.value); setOpen(true); setActive(-1); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
        />
        {busy ? (
          <span
            className="absolute right-3 top-1/2 size-4 -translate-y-1/2 spin rounded-full border-2 border-ink-200 border-t-ink-700"
            aria-hidden
          />
        ) : null}
      </div>

      {open ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-panel border border-ink-200 bg-white py-1 shadow-lg"
        >
          {options.length === 0 && !busy ? (
            <li className="px-3 py-2 text-xs text-ink-500">
              {note || `Type at least 2 characters to search ${city?.name ?? 'the UK'}.`}
            </li>
          ) : null}

          {options.map((option, i) => (
            <li key={option.key} role="option" aria-selected={i === active}>
              <button
                type="button"
                // Keep focus in the input so focusout cannot close the list
                // before this click is delivered.
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(option)}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm ${
                  i === active ? 'bg-ink-50' : ''
                }`}
              >
                <Icon
                  name={option.kind === 'sample' ? 'pin' : 'search'}
                  size={14}
                  className="shrink-0 text-ink-400"
                />
                <span className="min-w-0 flex-1 truncate text-ink-900">{option.label}</span>
                {option.kind === 'sample' ? (
                  <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-ink-400">
                    suggested
                  </span>
                ) : null}
              </button>
            </li>
          ))}

          {note && options.length > 0 ? (
            <li className="px-3 pt-1 text-[11px] text-ink-500">{note}</li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
