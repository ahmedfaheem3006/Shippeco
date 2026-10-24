import React, { useEffect, useId, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, FilePlus2, FileText, Loader2, PencilLine, Save, Search, User, X, XCircle } from 'lucide-react';
import { Dialog } from '../shared/Dialog';
import { TaskPicker, type PickerOption } from './TaskPicker';
import type { FormHandle } from './CreateTaskModal';
import {
  ROLE_LABELS, TASK_ALREADY_COMPLETED, TASK_TEXT_MAX, describeTaskError, isAbortError, isTaskCompletedError,
} from './taskUtils';
import { unifiedService } from '../../services/unifiedService';
import {
  unregisteredInvoicesService,
  type InvoiceCandidate,
  type LinkResult,
  type UnregisteredInvoice,
  type UpdateResult,
  type UpdateUnregisteredInput,
} from '../../services/unregisteredInvoices.service';
import {
  AWB_CHECK_MESSAGE,
  UNREGISTERED_AWB_RE,
  checkInvoiceAwb,
  describeUnregisteredError,
  formatAwbDate,
  normalizeAwb,
  riyadhToday,
} from './unregisteredInvoiceUtils';

const labelCls = 'block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5';
const inputCls = (bad: boolean) =>
  `w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border rounded-2xl text-sm outline-none transition-colors focus:ring-2 focus:ring-indigo-500 dark:text-white ${
    bad ? 'border-red-400 dark:border-red-500' : 'border-slate-200 dark:border-slate-700'
  }`;

function DialogHeader({ headingId, icon, title, subtitle, onClose, disabled }: {
  headingId: string; icon: React.ReactNode; title: string; subtitle?: string; onClose: () => void; disabled?: boolean;
}) {
  return (
    <div className="shrink-0 px-5 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="p-2.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-xl shrink-0">{icon}</div>
        <div className="min-w-0">
          <h2 id={headingId} className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">{title}</h2>
          {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400 break-words">{subtitle}</p>}
        </div>
      </div>
      <button
        type="button"
        onClick={onClose}
        disabled={disabled}
        aria-label="إغلاق"
        className="p-2 rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-600 transition-colors disabled:opacity-40"
      >
        <X size={20} />
      </button>
    </div>
  );
}

function ErrorBox({ title, message }: { title: string; message: string }) {
  return (
    <div role="alert" className="flex items-start gap-2 p-3 rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/40 text-sm text-red-700 dark:text-red-300">
      <AlertCircle size={16} className="shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="font-bold">{title}</p>
        <p className="text-xs mt-0.5 break-words">{message}</p>
      </div>
    </div>
  );
}

/** The /users/list picker options (same list as the task form). */
function useUserOptions() {
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
    return () => { alive = false; };
  }, [usersReload]);
  const userOptions: PickerOption[] = useMemo(
    () => users.map((u) => ({ value: u.id, label: u.full_name, hint: ROLE_LABELS[u.role] ?? u.role })),
    [users],
  );
  const retryUsers = () => { setUsersLoading(true); setUsersError(null); setUsersReload((n) => n + 1); };
  return { userOptions, usersLoading, usersError, retryUsers };
}

const AWB_INVALID = 'رقم البوليصة غير صالح — أرقام وحروف إنجليزية فقط (6 إلى 30 خانة)';

/** Same rules as the Backend validators (create and edit). */
function recordErrors(normalized: string, awbDate: string, assignedTo: number | null, note: string, today: string) {
  return {
    awb: !normalized ? 'رقم البوليصة مطلوب' : !UNREGISTERED_AWB_RE.test(normalized) ? AWB_INVALID : undefined,
    awb_date: !/^\d{4}-\d{2}-\d{2}$/.test(awbDate) ? 'تاريخ الإنشاء مطلوب' : awbDate > today ? 'تاريخ الإنشاء لا يمكن أن يكون في المستقبل' : undefined,
    assigned_to: !assignedTo ? 'اختر الموظف المسؤول' : undefined,
    note: note.trim().length > TASK_TEXT_MAX ? `الملاحظة يجب ألا تزيد عن ${TASK_TEXT_MAX} حرف` : undefined,
  };
}

// ═══════════════════════ Add record ═══════════════════════

type CreateProps = {
  open: boolean;
  onClose: () => void;
  onCreated: (rec: UnregisteredInvoice) => void;
  /** Pre-selected assignee (the current user). */
  defaultAssignee: number | null;
};

