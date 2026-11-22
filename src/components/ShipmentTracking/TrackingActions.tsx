/**
 * «متابعة البوليصة» — the two admin actions at the top of the page (final):
 *
 *   «تحقق البوليصة»   one or more AWBs checked against DHL now (one DHL
 *                     request per AWB, asked by the SHIPPEC Backend): known
 *                     AWBs are updated, an unknown one DHL knows is added to
 *                     the tracking (manual_lookup), a verified "no data" is
 *                     recorded, a temporary DHL problem is never a "not found".
 *   «مزامنة الفواتير» one background run of exactly the «بانتظار المزامنة»
 *                     queue — chosen by the Backend (no ids from the browser),
 *                     never a full historical scan, never a second run.
 *
 * No engineering metrics here (quota, pacing, batch sizes, lanes…): the
 * Backend keeps them for diagnostics (GET /shipment-tracking/admin/backfill/status).
 * The browser never calls DHL. Automatic tracking (new invoices, created
 * shipments, the operational sync) does not depend on these buttons.
 */
import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, ChevronDown, Loader2, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Dialog } from '../shared/Dialog';
import {
  shipmentTrackingService, type PendingSyncStatus, type SyncBlockedReason, type VerifyAwbResult,
} from '../../services/shipmentTracking.service';
import { describeApiError } from '../../utils/apiErrors';
import { formatAwb, formatLocal, formatRiyadh, rowBadge } from './trackingUtils';
import { VERIFY_MAX_AWBS, awbCount, parseAwbInput, verifyFailureText } from './verifyAwbs';

const VERIFY_CHUNK = 5;
const POLL_MS = 5_000;
const n = (v: number) => new Intl.NumberFormat('en-US').format(v);
type Outcome = 'found' | 'no_data' | 'failed';
const outcomeOf = (r: VerifyAwbResult): Outcome => (r.result === 'success' ? 'found' : r.result === 'not_found' ? 'no_data' : 'failed');

const BLOCKED_OFF: Partial<Record<SyncBlockedReason, string>> = {
  not_configured: 'ربط DHL غير مهيأ على الخادم — لا يمكن بدء المزامنة الآن.',
  tracking_disabled: 'التتبع من DHL غير مفعّل على الخادم — لا يمكن بدء المزامنة الآن.',
  sync_disabled: 'المزامنة التلقائية مع DHL متوقفة على الخادم — لا يمكن بدء المزامنة الآن.',
};
const WAITING_DHL = 'DHL طلبت التمهّل حاليًا — تستمر المزامنة تلقائيًا عندما تسمح DHL.';
const isWaitingDhl = (b: SyncBlockedReason | null | undefined) => b === 'rate_limited' || b === 'circuit_open' || b === 'paused';

const BTN = 'inline-flex items-center justify-center gap-2 min-w-0 px-4 sm:px-5 min-h-[48px] rounded-2xl text-[13px] sm:text-sm font-extrabold whitespace-nowrap transition '
  + 'disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900';
const BTN_SECONDARY = 'border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60';
const BTN_PRIMARY = 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm shadow-indigo-600/20';

const OUTCOME_UI: Record<Outcome, { label: string; cls: string }> = {
  found: { label: 'وجدت بيانات', cls: 'bg-green-50 text-green-700 border-green-100 dark:bg-green-900/20 dark:text-green-300 dark:border-green-900/40' },
  no_data: { label: 'لا تتوفر بيانات', cls: 'bg-orange-50 text-orange-700 border-orange-100 dark:bg-orange-900/20 dark:text-orange-300 dark:border-orange-900/40' },
  failed: { label: 'تعذر التحقق', cls: 'bg-amber-50 text-amber-800 border-amber-100 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-900/40' },
};

