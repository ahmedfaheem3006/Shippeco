/**
 * Admin-only, one-line view of the DHL synchronization: how many invoice AWBs
 * are registered and synced, the initial backfill's progress, and what
 * blocks it. Read from the SHIPPEC Backend only (PostgreSQL) — the DHL calls
 * are made by the Backend's background worker, never by this page, and the
 * page stays fully usable while a backfill runs.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Pause, Play, ScanSearch } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { shipmentTrackingService, type TrackingSyncStatus } from '../../services/shipmentTracking.service';
import { describeApiError } from '../../utils/apiErrors';
import { timeAgo } from './trackingUtils';

const n = (v: number | null | undefined) => new Intl.NumberFormat('en-US').format(v ?? 0);

export const BLOCKED_TEXT: Record<NonNullable<TrackingSyncStatus['blocked_by']>, string> = {
  not_configured: 'ربط DHL غير مهيأ على الخادم',
  tracking_disabled: 'تحديث التتبع من DHL غير مفعّل على الخادم',
  sync_disabled: 'المزامنة التلقائية متوقفة على الخادم',
  paused: 'المزامنة متوقفة مؤقتًا بعد رد من DHL — تُستأنف تلقائيًا',
};
const RUN_TEXT: Record<string, string> = { running: 'قيد التشغيل', paused: 'موقوفة مؤقتًا', completed: 'اكتملت', cancelled: 'أُلغيت' };

/** "تم تسجيل 12,840 من 14,271 بوليصة — تمت مزامنة 8,300" */
export function syncHeadline(s: Pick<TrackingSyncStatus, 'registration'>): string {
  const r = s.registration;
  return `تم تسجيل ${n(r.registered_from_invoices)} من ${n(r.invoice_awbs)} بوليصة — تمت مزامنة ${n(r.synced)}`;
}

export const TrackingSyncStatusBar: React.FC<{ refreshKey?: number }> = ({ refreshKey = 0 }) => {
  const [st, setSt] = useState<TrackingSyncStatus | null>(null);
  const [busy, setBusy] = useState<null | 'discover' | 'start' | 'pause'>(null);
  const load = useCallback(() => shipmentTrackingService.syncStatus().then(setSt, () => undefined), []);
  useEffect(() => { void load(); }, [load, refreshKey]);
  const running = st?.run?.status === 'running';
  useEffect(() => {
    if (!running) return undefined;
    const t = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(t);
  }, [running, load]);
  if (!st) return null;

  const run = st.run;
  const reg = st.registration;
  const open = run && (run.status === 'running' || run.status === 'paused');
  const remaining = open ? run.remaining : reg.waiting_first_sync;
  const pct = run && run.discovered ? Math.min(100, Math.round((run.processed / run.discovered) * 100)) : 0;

  const act = async (kind: 'discover' | 'start' | 'pause') => {
    if (kind === 'start' && !open && !window.confirm('بدء المزامنة الأولية: يسأل الخادم DHL عن كل بوالص الفواتير التي لم تُزامن بعد، على دفعات في الخلفية. متابعة؟')) return;
    setBusy(kind);
    try {
      if (kind === 'discover') {
        const r = await shipmentTrackingService.discoverInvoices();
        toast.success(`فُحصت ${n(r.invoices_scanned)} فاتورة — ${n(r.valid_awbs)} بوليصة DHL، ${n(r.tracking_rows_created)} جديدة`);
      } else if (kind === 'start') {
        const r = await shipmentTrackingService.startBackfill();
        toast.success(r.resumed ? 'تم استئناف المزامنة الأولية' : r.created ? 'بدأت المزامنة الأولية في الخلفية' : 'المزامنة الأولية تعمل بالفعل');
      } else {
        await shipmentTrackingService.pauseBackfill();
        toast.success('أُوقفت المزامنة الأولية مؤقتًا');
      }
      await load();
    } catch (err) {
      toast.error(describeApiError(err, 'تعذر تنفيذ الطلب'));
    } finally {
      setBusy(null);
    }
  };

  const btn = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-bold disabled:opacity-50 min-h-[36px]';
  return (
    <section aria-label="حالة مزامنة DHL" data-testid="tracking-sync-status"
      className="rounded-2xl border border-indigo-100 dark:border-indigo-900/40 bg-indigo-50/40 dark:bg-indigo-900/10 px-4 py-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs sm:text-sm font-extrabold text-slate-800 dark:text-slate-100 tabular-nums" role="status">{syncHeadline(st)}</p>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => void act('discover')} disabled={!!busy}
            className={`${btn} border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800`}>
            {busy === 'discover' ? <Loader2 size={13} className="animate-spin" /> : <ScanSearch size={13} />} فحص الفواتير
          </button>
          {running ? (
            <button type="button" onClick={() => void act('pause')} disabled={!!busy}
              className={`${btn} border-amber-200 text-amber-700 bg-white dark:bg-slate-800`}>
              {busy === 'pause' ? <Loader2 size={13} className="animate-spin" /> : <Pause size={13} />} إيقاف مؤقت
            </button>
          ) : (
            <button type="button" onClick={() => void act('start')} disabled={!!busy || st.blocked_by === 'not_configured'}
              className={`${btn} border-indigo-200 text-indigo-700 bg-white dark:bg-slate-800`}>
              {busy === 'start' ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />} {run?.status === 'paused' ? 'استئناف المزامنة' : 'بدء المزامنة الأولية'}
            </button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
        <span>آخر مزامنة ناجحة: <span className="font-bold">{st.last_successful_sync_at ? timeAgo(st.last_successful_sync_at) : '—'}</span></span>
        <span>المتبقي: <span className="font-bold">{n(remaining)}</span></span>
        {reg.not_found > 0 && <span>لا بيانات لدى DHL: <span className="font-bold">{n(reg.not_found)}</span></span>}
        {st.today && <span>طلبات DHL اليوم: <span className="font-bold">{n(st.today.api_calls)}</span> / {n(st.daily_call_limit)} ({n(st.today.awbs_requested)} بوليصة)</span>}
        {run && <span>المزامنة الأولية: <span className="font-bold">{RUN_TEXT[run.status] ?? run.status}</span>{open ? ` · ${n(run.processed)} من ${n(run.discovered)}` : ''}</span>}
      </div>
      {open && (
        <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="تقدم المزامنة الأولية">
          <div className="h-full bg-indigo-500" style={{ width: `${pct}%` }} />
        </div>
      )}
      {st.blocked_by && (open || st.blocked_by !== 'sync_disabled') && (
        <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">{BLOCKED_TEXT[st.blocked_by]}{open ? ' — المزامنة الأولية تنتظر' : ''}</p>
      )}
    </section>
  );
};
