/**
 * /shipment-tracking/:awb — SHIPPEC's own view of DHL's tracking result:
 * summary, journey, timeline, pieces, and the SHIPPEC side (invoice, DHL
 * shipment created in SHIPPEC, pickup, documents). Data from the SHIPPEC
 * Backend only.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { AlertTriangle, ArrowRight, Copy, Download, ExternalLink, FileText, Loader2, Package, PackageSearch, RefreshCw, Search, ShieldAlert, Truck } from 'lucide-react';
import { useAuthStore } from '../hooks/useAuthStore';
import { useRealtimeRefresh } from '../hooks/useRealtimeRefresh';
import { ApiError } from '../utils/apiClient';
import { downloadBlob } from '../utils/download';
import { describeApiError } from '../utils/apiErrors';
import { shipmentTrackingService, type TrackingDetails } from '../services/shipmentTracking.service';
import { dhlShipmentService, type DhlShipment, type PickupRecord } from '../services/dhlShipment.service';
import { EventRow, Field, Freshness, Journey } from '../components/ShipmentTracking/TrackingParts';
import {
  TRACKING_EVENTS, canRefreshTracking, describeTrackingError, formatAwb, formatEstimated, formatLocal, formatRiyadh, formatYmd,
  isDhlAwb, needsAction, normalizeAwb, placeLabel, statusBadge, syncProblemText, timeAgo,
} from '../components/ShipmentTracking/trackingUtils';
import { canShipment } from '../utils/dhlShipmentPermissions';

const DOC_LABEL: Record<string, string> = { shipping_label: 'ملصق الشحن', waybill: 'بوليصة الشحن', commercial_invoice: 'الفاتورة التجارية', proforma_invoice: 'الفاتورة المبدئية', other: 'مستند DHL' };

export const ShipmentTrackingDetailsPage: React.FC = () => {
  const { awb: raw = '' } = useParams();
  const awb = normalizeAwb(raw);
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.user?.role);
  const canRefresh = canRefreshTracking(role);
  const [d, setD] = useState<TrackingDetails | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [shipment, setShipment] = useState<DhlShipment | null>(null);
  const [pickup, setPickup] = useState<PickupRecord | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async (mode: 'replace' | 'background') => {
    const n = ++seq.current;
    try {
      const r = await shipmentTrackingService.details(awb);
      if (n !== seq.current) return;
      setD(r);
      setPhase('ready');
      setError(null);
    } catch (err) {
      if (n !== seq.current) return;
      if (err instanceof ApiError && err.status === 404) { if (mode === 'replace') setPhase('missing'); return; }
      setError(describeTrackingError(err, 'تعذر تحميل بيانات الشحنة'));
      if (mode === 'replace') setPhase('error');
    }
  }, [awb]);

  useEffect(() => {
    if (!isDhlAwb(awb)) { setPhase('error'); setError('رقم البوليصة غير صالح — رقم DHL من 10 أرقام'); return; }
    void load('replace');
  }, [awb, load]);
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), cooldownUntil > Date.now() ? 1000 : 30_000);
    return () => window.clearInterval(t);
  }, [cooldownUntil]);
  useRealtimeRefresh(TRACKING_EVENTS, (batch) => {
    const mine = batch.some(({ event, payload }) => event === 'resync' || ((payload as { awbs?: string[] })?.awbs ?? []).includes(awb));
    if (mine && !refreshing) void load('background');
  }, 400);

  // The SHIPPEC side: the DHL shipment created in SHIPPEC (product, pickup, documents).
  const shipmentId = d?.dhl_shipment_id ?? null;
  useEffect(() => {
    if (!shipmentId || !canShipment(role, 'view')) { setShipment(null); return; }
    let alive = true;
    dhlShipmentService.get(shipmentId).then((s) => {
      if (!alive) return;
      setShipment(s);
      if (s.pickup_id) dhlShipmentService.getPickup(s.pickup_id).then((p) => alive && setPickup(p), () => undefined);
    }, () => undefined);
    return () => { alive = false; };
  }, [shipmentId, role]);

  const refresh = async () => {
    if (refreshing || cooldownUntil > Date.now()) return;
    setRefreshing(true);
    setRefreshError(null);
    try {
      const r = await shipmentTrackingService.refresh(awb);
      setD(r.record);
      setNow(Date.now());
      setCooldownUntil(Date.now() + (r.record.refresh_cooldown_seconds ?? 60) * 1000);
      toast.success(r.outcome === 'not_found' ? 'لا تتوفر بيانات لدى DHL لهذه البوليصة حتى الآن' : 'تم تحديث حالة الشحنة من DHL');
    } catch (err) {
      setRefreshError(describeTrackingError(err, 'تعذر التحديث مؤقتًا'));
      if (err instanceof ApiError && err.status === 429) { setNow(Date.now()); setCooldownUntil(Date.now() + 60_000); }
    } finally {
      setRefreshing(false);
    }
  };

  const lookup = async () => {
    setLookingUp(true);
    try {
      const r = await shipmentTrackingService.lookup(awb);
      if (r.record) { setD(r.record); setPhase('ready'); toast.success(r.result === 'remote' ? 'تم العثور على الشحنة لدى DHL وإضافتها للمتابعة' : 'تم'); }
      else setError(r.result === 'not_found' ? 'لا توجد بيانات لدى DHL لهذه البوليصة' : 'البحث لدى DHL غير متاح لدورك');
    } catch (err) {
      setError(describeLookupError(err));
    } finally {
      setLookingUp(false);
    }
  };

  const back = (
    <button type="button" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/shipment-tracking'))} className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-indigo-600">
      <ArrowRight size={14} /> متابعة البوليصة
    </button>
  );

  if (phase === 'loading') {
    return <div className="space-y-4" dir="rtl" role="status" aria-label="جاري تحميل بيانات الشحنة">{back}<div className="h-40 rounded-3xl bg-slate-100 dark:bg-slate-700/60 animate-pulse" /><div className="h-80 rounded-3xl bg-slate-100 dark:bg-slate-700/60 animate-pulse" /></div>;
  }
  if (phase === 'missing' || (phase === 'error' && !d)) {
    return (
      <div className="space-y-4" dir="rtl">
        {back}
        <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 p-8 sm:p-12 flex flex-col items-center text-center" role={phase === 'error' ? 'alert' : undefined}>
          <PackageSearch size={44} className="text-slate-300 mb-3" />
          <h1 className="text-lg font-extrabold text-slate-900 dark:text-white font-mono" dir="ltr">{formatAwb(awb)}</h1>
          <p className="text-sm text-slate-500 mt-1">{phase === 'missing' ? 'هذه البوليصة غير مسجلة في SHIPPEC بعد.' : error}</p>
          {phase === 'missing' && canRefresh && (
            <button type="button" onClick={() => void lookup()} disabled={lookingUp} className="mt-4 inline-flex items-center gap-1.5 px-5 py-2.5 rounded-2xl bg-indigo-600 text-white font-bold text-sm disabled:opacity-50">
              {lookingUp ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />} البحث لدى DHL
            </button>
          )}
          {phase === 'missing' && error && <p className="mt-3 text-sm font-bold text-amber-700">{error}</p>}
        </div>
      </div>
    );
  }
  if (!d) return null;

  const badge = statusBadge(d.normalized_status);
  const lastEvent = formatLocal(d.last_event_local, d.last_event_gmt_offset);
  const delivered = formatLocal(d.delivered_local, d.delivered_gmt_offset);
  const picked = formatLocal(d.pickup_local, d.pickup_gmt_offset);
  const problem = syncProblemText(d);
  const cooldownLeft = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));
  const latest = d.events[0];

  return (
    <div className="space-y-4 sm:space-y-5 min-w-0" dir="rtl">
      {back}
      <header className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm p-4 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-bold text-slate-400">رقم البوليصة AWB · DHL Express</div>
            <h1 className="font-mono text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2" dir="ltr">
              {formatAwb(d.awb)}
              <button type="button" onClick={() => void navigator.clipboard?.writeText(d.awb).then(() => toast.success('تم نسخ رقم البوليصة'))} aria-label="نسخ رقم البوليصة" className="p-1 rounded-lg text-slate-400 hover:text-indigo-600"><Copy size={16} /></button>
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className={`px-3 py-1 rounded-xl text-xs font-black border ${badge.cls}`}>{badge.label}</span>
              <Freshness t={d} />
            </div>
          </div>
          {canRefresh && (
            <button type="button" onClick={() => void refresh()} disabled={refreshing || cooldownLeft > 0}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold min-h-[44px]">
              {refreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              {refreshing ? 'جاري التحديث…' : cooldownLeft > 0 ? `تحديث الحالة (${cooldownLeft})` : 'تحديث الحالة من DHL'}
            </button>
          )}
        </div>
        {(problem || refreshError) && <p className="text-xs font-semibold text-amber-700 dark:text-amber-400" role="status">{refreshError || problem}</p>}
        {needsAction(d) && (
          <div className="flex gap-3 rounded-2xl border border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-900/20 p-4" role="alert">
            <ShieldAlert className="text-red-600 shrink-0" size={22} />
            <div className="min-w-0"><div className="font-extrabold text-red-800 dark:text-red-300">يوجد إجراء مطلوب</div><p className="text-sm text-red-700 mt-0.5" dir="ltr">{d.current_description}</p></div>
          </div>
        )}
        <Journey d={d} />
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-5">
        <div className="xl:col-span-2 space-y-4 sm:space-y-5 min-w-0">
          <section className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm p-4 sm:p-6">
            <h2 className="text-sm font-extrabold text-slate-900 dark:text-white mb-4">ملخص الشحنة</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <Field label="المنشأ"><span dir="auto">{placeLabel(d.origin, d.origin_city, d.origin_country_code)}</span></Field>
              <Field label="الوجهة"><span dir="auto">{d.destination || d.destination_country_code ? placeLabel(d.destination, d.destination_city, d.destination_country_code) : d.invoice_destination || '—'}</span></Field>
              <Field label="تاريخ الشحنة لدى DHL"><span className="tabular-nums">{d.shipment_timestamp ? d.shipment_timestamp.replace('T', ' ').slice(0, 16) : '—'}</span></Field>
              <Field label="الاستلام من DHL"><span className="tabular-nums">{picked ? `${picked.date} · ${picked.time}` : !d.normalized_status || d.normalized_status === 'PRE_TRANSIT' ? 'لم تستلمها DHL بعد' : 'غير متاح من DHL'}</span></Field>
              <Field label="التسليم المتوقع"><span className="tabular-nums">{d.normalized_status === 'DELIVERED' ? '—' : formatEstimated(d.estimated_delivery)}</span></Field>
              <Field label="التسليم الفعلي"><span className="tabular-nums">{delivered ? `${delivered.date} · ${delivered.time}` : d.delivered_at ? formatRiyadh(d.delivered_at) : '—'}</span></Field>
              <Field label="القطع / الوزن"><span className="tabular-nums">{d.number_of_pieces ?? '—'} · {d.total_weight ?? '—'} {d.weight_unit === 'metric' || d.weight_unit === 'kg' ? 'كغ' : d.weight_unit ?? ''}</span></Field>
              <Field label="خدمة DHL"><span dir="ltr">{shipment?.product_name ?? d.product_code ?? '—'}</span></Field>
              <Field label="آخر تحديث من DHL"><span className="tabular-nums">{d.last_synced_at ? `${timeAgo(d.last_synced_at)} (${formatRiyadh(d.last_synced_at)})` : 'لم تتم المزامنة'}</span></Field>
              <Field label="العميل">{d.customer_name || '—'}</Field>
              <Field label="فاتورة SHIPPEC">{d.invoice_id ? <Link to={`/invoices?invoice=${d.invoice_id}`} className="inline-flex items-center gap-1 text-indigo-600 hover:underline">{d.invoice_number} <ExternalLink size={12} /></Link> : '—'}</Field>
              <Field label="آخر حدث"><span className="tabular-nums">{lastEvent ? `${lastEvent.date} · ${lastEvent.time}` : '—'}</span></Field>
            </div>
          </section>

          <section className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm p-4 sm:p-6" aria-labelledby="timeline-h">
            <h2 id="timeline-h" className="text-sm font-extrabold text-slate-900 dark:text-white mb-4">رحلة الشحنة ({d.events.length})</h2>
            {d.events.length ? <ol>{d.events.map((e, i) => <EventRow key={e.id} e={e} first={i === 0} />)}</ol> : (
              <p className="text-sm text-slate-500">{d.last_synced_at ? 'لا توجد نقاط تتبع من DHL بعد.' : 'لم تتم مزامنة بيانات DHL بعد — تظهر الشحنة حتى قبل أن تستلمها DHL.'}</p>
            )}
          </section>
        </div>

        <aside className="space-y-4 sm:space-y-5 min-w-0">
          {d.normalized_status === 'DELIVERED' && (
            <section className="rounded-3xl border border-green-200 bg-green-50 dark:border-green-900/50 dark:bg-green-900/20 p-4 sm:p-5 space-y-3">
              <h2 className="font-extrabold text-green-800 dark:text-green-300">تم التسليم</h2>
              <Field label="مكان التسليم"><span dir="ltr">{d.delivered_location || '—'}</span></Field>
              <Field label="المستلم (POD)"><span dir="ltr">{d.delivered_signed_by || 'غير متاح من DHL'}</span></Field>
            </section>
          )}
          {(latest?.next_steps || latest?.remark) && (
            <section className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 p-4 sm:p-5">
              <h2 className="text-sm font-extrabold mb-2">الخطوة التالية</h2>
              <p className="text-xs text-slate-600 dark:text-slate-300" dir="ltr">{latest.next_steps || latest.remark}</p>
            </section>
          )}
          {shipment && (
            <section className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 p-4 sm:p-5 space-y-3">
              <h2 className="text-sm font-extrabold flex items-center gap-1.5"><Truck size={16} className="text-indigo-600" /> شحنة SHIPPEC</h2>
              <Field label="مرجع SHIPPEC"><span dir="ltr" className="font-mono text-xs">{shipment.shippec_reference}</span></Field>
              <Field label="الاستلام">{shipment.pickup_option === 'schedule' ? (pickup?.dispatch_confirmation_number ? <span dir="ltr" className="font-mono">{pickup.dispatch_confirmation_number} ({pickup.status === 'cancelled' ? 'ملغى' : pickup.pickup_date})</span> : 'مجدول') : shipment.pickup_option === 'drop_off' ? `نقطة خدمة: ${shipment.service_point_name ?? ''}` : 'بدون استلام'}</Field>
              {canShipment(role, 'download_documents') && shipment.documents.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[10px] font-bold text-slate-400">المستندات</div>
                  {shipment.documents.map((doc) => (
                    <button key={doc.id} type="button" className="w-full flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold hover:border-indigo-300 min-h-[44px]"
                      onClick={async () => { try { const { blob, filename } = await dhlShipmentService.downloadDocument(shipment.id, doc.id); downloadBlob(filename, blob); } catch (e) { toast.error(describeApiError(e, 'تعذر تنزيل المستند')); } }}>
                      <FileText size={14} /> {DOC_LABEL[doc.document_type] ?? doc.document_type} <Download size={14} className="ms-auto" />
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}
          {d.pieces.length > 0 && (
            <section className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 p-4 sm:p-5">
              <h2 className="text-sm font-extrabold mb-2 flex items-center gap-1.5"><Package size={16} /> القطع ({d.pieces.length})</h2>
              <ul className="space-y-2">
                {d.pieces.map((p, i) => (
                  <li key={p.trackingNumber ?? i} className="rounded-xl border border-slate-100 dark:border-slate-700 p-2.5 text-[11px] text-slate-600 dark:text-slate-300 space-y-0.5">
                    <div className="font-bold">قطعة {p.number ?? i + 1}{p.weight != null ? ` · ${p.weight} كغ` : ''}</div>
                    {p.trackingNumber && <div className="font-mono break-all" dir="ltr">{p.trackingNumber}</div>}
                    {p.lastEvent && <div dir="ltr">{p.lastEvent.description} · {p.lastEvent.location}</div>}
                  </li>
                ))}
              </ul>
            </section>
          )}
          <p className="text-[10px] text-slate-400 flex items-start gap-1"><AlertTriangle size={11} className="mt-0.5 shrink-0" /> بعض البيانات (المستلم، التوقيع) قد لا تتوفر من DHL لأسباب الخصوصية. تاريخ الحجز: {formatYmd(d.booking_date)}.</p>
        </aside>
      </div>
    </div>
  );
};

export function describeLookupError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'DHL_LOOKUP_DISABLED' || err.code === 'DHL_NOT_CONFIGURED') return 'البحث المباشر لدى DHL غير مفعّل حاليًا';
    if (err.status === 429) return 'طلبات بحث كثيرة خلال وقت قصير — انتظر قليلًا ثم أعد المحاولة';
    if (err.code === 'DHL_TIMEOUT' || err.status === 504) return 'لم تستجب DHL — أعد المحاولة بعد قليل';
    if (err.status === 503) return 'خدمة DHL غير متاحة الآن — أعد المحاولة لاحقًا';
  }
  return describeTrackingError(err, 'تعذر البحث لدى DHL');
}
