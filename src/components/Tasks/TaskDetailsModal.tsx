import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import {
  X, Send, User, CheckCircle2, AlertCircle, MessageSquare, ChevronRight, ChevronLeft, RotateCcw,
  Loader2, FileText, ArrowDown, Clock, ExternalLink, PencilLine,
} from 'lucide-react';
import { tasksService, type Task, type TaskMessage } from '../../services/tasks.service';
import { useAuthStore } from '../../hooks/useAuthStore';
import { Dialog } from '../shared/Dialog';
import { prefersReducedMotion } from '../shared/dialogUtils';
import { PAYMENT_STATUS, TASK_TEXT_MAX, describeTaskError, formatSar, isAbortError, mergeMessages } from './taskUtils';

export type DraftStore = { get: (taskId: number) => string; set: (taskId: number, text: string) => void };

interface TaskDetailsModalProps {
  open: boolean;
  taskId: number | null;
  /** The list row for this task — shown instantly while details load. */
  summary?: Task;
  position?: { index: number; total: number };
  prevId: number | null;
  nextId: number | null;
  onNavigate: (taskId: number) => void;
  onClose: () => void;
  onExited?: () => void;
  onTaskChanged: (patch: Partial<Task> & { id: number }) => void;
  drafts: DraftStore;
  returnFocus?: () => HTMLElement | null;
}

const POLL_MS = 10_000;
const NEAR_BOTTOM_PX = 80;

export const TaskDetailsModal: React.FC<TaskDetailsModalProps> = (props) => {
  const headingId = useId();
  // prev/next re-mounts the body; remember which button was used so keyboard
  // focus lands on the same control in the next task instead of <body>.
  const navFocusRef = useRef<'prev' | 'next' | null>(null);
  return (
    <Dialog
      open={props.open}
      onRequestClose={props.onClose}
      onExited={props.onExited}
      labelledBy={headingId}
      returnFocus={props.returnFocus}
      panelClassName="shp-dialog-panel--tall sm:max-w-3xl"
    >
      {props.taskId != null && (
        // Keyed by task: switching tasks starts from a clean state, and the
        // previous task's in-flight requests are aborted with its instance.
        <TaskDetailsBody key={props.taskId} {...props} taskId={props.taskId} headingId={headingId} navFocusRef={navFocusRef} />
      )}
    </Dialog>
  );
};

type BodyProps = TaskDetailsModalProps & {
  taskId: number;
  headingId: string;
  navFocusRef: React.MutableRefObject<'prev' | 'next' | null>;
};

