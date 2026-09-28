import { ApiError } from '../../utils/apiClient';
import type { Task, TaskMessage } from '../../services/tasks.service';

// Keep in sync with Backend src/validators/task.validator.ts
export const TASK_TITLE_MIN = 3;
export const TASK_TITLE_MAX = 255;
export const TASK_TEXT_MAX = 5000;

export type TaskFormValues = {
  title: string;
  description: string;
  assignedTo: number | null;
  invoiceId: number | null;
};
export type TaskFormField = 'title' | 'description' | 'assigned_to' | 'invoice_id';
export type TaskFormErrors = Partial<Record<TaskFormField, string>>;

export function validateTaskForm(v: TaskFormValues): TaskFormErrors {
  const errors: TaskFormErrors = {};
  const title = v.title.trim();
  if (!title) errors.title = 'عنوان المهمة مطلوب';
  else if (title.length < TASK_TITLE_MIN) errors.title = `عنوان المهمة يجب ألا يقل عن ${TASK_TITLE_MIN} أحرف`;
  else if (title.length > TASK_TITLE_MAX) errors.title = `عنوان المهمة يجب ألا يزيد عن ${TASK_TITLE_MAX} حرفًا`;
  if (!v.assignedTo) errors.assigned_to = 'اختر الموظف المسؤول عن المهمة';
  if (v.description.trim().length > TASK_TEXT_MAX) errors.description = `الوصف يجب ألا يزيد عن ${TASK_TEXT_MAX} حرف`;
  return errors;
}

const ARABIC = /[؀-ۿ]/;

/** Turns any thrown value into a short Arabic reason the user can act on. */
export function describeTaskError(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    if (err.status === 403) return ARABIC.test(err.message) ? err.message : 'ليست لديك صلاحية لتنفيذ هذا الإجراء';
    if (err.status === 404) return 'المهمة غير موجودة أو تم حذفها';
    if (err.status === 429) return 'طلبات كثيرة خلال وقت قصير، انتظر قليلًا ثم أعد المحاولة';
    if (err.status >= 500) return 'حدث خطأ في الخادم، أعد المحاولة بعد قليل';
    if (err.details.length) return err.details.map((d) => d.message).join('، ');
    return ARABIC.test(err.message) ? err.message : fallback;
  }
  if (err instanceof TypeError || (err instanceof Error && /fetch|network/i.test(err.message))) {
    return 'تعذر الاتصال بالخادم. تحقق من الاتصال ثم أعد المحاولة';
  }
  if (err instanceof Error && ARABIC.test(err.message)) return err.message;
  return fallback;
}

export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

/** Server field errors (400 details) mapped onto form fields. */
export function fieldErrorsFrom(err: unknown): TaskFormErrors {
  if (!(err instanceof ApiError)) return {};
  const out: TaskFormErrors = {};
  for (const d of err.details) {
    if (d.field === 'title' || d.field === 'description' || d.field === 'assigned_to' || d.field === 'invoice_id') {
      out[d.field] = d.message;
    }
  }
  return out;
}

/** Union by id (a reply can arrive both from our own POST and from the next
 *  refresh), oldest first. Returns the SAME array when nothing is new so
 *  callers can skip a re-render. */
export function mergeMessages(current: TaskMessage[], incoming: TaskMessage[]): TaskMessage[] {
  const known = new Set(current.map((m) => m.id));
  const fresh = incoming.filter((m) => !known.has(m.id));
  if (!fresh.length) return current;
  return [...current, ...fresh].sort((a, b) => {
    const t = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    return t !== 0 && !Number.isNaN(t) ? t : a.id - b.id;
  });
}

export function normalizeArabic(text: string): string {
  return text
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .trim();
}

export function filterTasksBySearch(tasks: Task[], search: string): Task[] {
  const q = normalizeArabic(search);
  if (!q) return tasks;
  return tasks.filter((t) =>
    [t.title, t.assigned_to_name, t.assigned_by_name, t.invoice_number, t.invoice_awb]
      .some((f) => f && normalizeArabic(String(f)).includes(q)),
  );
}

export function neighborIds(order: number[], currentId: number | null): { prev: number | null; next: number | null; index: number } {
  const index = currentId == null ? -1 : order.indexOf(currentId);
  if (index === -1) return { prev: null, next: null, index };
  return {
    prev: index > 0 ? order[index - 1] : null,
    next: index < order.length - 1 ? order[index + 1] : null,
    index,
  };
}

/** When the card that opened the window is gone (e.g. closed while the
 *  "open" filter is active), the nearest surviving card after it — else
 *  before it — in the order the user saw. */
export function nearestSurvivingId(order: number[], goneId: number, exists: (id: number) => boolean): number | null {
  const i = order.indexOf(goneId);
  if (i === -1) return null;
  for (let d = 1; d < order.length; d++) {
    if (i + d < order.length && exists(order[i + d])) return order[i + d];
    if (i - d >= 0 && exists(order[i - d])) return order[i - d];
  }
  return null;
}

export const ROLE_LABELS: Record<string, string> = {
  admin: 'مدير النظام',
  manager: 'مدير',
  accountant: 'محاسب',
  employee: 'موظف',
  viewer: 'مشاهد',
};

export const PAYMENT_STATUS: Record<number, { label: string; cls: string }> = {
  0: { label: 'غير مدفوعة', cls: 'bg-red-50 text-red-600 dark:bg-red-950/20 dark:text-red-400 border-red-100 dark:border-red-900/30' },
  1: { label: 'دفعة جزئية', cls: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-950/20 dark:text-yellow-400 border-yellow-100 dark:border-yellow-900/30' },
  2: { label: 'مدفوعة بالكامل', cls: 'bg-green-50 text-green-600 dark:bg-green-950/20 dark:text-green-400 border-green-100 dark:border-green-900/30' },
  3: { label: 'مرتجعة', cls: 'bg-purple-50 text-purple-600 dark:bg-purple-950/20 dark:text-purple-400 border-purple-100 dark:border-purple-900/30' },
};

export function formatSar(v: unknown): string {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? `${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} SAR` : '—';
}
