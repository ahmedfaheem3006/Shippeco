/**
 * «متابعة البوليصة» — (A) direct DHL AWB search, (B) SHIPPEC shipments.
 *
 * Layout rule (final): EXACTLY ONE shipment per row at every width — a
 * full-width table row on wide screens, one full-width card per row below
 * (single column, never a 2-column grid). Same compact order everywhere:
 * AWB · status · customer · invoice · origin → destination · created / pickup
 * · ETA · latest checkpoint · last sync · details.
 *
 * Dataset (server-side, paginated): the ACTIVE page = every undelivered
 * shipment whatever its age + deliveries of the last 12 months; older
 * deliveries are in «المسلّمة القديمة» (hidden, never deleted). Data from the
 * SHIPPEC Backend; DHL is asked only by the Backend.
 */
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle, ChevronLeft, ChevronRight, Filter, Loader2, PackageSearch, RotateCcw, Search, X,
} from 'lucide-react';
import { useAuthStore } from '../hooks/useAuthStore';
import { useRealtimeRefresh } from '../hooks/useRealtimeRefresh';
import {
  shipmentTrackingService, type LookupResult, type TrackingItem, type TrackingStatusFilter, type TrackingSummary, type TrackingSyncFilter, type TrackingView,
} from '../services/shipmentTracking.service';
import { Freshness } from '../components/ShipmentTracking/TrackingParts';
import { TrackingSyncStatusBar } from '../components/ShipmentTracking/TrackingSyncStatus';
import {
  TRACKING_EVENTS, TRACKING_PAGE_SIZE, canRefreshTracking, describeTrackingError, formatAwb, formatEstimated, formatLocal, formatRiyadh,
  formatYmd, isDhlAwb, needsAction, normalizeAwb, placeLabel, rowBadge, timeAgo,
} from '../components/ShipmentTracking/trackingUtils';
import { describeLookupError } from './ShipmentTrackingDetailsPage';
import { countryNameAr } from '../utils/countries';

const STATUS_OPTIONS: { id: TrackingStatusFilter; label: string }[] = [
  { id: 'all', label: 'كل الحالات' },
  { id: 'not_delivered', label: 'لم تُسلَّم بعد' },
  { id: 'delivered', label: 'تم التسليم' },
  { id: 'pre_transit', label: 'بانتظار الاستلام' },
  { id: 'in_transit', label: 'قيد النقل' },
  { id: 'customs', label: 'في الجمارك' },
  { id: 'out_for_delivery', label: 'خرجت للتسليم' },
  { id: 'problem', label: 'يوجد مشكلة' },
  { id: 'exception', label: 'استثناء' },
  { id: 'on_hold', label: 'معلّقة' },
  { id: 'not_synced', label: 'لم تتم المزامنة' },
];
const SYNC_FILTERS: { id: TrackingSyncFilter; label: string }[] = [
  { id: 'all', label: 'كل أوقات التحديث' },
  { id: 'recent_1h', label: 'محدّثة خلال ساعة' },
  { id: 'recent_24h', label: 'محدّثة خلال 24 ساعة' },
  { id: 'stale', label: 'بيانات قديمة' },
  { id: 'never', label: 'لم تتم المزامنة' },
  { id: 'failed', label: 'فشلت آخر محاولة' },
];
const VIEW_OPTIONS: { id: TrackingView; label: string }[] = [
  { id: 'active', label: 'الشحنات النشطة' },
  { id: 'archived', label: 'المسلّمة القديمة (أكثر من 12 شهرًا)' },
  { id: 'all', label: 'الكل (النشطة + المسلّمة القديمة)' },
];
type Filters = { view: TrackingView; status: TrackingStatusFilter; sync: TrackingSyncFilter; year: string; from: string; to: string; origin: string; destination: string; client_id: number | '' };
const EMPTY: Filters = { view: 'active', status: 'all', sync: 'all', year: '', from: '', to: '', origin: '', destination: '', client_id: '' };
const selectCls = 'w-full min-w-0 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200';
const YEARS = (() => { const y = new Date().getFullYear(); return [y, y - 1, y - 2, y - 3].map(String); })();