function VerifyResultRow({ r, open }: { r: VerifyAwbResult; open: boolean }) {
  const outcome = outcomeOf(r);
  const awb = r.awb ?? r.input;
  const rec = r.record ?? null;
  const badge = rec ? rowBadge(rec) : null;
  const last = rec ? formatLocal(rec.last_event_local, rec.last_event_gmt_offset) : null;
  const headline = outcome === 'found' ? badge?.label ?? 'وجدت بيانات' : outcome === 'no_data' ? 'لا تتوفر بيانات من DHL' : 'تعذر التحقق';
  return (
    <li data-verify-awb={awb} data-outcome={outcome}>
      <details open={open} className="group rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        <summary className="flex items-center gap-2 px-3 py-2.5 min-h-[48px] cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          <span className="font-mono font-extrabold text-sm text-slate-900 dark:text-white shrink-0" dir="ltr">{formatAwb(awb)}</span>
          <span className={`px-2 py-0.5 rounded-lg border text-[11px] font-black shrink-0 ${OUTCOME_UI[outcome].cls}`}>{OUTCOME_UI[outcome].label}</span>
          <span className="min-w-0 truncate text-xs text-slate-500 dark:text-slate-400 hidden min-[420px]:inline">{headline}</span>
          <ChevronDown size={16} className="ms-auto shrink-0 text-slate-400 transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="px-3 pb-3 space-y-2 text-xs text-slate-600 dark:text-slate-300">
          {outcome === 'found' && (
            <p className="font-bold text-green-700 dark:text-green-400">تم العثور على بيانات البوليصة وتحديثها بنجاح.{r.registered_now ? ' وأُضيفت إلى متابعة SHIPPEC.' : ''}</p>
          )}
          {outcome === 'no_data' && (
            <p className="font-bold text-orange-700 dark:text-orange-300">لا تتوفر بيانات تتبع من DHL لهذه البوليصة. <span className="font-semibold text-slate-500">تم التحقق مباشرة من DHL.</span></p>
          )}
          {outcome === 'failed' && <p className="font-bold text-amber-800 dark:text-amber-300">{verifyFailureText(r)}</p>}
          {rec && (
            <dl className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-1.5">
              <div className="min-w-0"><dt className="text-[11px] font-bold text-slate-400">الحالة الحالية</dt>
                <dd>{badge && <span className={`inline-block mt-0.5 px-2 py-0.5 rounded-lg border text-[11px] font-black ${badge.cls}`}>{badge.label}</span>}</dd></div>
              <div className="min-w-0"><dt className="text-[11px] font-bold text-slate-400">آخر حدث من DHL</dt>
                <dd className="min-w-0">{rec.current_description
                  ? <><span className="block font-bold text-slate-800 dark:text-slate-100 truncate" dir="ltr" title={rec.current_description}>{rec.current_description}</span>
                    <span className="block text-[11px] text-slate-500 truncate">{rec.current_location ? <span dir="ltr">{rec.current_location}</span> : null}{last ? ` · ${last.date} ${last.time}` : ''}</span></>
                  : '—'}</dd></div>
              <div className="min-w-0"><dt className="text-[11px] font-bold text-slate-400">آخر تحديث</dt>
                <dd className="font-bold tabular-nums">{rec.last_synced_at ? formatRiyadh(rec.last_synced_at) : '—'}</dd></div>
            </dl>
          )}
          {outcome === 'no_data' && rec && <p className="text-[11px] text-slate-500">البوليصة وفاتورتها محفوظتان في SHIPPEC كما هما.</p>}
          {rec && <Link to={`/shipment-tracking/${awb}`} className="inline-flex text-xs font-bold text-indigo-600 dark:text-indigo-300 hover:underline">فتح تفاصيل الشحنة</Link>}
        </div>
      </details>
    </li>
  );
}

