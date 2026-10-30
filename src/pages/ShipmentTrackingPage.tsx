import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertCircle, AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Clock, ExternalLink, Filter, MapPin, PackageSearch, RotateCcw,
  Search, Truck, X, Package,
} from 'lucide-react';
import { useAuthStore } from '../hooks/useAuthStore';
import { useRealtimeRefresh } from '../hooks/useRealtimeRefresh';
import {
  shipmentTrackingService,
  type TrackingItem,
  type TrackingStatusFilter,
  type TrackingSummary,
  type TrackingSyncFilter,
} from '../services/shipmentTracking.service';
import { TrackingDetailsDialog } from '../components/ShipmentTracking/TrackingDetailsDialog';
import {
  STATUS_FILTERS, TRACKING_EVENTS, TRACKING_PAGE_SIZE, canRefreshTracking, describeTrackingError, formatAwb, formatEstimated,
  formatLocal, formatYmd, isDhlAwb, needsAction, normalizeAwb, placeLabel, statusBadge, syncProblemText, timeAgo,
} from '../components/ShipmentTracking/trackingUtils';
import { countryNameAr } from '../utils/countries';

const SYNC_FILTERS: { id: TrackingSyncFilter; label: string }[] = [
  { id: 'all', label: 'كل أوقات المزامنة' },
  { id: 'recent_1h', label: 'خلال آخر ساعة' },
  { id: 'recent_24h', label: 'خلال آخر 24 ساعة' },
  { id: 'stale', label: 'بيانات قديمة (متأخرة)' },
  { id: 'never', label: 'لم تتم المزامنة' },
  { id: 'failed', label: 'فشلت آخر محاولة' },
];

type Filters = {
  status: TrackingStatusFilter;
  sync: TrackingSyncFilter;
  from: string;
  to: string;
  origin: string;
  destination: string;
  client_id: number | '';
};
const EMPTY_FILTERS: Filters = { status: 'all', sync: 'all', from: '', to: '', origin: '', destination: '', client_id: '' };

