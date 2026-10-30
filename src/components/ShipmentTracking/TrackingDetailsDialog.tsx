import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import {
  AlertTriangle, Clock, Copy, ExternalLink, Loader2, MapPin, Package, PenLine, RefreshCw, ShieldAlert, X,
} from 'lucide-react';
import { Dialog } from '../shared/Dialog';
import { ApiError } from '../../utils/apiClient';
import { useRealtimeRefresh } from '../../hooks/useRealtimeRefresh';
import { shipmentTrackingService, type TrackingDetails, type TrackingEvent } from '../../services/shipmentTracking.service';
import {
  JOURNEY_STEPS, TRACKING_EVENTS, describeTrackingError, formatAwb, formatEstimated, formatLocal, formatRiyadh, formatYmd,
  journeyStage, needsAction, placeLabel, statusBadge, syncProblemText, timeAgo,
} from './trackingUtils';

type Props = {
  awb: string | null;
  onClose: () => void;
  canRefresh: boolean;
  /** The list should re-read after a manual refresh. */
  onRefreshed?: () => void;
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="min-w-0">
    <div className="text-[10px] font-bold text-slate-400">{label}</div>
    <div className="text-sm font-bold text-slate-800 dark:text-slate-100 break-words">{children}</div>
  </div>
);

function EventRow({ e, first }: { e: TrackingEvent; first: boolean }) {
  const badge = statusBadge(e.normalized_status);
  const local = e.event_date && e.event_time ? formatLocal(`${e.event_date} ${e.event_time}`, e.gmt_offset) : null;
  const attention = e.normalized_status === 'EXCEPTION' || e.normalized_status === 'ON_HOLD';
  return (
    <li className="relative ps-7 pb-5 last:pb-0" data-event-code={e.raw_status ?? ''}>
      <span className="absolute start-[7px] top-2 bottom-0 w-px bg-slate-200 dark:bg-slate-700" aria-hidden="true" />
      <span className={`absolute start-0 top-1 w-[15px] h-[15px] rounded-full ring-4 ring-white dark:ring-slate-800 ${first ? badge.dot : 'bg-slate-300 dark:bg-slate-600'}`} aria-hidden="true" />
      <div className={`rounded-2xl border p-3 min-w-0 ${attention ? 'border-red-100 bg-red-50/50 dark:border-red-900/40 dark:bg-red-900/10' : 'border-slate-100 dark:border-slate-700'}`}>
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <span className="text-sm font-extrabold text-slate-900 dark:text-white break-words" dir="ltr">{e.description || '—'}</span>
          <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black border ${badge.cls}`}>
            {badge.label}{e.raw_status ? <span className="font-mono opacity-70"> · {e.raw_status}</span> : null}
          </span>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1"><MapPin size={12} /> <span dir="ltr">{e.location || placeLabel(null, e.city, e.country_code)}</span></span>
          {local && (
            <span className="flex items-center gap-1 tabular-nums">
              <Clock size={12} /> {local.date} · {local.time}{local.offset ? <span className="opacity-70" dir="ltr"> ({local.offset})</span> : null}
            </span>
          )}
          {e.signed_by && <span className="flex items-center gap-1"><PenLine size={12} /> المستلم: <span dir="ltr">{e.signed_by}</span></span>}
        </div>
        {(e.remark || e.next_steps) && (
          <div className="mt-2 space-y-1 text-[11px] leading-relaxed" dir="ltr">
            {e.remark && <p className="text-slate-700 dark:text-slate-200 font-semibold">{e.remark}</p>}
            {e.next_steps && <p className="text-slate-500 dark:text-slate-400">{e.next_steps}</p>}
          </div>
        )}
      </div>
    </li>
  );
}

export const TrackingDetailsDialog: React.FC<Props> = ({ awb, onClose, canRefresh, onRefreshed }) => {
  const headingId = useId();
  const [data, setData] = useState<TrackingDetails | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  // A different AWB was opened: start from a clean slate (adjusted during render, not in an effect).
  const [shownAwb, setShownAwb] = useState<string | null>(null);
  if (awb !== shownAwb) {
    setShownAwb(awb);
    setData(null);
    setRefreshError(null);
    setPhase('loading');
  }
  const seq = useRef(0);
  const awbRef = useRef(awb);
  useLayoutEffect(() => {
    awbRef.current = awb;
  }, [awb]);

  const load = useCallback(async (mode: 'replace' | 'background') => {
    const current = awbRef.current;
    if (!current) return;
    const n = ++seq.current;
    try {
      const d = await shipmentTrackingService.details(current);
      if (n !== seq.current) return;
      setData(d);
      setPhase('ready');
      setError(null);
    } catch (err) {
      if (n !== seq.current) return;
      setError(describeTrackingError(err, 'تعذر تحميل بيانات الشحنة'));
      if (mode === 'replace') setPhase('error');
    }
  }, []);

  useEffect(() => {
    if (awb) void load('replace');
  }, [awb, load]);

  // "منذ 8 دقائق" stays true while the window is open; cooldown countdown.
  useEffect(() => {
    if (!awb) return;
    const t = window.setInterval(() => setNow(Date.now()), cooldownUntil > Date.now() ? 1000 : 30_000);
    return () => window.clearInterval(t);
  }, [awb, cooldownUntil]);

  useRealtimeRefresh(TRACKING_EVENTS, (batch) => {
    const mine = batch.some(({ event, payload }) => event === 'resync' || ((payload as { awbs?: string[] })?.awbs ?? []).includes(awbRef.current ?? ''));
    if (awbRef.current && mine && !refreshing) void load('background');
  }, 400);

  const refresh = async () => {
    if (!awb || refreshing || cooldownUntil > Date.now()) return;
    setRefreshing(true);
    setRefreshError(null);
    try {
      const r = await shipmentTrackingService.refresh(awb);
      setData(r.record);
      setPhase('ready');
      setNow(Date.now());
      setCooldownUntil(Date.now() + (r.record.refresh_cooldown_seconds ?? 60) * 1000);
      toast.success(r.outcome === 'not_found' ? 'لا تتوفر بيانات لدى DHL لهذه البوليصة حتى الآن' : 'تم تحديث حالة الشحنة من DHL');
      onRefreshed?.();
    } catch (err) {
      // The old data stays on screen; only the error is shown.
      setRefreshError(describeTrackingError(err, 'تعذر التحديث مؤقتًا'));
      // Cooldown / per-user limit: keep the button disabled for the server's window.
      if (err instanceof ApiError && err.status === 429) {
        setNow(Date.now());
        setCooldownUntil(Date.now() + 60_000);
      }
      void load('background');
    } finally {
      setRefreshing(false);
    }
  };

  const copyAwb = () => {
    if (!data) return;
    void navigator.clipboard?.writeText(data.awb).then(() => toast.success('تم نسخ رقم البوليصة'), () => undefined);
  };

  const d = data;
  const badge = statusBadge(d?.normalized_status ?? null);
  const stage = d ? journeyStage(d) : 0;
  const cooldownLeft = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));
  const lastEvent = d ? formatLocal(d.last_event_local, d.last_event_gmt_offset) : null;
  const delivered = d ? formatLocal(d.delivered_local, d.delivered_gmt_offset) : null;
  const problem = d ? syncProblemText(d) : null;

  return (
    <Dialog open={awb !== null} onRequestClose={onClose} labelledBy={headingId} panelClassName="sm:max-w-3xl max-h-[94dvh]">
      <div className="flex items-start justify-between gap-3 px-5 sm:px-6 pt-5 pb-4 border-b border-slate-100 dark:border-slate-700">
        <div className="min-w-0">
          <div className="text-[10px] font-bold text-slate-400">رقم البوليصة AWB · DHL Express</div>
          <h2 id={headingId} className="font-mono text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2" dir="ltr">
            {awb ? formatAwb(awb) : ''}
            {d && (
              <button type="button" onClick={copyAwb} aria-label="نسخ رقم البوليصة" className="p-1 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-700">
                <Copy size={16} />
              </button>
            )}
          </h2>
          {d && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className={`px-3 py-1 rounded-xl text-xs font-black border ${badge.cls}`}>{badge.label}</span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                آخر تحديث: <span className="font-bold">{timeAgo(d.last_synced_at)}</span>
              </span>
            </div>
          )}
        </div>
        <button type="button" onClick={onClose} aria-label="إغلاق" className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 shrink-0">
          <X size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain px-5 sm:px-6 py-5 space-y-5">
        {phase === 'loading' && !d ? (
          <div className="space-y-3 animate-pulse" role="status" aria-label="جاري تحميل بيانات الشحنة">
            <div className="h-16 rounded-2xl bg-slate-100 dark:bg-slate-700/60" />
            <div className="h-24 rounded-2xl bg-slate-100 dark:bg-slate-700/60" />
            <div className="h-40 rounded-2xl bg-slate-100 dark:bg-slate-700/60" />
          </div>
        ) : phase === 'error' && !d ? (
          <div className="flex flex-col items-center text-center py-10" role="alert">
            <AlertTriangle size={36} className="text-red-500 mb-2" />
            <p className="font-bold text-slate-800 dark:text-slate-100">{error}</p>
            <button type="button" onClick={() => { setPhase('loading'); void load('replace'); }} className="mt-3 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold">إعادة المحاولة</button>
          </div>
        ) : d ? (
          <>
            {/* Refresh + last sync */}
            <div className="flex flex-wrap items-center gap-3 justify-between rounded-2xl bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-700 p-3">
              <div className="text-xs text-slate-600 dark:text-slate-300 space-y-0.5 min-w-0">
                {d.last_synced_at ? (
                  <div>آخر تحديث: <span className="font-bold">{timeAgo(d.last_synced_at)}</span> <span className="tabular-nums text-slate-400">({formatRiyadh(d.last_synced_at)})</span></div>
                ) : (
                  <div className="font-bold">لم تتم مزامنة بيانات DHL بعد</div>
                )}
                {(problem || refreshError) && (
                  <div className="text-amber-700 dark:text-amber-400 font-semibold" role="status">
                    {refreshError || problem}
                    {d.last_synced_at && <> — آخر بيانات ناجحة: <span className="tabular-nums">{formatRiyadh(d.last_synced_at, false)}</span></>}
                  </div>
                )}
              </div>
              {canRefresh && (
                <button
                  type="button"
                  onClick={() => void refresh()}
                  disabled={refreshing || cooldownLeft > 0}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold shadow-sm"
                >
                  {refreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                  {refreshing ? 'جاري التحديث…' : cooldownLeft > 0 ? `تحديث الحالة (${cooldownLeft})` : 'تحديث الحالة'}
                </button>
              )}
            </div>

            {/* Alerts */}
            {needsAction(d) && (
              <div className="flex gap-3 rounded-2xl border border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-900/20 p-4" role="alert">
                <ShieldAlert className="text-red-600 shrink-0" size={22} />
                <div className="min-w-0">
                  <div className="font-extrabold text-red-800 dark:text-red-300">⚠ يوجد إجراء مطلوب</div>
                  <p className="text-sm text-red-700 dark:text-red-300/90 mt-0.5 break-words" dir="ltr">{d.current_description}</p>
                </div>
              </div>
            )}
            {d.normalized_status === 'DELIVERED' && (
              <div className="rounded-2xl border border-green-200 bg-green-50 dark:border-green-900/50 dark:bg-green-900/20 p-4">
                <div className="font-extrabold text-green-800 dark:text-green-300 text-lg">✓ تم التسليم</div>
                <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Field label="تاريخ التسليم"><span className="tabular-nums">{delivered?.date ?? formatRiyadh(d.delivered_at)}</span></Field>
                  <Field label="وقت التسليم"><span className="tabular-nums">{delivered ? `${delivered.time}${delivered.offset ? ` (${delivered.offset})` : ''}` : '—'}</span></Field>
                  <Field label="مكان التسليم"><span dir="ltr">{d.delivered_location || '—'}</span></Field>
                  <Field label="المستلم (POD)"><span dir="ltr">{d.delivered_signed_by || 'غير متاح من DHL'}</span></Field>
                </div>
              </div>
            )}
            {!d.last_synced_at && (
              <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-600 p-4 text-sm text-slate-600 dark:text-slate-300">
                لم تتم مزامنة بيانات DHL بعد — ستظهر الحالة بعد أول مزامنة{canRefresh ? '، أو اضغط «تحديث الحالة».' : '.'}
              </div>
            )}

            {/* Journey */}
            <div aria-label="مراحل رحلة الشحنة">
              <ol className="grid grid-cols-5 gap-1">
                {JOURNEY_STEPS.map((label, i) => {
                  const done = d.last_synced_at ? i <= stage : false;
                  const current = d.last_synced_at && i === stage;
                  return (
                    <li key={label} className="flex flex-col items-center text-center min-w-0" aria-current={current ? 'step' : undefined}>
                      <div className={`h-1.5 w-full rounded-full ${done ? (needsAction(d) && current ? 'bg-red-500' : 'bg-indigo-500') : 'bg-slate-200 dark:bg-slate-700'}`} />
                      <span className={`mt-1.5 text-[10px] sm:text-[11px] font-bold leading-tight ${current ? 'text-indigo-700 dark:text-indigo-300' : done ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400'}`}>{label}</span>
                    </li>
                  );
                })}
              </ol>
              <p className="mt-2 text-[10px] text-slate-400">المراحل محسوبة من نقاط تتبع DHL، وليست موقعًا مباشرًا (GPS).</p>
            </div>

            {/* Shipment facts */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 rounded-2xl border border-slate-100 dark:border-slate-700 p-4">
              <Field label="العميل">{d.customer_name || '—'}</Field>
              <Field label="رقم الفاتورة">
                {d.invoice_id ? (
                  <Link to={`/invoices?invoice=${d.invoice_id}`} className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 hover:underline" onClick={onClose}>
                    {d.invoice_number} <ExternalLink size={12} />
                  </Link>
                ) : '—'}
              </Field>
              <Field label="تاريخ الحجز"><span className="tabular-nums">{formatYmd(d.booking_date)}</span></Field>
              <Field label="المنشأ"><span dir="auto">{placeLabel(d.origin, d.origin_city, d.origin_country_code)}</span></Field>
              <Field label="الوجهة"><span dir="auto">{d.destination || d.destination_country_code ? placeLabel(d.destination, d.destination_city, d.destination_country_code) : d.invoice_destination || '—'}</span></Field>
              <Field label="الموقع الحالي"><span dir="ltr">{d.current_location || '—'}</span></Field>
              <Field label="آخر حدث"><span dir="ltr">{d.current_description || '—'}</span></Field>
              <Field label="وقت آخر حدث"><span className="tabular-nums">{lastEvent ? `${lastEvent.date} · ${lastEvent.time}` : '—'}</span></Field>
              <Field label="التسليم المتوقع"><span className="tabular-nums">{formatEstimated(d.estimated_delivery)}</span></Field>
              {d.shipment_description && <Field label="وصف الشحنة لدى DHL"><span dir="ltr">{d.shipment_description}</span></Field>}
              {(d.number_of_pieces || d.total_weight) && (
                <Field label="القطع / الوزن">
                  <span className="tabular-nums">{d.number_of_pieces ?? '—'} · {d.total_weight ?? '—'} {d.weight_unit === 'metric' ? 'كغ' : d.weight_unit ?? ''}</span>
                </Field>
              )}
              {d.product_code && <Field label="خدمة DHL"><span className="font-mono">{d.product_code}</span></Field>}
            </div>

            {/* Timeline */}
            <section aria-labelledby={`${headingId}-tl`}>
              <h3 id={`${headingId}-tl`} className="text-sm font-extrabold text-slate-900 dark:text-white mb-3">رحلة الشحنة كاملة ({d.events.length})</h3>
              {d.events.length ? (
                <ol>{d.events.map((e, i) => <EventRow key={e.id} e={e} first={i === 0} />)}</ol>
              ) : (
                <p className="text-sm text-slate-500">{d.last_synced_at ? 'لا توجد نقاط تتبع من DHL بعد.' : 'لم تتم مزامنة بيانات DHL بعد.'}</p>
              )}
            </section>

            {/* Pieces */}
            {d.pieces.length > 0 && (
              <section>
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-white mb-2 flex items-center gap-1.5"><Package size={16} /> القطع ({d.pieces.length})</h3>
                <ul className="space-y-2">
                  {d.pieces.map((p, i) => (
                    <li key={p.trackingNumber ?? i} className="rounded-xl border border-slate-100 dark:border-slate-700 p-3 text-xs text-slate-600 dark:text-slate-300 flex flex-wrap gap-x-4 gap-y-1">
                      <span className="font-bold">قطعة {p.number ?? i + 1}</span>
                      {p.trackingNumber && <span className="font-mono break-all" dir="ltr">{p.trackingNumber}</span>}
                      {p.weight != null && <span>الوزن: <span className="tabular-nums">{p.weight}</span></span>}
                      {p.dimensions && <span className="tabular-nums" dir="ltr">{[p.dimensions.length, p.dimensions.width, p.dimensions.height].filter((x) => x != null).join(' × ')} cm</span>}
                      {p.lastEvent && <span dir="ltr">{p.lastEvent.description} · {p.lastEvent.location}</span>}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        ) : null}
      </div>
    </Dialog>
  );
};
