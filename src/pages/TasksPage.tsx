import React, { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from 'react';
import { Plus, ClipboardList, Clock, CheckCircle2, Search, User, ChevronLeft, RotateCcw, AlertCircle, PencilLine, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useSearchParams } from 'react-router-dom';
import { tasksService, type Task } from '../services/tasks.service';
import { useAuthStore } from '../hooks/useAuthStore';
import { CreateTaskModal } from '../components/Tasks/CreateTaskModal';
import { TaskDetailsModal, type DraftStore } from '../components/Tasks/TaskDetailsModal';
import { getScrollParent } from '../components/shared/dialogUtils';
import { describeTaskError, filterTasksBySearch, formatSar, nearestSurvivingId, neighborIds } from '../components/Tasks/taskUtils';

type FilterTab = 'all' | 'received' | 'assigned' | 'open' | 'closed';

function paramsFor(tab: FilterTab): { status?: string; view?: string } {
  if (tab === 'received' || tab === 'assigned') return { view: tab };
  if (tab === 'open' || tab === 'closed') return { status: tab };
  return {};
}

const PAYMENT_BADGE: Record<number, { label: string; cls: string }> = {
  0: { label: 'غير مدفوعة 🔴', cls: 'bg-red-50 text-red-600 dark:bg-red-950/20 dark:text-red-400 border-red-100 dark:border-red-900/30' },
  1: { label: 'دفعة جزئية 🟡', cls: 'bg-yellow-50 text-yellow-600 dark:bg-yellow-950/20 dark:text-yellow-400 border-yellow-100 dark:border-yellow-900/30' },
  2: { label: 'مدفوعة بالكامل ✅', cls: 'bg-green-50 text-green-600 dark:bg-green-950/20 dark:text-green-400 border-green-100 dark:border-green-900/30' },
  3: { label: 'مرتجعة 🟣', cls: 'bg-purple-50 text-purple-600 dark:bg-purple-950/20 dark:text-purple-400 border-purple-100 dark:border-purple-900/30' },
};

type ScrollAnchor = { container: HTMLElement; items: { id: string; offset: number }[] };

function containerTop(container: HTMLElement): number {
  return container === document.scrollingElement ? 0 : container.getBoundingClientRect().top;
}

export const TasksPage: React.FC = () => {
  const user = useAuthStore(s => s.user);
  const [tasks, setTasks] = useState<Task[]>([]);
  // initial: nothing to show yet · switching: tab changed, old list stays (dimmed)
  const [phase, setPhase] = useState<'initial' | 'switching' | 'ready' | 'error'>('initial');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterTab>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState<number | null>(null);
  const [navOrder, setNavOrder] = useState<number[]>([]);
  const openerIdRef = useRef<number | null>(null);
  // List row of the task on screen, kept even if a refresh drops it from the list.
  const [pinnedSummary, setPinnedSummary] = useState<Task | undefined>(undefined);

  const listRef = useRef<HTMLDivElement>(null);
  const listHeadingRef = useRef<HTMLHeadingElement>(null);
  const headerAssignRef = useRef<HTMLButtonElement>(null);
  const anchorRef = useRef<ScrollAnchor | null>(null);
  const reqSeq = useRef(0);
  const filterRef = useRef(statusFilter);
  const searchRef = useRef(search);
  useLayoutEffect(() => {
    filterRef.current = statusFilter;
    searchRef.current = search;
  }, [statusFilter, search]);

  // Same permission the Backend enforces on POST /tasks (see
  // requireRole('admin', 'manager', 'accountant') in tasks.routes.ts) —
  // whoever can assign tasks gets the assigner's view/tabs/button.
  const canAssignTasks = user?.role === 'admin' || user?.role === 'manager' || user?.role === 'accountant';

  // ── Keep what the user is looking at in place when the list data changes ──
  // Records the cards currently on screen and their offsets; after the new
  // rows render, the first of them that still exists is put back at its old
  // offset. Works when rows are added above, re-ordered, or removed (e.g. a
  // task closed while the "open" filter is active).
  const captureAnchor = useCallback(() => {
    const list = listRef.current;
    const container = list ? getScrollParent(list) : null;
    if (!list || !container) return;
    const top = containerTop(container);
    const bottom = top + container.clientHeight;
    const items = Array.from(list.querySelectorAll<HTMLElement>('[data-task-id]'))
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.bottom > top && r.top < bottom)
      .map(({ el, r }) => ({ id: el.dataset.taskId!, offset: r.top - top }));
    anchorRef.current = items.length ? { container, items } : null;
  }, []);

  useLayoutEffect(() => {
    const a = anchorRef.current;
    const list = listRef.current;
    anchorRef.current = null;
    if (!a || !list) return;
    for (const it of a.items) {
      const el = list.querySelector<HTMLElement>(`[data-task-id="${it.id}"]`);
      if (!el) continue;
      const delta = el.getBoundingClientRect().top - containerTop(a.container) - it.offset;
      if (Math.abs(delta) >= 1) a.container.scrollBy({ top: delta, behavior: 'instant' as ScrollBehavior });
      break;
    }
  }, [tasks]);

  /** replace: first load / tab change. background: silent refresh that keeps
   *  the current list on screen (no spinner swap → no collapse → no jump). */
  const fetchTasks = useCallback(async (mode: 'replace' | 'background'): Promise<Task[] | null> => {
    const seq = ++reqSeq.current;
    // (the visible "loading" state is set by whoever triggers the fetch)
    try {
      const data = await tasksService.getTasks(paramsFor(filterRef.current));
      if (seq !== reqSeq.current) return null; // a newer request (e.g. another tab) won
      const rows = Array.isArray(data) ? data : [];
      if (mode === 'background') captureAnchor();
      setTasks(rows);
      setPhase('ready');
      setLoadError(null);
      setRefreshError(null);
      return rows;
    } catch (err) {
      if (seq !== reqSeq.current) return null;
      const reason = describeTaskError(err, 'تعذر تحميل المهام');
      if (mode === 'replace') {
        // Never leave another tab's rows on screen under the new tab's name.
        setTasks([]);
        setLoadError(reason);
        setPhase('error');
      } else {
        setRefreshError(reason);
      }
      return null;
    } finally {
      if (seq === reqSeq.current) setRefreshing(false);
    }
  }, [captureAnchor]);

  useEffect(() => {
    void fetchTasks('replace');
  }, [statusFilter, fetchTasks]);

  const changeFilter = (tab: FilterTab) => {
    if (tab === statusFilter) return;
    filterRef.current = tab;
    setPhase((p) => (p === 'initial' || p === 'error' ? 'initial' : 'switching'));
    setStatusFilter(tab);
  };
  const retryLoad = () => {
    setPhase('initial');
    void fetchTasks('replace');
  };
  const refreshInBackground = useCallback(() => {
    setRefreshing(true);
    return fetchTasks('background');
  }, [fetchTasks]);

  const filteredTasks = useMemo(() => filterTasksBySearch(tasks, search), [tasks, search]);
  const tasksById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const stats = useMemo(() => ({
    total: tasks.length,
    open: tasks.filter((t) => t.status === 'open').length,
    closed: tasks.filter((t) => t.status === 'closed').length,
  }), [tasks]);

  // ── Per-task reply drafts (survive prev/next and closing the window) ──
  const draftsRef = useRef(new Map<number, string>());
  const [draftIds, setDraftIds] = useState<ReadonlySet<number>>(new Set());
  const drafts: DraftStore = useMemo(() => ({
    get: (id) => draftsRef.current.get(id) ?? '',
    set: (id, text) => {
      const had = !!draftsRef.current.get(id)?.trim();
      if (text) draftsRef.current.set(id, text);
      else draftsRef.current.delete(id);
      const has = !!text.trim();
      if (had !== has) {
        setDraftIds((prev) => {
          const next = new Set(prev);
          if (has) next.add(id);
          else next.delete(id);
          return next;
        });
      }
    },
  }), []);

  // ── Task window ──
  const cardButton = (id: number | null) =>
    id == null ? null : listRef.current?.querySelector<HTMLElement>(`[data-task-open="${id}"]`) ?? null;

  const openTask = (id: number) => {
    // Focus the card's own button first, so the dialog records it as the
    // opener (focus + on-screen position are restored to it on close).
    cardButton(id)?.focus({ preventScroll: true });
    openerIdRef.current = id;
    setNavOrder(filteredTasks.map((t) => t.id));
    setPinnedSummary(tasksById.get(id));
    setActiveTaskId(id);
    setDetailsOpen(true);
  };

  // Navigation follows the order the user saw (current filter + search);
  // rows that a refresh removed are skipped, except the one being viewed.
  const effectiveOrder = useMemo(
    () => navOrder.filter((id) => id === activeTaskId || tasksById.has(id)),
    [navOrder, activeTaskId, tasksById],
  );
  const { prev, next, index } = neighborIds(effectiveOrder, activeTaskId);
  const activeSummary = activeTaskId == null
    ? undefined
    : tasksById.get(activeTaskId) ?? (pinnedSummary?.id === activeTaskId ? pinnedSummary : undefined);
  const navigateTo = (id: number) => {
    setPinnedSummary(tasksById.get(id));
    setActiveTaskId(id);
  };

  const returnFocus = () => {
    const opener = openerIdRef.current;
    const direct = cardButton(opener);
    if (direct) return direct;
    const alt = opener == null ? null : nearestSurvivingId(navOrder, opener, (id) => !!cardButton(id));
    return cardButton(alt) ?? listHeadingRef.current;
  };

  // ── Deep link: /tasks?task=<id> (task notifications) ──
  // The window loads the task by id itself (GET /tasks/:id enforces access
  // and shows an Arabic error for a deleted/forbidden task), so it opens even
  // when the task is not in the current tab or search.
  const [searchParams, setSearchParams] = useSearchParams();
  const taskParam = searchParams.get('task');
  const [handledTaskParam, setHandledTaskParam] = useState<string | null>(null);
  if (taskParam !== handledTaskParam) {
    // Adjust state while rendering when the URL changes (React's pattern for
    // deriving state from props) — no effect, no extra render pass.
    setHandledTaskParam(taskParam);
    const id = taskParam && /^\d+$/.test(taskParam) ? Number(taskParam) : NaN;
    if (Number.isSafeInteger(id) && id > 0) {
      setNavOrder([id]);
      setPinnedSummary(undefined);
      setActiveTaskId(id);
      setDetailsOpen(true);
    }
  }
  const clearTaskParam = () => {
    if (!searchParams.has('task')) return;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('task');
      return next;
    }, { replace: true });
  };

  const onTaskChanged = (patch: Partial<Task> & { id: number }) => {
    setTasks((ts) => ts.map((t) => (t.id === patch.id ? { ...t, ...patch } : t)));
    // Re-sync stats and the current filter with the server (anchored).
    void refreshInBackground();
  };

  const onCreated = async (task: Task) => {
    setShowCreateModal(false);
    const rows = await refreshInBackground();
    const assignee = task.assigned_to_name ? ` إلى ${task.assigned_to_name}` : '';
    if (rows && !filterTasksBySearch(rows, searchRef.current).some((t) => t.id === task.id)) {
      toast.success(`تم إنشاء المهمة «${task.title}»${assignee} بنجاح — لا تظهر في القائمة الحالية بسبب الفلتر أو البحث المستخدم`, { duration: 7000 });
    } else {
      toast.success(`تم إسناد المهمة «${task.title}»${assignee} بنجاح`);
    }
  };

  // Compact "assign" button in the sticky toolbar once the header's scrolled away.
  const [headerAssignVisible, setHeaderAssignVisible] = useState(true);
  useEffect(() => {
    const btn = headerAssignRef.current;
    if (!btn || typeof IntersectionObserver === 'undefined') return;
    // Viewport root: clipping by the app's scrolling <main> is accounted for.
    const io = new IntersectionObserver(([e]) => setHeaderAssignVisible(e.isIntersecting));
    io.observe(btn);
    return () => io.disconnect();
  }, [canAssignTasks]);

  const filterTabs: { id: FilterTab; label: string }[] = [
    { id: 'all', label: 'الكل' },
    ...(canAssignTasks
      ? [
          { id: 'received' as const, label: 'مهامي المستلمة' },
          { id: 'assigned' as const, label: 'مهام أسندتها' },
        ]
      : []),
    { id: 'open', label: 'مفتوحة' },
    { id: 'closed', label: 'مغلقة' },
  ];

  const busy = phase === 'switching' || refreshing;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
            <div className="p-2.5 bg-indigo-600 text-white rounded-2xl shadow-lg shadow-indigo-500/20">
              <ClipboardList size={24} />
            </div>
            {canAssignTasks ? 'المهام المسؤول عنها' : 'مهامي المستلمة'}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm font-medium">إدارة ومتابعة المهام المسندة ونتائج التنفيذ</p>
        </div>
        {canAssignTasks && (
          <button
            ref={headerAssignRef}
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="w-full md:w-auto bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-500/25 active:scale-95"
          >
            <Plus size={20} />
            إسناد مهمة جديدة
          </button>
        )}
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" aria-live="polite">
        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-xl">
            <ClipboardList size={20} />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">إجمالي المهام</div>
            <div className="text-xl font-extrabold text-slate-900 dark:text-white font-inter">{stats.total}</div>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-xl">
            <Clock size={20} />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">مهام مفتوحة</div>
            <div className="text-xl font-extrabold text-slate-900 dark:text-white font-inter">{stats.open}</div>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-xl">
            <CheckCircle2 size={20} />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">مهام مكتملة</div>
            <div className="text-xl font-extrabold text-slate-900 dark:text-white font-inter">{stats.closed}</div>
          </div>
        </div>
      </div>

      {/* Filters — sticky, so search/filters/assign stay reachable mid-list */}
      <div className="sticky top-0 z-20 -mx-4 md:-mx-6 px-4 md:px-6 py-3 bg-gray-50/95 dark:bg-slate-900/95">
        <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center">
          <div className="relative flex-1 w-full">
            <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={18} />
            <label htmlFor="tasks-search" className="sr-only">بحث في المهام</label>
            <input
              id="tasks-search"
              type="search"
              placeholder="بحث في عنوان المهمة أو الموظف أو رقم الفاتورة..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pr-12 pl-4 py-3.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-sm dark:text-white"
            />
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <div role="tablist" aria-label="تصفية المهام" className="flex flex-1 min-w-0 overflow-x-auto bg-white dark:bg-slate-800 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
              {filterTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={statusFilter === tab.id}
                  onClick={() => changeFilter(tab.id)}
                  className={`shrink-0 px-4 sm:px-5 py-2 text-xs font-bold rounded-xl transition-all whitespace-nowrap ${
                    statusFilter === tab.id
                      ? 'bg-indigo-600 text-white shadow-md'
                      : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            {canAssignTasks && !headerAssignVisible && (
              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                className="shrink-0 h-[46px] px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold text-sm flex items-center gap-1.5 shadow-lg shadow-indigo-500/25 animate-in fade-in"
              >
                <Plus size={18} /> <span className="hidden sm:inline">إسناد مهمة</span><span className="sr-only sm:hidden">إسناد مهمة جديدة</span>
              </button>
            )}
          </div>
        </div>
        {(busy || refreshError) && (
          <div className="mt-2 flex items-center gap-2 text-xs font-semibold" role="status">
            {busy ? (
              <span className="flex items-center gap-1.5 text-slate-400"><Loader2 size={12} className="animate-spin" /> جاري التحديث...</span>
            ) : (
              <span className="flex items-center gap-2 text-red-600 dark:text-red-400">
                <AlertCircle size={12} /> تعذر تحديث القائمة: {refreshError}
                <button type="button" onClick={() => void refreshInBackground()} className="font-bold text-indigo-600 dark:text-indigo-400 hover:underline">إعادة المحاولة</button>
              </span>
            )}
          </div>
        )}
      </div>

      <h2 ref={listHeadingRef} tabIndex={-1} className="sr-only">قائمة المهام</h2>

      {/* Task Grid */}
      {phase === 'initial' ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4" role="status">
          <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
          <p className="text-slate-400 font-bold">جاري تحميل المهام...</p>
        </div>
      ) : phase === 'error' ? (
        <div className="bg-white dark:bg-slate-800 rounded-3xl border border-red-100 dark:border-red-900/40 p-12 flex flex-col items-center justify-center text-center" role="alert">
          <AlertCircle size={40} className="text-red-500 mb-3" />
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">تعذر تحميل المهام</h3>
          <p className="text-slate-500 mt-1 text-sm">{loadError}</p>
          <button type="button" onClick={retryLoad} className="mt-4 flex items-center gap-1.5 px-5 py-2.5 rounded-2xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-700">
            <RotateCcw size={14} /> إعادة المحاولة
          </button>
        </div>
      ) : filteredTasks.length > 0 ? (
        <div
          ref={listRef}
          className={`grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 transition-opacity duration-200 ${phase === 'switching' ? 'opacity-60' : ''}`}
          aria-busy={busy}
        >
          {filteredTasks.map((task) => {
            const isActive = detailsOpen && task.id === activeTaskId;
            const payment = PAYMENT_BADGE[task.invoice_payment_status ?? 0] || PAYMENT_BADGE[0];
            return (
              <div
                key={task.id}
                data-task-id={task.id}
                data-scroll-anchor=""
                onClick={() => openTask(task.id)}
                className={`group bg-white dark:bg-slate-800 rounded-3xl border shadow-sm hover:shadow-xl hover:border-indigo-200 dark:hover:border-indigo-900 transition-[box-shadow,border-color] cursor-pointer overflow-hidden flex flex-col ${
                  isActive ? 'border-indigo-300 dark:border-indigo-700 ring-2 ring-indigo-500/30' : 'border-slate-100 dark:border-slate-700'
                }`}
              >
                <div className="p-6 flex-1">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest ${
                        task.status === 'open'
                          ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400'
                          : 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400'
                      }`}>
                        {task.status === 'open' ? 'مفتوحة' : 'مغلقة'}
                      </div>
                      {task.invoice_id && (
                        <div className="px-3 py-1.5 rounded-xl text-[10px] font-black bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400 border border-blue-100 dark:border-blue-800/30">
                          فاتورة #{task.invoice_number || task.invoice_id}
                        </div>
                      )}
                    </div>
                    <div className="text-[10px] font-bold text-slate-400 flex items-center gap-1 shrink-0">
                      <Clock size={12} />
                      {new Date(task.created_at).toLocaleDateString('ar-SA')}
                    </div>
                  </div>

                  <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2 group-hover:text-indigo-600 transition-colors line-clamp-2">{task.title}</h3>
                  <p className="text-slate-500 dark:text-slate-400 text-xs line-clamp-3 leading-relaxed mb-4">{task.description || 'بدون وصف إضافي'}</p>

                  {task.invoice_id && (
                    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700/50 grid grid-cols-2 gap-3 text-xs bg-slate-50/50 dark:bg-slate-900/10 p-3 rounded-2xl">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">رقم البوليصة AWB:</span>
                        <span className="font-mono font-extrabold text-slate-800 dark:text-slate-200 select-all">{task.invoice_awb || '—'}</span>
                      </div>
                      <div className="flex flex-col gap-0.5 text-left">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">قيمة الفاتورة:</span>
                        <span className="font-inter font-black text-indigo-600 dark:text-indigo-400">
                          {task.invoice_total !== undefined && task.invoice_total !== null ? formatSar(task.invoice_total) : '—'}
                        </span>
                      </div>
                      <div className="flex flex-col gap-1.5 col-span-2 mt-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">حالة السداد:</span>
                        <div>
                          <span className={`inline-flex px-2.5 py-1 rounded-xl text-[10px] font-black border ${payment.cls}`}>
                            {payment.label}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="px-6 py-4 bg-slate-50/50 dark:bg-slate-900/30 border-t border-slate-50 dark:border-slate-700 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
                      <User size={14} />
                    </div>
                    <div className="text-[11px] min-w-0">
                      <div className="text-slate-400 font-bold truncate">المكلف بها: <span className="text-slate-700 dark:text-slate-300">{task.assigned_to_name || '—'}</span></div>
                      {task.assigned_by_name && (
                        <div className="text-slate-400 font-medium text-[10px] truncate">بواسطة: {task.assigned_by_name}</div>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center gap-3">
                  {draftIds.has(task.id) && (
                    <span className="flex items-center gap-1 text-[10px] font-black text-amber-600 dark:text-amber-400" title="يوجد رد لم يُرسل بعد">
                      <PencilLine size={11} /> مسودة رد
                    </span>
                  )}
                  <button
                    type="button"
                    data-task-open={task.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      openTask(task.id);
                    }}
                    aria-label={`فتح تفاصيل المهمة: ${task.title}`}
                    aria-haspopup="dialog"
                    className="shrink-0 flex items-center gap-1.5 px-2 py-1 -mx-2 rounded-lg text-indigo-600 dark:text-indigo-400 font-bold text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                  >
                    <span>التفاصيل</span>
                    <ChevronLeft size={14} />
                  </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-700 p-20 flex flex-col items-center justify-center text-center">
          <div className="p-6 bg-slate-50 dark:bg-slate-900 rounded-full mb-4">
            <ClipboardList size={48} className="text-slate-300 dark:text-slate-600" />
          </div>
          {tasks.length > 0 ? (
            <>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">لا توجد نتائج مطابقة للبحث</h3>
              <button type="button" onClick={() => setSearch('')} className="mt-3 text-sm font-bold text-indigo-600 dark:text-indigo-400 hover:underline">مسح البحث</button>
            </>
          ) : (
            <>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">لا توجد مهام حالياً</h3>
              <p className="text-slate-500 mt-2">
                {canAssignTasks ? 'ابدأ بإسناد أول مهمة للموظفين لمتابعة سير العمل' : 'لا توجد مهام مسندة إليك حالياً'}
              </p>
            </>
          )}
        </div>
      )}

      {/* Modals (portaled to <body>, positioned against the viewport) */}
      {canAssignTasks && (
        <CreateTaskModal
          open={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onCreated={onCreated}
        />
      )}

      <TaskDetailsModal
        open={detailsOpen}
        taskId={activeTaskId}
        summary={activeSummary}
        position={index >= 0 ? { index, total: effectiveOrder.length } : undefined}
        prevId={prev}
        nextId={next}
        onNavigate={navigateTo}
        onClose={() => setDetailsOpen(false)}
        onExited={() => { setActiveTaskId(null); clearTaskParam(); }}
        onTaskChanged={onTaskChanged}
        drafts={drafts}
        returnFocus={returnFocus}
      />
    </div>
  );
};
