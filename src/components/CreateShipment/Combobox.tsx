/**
 * Searchable dropdowns of «إنشاء شحنة» (Parties + Shipment Details): the
 * list opens directly under its input, on top of the page, works with the
 * keyboard (↑ ↓ Enter Esc), closes on a click outside, RTL and LTR.
 */
import React, { useId, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { inputCls } from './ui';
import { listKeyHandler, useOutside } from './useLookup';
import { countryName, searchCountries } from './wizardModel';
import type { CsLang } from './csLang';

type T = (ar: string, en: string) => string;

export function Dropdown({ id, children, label }: { id: string; children: React.ReactNode; label: string }) {
  return (
    <div id={id} role="listbox" aria-label={label}
      className="absolute z-40 mt-1 inset-x-0 max-h-72 overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-xl ring-1 ring-black/5">
      {children}
    </div>
  );
}

export function OptionButton({ id, active, selected, onPick, children, ...rest }: {
  id?: string; active: boolean; selected?: boolean; onPick: () => void; children: React.ReactNode;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'id'>) {
  return (
    <button {...rest} id={id} type="button" role="option" aria-selected={selected ?? active} tabIndex={-1}
      onMouseDown={(e) => e.preventDefault()} onClick={onPick}
      className={`w-full text-start px-3 py-2.5 flex items-start gap-2 min-h-[44px] ${active ? 'bg-indigo-50 dark:bg-indigo-900/30' : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}>
      {children}
    </button>
  );
}

/** Country/Territory: every country, searchable by Arabic / English name, ISO code, aliases (USA, America …) and calling code. */
export function CountryCombobox({ id, value, onChange, error, lang, t }: { id: string; value: string; onChange: (code: string) => void; error?: string | null; lang: CsLang; t: T }) {
  const box = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const open = query !== null;
  const list = searchCountries(query ?? '', lang);
  const close = () => setQuery(null);
  useOutside(box, close);
  const pick = (i: number) => { const c = list[i]; if (c) { onChange(c.code); close(); } };
  return (
    <div ref={box} className="relative">
      <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      <input id={id} role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" aria-invalid={!!error} autoComplete="off"
        aria-activedescendant={open && list[active] ? `${listId}-${list[active].code}` : undefined}
        value={open ? query! : value ? countryName(value, lang) : ''} placeholder={t('ابحث عن البلد', 'Search country')}
        onFocus={() => { setQuery(''); setActive(0); }}
        onChange={(e) => { setQuery(e.target.value); setActive(0); }}
        onKeyDown={listKeyHandler({ open, count: list.length, active, setActive, onPick: pick, onClose: close })}
        className={`${inputCls(error)} ps-9`} />
      {open && (
        <Dropdown id={listId} label={t('البلدان', 'Countries')}>
          {list.length ? list.map((c, i) => (
            <OptionButton key={c.code} id={`${listId}-${c.code}`} active={i === active} selected={c.code === value} onPick={() => pick(i)}>
              <span className="flex-1 min-w-0 text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{c.name}</span>
              <span className="text-[11px] text-slate-400 tabular-nums shrink-0" dir="ltr">{c.code} · +{c.dial}</span>
              {c.code === value && <Check size={14} className="text-indigo-600 shrink-0" />}
            </OptionButton>
          )) : <div className="px-3 py-3 text-xs text-slate-500">{t('لا يوجد بلد مطابق.', 'No matching country.')}</div>}
        </Dropdown>
      )}
    </div>
  );
}

export interface ComboOptionItem { value: string; label: string; hint?: string; keywords?: string }

/**
 * A searchable select. `freeText`: the typed text IS the value (the list only
 * suggests — e.g. a document description); otherwise only listed values.
 */
export function OptionCombobox({ id, value, options, onChange, error, placeholder, label, freeText = false, ltr = false, maxLength }: {
  id: string; value: string; options: ComboOptionItem[]; onChange: (v: string) => void; error?: string | null; placeholder?: string; label: string;
  freeText?: boolean; ltr?: boolean; maxLength?: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const open = query !== null;
  const q = (query ?? '').trim().toLowerCase();
  const list = !q || (freeText && options.some((o) => o.value.toLowerCase() === q))
    ? options
    : options.filter((o) => `${o.value} ${o.label} ${o.hint ?? ''} ${o.keywords ?? ''}`.toLowerCase().includes(q));
  const close = () => setQuery(null);
  useOutside(box, close);
  const pick = (i: number) => { const o = list[i]; if (o) { onChange(o.value); close(); } };
  const current = options.find((o) => o.value === value);
  const shown = open ? (freeText ? value : query!) : freeText ? value : current ? current.label : value;
  return (
    <div ref={box} className="relative">
      <input id={id} role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" aria-invalid={!!error} autoComplete="off"
        aria-activedescendant={open && list[active] ? `${listId}-${active}` : undefined} dir={ltr ? 'ltr' : undefined} maxLength={maxLength}
        value={shown} placeholder={placeholder}
        onFocus={() => { setQuery(freeText ? value : ''); setActive(0); }}
        onChange={(e) => { setQuery(e.target.value); setActive(0); if (freeText) onChange(e.target.value); }}
        onKeyDown={listKeyHandler({ open, count: list.length, active, setActive, onPick: pick, onClose: close })}
        className={`${inputCls(error)} pe-9 ${ltr ? 'text-start' : ''}`} />
      <ChevronDown size={16} className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      {open && list.length > 0 && (
        <Dropdown id={listId} label={label}>
          {list.map((o, i) => (
            <OptionButton key={o.value} id={`${listId}-${i}`} active={i === active} selected={o.value === value} onPick={() => pick(i)} data-option-value={o.value}>
              <span className="flex-1 min-w-0 text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{o.label}</span>
              {o.hint && <span className="text-[11px] text-slate-400 shrink-0">{o.hint}</span>}
              {o.value === value && <Check size={14} className="text-indigo-600 shrink-0" />}
            </OptionButton>
          ))}
        </Dropdown>
      )}
    </div>
  );
}
