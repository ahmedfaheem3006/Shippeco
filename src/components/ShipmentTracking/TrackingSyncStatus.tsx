/**
 * Admin-only, one-line view of the DHL synchronization: how many invoice AWBs
 * are registered and synced, the initial backfill's progress, and what
 * blocks it. Read from the SHIPPEC Backend only (PostgreSQL) — the DHL calls
 * are made by the Backend's background worker, never by this page, and the
 * page stays fully usable while a backfill runs.
 *
 * A DHL refusal of a whole multi-AWB request is ONE "batch rejected" — never
 * N "not found" AWBs (only an AWB asked alone may be "not found"). Old false
 * results are repaired here (DB only); a ≤ 5-AWB verification runs before a
 * large backfill is resumed, with a small batch size.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, FlaskConical, Loader2, Pause, Play, RotateCcw, ScanSearch, Wrench } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { shipmentTrackingService, type TrackingQuota, type TrackingSyncStatus, type VerifyAwbResult } from '../../services/shipmentTracking.service';
import { describeApiError } from '../../utils/apiErrors';
import { timeAgo } from './trackingUtils';

const n = (v: number | null | undefined) => new Intl.NumberFormat('en-US').format(v ?? 0);

export const BLOCKED_TEXT: Record<NonNullable<TrackingSyncStatus['blocked_by']>, string> = {
  not_configured: 'ربط DHL غير مهيأ على الخادم',
  tracking_disabled: 'تحديث التتبع من DHL غير مفعّل على الخادم',
  sync_disabled: 'المزامنة التلقائية متوقفة على الخادم',
  paused: 'المزامنة متوقفة مؤقتًا بعد رد من DHL — تُستأنف تلقائيًا',
  rate_limited: 'DHL طلبت التمهّل (429) — كل طلبات التتبع متوقفة حتى الوقت الذي تسمح به DHL، ثم تُستأنف تلقائيًا',
  circuit_open: 'أخطاء متتالية من خوادم DHL — التتبع متوقف مؤقتًا ويُستأنف تلقائيًا',
  auth_stopped: 'رفضت DHL بيانات الربط (401/403) — المزامنة التلقائية متوقفة حتى يصحّح المسؤول الإعدادات ويستأنفها',
};

/** "2026-11-21T10:05:00Z" → "13:05" (Riyadh), for a pause end the same day. */
const clock = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Riyadh' }) : '—');

/** One line: the DHL quota as SHIPPEC has learnt it (adaptive mode: no SHIPPEC cap). */
function quotaLine(q: TrackingQuota): string[] {
  const parts = [
    q.mode === 'adaptive' ? 'الحصة: تكيّفية (بلا حد يومي من SHIPPEC — حدود DHL الفعلية تُحترم)' : `الحصة اليومية من SHIPPEC: ${n(q.daily_call_limit)}`,
    `فاصل الطلبات: ${(q.pacing.min_request_interval_ms / 1000).toLocaleString('en-US')} ث · طلب واحد في كل مرة${q.pacing.max_concurrency > 1 ? ` (حتى ${q.pacing.max_concurrency})` : ''}`,
  ];
  if (q.batch.backfill_effective_size) parts.push(`بوالص في كل طلب: ${n(q.batch.backfill_effective_size)}`);
  if (q.last_429_at) parts.push(`آخر 429: ${timeAgo(q.last_429_at)}${q.last_retry_after_seconds != null ? ` (Retry-After ${n(q.last_retry_after_seconds)} ث)` : ''} · إجمالي ${n(q.total_429)}`);
  if (q.state === 'paused' && q.paused_until) parts.push(`متوقف حتى ${clock(q.paused_until)}`);
  if (q.state === 'running' && q.last_resumed_at) parts.push(`استُؤنف ${timeAgo(q.last_resumed_at)}${q.resume_reason === 'admin' ? ' (المسؤول)' : ' (تلقائيًا)'}`);
  return parts;
}
const RUN_TEXT: Record<string, string> = { running: 'قيد التشغيل', paused: 'موقوفة مؤقتًا', completed: 'اكتملت', cancelled: 'أُلغيت' };
const PAUSE_TEXT: Record<string, string> = {
  admin: 'أوقفها المسؤول',
  budget_exhausted: 'نفدت حصة اليوم من طلبات DHL — تُستأنف تلقائيًا غدًا',
  repair: 'بعد الإصلاح — نفّذ تحققًا تجريبيًا ثم استأنف بدفعة صغيرة',
};
const VERIFY_RESULT_TEXT: Record<VerifyAwbResult['result'], string> = {
  success: 'نجحت',
  not_found: 'غير موجودة لدى DHL (طلب منفرد)',
  temporary_error: 'خطأ مؤقت',
  rejected: 'رفضتها DHL',
  skipped: 'لم تُرسل',
};

