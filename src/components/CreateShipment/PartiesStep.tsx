/**
 * Step 1 «الأطراف / Parties» — the DHL Create Shipment workflow (From |
 * Switch | To, field order, National Address rules) rebuilt with SHIPPEC's
 * own design system, in Arabic (RTL) or English (LTR).
 *
 *   - the SHIPPEC customer (invoice owner) is separate from sender / receiver;
 *   - Name searches SHIPPEC's saved contacts; selecting one fills every field
 *     (all stay editable; nothing is re-created by selecting);
 *   - Country/Territory: every country, searchable, sets the calling code;
 *   - Address 1: country-limited suggestions from the provider behind the
 *     SHIPPEC Backend (no invented results);
 *   - Saudi Arabia: Short Address first (SPL National Address, authoritative —
 *     one exact result fills the whole National Address, several are offered),
 *     then Address 1, then the fields by hand; a Google address chosen later
 *     drops the old short address;
 *   - a lookup only runs for text typed in that field (a value filled by another
 *     lookup never starts a new request);
 *   - City: Google city suggestions inside the country (2+ characters); a choice
 *     fills City + State (US: the 2-letter code sent, the state name shown);
 *   - Postal code: country rules (addressRules); a complete US ZIP / ZIP+4 →
 *     city + state (Google Geocoding behind the Backend) — one locality fills
 *     straight away, several are offered; other countries are typed by hand;
 *   - «حفظ في قاعدة البيانات» asks for a SHIPPEC alias (never sent to DHL); only an
 *     alias already in use is a conflict (update it / choose another name / cancel);
 *   - validation for Next is partiesGate() (wizardModel) — autofill never bypasses it.
 */
import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  ArrowLeftRight, Building2, Database, Eraser, Info, Loader2, MapPin, Plus, Search, Trash2, User, UserCheck, X,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { api } from '../../utils/apiClient';
import { describeApiError } from '../../utils/apiErrors';
import { useAuthStore } from '../../hooks/useAuthStore';
import { searchClients, type PhoneType } from '../../services/dhlShipment.service';
import {
  addressLookupService, duplicatesOf, shippingContactsService, type AddressSuggestion, type PostalLocality, type SavedContact,
} from '../../services/shippingContacts.service';
import { Dialog } from '../shared/Dialog';
import { Button, Field, Section, TextInput, inputCls } from './ui';
import { useCsLang, type CsLang } from './csLang';
import { listKeyHandler, useLookup, useOutside, type LookupStatus } from './useLookup';
import { CountryCombobox, Dropdown } from './Combobox';
import { citySecondary, postalFormatIssue, postalLookupCode, postalRule, subdivisionName } from './addressRules';
import {
  applyAddress, applyCity, applyContact, clearAddress, contactFieldsOf, normalizeShortAddress, SHORT_ADDRESS_RE, withCountry,
} from './partiesModel';
import {
  canShipment, countryName, emptyPhone, partiesGate, translateIssue, type FieldErrors, type PartyForm, type PhoneEntry,
} from './wizardModel';
import type { Wizard } from './useShipmentWizard';

type Who = 'shipper' | 'receiver';
type T = (ar: string, en: string) => string;
const newSession = () => (globalThis.crypto?.randomUUID?.() ?? `s-${Date.now()}-${Math.random().toString(36).slice(2)}`);

function StatusRow({ status, t, empty, unavailable, failed }: { status: LookupStatus; t: T; empty: string; unavailable?: string; failed?: string }) {
  if (status === 'loading') return <div className="px-3 py-3 text-xs text-slate-500 flex items-center gap-2" role="status"><Loader2 size={14} className="animate-spin" /> {t('جاري البحث…', 'Searching…')}</div>;
  if (status === 'error') return <div className="px-3 py-3 text-xs font-semibold text-amber-700 dark:text-amber-300" role="status">{failed ?? t('تعذر البحث الآن — يمكنك الإدخال يدويًا.', 'Search is unavailable right now — you can enter it manually.')}</div>;
  if (status === 'unavailable') return <div className="px-3 py-3 text-xs font-semibold text-slate-500" role="status">{unavailable ?? t('البحث غير متاح — أدخل البيانات يدويًا.', 'Search is not available — enter the details manually.')}</div>;
  if (status === 'done') return <div className="px-3 py-3 text-xs text-slate-500" role="status">{empty}</div>;
  return null;
}
const optionCls = (active: boolean) =>
  `w-full text-start px-3 py-2.5 flex items-start gap-2 min-h-[44px] ${active ? 'bg-indigo-50 dark:bg-indigo-900/30' : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'}`;

