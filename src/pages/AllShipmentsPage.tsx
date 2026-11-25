/**
 * «إنشاء شحنة» → «جميع الشحنات» (route /create-shipment/shipments): MyDHL+
 * "Manage My Shipments" in SHIPPEC's design. The list is SHIPPEC's own
 * database of the DHL shipments it created — MyDHL REST has no endpoint that
 * lists every shipment of an account. Filters live in the URL (shareable,
 * kept on reload). Actions: view, track, documents, copy, corrected
 * replacement, cancel — only what DHL / SHIPPEC really support; the Backend
 * re-checks each one. There is no "delete".
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { Ban, ChevronLeft, ChevronRight, Copy, Eye, FileDown, Filter, ListChecks, PackagePlus, PackageSearch, RefreshCcw, Search, X } from 'lucide-react';
import { useAuthStore } from '../hooks/useAuthStore';
import { dhlShipmentService, type DateFilter, type ListBucket, type ManagedShipmentRow, type ShipmentFacets } from '../services/dhlShipment.service';
import { downloadBlob } from '../utils/download';
import { displayAwb } from '../utils/awb';
import { describeApiError } from '../utils/apiErrors';
import { CsLangProvider, LangToggle } from '../components/CreateShipment/i18n';
import { useCsLang } from '../components/CreateShipment/csLang';
import { Button, Note, SelectInput, Skeleton, TextInput } from '../components/CreateShipment/ui';
import { canShipment, countryName } from '../components/CreateShipment/wizardModel';
import { CancelShipmentDialog, ReplacementDialog, StatusBadge } from '../components/CreateShipment/shipmentManage';
import { formatAt, formatDay, LIST_STATUS } from '../components/CreateShipment/shipmentManageModel';
import { useCopyShipment } from '../components/CreateShipment/useShipmentActions';

export const AllShipmentsPage: React.FC = () => (
  <CsLangProvider>
    <AllShipments />
  </CsLangProvider>
);

const DATES: Array<[DateFilter, string, string]> = [
  ['all', 'كل التواريخ', 'All dates'], ['today', 'اليوم', 'Today'], ['past_7', 'آخر 7 أيام', 'Past 7 days'], ['past_30', 'آخر 30 يومًا', 'Past 30 days'],
  ['past_60', 'آخر 60 يومًا', 'Past 60 days'], ['past_90', 'آخر 90 يومًا', 'Past 90 days'], ['upcoming', 'القادمة', 'Upcoming'], ['range', 'نطاق تاريخ', 'Date range'],
];
const STATUSES: ListBucket[] = ['ready_to_ship', 'pre_transit', 'in_transit', 'out_for_delivery', 'delivered', 'exception', 'cancelled', 'uncertain'];
const PAGE = 20;

function useFilters() {
  const [params, setParams] = useSearchParams();
  const get = (k: string) => params.get(k) ?? '';
  const f = {
    q: get('q'), date: (get('date') || 'all') as DateFilter, from: get('from'), to: get('to'), status: get('status') as ListBucket | '',
    content: get('content') as '' | 'documents' | 'packages', product: get('product'), pickup: get('pickup') as '' | 'scheduled' | 'none' | 'drop_off',
    client_id: get('client_id'), page: Math.max(1, Number(get('page')) || 1),
  };
  const set = (patch: Partial<Record<keyof typeof f, string | number>>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === '' || v === undefined || (k === 'date' && v === 'all') || (k === 'page' && Number(v) <= 1)) next.delete(k); else next.set(k, String(v));
    }
    if (!('page' in patch)) next.delete('page');
    setParams(next, { replace: true });
  };
  return { f, set, clear: () => setParams(new URLSearchParams(), { replace: true }), active: [...params.keys()].filter((k) => k !== 'page').length };
}

function Row({ r, onChanged }: { r: ManagedShipmentRow; onChanged: () => void }) {
  const { t, lang } = useCsLang();
  const role = useAuthStore((s) => s.user?.role);
  const copy = useCopyShipment();
  const [docBusy, setDocBusy] = useState(false);
  const [replace, setReplace] = useState(false);
  const [cancel, setCancel] = useState(false);
  const live = r.creation_status === 'created' && r.status === 'booked' && ['ready_to_ship', 'pre_transit'].includes(r.list_status);
  const party = (company: string | null, contact: string | null, city: string | null, cc: string | null) => (
    <>
      <div className="text-sm font-bold text-slate-900 dark:text-white truncate" dir="auto">{company || contact || '—'}</div>
      {company && contact && <div className="text-xs text-slate-500 truncate" dir="auto">{contact}</div>}
      <div className="text-xs text-slate-500 truncate">{[city, cc ? countryName(cc, lang) : null].filter(Boolean).join('، ')}</div>
    </>
  );
  const docs = async () => {
    if (docBusy) return;
    setDocBusy(true);
    try { const { blob, filename } = await dhlShipmentService.downloadBundle(r.id); downloadBlob(filename, blob); }
    catch (e) { toast.error(describeApiError(e, t('تعذر تجهيز المستندات', 'Could not prepare the documents'))); }
    finally { setDocBusy(false); }
  };
  const action = 'inline-flex items-center gap-1 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline disabled:opacity-50 min-h-[32px]';
  return (
    <li className={`rounded-2xl border bg-white dark:bg-slate-800 shadow-sm overflow-hidden ${r.status === 'cancelled' || r.status === 'superseded' ? 'border-slate-200 dark:border-slate-700 opacity-90' : 'border-slate-200 dark:border-slate-700'}`}
      data-testid="shipment-row" data-awb={r.awb ?? ''} style={{ borderInlineStartWidth: 4, borderInlineStartColor: r.list_status === 'delivered' ? '#16a34a' : r.status === 'cancelled' || r.status === 'superseded' ? '#94a3b8' : '#4f46e5' }}>
      <div className="p-4 grid grid-cols-1 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-4">
        <div className="min-w-0">
          {r.awb
            ? <Link to={`/create-shipment/success/${r.id}`} className="font-mono text-lg font-extrabold text-indigo-700 dark:text-indigo-300 hover:underline" dir="ltr">{displayAwb(r.awb)}</Link>
            : <span className="font-mono text-sm font-bold" dir="ltr">{r.shippec_reference}</span>}
          <div className="mt-1 flex flex-wrap items-center gap-1.5"><StatusBadge status={r.status} listStatus={r.list_status} />
            {r.dhl_env === 'test' && <span className="px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 text-[10px] font-bold">TEST</span>}</div>
          {r.tracking_description && <div className="mt-1 text-xs text-slate-500 truncate" dir="auto">{r.tracking_description}</div>}
          {r.status === 'superseded' && r.replaced_by_awb && <div className="mt-1 text-xs">{t('البديلة: ', 'Replaced by: ')}<Link to={`/create-shipment/success/${r.replaced_by_shipment_id}`} className="font-mono text-indigo-600 hover:underline" dir="ltr">{r.replaced_by_awb}</Link></div>}
          {r.supersedes_awb && <div className="mt-1 text-xs text-slate-500">{t('تستبدل: ', 'Replaces: ')}<span className="font-mono" dir="ltr">{r.supersedes_awb}</span></div>}
        </div>
        <div className="min-w-0 text-xs space-y-1">
          <div><span className="text-slate-500">{t('تاريخ الشحن: ', 'Shipment date: ')}</span><b>{formatDay(r.shipment_date, lang)}</b></div>
          <div><span className="text-slate-500">{t('الخدمة: ', 'Product: ')}</span><b dir="ltr">{r.product_name ?? r.product_code ?? '—'}</b></div>
          {r.estimated_delivery && <div><span className="text-slate-500">{t('التسليم المتوقع: ', 'Est. delivery: ')}</span><b>{formatDay(r.estimated_delivery.slice(0, 10), lang)}</b></div>}
          <div className="truncate" dir="auto"><span className="text-slate-500">{t('الوصف: ', 'Description: ')}</span>{r.content_description ?? '—'}</div>
        </div>
        <div className="min-w-0"><div className="text-[11px] font-bold text-slate-400">{t('من', 'Ship From')}</div>{party(r.shipper_company, r.shipper_contact, r.shipper_city, r.shipper_country_code)}</div>
        <div className="min-w-0"><div className="text-[11px] font-bold text-slate-400">{t('إلى', 'Ship To')}</div>{party(r.receiver_company, r.receiver_contact, r.receiver_city, r.receiver_country_code)}</div>
      </div>
      <div className="px-4 pb-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
        <span>{t(`${r.package_count} قطعة`, `${r.package_count} piece${r.package_count === 1 ? '' : 's'}`)}{r.total_gross_weight ? ` · ${Number(r.total_gross_weight)} ${t('كغ', 'kg')}` : ''}</span>
        <span>{r.customs_required ? t('طرود', 'Packages') : t('مستندات', 'Documents')}</span>
        {r.client_name && <span>{t('العميل: ', 'Customer: ')}<b>{r.client_name}</b></span>}
        {r.dispatch_confirmation_number && <span>{t('الاستلام: ', 'Pickup: ')}<b dir="ltr" className="font-mono">{r.dispatch_confirmation_number}</b>{r.pickup_status === 'cancelled' ? t(' (أُلغي)', ' (cancelled)') : ''}</span>}
        {r.invoice_number && <span>{t('الفاتورة: ', 'Invoice: ')}<b>{r.invoice_number}</b></span>}
        {r.created_by_name && <span>{t('أنشأها: ', 'Created by: ')}{r.created_by_name}</span>}
        <span>{t('آخر تحديث: ', 'Updated: ')}{formatAt(r.updated_at, null, lang)}</span>
      </div>
      <div className="px-4 py-2 bg-slate-50 dark:bg-slate-900/30 border-t border-slate-100 dark:border-slate-700 flex flex-wrap items-center gap-x-4 gap-y-1">
        <Link to={`/create-shipment/success/${r.id}`} className={action}><Eye size={14} /> {t('عرض', 'View')}</Link>
        {r.awb && <Link to={`/shipment-tracking/${r.awb}`} className={action}><PackageSearch size={14} /> {t('تتبع', 'Track')}</Link>}
        {r.awb && canShipment(role, 'download_documents') && r.document_count > 0 && <button type="button" className={action} onClick={() => void docs()} disabled={docBusy}><FileDown size={14} /> {docBusy ? t('جارٍ التجهيز…', 'Preparing…') : t('المستندات', 'Documents')}</button>}
        {canShipment(role, 'copy') && r.creation_status !== 'uncertain' && <button type="button" className={action} onClick={() => void copy.copy(r.id)} disabled={copy.busy}><Copy size={14} /> {t('نسخ', 'Copy')}</button>}
        {live && canShipment(role, 'replace') && <button type="button" className={action} onClick={() => setReplace(true)}><RefreshCcw size={14} /> {t('تعديل ببوليصة بديلة', 'Edit (replacement)')}</button>}
        {live && canShipment(role, 'cancel_shipment') && <button type="button" className={`${action} !text-red-600`} onClick={() => setCancel(true)}><Ban size={14} /> {t('إلغاء الشحنة', 'Cancel Shipment')}</button>}
        {r.creation_status === 'uncertain' && <Link to={`/create-shipment?draft=${r.id}`} className={`${action} !text-amber-700`}>{t('تسوية النتيجة', 'Reconcile')}</Link>}
      </div>
      <ReplacementDialog open={replace} onClose={() => setReplace(false)} shipment={r} />
      <CancelShipmentDialog open={cancel} onClose={() => setCancel(false)} shipment={r} hasPickup={r.pickup_status === 'booked'} onDone={onChanged} />
    </li>
  );
}

function AllShipments() {
  const { t, lang, dir } = useCsLang();
  const { f, set, clear, active } = useFilters();
  const [result, setResult] = useState<{ key: string; rows: ManagedShipmentRow[]; total: number; error: string | null } | null>(null);
  const [facets, setFacets] = useState<ShipmentFacets | null>(null);
  const [search, setSearch] = useState(f.q);
  const [reload, setReload] = useState(0);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => { dhlShipmentService.facets().then(setFacets, () => setFacets({ products: [], customers: [] })); }, []);
  // typing searches after a short pause (AWB search is the main use)
  useEffect(() => {
    const h = window.setTimeout(() => { if (search.trim() !== f.q) set({ q: search.trim() }); }, 400);
    return () => window.clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);
  const key = useMemo(() => JSON.stringify(f), [f]);
  const loadKey = `${key}#${reload}`;
  // the rows of THIS search (while another one loads, the skeleton shows — never stale rows for new filters)
  const rows = result && result.key === loadKey ? result.rows : null;
  const total = result?.total ?? 0;
  const error = result && result.key === loadKey ? result.error : null;
  useEffect(() => {
    let alive = true;
    dhlShipmentService.listShipments({
      q: f.q, date: f.date, from: f.date === 'range' ? f.from : undefined, to: f.date === 'range' ? f.to : undefined, status: f.status, content: f.content,
      product: f.product, pickup: f.pickup, client_id: f.client_id ? Number(f.client_id) : '', page: f.page, limit: PAGE,
    }).then((r) => { if (alive) setResult({ key: loadKey, rows: r.data ?? [], total: r.pagination?.total ?? 0, error: null }); },
      (e) => { if (alive) setResult({ key: loadKey, rows: [], total: 0, error: describeApiError(e, t('تعذر تحميل الشحنات', 'Could not load the shipments')) }); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadKey]);

  const pages = Math.max(1, Math.ceil(total / PAGE));
  const PrevIcon = dir === 'rtl' ? ChevronRight : ChevronLeft;
  const NextIcon = dir === 'rtl' ? ChevronLeft : ChevronRight;
  const sel = (id: string, label: string, value: string, onValue: (v: string) => void, options: Array<[string, string]>) => (
    <label className="min-w-0 space-y-1 block" htmlFor={id}>
      <span className="block text-[11px] font-bold text-slate-500">{label}</span>
      <SelectInput id={id} value={value} onValue={onValue}>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</SelectInput>
    </label>
  );

  return (
    <div className="space-y-4 sm:space-y-5 min-w-0 pb-10" dir={dir} lang={lang} data-testid="all-shipments">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2"><ListChecks className="text-indigo-600" /> {t('كل الشحنات', 'All Shipments')}</h1>
            <LangToggle />
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{t('شحنات DHL التي أنشأها SHIPPEC — من قاعدة بيانات SHIPPEC.', 'DHL shipments created through SHIPPEC — from SHIPPEC\'s database.')}</p>
        </div>
        <Link to="/create-shipment" className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold min-h-[44px]"><PackagePlus size={16} /> {t('إنشاء شحنة', 'Create Shipment')}</Link>
      </header>

      <section className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm p-4 space-y-3">
        <form className="flex gap-2" role="search" onSubmit={(e) => { e.preventDefault(); set({ q: search.trim() }); }}>
          <div className="relative flex-1 min-w-0">
            <Search size={16} className="absolute top-1/2 -translate-y-1/2 start-3 text-slate-400" aria-hidden="true" />
            <TextInput aria-label={t('بحث', 'Search')} value={search} onValue={setSearch} className="!ps-9" data-testid="shipments-search"
              placeholder={t('رقم البوليصة، المرجع، رقم القطعة، المرسل، المستلم، العميل، المدينة…', 'AWB, reference, piece ID, shipper, receiver, customer, city…')} />
          </div>
          <Button type="submit"><Search size={16} /> <span className="hidden sm:inline">{t('بحث', 'Search')}</span></Button>
          <Button type="button" variant="secondary" onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters} data-testid="filters-toggle">
            <Filter size={16} /> <span className="hidden sm:inline">{t('التصفية', 'Filters')}</span>{active > 0 && <span className="ms-1 px-1.5 rounded-full bg-indigo-600 text-white text-[10px]">{active}</span>}
          </Button>
        </form>
        {/* right under the search: never hidden behind the mobile bottom bar */}
        {active > 0 && <button type="button" className="text-xs font-bold text-slate-500 hover:text-red-600 inline-flex items-center gap-1" onClick={() => { setSearch(''); clear(); }}><X size={12} /> {t('مسح البحث والتصفية', 'Clear search and filters')}</button>}
        <div className={`${showFilters ? 'grid' : 'hidden md:grid'} grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3`} data-testid="shipments-filters">
          {sel('f-date', t('تاريخ الشحن', 'Shipment date'), f.date, (v) => set({ date: v }), DATES.map(([v, ar, en]) => [v, t(ar, en)]))}
          {sel('f-status', t('الحالة', 'Status'), f.status, (v) => set({ status: v }), [['', t('النشطة (كل الحالات)', 'Active (all statuses)')], ...STATUSES.map((s): [string, string] => [s, s === 'cancelled' ? t('ملغاة / مستبدلة', 'Cancelled / Superseded') : t(LIST_STATUS[s][0], LIST_STATUS[s][1])])])}
          {sel('f-content', t('نوع الشحنة', 'Shipment type'), f.content, (v) => set({ content: v }), [['', t('الكل', 'All')], ['documents', t('مستندات', 'Documents')], ['packages', t('طرود', 'Packages')]])}
          {sel('f-product', t('خدمة DHL', 'Product'), f.product, (v) => set({ product: v }), [['', t('الكل', 'All')], ...(facets?.products ?? []).map((p): [string, string] => [p.code, `${p.name ?? p.code} (${p.n})`])])}
          {sel('f-pickup', t('الاستلام', 'Pickup'), f.pickup, (v) => set({ pickup: v }), [['', t('الكل', 'All')], ['scheduled', t('استلام مجدول', 'Scheduled')], ['none', t('بدون استلام', 'No pickup')], ['drop_off', t('تسليم في نقطة خدمة', 'Drop-off')]])}
          {sel('f-client', t('العميل', 'Customer'), f.client_id, (v) => set({ client_id: v }), [['', t('الكل', 'All')], ...(facets?.customers ?? []).map((c): [string, string] => [String(c.id), `${c.name} (${c.n})`])])}
          {f.date === 'range' && (
            <>
              <label className="space-y-1 block" htmlFor="f-from"><span className="block text-[11px] font-bold text-slate-500">{t('من', 'From')}</span><TextInput id="f-from" type="date" value={f.from} onValue={(v) => set({ from: v })} /></label>
              <label className="space-y-1 block" htmlFor="f-to"><span className="block text-[11px] font-bold text-slate-500">{t('إلى', 'To')}</span><TextInput id="f-to" type="date" value={f.to} onValue={(v) => set({ to: v })} /></label>
            </>
          )}
        </div>
      </section>

      {error && <Note tone="error">{error}</Note>}
      <div className="flex items-center justify-between text-xs text-slate-500" aria-live="polite">
        <span data-testid="shipments-count">{rows ? t(`${total} شحنة`, `Showing ${total} shipment${total === 1 ? '' : 's'}`) : ' '}</span>
        {!f.status && <span>{t('الملغاة والمستبدلة مخفية — اختر «ملغاة / مستبدلة» لعرضها.', 'Cancelled and superseded are hidden — choose «Cancelled / Superseded» to see them.')}</span>}
      </div>
      {!rows ? (
        <div className="space-y-3" role="status" aria-label={t('جاري التحميل', 'Loading')}><Skeleton className="h-36" /><Skeleton className="h-36" /></div>
      ) : rows.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 dark:border-slate-600 p-8 text-center text-sm text-slate-500" data-testid="shipments-empty">
          {f.q || active ? t('لا توجد شحنات تطابق البحث.', 'No shipments match the search.') : t('لم يُنشئ SHIPPEC أي شحنة DHL بعد.', 'SHIPPEC has not created any DHL shipment yet.')}
        </div>
      ) : (
        <ul className="space-y-3" data-testid="shipments-list">{rows.map((r) => <Row key={r.id} r={r} onChanged={() => setReload((n) => n + 1)} />)}</ul>
      )}
      {pages > 1 && (
        <nav className="flex items-center justify-center gap-2" aria-label={t('الصفحات', 'Pages')}>
          <Button variant="secondary" disabled={f.page <= 1} onClick={() => set({ page: f.page - 1 })} aria-label={t('السابقة', 'Previous')}><PrevIcon size={16} /></Button>
          <span className="text-sm font-bold">{f.page} / {pages}</span>
          <Button variant="secondary" disabled={f.page >= pages} onClick={() => set({ page: f.page + 1 })} aria-label={t('التالية', 'Next')}><NextIcon size={16} /></Button>
        </nav>
      )}
    </div>
  );
}