/** "تم تسجيل 12,840 من 14,271 بوليصة — تمت مزامنة 8,300" */
export function syncHeadline(s: Pick<TrackingSyncStatus, 'registration'>): string {
  const r = s.registration;
  return `تم تسجيل ${n(r.registered_from_invoices)} من ${n(r.invoice_awbs)} بوليصة — تمت مزامنة ${n(r.synced)}`;
}

/** "6606077671, 1234567890" / one per line → up to `max` entries (the Backend validates each). */
function parseAwbList(text: string, max = 5): string[] {
  return text.split(/[\s,،;]+/).map((x) => x.trim()).filter(Boolean).slice(0, max);
}

export const TrackingSyncStatusBar: React.FC<{ refreshKey?: number }> = ({ refreshKey = 0 }) => {
  const [st, setSt] = useState<TrackingSyncStatus | null>(null);
  const [busy, setBusy] = useState<null | 'discover' | 'start' | 'pause' | 'repair' | 'verify' | 'resume'>(null);
  const [batch, setBatch] = useState('');
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifyText, setVerifyText] = useState('');
  const [verifyOut, setVerifyOut] = useState<VerifyAwbResult[] | null>(null);
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
  const unverified = run?.unverified_not_found ?? 0;
  const verifyMax = st.verify_max_awbs ?? 5;
  const batchValue = batch.trim() ? Math.floor(Number(batch)) : undefined;
  const batchInvalid = batchValue !== undefined && (!Number.isFinite(batchValue) || batchValue < 1 || batchValue > st.bulk_batch_size);

  const act = async (kind: 'discover' | 'start' | 'pause' | 'repair' | 'resume') => {
    if (busy) return;
    if (kind === 'resume' && !window.confirm(st.quota?.state === 'stopped'
      ? 'استئناف مزامنة DHL بعد رفض بيانات الربط؟ تأكد أولًا من تصحيح بيانات MyDHL على الخادم.'
      : 'إنهاء التوقف المؤقت الآن؟ احترم وقت Retry-After من DHL ما أمكن.')) return;
    if (kind === 'start' && !open && !window.confirm('بدء المزامنة الأولية: يسأل الخادم DHL عن كل بوالص الفواتير التي لم تُزامن بعد، على دفعات في الخلفية. متابعة؟')) return;
    if (kind === 'repair' && !window.confirm('إعادة البوالص التي سُجلت «غير موجودة» بسبب رفض دفعة كاملة إلى قائمة الانتظار؟ لا يُحذف أي سجل أو حدث، ولا يُرسل أي طلب إلى DHL.')) return;
    if (kind === 'start' && batchInvalid) { toast.error(`حجم الدفعة من 1 إلى ${st.bulk_batch_size}`); return; }
    setBusy(kind);
    try {
      if (kind === 'discover') {
        const r = await shipmentTrackingService.discoverInvoices();
        toast.success(`فُحصت ${n(r.invoices_scanned)} فاتورة — ${n(r.valid_awbs)} بوليصة DHL، ${n(r.tracking_rows_created)} جديدة`);
      } else if (kind === 'start') {
        const r = await shipmentTrackingService.startBackfill(batchValue);
        toast.success(r.resumed ? 'تم استئناف المزامنة الأولية' : r.created ? 'بدأت المزامنة الأولية في الخلفية' : 'المزامنة الأولية تعمل بالفعل');
      } else if (kind === 'resume') {
        await shipmentTrackingService.resumeSync();
        toast.success('استُؤنفت مزامنة DHL');
      } else if (kind === 'repair') {
        const r = await shipmentTrackingService.repairFalseNotFound();
        toast.success(`أُعيدت ${n(r.repaired)} بوليصة إلى الانتظار — بقيت ${n(r.skipped_individual_not_found)} مؤكدة فرديًا`);
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

  const verify = async () => {
    if (busy) return;
    const awbs = parseAwbList(verifyText, verifyMax);
    if (!awbs.length) { toast.error('أدخل بوليصة واحدة على الأقل'); return; }
    setBusy('verify');
    try {
      const r = await shipmentTrackingService.verifyAwbs(awbs);
      setVerifyOut(r.results);
      toast.success(`تم التحقق — ${n(r.api_calls)} طلب DHL`);
      await load();
    } catch (err) {
      toast.error(describeApiError(err, 'تعذر التحقق'));
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
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={() => void act('discover')} disabled={!!busy}
            className={`${btn} border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800`}>
            {busy === 'discover' ? <Loader2 size={13} className="animate-spin" /> : <ScanSearch size={13} />} فحص الفواتير
          </button>
          <button type="button" onClick={() => setVerifyOpen((v) => !v)} disabled={!!busy || st.blocked_by === 'not_configured'} aria-expanded={verifyOpen}
            className={`${btn} border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800`}>
            <FlaskConical size={13} /> تحقق تجريبي
          </button>
          {st.quota && st.quota.state !== 'running' && (
            <button type="button" onClick={() => void act('resume')} disabled={!!busy} data-testid="quota-resume"
              className={`${btn} border-red-200 text-red-700 bg-white dark:bg-slate-800`}>
              {busy === 'resume' ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />} استئناف مزامنة DHL
            </button>
          )}
          {unverified > 0 && (
            <button type="button" onClick={() => void act('repair')} disabled={!!busy}
              className={`${btn} border-orange-200 text-orange-700 bg-white dark:bg-slate-800`}>
              {busy === 'repair' ? <Loader2 size={13} className="animate-spin" /> : <Wrench size={13} />} إصلاح «غير موجودة» الخاطئة
            </button>
          )}
          {running ? (
            <button type="button" onClick={() => void act('pause')} disabled={!!busy}
              className={`${btn} border-amber-200 text-amber-700 bg-white dark:bg-slate-800`}>
              {busy === 'pause' ? <Loader2 size={13} className="animate-spin" /> : <Pause size={13} />} إيقاف مؤقت
            </button>
          ) : (
            <>
              <label className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                <span>حجم الدفعة</span>
                <input type="number" inputMode="numeric" min={1} max={st.bulk_batch_size} value={batch} onChange={(e) => setBatch(e.target.value)}
                  placeholder={String(run?.status === 'paused' ? run.effective_batch_size ?? st.bulk_batch_size : st.bulk_batch_size)}
                  aria-label="عدد البوالص في كل طلب DHL" aria-invalid={batchInvalid || undefined}
                  className="w-16 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs tabular-nums" />
              </label>
              <button type="button" onClick={() => void act('start')} disabled={!!busy || st.blocked_by === 'not_configured'}
                className={`${btn} border-indigo-200 text-indigo-700 bg-white dark:bg-slate-800`}>
                {busy === 'start' ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />} {run?.status === 'paused' ? 'استئناف المزامنة' : 'بدء المزامنة الأولية'}
              </button>
            </>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
        <span>آخر مزامنة ناجحة: <span className="font-bold">{st.last_successful_sync_at ? timeAgo(st.last_successful_sync_at) : '—'}</span></span>
        <span>المتبقي: <span className="font-bold">{n(remaining)}</span></span>
        {reg.not_found > 0 && <span>لا بيانات لدى DHL: <span className="font-bold">{n(reg.not_found)}</span></span>}
        {st.today && <span>طلبات DHL اليوم: <span className="font-bold">{n(st.today.api_calls)}</span>{st.daily_call_limit > 0 ? ` / ${n(st.daily_call_limit)}` : ''} ({n(st.today.awbs_requested)} بوليصة)</span>}
        {run && <span>المزامنة الأولية: <span className="font-bold">{RUN_TEXT[run.status] ?? run.status}</span>{open ? ` · ${n(run.processed)} من ${n(run.discovered)}` : ''}</span>}
      </div>
      {run && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400 tabular-nums" data-testid="backfill-accounting">
          <span>طلبات DHL: <span className="font-bold">{n(run.api_calls)}</span></span>
          <span>بوالص أُرسلت: <span className="font-bold">{n(run.awb_attempted)}</span></span>
          <span>نجحت: <span className="font-bold">{n(run.awb_successful ?? run.successful)}</span></span>
          <span>غير موجودة (مؤكدة فرديًا): <span className="font-bold">{n(run.individually_verified_not_found)}</span></span>
          <span>دفعات رفضتها DHL: <span className="font-bold">{n(run.batch_rejected)}</span></span>
          <span>فشل مؤقت: <span className="font-bold">{n(run.temporary_failed ?? run.temporary_errors)}</span></span>
          <span>فشل دائم: <span className="font-bold">{n(run.permanent_failed ?? run.permanent_errors)}</span></span>
          {run.effective_batch_size != null && <span>حجم الدفعة الفعلي: <span className="font-bold">{n(run.effective_batch_size)}</span></span>}
        </div>
      )}
      {st.quota && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400 tabular-nums" data-testid="quota-status">
          {quotaLine(st.quota).map((x) => <span key={x}>{x}</span>)}
        </div>
      )}
      {open && (
        <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="تقدم المزامنة الأولية">
          <div className="h-full bg-indigo-500" style={{ width: `${pct}%` }} />
        </div>
      )}
      {run?.status === 'paused' && run.pause_reason && PAUSE_TEXT[run.pause_reason] && (
        <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">{PAUSE_TEXT[run.pause_reason]}</p>
      )}
      {unverified > 0 && (
        <p className="text-[11px] font-semibold text-orange-700 dark:text-orange-300" role="alert">
          {n(unverified)} بوليصة سُجلت «غير موجودة» من رد على دفعة كاملة — غير مؤكدة. استخدم «إصلاح» لإعادتها إلى الانتظار.
        </p>
      )}
      {st.blocked_by && (open || st.blocked_by !== 'sync_disabled') && (
        <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">{BLOCKED_TEXT[st.blocked_by]}{open ? ' — المزامنة الأولية تنتظر' : ''}</p>
      )}
      {verifyOpen && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 space-y-2" data-testid="verify-panel">
          <p className="text-[11px] text-slate-500">حتى {verifyMax} بوالص — طلب DHL منفصل لكل بوليصة (ليست المزامنة الكاملة، ولا تُنشأ شحنات).</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <textarea value={verifyText} onChange={(e) => setVerifyText(e.target.value)} rows={2} dir="ltr" aria-label="أرقام البوالص للتحقق"
              placeholder="6606077671, 1234567890"
              className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono" />
            <button type="button" onClick={() => void verify()} disabled={!!busy}
              className={`${btn} border-indigo-200 text-indigo-700 bg-white dark:bg-slate-800 justify-center`}>
              {busy === 'verify' ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />} تحقق
            </button>
          </div>
          {verifyOut && (
            <ul className="space-y-1 text-[11px]" aria-label="نتائج التحقق">
              {verifyOut.map((r, i) => (
                <li key={`${r.input}-${i}`} className="flex flex-wrap gap-x-2">
                  <span className="font-mono" dir="ltr">{r.awb ?? r.input}</span>
                  <span className={`font-bold ${r.result === 'success' ? 'text-green-700' : r.result === 'not_found' ? 'text-orange-700' : r.result === 'skipped' ? 'text-slate-500' : 'text-red-700'}`}>{VERIFY_RESULT_TEXT[r.result]}</span>
                  {r.detail && <span className="text-slate-500 break-all">{r.detail}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
};
