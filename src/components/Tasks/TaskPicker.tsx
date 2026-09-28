import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Loader2, RotateCcw, Search, X } from 'lucide-react';
import { useDialogLayer } from '../shared/dialogUtils';
import { normalizeArabic } from './taskUtils';

export type PickerOption = { value: number; label: string; hint?: string };

type Props = {
  id: string;
  labelId: string;
  options: PickerOption[];
  value: number | null;
  /** Label to show for a value not (yet) in `options` (async search). */
  valueLabel?: string;
  onChange: (value: number | null, option: PickerOption | null) => void;
  placeholder: string;
  searchPlaceholder: string;
  emptyText: string;
  loading?: boolean;
  loadError?: string | null;
  onRetry?: () => void;
  /** Async mode: the parent filters by query; local filtering is skipped. */
  onQueryChange?: (q: string) => void;
  clearable?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  icon?: React.ReactNode;
};

type Placement = { left: number; width: number; top?: number; bottom?: number; maxHeight: number };

/**
 * Searchable single-select (ARIA combobox + listbox). The list is portaled
 * into the dialog layer and positioned against the viewport, so the form's
 * own scroll area can never clip it and it always stacks above the panel.
 */
export function TaskPicker({
  id, labelId, options, value, valueLabel, onChange, placeholder, searchPlaceholder, emptyText,
  loading, loadError, onRetry, onQueryChange, clearable, disabled, invalid, describedBy, icon,
}: Props) {
  const layer = useDialogLayer();
  const listId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [place, setPlace] = useState<Placement | null>(null);

  const filtered = useMemo(() => {
    if (onQueryChange) return options;
    const q = normalizeArabic(query);
    if (!q) return options;
    return options.filter((o) => normalizeArabic(`${o.label} ${o.hint ?? ''}`).includes(q));
  }, [options, query, onQueryChange]);

  const selected = options.find((o) => o.value === value);
  const shown = selected?.label ?? (value != null ? valueLabel : undefined);

  const measure = useCallback(() => {
    const t = triggerRef.current;
    if (!t) return;
    const r = t.getBoundingClientRect();
    const vv = window.visualViewport;
    const viewTop = vv ? vv.offsetTop : 0;
    const viewBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
    const below = viewBottom - r.bottom - 8;
    const above = r.top - viewTop - 8;
    const wanted = 300;
    if (below >= Math.min(wanted, 200) || below >= above) {
      setPlace({ left: r.left, width: r.width, top: r.bottom + 4, maxHeight: Math.max(140, Math.min(wanted, below)) });
    } else {
      setPlace({ left: r.left, width: r.width, bottom: window.innerHeight - r.top + 4, maxHeight: Math.max(140, Math.min(wanted, above)) });
    }
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    measure();
    const onMove = () => measure();
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true); // any scrolling ancestor, incl. the form body
    window.visualViewport?.addEventListener('resize', onMove);
    return () => {
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
      window.visualViewport?.removeEventListener('resize', onMove);
    };
  }, [open, measure]);

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus({ preventScroll: true });
    const onDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (!popRef.current?.contains(t) && !triggerRef.current?.contains(t)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const el = popRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    // Scrolls only the listbox (block: nearest) — it is fixed-positioned, so
    // no page container is an ancestor that could move.
    el?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const openList = () => {
    if (disabled) return;
    setQuery('');
    onQueryChange?.('');
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  };

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus({ preventScroll: true });
  };

  const choose = (o: PickerOption) => {
    onChange(o.value, o);
    close();
  };

  const onListKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const o = filtered[active];
      if (o) choose(o);
    } else if (e.key === 'Escape') {
      // Close only the list — preventDefault tells the Dialog not to close.
      e.preventDefault();
      close();
    } else if (e.key === 'Tab') {
      close(false);
    }
  };

  const activeId = open && filtered[active] ? `${listId}-opt-${filtered[active].value}` : undefined;

  const popover = open && place && (
    <div
      ref={popRef}
      data-shp-popover=""
      className="fixed z-20 flex flex-col overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-2xl animate-in fade-in"
      style={{ left: place.left, width: place.width, top: place.top, bottom: place.bottom, maxHeight: place.maxHeight }}
      onKeyDown={onListKey}
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 dark:border-slate-700 text-slate-400">
        <Search size={15} className="shrink-0" />
        <input
          ref={searchRef}
          type="text"
          role="searchbox"
          aria-controls={listId}
          aria-activedescendant={activeId}
          aria-label={searchPlaceholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            onQueryChange?.(e.target.value);
          }}
          placeholder={searchPlaceholder}
          className="w-full bg-transparent py-1 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 outline-none"
        />
        {loading && <Loader2 size={15} className="shrink-0 animate-spin" aria-hidden="true" />}
      </div>
      <ul id={listId} role="listbox" aria-labelledby={labelId} className="flex-1 overflow-y-auto overscroll-contain p-1">
        {loadError ? (
          <li className="p-3 text-center text-sm text-red-600 dark:text-red-400">
            {loadError}
            {onRetry && (
              <button type="button" onClick={onRetry} className="mt-2 mx-auto flex items-center gap-1 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline">
                <RotateCcw size={12} /> إعادة المحاولة
              </button>
            )}
          </li>
        ) : loading && !filtered.length ? (
          <li className="p-3 text-center text-sm text-slate-500">جاري التحميل...</li>
        ) : filtered.length ? (
          filtered.map((o, i) => (
            <li
              key={o.value}
              id={`${listId}-opt-${o.value}`}
              role="option"
              aria-selected={o.value === value}
              data-index={i}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(o)}
              className={`cursor-pointer rounded-xl px-3 py-2 text-sm flex items-center justify-between gap-3 ${
                i === active ? 'bg-indigo-50 dark:bg-indigo-900/30' : ''
              } ${o.value === value ? 'font-bold text-indigo-700 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-200'}`}
            >
              <span className="truncate">{o.label}</span>
              {o.hint && <span className="shrink-0 text-[11px] text-slate-400">{o.hint}</span>}
            </li>
          ))
        ) : (
          <li className="p-3 text-center text-sm text-slate-500">{emptyText}</li>
        )}
      </ul>
    </div>
  );

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-labelledby={labelId}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        disabled={disabled}
        onClick={() => (open ? close() : openList())}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault();
            openList();
          }
        }}
        className={`w-full flex items-center gap-2 pr-10 pl-3 py-3 text-right bg-slate-50 dark:bg-slate-900 border rounded-2xl text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-60 ${
          invalid ? 'border-red-400 dark:border-red-500' : 'border-slate-200 dark:border-slate-700'
        } ${shown ? 'text-slate-900 dark:text-white' : 'text-slate-400'}`}
      >
        <span className="flex-1 truncate">{shown ?? (loading ? 'جاري التحميل...' : placeholder)}</span>
        {loading && !open ? <Loader2 size={16} className="shrink-0 animate-spin text-slate-400" aria-hidden="true" /> : (
          <ChevronDown size={16} className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
        )}
      </button>
      {icon && <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">{icon}</span>}
      {clearable && value != null && !disabled && (
        <button
          type="button"
          onClick={() => onChange(null, null)}
          aria-label="إزالة الاختيار"
          className="absolute left-9 top-1/2 -translate-y-1/2 p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 dark:hover:bg-slate-700"
        >
          <X size={14} />
        </button>
      )}
      {popover && createPortal(popover, layer ?? document.body)}
    </div>
  );
}