const dateOf = (t: TrackingItem) => t.booking_date ? formatYmd(t.booking_date) : t.discovered_at ? formatRiyadh(t.discovered_at).slice(0, 10) : '—';
const pickupOf = (t: TrackingItem) => { const p = formatLocal(t.pickup_local ?? null, t.pickup_gmt_offset ?? null); return p ? `${p.date}` : '—'; };
const deliveredOf = (t: TrackingItem) => { const p = formatLocal(t.delivered_local, t.delivered_gmt_offset); return p ? p.date : t.delivered_at ? formatRiyadh(t.delivered_at).slice(0, 10) : '—'; };

function Checkpoint({ t }: { t: TrackingItem }) {
  const last = formatLocal(t.last_event_local, t.last_event_gmt_offset);
  if (!t.current_description && !last) return <span className="text-slate-400">لا توجد نقاط تتبع بعد</span>;
  return (
    <span className="min-w-0 block">
      <span className="block font-bold text-slate-800 dark:text-slate-100 truncate" dir="ltr" title={t.current_description ?? ''}>{t.current_description ?? '—'}</span>
      <span className="block text-[11px] text-slate-500 truncate">{t.current_location ? <span dir="ltr">{t.current_location}</span> : null}{last ? ` · ${last.date} ${last.time}` : ''}</span>
    </span>
  );
}

const routeOf = (t: TrackingItem) =>
  `${placeLabel(t.origin, t.origin_city, t.origin_country_code)} ← ${t.destination || t.destination_country_code ? placeLabel(t.destination, t.destination_city, t.destination_country_code) : t.invoice_destination || '—'}`;
const isDelivered = (t: TrackingItem) => t.normalized_status === 'DELIVERED';

function AwbLink({ t, size }: { t: TrackingItem; size: 'sm' | 'lg' }) {
  return (
    <Link to={`/shipment-tracking/${t.awb}`} data-testid="tracking-awb" dir="ltr"
      className={`font-mono font-extrabold text-indigo-700 dark:text-indigo-300 hover:underline whitespace-nowrap ${size === 'lg' ? 'text-lg' : 'text-sm'}`}>{formatAwb(t.awb)}</Link>
  );
}
function Customer({ t, onCustomer }: { t: TrackingItem; onCustomer: (t: TrackingItem) => void }) {
  return t.client_id
    ? <button type="button" onClick={() => onCustomer(t)} className="block max-w-full text-start text-xs font-bold text-slate-800 dark:text-slate-100 truncate hover:text-indigo-600 hover:underline" title="عرض شحنات هذا العميل فقط">{t.customer_name || '—'}</button>
    : <span className="block text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{t.customer_name || t.receiver_name || '—'}</span>;
}
function Invoice({ t }: { t: TrackingItem }) {
  return t.invoice_id
    ? <Link to={`/invoices?invoice=${t.invoice_id}`} className="text-[11px] font-bold text-indigo-600 hover:underline">{t.invoice_number}</Link>
    : <span className="text-[11px] text-slate-400">بدون فاتورة</span>;
}

/** Table cells: fixed layout (column widths in the header), content truncated — never clipped off the row. */
const TD = 'py-3 px-2 min-w-0 overflow-hidden';
const TH = 'py-2.5 px-2 text-start';

