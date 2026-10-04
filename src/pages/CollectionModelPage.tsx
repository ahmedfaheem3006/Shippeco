import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAppLayout } from '../components/AppLayout/useAppLayout';
import {
  collectionService,
  type CollectionCategory,
  type CollectionInvoiceItem,
  type CollectionSummaryData,
  type CollectionTotals,
} from '../services/collectionService';
import { invoiceService } from '../services/invoiceService';
import { InvoiceViewModal } from '../components/Invoices/InvoiceViewModal';
import type { Invoice } from '../utils/models';
import { useAuthStore } from '../hooks/useAuthStore';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { formatDate, formatMoney } from '../utils/money';
import { describeApiError, isAbort, isConflict } from '../utils/apiErrors';
import {
  ClipboardCheck, Search, Filter, Clock, AlertTriangle, Zap,
  MessageCircle, CheckCircle2, RefreshCw, Loader2, Sparkles, UserCheck,
  ChevronLeft, ChevronRight, X, Eye,
} from 'lucide-react';
import toast from 'react-hot-toast';

const PAGE_SIZE = 20;

const PAYMENT_STATUS: Record<number, { label: string; cls: string }> = {
  0: { label: 'غير مسددة', cls: 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400' },
  1: { label: 'مسددة جزئيًا', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400' },
  2: { label: 'مسددة بالكامل', cls: 'bg-green-100 text-green-700 dark:bg-green-950/60 dark:text-green-400' },
  3: { label: 'مرتجعة', cls: 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300' },
};

const CATEGORY_OPTIONS: { value: CollectionCategory; label: string }[] = [
  { value: 'A', label: 'فئة A (VIP)' },
  { value: 'B', label: 'فئة B (بعد 7 أيام)' },
  { value: 'C', label: 'فئة C (بعد 3 أيام)' },
  { value: 'D', label: 'فئة D (في الحال)' },
];

const TIERS: { key: CollectionCategory; title: string; badge: string; note: string; icon: typeof Clock; theme: string; accent: string }[] = [
  { key: 'A', title: 'فئة A (VIP)', badge: 'لا إشعارات', note: 'عملاء متميزون — بدون تنبيهات سداد تلقائية', icon: Sparkles, theme: 'from-purple-900 via-indigo-950 to-slate-900 border-purple-800/50', accent: 'text-purple-300' },
  { key: 'B', title: 'فئة B', badge: 'بعد 7 أيام', note: 'إشعار للموظفين بعد 7 أيام من تاريخ الفاتورة', icon: Clock, theme: 'from-emerald-900 via-teal-950 to-slate-900 border-emerald-800/50', accent: 'text-emerald-300' },
  { key: 'C', title: 'فئة C', badge: 'بعد 3 أيام', note: 'إشعار للموظفين بعد 3 أيام من تاريخ الفاتورة', icon: AlertTriangle, theme: 'from-amber-950 via-orange-950 to-slate-900 border-amber-800/50', accent: 'text-amber-300' },
  { key: 'D', title: 'فئة D', badge: 'فورًا', note: 'إشعار للموظفين فور صدور الفاتورة', icon: Zap, theme: 'from-rose-950 via-red-950 to-slate-900 border-rose-800/50', accent: 'text-rose-300' },
];

const selectCls = 'w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-bold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500';

function whatsappLink(inv: CollectionInvoiceItem): string | null {
  const raw = (inv.phone || '').replace(/[^\d]/g, '');
  if (!raw) return null;
  const phone = raw.startsWith('05') ? '966' + raw.slice(1) : raw.startsWith('5') ? '966' + raw : raw;
  const remaining = formatMoney(inv.remaining, { currency: false });
  const name = inv.client_name || '';
  const cat = inv.collection_category || 'B';
  const msg =
    cat === 'A'
      ? `أهلاً بك عزيزنا العميل المميز ${name} 🌟\n\nنود أن نذكركم بلطف بأن الفاتورة رقم (${inv.invoice_number}) بمبلغ متبقٍ قدره [ ${remaining} ريال ] مستحقة. يسعدنا التعامل معكم دائماً في Shippeco. ✨`
      : cat === 'B'
        ? `مرحباً ${name} 👋\n\nنود تذكيركم بسداد الفاتورة رقم (${inv.invoice_number}) بمبلغ متبقٍ [ ${remaining} ريال ].\nشاكرين حسن تعاونكم معنا في Shippeco.`
        : cat === 'C'
          ? `تنبيه سداد ⚠️\nعزيزنا العميل ${name}،\nيرجى التكرم بسداد الفاتورة المستحقة رقم (${inv.invoice_number}) بمبلغ متبقٍ [ ${remaining} ريال ].\nشاكرين سرعتكم في السداد.`
          : `تنبيه عاجل 🚨\nعزيزنا العميل ${name}،\nيرجى سداد الفاتورة المستحقة رقم (${inv.invoice_number}) بمبلغ متبقٍ [ ${remaining} ريال ] لمتابعة الشحنة.\nشكراً لتعاونكم مع Shippeco.`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
}

export function CollectionModelPage() {
  useAppLayout();
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.user?.role);
  const canCategorize = !!role && role !== 'viewer';
  const canRunCheck = role === 'admin' || role === 'manager' || role === 'accountant';

  // Filters live in the URL: they survive opening an invoice, Back and refresh.
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => ({
    search: params.get('q') || '',
    category: params.get('cat') || 'ALL',
    paymentStatus: params.get('st') || 'ALL',
    paymentMethod: params.get('pm') || 'ALL',
    dateFrom: params.get('from') || '',
    dateTo: params.get('to') || '',
  }), [params]);
  const page = Math.max(1, Number(params.get('page')) || 1);
  const setFilter = useCallback((key: string, value: string) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value && value !== 'ALL') next.set(key, value); else next.delete(key);
      if (key !== 'page') next.delete('page');
      return next;
    }, { replace: true });
  }, [setParams]);
  const hasFilters = ['q', 'cat', 'st', 'pm', 'from', 'to'].some((k) => params.has(k));

  const [searchInput, setSearchInput] = useState(filters.search);
  const debouncedSearch = useDebouncedValue(searchInput.trim(), 400);
  useEffect(() => {
    if (debouncedSearch !== filters.search) setFilter('q', debouncedSearch);
  }, [debouncedSearch, filters.search, setFilter]);

  const [summary, setSummary] = useState<CollectionSummaryData | null>(null);
  const [rows, setRows] = useState<CollectionInvoiceItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totals, setTotals] = useState<CollectionTotals | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [drafts, setDrafts] = useState<Record<number, CollectionCategory | ''>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [checking, setChecking] = useState(false);
  const [viewInvoice, setViewInvoice] = useState<Invoice | null>(null);
  const [openingId, setOpeningId] = useState<number | null>(null);
  const hasLoaded = useRef(false);

  const loadSummary = useCallback(() => {
    collectionService.getSummary().then(setSummary).catch((err) => console.error('[Collection] summary failed', err));
  }, []);
  useEffect(loadSummary, [loadSummary]);

  useEffect(() => {
    const ctrl = new AbortController();
    if (hasLoaded.current) setRefreshing(true); else setPhase('loading');
    collectionService
      .getInvoices({ ...filters, page, limit: PAGE_SIZE }, ctrl.signal)
      .then((res) => {
        setRows(res.invoices);
        setTotal(res.total);
        setTotals(res.totals);
        setLoadError(null);
        setPhase('ready');
        hasLoaded.current = true;
      })
      .catch((err) => {
        if (isAbort(err)) return;
        setLoadError(describeApiError(err, 'تعذر تحميل الفواتير'));
        if (!hasLoaded.current) setPhase('error');
      })
      .finally(() => { if (!ctrl.signal.aborted) setRefreshing(false); });
    return () => ctrl.abort();
  }, [filters, page, reloadKey]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const saveCategory = async (inv: CollectionInvoiceItem) => {
    if (savingId !== null) return;
    const next = (drafts[inv.id] ?? inv.collection_category ?? '') || null;
    setSavingId(inv.id);
    try {
      await collectionService.updateCategory(inv.id, next, inv.collection_category);
      setRows((prev) => prev.map((r) => (r.id === inv.id ? { ...r, collection_category: next } : r)));
      setDrafts((prev) => { const nextDrafts = { ...prev }; delete nextDrafts[inv.id]; return nextDrafts; });
      toast.success(`تم حفظ الفئة (${next || 'بدون فئة'}) للفاتورة ${inv.invoice_number}`);
      loadSummary();
    } catch (err) {
      toast.error(describeApiError(err, 'فشل حفظ الفئة — لم يتغير شيء'));
      if (isConflict(err)) {
        // Show the value the other user saved: drop this row's draft and reload.
        setDrafts((prev) => { const nextDrafts = { ...prev }; delete nextDrafts[inv.id]; return nextDrafts; });
        setReloadKey((k) => k + 1);
      }
    } finally {
      setSavingId(null);
    }
  };

  const runCheck = async () => {
    if (checking) return;
    setChecking(true);
    try {
      const res = await collectionService.triggerNotificationsCheck();
      toast.success(`تم الفحص — أُرسل ${res.triggeredCount || 0} إشعار سداد للموظفين`);
    } catch (err) {
      toast.error(describeApiError(err, 'فشل فحص الإشعارات'));
    } finally {
      setChecking(false);
    }
  };

  // Details open in place (no navigation), so filters and scroll stay put.
  const openInvoice = async (id: number) => {
    if (openingId !== null) return;
    setOpeningId(id);
    try {
      setViewInvoice(await invoiceService.getInvoice(String(id), { strict: true, fresh: true }));
    } catch (err) {
      toast.error(describeApiError(err, 'تعذّر فتح الفاتورة'));
    } finally {
      setOpeningId(null);
    }
  };
  const goToInvoices = () => { if (viewInvoice) navigate(`/invoices?invoice=${viewInvoice.id}`); };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-600 text-white flex items-center justify-center shadow-lg shadow-indigo-500/20 shrink-0">
            <ClipboardCheck size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">نموذج التحصيل وتصنيف الفواتير</h1>
            <p className="text-sm text-gray-500 dark:text-slate-400 mt-1 font-medium">
              تصنيف الفواتير إلى 4 فئات (A, B, C, D) ومتابعة السداد — التصنيف لا يغيّر حالة سداد الفاتورة
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {canRunCheck && (
            <button type="button" onClick={runCheck} disabled={checking}
              className="flex items-center gap-2 px-4 py-2.5 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 rounded-xl text-sm font-bold hover:bg-indigo-100 transition-colors disabled:opacity-50">
              {checking ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />} فحص الإشعارات الآن
            </button>
          )}
          <button type="button" onClick={() => { loadSummary(); setReloadKey((k) => k + 1); }} disabled={refreshing}
            className="p-2.5 bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 rounded-xl hover:bg-gray-200 transition-colors disabled:opacity-50" title="تحديث البيانات">
            <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Category KPI cards — whole system, not the filtered list */}
      <section aria-label="ملخص الفئات">
        <p className="text-xs font-bold text-gray-500 dark:text-slate-400 mb-2">ملخص كل الفواتير المصنفة (لا يتأثر بالفلاتر)</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {TIERS.map((t) => (
            <div key={t.key} className={`relative overflow-hidden bg-gradient-to-br ${t.theme} text-white p-5 rounded-2xl border shadow-xl`}>
              <div className="absolute top-0 right-0 p-4 opacity-10 motion-reduce:hidden"><t.icon size={90} /></div>
              <div className="flex items-center justify-between">
                <span className={`px-3 py-1 bg-white/10 border border-white/20 rounded-full text-xs font-bold flex items-center gap-1 ${t.accent}`}>
                  <UserCheck size={12} /> {t.title}
                </span>
                <span className="text-[11px] bg-black/30 px-2 py-0.5 rounded">{t.badge}</span>
              </div>
              <div className="mt-4">
                <div className="text-3xl font-black">{summary?.clientsCount?.[t.key] ?? 0} <span className={`text-sm font-normal ${t.accent}`}>عميل</span></div>
                <div className={`text-xs mt-1 flex items-center justify-between gap-2 ${t.accent}`}>
                  <span>الفواتير: {summary?.invoicesCount?.[t.key] ?? 0}</span>
                  <span className="font-mono font-bold text-amber-300" dir="ltr">{formatMoney(summary?.unpaidTotal?.[t.key] ?? 0)}</span>
                </div>
                <div className="text-[10px] opacity-70 mt-0.5">المتبقي على غير المسددة والجزئية</div>
              </div>
              <div className={`mt-3 pt-3 border-t border-white/10 text-[11px] ${t.accent}`}>{t.note}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <div className="relative sm:col-span-2">
            <Search className="absolute right-3.5 top-3 text-gray-400" size={18} />
            <input type="search" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} aria-label="بحث"
              placeholder="رقم الفاتورة، العميل، الجوال، رقم البوليصة..."
              className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl pr-10 pl-4 py-2.5 text-sm font-bold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <select aria-label="الفئة" value={filters.category} onChange={(e) => setFilter('cat', e.target.value)} className={selectCls}>
            <option value="ALL">جميع الفئات</option>
            {CATEGORY_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            <option value="NONE">بدون فئة</option>
          </select>
          <select aria-label="حالة السداد" value={filters.paymentStatus} onChange={(e) => setFilter('st', e.target.value)} className={selectCls}>
            <option value="ALL">جميع الحالات</option>
            <option value="unpaid">غير مسددة</option>
            <option value="partial">مسددة جزئيًا</option>
            <option value="paid">مسددة بالكامل</option>
            <option value="returned">مرتجعة</option>
          </select>
          <select aria-label="طريقة التحصيل" value={filters.paymentMethod} onChange={(e) => setFilter('pm', e.target.value)} className={selectCls}>
            <option value="ALL">كل طرق التحصيل</option>
            <option value="تحويل بنكي">تحويل بنكي</option>
            <option value="سداد إلكتروني">سداد إلكتروني (Paymob)</option>
            <option value="NONE">غير محددة</option>
          </select>
          <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-1">
            {hasFilters && (
              <button type="button" onClick={() => { setSearchInput(''); setParams(new URLSearchParams(), { replace: true }); }}
                className="w-full flex items-center justify-center gap-1 px-3 py-2.5 text-sm font-bold text-gray-600 dark:text-slate-300 bg-gray-100 dark:bg-slate-800 rounded-xl hover:bg-gray-200">
                <X size={14} /> مسح الفلاتر
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm font-bold text-gray-600 dark:text-slate-300">
          <label className="flex items-center gap-2">من تاريخ
            <input type="date" value={filters.dateFrom} max={filters.dateTo || undefined} onChange={(e) => setFilter('from', e.target.value)} className={`${selectCls} w-auto`} />
          </label>
          <label className="flex items-center gap-2">إلى
            <input type="date" value={filters.dateTo} min={filters.dateFrom || undefined} onChange={(e) => setFilter('to', e.target.value)} className={`${selectCls} w-auto`} />
          </label>
        </div>
      </div>

      {/* Totals over the full filtered result */}
      {totals && phase === 'ready' && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" aria-live="polite" data-testid="collection-totals">
          {[
            ['عدد الفواتير', String(totals.count), 'text-gray-900 dark:text-white'],
            ['إجمالي الفواتير', formatMoney(totals.total), 'text-gray-900 dark:text-white'],
            ['المحصّل', formatMoney(totals.paid), 'text-green-600 dark:text-green-400'],
            ['المتبقي (غير المسددة والجزئية)', formatMoney(totals.remaining), 'text-rose-600 dark:text-rose-400'],
          ].map(([label, value, cls]) => (
            <div key={label} className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-xl p-3">
              <div className="text-[11px] font-bold text-gray-500 dark:text-slate-400">{label}</div>
              <div className={`text-lg font-black font-mono ${cls}`} dir="ltr">{value}</div>
            </div>
          ))}
          <p className="col-span-2 lg:col-span-4 text-[11px] text-gray-500 dark:text-slate-400">
            الإجماليات محسوبة على كل الفواتير المطابقة للفلاتر الحالية ({totals.count} فاتورة)، وليس على الصفحة المعروضة فقط.
          </p>
        </div>
      )}

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100 dark:border-slate-800 flex flex-wrap gap-2 justify-between items-center">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Filter size={18} className="text-indigo-600 dark:text-indigo-400" /> سجل الفواتير وتخصيص الفئات ({total})
            {refreshing && <Loader2 size={16} className="animate-spin text-indigo-500" aria-label="جاري التحديث" />}
          </h2>
          {loadError && phase === 'ready' && (
            <span className="text-xs font-bold text-red-600">{loadError} — <button type="button" className="underline" onClick={() => setReloadKey((k) => k + 1)}>إعادة المحاولة</button></span>
          )}
        </div>

        {phase === 'loading' ? (
          <div className="p-12 text-center text-gray-500 flex flex-col items-center gap-3">
            <Loader2 size={32} className="animate-spin text-indigo-600" />
            <span>جاري تحميل الفواتير...</span>
          </div>
        ) : phase === 'error' ? (
          <div className="p-12 text-center flex flex-col items-center gap-3">
            <AlertTriangle size={32} className="text-red-500" />
            <p className="font-bold text-red-600">{loadError}</p>
            <button type="button" onClick={() => setReloadKey((k) => k + 1)} className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold">إعادة المحاولة</button>
          </div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-gray-500 dark:text-slate-400">لا توجد فواتير مطابقة للبحث أو الفلاتر الحالية</div>
        ) : (
          <div className={`overflow-x-auto transition-opacity motion-reduce:transition-none ${refreshing ? 'opacity-60' : ''}`}>
            <table className="w-full text-right border-collapse text-sm min-w-[1080px]">
              <thead>
                <tr className="bg-gray-50 dark:bg-slate-800/60 text-gray-500 dark:text-slate-400 text-xs font-bold border-b border-gray-100 dark:border-slate-800">
                  <th className="py-3 px-3">رقم الفاتورة</th>
                  <th className="py-3 px-3">العميل</th>
                  <th className="py-3 px-3">التاريخ</th>
                  <th className="py-3 px-3 text-left">الإجمالي</th>
                  <th className="py-3 px-3 text-left">المحصّل</th>
                  <th className="py-3 px-3 text-left">المتبقي</th>
                  <th className="py-3 px-3">الحالة</th>
                  <th className="py-3 px-3">الفئة</th>
                  <th className="py-3 px-3 text-center">تنبيه</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-800 font-medium">
                {rows.map((inv) => {
                  const draft = drafts[inv.id];
                  const current = draft !== undefined ? draft : inv.collection_category ?? '';
                  const dirty = current !== (inv.collection_category ?? '');
                  const ps = PAYMENT_STATUS[inv.payment_status] ?? PAYMENT_STATUS[0];
                  const owes = (inv.payment_status === 0 || inv.payment_status === 1) && Number(inv.remaining) > 0;
                  const wa = owes ? whatsappLink(inv) : null;
                  return (
                    <tr key={inv.id} className="hover:bg-gray-50/80 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-3">
                        <button type="button" onClick={() => openInvoice(inv.id)} disabled={openingId !== null}
                          className="font-mono font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1" title="عرض تفاصيل الفاتورة">
                          {openingId === inv.id ? <Loader2 size={12} className="animate-spin" /> : <Eye size={12} />}
                          <span dir="ltr">{inv.invoice_number || inv.id}</span>
                        </button>
                        {inv.awb && <div className="text-[11px] text-gray-400 font-mono" dir="ltr">AWB {inv.awb}</div>}
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-bold text-gray-900 dark:text-white">{inv.client_name || 'عميل نقدي'}</div>
                        <div className="text-xs text-gray-400 font-mono" dir="ltr">{inv.phone || '—'}</div>
                      </td>
                      <td className="py-3 px-3 text-gray-600 dark:text-slate-300 font-mono" dir="ltr">{formatDate(inv.invoice_date)}</td>
                      <td className="py-3 px-3 font-mono text-left" dir="ltr">{formatMoney(inv.total)}</td>
                      <td className="py-3 px-3 font-mono text-left text-green-700 dark:text-green-400" dir="ltr">{formatMoney(inv.paid_amount)}</td>
                      <td className="py-3 px-3 font-mono font-bold text-left text-indigo-600 dark:text-indigo-400" dir="ltr">
                        {inv.payment_status === 3 ? '—' : formatMoney(inv.remaining)}
                      </td>
                      <td className="py-3 px-3"><span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-bold ${ps.cls}`}>{ps.label}</span></td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <select aria-label={`فئة الفاتورة ${inv.invoice_number}`} value={current} disabled={!canCategorize || savingId === inv.id}
                            onChange={(e) => setDrafts((p) => ({ ...p, [inv.id]: e.target.value as CollectionCategory | '' }))}
                            className="text-xs font-bold rounded-lg px-2 py-1.5 border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-gray-800 dark:text-slate-200 disabled:opacity-60">
                            <option value="">بدون فئة</option>
                            {CATEGORY_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                          </select>
                          {canCategorize && (
                            <button type="button" onClick={() => saveCategory(inv)} disabled={!dirty || savingId !== null}
                              className="px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-gray-100 disabled:text-gray-400 dark:disabled:bg-slate-800">
                              {savingId === inv.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />} حفظ
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center">
                        {wa ? (
                          <a href={wa} target="_blank" rel="noopener noreferrer" title="إرسال تنبيه سداد بالواتساب"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl">
                            <MessageCircle size={14} /> تنبيه
                          </a>
                        ) : (
                          <span className="text-xs text-gray-400" title={owes ? 'لا يوجد رقم جوال' : 'لا يوجد مبلغ مستحق'}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {total > 0 && phase === 'ready' && (
          <div className="p-4 border-t border-gray-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 bg-gray-50/50 dark:bg-slate-800/30">
            <div className="text-xs font-bold text-gray-500 dark:text-slate-400">
              الصفحة <span className="font-mono text-gray-900 dark:text-white">{page}</span> من <span className="font-mono text-gray-900 dark:text-white">{totalPages}</span> — {total} فاتورة
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setFilter('page', String(page - 1))} disabled={page <= 1 || refreshing}
                className="px-3 py-1.5 rounded-lg text-xs font-bold border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-50 flex items-center gap-1">
                <ChevronRight size={14} /> السابق
              </button>
              <button type="button" onClick={() => setFilter('page', String(page + 1))} disabled={page >= totalPages || refreshing}
                className="px-3 py-1.5 rounded-lg text-xs font-bold border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-50 flex items-center gap-1">
                التالي <ChevronLeft size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      <InvoiceViewModal
        open={Boolean(viewInvoice)}
        invoice={viewInvoice}
        onClose={() => setViewInvoice(null)}
        onEdit={goToInvoices}
        onAddItem={goToInvoices}
        onCollect={goToInvoices}
        onDelete={goToInvoices}
      />
    </div>
  );
}
