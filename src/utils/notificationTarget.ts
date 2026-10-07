/**
 * Where clicking a notification takes the user.
 *
 * Built ONLY from ids the backend stored on the notification (entity_type /
 * entity_id, or the legacy keys each notification type has always used) and
 * mapped to the app's own routes. Never from the notification text, client
 * name or amount, and never from a URL inside the notification (`data.route`
 * or similar is ignored), so a notification cannot navigate anywhere else.
 *
 * The destination page fetches the item by id through the API, which enforces
 * permissions — this mapping only decides which page/dialog to open.
 */

export type NotificationTarget =
  | { kind: 'invoice'; id: number; path: string }
  | { kind: 'task'; id: number; path: string }
  | { kind: 'payment_link'; id: number; path: string }
  | { kind: 'support_conversation'; id: number; path: string }
  | { kind: 'support_ticket'; id: number; path: string }
  | { kind: 'page'; path: string; unresolvedMessage?: string };

export interface NotificationLike {
  type: string;
  data?: unknown;
}

/** Router state key the destination page reads to show "could not identify". */
export const UNRESOLVED_STATE_KEY = 'notificationUnresolved';

const toId = (v: unknown): number | null => {
  const n = typeof v === 'string' && /^\d+$/.test(v.trim()) ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isSafeInteger(n) && n > 0 && n <= 2147483647 ? n : null;
};

const invoice = (id: number): NotificationTarget => ({ kind: 'invoice', id, path: `/invoices?invoice=${id}` });
const task = (id: number): NotificationTarget => ({ kind: 'task', id, path: `/tasks?task=${id}` });
const paymentLink = (id: number): NotificationTarget => ({ kind: 'payment_link', id, path: `/paymob-links?link=${id}` });
const page = (path: string, unresolvedMessage?: string): NotificationTarget =>
  unresolvedMessage ? { kind: 'page', path, unresolvedMessage } : { kind: 'page', path };

function parseData(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw === 'string') {
    try {
      const v = JSON.parse(raw);
      return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
    } catch {
      return {};
    }
  }
  return {};
}

function idList(v: unknown): number[] {
  let arr = v;
  if (typeof arr === 'string') {
    try { arr = JSON.parse(arr); } catch { return []; }
  }
  return Array.isArray(arr) ? arr.map(toId).filter((n): n is number => n !== null) : [];
}

export function resolveNotificationTarget(n: NotificationLike): NotificationTarget {
  const data = parseData(n.data);

  // 1. Explicit entity (all notifications created by the current backend).
  const entityId = toId(data.entity_id);
  if (entityId) {
    switch (data.entity_type) {
      case 'invoice': return invoice(entityId);
      case 'task': return task(entityId);
      case 'payment_link': return paymentLink(entityId);
      case 'support_conversation': return { kind: 'support_conversation', id: entityId, path: `/support?conversation=${entityId}` };
      case 'support_ticket': return { kind: 'support_ticket', id: entityId, path: `/support?ticket=${entityId}` };
      case 'user': return page('/settings');
    }
  }

  // 2. Legacy notifications: the ids each type has always stored.
  switch (n.type) {
    case 'payment_received':
    case 'invoice_paid':
    case 'invoice_created': {
      const inv = toId(data.invoice_id) ?? toId(data.invoiceId);
      if (inv) return invoice(inv);
      const many = idList(data.invoice_ids);
      if (many.length === 1) return invoice(many[0]);
      const link = toId(data.link_id);
      if (link) return paymentLink(link);
      return page('/paymob-links', 'تعذّر تحديد الفاتورة أو رابط الدفع المرتبط بهذا الإشعار — هذه قائمة روابط الدفع');
    }
    case 'payment_review': {
      const link = toId(data.link_id);
      if (link) return paymentLink(link);
      return page('/paymob-links', 'عملية دفع غير مرتبطة برابط معروف — راجع سجل الروابط');
    }
    case 'collection_reminder': {
      const inv = toId(data.invoiceId) ?? toId(data.invoice_id);
      return inv ? invoice(inv) : page('/invoices', 'تعذّر تحديد الفاتورة المرتبطة بهذا التذكير');
    }
    case 'task': {
      const t = toId(data.taskId) ?? toId(data.task_id);
      if (t) return task(t);
      return page('/tasks', 'تعذّر تحديد المهمة المرتبطة بهذا الإشعار — هذه قائمة مهامك');
    }
    case 'payment_link': {
      const link = toId(data.link_id) ?? toId(data.id);
      return link ? paymentLink(link) : page('/paymob-links');
    }
    case 'support_ai_limit':
      return page('/support?tab=analytics');
    case 'support_ticket':
    case 'support_urgent':
    case 'support_handoff':
    case 'support_waiting':
    case 'support_assigned':
      return page('/support');
    case 'new_user':
      return page('/settings');
    case 'user_approved':
    case 'user_rejected':
      return page('/dashboard');
    case 'sync_complete':
      return page('/settings');
    case 'report_ready':
      return page('/reports');
    case 'reconcile':
      return page('/reconcile');
    default:
      return page('/dashboard');
  }
}

/** Arabic message for an item that could not be opened (deleted / no access / network). */
export function describeOpenError(kind: 'invoice' | 'task' | 'payment_link', status: number | undefined): string {
  const noun = kind === 'invoice' ? 'الفاتورة' : kind === 'task' ? 'المهمة' : 'رابط الدفع';
  if (status === 404) return kind === 'payment_link' ? 'رابط الدفع غير موجود أو تم حذفه' : `${noun} غير موجودة أو تم حذفها`;
  if (status === 403) return `ليست لديك صلاحية لعرض ${noun}`;
  if (status === 401) return 'انتهت الجلسة، سجّل الدخول مرة أخرى';
  return `تعذّر فتح ${noun}، حاول مرة أخرى`;
}
