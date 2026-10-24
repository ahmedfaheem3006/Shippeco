import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import {
  AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Clock, ExternalLink, FilePlus2, FileWarning, Link2, MessageSquare,
  PencilLine, RotateCcw, User, XCircle,
} from 'lucide-react';
import { useAuthStore } from '../../hooks/useAuthStore';
import { useRealtimeRefresh } from '../../hooks/useRealtimeRefresh';
import {
  unregisteredInvoicesService,
  type LinkResult,
  type UnregisteredCounts,
  type UnregisteredInvoice,
  type UnregisteredStateFilter,
} from '../../services/unregisteredInvoices.service';
import {
  CancelUnregisteredDialog, CreateUnregisteredInvoiceModal, EditUnregisteredInvoiceModal, LinkInvoiceModal,
} from './UnregisteredInvoiceDialogs';
import { canEditTask } from './taskUtils';
import {
  STATE_BADGE, UNREGISTERED_PAGE_SIZE, describeUnregisteredError, formatAwbDate, formatRiyadhDateTime, invoicePath,
} from './unregisteredInvoiceUtils';

/** Socket events after which the list is re-read from the server. */
const UNREGISTERED_EVENTS = ['tasks:updated'] as const;

type Props = {
  /** The page's search box (server-side search here: AWB, invoice number, employee). */
  search: string;
  /** ?record=<id> (notification deep link): show only that record. */
  recordId: number | null;
  onClearRecord: () => void;
  /** Opens the task window (discussion) — the record is a task. */
  onOpenTask: (id: number) => void;
  /** Something changed here — the page re-reads the tab counter. */
  onChanged: () => void;
};

const FILTERS: { id: UnregisteredStateFilter; label: string; count: (c: UnregisteredCounts) => number }[] = [
  { id: 'all', label: 'الكل', count: (c) => c.all },
  { id: 'pending', label: 'لم يتم', count: (c) => c.pending },
  { id: 'done', label: 'تم', count: (c) => c.done },
];

const EMPTY_COUNTS: UnregisteredCounts = { pending: 0, done: 0, cancelled: 0, all: 0 };