const CARDS: { key: 'total' | 'in_transit' | 'out_for_delivery' | 'problem' | 'delivered'; label: string; status: TrackingStatusFilter; cls: string; icon: React.ReactNode }[] = [
  { key: 'total', label: 'إجمالي الشحنات', status: 'all', cls: 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400', icon: <Package size={18} /> },
  { key: 'in_transit', label: 'قيد النقل', status: 'in_transit', cls: 'bg-sky-50 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400', icon: <Truck size={18} /> },
  { key: 'out_for_delivery', label: 'خرجت للتسليم', status: 'out_for_delivery', cls: 'bg-teal-50 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400', icon: <MapPin size={18} /> },
  { key: 'problem', label: 'يوجد مشكلة', status: 'problem', cls: 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400', icon: <AlertTriangle size={18} /> },
  { key: 'delivered', label: 'تم التسليم', status: 'delivered', cls: 'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400', icon: <CheckCircle2 size={18} /> },
];

const selectCls = 'w-full min-w-0 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200';

function ShipmentCard({ t, onOpen, onCustomer }: { t: TrackingItem; onOpen: (awb: string) => void; onCustomer: (t: TrackingItem) => void }) {
  const badge = statusBadge(t.normalized_status);
  const last = formatLocal(t.last_event_local, t.last_event_gmt_offset);
  const problem = syncProblemText(t);
  const action = needsAction(t);
  return (
    <article
      data-tracking-awb={t.awb}
      data-scroll-anchor
      className={`bg-white dark:bg-slate-800 rounded-3xl border shadow-sm overflow-hidden flex flex-col min-w-0 ${action ? 'border-red-200 dark:border-red-900/50' : 'border-slate-100 dark:border-slate-700'}`}
    >
      <div className="p-5 flex-1 space-y-3 min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <span className={`px-3 py-1.5 rounded-xl text-[11px] font-black border ${badge.cls}`}>{badge.label}</span>
          <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
            <Clock size={12} /> آخر تحديث: {t.last_synced_at ? timeAgo(t.last_synced_at) : 'لم تتم المزامنة'}
          </span>
        </div>

        <div className="min-w-0">
          <div className="text-[10px] font-bold text-slate-400">رقم البوليصة AWB</div>
          <button
            type="button"
            onClick={() => onOpen(t.awb)}
            aria-haspopup="dialog"
            className="font-mono text-xl font-extrabold text-indigo-700 dark:text-indigo-300 hover:underline break-all text-start"
            dir="ltr"
          >
            {formatAwb(t.awb)}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[11px] min-w-0">
          <div className="min-w-0">
            <div className="text-slate-400 font-bold">الفاتورة</div>
            {t.invoice_id ? (
              <Link to={`/invoices?invoice=${t.invoice_id}`} className="font-extrabold text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1 break-all">
                {t.invoice_number} <ExternalLink size={11} className="shrink-0" />
              </Link>
            ) : <span>—</span>}
          </div>
          <div className="min-w-0">
            <div className="text-slate-400 font-bold">العميل</div>
            {t.client_id ? (
              <button type="button" onClick={() => onCustomer(t)} title="عرض شحنات هذا العميل فقط" className="block max-w-full font-bold text-slate-700 dark:text-slate-200 truncate hover:text-indigo-600 hover:underline text-start">
                {t.customer_name || '—'}
              </button>
            ) : (
              <div className="font-bold text-slate-700 dark:text-slate-200 truncate">{t.customer_name || '—'}</div>
            )}
          </div>
          <div className="min-w-0">
            <div className="text-slate-400 font-bold">من</div>
            <div className="font-bold text-slate-700 dark:text-slate-200 truncate" dir="auto">{placeLabel(t.origin, t.origin_city, t.origin_country_code)}</div>
          </div>
          <div className="min-w-0">
            <div className="text-slate-400 font-bold">إلى</div>
            <div className="font-bold text-slate-700 dark:text-slate-200 truncate" dir="auto">
              {t.destination || t.destination_country_code ? placeLabel(t.destination, t.destination_city, t.destination_country_code) : t.invoice_destination || '—'}
            </div>
          </div>
          <div className="min-w-0">
            <div className="text-slate-400 font-bold">تاريخ الحجز</div>
            <div className="font-bold text-slate-700 dark:text-slate-200 tabular-nums">{formatYmd(t.booking_date)}</div>
          </div>
          <div className="min-w-0">
            <div className="text-slate-400 font-bold">التسليم المتوقع</div>
            <div className="font-bold text-slate-700 dark:text-slate-200 tabular-nums">{t.normalized_status === 'DELIVERED' ? '—' : formatEstimated(t.estimated_delivery)}</div>
          </div>
        </div>

        {t.last_synced_at ? (
          <div className={`rounded-2xl p-3 text-[11px] min-w-0 ${action ? 'bg-red-50 dark:bg-red-900/15' : 'bg-slate-50 dark:bg-slate-900/40'}`}>
            {action && <div className="font-extrabold text-red-700 dark:text-red-300 mb-1">⚠ يوجد إجراء مطلوب</div>}
            <div className="font-bold text-slate-800 dark:text-slate-100 break-words" dir="ltr">{t.current_description || '—'}</div>
            <div className="mt-1 flex flex-wrap gap-x-3 text-slate-500 dark:text-slate-400">
              {t.current_location && <span className="flex items-center gap-1"><MapPin size={11} /><span dir="ltr">{t.current_location}</span></span>}
              {last && <span className="tabular-nums">{last.date} · {last.time}</span>}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl p-3 text-[11px] font-bold text-slate-500 bg-slate-50 dark:bg-slate-900/40">لم تتم مزامنة بيانات DHL بعد</div>
        )}
        {problem && <div className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">{problem}</div>}
      </div>
      <button
        type="button"
        onClick={() => onOpen(t.awb)}
        className="px-5 py-3 text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-slate-50/60 dark:bg-slate-900/30 border-t border-slate-100 dark:border-slate-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-start"
      >
        عرض رحلة الشحنة كاملة ←
      </button>
    </article>
  );
}

export const ShipmentTrackingPage: React.FC = () => {
  const role = useAuthStore((s) => s.user?.role);
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkAwb = normalizeAwb(searchParams.get('awb') ?? '');

  const [search, setSearch] = useState(deepLinkAwb);
  const [q, setQ] = useState(deepLinkAwb);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<TrackingItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [summary, setSummary] = useState<TrackingSummary | null>(null);
  const [phase, setPhase] = useState<'initial' | 'switching' | 'ready' | 'error'>('initial');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openAwb, setOpenAwb] = useState<string | null>(isDhlAwb(deepLinkAwb) ? deepLinkAwb : null);
  const [clientLabel, setClientLabel] = useState<string | null>(null);

  const paramsRef = useRef({ q, filters, page });
  useLayoutEffect(() => {
    paramsRef.current = { q, filters, page };
  }, [q, filters, page]);
  const seq = useRef(0);

  // Notification deep link: /shipment-tracking?awb=<AWB> opens that shipment
  // (also when a notification is clicked while the page is already open).
  const [seenDeepLink, setSeenDeepLink] = useState(deepLinkAwb);
  if (deepLinkAwb !== seenDeepLink) {
    setSeenDeepLink(deepLinkAwb);
    if (isDhlAwb(deepLinkAwb)) {
      setOpenAwb(deepLinkAwb);
      setSearch(deepLinkAwb);
      setQ(deepLinkAwb);
      setPage(1);
    }
  }

  // Server-side search, debounced (DHL is never called while typing).
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

  const loadSummary = useCallback(async () => {
    try {
      const s = await shipmentTrackingService.summary();
      setSummary(s);
    } catch {
      /* the cards keep their last numbers */
    }
  }, []);

  const load = useCallback(async (mode: 'replace' | 'background') => {
    const n = ++seq.current;
    const p = paramsRef.current;
    try {
      const res = await shipmentTrackingService.list({ q: p.q, ...p.filters, page: p.page, limit: TRACKING_PAGE_SIZE });
      if (n !== seq.current) return;
      setItems(Array.isArray(res?.items) ? res.items : []);
      setTotal(res?.pagination?.total ?? 0);
      setTotalPages(res?.pagination?.totalPages ?? 1);
      setLoadError(null);
      setPhase('ready');
    } catch (err) {
      if (n !== seq.current) return;
      setLoadError(describeTrackingError(err, 'تعذر تحميل الشحنات'));
      if (mode === 'replace') {
        setItems([]);
        setPhase('error');
      }
    }
  }, []);

  useEffect(() => { void load('replace'); }, [q, filters, page, load]);
  useEffect(() => {
    let alive = true;
    shipmentTrackingService.summary().then((s) => { if (alive) setSummary(s); }, () => undefined);
    return () => { alive = false; };
  }, []);

  // Background sync / another user's refresh changed something → re-read.
  useRealtimeRefresh(TRACKING_EVENTS, () => {
    void load('background');
    void loadSummary();
  }, 600);

  const switching = () => setPhase((ph) => (ph === 'initial' || ph === 'error' ? 'initial' : 'switching'));
  const setFilter = <K extends keyof Filters>(k: K, v: Filters[K]) => {
    switching();
    setFilters((f) => ({ ...f, [k]: v }));
    setPage(1);
  };
  const clearAll = () => {
    switching();
    setFilters(EMPTY_FILTERS);
    setSearch('');
    setQ('');
    setPage(1);
  };
  const closeDetails = () => {
    setOpenAwb(null);
    if (searchParams.has('awb')) {
      const next = new URLSearchParams(searchParams);
      next.delete('awb');
      setSearchParams(next, { replace: true });
    }
  };

  const counts = summary?.counts;
  const integration = summary?.integration;
  const activeFilters = (Object.keys(EMPTY_FILTERS) as (keyof Filters)[]).filter((k) => filters[k] !== EMPTY_FILTERS[k]).length;
  const nothingAtAll = phase === 'ready' && items.length === 0 && !q && activeFilters === 0;

  return (
    <div className="space-y-5 sm:space-y-6 min-w-0" dir="rtl">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2"><PackageSearch className="text-indigo-600" /> متابعة البوليصة</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">كل شحنات DHL Express المسجلة في SHIPPEC — الحالة من DHL مباشرة.</p>
        </div>
        {counts?.last_synced_at && (
          <span className="text-xs text-slate-500 dark:text-slate-400">آخر مزامنة مع DHL: <span className="font-bold">{timeAgo(counts.last_synced_at)}</span></span>
        )}
      </header>

      {integration && !integration.usable && (
        <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-900/15 px-4 py-3 text-xs font-semibold text-amber-800 dark:text-amber-300" role="status">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          ربط DHL (MyDHL API) غير مفعّل على الخادم بعد — تظهر الشحنات من فواتير SHIPPEC، وستُحدَّث حالاتها بعد التفعيل.
        </div>
      )}
      {integration?.usable && integration.env === 'test' && (
        <div className="rounded-2xl border border-sky-200 bg-sky-50 dark:border-sky-900/40 dark:bg-sky-900/15 px-4 py-2 text-xs font-semibold text-sky-800 dark:text-sky-300" role="status">
          ربط DHL يعمل على بيئة الاختبار (Test) — بيانات التتبع الحقيقية تبدأ بعد اعتماد Production.
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-4" aria-live="polite">
        {CARDS.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setFilter('status', c.status)}
            aria-pressed={filters.status === c.status}
            className={`text-start bg-white dark:bg-slate-800 p-3 sm:p-4 rounded-2xl border shadow-sm flex items-center gap-3 min-w-0 transition-colors ${filters.status === c.status ? 'border-indigo-400 ring-2 ring-indigo-100 dark:ring-indigo-900/40' : 'border-slate-200 dark:border-slate-700 hover:border-indigo-200'} ${c.key === 'total' ? 'col-span-2 sm:col-span-1' : ''}`}
          >
            <div className={`p-2 sm:p-3 rounded-xl shrink-0 ${c.cls}`}>{c.icon}</div>
            <div className="min-w-0">
              <div className="text-[10px] sm:text-xs font-bold text-slate-400 truncate">{c.label}</div>
              <div className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white tabular-nums">{counts ? counts[c.key] : '—'}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm p-3 sm:p-4 space-y-3">
        <div className="flex gap-2">
          <label className="relative flex-1 min-w-0">
            <span className="sr-only">بحث برقم البوليصة أو رقم الفاتورة أو اسم العميل أو الجوال</span>
            <Search size={20} className="absolute start-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="رقم البوليصة AWB، رقم الفاتورة، اسم العميل أو الجوال"
              className="w-full ps-12 pe-4 py-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 text-base font-bold text-slate-900 dark:text-white placeholder:text-slate-400 placeholder:font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </label>
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            aria-expanded={showFilters}
            aria-label={`الفلاتر${activeFilters ? ` (${activeFilters})` : ''}`}
            className={`flex items-center gap-1.5 px-3 sm:px-4 rounded-2xl border text-xs font-bold shrink-0 ${showFilters || activeFilters ? 'border-indigo-300 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-800' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`}
          >
            <Filter size={16} /> <span className="hidden sm:inline">الفلاتر</span>{activeFilters ? <span className="tabular-nums">({activeFilters})</span> : null}
          </button>
        </div>

        <div role="radiogroup" aria-label="حالة الشحنة" className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={filters.status === f.id}
              onClick={() => setFilter('status', f.id)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg whitespace-nowrap ${filters.status === f.id ? 'bg-indigo-600 text-white' : 'bg-slate-50 dark:bg-slate-900/40 text-slate-600 dark:text-slate-300 hover:bg-slate-100'}`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {showFilters && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 pt-1">
            <label className="text-[10px] font-bold text-slate-400 space-y-1 min-w-0">
              <span>من تاريخ الحجز</span>
              <input type="date" value={filters.from} onChange={(e) => setFilter('from', e.target.value)} className={selectCls} />
            </label>
            <label className="text-[10px] font-bold text-slate-400 space-y-1 min-w-0">
              <span>إلى تاريخ الحجز</span>
              <input type="date" value={filters.to} onChange={(e) => setFilter('to', e.target.value)} className={selectCls} />
            </label>
            <label className="text-[10px] font-bold text-slate-400 space-y-1 min-w-0">
              <span>بلد المنشأ</span>
              <select value={filters.origin} onChange={(e) => setFilter('origin', e.target.value)} className={selectCls}>
                <option value="">كل الدول</option>
                {summary?.countries.origin.map((c) => <option key={c.code} value={c.code}>{countryNameAr(c.code)} ({c.count})</option>)}
              </select>
            </label>
            <label className="text-[10px] font-bold text-slate-400 space-y-1 min-w-0">
              <span>بلد الوجهة</span>
              <select value={filters.destination} onChange={(e) => setFilter('destination', e.target.value)} className={selectCls}>
                <option value="">كل الدول</option>
                {summary?.countries.destination.map((c) => <option key={c.code} value={c.code}>{countryNameAr(c.code)} ({c.count})</option>)}
              </select>
            </label>
            <label className="text-[10px] font-bold text-slate-400 space-y-1 min-w-0">
              <span>آخر مزامنة</span>
              <select value={filters.sync} onChange={(e) => setFilter('sync', e.target.value as TrackingSyncFilter)} className={selectCls}>
                {SYNC_FILTERS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </label>
          </div>
        )}
        {filters.client_id !== '' && (
          <div className="flex items-center gap-2 text-xs font-bold text-indigo-700 dark:text-indigo-300">
            <span className="px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-900/40 flex items-center gap-1.5 min-w-0">
              <span className="truncate">العميل: {clientLabel || `#${filters.client_id}`}</span>
              <button type="button" onClick={() => setFilter('client_id', '')} aria-label="إزالة فلتر العميل"><X size={13} /></button>
            </span>
          </div>
        )}
        {(activeFilters > 0 || q) && (
          <button type="button" onClick={clearAll} className="flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-red-600">
            <X size={14} /> مسح البحث والفلاتر
          </button>
        )}
      </div>

      {phase === 'ready' && loadError && (
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-red-600 dark:text-red-400" role="status">
          <AlertCircle size={12} /> تعذر تحديث القائمة: {loadError}
          <button type="button" onClick={() => void load('background')} className="font-bold text-indigo-600 hover:underline">إعادة المحاولة</button>
        </div>
      )}

      {/* List */}
      {phase === 'initial' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" role="status" aria-label="جاري تحميل الشحنات">
          {[0, 1, 2].map((i) => (
            <div key={i} className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 p-5 space-y-3 animate-pulse" aria-hidden="true">
              <div className="h-5 w-24 rounded-lg bg-slate-200 dark:bg-slate-700" />
              <div className="h-7 w-44 rounded-lg bg-slate-200 dark:bg-slate-700" />
              <div className="h-16 w-full rounded-2xl bg-slate-100 dark:bg-slate-700/60" />
              <div className="h-12 w-full rounded-2xl bg-slate-100 dark:bg-slate-700/60" />
            </div>
          ))}
        </div>
      ) : phase === 'error' ? (
        <div className="bg-white dark:bg-slate-800 rounded-3xl border border-red-100 dark:border-red-900/40 p-10 flex flex-col items-center text-center" role="alert">
          <AlertCircle size={40} className="text-red-500 mb-3" />
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">تعذر تحميل الشحنات</h3>
          <p className="text-slate-500 mt-1 text-sm">{loadError}</p>
          <button type="button" onClick={() => { setPhase('initial'); void load('replace'); }} className="mt-4 flex items-center gap-1.5 px-5 py-2.5 rounded-2xl bg-indigo-600 text-white font-bold text-sm">
            <RotateCcw size={14} /> إعادة المحاولة
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-700 p-12 sm:p-20 flex flex-col items-center text-center">
          <div className="p-6 bg-slate-50 dark:bg-slate-900 rounded-full mb-4"><PackageSearch size={48} className="text-slate-300 dark:text-slate-600" /></div>
          <h3 className="text-xl font-bold text-slate-900 dark:text-white">
            {nothingAtAll ? 'لا توجد شحنات DHL للمتابعة حاليًا' : 'لا توجد نتائج مطابقة للبحث أو الفلتر'}
          </h3>
          {nothingAtAll && <p className="text-slate-500 mt-2 text-sm">تظهر هنا تلقائيًا كل فاتورة DHL تحتوي رقم بوليصة.</p>}
        </div>
      ) : (
        <>
          <div className={`grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5 transition-opacity ${phase === 'switching' ? 'opacity-60' : ''}`} aria-busy={phase === 'switching'}>
            {items.map((t) => (
              <ShipmentCard key={t.id} t={t} onOpen={setOpenAwb} onCustomer={(x) => { setClientLabel(x.customer_name); setFilter('client_id', x.client_id ?? ''); }} />
            ))}
          </div>
          {totalPages > 1 && (
            <nav className="flex items-center justify-center gap-3 text-xs font-bold text-slate-500" aria-label="صفحات الشحنات">
              <button type="button" disabled={page <= 1} onClick={() => { switching(); setPage(page - 1); }} aria-label="الصفحة السابقة" className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 disabled:opacity-40">
                <ChevronRight size={16} />
              </button>
              <span className="tabular-nums">صفحة {page} من {totalPages} · {total} شحنة</span>
              <button type="button" disabled={page >= totalPages} onClick={() => { switching(); setPage(page + 1); }} aria-label="الصفحة التالية" className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 disabled:opacity-40">
                <ChevronLeft size={16} />
              </button>
            </nav>
          )}
        </>
      )}

      <TrackingDetailsDialog
        awb={openAwb}
        onClose={closeDetails}
        canRefresh={canRefreshTracking(role)}
        onRefreshed={() => { void load('background'); void loadSummary(); }}
      />
    </div>
  );
};
