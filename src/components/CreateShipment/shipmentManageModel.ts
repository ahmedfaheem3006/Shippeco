/**
 * Created DHL shipments — labels, status buckets and date / time formatting
 * shared by the confirmation page, All Shipments and the tracking page.
 */
import type { CsLang } from './csLang';

export const DOC_LABELS: Record<string, [string, string]> = {
  shipping_label: ['ملصق الشحن', 'Shipping Label'],
  waybill: ['بوليصة الشحن (Waybill)', 'Waybill Document'],
  commercial_invoice: ['الفاتورة التجارية', 'Commercial Invoice'],
  proforma_invoice: ['الفاتورة المبدئية', 'Proforma Invoice'],
  shipment_receipt: ['إيصال الشحنة', 'Shipment Receipt'],
  epod: ['إثبات التسليم', 'Proof of Delivery'],
  other: ['مستند DHL', 'DHL Document'],
};

/** «All Shipments» status (SHIPPEC's own state first, then DHL tracking). */
export const LIST_STATUS: Record<string, [string, string, string]> = {
  ready_to_ship: ['جاهزة للشحن', 'Ready to ship', 'bg-indigo-50 text-indigo-700 border-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-800'],
  pre_transit: ['قبل النقل', 'Pre-transit', 'bg-sky-50 text-sky-700 border-sky-100 dark:bg-sky-900/30 dark:text-sky-300 dark:border-sky-800'],
  in_transit: ['في الطريق', 'In transit', 'bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800'],
  out_for_delivery: ['خرجت للتسليم', 'Out for delivery', 'bg-violet-50 text-violet-700 border-violet-100 dark:bg-violet-900/30 dark:text-violet-300 dark:border-violet-800'],
  delivered: ['تم التسليم', 'Delivered', 'bg-green-50 text-green-700 border-green-100 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800'],
  exception: ['مشكلة / استثناء', 'Exception / Issue', 'bg-red-50 text-red-700 border-red-100 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800'],
  cancelled: ['ملغاة', 'Cancelled', 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-700/60 dark:text-slate-300 dark:border-slate-600'],
  superseded: ['مستبدلة ببوليصة مصححة', 'Superseded', 'bg-amber-50 text-amber-800 border-amber-100 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800'],
  uncertain: ['نتيجة غير مؤكدة', 'Needs reconciliation', 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800'],
};

/** The list status of one shipment from SHIPPEC's state and DHL tracking (same rule as the Backend's «All Shipments»). */
export function bucketOf(status: string, tracking: { normalized_status?: string | null; pickup_at?: string | null } | null | undefined): string {
  if (status === 'cancelled' || status === 'superseded') return status;
  const n = tracking?.normalized_status ?? null;
  if (n === 'DELIVERED') return 'delivered';
  if (n === 'OUT_FOR_DELIVERY') return 'out_for_delivery';
  if (n === 'EXCEPTION' || n === 'ON_HOLD') return 'exception';
  if (n === 'PICKED_UP' || n === 'IN_TRANSIT' || n === 'CUSTOMS' || n === 'UNKNOWN' || tracking?.pickup_at) return 'in_transit';
  if (n === 'PRE_TRANSIT') return 'pre_transit';
  return 'ready_to_ship';
}

const locale = (lang: CsLang) => (lang === 'en' ? 'en-US' : 'ar-SA-u-nu-latn-ca-gregory');

/** "2026-11-26" → "Thu, Nov 26, 2026" / "الخميس، 26 نوفمبر 2026" — a calendar date, never shifted by a time zone. */
export function formatDay(ymd: string | null | undefined, lang: CsLang): string {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}/.test(ymd)) return '—';
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number);
  return new Intl.DateTimeFormat(locale(lang), { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** "15:00" → "3:00 pm" / "3:00 م" (the sender's local clock time, as DHL books it). */
export function formatClock(hhmm: string | null | undefined, lang: CsLang): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm ?? '');
  if (!m) return '—';
  const h = Number(m[1]);
  const suffix = lang === 'en' ? (h < 12 ? 'am' : 'pm') : h < 12 ? 'ص' : 'م';
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${suffix}`;
}

/** An instant in the SENDER's time zone ("+03:00"); without it, in the browser's. */
export function formatAt(iso: string | null | undefined, offset: string | null | undefined, lang: CsLang): string {
  if (!iso) return '—';
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '—';
  const o = /^([+-])(\d{2}):(\d{2})$/.exec(offset ?? '');
  if (!o) return new Intl.DateTimeFormat(locale(lang), { dateStyle: 'medium', timeStyle: 'short' }).format(at);
  const shift = (o[1] === '-' ? -1 : 1) * (Number(o[2]) * 60 + Number(o[3]));
  const local = new Date(at.getTime() + shift * 60_000);
  const day = new Intl.DateTimeFormat(locale(lang), { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(local);
  const clock = formatClock(`${String(local.getUTCHours()).padStart(2, '0')}:${String(local.getUTCMinutes()).padStart(2, '0')}`, lang);
  return `${day} ${clock} (GMT${offset})`;
}

/** Why an action is not offered (from the Backend's management block). */
export function blockedReason(code: string | null | undefined, t: (ar: string, en: string) => string): string | null {
  switch (code) {
    case null: case undefined: return null;
    case 'SHIPMENT_IN_DHL_NETWORK': return t('دخلت الشحنة شبكة DHL ولا يمكن إلغاؤها من SHIPPEC. تواصل مع DHL إن لزم تدخل تشغيلي.', 'This shipment has entered the DHL network and cannot be cancelled from SHIPPEC. Contact DHL if operational intervention is required.');
    case 'PICKUP_STATE_UNCERTAIN': return t('حالة استلام DHL غير مؤكدة — تحقق من DHL أولًا.', 'The DHL pickup state is uncertain — check DHL first.');
    case 'SHIPMENT_CANCELLED': return t('الشحنة ملغاة.', 'The shipment is cancelled.');
    case 'SHIPMENT_SUPERSEDED': return t('استُبدلت الشحنة ببوليصة مصححة.', 'The shipment was replaced by a corrected AWB.');
    case 'FORBIDDEN': return t('غير متاح لدورك.', 'Not available to your role.');
    default: return t('غير متاح لهذه الشحنة.', 'Not available for this shipment.');
  }
}