export const UnregisteredInvoicesPanel: React.FC<Props> = ({ search, recordId, onClearRecord, onOpenTask, onChanged }) => {
  const user = useAuthStore((s) => s.user);
  const role = user?.role ?? '';
  const canManage = role === 'admin' || role === 'manager';
  // Same roles as POST /tasks/unregistered-invoices (and POST /tasks).
  const canCreate = canManage || role === 'accountant';
  const canComplete = (r: UnregisteredInvoice) =>
    canManage || (role !== 'viewer' && (r.assigned_to === user?.id || (role === 'accountant' && r.assigned_by === user?.id)));
  // Editable only while pending — same rule as PATCH /tasks/unregistered-invoices/:id.
  const canEdit = (r: UnregisteredInvoice) => r.state === 'pending' && canEditTask(user, r);

  const [state, setState] = useState<UnregisteredStateFilter>('all');
  const [mine, setMine] = useState(false);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState(search.trim());
  const [items, setItems] = useState<UnregisteredInvoice[]>([]);
  const [counts, setCounts] = useState<UnregisteredCounts>(EMPTY_COUNTS);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [phase, setPhase] = useState<'initial' | 'switching' | 'ready' | 'error'>('initial');
  const [loadError, setLoadError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [linkTarget, setLinkTarget] = useState<{ record: UnregisteredInvoice; mode: 'complete' | 'relink' } | null>(null);
  const [cancelTarget, setCancelTarget] = useState<UnregisteredInvoice | null>(null);
  const [editTarget, setEditTarget] = useState<UnregisteredInvoice | null>(null);

  const paramsRef = useRef({ state, mine, page, q, recordId });
  useLayoutEffect(() => {
    paramsRef.current = { state, mine, page, q, recordId };
  }, [state, mine, page, q, recordId]);
  const seq = useRef(0);

  // Typing in the page's search box: debounce, then back to page 1.
  useEffect(() => {
    const t = window.setTimeout(() => {
      const next = search.trim();
      if (next === paramsRef.current.q) return;
      setPhase((ph) => (ph === 'initial' || ph === 'error' ? 'initial' : 'switching'));
      setQ(next);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(t);
  }, [search]);

  const load = useCallback(async (mode: 'replace' | 'background') => {
    const n = ++seq.current;
    const p = paramsRef.current;
    try {
      const res = await unregisteredInvoicesService.list({
        state: p.state, mine: p.mine, page: p.page, q: p.q, id: p.recordId ?? undefined, limit: UNREGISTERED_PAGE_SIZE,
      });
      if (n !== seq.current) return;
      setItems(Array.isArray(res?.items) ? res.items : []);
      setCounts(res?.counts ?? EMPTY_COUNTS);
      setTotal(res?.pagination?.total ?? 0);
      setTotalPages(res?.pagination?.totalPages ?? 1);
      setLoadError(null);
      setPhase('ready');
      // A page emptied by a change elsewhere (e.g. last item completed): step back.
      if (res?.items?.length === 0 && p.page > 1) setPage(Math.min(p.page - 1, res.pagination.totalPages));
    } catch (err) {
      if (n !== seq.current) return;
      const reason = describeUnregisteredError(err, 'تعذر تحميل الفواتير غير المسجلة');
      if (mode === 'replace') {
        setItems([]);
        setPhase('error');
      }
      setLoadError(reason);
    }
  }, []);

  useEffect(() => { void load('replace'); }, [state, mine, page, q, recordId, load]);
  /** Filter/page/search changed: keep the old cards on screen, dimmed, until the new page arrives. */
  const startSwitching = () => setPhase((ph) => (ph === 'initial' || ph === 'error' ? 'initial' : 'switching'));

  // Realtime: someone created/assigned/completed/relinked/cancelled a record
  // (or the connection came back) → re-read the list and counts.
  useRealtimeRefresh(UNREGISTERED_EVENTS, () => { void load('background'); }, 300);

  const applyResult = (result: LinkResult, message: string) => {
    setItems((list) => list.map((r) => (r.id === result.record.id ? result.record : r)));
    toast.success(message);
    onChanged();
    void load('background');
  };

  const changeState = (s: UnregisteredStateFilter) => {
    if (s === state) return;
    startSwitching();
    setState(s);
    setPage(1);
  };
  const changePage = (p: number) => { startSwitching(); setPage(p); };
  const retry = () => { setPhase('initial'); void load('replace'); };

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4" aria-live="polite">
        {[
          { label: 'إجمالي السجلات', value: counts.all, cls: 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400', icon: <FileWarning size={18} /> },
          { label: 'لم يتم', value: counts.pending, cls: 'bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400', icon: <Clock size={18} /> },
          { label: 'تم', value: counts.done, cls: 'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400', icon: <CheckCircle2 size={18} /> },
        ].map((s) => (
          <div key={s.label} className="bg-white dark:bg-slate-800 p-3 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 min-w-0">
            <div className={`p-2 sm:p-3 rounded-xl w-fit ${s.cls}`}>{s.icon}</div>
            <div className="min-w-0">
              <div className="text-[10px] sm:text-xs font-bold text-slate-400 truncate">{s.label}</div>
              <div className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white font-inter">{s.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters + add */}
      <div className="flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label="حالة الإجراء" className="flex bg-white dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={state === f.id}
              onClick={() => changeState(f.id)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg whitespace-nowrap transition-colors ${
                state === f.id ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
            >
              {f.label} <span className="tabular-nums opacity-80">{f.count(counts)}</span>
            </button>
          ))}
          {(counts.cancelled > 0 || state === 'cancelled') && (
            <button
              type="button"
              role="radio"
              aria-checked={state === 'cancelled'}
              onClick={() => changeState('cancelled')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg whitespace-nowrap ${state === 'cancelled' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
            >
              ملغاة <span className="tabular-nums opacity-80">{counts.cancelled}</span>
            </button>
          )}
        </div>
        <label className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer select-none">
          <input type="checkbox" checked={mine} onChange={(e) => { startSwitching(); setMine(e.target.checked); setPage(1); }} className="accent-indigo-600" />
          مسندة لي
        </label>
        {canCreate && (
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="ms-auto flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs shadow-lg shadow-indigo-500/25"
          >
            <FilePlus2 size={16} /> إضافة فاتورة غير مسجلة
          </button>
        )}
      </div>

      {recordId && (
        <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-900/40 rounded-xl px-3 py-2">
          يعرض السجل المحدد من الإشعار فقط
          <button type="button" onClick={onClearRecord} className="underline hover:no-underline">عرض كل السجلات</button>
        </div>
      )}
      {phase === 'ready' && loadError && (
        <div className="flex items-center gap-2 text-xs font-semibold text-red-600 dark:text-red-400" role="status">
          <AlertCircle size={12} /> تعذر تحديث القائمة: {loadError}
          <button type="button" onClick={() => void load('background')} className="font-bold text-indigo-600 dark:text-indigo-400 hover:underline">إعادة المحاولة</button>
        </div>
      )}

      {/* List */}
      {phase === 'initial' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" role="status" aria-label="جاري تحميل الفواتير غير المسجلة">
          {[0, 1, 2].map((i) => (
            <div key={i} className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 p-6 space-y-3 animate-pulse" aria-hidden="true">
              <div className="h-5 w-28 rounded-lg bg-slate-200 dark:bg-slate-700" />
              <div className="h-6 w-40 rounded-lg bg-slate-200 dark:bg-slate-700" />
              <div className="h-4 w-full rounded bg-slate-100 dark:bg-slate-700/60" />
              <div className="h-10 w-full rounded-2xl bg-slate-100 dark:bg-slate-700/60" />
            </div>
          ))}
        </div>
      ) : phase === 'error' ? (
        <div className="bg-white dark:bg-slate-800 rounded-3xl border border-red-100 dark:border-red-900/40 p-10 flex flex-col items-center justify-center text-center" role="alert">
          <AlertCircle size={40} className="text-red-500 mb-3" />
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">تعذر تحميل الفواتير غير المسجلة</h3>
          <p className="text-slate-500 mt-1 text-sm">{loadError}</p>
          <button type="button" onClick={retry} className="mt-4 flex items-center gap-1.5 px-5 py-2.5 rounded-2xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-700">
            <RotateCcw size={14} /> إعادة المحاولة
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-700 p-12 sm:p-20 flex flex-col items-center justify-center text-center">
          <div className="p-6 bg-slate-50 dark:bg-slate-900 rounded-full mb-4">
            <FileWarning size={48} className="text-slate-300 dark:text-slate-600" />
          </div>
          {q || state !== 'all' || mine || recordId ? (
            <h3 className="text-xl font-bold text-slate-900 dark:text-white">لا توجد نتائج مطابقة للبحث أو الفلتر</h3>
          ) : (
            <>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">لا توجد فواتير غير مسجلة حاليًا</h3>
              {canCreate && <p className="text-slate-500 mt-2 text-sm">أضف بوليصة تحتاج إنشاء فاتورة لها بالزر «إضافة فاتورة غير مسجلة»</p>}
            </>
          )}
        </div>
      ) : (
        <>
          <div
            className={`grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6 transition-opacity duration-200 ${phase === 'switching' ? 'opacity-60' : ''}`}
            aria-busy={phase === 'switching'}
          >
            {items.map((r) => {
              const badge = STATE_BADGE[r.state];
              return (
                <article
                  key={r.id}
                  data-unregistered-id={r.id}
                  className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden flex flex-col min-w-0"
                >
                  <div className="p-5 sm:p-6 flex-1 space-y-4 min-w-0">
                    <div className="flex flex-wrap justify-between items-start gap-2">
                      <span className={`px-3 py-1.5 rounded-xl text-[11px] font-black border ${badge.cls}`}>{badge.label}</span>
                      <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                        <Clock size={12} /> تاريخ الإنشاء: <span className="tabular-nums">{formatAwbDate(r.awb_date)}</span>
                      </span>
                    </div>

                    <div className="min-w-0">
                      <div className="text-[10px] font-bold text-slate-400">رقم البوليصة AWB</div>
                      <div className="font-mono text-xl font-extrabold text-slate-900 dark:text-white select-all break-all" dir="ltr" style={{ textAlign: 'right' }}>{r.awb}</div>
                    </div>

                    {r.state === 'done' && (
                      <div className="p-3 rounded-2xl bg-green-50/60 dark:bg-green-900/10 border border-green-100 dark:border-green-900/30 space-y-1 min-w-0">
                        <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400">فاتورة المنصة</div>
                        {r.linked_invoice_id ? (
                          <Link
                            to={invoicePath(r.linked_invoice_id)}
                            className="inline-flex items-center gap-1 text-lg font-extrabold text-indigo-600 dark:text-indigo-400 hover:underline break-all"
                            aria-label={`فتح الفاتورة ${r.linked_invoice_number ?? ''}`}
                          >
                            {r.linked_invoice_number} <ExternalLink size={14} className="shrink-0" />
                          </Link>
                        ) : (
                          <div className="text-sm font-bold text-slate-700 dark:text-slate-300">
                            {r.linked_invoice_number} <span className="text-xs font-semibold text-red-600 dark:text-red-400">(الفاتورة محذوفة)</span>
                          </div>
                        )}
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          تم بواسطة {r.completed_by_name || '—'} · <span className="tabular-nums">{formatRiyadhDateTime(r.completed_at)}</span>
                        </div>
                      </div>
                    )}
                    {r.state === 'cancelled' && (
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        أُلغي بواسطة {r.completed_by_name || '—'} · <span className="tabular-nums">{formatRiyadhDateTime(r.completed_at)}</span>
                      </div>
                    )}
                    {r.note && <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 break-words">{r.note}</p>}
                  </div>

                  <div className="px-5 sm:px-6 py-3 bg-slate-50/50 dark:bg-slate-900/30 border-t border-slate-50 dark:border-slate-700 space-y-3">
                    <div className="flex items-center gap-2 min-w-0 text-[11px]">
                      <div className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
                        <User size={13} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-slate-400 font-bold truncate">المسؤول: <span className="text-slate-700 dark:text-slate-300">{r.assigned_to_name || '—'}</span></div>
                        {r.assigned_by_name && <div className="text-slate-400 text-[10px] truncate">بواسطة: {r.assigned_by_name}</div>}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {r.state === 'pending' && canComplete(r) && (
                        <button
                          type="button"
                          onClick={() => setLinkTarget({ record: r, mode: 'complete' })}
                          className="flex-1 min-w-[150px] flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-green-600 hover:bg-green-700 text-white text-xs font-bold shadow-sm"
                        >
                          <CheckCircle2 size={14} /> تم تسجيل الفاتورة
                        </button>
                      )}
                      {r.state === 'done' && r.linked_invoice_id && (
                        <Link
                          to={invoicePath(r.linked_invoice_id)}
                          className="flex-1 min-w-[120px] flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-xs font-bold hover:bg-indigo-100"
                        >
                          <ExternalLink size={14} /> فتح الفاتورة
                        </Link>
                      )}
                      {r.state === 'done' && canManage && (
                        <button
                          type="button"
                          onClick={() => setLinkTarget({ record: r, mode: 'relink' })}
                          className="flex items-center gap-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold hover:bg-white dark:hover:bg-slate-700"
                        >
                          <Link2 size={14} /> تعديل الربط
                        </button>
                      )}
                      {canEdit(r) && (
                        <button
                          type="button"
                          onClick={() => setEditTarget(r)}
                          aria-label={`تعديل سجل البوليصة ${r.awb}`}
                          className="flex items-center gap-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold hover:bg-white dark:hover:bg-slate-700"
                        >
                          <PencilLine size={14} /> تعديل
                        </button>
                      )}
                      {r.state === 'pending' && canManage && (
                        <button
                          type="button"
                          onClick={() => setCancelTarget(r)}
                          className="flex items-center gap-1 px-3 py-2 rounded-xl text-red-600 dark:text-red-400 text-xs font-bold hover:bg-red-50 dark:hover:bg-red-900/20"
                        >
                          <XCircle size={14} /> إلغاء
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onOpenTask(r.id)}
                        aria-haspopup="dialog"
                        className="ms-auto flex items-center gap-1 px-2 py-2 rounded-xl text-indigo-600 dark:text-indigo-400 text-xs font-bold hover:underline"
                      >
                        <MessageSquare size={14} /> المناقشة
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {totalPages > 1 && (
            <nav className="flex items-center justify-center gap-3 text-xs font-bold text-slate-500" aria-label="صفحات الفواتير غير المسجلة">
              <button type="button" disabled={page <= 1} onClick={() => changePage(page - 1)} aria-label="الصفحة السابقة" className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 disabled:opacity-40">
                <ChevronRight size={16} />
              </button>
              <span className="tabular-nums">صفحة {page} من {totalPages} · {total} سجل</span>
              <button type="button" disabled={page >= totalPages} onClick={() => changePage(page + 1)} aria-label="الصفحة التالية" className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 disabled:opacity-40">
                <ChevronLeft size={16} />
              </button>
            </nav>
          )}
        </>
      )}

      {canCreate && (
        <CreateUnregisteredInvoiceModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          defaultAssignee={user?.id ?? null}
          onCreated={(rec) => {
            setCreateOpen(false);
            toast.success(`تمت إضافة البوليصة ${rec.awb}${rec.assigned_to_name ? ` وإسنادها إلى ${rec.assigned_to_name}` : ''}`);
            onChanged();
            void load('background');
          }}
        />
      )}
      <LinkInvoiceModal
        open={!!linkTarget}
        record={linkTarget?.record ?? null}
        mode={linkTarget?.mode ?? 'complete'}
        onClose={() => setLinkTarget(null)}
        onLinked={(result) => {
          const mode = linkTarget?.mode;
          setLinkTarget(null);
          applyResult(result, mode === 'relink'
            ? `تم تغيير الفاتورة المرتبطة إلى ${result.record.linked_invoice_number}`
            : `تم تسجيل الفاتورة ${result.record.linked_invoice_number} للبوليصة ${result.record.awb}`);
        }}
      />
      <EditUnregisteredInvoiceModal
        open={!!editTarget}
        record={editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={(result) => {
          setEditTarget(null);
          setItems((list) => list.map((r) => (r.id === result.record.id ? result.record : r)));
          toast.success('تم تعديل المهمة بنجاح');
          onChanged();
          // Re-read: a new assignee / AWB may move the record out of this filter or search.
          void load('background');
        }}
        onCompleted={() => { onChanged(); void load('background'); }}
      />
      <CancelUnregisteredDialog
        open={!!cancelTarget}
        record={cancelTarget}
        onClose={() => setCancelTarget(null)}
        onCancelled={(result) => {
          setCancelTarget(null);
          applyResult(result, `تم إلغاء سجل البوليصة ${result.record.awb}`);
        }}
      />
    </div>
  );
};