export const CreateUnregisteredInvoiceModal: React.FC<CreateProps> = ({ open, onClose, onCreated, defaultAssignee }) => {
  const headingId = useId();
  const awbRef = useRef<HTMLInputElement>(null);
  return (
    <Dialog open={open} onRequestClose={onClose} labelledBy={headingId} initialFocusRef={awbRef as React.RefObject<HTMLElement>} panelClassName="sm:max-w-lg">
      <CreateForm headingId={headingId} awbRef={awbRef} onClose={onClose} onCreated={onCreated} defaultAssignee={defaultAssignee} />
    </Dialog>
  );
};

function CreateForm({ headingId, awbRef, onClose, onCreated, defaultAssignee }: Omit<CreateProps, 'open'> & {
  headingId: string; awbRef: React.RefObject<HTMLInputElement>;
}) {
  const uid = useId();
  const [awb, setAwb] = useState('');
  const [awbDate, setAwbDate] = useState(riyadhToday());
  const [assignedTo, setAssignedTo] = useState<number | null>(defaultAssignee);
  const [note, setNote] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { userOptions, usersLoading, usersError, retryUsers } = useUserOptions();

  const normalized = normalizeAwb(awb);
  const today = riyadhToday();
  const errors = recordErrors(normalized, awbDate, assignedTo, note, today);
  const show = (f: keyof typeof errors) => (submitted ? errors[f] : undefined);

  const submit = async () => {
    if (submittingRef.current) return;
    setSubmitted(true);
    if (Object.values(errors).some(Boolean)) {
      if (errors.awb) awbRef.current?.focus();
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const rec = await unregisteredInvoicesService.create({ awb: normalized, awb_date: awbDate, assigned_to: assignedTo!, note: note.trim() || null });
      if (!rec || typeof rec.id !== 'number') throw new Error('لم يؤكد الخادم حفظ السجل');
      onCreated(rec);
    } catch (err) {
      setSubmitError(describeUnregisteredError(err, 'تعذر إنشاء السجل'));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <>
      <DialogHeader headingId={headingId} icon={<FilePlus2 size={20} />} title="إضافة فاتورة غير مسجلة" subtitle="بوليصة تحتاج إنشاء فاتورة لها داخل المنصة" onClose={onClose} disabled={submitting} />
      <form
        id={`${uid}-form`}
        noValidate
        onSubmit={(e) => { e.preventDefault(); void submit(); }}
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 sm:px-6 py-5 space-y-5"
        aria-busy={submitting}
      >
        <div>
          <label htmlFor={`${uid}-awb`} className={labelCls}>رقم البوليصة AWB <span className="text-red-500" aria-hidden="true">*</span></label>
          <input
            ref={awbRef}
            id={`${uid}-awb`}
            dir="ltr"
            inputMode="text"
            autoComplete="off"
            value={awb}
            onChange={(e) => { setAwb(e.target.value); setSubmitError(null); }}
            placeholder="1234567890"
            aria-required="true"
            aria-invalid={!!show('awb') || undefined}
            aria-describedby={show('awb') ? `${uid}-awb-err` : undefined}
            disabled={submitting}
            className={`${inputCls(!!show('awb'))} font-mono text-left`}
          />
          {show('awb') && <p id={`${uid}-awb-err`} className="mt-1.5 text-xs font-semibold text-red-600 dark:text-red-400">{show('awb')}</p>}
        </div>

        <div>
          <label htmlFor={`${uid}-date`} className={labelCls}>تاريخ الإنشاء <span className="text-red-500" aria-hidden="true">*</span></label>
          <input
            id={`${uid}-date`}
            type="date"
            value={awbDate}
            max={today}
            onChange={(e) => setAwbDate(e.target.value)}
            aria-invalid={!!show('awb_date') || undefined}
            disabled={submitting}
            className={inputCls(!!show('awb_date'))}
          />
          {show('awb_date') && <p className="mt-1.5 text-xs font-semibold text-red-600 dark:text-red-400">{show('awb_date')}</p>}
        </div>

        <div>
          <span id={`${uid}-assignee-label`} className={labelCls}>الموظف المسؤول <span className="text-red-500" aria-hidden="true">*</span></span>
          <TaskPicker
            id={`${uid}-assignee`}
            labelId={`${uid}-assignee-label`}
            options={userOptions}
            value={assignedTo}
            onChange={(v) => setAssignedTo(v)}
            placeholder="اختر الموظف..."
            searchPlaceholder="ابحث بالاسم أو الدور..."
            emptyText="لا يوجد موظف بهذا الاسم"
            loading={usersLoading}
            loadError={usersError}
            onRetry={retryUsers}
            disabled={submitting}
            invalid={!!show('assigned_to')}
            icon={<User size={16} />}
          />
          {show('assigned_to') && <p className="mt-1.5 text-xs font-semibold text-red-600 dark:text-red-400">{show('assigned_to')}</p>}
        </div>

        <div>
          <label htmlFor={`${uid}-note`} className={labelCls}>ملاحظة <span className="font-medium text-slate-400">(اختياري)</span></label>
          <textarea
            id={`${uid}-note`}
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={submitting}
            className={`${inputCls(!!show('note'))} resize-y min-h-[80px]`}
          />
          {show('note') && <p className="mt-1.5 text-xs font-semibold text-red-600 dark:text-red-400">{show('note')}</p>}
        </div>
      </form>
      <div className="shrink-0 px-5 sm:px-6 py-4 border-t border-slate-100 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/30 space-y-3">
        {submitError && <ErrorBox title="لم يتم حفظ السجل" message={submitError} />}
        <div className="flex flex-col-reverse sm:flex-row gap-2">
          <button type="button" onClick={onClose} disabled={submitting} className="sm:w-32 py-3 rounded-2xl font-bold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50">
            إلغاء
          </button>
          <button type="submit" form={`${uid}-form`} disabled={submitting} className="flex-1 py-3 bg-indigo-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-500/25 disabled:opacity-60 disabled:cursor-wait">
            {submitting ? <><Loader2 size={18} className="animate-spin" /> جاري الحفظ...</> : <><FilePlus2 size={18} /> إضافة السجل</>}
          </button>
        </div>
      </div>
    </>
  );
}

// ═══════════════════════ Edit a pending record ═══════════════════════

type EditProps = {
  open: boolean;
  record: UnregisteredInvoice | null;
  onClose: () => void;
  onSaved: (result: UpdateResult) => void;
  /** The record was completed/cancelled meanwhile (409) — the owner re-reads its list. */
  onCompleted?: () => void;
};

export const EditUnregisteredInvoiceModal: React.FC<EditProps> = ({ open, record, onClose, onSaved, onCompleted }) => {
  const headingId = useId();
  const awbRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<FormHandle>(null);
  return (
    <Dialog
      open={open}
      onRequestClose={() => (formRef.current ? formRef.current.requestClose() : onClose())}
      labelledBy={headingId}
      initialFocusRef={awbRef as React.RefObject<HTMLElement>}
      panelClassName="sm:max-w-lg"
    >
      {record && (
        <EditUnregisteredForm
          key={record.id}
          ref={formRef}
          headingId={headingId}
          awbRef={awbRef}
          record={record}
          onClose={onClose}
          onSaved={onSaved}
          onCompleted={onCompleted}
        />
      )}
    </Dialog>
  );
};

type EditFormProps = Omit<EditProps, 'open' | 'record'> & {
  headingId: string;
  awbRef: React.RefObject<HTMLInputElement>;
  record: UnregisteredInvoice;
};

/** AWB, date, assignee and note of a pending record, prefilled. Only changed
 *  fields are sent; the invoice link is not editable here (only «تم تسجيل الفاتورة»). */
export const EditUnregisteredForm = React.forwardRef<FormHandle, EditFormProps>(function EditUnregisteredForm(
  { headingId, awbRef, record, onClose, onSaved, onCompleted },
  ref,
) {
  const uid = useId();
  const [awb, setAwb] = useState(record.awb);
  const [awbDate, setAwbDate] = useState(record.awb_date);
  const [assignedTo, setAssignedTo] = useState<number | null>(record.assigned_to);
  const [note, setNote] = useState(record.note ?? '');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const { userOptions, usersLoading, usersError, retryUsers } = useUserOptions();

  const normalized = normalizeAwb(awb);
  const today = riyadhToday();
  // An existing date in the future (should not happen) is not re-validated unless changed.
  const errors = recordErrors(normalized, awbDate, assignedTo, note, awbDate === record.awb_date ? '9999-12-31' : today);
  const show = (f: keyof typeof errors) => (submitted ? errors[f] : undefined);

  const changes = (): UpdateUnregisteredInput => {
    const p: UpdateUnregisteredInput = {};
    if (normalized !== record.awb) p.awb = normalized;
    if (awbDate !== record.awb_date) p.awb_date = awbDate;
    if (assignedTo && assignedTo !== record.assigned_to) p.assigned_to = assignedTo;
    if ((note.trim() || null) !== (record.note ?? null)) p.note = note.trim() || null;
    return p;
  };
  const dirty = Object.keys(changes()).length > 0;

  const requestClose = () => {
    if (submittingRef.current) return; // wait for the server's answer
    if (dirty) setConfirmDiscard(true);
    else onClose();
  };
  useImperativeHandle(ref, () => ({ requestClose }));

  const submit = async () => {
    if (submittingRef.current) return; // double click / Enter + click
    setSubmitted(true);
    setConfirmDiscard(false);
    if (Object.values(errors).some(Boolean)) {
      if (errors.awb) awbRef.current?.focus();
      return;
    }
    const patch = changes();
    if (!Object.keys(patch).length) return;
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await unregisteredInvoicesService.update(record.id, patch);
      if (!result?.record || typeof result.record.id !== 'number') throw new Error('لم يؤكد الخادم حفظ التعديلات');
      onSaved(result);
    } catch (err) {
      if (isTaskCompletedError(err)) {
        setSubmitError(TASK_ALREADY_COMPLETED);
        onCompleted?.();
      } else {
        setSubmitError(describeUnregisteredError(err, 'تعذر حفظ التعديلات'));
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <>
      <DialogHeader
        headingId={headingId}
        icon={<PencilLine size={20} />}
        title="تعديل فاتورة غير مسجلة"
        subtitle={`AWB ${record.awb} — يمكن التعديل طالما لم يتم اتخاذ إجراء`}
        onClose={requestClose}
        disabled={submitting}
      />
      <form
        id={`${uid}-form`}
        noValidate
        onSubmit={(e) => { e.preventDefault(); void submit(); }}
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 sm:px-6 py-5 space-y-5"
        aria-busy={submitting}
      >
        <div>
          <label htmlFor={`${uid}-awb`} className={labelCls}>رقم البوليصة AWB <span className="text-red-500" aria-hidden="true">*</span></label>
          <input
            ref={awbRef}
            id={`${uid}-awb`}
            dir="ltr"
            inputMode="text"
            autoComplete="off"
            value={awb}
            onChange={(e) => { setAwb(e.target.value); setSubmitError(null); }}
            aria-required="true"
            aria-invalid={!!show('awb') || undefined}
            aria-describedby={show('awb') ? `${uid}-awb-err` : undefined}
            disabled={submitting}
            className={`${inputCls(!!show('awb'))} font-mono text-left`}
          />
          {show('awb') && <p id={`${uid}-awb-err`} className="mt-1.5 text-xs font-semibold text-red-600 dark:text-red-400">{show('awb')}</p>}
        </div>

        <div>
          <label htmlFor={`${uid}-date`} className={labelCls}>تاريخ الإنشاء <span className="text-red-500" aria-hidden="true">*</span></label>
          <input
            id={`${uid}-date`}
            type="date"
            value={awbDate}
            max={today}
            onChange={(e) => { setAwbDate(e.target.value); setSubmitError(null); }}
            aria-invalid={!!show('awb_date') || undefined}
            disabled={submitting}
            className={inputCls(!!show('awb_date'))}
          />
          {show('awb_date') && <p className="mt-1.5 text-xs font-semibold text-red-600 dark:text-red-400">{show('awb_date')}</p>}
        </div>

        <div>
          <span id={`${uid}-assignee-label`} className={labelCls}>الموظف المسؤول <span className="text-red-500" aria-hidden="true">*</span></span>
          <TaskPicker
            id={`${uid}-assignee`}
            labelId={`${uid}-assignee-label`}
            options={userOptions}
            value={assignedTo}
            valueLabel={assignedTo === record.assigned_to ? record.assigned_to_name ?? undefined : undefined}
            onChange={(v) => { setAssignedTo(v); setSubmitError(null); }}
            placeholder="اختر الموظف..."
            searchPlaceholder="ابحث بالاسم أو الدور..."
            emptyText="لا يوجد موظف بهذا الاسم"
            loading={usersLoading}
            loadError={usersError}
            onRetry={retryUsers}
            disabled={submitting}
            invalid={!!show('assigned_to')}
            icon={<User size={16} />}
          />
          {show('assigned_to') && <p className="mt-1.5 text-xs font-semibold text-red-600 dark:text-red-400">{show('assigned_to')}</p>}
        </div>

        <div>
          <label htmlFor={`${uid}-note`} className={labelCls}>ملاحظة <span className="font-medium text-slate-400">(اختياري)</span></label>
          <textarea
            id={`${uid}-note`}
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={submitting}
            className={`${inputCls(!!show('note'))} resize-y min-h-[80px]`}
          />
          {show('note') && <p className="mt-1.5 text-xs font-semibold text-red-600 dark:text-red-400">{show('note')}</p>}
        </div>
        <p className="text-[11px] text-slate-400">ربط فاتورة المنصة يتم فقط من زر «تم تسجيل الفاتورة».</p>
      </form>
      <div className="shrink-0 px-5 sm:px-6 py-4 border-t border-slate-100 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/30 space-y-3">
        {submitError && <ErrorBox title="لم يتم حفظ التعديلات" message={submitError} />}
        {confirmDiscard ? (
          <div role="alertdialog" aria-label="تأكيد الإغلاق" className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/40">
            <p className="flex-1 text-sm font-semibold text-amber-800 dark:text-amber-300">لديك تعديلات لم تُحفظ. هل تريد الإغلاق وتجاهلها؟</p>
            <div className="flex gap-2">
              <button type="button" autoFocus onClick={() => setConfirmDiscard(false)} className="px-4 py-2 rounded-xl text-sm font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                متابعة التعديل
              </button>
              <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-bold bg-red-600 text-white hover:bg-red-700">
                تجاهل وإغلاق
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col-reverse sm:flex-row gap-2">
            <button type="button" onClick={requestClose} disabled={submitting} className="sm:w-32 py-3 rounded-2xl font-bold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50">
              إلغاء
            </button>
            <button
              type="submit"
              form={`${uid}-form`}
              disabled={submitting || !dirty}
              className="flex-1 py-3 bg-indigo-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-500/25 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting ? <><Loader2 size={18} className="animate-spin" /> جاري الحفظ...</> : <><Save size={18} /> حفظ التعديلات</>}
            </button>
          </div>
        )}
      </div>
    </>
  );
});

// ═══════════════════════ Link an invoice (complete / relink) ═══════════════════════

type LinkProps = {
  open: boolean;
  record: UnregisteredInvoice | null;
  /** complete: pending → done · relink: change the invoice of a done record (admin/manager). */
  mode: 'complete' | 'relink';
  onClose: () => void;
  onLinked: (result: LinkResult) => void;
};

export const LinkInvoiceModal: React.FC<LinkProps> = ({ open, record, mode, onClose, onLinked }) => {
  const headingId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  return (
    <Dialog open={open} onRequestClose={onClose} labelledBy={headingId} initialFocusRef={searchRef as React.RefObject<HTMLElement>} panelClassName="sm:max-w-xl">
      {record && <LinkForm key={`${record.id}-${mode}`} headingId={headingId} searchRef={searchRef} record={record} mode={mode} onClose={onClose} onLinked={onLinked} />}
    </Dialog>
  );
};

function LinkForm({ headingId, searchRef, record, mode, onClose, onLinked }: Omit<LinkProps, 'open' | 'record'> & {
  headingId: string; searchRef: React.RefObject<HTMLInputElement>; record: UnregisteredInvoice;
}) {
  const uid = useId();
  // Start with the record's own AWB: the invoice the employee just created shows up first.
  const [q, setQ] = useState(record.awb);
  const [results, setResults] = useState<InvoiceCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState<InvoiceCandidate | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    const t = window.setTimeout(async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const rows = await unregisteredInvoicesService.searchInvoices(q, ctrl.signal);
        setResults(rows);
      } catch (err) {
        if (!isAbortError(err)) setLoadError(describeTaskError(err, 'تعذر البحث عن الفواتير'));
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => { window.clearTimeout(t); ctrl.abort(); };
  }, [q, reload]);

  const check = selected ? checkInvoiceAwb(record.awb, selected.awb) : null;
  const isCurrent = mode === 'relink' && selected?.id === record.linked_invoice_id;
  const canConfirm = !!selected && check === 'match' && !isCurrent && !submitting;

  const confirm = async () => {
    if (!selected || submittingRef.current || check !== 'match') return;
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = mode === 'complete'
        ? await unregisteredInvoicesService.complete(record.id, selected.id)
        : await unregisteredInvoicesService.relink(record.id, selected.id);
      if (!result?.record) throw new Error('لم يؤكد الخادم حفظ الربط');
      onLinked(result);
    } catch (err) {
      setSubmitError(describeUnregisteredError(err, 'تعذر ربط الفاتورة'));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <>
      <DialogHeader
        headingId={headingId}
        icon={<FileText size={20} />}
        title={mode === 'complete' ? 'تم تسجيل الفاتورة' : 'تعديل الفاتورة المرتبطة'}
        subtitle={`اختر فاتورة المنصة الخاصة بالبوليصة ${record.awb}`}
        onClose={onClose}
        disabled={submitting}
      />
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 sm:px-6 py-5 space-y-4" aria-busy={submitting}>
        <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 dark:bg-slate-900/40 p-3 rounded-2xl border border-slate-100 dark:border-slate-700">
          <div className="min-w-0">
            <div className="text-[10px] font-bold text-slate-400">رقم البوليصة</div>
            <div className="font-mono font-extrabold text-slate-800 dark:text-slate-200 break-all" dir="ltr">{record.awb}</div>
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-bold text-slate-400">تاريخ الإنشاء</div>
            <div className="font-bold text-slate-800 dark:text-slate-200 tabular-nums">{formatAwbDate(record.awb_date)}</div>
          </div>
          {mode === 'relink' && record.linked_invoice_number && (
            <div className="col-span-2 min-w-0">
              <div className="text-[10px] font-bold text-slate-400">الفاتورة المرتبطة حاليًا</div>
              <div className="font-bold text-slate-800 dark:text-slate-200">{record.linked_invoice_number}</div>
            </div>
          )}
        </div>

        <div>
          <label htmlFor={`${uid}-q`} className={labelCls}>ابحث عن الفاتورة في المنصة</label>
          <div className="relative">
            <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
            <input
              ref={searchRef}
              id={`${uid}-q`}
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="رقم الفاتورة أو AWB أو اسم العميل..."
              disabled={submitting}
              className={`${inputCls(false)} pr-11`}
            />
          </div>
        </div>

        <div role="radiogroup" aria-label="نتائج البحث عن الفواتير" aria-busy={loading} className="space-y-2">
          {loading && results.length === 0 ? (
            <div className="space-y-2 animate-pulse" aria-hidden="true">
              {[0, 1, 2].map((i) => <div key={i} className="h-16 rounded-2xl bg-slate-100 dark:bg-slate-700/50" />)}
            </div>
          ) : loadError ? (
            <div className="flex items-center gap-2 text-xs font-semibold text-red-600 dark:text-red-400" role="alert">
              <AlertCircle size={14} /> {loadError}
              <button type="button" onClick={() => setReload((n) => n + 1)} className="font-bold text-indigo-600 dark:text-indigo-400 hover:underline">إعادة المحاولة</button>
            </div>
          ) : results.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-6">لا توجد فواتير مطابقة — تأكد أنك أنشأت الفاتورة في المنصة أولًا</p>
          ) : (
            results.map((r) => {
              const c = checkInvoiceAwb(record.awb, r.awb);
              const active = selected?.id === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => { setSelected(r); setSubmitError(null); }}
                  disabled={submitting}
                  className={`w-full text-right p-3 rounded-2xl border transition-colors flex items-start gap-3 ${
                    active ? 'border-indigo-400 bg-indigo-50/70 dark:bg-indigo-900/20 ring-2 ring-indigo-500/30' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/40'
                  }`}
                >
                  <span className={`mt-0.5 shrink-0 ${c === 'match' ? 'text-green-600 dark:text-green-400' : 'text-slate-400'}`} aria-hidden="true">
                    {c === 'match' ? <CheckCircle2 size={18} /> : c === 'mismatch' ? <XCircle size={18} /> : <AlertTriangle size={18} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-extrabold text-slate-900 dark:text-white">{r.invoice_number || `#${r.id}`}</span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400 break-all">
                      AWB: <span dir="ltr" className="font-mono">{r.awb || '—'}</span>
                    </span>
                    {r.client_name && <span className="block text-xs text-slate-500 dark:text-slate-400 truncate">العميل: {r.client_name}</span>}
                  </span>
                  <span className={`shrink-0 text-[10px] font-black px-2 py-1 rounded-lg ${
                    c === 'match' ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-700/50 dark:text-slate-300'
                  }`}>
                    {c === 'match' ? 'مطابقة' : c === 'mismatch' ? 'غير مطابقة' : 'بدون بوليصة'}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>

      <div className="shrink-0 px-5 sm:px-6 py-4 border-t border-slate-100 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/30 space-y-3">
        {selected && check !== 'match' && (
          <div role="alert" className="flex items-start gap-2 p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/40 text-sm font-semibold text-amber-800 dark:text-amber-300">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" /> {AWB_CHECK_MESSAGE[check!]}
          </div>
        )}
        {isCurrent && <p className="text-xs font-semibold text-slate-500">هذه هي الفاتورة المرتبطة حاليًا.</p>}
        {submitError && <ErrorBox title="لم يتم الربط" message={submitError} />}
        <div className="flex flex-col-reverse sm:flex-row gap-2">
          <button type="button" onClick={onClose} disabled={submitting} className="sm:w-32 py-3 rounded-2xl font-bold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50">
            إلغاء
          </button>
          <button
            type="button"
            onClick={() => void confirm()}
            disabled={!canConfirm}
            className="flex-1 py-3 bg-green-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-green-700 transition-colors shadow-lg shadow-green-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? <><Loader2 size={18} className="animate-spin" /> جاري الحفظ...</> : <><CheckCircle2 size={18} /> {selected ? `تأكيد — ${selected.invoice_number || `#${selected.id}`}` : 'اختر الفاتورة'}</>}
          </button>
        </div>
      </div>
    </>
  );
}

// ═══════════════════════ Cancel (admin/manager) ═══════════════════════

export const CancelUnregisteredDialog: React.FC<{
  open: boolean;
  record: UnregisteredInvoice | null;
  onClose: () => void;
  onCancelled: (result: LinkResult) => void;
}> = ({ open, record, onClose, onCancelled }) => {
  const headingId = useId();
  // Escape/backdrop are ignored while the request runs (the body disables its buttons).
  const busyRef = useRef(false);
  return (
    <Dialog open={open} onRequestClose={() => !busyRef.current && onClose()} labelledBy={headingId} panelClassName="sm:max-w-md">
      {record && <CancelBody headingId={headingId} record={record} busyRef={busyRef} onClose={onClose} onCancelled={onCancelled} />}
    </Dialog>
  );
};

function CancelBody({ headingId, record, busyRef, onClose, onCancelled }: {
  headingId: string;
  record: UnregisteredInvoice;
  busyRef: React.MutableRefObject<boolean>;
  onClose: () => void;
  onCancelled: (result: LinkResult) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirm = async () => {
    if (!record || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      onCancelled(await unregisteredInvoicesService.cancel(record.id));
    } catch (err) {
      setError(describeUnregisteredError(err, 'تعذر إلغاء السجل'));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  return (
    <>
      <DialogHeader headingId={headingId} icon={<XCircle size={20} />} title="إلغاء السجل" subtitle={`AWB ${record.awb}`} onClose={onClose} disabled={busy} />
      <div className="px-5 sm:px-6 py-5 space-y-3">
        <p className="text-sm text-slate-600 dark:text-slate-300">سيُغلق هذا السجل كـ«ملغى» دون ربطه بأي فاتورة، ويُسجَّل ذلك في سجل العمليات. استخدمه فقط لسجل أُضيف بالخطأ.</p>
        {error && <ErrorBox title="لم يتم الإلغاء" message={error} />}
      </div>
      <div className="shrink-0 px-5 sm:px-6 py-4 border-t border-slate-100 dark:border-slate-700 flex flex-col-reverse sm:flex-row gap-2">
        <button type="button" onClick={onClose} disabled={busy} className="sm:w-32 py-3 rounded-2xl font-bold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 disabled:opacity-50">
          رجوع
        </button>
        <button type="button" onClick={() => void confirm()} disabled={busy} className="flex-1 py-3 bg-red-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-red-700 disabled:opacity-60">
          {busy ? <Loader2 size={18} className="animate-spin" /> : <XCircle size={18} />} إلغاء السجل
        </button>
      </div>
    </>
  );
}
