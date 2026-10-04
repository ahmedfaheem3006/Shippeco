import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useAppLayout } from '../components/AppLayout/useAppLayout';
import { Dialog } from '../components/shared/Dialog';
import {
  expenseService,
  type ExpenseCategory,
  type ExpenseInput,
  type ExpenseItem,
  type ExpensePaymentMethod,
  type ExpenseStatusFilter,
  type ExpenseSummaryData,
} from '../services/expenseService';
import { useAuthStore } from '../hooks/useAuthStore';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { formatDate, formatMoney, isValidAmount } from '../utils/money';
import { describeApiError, isAbort, isConflict } from '../utils/apiErrors';
import {
  CreditCard, Plus, Search, Filter, Ban, Edit3, Eye, TrendingDown,
  X, Loader2, ChevronLeft, ChevronRight, AlertTriangle, RefreshCw, Paperclip,
} from 'lucide-react';
import toast from 'react-hot-toast';

const PAGE_SIZE = 25;

const CATEGORIES: { value: ExpenseCategory; label: string; color: string }[] = [
  { value: 'operational', label: 'تشغيلية وإدارية', color: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300' },
  { value: 'salaries', label: 'رواتب وأجور', color: 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300' },
  { value: 'assets', label: 'معدات وأصول', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300' },
  { value: 'waste', label: 'هوالك وتالف وخسائر', color: 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300' },
  { value: 'other', label: 'أخرى', color: 'bg-gray-100 text-gray-800 dark:bg-slate-800 dark:text-slate-300' },
];
const categoryOf = (v: string) => CATEGORIES.find((c) => c.value === v) ?? CATEGORIES[4];

const METHODS: { value: ExpensePaymentMethod; label: string }[] = [
  { value: 'cash', label: 'نقدي (كاش)' },
  { value: 'bank_transfer', label: 'تحويل بنكي' },
  { value: 'card', label: 'بطاقة / شبكة' },
];
const methodLabel = (v: string) => METHODS.find((m) => m.value === v)?.label ?? v;

const inputCls = 'w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-bold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500';

/** Today in Saudi time, YYYY-MM-DD. */
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date());
const newRequestId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}-req`);

type FormState = {
  title: string;
  category: ExpenseCategory;
  amount: string;
  expense_date: string;
  payment_method: ExpensePaymentMethod;
  recipient: string;
  notes: string;
};
const emptyForm = (): FormState => ({ title: '', category: 'operational', amount: '', expense_date: today(), payment_method: 'cash', recipient: '', notes: '' });
const formFrom = (e: ExpenseItem): FormState => ({
  title: e.title, category: e.category, amount: e.amount, expense_date: e.expense_date,
  payment_method: (METHODS.some((m) => m.value === e.payment_method) ? e.payment_method : 'cash') as ExpensePaymentMethod,
  recipient: e.recipient || '', notes: e.notes || '',
});

function validate(f: FormState): Partial<Record<keyof FormState, string>> {
  const errors: Partial<Record<keyof FormState, string>> = {};
  if (!f.title.trim()) errors.title = 'بيان المصروف مطلوب';
  else if (f.title.trim().length > 255) errors.title = 'البيان أطول من 255 حرفًا';
  if (!isValidAmount(f.amount)) errors.amount = 'أدخل مبلغًا أكبر من صفر بحد أقصى منزلتين عشريتين';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.expense_date)) errors.expense_date = 'التاريخ مطلوب';
  if (f.notes.length > 2000) errors.notes = 'الملاحظات أطول من 2000 حرف';
  return errors;
}

export function ExpensesPage() {
  useAppLayout();
  const role = useAuthStore((s) => s.user?.role);
  const canWrite = !!role && role !== 'viewer';
  const canCancel = role === 'admin' || role === 'manager' || role === 'accountant';

  // ── filters / list ──
  const [searchInput, setSearchInput] = useState('');
  const search = useDebouncedValue(searchInput.trim(), 400);
  const [category, setCategory] = useState('ALL');
  const [status, setStatus] = useState<ExpenseStatusFilter>('active');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);
  // Any filter change starts again from page 1 (adjusted while rendering —
  // the debounced search arrives after the keystroke).
  const filterKey = [search, category, status, startDate, endDate].join('|');
  const [lastFilterKey, setLastFilterKey] = useState(filterKey);
  if (filterKey !== lastFilterKey) {
    setLastFilterKey(filterKey);
    setPage(1);
  }

  const [summary, setSummary] = useState<ExpenseSummaryData | null>(null);
  const [rows, setRows] = useState<ExpenseItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalAmount, setTotalAmount] = useState('0');
  const [categoryTotals, setCategoryTotals] = useState<Record<string, { sum: string; count: number }>>({});
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const hasLoaded = useRef(false);

  const loadSummary = useCallback(() => {
    expenseService.getSummary().then(setSummary).catch((err) => console.error('[Expenses] summary failed', err));
  }, []);
  useEffect(loadSummary, [loadSummary]);

  useEffect(() => {
    const ctrl = new AbortController();
    if (hasLoaded.current) setRefreshing(true); else setPhase('loading');
    expenseService
      .getExpenses({ page, limit: PAGE_SIZE, search, category, status, startDate, endDate }, ctrl.signal)
      .then((res) => {
        setRows(res.expenses);
        setTotal(res.total);
        setTotalAmount(res.totalAmount);
        setCategoryTotals(res.categoryTotals);
        setLoadError(null);
        setPhase('ready');
        hasLoaded.current = true;
      })
      .catch((err) => {
        if (isAbort(err)) return;
        setLoadError(describeApiError(err, 'تعذر تحميل المصروفات'));
        if (!hasLoaded.current) setPhase('error');
      })
      .finally(() => { if (!ctrl.signal.aborted) setRefreshing(false); });
    return () => ctrl.abort();
  }, [page, search, category, status, startDate, endDate, reloadKey]);

  const refreshAll = () => { loadSummary(); setReloadKey((k) => k + 1); };
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // ── form dialog ──
  const formTitleId = useId();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseItem | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<ExpenseItem | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const requestIdRef = useRef<string>('');
  const [initialForm, setInitialForm] = useState<FormState>(emptyForm);

  const openCreate = () => {
    const f = emptyForm();
    setEditing(null); setForm(f); setInitialForm(f);
    setFormErrors({}); setFormError(null); setConflict(null);
    requestIdRef.current = newRequestId(); // reused by retries of THIS form
    setFormOpen(true);
  };
  const openEdit = (e: ExpenseItem) => {
    const f = formFrom(e);
    setEditing(e); setForm(f); setInitialForm(f);
    setFormErrors({}); setFormError(null); setConflict(null);
    setFormOpen(true);
  };
  const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm);
  const requestCloseForm = () => {
    if (saving) return;
    if (isDirty && !window.confirm('لديك تعديلات غير محفوظة — هل تريد إغلاق النموذج وتجاهلها؟')) return;
    setFormOpen(false);
  };

  const submitForm = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (savingRef.current) return; // double click / Enter spam
    const errors = validate(form);
    setFormErrors(errors);
    if (Object.keys(errors).length) return;

    const payload: ExpenseInput = {
      title: form.title.trim(),
      category: form.category,
      amount: form.amount.trim(),
      expense_date: form.expense_date,
      payment_method: form.payment_method,
      recipient: form.recipient.trim() || null,
      notes: form.notes.trim() || null,
    };
    savingRef.current = true;
    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        await expenseService.updateExpense(editing.id, payload, (conflict ?? editing).updated_at);
        toast.success('تم حفظ تعديل المصروف');
      } else {
        const created = await expenseService.createExpense(payload, requestIdRef.current);
        toast.success(created.duplicate ? 'هذا المصروف محفوظ مسبقًا — لم يُسجّل مرة ثانية' : 'تم تسجيل المصروف');
      }
      setFormOpen(false);
      refreshAll();
    } catch (err) {
      // The form keeps everything the user typed; the same request id is
      // reused, so retrying after a lost response cannot create a duplicate.
      if (editing && isConflict(err)) {
        try {
          const latest = await expenseService.getExpense(editing.id);
          if (latest.status === 'cancelled') {
            setFormError('تم إلغاء هذا المصروف من مستخدم آخر — لا يمكن تعديله');
          } else {
            setConflict(latest);
            setFormError('عدّل مستخدم آخر هذا المصروف بعد فتحك له. راجع القيم الحالية أدناه، ثم احفظ مرة أخرى لاعتماد تعديلك.');
          }
        } catch (e2) {
          setFormError(describeApiError(e2, 'تعذر تحميل النسخة الحالية'));
        }
      } else {
        setFormError(describeApiError(err, 'لم يتم حفظ المصروف — أعد المحاولة'));
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  // ── details / cancel dialogs ──
  const detailsTitleId = useId();
  const [details, setDetails] = useState<ExpenseItem | null>(null);
  const cancelTitleId = useId();
  const [cancelling, setCancelling] = useState<ExpenseItem | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const confirmCancel = async () => {
    if (!cancelling || cancelBusy) return;
    setCancelBusy(true);
    setCancelError(null);
    try {
      await expenseService.cancelExpense(cancelling.id, cancelReason.trim() || null);
      toast.success('تم إلغاء المصروف — سيبقى في السجل ولا يدخل في الإجماليات');
      setCancelling(null);
      setDetails(null);
      refreshAll();
    } catch (err) {
      setCancelError(describeApiError(err, 'تعذر إلغاء المصروف'));
    } finally {
      setCancelBusy(false);
    }
  };

  const setField = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-600 text-white flex items-center justify-center shadow-lg shadow-emerald-500/20 shrink-0">
            <CreditCard size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">إدارة المصروفات والنفقات</h1>
            <p className="text-sm text-gray-500 dark:text-slate-400 mt-1 font-medium">قيد مصروفات الشركة ومتابعتها — الإلغاء يحتفظ بالسجل ويستبعده من الإجماليات</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={refreshAll} disabled={refreshing} title="تحديث"
            className="p-3 bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 rounded-xl hover:bg-gray-200 disabled:opacity-50">
            <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
          </button>
          {canWrite && (
            <button type="button" onClick={openCreate}
              className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-emerald-500/25 hover:from-emerald-700 hover:to-teal-700">
              <Plus size={18} /> إضافة مصروف
            </button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-gray-500 dark:text-slate-400">إجمالي الشهر الحالي</span>
            <TrendingDown size={18} className="text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-gray-900 dark:text-white font-mono" dir="ltr">{formatMoney(summary?.totalThisMonth ?? '0')}</div>
          <div className="text-xs text-gray-400 mt-1">{summary?.countThisMonth ?? 0} مصروف نشط هذا الشهر (بتوقيت السعودية) — لا يتأثر بالفلاتر</div>
        </div>
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm" data-testid="expenses-filtered-total">
          <div className="text-xs font-bold text-gray-500 dark:text-slate-400 mb-2">إجمالي النتائج المطابقة للفلاتر</div>
          <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono" dir="ltr">{formatMoney(totalAmount)}</div>
          <div className="text-xs text-gray-400 mt-1">{total} مصروف {status === 'cancelled' ? 'ملغى' : status === 'all' ? '(نشطة وملغاة)' : 'نشط'} — كل الصفحات</div>
        </div>
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm">
          <div className="text-xs font-bold text-gray-500 dark:text-slate-400 mb-2">حسب التصنيف (الفلاتر الحالية)</div>
          <ul className="space-y-1 text-xs">
            {CATEGORIES.map((c) => (
              <li key={c.value} className="flex justify-between gap-2">
                <span className="font-bold text-gray-600 dark:text-slate-300">{c.label} <span className="text-gray-400">({categoryTotals[c.value]?.count ?? 0})</span></span>
                <span className="font-mono font-bold" dir="ltr">{formatMoney(categoryTotals[c.value]?.sum ?? '0')}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <div className="relative sm:col-span-2">
            <Search className="absolute right-3.5 top-3 text-gray-400" size={18} />
            <input type="search" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} aria-label="بحث"
              placeholder="ابحث بالبيان أو المستلم أو الملاحظات..." className={`${inputCls} pr-10`} />
          </div>
          <select aria-label="التصنيف" value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
            <option value="ALL">جميع التصنيفات</option>
            {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <select aria-label="الحالة" value={status} onChange={(e) => setStatus(e.target.value as ExpenseStatusFilter)} className={inputCls}>
            <option value="active">المصروفات النشطة</option>
            <option value="cancelled">الملغاة</option>
            <option value="all">الكل</option>
          </select>
          <input type="date" aria-label="من تاريخ" value={startDate} max={endDate || undefined} onChange={(e) => setStartDate(e.target.value)} className={inputCls} />
          <input type="date" aria-label="إلى تاريخ" value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)} className={inputCls} />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100 dark:border-slate-800 flex flex-wrap gap-2 justify-between items-center">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Filter size={18} className="text-emerald-600 dark:text-emerald-400" /> سجل المصروفات ({total})
            {refreshing && <Loader2 size={16} className="animate-spin text-emerald-500" aria-label="جاري التحديث" />}
          </h2>
          {loadError && phase === 'ready' && (
            <span className="text-xs font-bold text-red-600">{loadError} — <button type="button" className="underline" onClick={() => setReloadKey((k) => k + 1)}>إعادة المحاولة</button></span>
          )}
        </div>

        {phase === 'loading' ? (
          <div className="p-12 text-center text-gray-500 flex flex-col items-center gap-3"><Loader2 size={32} className="animate-spin text-emerald-600" /><span>جاري تحميل المصروفات...</span></div>
        ) : phase === 'error' ? (
          <div className="p-12 text-center flex flex-col items-center gap-3">
            <AlertTriangle size={32} className="text-red-500" />
            <p className="font-bold text-red-600">{loadError}</p>
            <button type="button" onClick={() => setReloadKey((k) => k + 1)} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold">إعادة المحاولة</button>
          </div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-gray-500 dark:text-slate-400">لا توجد مصروفات تطابق الفلاتر الحالية</div>
        ) : (
          <div className={`overflow-x-auto transition-opacity motion-reduce:transition-none ${refreshing ? 'opacity-60' : ''}`}>
            <table className="w-full text-right border-collapse text-sm min-w-[880px]">
              <thead>
                <tr className="bg-gray-50 dark:bg-slate-800/60 text-gray-500 dark:text-slate-400 text-xs font-bold border-b border-gray-100 dark:border-slate-800">
                  <th className="py-3 px-3">التاريخ</th>
                  <th className="py-3 px-3">البيان</th>
                  <th className="py-3 px-3">التصنيف</th>
                  <th className="py-3 px-3 text-left">المبلغ</th>
                  <th className="py-3 px-3">المستلم</th>
                  <th className="py-3 px-3">طريقة الدفع</th>
                  <th className="py-3 px-3 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-800 font-medium">
                {rows.map((exp) => {
                  const cat = categoryOf(exp.category);
                  const cancelled = exp.status === 'cancelled';
                  return (
                    <tr key={exp.id} className={`hover:bg-gray-50/80 dark:hover:bg-slate-800/40 ${cancelled ? 'opacity-60' : ''}`}>
                      <td className="py-3 px-3 text-gray-600 dark:text-slate-300 font-mono text-xs" dir="ltr">{formatDate(exp.expense_date)}</td>
                      <td className="py-3 px-3">
                        <div className={`font-bold text-gray-900 dark:text-white ${cancelled ? 'line-through' : ''}`}>{exp.title}</div>
                        {exp.notes && <div className="text-xs text-gray-400 mt-0.5 line-clamp-1">{exp.notes}</div>}
                        {cancelled && <span className="inline-block mt-1 text-[10px] font-bold text-red-600 bg-red-50 dark:bg-red-950/40 px-1.5 py-0.5 rounded">ملغى</span>}
                      </td>
                      <td className="py-3 px-3"><span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-bold ${cat.color}`}>{cat.label}</span></td>
                      <td className="py-3 px-3 font-mono font-bold text-emerald-700 dark:text-emerald-400 text-left" dir="ltr">{formatMoney(exp.amount)}</td>
                      <td className="py-3 px-3 text-gray-700 dark:text-slate-300">{exp.recipient || '—'}</td>
                      <td className="py-3 px-3 text-xs font-bold text-gray-500 dark:text-slate-400">{methodLabel(exp.payment_method)}</td>
                      <td className="py-3 px-3">
                        <div className="flex items-center justify-center gap-1">
                          <button type="button" onClick={() => setDetails(exp)} title="التفاصيل" className="p-1.5 text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg"><Eye size={16} /></button>
                          {canWrite && !cancelled && (
                            <button type="button" onClick={() => openEdit(exp)} title="تعديل" className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded-lg"><Edit3 size={16} /></button>
                          )}
                          {canCancel && !cancelled && (
                            <button type="button" onClick={() => { setCancelling(exp); setCancelReason(''); setCancelError(null); }} title="إلغاء المصروف"
                              className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 rounded-lg"><Ban size={16} /></button>
                          )}
                        </div>
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
            <div className="text-xs font-bold text-gray-500 dark:text-slate-400">الصفحة <span className="font-mono">{page}</span> من <span className="font-mono">{totalPages}</span> — {total} مصروف</div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1 || refreshing}
                className="px-3 py-1.5 rounded-lg text-xs font-bold border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-50 flex items-center gap-1"><ChevronRight size={14} /> السابق</button>
              <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages || refreshing}
                className="px-3 py-1.5 rounded-lg text-xs font-bold border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-50 flex items-center gap-1">التالي <ChevronLeft size={14} /></button>
            </div>
          </div>
        )}
      </div>

      {/* ── Add / edit ── */}
      <Dialog open={formOpen} onRequestClose={requestCloseForm} labelledBy={formTitleId} panelClassName="sm:max-w-lg">
        <form onSubmit={submitForm} className="flex flex-col min-h-0 flex-1" noValidate>
          <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between">
            <h3 id={formTitleId} className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <CreditCard size={20} className="text-emerald-600" /> {editing ? 'تعديل المصروف' : 'قيد مصروف جديد'}
            </h3>
            <button type="button" onClick={requestCloseForm} disabled={saving} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg" aria-label="إغلاق"><X size={20} /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {formError && <div role="alert" className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 text-sm font-bold text-red-700 dark:text-red-300">{formError}</div>}
            {conflict && (
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 text-xs text-amber-900 dark:text-amber-200 space-y-1">
                <div className="font-bold">القيم المحفوظة حاليًا في النظام:</div>
                <div>{conflict.title} — <span dir="ltr" className="font-mono">{formatMoney(conflict.amount)}</span> — {formatDate(conflict.expense_date)} — {categoryOf(conflict.category).label}</div>
                <button type="button" className="underline font-bold" onClick={() => { const f = formFrom(conflict); setForm(f); setInitialForm(f); setEditing(conflict); setConflict(null); setFormError(null); }}>
                  استبدال تعديلي بالقيم الحالية
                </button>
              </div>
            )}
            <label className="block">
              <span className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1.5">بيان المصروف *</span>
              <input value={form.title} onChange={(e) => setField('title', e.target.value)} maxLength={255} className={inputCls} placeholder="مثال: راتب موظف، شراء كراتين شحن..." aria-invalid={!!formErrors.title} />
              {formErrors.title && <span className="text-xs text-red-600 font-bold">{formErrors.title}</span>}
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="block">
                <span className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1.5">التصنيف *</span>
                <select value={form.category} onChange={(e) => setField('category', e.target.value as ExpenseCategory)} className={inputCls}>
                  {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1.5">المبلغ (ر.س) *</span>
                <input value={form.amount} onChange={(e) => setField('amount', e.target.value.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace('٫', '.'))}
                  inputMode="decimal" dir="ltr" placeholder="0.00" className={`${inputCls} font-mono text-left`} aria-invalid={!!formErrors.amount} />
                {formErrors.amount && <span className="text-xs text-red-600 font-bold">{formErrors.amount}</span>}
              </label>
              <label className="block">
                <span className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1.5">تاريخ المصروف *</span>
                <input type="date" value={form.expense_date} onChange={(e) => setField('expense_date', e.target.value)} className={inputCls} aria-invalid={!!formErrors.expense_date} />
                {formErrors.expense_date && <span className="text-xs text-red-600 font-bold">{formErrors.expense_date}</span>}
              </label>
              <label className="block">
                <span className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1.5">طريقة الدفع</span>
                <select value={form.payment_method} onChange={(e) => setField('payment_method', e.target.value as ExpensePaymentMethod)} className={inputCls}>
                  {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </label>
            </div>
            <label className="block">
              <span className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1.5">المستلم / الموظف</span>
              <input value={form.recipient} onChange={(e) => setField('recipient', e.target.value)} maxLength={255} className={inputCls} />
            </label>
            <label className="block">
              <span className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1.5">ملاحظات</span>
              <textarea rows={2} value={form.notes} onChange={(e) => setField('notes', e.target.value)} maxLength={2000} className={inputCls} />
              {formErrors.notes && <span className="text-xs text-red-600 font-bold">{formErrors.notes}</span>}
            </label>
          </div>
          <div className="px-5 py-4 flex items-center justify-end gap-3 border-t border-gray-100 dark:border-slate-700">
            <button type="button" onClick={requestCloseForm} disabled={saving} className="px-4 py-2.5 text-sm font-bold text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl">إغلاق</button>
            <button type="submit" disabled={saving} className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold flex items-center gap-2 disabled:opacity-60">
              {saving && <Loader2 size={16} className="animate-spin" />} {formError && !conflict ? 'إعادة المحاولة' : 'حفظ المصروف'}
            </button>
          </div>
        </form>
      </Dialog>

      {/* ── Details ── */}
      <Dialog open={Boolean(details)} onRequestClose={() => setDetails(null)} labelledBy={detailsTitleId} panelClassName="sm:max-w-lg">
        {details && (
          <>
            <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between">
              <h3 id={detailsTitleId} className="text-lg font-bold text-gray-900 dark:text-white">تفاصيل المصروف</h3>
              <button type="button" onClick={() => setDetails(null)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg" aria-label="إغلاق"><X size={20} /></button>
            </div>
            <dl className="flex-1 overflow-y-auto p-5 grid grid-cols-3 gap-x-3 gap-y-3 text-sm">
              {([
                ['البيان', details.title],
                ['المبلغ', <span key="a" dir="ltr" className="font-mono">{formatMoney(details.amount)}</span>],
                ['التاريخ', formatDate(details.expense_date)],
                ['التصنيف', categoryOf(details.category).label],
                ['طريقة الدفع', methodLabel(details.payment_method)],
                ['المستلم', details.recipient || '—'],
                ['ملاحظات', details.notes || '—'],
                ['أضافه', details.creator_name || '—'],
                ['الحالة', details.status === 'cancelled' ? `ملغى ${details.cancelled_by_name ? `بواسطة ${details.cancelled_by_name}` : ''} ${details.cancel_reason ? `— ${details.cancel_reason}` : ''}` : 'نشط'],
              ] as [string, React.ReactNode][]).map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="font-bold text-gray-500 dark:text-slate-400">{k}</dt>
                  <dd className="col-span-2 font-bold text-gray-900 dark:text-white break-words">{v}</dd>
                </div>
              ))}
              {details.attachment_url && (
                <div className="contents">
                  <dt className="font-bold text-gray-500 dark:text-slate-400">مرفق</dt>
                  <dd className="col-span-2"><a href={details.attachment_url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 font-bold inline-flex items-center gap-1"><Paperclip size={14} /> فتح المرفق</a></dd>
                </div>
              )}
            </dl>
            {details.status === 'active' && (canWrite || canCancel) && (
              <div className="px-5 py-4 flex items-center justify-end gap-3 border-t border-gray-100 dark:border-slate-700">
                {canCancel && (
                  <button type="button" onClick={() => { const d = details; setDetails(null); setCancelling(d); setCancelReason(''); setCancelError(null); }} className="px-4 py-2.5 text-sm font-bold text-red-600 hover:bg-red-50 rounded-xl flex items-center gap-1"><Ban size={16} /> إلغاء المصروف</button>
                )}
                {canWrite && (
                  <button type="button" onClick={() => { const d = details; setDetails(null); openEdit(d); }} className="px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold flex items-center gap-1"><Edit3 size={16} /> تعديل</button>
                )}
              </div>
            )}
          </>
        )}
      </Dialog>

      {/* ── Cancel confirmation ── */}
      <Dialog open={Boolean(cancelling)} onRequestClose={() => { if (!cancelBusy) setCancelling(null); }} labelledBy={cancelTitleId} panelClassName="sm:max-w-md">
        {cancelling && (
          <>
            <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-700">
              <h3 id={cancelTitleId} className="text-lg font-bold text-red-600 flex items-center gap-2"><Ban size={20} /> إلغاء المصروف</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-3 text-sm">
              <p className="font-bold text-gray-800 dark:text-slate-200">
                {cancelling.title} — <span dir="ltr" className="font-mono">{formatMoney(cancelling.amount)}</span> — {formatDate(cancelling.expense_date)}
              </p>
              <p className="text-gray-600 dark:text-slate-400">سيُستبعد من كل الإجماليات ويبقى في السجل (فلتر «الملغاة») مع اسمك ووقت الإلغاء. لا يمكن التراجع من الواجهة.</p>
              <label className="block">
                <span className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1.5">سبب الإلغاء (اختياري)</span>
                <textarea rows={2} maxLength={500} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} className={inputCls} />
              </label>
              {cancelError && <div role="alert" className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 font-bold">{cancelError}</div>}
            </div>
            <div className="px-5 py-4 flex items-center justify-end gap-3 border-t border-gray-100 dark:border-slate-700">
              <button type="button" onClick={() => setCancelling(null)} disabled={cancelBusy} className="px-4 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl">تراجع</button>
              <button type="button" onClick={confirmCancel} disabled={cancelBusy} className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-bold flex items-center gap-2 disabled:opacity-60">
                {cancelBusy && <Loader2 size={16} className="animate-spin" />} تأكيد الإلغاء
              </button>
            </div>
          </>
        )}
      </Dialog>
    </div>
  );
}
