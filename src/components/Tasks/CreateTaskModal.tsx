import React, { useEffect, useId, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { X, ClipboardList, Send, User, FileText, AlertCircle, RotateCcw, Loader2 } from 'lucide-react';
import { tasksService, type Task } from '../../services/tasks.service';
import { unifiedService } from '../../services/unifiedService';
import { api } from '../../utils/apiClient';
import { Dialog } from '../shared/Dialog';
import { TaskPicker, type PickerOption } from './TaskPicker';
import {
  ROLE_LABELS, TASK_TEXT_MAX, TASK_TITLE_MAX, describeTaskError, fieldErrorsFrom, isAbortError, validateTaskForm,
  type TaskFormErrors, type TaskFormField,
} from './taskUtils';

interface CreateTaskModalProps {
  open: boolean;
  onClose: () => void;
  /** Called only after the API confirmed the save, with the stored task. */
  onCreated: (task: Task) => void;
}

type FormHandle = { requestClose: () => void };

export const CreateTaskModal: React.FC<CreateTaskModalProps> = ({ open, onClose, onCreated }) => {
  const formRef = useRef<FormHandle>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const headingId = useId();
  return (
    <Dialog
      open={open}
      onRequestClose={() => (formRef.current ? formRef.current.requestClose() : onClose())}
      labelledBy={headingId}
      initialFocusRef={titleRef as React.RefObject<HTMLElement>}
      panelClassName="sm:max-w-xl"
    >
      <CreateTaskForm ref={formRef} headingId={headingId} titleRef={titleRef} onClose={onClose} onCreated={onCreated} />
    </Dialog>
  );
};

type FormProps = {
  headingId: string;
  titleRef: React.RefObject<HTMLInputElement>;
  onClose: () => void;
  onCreated: (task: Task) => void;
};

const CreateTaskForm = React.forwardRef<FormHandle, FormProps>(function CreateTaskForm(
  { headingId, titleRef, onClose, onCreated },
  ref,
) {
  const uid = useId();
  const formId = `${uid}-form`;
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assignedTo, setAssignedTo] = useState<number | null>(null);
  const [invoiceId, setInvoiceId] = useState<number | null>(null);
  const [invoiceLabel, setInvoiceLabel] = useState<string | undefined>();

  const [touched, setTouched] = useState<Partial<Record<TaskFormField, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<TaskFormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  // ── Employees ──
  const [users, setUsers] = useState<{ id: number; full_name: string; role: string }[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [usersReload, setUsersReload] = useState(0);
  useEffect(() => {
    let alive = true;
    unifiedService.get<unknown>('/users/list').then(
      (res) => {
        if (!alive) return;
        const list = res && typeof res === 'object' && 'success' in res ? (res as { data?: unknown }).data : res;
        setUsers(Array.isArray(list) ? list : []);
        setUsersLoading(false);
      },
      (err) => {
        if (!alive) return;
        setUsersError(describeTaskError(err, 'تعذر تحميل قائمة الموظفين'));
        setUsersLoading(false);
      },
    );
    return () => {
      alive = false;
    };
  }, [usersReload]);
  const loadUsers = () => {
    setUsersLoading(true);
    setUsersError(null);
    setUsersReload((n) => n + 1);
  };
  const userOptions: PickerOption[] = useMemo(
    () => users.map((u) => ({ value: u.id, label: u.full_name, hint: ROLE_LABELS[u.role] ?? u.role })),
    [users],
  );

  // ── Invoices (optional link, searched on the server) ──
  const [invoiceQuery, setInvoiceQuery] = useState('');
  const [invoiceOptions, setInvoiceOptions] = useState<PickerOption[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [invoicesError, setInvoicesError] = useState<string | null>(null);
  const [invoiceReload, setInvoiceReload] = useState(0);
  const [invoiceSearchActive, setInvoiceSearchActive] = useState(false);
  useEffect(() => {
    if (!invoiceSearchActive) return;
    const ctrl = new AbortController();
    // Debounce typing; the abort also drops any slower, older response.
    const t = window.setTimeout(async () => {
      setInvoicesLoading(true);
      setInvoicesError(null);
      try {
        const qp = new URLSearchParams({ limit: '8' });
        if (invoiceQuery.trim()) qp.set('search', invoiceQuery.trim());
        type InvoiceRow = { id: number | string; invoice_number?: string | null; client_name?: string | null; awb?: string | null };
        const res = await api.get<InvoiceRow[] | { data?: InvoiceRow[] }>(`/invoices?${qp}`, { signal: ctrl.signal });
        const rows: InvoiceRow[] = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
        setInvoiceOptions(rows.map((i) => ({
          value: Number(i.id),
          label: `#${i.invoice_number ?? i.id}${i.client_name ? ` — ${i.client_name}` : ''}`,
          hint: i.awb ? `AWB ${i.awb}` : undefined,
        })));
      } catch (err) {
        if (!isAbortError(err)) setInvoicesError(describeTaskError(err, 'تعذر تحميل الفواتير'));
      } finally {
        if (!ctrl.signal.aborted) setInvoicesLoading(false);
      }
    }, invoiceQuery ? 250 : 0);
    return () => {
      window.clearTimeout(t);
      ctrl.abort();
    };
  }, [invoiceQuery, invoiceSearchActive, invoiceReload]);

  // ── Validation ──
  const clientErrors = validateTaskForm({ title, description, assignedTo, invoiceId });
  const errorFor = (f: TaskFormField) => serverErrors[f] ?? ((submitted || touched[f]) ? clientErrors[f] : undefined);
  const dirty = !!(title.trim() || description.trim() || assignedTo || invoiceId);

  const requestClose = () => {
    if (submittingRef.current) return; // wait for the server's answer
    if (dirty) setConfirmDiscard(true);
    else onClose();
  };
  useImperativeHandle(ref, () => ({ requestClose }));

  const focusField = (f: TaskFormField) => {
    const el = document.getElementById(`${uid}-${f}`);
    el?.focus({ preventScroll: true });
    el?.scrollIntoView({ block: 'nearest' }); // only the form body scrolls; the dialog is outside the page
  };

  const submit = async () => {
    if (submittingRef.current) return; // double click / Enter + click
    setSubmitted(true);
    setConfirmDiscard(false);
    const errs = validateTaskForm({ title, description, assignedTo, invoiceId });
    const first = (['title', 'assigned_to', 'invoice_id', 'description'] as TaskFormField[]).find((f) => errs[f]);
    if (first) {
      focusField(first);
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    setServerErrors({});
    try {
      const task = await tasksService.createTask({
        title: title.trim(),
        description: description.trim() || undefined,
        assigned_to: assignedTo!,
        invoice_id: invoiceId,
      });
      if (!task || typeof task.id !== 'number') throw new Error('استجابة غير متوقعة من الخادم، لم يتم تأكيد الحفظ');
      onCreated(task);
    } catch (err) {
      const fe = fieldErrorsFrom(err);
      setServerErrors(fe);
      setSubmitError(describeTaskError(err, 'تعذر إنشاء المهمة'));
      const firstServer = (Object.keys(fe) as TaskFormField[])[0];
      if (firstServer) focusField(firstServer);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const labelCls = 'block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5';
  const inputCls = (bad: boolean) =>
    `w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border rounded-2xl text-sm outline-none transition-colors focus:ring-2 focus:ring-indigo-500 dark:text-white ${
      bad ? 'border-red-400 dark:border-red-500' : 'border-slate-200 dark:border-slate-700'
    }`;
  // Plain render helper (not a nested component) so the same <p> node stays
  // mounted across re-renders instead of being replaced each time.
  const fieldError = (f: TaskFormField) =>
    errorFor(f) ? (
      <p id={`${uid}-${f}-err`} className="mt-1.5 text-xs font-semibold text-red-600 dark:text-red-400 flex items-center gap-1">
        <AlertCircle size={12} className="shrink-0" /> {errorFor(f)}
      </p>
    ) : null;

  return (
    <>
      {/* Header */}
      <div className="shrink-0 px-5 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-xl shrink-0">
            <ClipboardList size={20} />
          </div>
          <div className="min-w-0">
            <h2 id={headingId} className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">إسناد مهمة جديدة</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">ستظهر المهمة للموظف المختار فور حفظها</p>
          </div>
        </div>
        <button
          type="button"
          onClick={requestClose}
          disabled={submitting}
          aria-label="إغلاق"
          className="p-2 rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-600 transition-colors disabled:opacity-40"
        >
          <X size={20} />
        </button>
      </div>

      {/* Body */}
      <form
        id={formId}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 sm:px-6 py-5 space-y-5"
        aria-busy={submitting}
      >
        <div>
          <label htmlFor={`${uid}-title`} className={labelCls}>
            عنوان المهمة <span className="text-red-500" aria-hidden="true">*</span>
          </label>
          <input
            ref={titleRef}
            id={`${uid}-title`}
            type="text"
            value={title}
            maxLength={TASK_TITLE_MAX + 20}
            onChange={(e) => {
              setTitle(e.target.value);
              setServerErrors((s) => ({ ...s, title: undefined }));
            }}
            onBlur={() => setTouched((t) => ({ ...t, title: true }))}
            placeholder="مثال: مراجعة فواتير شركة ارامكس"
            aria-required="true"
            aria-invalid={!!errorFor('title') || undefined}
            aria-describedby={errorFor('title') ? `${uid}-title-err` : undefined}
            disabled={submitting}
            className={inputCls(!!errorFor('title'))}
          />
          {fieldError('title')}
        </div>

        <div>
          <span id={`${uid}-assigned_to-label`} className={labelCls}>
            الموظف المسؤول <span className="text-red-500" aria-hidden="true">*</span>
          </span>
          <TaskPicker
            id={`${uid}-assigned_to`}
            labelId={`${uid}-assigned_to-label`}
            options={userOptions}
            value={assignedTo}
            onChange={(v) => {
              setAssignedTo(v);
              setTouched((t) => ({ ...t, assigned_to: true }));
              setServerErrors((s) => ({ ...s, assigned_to: undefined }));
            }}
            placeholder="اختر الموظف..."
            searchPlaceholder="ابحث بالاسم أو الدور..."
            emptyText="لا يوجد موظف بهذا الاسم"
            loading={usersLoading}
            loadError={usersError}
            onRetry={loadUsers}
            disabled={submitting}
            invalid={!!errorFor('assigned_to')}
            describedBy={errorFor('assigned_to') ? `${uid}-assigned_to-err` : undefined}
            icon={<User size={16} />}
          />
          {usersError && !usersLoading && (
            <p className="mt-1.5 text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
              {usersError}
              <button type="button" onClick={loadUsers} className="font-bold text-indigo-600 dark:text-indigo-400 hover:underline">إعادة المحاولة</button>
            </p>
          )}
          {fieldError('assigned_to')}
        </div>

        <div>
          <span id={`${uid}-invoice_id-label`} className={labelCls}>
            ربط بفاتورة <span className="font-medium text-slate-400">(اختياري)</span>
          </span>
          <TaskPicker
            id={`${uid}-invoice_id`}
            labelId={`${uid}-invoice_id-label`}
            options={invoiceOptions}
            value={invoiceId}
            valueLabel={invoiceLabel}
            onChange={(v, o) => {
              setInvoiceId(v);
              setInvoiceLabel(o?.label);
              setServerErrors((s) => ({ ...s, invoice_id: undefined }));
            }}
            onQueryChange={(q) => {
              setInvoiceSearchActive(true);
              setInvoiceQuery(q);
            }}
            placeholder="بدون فاتورة"
            searchPlaceholder="رقم الفاتورة أو AWB أو اسم العميل..."
            emptyText="لا توجد فواتير مطابقة"
            loading={invoicesLoading}
            loadError={invoicesError}
            onRetry={() => setInvoiceReload((n) => n + 1)}
            clearable
            disabled={submitting}
            invalid={!!errorFor('invoice_id')}
            describedBy={errorFor('invoice_id') ? `${uid}-invoice_id-err` : undefined}
            icon={<FileText size={16} />}
          />
          {fieldError('invoice_id')}
        </div>

        <div>
          <label htmlFor={`${uid}-description`} className={labelCls}>التفاصيل</label>
          <textarea
            id={`${uid}-description`}
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, description: true }))}
            placeholder="اكتب تفاصيل المهمة هنا..."
            aria-invalid={!!errorFor('description') || undefined}
            aria-describedby={`${uid}-description-count${errorFor('description') ? ` ${uid}-description-err` : ''}`}
            disabled={submitting}
            className={`${inputCls(!!errorFor('description'))} resize-y min-h-[96px]`}
          />
          <div className="flex justify-between gap-2">
            {fieldError('description')}
            <span id={`${uid}-description-count`} className="mt-1 mr-auto text-[11px] text-slate-400 tabular-nums">
              {description.length.toLocaleString('en-US')} / {TASK_TEXT_MAX.toLocaleString('en-US')}
            </span>
          </div>
        </div>
      </form>

      {/* Footer — always visible */}
      <div className="shrink-0 px-5 sm:px-6 py-4 border-t border-slate-100 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/30 space-y-3">
        {submitError && (
          <div role="alert" className="flex items-start gap-2 p-3 rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/40 text-sm text-red-700 dark:text-red-300">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold">لم يتم حفظ المهمة</p>
              <p className="text-xs mt-0.5">{submitError}. بياناتك محفوظة في النموذج.</p>
            </div>
            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 border border-red-200 dark:border-red-900 hover:bg-red-100 dark:hover:bg-red-900/40"
            >
              <RotateCcw size={12} /> إعادة المحاولة
            </button>
          </div>
        )}
        {confirmDiscard ? (
          <div role="alertdialog" aria-label="تأكيد الإغلاق" className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/40">
            <p className="flex-1 text-sm font-semibold text-amber-800 dark:text-amber-300">لديك بيانات لم تُحفظ. هل تريد إغلاق النموذج وتجاهلها؟</p>
            <div className="flex gap-2">
              <button type="button" autoFocus onClick={() => setConfirmDiscard(false)} className="px-4 py-2 rounded-xl text-sm font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                متابعة التحرير
              </button>
              <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-bold bg-red-600 text-white hover:bg-red-700">
                تجاهل وإغلاق
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col-reverse sm:flex-row gap-2">
            <button
              type="button"
              onClick={requestClose}
              disabled={submitting}
              className="sm:w-32 py-3 rounded-2xl font-bold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
            >
              إلغاء
            </button>
            <button
              type="submit"
              form={formId}
              disabled={submitting}
              aria-disabled={submitting}
              className="flex-1 py-3 bg-indigo-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-500/25 disabled:opacity-60 disabled:cursor-wait"
            >
              {submitting ? (
                <>
                  <Loader2 size={18} className="animate-spin" /> جاري الحفظ...
                </>
              ) : (
                <>
                  <Send size={18} /> إرسال المهمة للموظف
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </>
  );
});