// ── Name → SHIPPEC saved contacts ──
const ROLE_BADGE: Record<SavedContact['role'], [string, string]> = { sender: ['مرسل محفوظ', 'Saved Sender'], receiver: ['مستلم محفوظ', 'Saved Receiver'], both: ['مرسل ومستلم', 'Sender & Receiver'] };
function ContactNameInput({ id, who, value, onChange, onPick, error, placeholder, canSearch, lang, t }: {
  id: string; who: Who; value: string; onChange: (v: string) => void; onPick: (c: SavedContact) => void; error?: string | null; placeholder?: string;
  canSearch: boolean; lang: CsLang; t: T;
}) {
  const box = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [open, setOpen] = useState(false);
  /** The text the person last typed here — the only text ever looked up. */
  const [mine, setMine] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const role = who === 'shipper' ? 'sender' : 'receiver';
  const fetcher = useCallback((q: string, signal: AbortSignal) => shippingContactsService.search(q, role, signal), [role]);
  const key = open && value === mine && canSearch && value.trim().length >= 2 ? value.trim() : null;
  const r = useLookup<SavedContact>(key, fetcher, 300);
  useOutside(box, () => setOpen(false));
  const pick = (i: number) => { const c = r.items[i]; if (c) { onPick(c); setOpen(false); } };
  const show = !!key && r.status !== 'idle' && r.status !== 'unavailable';
  return (
    <div ref={box} className="relative">
      <TextInput id={id} value={value} ltr autoComplete="off" placeholder={placeholder} error={error} role="combobox" aria-expanded={show} aria-controls={listId} aria-autocomplete="list"
        aria-activedescendant={show && r.items[active] ? `${listId}-${r.items[active].id}` : undefined}
        onValue={(v) => { onChange(v); setMine(v); setOpen(true); setActive(0); }}
        onKeyDown={listKeyHandler({ open: show, count: r.items.length, active, setActive, onPick: pick, onClose: () => setOpen(false) })} />
      {r.status === 'loading' && <Loader2 size={14} className="absolute end-3 top-3.5 animate-spin text-slate-400" />}
      {show && (
        <Dropdown id={listId} label={t('جهات الاتصال المحفوظة', 'Saved contacts')}>
          {r.status === 'done' && r.items.length ? r.items.map((c, i) => {
            const ph = c.phones?.[0];
            return (
              <button key={c.id} id={`${listId}-${c.id}`} type="button" role="option" aria-selected={i === active} tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()} onClick={() => pick(i)} className={optionCls(i === active)} data-contact-id={c.id}>
                <User size={16} className="mt-0.5 text-indigo-500 shrink-0" />
                <span className="flex-1 min-w-0" dir="auto">
                  <span className="block text-sm font-extrabold text-slate-900 dark:text-white truncate text-start" data-saved-name>{c.saved_name || c.name}</span>
                  <span className="block text-[11px] text-slate-500 truncate text-start" dir="ltr">
                    {[c.name, c.company, ph?.number ? `+${ph.code ?? ''} ${ph.number}` : null, [c.city, countryName(c.country_code, lang)].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span className="shrink-0 px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-[10px] font-bold text-slate-600 dark:text-slate-300">{t(...ROLE_BADGE[c.role])}</span>
              </button>
            );
          }) : <StatusRow status={r.status} t={t} empty={t('لا توجد جهات اتصال محفوظة مطابقة.', 'No saved contacts match.')} />}
        </Dropdown>
      )}
    </div>
  );
}

// ── Address 1 → provider suggestions (country-limited) ──
function Address1Input({ id, value, onChange, country, onPick, error, t }: {
  id: string; value: string; onChange: (v: string) => void; country: string; onPick: (s: AddressSuggestion, session: string) => Promise<void>; error?: string | null; t: T;
}) {
  const box = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [open, setOpen] = useState(false);
  /** The text the person last typed here — the only text ever looked up. */
  const [mine, setMine] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [picking, setPicking] = useState(false);
  const session = useRef(newSession());
  const fetcher = useCallback((k: string, signal: AbortSignal) => {
    const [cc, ...rest] = k.split('|');
    return addressLookupService.autocomplete(rest.join('|'), cc, session.current, signal);
  }, []);
  const typed = value.trim();
  const key = open && value === mine && country && typed.length >= 3 ? `${country}|${typed}` : null;
  const r = useLookup<AddressSuggestion>(key, fetcher, 350);
  useOutside(box, () => setOpen(false));
  const pick = async (i: number) => {
    const s = r.items[i];
    if (!s) return;
    setOpen(false);
    setPicking(true);
    // Place Details with the same session token closes the Autocomplete session (Google billing)
    try { await onPick(s, session.current); } finally { setPicking(false); session.current = newSession(); }
  };
  const noCountry = open && !country && typed.length >= 3;
  const show = !!key && r.status !== 'idle';
  return (
    <div ref={box} className="relative">
      <TextInput id={id} value={value} ltr autoComplete="off" error={error} role="combobox" aria-expanded={show} aria-controls={listId} aria-autocomplete="list"
        aria-activedescendant={show && r.items[active] ? `${listId}-${active}` : undefined}
        onValue={(v) => { onChange(v); setMine(v); setOpen(true); setActive(0); }}
        onKeyDown={listKeyHandler({ open: show, count: r.items.length, active, setActive, onPick: (i) => void pick(i), onClose: () => setOpen(false) })} />
      {(r.status === 'loading' || picking) && <Loader2 size={14} className="absolute end-3 top-3.5 animate-spin text-slate-400" />}
      {noCountry && <p className="mt-1 text-[11px] text-slate-500">{t('اختر البلد/الإقليم أولًا لعرض العناوين المقترحة.', 'Choose the country first to see suggested addresses.')}</p>}
      {show && (
        <Dropdown id={listId} label={t('العناوين المقترحة', 'Suggested addresses')}>
          {r.status === 'done' && r.items.length ? r.items.map((s, i) => (
            <button key={`${s.id ?? s.main}-${i}`} id={`${listId}-${i}`} type="button" role="option" aria-selected={i === active} tabIndex={-1}
              onMouseDown={(e) => e.preventDefault()} onClick={() => void pick(i)} className={optionCls(i === active)} data-address-option={i}>
              <MapPin size={16} className="mt-0.5 text-indigo-500 shrink-0" />
              <span className="flex-1 min-w-0 text-start" dir="ltr">
                <span className="block text-sm font-bold text-slate-900 dark:text-white truncate">{s.main}</span>
                <span className="block text-[11px] text-slate-500 truncate">{s.secondary}</span>
              </span>
              {s.short_address && <span className="shrink-0 px-2 py-0.5 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-[10px] font-bold text-indigo-700 dark:text-indigo-300 font-mono" dir="ltr">{s.short_address}</span>}
            </button>
          )).concat(r.items.some((x) => x.provider === 'google')
            // Google Maps Platform attribution for predictions shown without a map
            ? [<div key="google-attribution" className="px-3 py-1.5 border-t border-slate-100 dark:border-slate-700 text-end text-[10px] font-semibold text-slate-400" dir="ltr" data-testid="google-attribution">Powered by Google</div>]
            : []) : (
            <StatusRow status={r.status} t={t}
              empty={country === 'SA' ? t('لم يتم العثور على عنوان وطني مطابق.', 'No matching National Address was found.') : t('لم يتم العثور على عنوان مطابق.', 'No matching address was found.')}
              unavailable={t('البحث التلقائي عن العناوين غير مفعّل — أدخل العنوان يدويًا.', 'Address suggestions are not enabled — enter the address manually.')} />
          )}
        </Dropdown>
      )}
    </div>
  );
}

// ── City → Google city suggestions (cities only, country-limited); selecting fills the State ──
function CityInput({ id, value, onChange, country, onPick, error, t }: {
  id: string; value: string; onChange: (v: string) => void; country: string; onPick: (s: AddressSuggestion, session: string) => Promise<void>; error?: string | null; t: T;
}) {
  const box = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [open, setOpen] = useState(false);
  /** The text the person last typed here — the only text ever looked up. */
  const [mine, setMine] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [picking, setPicking] = useState(false);
  const session = useRef(newSession());
  const fetcher = useCallback((k: string, signal: AbortSignal) => {
    const [cc, ...rest] = k.split('|');
    return addressLookupService.cities(rest.join('|'), cc, session.current, signal);
  }, []);
  const typed = value.trim();
  // only while the person types here (a value filled by another lookup never asks Google again)
  const key = open && value === mine && country && typed.length >= 2 ? `${country}|${typed}` : null;
  const r = useLookup<AddressSuggestion>(key, fetcher, 300);
  useOutside(box, () => setOpen(false));
  const pick = async (i: number) => {
    const s = r.items[i];
    if (!s) return;
    setOpen(false);
    setPicking(true);
    try { await onPick(s, session.current); } finally { setPicking(false); session.current = newSession(); }
  };
  const noCountry = open && !country && typed.length >= 2;
  const show = !!key && r.status !== 'idle';
  return (
    <div ref={box} className="relative">
      <TextInput id={id} value={value} ltr autoComplete="off" error={error} role="combobox" aria-expanded={show} aria-controls={listId} aria-autocomplete="list"
        aria-activedescendant={show && r.items[active] ? `${listId}-${active}` : undefined}
        onValue={(v) => { onChange(v); setMine(v); setOpen(true); setActive(0); }}
        onKeyDown={listKeyHandler({ open: show, count: r.items.length, active, setActive, onPick: (i) => void pick(i), onClose: () => setOpen(false) })} />
      {(r.status === 'loading' || picking) && <Loader2 size={14} className="absolute end-3 top-3.5 animate-spin text-slate-400" />}
      {noCountry && <p className="mt-1 text-[11px] text-slate-500">{t('اختر البلد/الإقليم أولًا لعرض المدن المقترحة.', 'Choose the country first to see suggested cities.')}</p>}
      {show && (
        <Dropdown id={listId} label={t('المدن المقترحة', 'Suggested cities')}>
          {r.status === 'done' && r.items.length ? r.items.map((s, i) => (
            <button key={`${s.id ?? s.main}-${i}`} id={`${listId}-${i}`} type="button" role="option" aria-selected={i === active} tabIndex={-1}
              onMouseDown={(e) => e.preventDefault()} onClick={() => void pick(i)} className={optionCls(i === active)} data-city-option={i}>
              <Building2 size={16} className="mt-0.5 text-indigo-500 shrink-0" />
              <span className="flex-1 min-w-0 text-start" dir="ltr">
                <span className="block text-sm font-bold text-slate-900 dark:text-white truncate">{s.main}</span>
                <span className="block text-[11px] text-slate-500 truncate">{citySecondary(s.secondary, country)}</span>
              </span>
            </button>
          )).concat([<div key="google-attribution" className="px-3 py-1.5 border-t border-slate-100 dark:border-slate-700 text-end text-[10px] font-semibold text-slate-400" dir="ltr" data-testid="google-attribution">Powered by Google</div>]) : (
            <StatusRow status={r.status} t={t} empty={t('لم يتم العثور على مدينة مطابقة في هذا البلد.', 'No matching city was found in this country.')}
              unavailable={t('اقتراح المدن غير مفعّل — أدخل المدينة يدويًا.', 'City suggestions are not enabled — enter the city manually.')} />
          )}
        </Dropdown>
      )}
    </div>
  );
}

// ── Saudi Short Address (KUDA2519) → National Address (SPL, behind the Backend) ──
/** SPL result rows: the code, then the address lines exactly as SPL sent them (nothing invented). */
const splLines = (s: AddressSuggestion) => {
  const a = s.address;
  return {
    line: a?.address_line1 ?? s.main,
    place: [a?.address_line2 ?? a?.district, a?.city, a?.province_name ?? a?.province, a?.postal_code].filter(Boolean).join(' · '),
  };
};
function ShortAddressInput({ id, value, onChange, onPick, error, t }: {
  id: string; value: string; onChange: (v: string) => void; onPick: (s: AddressSuggestion, auto: boolean) => void; error?: string | null; t: T;
}) {
  const box = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [open, setOpen] = useState(false);
  /** The text the person last typed here — the only text ever looked up. */
  const [mine, setMine] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const fetcher = useCallback((code: string, signal: AbortSignal) => addressLookupService.shortAddress(code, signal), []);
  const valid = SHORT_ADDRESS_RE.test(value);
  // only a complete code (4 Latin letters + 4 digits), only while the person types here
  const key = open && value === mine && valid ? value : null;
  const r = useLookup<AddressSuggestion>(key, fetcher, 350);
  useOutside(box, () => setOpen(false));
  const pick = (i: number) => { const s = r.items[i]; if (s) { onPick(s, false); setOpen(false); } };
  // exactly one National Address for the code → filled at once (still editable); several → the person chooses
  const autoKey = useRef<string | null>(null);
  const pickRef = useRef(onPick);
  useEffect(() => { pickRef.current = onPick; }, [onPick]);
  const only = r.status === 'done' && r.items.length === 1 && r.items[0].address ? r.items[0] : null;
  useEffect(() => {
    if (!key) { autoKey.current = null; return; }
    if (only && autoKey.current !== key) {
      autoKey.current = key;
      pickRef.current(only, true);
      setOpen(false);
    }
  }, [key, only]);
  const show = !!key && r.status !== 'idle' && !only;
  return (
    <div ref={box} className="relative">
      <TextInput id={id} value={value} ltr autoComplete="off" error={error} placeholder="KUDA2519" maxLength={8} role="combobox" aria-expanded={show} aria-controls={listId}
        aria-autocomplete="list" className="font-mono uppercase"
        onValue={(v) => { const nv = normalizeShortAddress(v); onChange(nv); setMine(nv); setOpen(true); setActive(0); }}
        onKeyDown={listKeyHandler({ open: show, count: r.items.length, active, setActive, onPick: pick, onClose: () => setOpen(false) })} />
      {r.status === 'loading' && <Loader2 size={14} className="absolute end-3 top-3.5 animate-spin text-slate-400" />}
      {value.length === 8 && !valid && <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">{t('العنوان المختصر: 4 أحرف لاتينية ثم 4 أرقام، مثل KUDA2519.', 'Short address: 4 Latin letters then 4 digits, e.g. KUDA2519.')}</p>}
      {show && (
        <Dropdown id={listId} label={t('العناوين الوطنية', 'National addresses')}>
          {r.status === 'done' && r.items.length ? r.items.map((s, i) => {
            const l = splLines(s);
            return (
              <button key={i} type="button" role="option" aria-selected={i === active} tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(i)} className={optionCls(i === active)} data-short-option={i}>
                <MapPin size={16} className="mt-0.5 text-indigo-500 shrink-0" />
                <span className="flex-1 min-w-0 text-start" dir="ltr">
                  <span className="block text-sm font-extrabold font-mono text-indigo-700 dark:text-indigo-300">{s.short_address ?? value}</span>
                  <span className="block text-xs font-bold text-slate-900 dark:text-white truncate">{l.line}</span>
                  {l.place && <span className="block text-[11px] text-slate-500 truncate">{l.place}</span>}
                </span>
              </button>
            );
          }) : (
            <StatusRow status={r.status} t={t} empty={t('لم يتم العثور على عنوان وطني مطابق.', 'No matching National Address was found.')}
              failed={t('البحث في العنوان الوطني غير متاح مؤقتًا — أدخل العنوان يدويًا.', 'National Address lookup is temporarily unavailable — enter the address manually.')}
              unavailable={t('البحث في العنوان الوطني غير مفعّل — أدخل العنوان يدويًا.', 'National Address lookup is not enabled — enter the address manually.')} />
          )}
        </Dropdown>
      )}
    </div>
  );
}

// ── Postal code → city + state (country rules in addressRules; US ZIP via Google Geocoding behind the Backend) ──
function PostalCodeInput({ id, value, country, onChange, onPick, error, required, t }: {
  id: string; value: string; country: string; onChange: (v: string) => void; onPick: (l: PostalLocality, auto: boolean) => void; error?: string | null; required?: boolean; t: T;
}) {
  const box = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [open, setOpen] = useState(false);
  /** The text the person last typed here — the only text ever looked up. */
  const [mine, setMine] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);
  const fetcher = useCallback((k: string, signal: AbortSignal) => { const [cc, code] = k.split('|'); return addressLookupService.postalCode(code, cc, signal); }, []);
  const rule = postalRule(country);
  const code = postalLookupCode(country, value);
  // only a complete code of a country with a lookup is asked (never on every digit, never half-typed)
  const key = open && value === mine && code ? `${country}|${code}` : null;
  const r = useLookup<PostalLocality>(key, fetcher, 300);
  useOutside(box, () => setOpen(false));
  const pick = (i: number) => { const l = r.items[i]; if (l) { onPick(l, false); setOpen(false); } };
  // exactly one locality → filled straight away (once per lookup); several → the person chooses
  const autoKey = useRef<string | null>(null);
  const pickRef = useRef(onPick);
  useEffect(() => { pickRef.current = onPick; }, [onPick]);
  const only = r.status === 'done' && r.items.length === 1 ? r.items[0] : null;
  useEffect(() => {
    if (!key) { autoKey.current = null; return; }
    if (only && autoKey.current !== key) {
      autoKey.current = key;
      pickRef.current(only, true);
      setOpen(false);
    }
  }, [key, only]);
  const show = !!key && r.status !== 'idle' && !only;
  const formatIssue = !focused ? postalFormatIssue(country, value) : null;
  return (
    <div ref={box} className="relative">
      <TextInput id={id} value={value} ltr autoComplete="postal-code" inputMode={rule?.numeric ? 'numeric' : undefined} error={error} aria-required={required}
        role="combobox" aria-expanded={show} aria-controls={listId}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        onValue={(v) => { const nv = rule?.sanitize ? rule.sanitize(v) : v; onChange(nv); setMine(nv); setOpen(true); setActive(0); }}
        onKeyDown={listKeyHandler({ open: show, count: r.items.length, active, setActive, onPick: pick, onClose: () => setOpen(false) })} />
      {r.status === 'loading' && <Loader2 size={14} className="absolute end-3 top-3.5 animate-spin text-slate-400" />}
      {formatIssue && !error && <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300" data-testid="postal-format">{t(`صيغة الرمز البريدي: ${formatIssue[0]}`, `Postal code format: ${formatIssue[1]}`)}</p>}
      {show && (
        <Dropdown id={listId} label={t('المدن المطابقة للرمز البريدي', 'Cities for this postal code')}>
          {r.status === 'done' && r.items.length ? r.items.map((l, i) => (
            <button key={`${l.city}-${l.province}-${i}`} type="button" role="option" aria-selected={i === active} tabIndex={-1} data-postal-option={i}
              onMouseDown={(e) => e.preventDefault()} onClick={() => pick(i)} className={optionCls(i === active)}>
              <MapPin size={16} className="mt-0.5 text-indigo-500 shrink-0" />
              <span className="flex-1 min-w-0 text-start" dir="ltr">
                <span className="block text-sm font-bold text-slate-900 dark:text-white truncate font-mono">{l.postal_code}</span>
                <span className="block text-[11px] text-slate-500 truncate">
                  {[l.city, l.province_name ?? subdivisionName(l.country_code, l.province) ?? l.province, countryName(l.country_code, 'en')].filter(Boolean).join(' · ')}
                </span>
              </span>
            </button>
          )) : (
            <StatusRow status={r.status} t={t} empty={t('لم يتم العثور على مدينة مطابقة لهذا الرمز البريدي.', 'No matching city was found for this postal code.')}
              unavailable={t('البحث بالرمز البريدي غير مفعّل — أدخل المدينة والولاية يدويًا.', 'Postal code lookup is not enabled — enter the city and state manually.')} />
          )}
        </Dropdown>
      )}
    </div>
  );
}

// ── Phones (type, code, number, extension, SMS, add another) ──
const PHONE_TYPES: Array<[PhoneType, string, string]> = [['mobile', 'هاتف متحرك', 'Mobile'], ['office', 'المكتب', 'Office'], ['fax', 'الفاكس', 'Fax']];
function PhoneRows({ who, phones, country, onChange, err, t }: {
  who: Who; phones: PhoneEntry[]; country: string; onChange: (p: PhoneEntry[]) => void; err: (k: string) => string | null; t: T;
}) {
  const set = (i: number, patch: Partial<PhoneEntry>) => onChange(phones.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  return (
    <div className="space-y-3">
      {phones.map((ph, i) => (
        <div key={i} className="space-y-2" data-phone-row={i}>
          <div className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,5.5rem)_minmax(0,1fr)] sm:grid-cols-[minmax(0,8rem)_minmax(0,6rem)_minmax(0,1fr)_minmax(0,5rem)] gap-2 items-start">
            <Field label={t('نوع الهاتف', 'Phone Type')}>{(id) => (
              <select id={id} value={ph.type} onChange={(e) => set(i, { type: e.target.value as PhoneType, sms: e.target.value === 'mobile' ? ph.sms : false })} className={inputCls()}>
                {PHONE_TYPES.map(([v, ar, en]) => <option key={v} value={v}>{t(ar, en)}</option>)}
              </select>
            )}</Field>
            <Field label={t('الرمز', 'Code')} required={i === 0} error={i === 0 ? err(`${who}.phone_code`) : null}>{(id) => (
              <div className="relative">
                <span className="absolute start-2.5 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400 pointer-events-none" dir="ltr">+</span>
                <TextInput id={id} value={ph.code} onValue={(v) => set(i, { code: v.replace(/\D/g, '').slice(0, 4) })} ltr inputMode="numeric" className="ps-6"
                  error={i === 0 ? err(`${who}.phone_code`) : null} placeholder={country ? undefined : '966'} />
              </div>
            )}</Field>
            <Field label={t('الهاتف', 'Phone')} required={i === 0} error={i === 0 ? err(`${who}.phone`) : null}>{(id) => (
              <TextInput id={id} type="tel" value={ph.number} onValue={(v) => set(i, { number: v.replace(/[^\d\s()+-]/g, '').slice(0, 30) })} ltr autoComplete="tel"
                error={i === 0 ? err(`${who}.phone`) : null} placeholder="53 729 9636" />
            )}</Field>
            <Field label={t('التحويلة', 'Extension')} className="col-span-1 sm:col-span-1">{(id) => (
              <TextInput id={id} value={ph.extension} onValue={(v) => set(i, { extension: v.replace(/\D/g, '').slice(0, 10) })} ltr inputMode="numeric" />
            )}</Field>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            {ph.type === 'mobile' ? (
              <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 accent-indigo-600" checked={ph.sms} onChange={(e) => set(i, { sms: e.target.checked })} />
                {t('تم تمكين الرسائل النصية القصيرة', 'SMS Enabled')}
              </label>
            ) : <span />}
            {i > 0 && (
              <button type="button" onClick={() => onChange(phones.filter((_, j) => j !== i))} className="inline-flex items-center gap-1 text-xs font-bold text-red-600 hover:underline">
                <Trash2 size={13} /> {t('حذف الرقم', 'Remove number')}
              </button>
            )}
          </div>
        </div>
      ))}
      {phones.length < 5 && (
        <button type="button" onClick={() => onChange([...phones, emptyPhone(country, 'mobile')])}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-dashed border-slate-300 dark:border-slate-600 text-xs font-bold text-slate-600 dark:text-slate-300 hover:border-indigo-400 hover:text-indigo-600 min-h-[40px]">
          <Plus size={14} /> {t('إضافة أخرى', 'Add Another')}
        </button>
      )}
    </div>
  );
}