/** Wide screens: ONE full-width table row per shipment. */
function Row({ t, onCustomer }: { t: TrackingItem; onCustomer: (t: TrackingItem) => void }) {
  const badge = rowBadge(t);
  const action = needsAction(t);
  return (
    <tr data-tracking-awb={t.awb} className={`border-b border-slate-100 dark:border-slate-700/60 align-top ${action ? 'bg-red-50/40 dark:bg-red-900/10' : 'hover:bg-slate-50/60 dark:hover:bg-slate-900/20'}`}>
      <td className={TD}><AwbLink t={t} size="sm" /></td>
      <td className={TD}><span className={`inline-block max-w-full truncate px-2 py-1 rounded-xl text-[11px] font-black border whitespace-nowrap ${badge.cls}`} title={badge.label}>{badge.label}</span></td>
      <td className={TD}><Customer t={t} onCustomer={onCustomer} /><Invoice t={t} /></td>
      <td className={`${TD} text-[11px] text-slate-600 dark:text-slate-300`}><span className="block truncate" dir="auto" title={routeOf(t)}>{routeOf(t)}</span></td>
      <td className={`${TD} text-xs tabular-nums`}><span className="block truncate">{dateOf(t)}</span><div className="text-[11px] text-slate-500 truncate">استلام: {pickupOf(t)}</div></td>
      <td className={`${TD} text-xs tabular-nums`}>{isDelivered(t) ? <span className="font-bold text-green-700 dark:text-green-400">{deliveredOf(t)}</span> : formatEstimated(t.estimated_delivery)}<div className="text-[11px] text-slate-500">{isDelivered(t) ? 'تم التسليم' : 'متوقع'}</div></td>
      <td className={`${TD} text-xs`}><Checkpoint t={t} /></td>
      <td className={TD}><Freshness t={t} /></td>
      <td className={`${TD} text-end`}><Link to={`/shipment-tracking/${t.awb}`} className="inline-flex px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-indigo-600 hover:border-indigo-300 whitespace-nowrap">تفاصيل</Link></td>
    </tr>
  );
}

/** Below the table breakpoint: ONE full-width card per row (the list is a single column). */
function Card({ t, onCustomer }: { t: TrackingItem; onCustomer: (t: TrackingItem) => void }) {
  const badge = rowBadge(t);
  const field = 'min-w-0';
  const label = 'text-slate-400 font-bold';
  return (
    <article data-tracking-awb={t.awb} data-testid="tracking-card"
      className={`w-full min-w-0 bg-white dark:bg-slate-800 rounded-2xl border p-4 space-y-3 ${needsAction(t) ? 'border-red-200 dark:border-red-900/50' : 'border-slate-200 dark:border-slate-700'}`}>
      <div className="flex items-start justify-between gap-2">
        <AwbLink t={t} size="lg" />
        <span className={`px-2.5 py-1 rounded-xl text-[11px] font-black border shrink-0 ${badge.cls}`}>{badge.label}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-3 gap-y-2 text-[11px]">
        <div className={field}><div className={label}>العميل</div><Customer t={t} onCustomer={onCustomer} /></div>
        <div className={field}><div className={label}>الفاتورة</div><Invoice t={t} /></div>
        <div className={`${field} col-span-2 sm:col-span-1 lg:col-span-1`}><div className={label}>المسار</div><div className="font-bold truncate" dir="auto" title={routeOf(t)}>{routeOf(t)}</div></div>
        <div className={field}><div className={label}>الإنشاء / استلام DHL</div><div className="font-bold tabular-nums">{dateOf(t)}</div><div className="text-slate-500 tabular-nums">{pickupOf(t)}</div></div>
        <div className={field}><div className={label}>{isDelivered(t) ? 'التسليم الفعلي' : 'التسليم المتوقع'}</div><div className="font-bold tabular-nums">{isDelivered(t) ? deliveredOf(t) : formatEstimated(t.estimated_delivery)}</div></div>
        <div className={field}><div className={label}>آخر تحديث</div><Freshness t={t} /></div>
      </div>
      <div className="rounded-xl bg-slate-50 dark:bg-slate-900/40 p-2.5 text-xs"><Checkpoint t={t} /></div>
      <Link to={`/shipment-tracking/${t.awb}`} className="block text-center px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-indigo-600 min-h-[44px]">تفاصيل الشحنة</Link>
    </article>
  );
}