function TaskDetailsBody({
  taskId, summary, position, prevId, nextId, onNavigate, onClose, onTaskChanged, drafts, headingId, navFocusRef,
}: BodyProps) {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const composerId = useId();

  const [task, setTask] = useState<Task | null>(null);
  const [messages, setMessages] = useState<TaskMessage[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [draft, setDraft] = useState(() => drafts.get(taskId));
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const pendingScrollRef = useRef<ScrollBehavior | null>(null);
  const [unseen, setUnseen] = useState(0);
  const [announce, setAnnounce] = useState('');
  const prevBtnRef = useRef<HTMLButtonElement>(null);
  const nextBtnRef = useRef<HTMLButtonElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    const via = navFocusRef.current;
    if (!via) return;
    navFocusRef.current = null;
    const btn = via === 'next' ? nextBtnRef.current : prevBtnRef.current;
    (btn && !btn.disabled ? btn : closeBtnRef.current)?.focus({ preventScroll: true });
  }, [navFocusRef]);
  const go = (dir: 'prev' | 'next') => {
    const id = dir === 'prev' ? prevId : nextId;
    if (id == null) return;
    navFocusRef.current = dir;
    onNavigate(id);
  };

  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true; // (re)set on mount — StrictMode runs mount→unmount→mount
    return () => { aliveRef.current = false; };
  }, []);

  const view = task ?? summary ?? null;

  const retryLoad = () => {
    setLoadState('loading');
    setLoadError(null);
    setReloadKey((k) => k + 1);
  };

  // ── Load + live refresh (10s, only while the tab is visible) ──
  const messagesRef = useRef<TaskMessage[]>([]);
  const commitMessages = (next: TaskMessage[]) => {
    messagesRef.current = next;
    setMessages(next);
  };

  const applyServerTask = useCallback((data: Task, initial: boolean) => {
    if (!data || data.id !== taskId) return; // never show another task's data
    const { messages: incoming = [], ...rest } = data;
    setTask((prev) => (prev && JSON.stringify(prev) === JSON.stringify(rest) ? prev : rest));
    const cur = messagesRef.current;
    const merged = mergeMessages(cur, incoming);
    if (merged === cur) return; // nothing new (also drops a reply we already appended)
    if (initial) {
      pendingScrollRef.current = 'instant' as ScrollBehavior;
    } else {
      const known = new Set(cur.map((m) => m.id));
      const fromOthers = merged.filter((m) => !known.has(m.id) && m.user_id !== user?.id).length;
      if (nearBottomRef.current) pendingScrollRef.current = prefersReducedMotion() ? 'auto' : 'smooth';
      else if (fromOthers) setUnseen((n) => n + fromOthers);
      if (fromOthers) setAnnounce(`وصل ${fromOthers === 1 ? 'رد جديد' : `${fromOthers} ردود جديدة`}`);
    }
    commitMessages(merged);
  }, [taskId, user?.id]);

  useEffect(() => {
    const ctrl = new AbortController();
    tasksService.getTask(taskId, ctrl.signal).then(
      (data) => {
        if (ctrl.signal.aborted) return;
        applyServerTask(data, true);
        setLoadState('ready');
      },
      (err) => {
        if (ctrl.signal.aborted || isAbortError(err)) return;
        setLoadError(describeTaskError(err, 'تعذر تحميل تفاصيل المهمة'));
        setLoadState('error');
      },
    );
    return () => ctrl.abort();
  }, [taskId, reloadKey, applyServerTask]);

  useEffect(() => {
    if (loadState !== 'ready') return;
    let ctrl: AbortController | null = null;
    const tick = () => {
      if (document.visibilityState !== 'visible' || ctrl) return;
      ctrl = new AbortController();
      const c = ctrl;
      tasksService.getTask(taskId, c.signal)
        .then((data) => { if (!c.signal.aborted) applyServerTask(data, false); })
        .catch(() => { /* transient — the next tick retries */ })
        .finally(() => { if (ctrl === c) ctrl = null; });
    };
    const id = window.setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
      ctrl?.abort();
    };
  }, [loadState, taskId, applyServerTask]);

  // Auto-scroll lives INSIDE the discussion box only (scrollTo on the box —
  // never scrollIntoView, which also scrolls every ancestor incl. the page).
  useLayoutEffect(() => {
    const el = listRef.current;
    const behavior = pendingScrollRef.current;
    if (!el || !behavior) return;
    pendingScrollRef.current = null;
    el.scrollTo({ top: el.scrollHeight, behavior });
    nearBottomRef.current = true;
    setUnseen(0);
  }, [messages, loadState]);

  const onListScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    nearBottomRef.current = near;
    if (near && unseen) setUnseen(0);
  };

  const jumpToLatest = () => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    setUnseen(0);
  };

  // ── Permissions (unchanged rules; the Backend enforces the same) ──
  // Admin/manager can close/reopen any task; an accountant only tasks they
  // assigned (tasks.controller.ts#updateStatus). Replying on a closed task
  // is limited to whoever can reopen it.
  const canChangeStatus = !!view && (
    user?.role === 'admin' || user?.role === 'manager' || (user?.role === 'accountant' && view.assigned_by === user?.id)
  );
  const isClosed = view?.status === 'closed';
  const canReply = loadState === 'ready' && (!isClosed || canChangeStatus);

  // ── Reply ──
  const updateDraft = (text: string) => {
    setDraft(text);
    drafts.set(taskId, text);
    if (sendError) setSendError(null);
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || sendingRef.current || !canReply) return;
    sendingRef.current = true;
    setSending(true);
    setSendError(null);
    try {
      const msg = await tasksService.addMessage(taskId, text);
      if (!msg || typeof msg.id !== 'number') throw new Error('لم يؤكد الخادم حفظ الرد');
      drafts.set(taskId, '');
      if (aliveRef.current) {
        setDraft('');
        pendingScrollRef.current = prefersReducedMotion() ? 'auto' : 'smooth';
        commitMessages(mergeMessages(messagesRef.current, [msg]));
      }
    } catch (err) {
      const reason = describeTaskError(err, 'تعذر إرسال الرد');
      if (aliveRef.current) setSendError(reason);
      else toast.error(`لم يُرسل ردك على «${view?.title ?? `#${taskId}`}» — ${reason}. الرد محفوظ كمسودة.`);
    } finally {
      sendingRef.current = false;
      if (aliveRef.current) setSending(false);
    }
  };

  const toggleStatus = async () => {
    if (!view || statusBusy) return;
    const next = view.status === 'open' ? 'closed' : 'open';
    setStatusBusy(true);
    setStatusError(null);
    try {
      const updated = await tasksService.updateStatus(taskId, next);
      const status = (updated?.status as Task['status']) ?? next;
      if (!aliveRef.current) return;
      setTask((t) => (t ? { ...t, status, updated_at: updated?.updated_at ?? t.updated_at } : t));
      onTaskChanged({ id: taskId, status, ...(updated?.updated_at ? { updated_at: updated.updated_at } : {}) });
      setAnnounce(status === 'closed' ? 'تم إغلاق المهمة' : 'تمت إعادة فتح المهمة');
    } catch (err) {
      if (aliveRef.current) setStatusError(describeTaskError(err, 'تعذر تغيير حالة المهمة'));
    } finally {
      if (aliveRef.current) setStatusBusy(false);
    }
  };

  const hasDraft = draft.trim().length > 0;
  const payment = view?.invoice_id ? PAYMENT_STATUS[view.invoice_payment_status ?? 0] ?? PAYMENT_STATUS[0] : null;

  return (
    <>
      {/* ── Header ── */}
      <header className="shrink-0 px-4 sm:px-6 pt-4 pb-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/60">
        <div className="flex items-start gap-3">
          <div className={`hidden sm:flex p-3 rounded-2xl shrink-0 ${isClosed ? 'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400' : 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400'}`}>
            <MessageSquare size={22} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              {view && (
                <span className={`px-2.5 py-1 rounded-lg text-[11px] font-black ${isClosed ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400' : 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400'}`}>
                  {isClosed ? 'مغلقة' : 'مفتوحة'}
                </span>
              )}
              {view?.invoice_id ? (
                <span className="px-2.5 py-1 rounded-lg text-[11px] font-black bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 border border-blue-100 dark:border-blue-800/30 flex items-center gap-1">
                  <FileText size={11} /> فاتورة #{view.invoice_number || view.invoice_id}
                </span>
              ) : null}
              {position && position.total > 0 && (
                <span className="text-[11px] font-bold text-slate-400 tabular-nums">
                  {position.index + 1} من {position.total}
                </span>
              )}
            </div>
            <h2 id={headingId} className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white leading-snug break-words line-clamp-2">
              {view?.title ?? 'جاري تحميل المهمة...'}
            </h2>
            {view && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1"><User size={13} /> من: <b className="font-semibold text-slate-700 dark:text-slate-300">{view.assigned_by_name || '—'}</b></span>
                <span className="text-slate-300 dark:text-slate-600" aria-hidden="true">←</span>
                <span className="flex items-center gap-1">إلى: <b className="font-semibold text-slate-700 dark:text-slate-300">{view.assigned_to_name || '—'}</b></span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              ref={prevBtnRef}
              type="button"
              onClick={() => go('prev')}
              disabled={prevId == null}
              aria-label="المهمة السابقة"
              title="المهمة السابقة"
              className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ChevronRight size={20} />
            </button>
            <button
              ref={nextBtnRef}
              type="button"
              onClick={() => go('next')}
              disabled={nextId == null}
              aria-label="المهمة التالية"
              title="المهمة التالية"
              className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ChevronLeft size={20} />
            </button>
            <span className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1" aria-hidden="true" />
            <button
              ref={closeBtnRef}
              type="button"
              onClick={onClose}
              aria-label="إغلاق"
              title="إغلاق (Esc)"
              className="p-2 rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-600"
            >
              <X size={20} />
            </button>
          </div>
        </div>
      </header>

      <p className="sr-only" aria-live="polite">{announce}</p>

      {loadState === 'error' && !task ? (
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-3 p-8 text-center">
          <AlertCircle size={36} className="text-red-500" />
          <p className="font-bold text-slate-800 dark:text-slate-100">لم نتمكن من تحميل المهمة</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">{loadError}</p>
          <div className="flex gap-2 mt-2">
            <button type="button" onClick={retryLoad} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700">
              <RotateCcw size={14} /> إعادة المحاولة
            </button>
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-bold text-slate-600 dark:text-slate-300">
              إغلاق
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* ── Task info (separate from the discussion) ── */}
          <section aria-label="بيانات المهمة" className="shrink-0 max-h-[34%] overflow-y-auto overscroll-contain px-4 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-700 space-y-3">
            {view ? (
              <>
                <div>
                  <div className="text-[11px] font-bold text-slate-400 mb-1">وصف المهمة</div>
                  <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed break-words">{view.description || 'لا يوجد وصف'}</p>
                </div>
                <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-1"><Clock size={12} /> أُنشئت {new Date(view.created_at).toLocaleDateString('ar-SA')}</span>
                  {view.invoice_id ? (
                    <>
                      <span>AWB: <b className="font-mono text-slate-700 dark:text-slate-200 select-all">{view.invoice_awb || '—'}</b></span>
                      <span>القيمة: <b className="text-indigo-600 dark:text-indigo-400">{formatSar(view.invoice_total)}</b></span>
                      {payment && <span className={`px-2 py-0.5 rounded-lg border text-[11px] font-bold ${payment.cls}`}>{payment.label}</span>}
                      {view.invoice_ref_id ? (
                        <button
                          type="button"
                          onClick={() => navigate('/invoices', { state: { invoiceId: String(view.invoice_ref_id), openInvoice: true } })}
                          className="flex items-center gap-1 font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                        >
                          <ExternalLink size={12} /> فتح الفاتورة
                        </button>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="space-y-2 animate-pulse" aria-hidden="true">
                <div className="h-3 w-24 rounded bg-slate-200 dark:bg-slate-700" />
                <div className="h-3 w-full rounded bg-slate-200 dark:bg-slate-700" />
                <div className="h-3 w-2/3 rounded bg-slate-200 dark:bg-slate-700" />
              </div>
            )}
          </section>

          {/* ── Discussion: its own scroll box ── */}
          <div className="relative flex-1 min-h-0 flex flex-col">
            <div className="shrink-0 flex items-center gap-2 px-4 sm:px-6 pt-3 pb-1">
              <span className="text-xs font-bold text-slate-400">المناقشة</span>
              {loadState === 'ready' && <span className="text-[11px] text-slate-400 tabular-nums">({messages.length})</span>}
              <div className="h-px flex-1 bg-slate-100 dark:bg-slate-700" />
            </div>
            <div
              ref={listRef}
              onScroll={onListScroll}
              className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-6 py-3 space-y-3"
              role="log"
              aria-label="ردود المهمة"
              tabIndex={0}
            >
              {loadState === 'loading' ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
                  <Loader2 size={18} className="animate-spin" /> جاري تحميل الردود...
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center text-slate-400">
                  <MessageSquare size={28} className="mb-2 opacity-40" />
                  <p className="text-sm font-semibold">لا توجد ردود بعد</p>
                  {canReply && <p className="text-xs mt-1">ابدأ المناقشة بكتابة رد بالأسفل</p>}
                </div>
              ) : (
                messages.map((msg) => {
                  const mine = msg.user_id === user?.id;
                  return (
                    <div key={msg.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                      <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm ${
                        mine
                          ? 'bg-indigo-600 text-white rounded-bl-md'
                          : 'bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-br-md'
                      }`}>
                        <div className="flex items-center gap-2 mb-1 opacity-75 text-[10px] font-bold">
                          <span>{msg.user_name}</span>
                          <span aria-hidden="true">•</span>
                          <time dateTime={msg.created_at}>{new Date(msg.created_at).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}</time>
                        </div>
                        <p className="leading-relaxed font-medium whitespace-pre-wrap break-words">{msg.message}</p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            {unseen > 0 && (
              <button
                type="button"
                onClick={jumpToLatest}
                className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-4 py-2 rounded-full bg-indigo-600 text-white text-xs font-bold shadow-lg shadow-indigo-500/30 hover:bg-indigo-700 animate-in fade-in slide-in-from-bottom-2"
              >
                <ArrowDown size={14} /> رسائل جديدة ({unseen})
              </button>
            )}
          </div>

          {/* ── Actions + composer (always visible) ── */}
          <footer className="shrink-0 px-4 sm:px-6 py-3 border-t border-slate-100 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/40 space-y-2.5">
            {canChangeStatus && loadState === 'ready' && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${isClosed ? 'bg-green-500' : 'bg-amber-500'}`} />
                  حالة المهمة: {isClosed ? 'مغلقة' : 'مفتوحة'}
                </span>
                <button
                  type="button"
                  onClick={toggleStatus}
                  disabled={statusBusy}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-colors disabled:opacity-60 ${
                    isClosed
                      ? 'bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400'
                      : 'bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400'
                  }`}
                >
                  {statusBusy ? <Loader2 size={14} className="animate-spin" /> : isClosed ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                  {isClosed ? 'إعادة فتح المهمة' : 'إغلاق المهمة'}
                </button>
              </div>
            )}
            {statusError && <p role="alert" className="text-xs font-semibold text-red-600 dark:text-red-400">{statusError}</p>}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
              className="flex items-end gap-2"
            >
              <label htmlFor={composerId} className="sr-only">اكتب ردك</label>
              <textarea
                id={composerId}
                rows={1}
                value={draft}
                maxLength={TASK_TEXT_MAX}
                onChange={(e) => updateDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    send();
                  }
                }}
                readOnly={sending}
                disabled={!canReply}
                placeholder={
                  loadState !== 'ready' ? 'جاري التحميل...' : !canReply ? 'هذه المهمة مغلقة ولا يمكن الرد عليها' : 'اكتب ردك هنا...'
                }
                title="Enter للإرسال، Shift+Enter لسطر جديد"
                aria-invalid={!!sendError || undefined}
                aria-describedby={sendError ? `${composerId}-err` : undefined}
                className="flex-1 max-h-32 min-h-[48px] px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white resize-none [field-sizing:content] disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={!canReply || sending || !draft.trim()}
                aria-label="إرسال الرد"
                className="shrink-0 h-12 w-12 flex items-center justify-center bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 transition-colors disabled:opacity-50"
              >
                {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
              </button>
            </form>
            {sendError ? (
              <p id={`${composerId}-err`} role="alert" className="text-xs font-semibold text-red-600 dark:text-red-400 flex items-center gap-2">
                <AlertCircle size={12} /> لم يُرسل الرد: {sendError}. النص محفوظ.
                <button type="button" onClick={send} className="font-bold text-indigo-600 dark:text-indigo-400 hover:underline">إعادة المحاولة</button>
              </p>
            ) : hasDraft && !sending ? (
              <p className="text-[11px] text-slate-400 flex items-center gap-1"><PencilLine size={11} /> المسودة محفوظة لهذه المهمة حتى عند التنقل أو الإغلاق</p>
            ) : null}
          </footer>
        </>
      )}
    </>
  );
}