// ── Saudi National Address notice ──
function SaudiNotice({ t }: { t: T }) {
  return (
    <div className="flex gap-3 rounded-2xl border border-indigo-100 dark:border-indigo-900/40 bg-indigo-50/60 dark:bg-indigo-900/15 p-3 sm:p-4 text-xs leading-relaxed text-slate-700 dark:text-slate-200" role="note" data-testid="sa-national-address-notice">
      <span className="shrink-0 w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center"><MapPin size={16} /></span>
      <div className="space-y-1.5 min-w-0">
        <p className="font-bold text-slate-800 dark:text-slate-100">{t(
          'يجب على جميع الشحنات من وإلى المملكة العربية السعودية اتباع هيكل العنوان الوطني كمتطلب إلزامي من الهيئة العامة للنقل (TGA)، علمًا بأن تقديم تفاصيل غير كاملة قد يؤدي إلى تأخير الشحن.',
          'For all shipments to and from Saudi Arabia (SA) addresses must follow the National Address structure as a mandatory requirement by Transport General Authority (TGA). Providing incomplete details may cause delays.',
        )}</p>
        <p>{t(
          'في سطر العنوان 1: يُرجى إدخال العنوان المختصر والانتظار قليلًا، حيث سيعرض النظام عناوين مقترحة لتختار منها. (موصى به)',
          'In Address 1: Please enter Short Address and wait for a moment - the system will show suggested addresses for you to select. (Recommended)',
        )}</p>
        <p>{t(
          'أو إدخال العنوان الكامل يدويًا، على أن يبدأ برقم المبنى المكوّن من 4 أرقام واسم الشارع.',
          'OR manually enter a full address starting with the 4-digit building number and street name.',
        )}</p>
      </div>
    </div>
  );
}