function VerifyPanel({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const [text, setText] = useState('');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [results, setResults] = useState<VerifyAwbResult[] | null>(null);
  const busy = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const hintId = useId();
  const parsed = useMemo(() => parseAwbInput(text), [text]);
  const tooMany = parsed.valid.length > VERIFY_MAX_AWBS;
  const canSend = parsed.valid.length > 0 && parsed.invalid.length === 0 && !tooMany && !progress;
  useEffect(() => { inputRef.current?.focus(); }, []);

  const run = async (ev?: React.FormEvent) => {
    ev?.preventDefault();
    if (!canSend || busy.current) return; // double click: one verification at a time
    busy.current = true;
    const awbs = parsed.valid;
    const out: VerifyAwbResult[] = [];
    const failRest = (code: string, detail: string | null) => {
      for (const a of awbs.slice(out.length)) out.push({ input: a, awb: a, result: 'skipped', registered: false, normalized_status: null, error_code: code, detail });
    };
    setResults(null);
    setProgress({ done: 0, total: awbs.length });
    try {
      for (let i = 0; i < awbs.length; i += VERIFY_CHUNK) {
        const r = await shipmentTrackingService.verifyAwbs(awbs.slice(i, i + VERIFY_CHUNK));
        out.push(...r.results);
        setProgress({ done: out.length, total: awbs.length });
        // DHL asked us to slow down (429 / pause): nothing more is sent now.
        if (r.stopped_by) { failRest(r.stopped_by, null); break; }
      }
    } catch (err) {
      failRest('REQUEST_FAILED', describeApiError(err, 'تعذر التحقق — أعد المحاولة بعد قليل.'));
    } finally {
      busy.current = false;
      setProgress(null);
      setResults(out);
      if (out.some((r) => r.result !== 'skipped')) onChanged();
    }
  };

  const counts = results ? {
    found: results.filter((r) => outcomeOf(r) === 'found').length,
    no_data: results.filter((r) => outcomeOf(r) === 'no_data').length,
    failed: results.filter((r) => outcomeOf(r) === 'failed').length,
  } : null;

  return (
    <section id={id} data-testid="verify-panel" aria-labelledby={`${id}-h`}
      className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm p-4 sm:p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={`${id}-h`} className="text-base font-extrabold text-slate-900 dark:text-white">تحقق البوليصة</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">يسأل SHIPPEC شركة DHL مباشرة عن كل بوليصة ويحدّث بياناتها.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="إغلاق التحقق" className="p-2 -m-1 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 shrink-0"><X size={18} /></button>
      </div>
      <form onSubmit={(e) => void run(e)} className="space-y-2">
        <label className="block">
          <span className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">أرقام البوالص</span>
          <textarea ref={inputRef} value={text} onChange={(e) => { setText(e.target.value); setResults(null); }} rows={3} dir="ltr" inputMode="numeric"
            spellCheck={false} autoComplete="off" aria-describedby={hintId} aria-invalid={parsed.invalid.length > 0 || tooMany || undefined}
            placeholder={'6606077671\n2816850120'} disabled={!!progress}
            className="w-full min-w-0 px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 text-base font-mono font-bold text-slate-900 dark:text-white text-start focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y disabled:opacity-70" />
        </label>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div id={hintId} className="text-[11px] font-semibold text-slate-500 min-w-0" aria-live="polite">
            {parsed.invalid.length > 0
              ? <span className="text-red-600 dark:text-red-400 break-words" role="alert">أرقام غير صالحة (رقم DHL من 10 أرقام): <span dir="ltr" className="font-mono">{parsed.invalid.join('، ')}</span></span>
              : tooMany ? <span className="text-red-600 dark:text-red-400" role="alert">حتى {n(VERIFY_MAX_AWBS)} بوليصة في المرة الواحدة.</span>
              : parsed.valid.length ? <span>{awbCount(parsed.valid.length)}{parsed.duplicates ? ` — حُذف المكرر (${n(parsed.duplicates)})` : ''}</span>
              : <span>سطر لكل بوليصة، أو مفصولة بفواصل.</span>}
          </div>
          <button type="submit" disabled={!canSend} className={`${BTN} ${BTN_PRIMARY} w-full sm:w-auto`}>
            {progress ? <><Loader2 size={16} className="animate-spin" /> جاري التحقق… {n(progress.done)} من {n(progress.total)}</> : <><ShieldCheck size={16} /> تحقق الآن</>}
          </button>
        </div>
      </form>
      {progress && <p className="sr-only" role="status">جاري التحقق من DHL</p>}
      {results && counts && (
        <div className="space-y-2.5" data-testid="verify-results">
          <div className="rounded-2xl bg-slate-50 dark:bg-slate-900/40 p-3 space-y-2" role="status">
            <p className="text-sm font-extrabold text-slate-900 dark:text-white">تم التحقق من {awbCount(results.length)}</p>
            <div className="flex flex-wrap gap-1.5 text-[11px] font-bold tabular-nums">
              <span className={`px-2 py-1 rounded-lg border ${OUTCOME_UI.found.cls}`}>وجدت بيانات: {n(counts.found)}</span>
              <span className={`px-2 py-1 rounded-lg border ${OUTCOME_UI.no_data.cls}`}>لا تتوفر بيانات: {n(counts.no_data)}</span>
              <span className={`px-2 py-1 rounded-lg border ${OUTCOME_UI.failed.cls}`}>تعذر التحقق مؤقتًا: {n(counts.failed)}</span>
            </div>
          </div>
          <ul className="space-y-1.5" aria-label="نتائج التحقق">
            {results.map((r, i) => <VerifyResultRow key={`${r.awb ?? r.input}-${i}`} r={r} open={results.length === 1} />)}
          </ul>
        </div>
      )}
    </section>
  );
}

function SyncDialog({ open, onClose, onStarted }: { open: boolean; onClose: () => void; onStarted: (s: PendingSyncStatus) => void }) {
  const hid = useId();
  const [preview, setPreview] = useState<PendingSyncStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [resuming, setResuming] = useState(false);
  const startRef = useRef<HTMLButtonElement>(null);

  const fetchPreview = useCallback(() => shipmentTrackingService.pendingSyncStatus().then(
    (s) => { setPreview(s); setError(null); },
    (err) => setError(describeApiError(err, 'تعذر قراءة البوالص بانتظار المزامنة')),
  ), []);
  useEffect(() => { if (open) void fetchPreview(); }, [open, fetchPreview]);
  /** Closing forgets the preview: the next opening always shows a fresh count. */
  const close = () => { setPreview(null); setError(null); onClose(); };

  const start = async () => {
    if (starting) return;
    setStarting(true);
    setError(null);
    try {
      const r = await shipmentTrackingService.startPendingSync();
      if (r.nothing_to_sync) { setPreview(r.status); return; }
      toast.success(r.already_running ? 'المزامنة تعمل بالفعل' : `بدأت مزامنة ${awbCount(r.queued)} في الخلفية`);
      onStarted(r.status);
      close();
    } catch (err) {
      setError(describeApiError(err, 'تعذر بدء المزامنة'));
    } finally {
      setStarting(false);
    }
  };
  const resume = async () => {
    if (resuming) return;
    setResuming(true);
    try {
      await shipmentTrackingService.resumeSync();
      await fetchPreview();
    } catch (err) {
      setError(describeApiError(err, 'تعذر الاستئناف'));
    } finally {
      setResuming(false);
    }
  };

  const off = preview?.blocked ? BLOCKED_OFF[preview.blocked] : undefined;
  const authStopped = preview?.blocked === 'auth_stopped';
  const nothing = preview && preview.eligible === 0;
  const canStart = !!preview && !nothing && !off && !authStopped;
  return (
    <Dialog open={open} onRequestClose={close} labelledBy={hid} panelClassName="sm:max-w-md" initialFocusRef={startRef as React.RefObject<HTMLElement>}>
      <div className="p-5 space-y-4" dir="rtl" data-testid="sync-dialog">
        <div className="flex items-start justify-between gap-3">
          <h2 id={hid} className="text-lg font-extrabold text-slate-900 dark:text-white flex items-center gap-2"><RefreshCw size={18} className="text-indigo-600" /> مزامنة الفواتير</h2>
          <button type="button" onClick={close} aria-label="إغلاق" className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"><X size={18} /></button>
        </div>
        {!preview && !error && (
          <p className="flex items-center gap-2 text-sm text-slate-500" role="status"><Loader2 size={16} className="animate-spin" /> جاري حساب البوالص المؤهلة…</p>
        )}
        {preview && nothing && (
          <p className="rounded-2xl bg-slate-50 dark:bg-slate-900/40 p-3 text-sm font-bold text-slate-700 dark:text-slate-200" role="status">لا توجد بوالص بانتظار المزامنة حاليًا.</p>
        )}
        {preview && !nothing && (
          <div className="space-y-3">
            <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">سيتم بدء مزامنة البوالص الموجودة حاليًا في «بانتظار المزامنة» مع DHL.</p>
            <p className="rounded-2xl bg-indigo-50 dark:bg-indigo-900/20 px-4 py-3 text-sm font-bold text-indigo-800 dark:text-indigo-200" data-testid="sync-eligible">
              عدد البوالص المؤهلة للمزامنة: <span className="tabular-nums text-base font-black">{n(preview.eligible)}</span>
            </p>
            <p className="text-[11px] text-slate-500">تعمل في الخلفية دون تعطيل الصفحة. لا تشمل البوالص التي أكدت DHL عدم توفر بياناتها، ولا الشحنات المسلّمة.</p>
          </div>
        )}
        {(off || authStopped) && (
          <p className="flex items-start gap-2 rounded-2xl bg-amber-50 dark:bg-amber-900/15 p-3 text-xs font-bold text-amber-800 dark:text-amber-300" role="alert">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            {off ?? 'رفضت DHL بيانات الربط — المزامنة متوقفة. صحّح إعدادات MyDHL على الخادم ثم استأنف.'}
          </p>
        )}
        {preview && !off && !authStopped && !nothing && isWaitingDhl(preview.blocked) && <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">{WAITING_DHL}</p>}
        {error && <p className="rounded-2xl bg-red-50 dark:bg-red-900/15 p-3 text-xs font-bold text-red-700 dark:text-red-300" role="alert">{error}</p>}
        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
          <button type="button" onClick={close} className={`${BTN} ${BTN_SECONDARY}`}>{nothing ? 'حسنًا' : 'إلغاء'}</button>
          {authStopped && (
            <button type="button" onClick={() => void resume()} disabled={resuming} className={`${BTN} ${BTN_SECONDARY}`}>
              {resuming ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} استئناف الربط مع DHL
            </button>
          )}
          {!nothing && !authStopped && (
            <button ref={startRef} type="button" onClick={() => void start()} disabled={!canStart || starting} className={`${BTN} ${BTN_PRIMARY}`}>
              {starting ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} بدء المزامنة
            </button>
          )}
        </div>
      </div>
    </Dialog>
  );
}

type Run = NonNullable<PendingSyncStatus['run']>;

export const TrackingActions: React.FC<{ refreshKey?: number; onChanged: () => void }> = ({ refreshKey = 0, onChanged }) => {
  const panelId = useId();
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [st, setSt] = useState<PendingSyncStatus | null>(null);
  const [finished, setFinished] = useState<Run | null>(null);
  /** The run this page watched while it ran: only its completion is announced. */
  const watched = useRef<number | null>(null);
  const changed = useRef(onChanged);
  useEffect(() => { changed.current = onChanged; }, [onChanged]);

  /** A new status: a watched run that finished is announced once, and the page refreshed. */
  const apply = useCallback((s: PendingSyncStatus) => {
    setSt(s);
    const run = s.run;
    if (!run) return;
    if (run.status === 'running') {
      if (watched.current !== run.id) setFinished(null);
      watched.current = run.id;
      return;
    }
    if (watched.current === run.id) {
      watched.current = null;
      if (run.status === 'completed') { setFinished(run); changed.current(); }
    }
  }, []);
  const load = useCallback(() => shipmentTrackingService.pendingSyncStatus().then(apply, () => undefined), [apply]);
  useEffect(() => { void load(); }, [load, refreshKey]);
  const running = st?.run?.status === 'running';
  useEffect(() => {
    if (!running) return undefined;
    const t = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(t);
  }, [running, load]);

  const run = st?.run;
  const pct = running && run && run.total ? Math.min(100, Math.round((run.processed / run.total) * 100)) : 0;
  return (
    <section aria-label="إجراءات متابعة البوليصة" data-testid="tracking-actions" className="space-y-3">
      <div className="grid grid-cols-1 min-[360px]:grid-cols-2 sm:flex sm:flex-wrap gap-2">
        <button type="button" onClick={() => setVerifyOpen((v) => !v)} aria-expanded={verifyOpen} aria-controls={panelId}
          className={`${BTN} ${BTN_SECONDARY} ${verifyOpen ? '!border-indigo-300 !bg-indigo-50 !text-indigo-700 dark:!bg-indigo-900/30 dark:!text-indigo-200' : ''}`}>
          <ShieldCheck size={18} className="text-indigo-600 dark:text-indigo-300 shrink-0" /> تحقق البوليصة
        </button>
        <button type="button" onClick={() => setDialogOpen(true)} disabled={running || dialogOpen} aria-busy={running || undefined} className={`${BTN} ${BTN_PRIMARY}`}>
          {running ? <><Loader2 size={18} className="animate-spin shrink-0" /> جاري المزامنة...</> : <><RefreshCw size={18} className="shrink-0" /> مزامنة الفواتير</>}
        </button>
      </div>

      {running && run && (
        <div className="rounded-2xl border border-indigo-100 dark:border-indigo-900/40 bg-indigo-50/50 dark:bg-indigo-900/10 px-4 py-3 space-y-2" data-testid="pending-sync-progress" role="status">
          <p className="text-sm font-extrabold text-slate-800 dark:text-slate-100 tabular-nums">تمت معالجة {n(run.processed)} من {n(run.total)}</p>
          <div className="h-1.5 rounded-full bg-indigo-100 dark:bg-slate-700 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="تقدم مزامنة الفواتير">
            <div className="h-full bg-indigo-500 transition-[width] duration-500" style={{ width: `${pct}%` }} />
          </div>
          <p className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400 tabular-nums">
            <span>وجدت بيانات: {n(run.found)}</span><span>لا تتوفر بيانات: {n(run.no_data)}</span><span>تعذر مؤقتًا: {n(run.temporary)}</span>
          </p>
          {isWaitingDhl(st?.blocked) && <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">{WAITING_DHL}</p>}
        </div>
      )}

      {finished && (
        <div className="rounded-2xl border border-green-100 dark:border-green-900/40 bg-green-50/60 dark:bg-green-900/10 px-4 py-3" data-testid="pending-sync-done" role="status">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-extrabold text-green-800 dark:text-green-300 flex items-center gap-2"><CheckCircle2 size={16} /> اكتملت المزامنة</p>
            <button type="button" onClick={() => setFinished(null)} aria-label="إخفاء نتيجة المزامنة" className="p-1 rounded-lg text-slate-400 hover:bg-white/70 dark:hover:bg-slate-700"><X size={16} /></button>
          </div>
          <dl className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs tabular-nums">
            <div><dt className="text-slate-500">تمت معالجة</dt><dd className="font-black text-slate-900 dark:text-white">{n(finished.processed)}</dd></div>
            <div><dt className="text-slate-500">تم تحديثها بنجاح</dt><dd className="font-black text-green-700 dark:text-green-400">{n(finished.found)}</dd></div>
            <div><dt className="text-slate-500">لا تتوفر لها بيانات من DHL</dt><dd className="font-black text-orange-700 dark:text-orange-300">{n(finished.no_data)}</dd></div>
            <div><dt className="text-slate-500">تعذر التحقق مؤقتًا</dt><dd className="font-black text-amber-700 dark:text-amber-300">{n(finished.temporary)}</dd></div>
          </dl>
        </div>
      )}

      {verifyOpen && <VerifyPanel id={panelId} onClose={() => setVerifyOpen(false)} onChanged={onChanged} />}

      <SyncDialog open={dialogOpen} onClose={() => setDialogOpen(false)} onStarted={apply} />
    </section>
  );
};