function AwbSearch({ canLookup, lookupEnabled }: { canLookup: boolean; lookupEnabled: boolean | undefined }) {
  const navigate = useNavigate();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<LookupResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const awb = normalizeAwb(value);
  const valid = isDhlAwb(awb);
  const submit = async (ev?: React.FormEvent) => {
    ev?.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    setRes(null);
    try {
      const r = await shipmentTrackingService.lookup(awb);
      if (r.result === 'local' || r.result === 'remote') { navigate(`/shipment-tracking/${r.awb}`); return; }
      setRes(r);
    } catch (err) {
      setError(describeLookupError(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm p-4 sm:p-6" aria-labelledby="awb-search-h">
      <h2 id="awb-search-h" className="text-base font-extrabold text-slate-900 dark:text-white">ابحث برقم البوليصة AWB</h2>
      <p className="text-xs text-slate-500 mt-1">أي بوليصة DHL — إن لم تكن مسجلة في SHIPPEC{canLookup ? ' يُسأل DHL عنها وتُضاف للمتابعة' : ' تظهر فقط إن كانت مسجلة'}.</p>
      <form onSubmit={(e) => void submit(e)} className="mt-3 flex gap-2">
        <label className="relative flex-1 min-w-0">
          <span className="sr-only">رقم البوليصة</span>
          <Search size={20} className="absolute start-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input value={value} onChange={(e) => { setValue(e.target.value); setRes(null); setError(null); }} inputMode="numeric" dir="ltr" placeholder="1234567890"
            className="w-full ps-12 pe-4 py-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 text-lg font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-start" />
        </label>
        <button type="submit" disabled={!valid || busy} className="px-5 sm:px-6 rounded-2xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-sm inline-flex items-center gap-1.5 min-h-[52px]">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} بحث
        </button>
      </form>
      {value && !valid && <p className="mt-2 text-[11px] text-slate-500">رقم بوليصة DHL من 10 أرقام.</p>}
      {busy && <p className="mt-2 text-xs text-slate-500" role="status">جاري البحث{canLookup ? ' (قد يُسأل DHL)' : ''}…</p>}
      {res?.result === 'not_found' && <p className="mt-3 rounded-2xl bg-slate-50 dark:bg-slate-900/40 p-3 text-sm font-bold text-slate-700 dark:text-slate-200" role="status">لا توجد بيانات لدى DHL لهذه البوليصة.</p>}
      {res?.result === 'remote_lookup_required' && <p className="mt-3 rounded-2xl bg-amber-50 dark:bg-amber-900/15 p-3 text-sm font-bold text-amber-800 dark:text-amber-300" role="status">هذه البوليصة غير مسجلة في SHIPPEC، والبحث لدى DHL غير متاح لدورك.</p>}
      {error && <p className="mt-3 rounded-2xl bg-red-50 dark:bg-red-900/15 p-3 text-sm font-bold text-red-700 dark:text-red-300" role="alert">{error}</p>}
      {lookupEnabled === false && canLookup && <p className="mt-2 text-[11px] text-slate-400">البحث المباشر لدى DHL غير مفعّل على الخادم حاليًا — تُعرض البوالص المسجلة فقط.</p>}
    </section>
  );
}

export const ShipmentTrackingPage: React.FC = () => {
  const role = useAuthStore((s) => s.user?.role);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const deepLinkAwb = normalizeAwb(searchParams.get('awb') ?? '');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<TrackingItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [summary, setSummary] = useState<TrackingSummary | null>(null);
  const [phase, setPhase] = useState<'initial' | 'switching' | 'ready' | 'error'>('initial');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [clientLabel, setClientLabel] = useState<string | null>(null);
  const [syncKey, setSyncKey] = useState(0);

  // Old notification links (?awb=) open the details page.
  useEffect(() => { if (isDhlAwb(deepLinkAwb)) navigate(`/shipment-tracking/${deepLinkAwb}`, { replace: true }); }, [deepLinkAwb, navigate]);

  const paramsRef = useRef({ q, filters, page });
  useLayoutEffect(() => { paramsRef.current = { q, filters, page }; }, [q, filters, page]);
  const seq = useRef(0);

  useEffect(() => {
    const t = window.setTimeout(() => {
      const next = search.trim();
      if (next === paramsRef.current.q) return;
      setPhase((ph) => (ph === 'initial' || ph === 'error' ? 'initial' : 'switching'));
      setQ(next);
      setPage(1);
    }, 350);
    return () => window.clearTimeout(t);
  }, [search]);

  const load = useCallback(async (mode: 'replace' | 'background') => {
    const n = ++seq.current;
    const p = paramsRef.current;
    const { year, ...rest } = p.filters;
    const from = rest.from || (year ? `${year}-01-01` : '');
    const to = rest.to || (year ? `${year}-12-31` : '');
    try {
      const res = await shipmentTrackingService.list({ q: p.q, ...rest, from, to, page: p.page, limit: TRACKING_PAGE_SIZE });
      if (n !== seq.current) return;
      setItems(Array.isArray(res?.items) ? res.items : []);
      setTotal(res?.pagination?.total ?? 0);
      setTotalPages(res?.pagination?.totalPages ?? 1);
      setLoadError(null);
      setPhase('ready');
    } catch (err) {
      if (n !== seq.current) return;
      setLoadError(describeTrackingError(err, 'تعذر تحميل الشحنات'));
      if (mode === 'replace') { setItems([]); setPhase('error'); }
    }
  }, []);
  const loadSummary = useCallback(() => shipmentTrackingService.summary().then(setSummary, () => undefined), []);

  useEffect(() => { void load('replace'); }, [q, filters, page, load]);
  useEffect(() => { void loadSummary(); }, [loadSummary]);
  useRealtimeRefresh(TRACKING_EVENTS, () => { void load('background'); void loadSummary(); setSyncKey((k) => k + 1); }, 600);

  const switching = () => setPhase((ph) => (ph === 'initial' || ph === 'error' ? 'initial' : 'switching'));
  const setFilter = <K extends keyof Filters>(k: K, v: Filters[K]) => { switching(); setFilters((f) => ({ ...f, [k]: v })); setPage(1); };
  const clearAll = () => { switching(); setFilters(EMPTY); setSearch(''); setQ(''); setPage(1); };
  const activeFilters = (Object.keys(EMPTY) as (keyof Filters)[]).filter((k) => filters[k] !== EMPTY[k]).length;
  const counts = summary?.counts;
  const integration = summary?.integration;
  const onCustomer = (t: TrackingItem) => { setClientLabel(t.customer_name); setFilter('client_id', t.client_id ?? ''); };
  // Counters: the ACTIVE dataset per status, and the archive apart («المسلّمة القديمة» switches the view).
  const chips: { id: string; label: string; n?: number; view: TrackingView; status: TrackingStatusFilter }[] = [
    { id: 'active', label: 'النشطة', n: counts?.active ?? counts?.total, view: 'active', status: 'all' },
    { id: 'in_transit', label: 'قيد النقل', n: counts?.in_transit, view: 'active', status: 'in_transit' },
    { id: 'out_for_delivery', label: 'خرجت للتسليم', n: counts?.out_for_delivery, view: 'active', status: 'out_for_delivery' },
    { id: 'delivered', label: 'سُلّمت (آخر 12 شهرًا)', n: counts?.delivered_recent ?? counts?.delivered, view: 'active', status: 'delivered' },
    { id: 'problem', label: 'يوجد مشكلة', n: counts?.problem, view: 'active', status: 'problem' },
    { id: 'not_synced', label: 'بانتظار المزامنة', n: counts?.waiting_sync ?? counts?.not_synced, view: 'active', status: 'not_synced' },
    { id: 'archived', label: 'المسلّمة القديمة', n: counts?.archived_delivered, view: 'archived', status: 'all' },
  ];
  const chipOn = (c: (typeof chips)[number]) => filters.view === c.view && filters.status === c.status;
  const pickChip = (c: (typeof chips)[number]) => { switching(); setFilters((f) => ({ ...f, view: c.view, status: c.status })); setPage(1); };

  return (
    <div className="space-y-5 min-w-0" dir="rtl">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2"><PackageSearch className="text-indigo-600" /> متابعة البوليصة</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">كل شحنات DHL Express في SHIPPEC — الحالة من DHL مباشرة.</p>
        </div>
        {counts?.last_synced_at && <span className="text-xs text-slate-500">آخر مزامنة مع DHL: <span className="font-bold">{timeAgo(counts.last_synced_at)}</span></span>}
      </header>

      {integration && !integration.usable && (
        <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-900/15 px-4 py-3 text-xs font-semibold text-amber-800 dark:text-amber-300" role="status">
          <AlertCircle size={16} className="shrink-0 mt-0.5" /> ربط DHL غير مفعّل على الخادم بعد — تظهر الشحنات من SHIPPEC، وتُحدَّث حالاتها بعد التفعيل.
        </div>
      )}
      {integration?.usable && integration.env === 'test' && (
        <div className="rounded-2xl border border-sky-200 bg-sky-50 dark:border-sky-900/40 dark:bg-sky-900/15 px-4 py-2 text-xs font-semibold text-sky-800 dark:text-sky-300" role="status">ربط DHL يعمل على بيئة الاختبار (Test).</div>
      )}

      {role === 'admin' && <TrackingSyncStatusBar refreshKey={syncKey} />}

      <AwbSearch canLookup={canRefreshTracking(role)} lookupEnabled={integration?.features?.trackingLookup} />

      <section className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm p-3 sm:p-4 space-y-3" aria-label="شحنات SHIPPEC">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-extrabold text-slate-900 dark:text-white">شحنات SHIPPEC {phase === 'ready' && <span className="text-xs font-bold text-slate-400 tabular-nums">({total})</span>}</h2>
        </div>
        <div className="flex gap-2">
          <label className="relative flex-1 min-w-0">
            <span className="sr-only">بحث في القائمة</span>
            <Search size={16} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="رقم البوليصة، رقم الفاتورة، اسم العميل أو الجوال"
              className="w-full ps-9 pe-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </label>
          <button type="button" onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters} aria-label={activeFilters ? `الفلاتر (${activeFilters} مفعّلة)` : 'الفلاتر'}
            className={`flex items-center gap-1.5 px-3 sm:px-4 rounded-xl border text-xs font-bold shrink-0 min-h-[44px] ${showFilters || activeFilters ? 'border-indigo-300 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`}>
            <Filter size={16} /> <span className="hidden sm:inline">الفلاتر</span>{activeFilters ? <span className="tabular-nums">({activeFilters})</span> : null}
          </button>
        </div>
        <div role="radiogroup" aria-label="حالة الشحنة" className="flex flex-wrap gap-1.5" data-testid="tracking-counters">
          {chips.map((c) => (
            <button key={c.id} type="button" role="radio" aria-checked={chipOn(c)} onClick={() => pickChip(c)} data-chip={c.id}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg whitespace-nowrap ${chipOn(c) ? 'bg-indigo-600 text-white' : c.view === 'archived' ? 'bg-slate-100 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 hover:bg-slate-200' : 'bg-slate-50 dark:bg-slate-900/40 text-slate-600 dark:text-slate-300 hover:bg-slate-100'}`}>
              {c.label}{c.n != null ? <span className="tabular-nums opacity-80"> · {c.n}</span> : null}
            </button>
          ))}
        </div>
        {filters.view === 'archived' && (
          <p className="text-[11px] font-semibold text-slate-500" role="status">شحنات سُلّمت قبل أكثر من 12 شهرًا — محفوظة كاملة (الأحداث والفاتورة والسجل)، ولا تُستهلك عليها طلبات DHL.</p>
        )}
        {showFilters && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-9 gap-2 pt-1">
            <label className="text-[10px] font-bold text-slate-400 space-y-1 min-w-0"><span>مجموعة الشحنات</span>
              <select value={filters.view} onChange={(e) => setFilter('view', e.target.value as TrackingView)} className={selectCls}>{VIEW_OPTIONS.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}</select></label>
            <label className="text-[10px] font-bold text-slate-400 space-y-1 min-w-0"><span>السنة</span>
              <select value={filters.year} onChange={(e) => setFilter('year', e.target.value)} className={selectCls}><option value="">كل السنوات</option>{YEARS.map((y) => <option key={y} value={y}>{y}</option>)}</select></label>
            <label className="text-[10px] font-bold text-slate-400 space-y-1 min-w-0"><span>من تاريخ</span><input type="date" value={filters.from} onChange={(e) => setFilter('from', e.target.value)} className={selectCls} /></label>
            <label className="text-[10px] font-bold text-slate-400 space-y-1 min-w-0"><span>إلى تاريخ</span><input type="date" value={filters.to} onChange={(e) => setFilter('to', e.target.value)} className={selectCls} /></label>
            <label className="text-[10px] font-bold text-slate-400 space-y-1 min-w-0"><span>الحالة الحالية</span>
              <select value={filters.status} onChange={(e) => setFilter('status', e.target.value as TrackingStatusFilter)} className={selectCls}>{STATUS_OPTIONS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
            <label className="text-[10px] font-bold text-slate-400 space-y-1 min-w-0"><span>حداثة بيانات DHL</span>
              <select value={filters.sync} onChange={(e) => setFilter('sync', e.target.value as TrackingSyncFilter)} className={selectCls}>{SYNC_FILTERS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
            <label className="text-[10px] font-bold text-slate-400 space-y-1 min-w-0"><span>بلد المنشأ</span>
              <select value={filters.origin} onChange={(e) => setFilter('origin', e.target.value)} className={selectCls}><option value="">كل الدول</option>{summary?.countries.origin.map((c) => <option key={c.code} value={c.code}>{countryNameAr(c.code)} ({c.count})</option>)}</select></label>
            <label className="text-[10px] font-bold text-slate-400 space-y-1 min-w-0"><span>بلد الوجهة</span>
              <select value={filters.destination} onChange={(e) => setFilter('destination', e.target.value)} className={selectCls}><option value="">كل الدول</option>{summary?.countries.destination.map((c) => <option key={c.code} value={c.code}>{countryNameAr(c.code)} ({c.count})</option>)}</select></label>
            <div className="text-[10px] font-bold text-slate-400 space-y-1 min-w-0"><span>العميل / الفاتورة</span><p className="text-[11px] font-semibold text-slate-500 pt-2">ابحث بالاسم أو رقم الفاتورة في الحقل أعلاه، أو اضغط اسم عميل في القائمة.</p></div>
          </div>
        )}
        {filters.client_id !== '' && (
          <div className="flex items-center gap-2 text-xs font-bold text-indigo-700 dark:text-indigo-300">
            <span className="px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 flex items-center gap-1.5 min-w-0">
              <span className="truncate">العميل: {clientLabel || `#${filters.client_id}`}</span>
              <button type="button" onClick={() => setFilter('client_id', '')} aria-label="إزالة فلتر العميل"><X size={13} /></button>
            </span>
          </div>
        )}
        {(activeFilters > 0 || q) && <button type="button" onClick={clearAll} className="flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-red-600"><X size={14} /> مسح البحث والفلاتر</button>}
      </section>

      {phase === 'ready' && loadError && (
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-red-600" role="status"><AlertCircle size={12} /> تعذر تحديث القائمة: {loadError}
          <button type="button" onClick={() => void load('background')} className="font-bold text-indigo-600 hover:underline">إعادة المحاولة</button></div>
      )}

      {phase === 'initial' ? (
        <div className="space-y-2" role="status" aria-label="جاري تحميل الشحنات">{[0, 1, 2, 3].map((i) => <div key={i} className="h-16 rounded-2xl bg-slate-100 dark:bg-slate-700/60 animate-pulse" />)}</div>
      ) : phase === 'error' ? (
        <div className="bg-white dark:bg-slate-800 rounded-3xl border border-red-100 p-10 flex flex-col items-center text-center" role="alert">
          <AlertCircle size={40} className="text-red-500 mb-3" />
          <h3 className="text-lg font-bold">تعذر تحميل الشحنات</h3><p className="text-slate-500 mt-1 text-sm">{loadError}</p>
          <button type="button" onClick={() => { setPhase('initial'); void load('replace'); }} className="mt-4 flex items-center gap-1.5 px-5 py-2.5 rounded-2xl bg-indigo-600 text-white font-bold text-sm"><RotateCcw size={14} /> إعادة المحاولة</button>
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-700 p-12 flex flex-col items-center text-center">
          <PackageSearch size={44} className="text-slate-300 mb-3" />
          <h3 className="text-lg font-bold">{filters.view === 'archived' && !q ? 'لا توجد شحنات مسلّمة قبل أكثر من 12 شهرًا' : q || activeFilters ? 'لا توجد نتائج مطابقة للبحث أو الفلتر' : 'لا توجد شحنات DHL للمتابعة حاليًا'}</h3>
          {!q && !activeFilters && <p className="text-slate-500 mt-2 text-sm">تظهر هنا تلقائيًا كل شحنة أُنشئت من SHIPPEC وكل فاتورة DHL تحمل رقم بوليصة.</p>}
          {filters.view === 'active' && (q || activeFilters > 0) && (counts?.archived_delivered ?? 0) > 0 && (
            <button type="button" onClick={() => setFilter('view', 'all')} className="mt-3 text-xs font-bold text-indigo-600 hover:underline">ابحث أيضًا في «المسلّمة القديمة»</button>
          )}
        </div>
      ) : (
        <>
          <div data-testid="tracking-table" className={`hidden xl:block bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-x-auto transition-opacity ${phase === 'switching' ? 'opacity-60' : ''}`} aria-busy={phase === 'switching'}>
            <table className="w-full table-fixed text-start">
              <thead className="bg-slate-50 dark:bg-slate-900/40 text-[11px] font-bold text-slate-500">
                <tr>
                  <th className={`${TH} w-[7.5rem]`}>البوليصة</th>
                  <th className={`${TH} w-[8rem]`}>الحالة</th>
                  <th className={`${TH} w-[12%]`}>العميل / الفاتورة</th>
                  <th className={`${TH} w-[12%]`}>المنشأ ← الوجهة</th>
                  <th className={`${TH} w-[7.5rem]`}>الإنشاء / استلام DHL</th>
                  <th className={`${TH} w-[6rem]`}>التسليم</th>
                  <th className={TH}>آخر نقطة تتبع</th>
                  <th className={`${TH} w-[6.5rem]`}>آخر تحديث</th>
                  <th className={`${TH} w-[5rem]`}><span className="sr-only">تفاصيل</span></th>
                </tr>
              </thead>
              <tbody>{items.map((t) => <Row key={t.id} t={t} onCustomer={onCustomer} />)}</tbody>
            </table>
          </div>
          <div data-testid="tracking-card-list" className={`xl:hidden grid grid-cols-1 gap-3 transition-opacity ${phase === 'switching' ? 'opacity-60' : ''}`}>
            {items.map((t) => <Card key={t.id} t={t} onCustomer={onCustomer} />)}
          </div>
          {totalPages > 1 && (
            <nav className="flex items-center justify-center gap-3 text-xs font-bold text-slate-500" aria-label="صفحات الشحنات">
              <button type="button" disabled={page <= 1} onClick={() => { switching(); setPage(page - 1); }} aria-label="الصفحة السابقة" className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 disabled:opacity-40"><ChevronRight size={16} /></button>
              <span className="tabular-nums">صفحة {page} من {totalPages} · {total} شحنة</span>
              <button type="button" disabled={page >= totalPages} onClick={() => { switching(); setPage(page + 1); }} aria-label="الصفحة التالية" className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 disabled:opacity-40"><ChevronLeft size={16} /></button>
            </nav>
          )}
        </>
      )}
    </div>
  );
};