const Check2 = ({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) => (
  <label className="inline-flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200 cursor-pointer select-none min-h-[32px]">
    <input type="checkbox" className="w-4 h-4 accent-indigo-600" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    {label}
  </label>
);

// ── «حفظ في قاعدة البيانات»: a SHIPPEC alias, then save; an alias in use → update / another name / cancel ──
function SaveContactDialog({ open, initialName, onClose, onSave, conflict, busy, error, canUpdate, onUpdate, onChooseAnother, t, dir }: {
  open: boolean; initialName: string; onClose: () => void; onSave: (savedName: string) => void; conflict: SavedContact | null; busy: boolean; error: string | null;
  canUpdate: (c: SavedContact) => boolean; onUpdate: (c: SavedContact, savedName: string) => void; onChooseAnother: () => void; t: T; dir: 'rtl' | 'ltr';
}) {
  const hid = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(initialName);
  const [touched, setTouched] = useState(false);
  const missing = !name.trim();
  return (
    <Dialog open={open} onRequestClose={onClose} labelledBy={hid} panelClassName="sm:max-w-md" initialFocusRef={inputRef as React.RefObject<HTMLElement>}>
      <form className="p-5 space-y-4" dir={dir} data-testid="save-contact-dialog"
        onSubmit={(ev) => { ev.preventDefault(); setTouched(true); if (!missing && !busy) onSave(name.trim()); }}>
        <div className="flex items-start justify-between gap-3">
          <h2 id={hid} className="text-lg font-extrabold text-slate-900 dark:text-white flex items-center gap-2"><Database size={18} className="text-indigo-600" /> {t('حفظ جهة الاتصال', 'Save contact')}</h2>
          <button type="button" onClick={onClose} aria-label={t('إغلاق', 'Close')} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"><X size={18} /></button>
        </div>
        {conflict ? (
          <div className="space-y-3" data-testid="save-contact-conflict">
            <p className="rounded-2xl bg-amber-50 dark:bg-amber-900/15 p-3 text-sm font-bold text-amber-800 dark:text-amber-300" role="alert">{t('توجد جهة اتصال محفوظة بهذا الاسم بالفعل.', 'A saved contact with this name already exists.')}</p>
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-3">
              <span className="block text-sm font-extrabold text-slate-900 dark:text-white" dir="auto">{conflict.saved_name}</span>
              <span className="block text-[11px] text-slate-500" dir="ltr">{[conflict.name, conflict.company, conflict.city, conflict.country_code].filter(Boolean).join(' · ')}</span>
            </div>
            {!canUpdate(conflict) && <p className="text-[11px] text-slate-500">{t('تحديث جهة اتصال حفظها مستخدم آخر متاح للمدير أو المسؤول فقط.', 'Updating a contact saved by another user is for a manager or admin only.')}</p>}
            {error && <p className="text-xs font-bold text-red-600" role="alert">{error}</p>}
            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
              <Button variant="secondary" onClick={onClose}>{t('إلغاء', 'Cancel')}</Button>
              <Button variant="secondary" onClick={() => { onChooseAnother(); window.setTimeout(() => inputRef.current?.select(), 0); }}>{t('اختيار اسم آخر', 'Choose Another Name')}</Button>
              {canUpdate(conflict) && <Button loading={busy} onClick={() => onUpdate(conflict, name.trim())}>{t('تحديث الموجود', 'Update Existing')}</Button>}
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm text-slate-700 dark:text-slate-200">{t('بأي اسم تريد حفظ هذه البيانات؟', 'What name would you like to save this contact as?')}</p>
            <Field label={t('اسم الحفظ', 'Saved name')} required error={touched && missing ? t('اسم الحفظ مطلوب.', 'The saved name is required.') : null}
              hint={t('للبحث داخل SHIPPEC فقط — لا يُرسل إلى DHL.', 'For searching in SHIPPEC only — never sent to DHL.')}>
              {(id) => <input ref={inputRef} id={id} value={name} onChange={(e) => setName(e.target.value.slice(0, 255))} dir="auto" aria-invalid={touched && missing}
                className={inputCls(touched && missing ? 'x' : null)} placeholder={t('مثال: سلوى — أمريكا', 'e.g. Salwa USA Address')} />}
            </Field>
            {error && <p className="text-xs font-bold text-red-600" role="alert">{error}</p>}
            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
              <Button variant="secondary" onClick={onClose}>{t('إلغاء', 'Cancel')}</Button>
              <Button type="submit" loading={busy}><Database size={15} /> {t('حفظ', 'Save')}</Button>
            </div>
          </>
        )}
      </form>
    </Dialog>
  );
}

// ── One party (From / To) ──
function PartyPanel({ who, value, onChange, err, t, lang }: {
  who: Who; value: PartyForm; onChange: (p: PartyForm) => void; err: (k: string) => string | null; t: T; lang: CsLang;
}) {
  const role = useAuthStore((s) => s.user?.role);
  const userId = useAuthStore((s) => (s.user as { id?: number } | null)?.id);
  const canRead = canShipment(role, 'contacts_read');
  const canWrite = canShipment(role, 'contacts_write');
  const canManage = canShipment(role, 'contacts_manage');
  const [saving, setSaving] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [conflict, setConflict] = useState<SavedContact | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const set = <K extends keyof PartyForm>(k: K, v: PartyForm[K]) => onChange({ ...value, [k]: v });
  const e = (k: string) => err(`${who}.${k}`);
  const sa = value.country_code === 'SA';
  const contactRole = who === 'shipper' ? 'sender' : 'receiver';

  // Address 1 suggestion → every address field (SPL National Address: authoritative)
  const pickAddress = async (s: AddressSuggestion, session: string) => {
    setLookupError(null);
    try {
      const addr = s.address ?? (s.id ? await addressLookupService.details(s.id, value.country_code, session) : null);
      if (addr) onChange(applyAddress(value, addr, s.provider === 'spl'));
    } catch (x) {
      setLookupError(describeApiError(x, t('تعذر جلب تفاصيل العنوان — أكمل يدويًا.', 'Could not load the address details — complete it manually.')));
    }
  };

  // City suggestion → City + State (+ country); the postal code is left alone
  const pickCity = async (s: AddressSuggestion, session: string) => {
    setLookupError(null);
    try {
      if (s.id) onChange(applyCity(value, await addressLookupService.details(s.id, value.country_code, session), s.main));
    } catch (x) {
      setLookupError(describeApiError(x, t('تعذر جلب تفاصيل المدينة — أكمل الولاية يدويًا.', 'Could not load the city details — enter the state manually.')));
    }
  };
  const stateName = subdivisionName(value.country_code, value.province);
  // Short Address → the whole Saudi National Address (SPL is authoritative; the old address never stays)
  const [splFilled, setSplFilled] = useState<PartyForm | null>(null);
  const pickShort = (s: AddressSuggestion) => {
    if (!s.address) return;
    const next = applyAddress(value, { ...s.address, short_address: s.address.short_address ?? (value.short_address || null), country_code: 'SA' }, true);
    onChange(next);
    setSplFilled(next);
  };
  const splNote = splFilled && (['short_address', 'address_line1', 'address_line2', 'city', 'province', 'postal_code'] as const)
    .every((k) => splFilled[k] === value[k]) ? splFilled.short_address : null;
  // Postal code → City + State (the ZIP typed is kept, e.g. ZIP+4); the note stays while those fields are unchanged
  const [filled, setFilled] = useState<{ postal_code: string; city: string; province: string } | null>(null);
  const pickPostal = (l: PostalLocality) => {
    const next = { ...value, city: l.city ?? value.city, province: l.province ?? value.province, postal_code: value.postal_code.trim() || l.postal_code };
    onChange(next);
    setFilled({ postal_code: next.postal_code, city: next.city, province: next.province });
  };
  const postalFilled = filled && filled.postal_code === value.postal_code && filled.city === value.city && filled.province === value.province ? filled : null;

  const openSave = () => {
    if (!value.contact.trim() || !value.country_code) {
      toast.error(t('أدخل الاسم والبلد قبل الحفظ في قاعدة البيانات.', 'Enter the name and country before saving to the database.'));
      return;
    }
    setConflict(null);
    setSaveError(null);
    setSaveOpen(true);
  };
  const saved = (id: number) => {
    onChange({ ...value, saved_contact_id: id });
    setSaveOpen(false);
    setConflict(null);
    toast.success(t('تم حفظ جهة الاتصال في قاعدة البيانات بنجاح.', 'Contact saved to database successfully.'));
  };
  const save = async (savedName: string) => {
    setSaving(true);
    setSaveError(null);
    try {
      saved((await shippingContactsService.create(contactRole, savedName, contactFieldsOf(value))).id);
    } catch (x) {
      const d = duplicatesOf(x);
      if (d) setConflict(d[0] ?? null);
      else setSaveError(describeApiError(x, t('تعذر حفظ جهة الاتصال.', 'Could not save the contact.')));
    } finally {
      setSaving(false);
    }
  };
  const updateExisting = async (c: SavedContact, savedName: string) => {
    setSaving(true);
    setSaveError(null);
    try {
      saved((await shippingContactsService.update(c.id, contactRole, savedName || c.saved_name, contactFieldsOf(value))).id);
    } catch (x) {
      setSaveError(describeApiError(x, t('تعذر تحديث جهة الاتصال.', 'Could not update the contact.')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 min-w-0" data-party={who}>
      <h2 className="text-lg font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
        {who === 'shipper' ? <Building2 size={18} className="text-indigo-600" /> : <User size={18} className="text-indigo-600" />}
        {who === 'shipper' ? t('من', 'From') : t('إلى', 'To')}
        {value.saved_contact_id && <span className="ms-auto px-2 py-0.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1"><Database size={11} /> {t('من قاعدة البيانات', 'From database')}</span>}
      </h2>

      <Field label={t('الاسم', 'Name')} required error={e('contact')}>{(id) => (
        <ContactNameInput id={id} who={who} value={value.contact} error={e('contact')} canSearch={canRead} lang={lang} t={t}
          placeholder={who === 'receiver' ? t('الاسم الأول والاسم الأخير', 'First name and last name') : undefined}
          onChange={(v) => onChange({ ...value, contact: v })}
          onPick={(c) => onChange(applyContact(value, c))} />
      )}</Field>
      <Check2 checked={value.business_contact} onChange={(v) => set('business_contact', v)} label={t('بيانات الشركة', 'Business Contact')} />
      <Field label={t('الشركة', 'Company')} required error={e('company')}>{(id) => <TextInput id={id} value={value.company} onValue={(v) => set('company', v)} error={e('company')} ltr autoComplete="organization" />}</Field>
      <Field label={t('البلد/الإقليم', 'Country/Territory')} required error={e('country_code')}>{(id) => (
        <CountryCombobox id={id} value={value.country_code} error={e('country_code')} lang={lang} t={t} onChange={(code) => onChange(withCountry(value, code))} />
      )}</Field>

      {sa && <SaudiNotice t={t} />}

      {sa && (
        <Field label={t('العنوان المختصر', 'Short Address')} error={e('address_line3')}
          hint={t('أدخل العنوان المختصر (مثل KUDA2519) لتعبئة العنوان الوطني تلقائيًا.', 'Enter the short address (e.g. KUDA2519) to fill the National Address automatically.')}>{(id) => (
          <ShortAddressInput id={id} value={value.short_address} error={e('address_line3')} t={t}
            onChange={(v) => set('short_address', v)} onPick={pickShort} />
        )}</Field>
      )}
      {sa && splNote && (
        <p className="-mt-2 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 flex items-center gap-1" role="status" data-testid="spl-autofill-note">
          <MapPin size={12} /> {t(`تمت تعبئة العنوان الوطني من SPL للعنوان المختصر ${splNote}.`, `National Address filled from SPL for short address ${splNote}.`)}
        </p>
      )}

      <Field label={t('العنوان 1', 'Address 1')} required error={e('address_line1')}>{(id) => (
        <Address1Input id={id} value={value.address_line1} country={value.country_code} error={e('address_line1')} t={t}
          onChange={(v) => set('address_line1', v)} onPick={pickAddress} />
      )}</Field>
      {lookupError && <p className="-mt-2 text-[11px] font-semibold text-amber-700 dark:text-amber-300" role="status">{lookupError}</p>}
      <Field label={t('عنوان 2', 'Address 2')} required={sa} error={e('address_line2')}>{(id) => <TextInput id={id} value={value.address_line2} onValue={(v) => set('address_line2', v)} error={e('address_line2')} ltr />}</Field>
      <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3">
        <Field label={t('الضاحية', 'Suburb')} error={sa ? null : e('address_line3')}>{(id) => <TextInput id={id} value={value.suburb} onValue={(v) => set('suburb', v)} ltr error={sa ? null : e('address_line3')} />}</Field>
        <Field label={t('المدينة', 'City')} required error={e('city')}>{(id) => (
          <CityInput id={id} value={value.city} country={value.country_code} error={e('city')} t={t}
            onChange={(v) => set('city', v)} onPick={pickCity} />
        )}</Field>
        <Field label={t('الولاية / المنطقة', 'State')} required={value.country_code === 'US'} error={e('province')}
          hint={stateName ? <span dir="ltr" data-testid="state-name">{stateName}</span> : undefined}>{(id) => <TextInput id={id} value={value.province} onValue={(v) => set('province', v)} error={e('province')} ltr />}</Field>
        <Field label={t('الرمز البريدي', 'Postal Code')} required={sa || value.country_code === 'US'} error={e('postal_code')}>{(id) => (
          <PostalCodeInput id={id} value={value.postal_code} country={value.country_code} error={e('postal_code')} required={sa || value.country_code === 'US'} t={t}
            onChange={(v) => set('postal_code', v)} onPick={pickPostal} />
        )}</Field>
      </div>
      {postalFilled && (
        <p className="-mt-2 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 flex items-center gap-1" role="status" data-testid="postal-autofill-note">
          <MapPin size={12} /> {t(`تمت تعبئة المدينة والولاية تلقائيًا من الرمز البريدي ${postalFilled.postal_code}.`, `City and state were filled automatically from postal code ${postalFilled.postal_code}.`)}
        </p>
      )}
      <Check2 checked={value.residential} onChange={(v) => set('residential', v)} label={t('عنوان سكني', 'Residential Address')} />

      <Field label={t('عنوان البريد الإلكتروني', 'Email address')} error={e('email')}>{(id) => (
        <TextInput id={id} type="email" value={value.email} onValue={(v) => set('email', v)} error={e('email')} ltr autoComplete="email"
          placeholder={who === 'receiver' ? t('سترسل DHL إشعارات الشحنة إلى عنوان البريد الإلكتروني هذا', 'DHL will send shipment notifications to this email address') : undefined} />
      )}</Field>
      <PhoneRows who={who} phones={value.phones} country={value.country_code} onChange={(p) => set('phones', p)} err={err} t={t} />

      <Field label={t('رقم تعريف VAT/الضريبة', 'VAT/Tax ID')} error={null}>{(id) => <TextInput id={id} value={value.vat_tax_id} onValue={(v) => set('vat_tax_id', v.slice(0, 50))} ltr />}</Field>
      <div className="-mt-2 rounded-xl bg-slate-50 dark:bg-slate-900/40 px-3 py-2 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400 flex gap-2">
        <Info size={13} className="shrink-0 mt-0.5" />
        <div>
          <p>{t('يجب إدخال أحد الخيارات التالية في حقل رقم تعريف ضريبة القيمة المضافة VAT/الضريبة:', 'One of below is required to be filled in VAT/Tax ID field:')}</p>
          <ul className="list-disc ps-4 mt-0.5">
            <li>{t('الشركات: رقم تسجيل ضريبة القيمة المضافة VAT أو رقم السجل التجاري', 'Businesses: VAT Registration Number or Commercial Registration Number')}</li>
            <li>{t('الأفراد: رقم الهوية الوطنية (رقم أحوال)، أو رقم تصريح الإقامة (رقم إقامة)، أو رقم جواز السفر', 'Individuals: National ID (Ahwal Number), Residence Permit ID Number (Iqama Number) or Passport Number')}</li>
          </ul>
        </div>
      </div>
      <Field label={t('رقم EORI', 'EORI Number')}>{(id) => <TextInput id={id} value={value.eori} onValue={(v) => set('eori', v.slice(0, 50))} ltr />}</Field>
      {who === 'receiver' && (
        <Field label={t('ملاحظات حول جهة الاتصال', 'Notes about this contact')}>{(id) => (
          <textarea id={id} value={value.notes} onChange={(ev) => set('notes', ev.target.value.slice(0, 1000))} rows={3} dir="auto" className={`${inputCls()} resize-y`} />
        )}</Field>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100 dark:border-slate-700/60">
        <button type="button" onClick={() => onChange(clearAddress(value))} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 min-h-[40px]">
          <Eraser size={14} /> {t('مسح العنوان', 'Clear Address')}
        </button>
        {canWrite && (
          <Button variant="secondary" className="ms-auto" onClick={openSave}>
            <Database size={15} /> {t('حفظ في قاعدة البيانات', 'Save to Database')}
          </Button>
        )}
      </div>

      {saveOpen && (
        <SaveContactDialog open={saveOpen} initialName={value.contact} conflict={conflict} busy={saving} error={saveError} t={t} dir={lang === 'en' ? 'ltr' : 'rtl'}
          canUpdate={(c) => canManage || (c.created_by != null && c.created_by === userId)}
          onClose={() => { setSaveOpen(false); setConflict(null); }}
          onSave={(n) => void save(n)}
          onChooseAnother={() => { setConflict(null); setSaveError(null); }}
          onUpdate={(c, n) => void updateExisting(c, n)} />
      )}
    </div>
  );
}

// ── SHIPPEC customer (invoice owner) ──
function ClientPicker({ w, error, t }: { w: Wizard; error: string | null; t: T }) {
  const { form, update } = w;
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const listId = useId();
  useEffect(() => {
    if (form.client_id && !form.client_name) {
      // GET /clients/:id answers { client: {...}, invoices, ... }
      api.get<{ client?: { name?: string }; name?: string } | null>(`/clients/${form.client_id}`).then((c) => update((f) => ({ ...f, client_name: c?.client?.name ?? c?.name ?? `#${f.client_id}` })), () => undefined);
    }
  }, [form.client_id, form.client_name, update]);
  const fetcher = useCallback((s: string) => searchClients(s), []);
  const r = useLookup(open && q.trim().length >= 2 ? q.trim() : null, fetcher, 300);
  useOutside(box, () => setOpen(false));
  const choose = (i: number) => {
    const c = r.items[i];
    if (!c) return;
    update((f) => ({ ...f, client_id: c.id, client_name: c.name }));
    setOpen(false);
    setQ('');
  };
  const selected = form.client_id ? { id: form.client_id, name: form.client_name } : null;
  const show = open && r.status !== 'idle';
  return (
    <div ref={box} className="space-y-2">
      {selected ? (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-indigo-100 dark:border-indigo-900/40 bg-indigo-50/60 dark:bg-indigo-900/20 px-3 py-2.5">
          <UserCheck size={16} className="text-indigo-600" />
          <span className="text-sm font-extrabold text-slate-900 dark:text-white">{selected.name || `#${selected.id}`}</span>
          <span className="text-[11px] text-slate-500">— {t('تُنشأ فاتورة SHIPPEC باسم هذا العميل', 'The SHIPPEC invoice is issued to this customer')}</span>
          <button type="button" className="ms-auto text-xs font-bold text-red-600 hover:underline" onClick={() => update((f) => ({ ...f, client_id: null, client_name: '' }))}>{t('تغيير', 'Change')}</button>
        </div>
      ) : (
        <Field label={t('عميل SHIPPEC (صاحب الفاتورة)', 'SHIPPEC Customer (Invoice Owner)')} required error={error}
          hint={t('ابحث باسم العميل أو الجوال — اختيار صاحب الفاتورة لا يستبدل بيانات المرسل أو المستلم.', 'Search by customer name or mobile. Selecting the invoice customer does not replace sender or receiver shipment details.')}>
          {(id) => (
            <div className="relative">
              <Search size={16} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <TextInput id={id} value={q} onValue={(v) => { setQ(v); setOpen(true); setActive(0); }} className="ps-9" error={error}
                placeholder={t('اسم العميل أو رقم الجوال', 'Customer name or mobile')} role="combobox" aria-expanded={show} aria-controls={listId} aria-autocomplete="list"
                onKeyDown={listKeyHandler({ open: show, count: r.items.length, active, setActive, onPick: choose, onClose: () => setOpen(false) })} />
              {r.status === 'loading' && <Loader2 size={14} className="absolute end-3 top-1/2 -translate-y-1/2 animate-spin text-slate-400" />}
              {show && (
                <Dropdown id={listId} label={t('العملاء', 'Customers')}>
                  {r.status === 'done' && r.items.length ? r.items.map((c, i) => (
                    <button key={c.id} type="button" role="option" aria-selected={i === active} tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(i)} className={optionCls(i === active)}>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-bold text-slate-900 dark:text-white truncate">{c.name}</span>
                        <span className="block text-[11px] text-slate-500" dir="ltr">{c.phone ?? ''}{c.city ? ` · ${c.city}` : ''}</span>
                      </span>
                    </button>
                  )) : <StatusRow status={r.status} t={t} empty={t('لا يوجد عميل مطابق.', 'No matching customer.')} />}
                </Dropdown>
              )}
            </div>
          )}
        </Field>
      )}
    </div>
  );
}

/** Step 1. `showGate`: after a blocked Next, the missing required fields are marked (and clear as they are filled). */
export function StepParties({ w, showGate }: { w: Wizard; showGate: boolean }) {
  const { form, update, errors } = w;
  const { lang, t, dir } = useCsLang();
  const gate: FieldErrors = showGate ? partiesGate(form, lang) : {};
  const err = (k: string) => gate[k] ?? (errors[k] ? translateIssue(errors[k], lang) : null);
  const swap = () => {
    if (form.items.length && !window.confirm(t('تبديل المرسل والمستلم يغيّر اتجاه الشحنة وقد يغيّر بيانات الجمارك — متابعة؟', 'Switching From and To changes the direction of the shipment and may change its customs data — continue?'))) return;
    // the SHIPPEC invoice customer never moves; each saved contact keeps its own database role
    update((f) => ({ ...f, shipper: f.receiver, receiver: f.shipper }));
  };
  return (
    <div className="space-y-4" dir={dir}>
      <Section title={t('العميل', 'Customer')} icon={<UserCheck size={18} className="text-indigo-600" />}
        description={t('الفاتورة تُنشأ تلقائيًا لهذا العميل بعد إنشاء الشحنة لدى DHL.', 'The invoice is created automatically for this customer once DHL creates the shipment.')}>
        <ClientPicker w={w} error={gate.client ?? (errors.client ? translateIssue(errors.client, lang) : null)} t={t} />
      </Section>

      <section className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm min-w-0" aria-label={t('الأطراف', 'Parties')} data-testid="parties-surface">
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
          <div className="p-4 sm:p-6 min-w-0">
            <PartyPanel who="shipper" value={form.shipper} onChange={(p) => update((f) => ({ ...f, shipper: p }))} err={err} t={t} lang={lang} />
          </div>
          <div className="relative flex md:flex-col items-center justify-center px-4 py-1 md:px-2 md:py-6">
            <span aria-hidden className="absolute inset-x-4 top-1/2 h-px md:inset-x-auto md:left-1/2 md:top-6 md:bottom-6 md:h-auto md:w-px bg-slate-200 dark:bg-slate-700" />
            <button type="button" onClick={swap} data-testid="parties-switch"
              className="relative md:sticky md:top-24 md:self-start inline-flex items-center gap-1.5 px-4 py-2.5 rounded-2xl border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-800 text-sm font-extrabold text-indigo-700 dark:text-indigo-300 shadow-sm hover:bg-indigo-50 dark:hover:bg-indigo-900/30 min-h-[44px]">
              <ArrowLeftRight size={16} /> {t('التبديل', 'Switch')}
            </button>
          </div>
          <div className="p-4 sm:p-6 min-w-0">
            <PartyPanel who="receiver" value={form.receiver} onChange={(p) => update((f) => ({ ...f, receiver: p }))} err={err} t={t} lang={lang} />
          </div>
        </div>
      </section>
      <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-start gap-1.5">
        <Info size={13} className="shrink-0 mt-0.5" />
        {t('DHL تقبل الأحرف اللاتينية فقط في بيانات الشحنة.', 'DHL accepts Latin characters only in shipment data.')}
      </p>
    </div>
  );
}
