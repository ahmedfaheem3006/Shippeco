import { ApiError } from '../../utils/apiClient';
import type { UnregisteredState } from '../../services/unregisteredInvoices.service';
import { describeTaskError } from './taskUtils';

// Keep in sync with Backend src/validators/unregisteredInvoice.validator.ts
export const UNREGISTERED_AWB_RE = /^[A-Z0-9]{6,30}$/;
export const UNREGISTERED_PAGE_SIZE = 20;

/** Same normalization as the Backend (reconcileMatcher.normalizeAwb). */
export function normalizeAwb(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .replace(/[^a-zA-Z0-9]/g, '')
    .replace(/^AWB/i, '')
    .toUpperCase();
}

export type AwbCheck = 'match' | 'mismatch' | 'missing';

/** A hint for the picker only — the server re-checks the stored invoice. */
export function checkInvoiceAwb(recordAwb: string, invoiceAwb: unknown): AwbCheck {
  const whole = normalizeAwb(invoiceAwb);
  const parts = String(invoiceAwb ?? '').split(/[\s,;/|\\]+/).map(normalizeAwb);
  const list = [whole, ...parts].filter(Boolean);
  if (!list.length) return 'missing';
  return list.includes(normalizeAwb(recordAwb)) ? 'match' : 'mismatch';
}

export const AWB_CHECK_MESSAGE: Record<Exclude<AwbCheck, 'match'>, string> = {
  mismatch: 'رقم البوليصة في الفاتورة المختارة لا يطابق رقم البوليصة في السجل.',
  missing: 'الفاتورة المختارة لا تحتوي رقم بوليصة يمكن التحقق منه.',
};

export const STATE_BADGE: Record<UnregisteredState, { label: string; cls: string }> = {
  pending: { label: 'لم يتم اتخاذ إجراء', cls: 'bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400 border-orange-100 dark:border-orange-900/30' },
  done: { label: '✓ تم', cls: 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 border-green-100 dark:border-green-900/30' },
  cancelled: { label: 'ملغاة', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-700/40 dark:text-slate-300 border-slate-200 dark:border-slate-600' },
};

/** "2026-10-22" → "22/10/2026", without going through Date (no timezone shift). */
export function formatAwbDate(ymd: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd ?? '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
}

/** A timestamp shown as the Saudi calendar day + time. */
export function formatRiyadhDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', { timeZone: 'Asia/Riyadh', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Today in Saudi time, YYYY-MM-DD (the default "تاريخ الإنشاء"). */
export function riyadhToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** Arabic reason for a failed unregistered-invoice request (404 means the record here). */
export function describeUnregisteredError(err: unknown, fallback: string): string {
  if (err instanceof ApiError && err.status === 404) return 'السجل غير موجود أو تم حذفه';
  return describeTaskError(err, fallback);
}

/** Where the linked invoice opens — the same deep link notifications use. */
export const invoicePath = (invoiceId: number) => `/invoices?invoice=${invoiceId}`;
