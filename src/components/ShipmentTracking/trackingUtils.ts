import { ApiError } from '../../utils/apiClient';
import { describeApiError } from '../../utils/apiErrors';
import { countryNameAr } from '../../utils/countries';
import type { NormalizedStatus, TrackingItem, TrackingStatusFilter } from '../../services/shipmentTracking.service';

export const TRACKING_PAGE_SIZE = 20;
/** Server → client: background sync / refresh changed something (payload: { awbs }). */
export const TRACKING_EVENTS = ['shipment-tracking:updated'] as const;
/** Same roles as POST /shipment-tracking/:awb/refresh (viewer: read only). */
export const canRefreshTracking = (role: string | undefined) => ['admin', 'manager', 'accountant', 'employee'].includes(role ?? '');

/** Same normalization as the Backend (reconcileMatcher.normalizeAwb): "AWB 998-867-9120" → "9988679120". */
export function normalizeAwb(raw: unknown): string {
  return String(raw ?? '').trim().replace(/[^a-zA-Z0-9]/g, '').replace(/^AWB/i, '').toUpperCase();
}
export const isDhlAwb = (s: string) => /^\d{10}$/.test(s);
/** "9988679120" → "998 867 9120" for reading (search/copy use the plain number). */
export const formatAwb = (awb: string) => (/^\d{10}$/.test(awb) ? `${awb.slice(0, 3)} ${awb.slice(3, 6)} ${awb.slice(6)}` : awb);

type Badge = { label: string; cls: string; dot: string };
const B = (label: string, cls: string, dot: string): Badge => ({ label, cls, dot });

export const STATUS_BADGE: Record<NormalizedStatus | 'NOT_SYNCED', Badge> = {
  NOT_SYNCED: B('لم تتم المزامنة', 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-700/40 dark:text-slate-300 dark:border-slate-600', 'bg-slate-400'),
  PRE_TRANSIT: B('بانتظار الاستلام', 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-700/40 dark:text-slate-200 dark:border-slate-600', 'bg-slate-500'),
  PICKED_UP: B('تم الاستلام', 'bg-sky-50 text-sky-700 border-sky-100 dark:bg-sky-900/20 dark:text-sky-300 dark:border-sky-900/40', 'bg-sky-500'),
  IN_TRANSIT: B('قيد النقل', 'bg-indigo-50 text-indigo-700 border-indigo-100 dark:bg-indigo-900/20 dark:text-indigo-300 dark:border-indigo-900/40', 'bg-indigo-500'),
  CUSTOMS: B('في الجمارك', 'bg-violet-50 text-violet-700 border-violet-100 dark:bg-violet-900/20 dark:text-violet-300 dark:border-violet-900/40', 'bg-violet-500'),
  ON_HOLD: B('معلّقة', 'bg-amber-50 text-amber-800 border-amber-100 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-900/40', 'bg-amber-500'),
  OUT_FOR_DELIVERY: B('خرجت للتسليم', 'bg-teal-50 text-teal-700 border-teal-100 dark:bg-teal-900/20 dark:text-teal-300 dark:border-teal-900/40', 'bg-teal-500'),
  DELIVERED: B('✓ تم التسليم', 'bg-green-50 text-green-700 border-green-100 dark:bg-green-900/20 dark:text-green-300 dark:border-green-900/40', 'bg-green-500'),
  EXCEPTION: B('يوجد مشكلة', 'bg-red-50 text-red-700 border-red-100 dark:bg-red-900/20 dark:text-red-300 dark:border-red-900/40', 'bg-red-500'),
  UNKNOWN: B('حالة غير معروفة', 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-700/40 dark:text-slate-300 dark:border-slate-600', 'bg-slate-400'),
};
export const statusBadge = (s: NormalizedStatus | null) => STATUS_BADGE[s ?? 'NOT_SYNCED'];

/** Same rule as the Backend's «يوجد مشكلة» card (trackingStatus.isProblem). */
export function needsAction(t: Pick<TrackingItem, 'normalized_status' | 'requires_action'>): boolean {
  const s = t.normalized_status;
  if (!s || s === 'DELIVERED') return false;
  return s === 'EXCEPTION' || s === 'ON_HOLD' || t.requires_action;
}

export const STATUS_FILTERS: { id: TrackingStatusFilter; label: string }[] = [
  { id: 'all', label: 'الكل' },
  { id: 'in_transit', label: 'قيد النقل' },
  { id: 'out_for_delivery', label: 'خرجت للتسليم' },
  { id: 'delivered', label: 'تم التسليم' },
  { id: 'problem', label: 'يوجد مشكلة' },
  { id: 'exception', label: 'استثناء' },
  { id: 'on_hold', label: 'معلّقة' },
  { id: 'customs', label: 'الجمارك' },
  { id: 'not_synced', label: 'لم تتم المزامنة' },
];

/**
 * Journey for the header: Origin → Picked up → In transit → Destination →
 * Delivered. A stage derived from DHL checkpoints (status + the country of
 * the latest checkpoint) — never a live GPS position.
 */
export const JOURNEY_STEPS = ['المنشأ', 'تم الاستلام', 'قيد النقل', 'في بلد الوصول', 'تم التسليم'] as const;
export function journeyStage(
  t: Pick<TrackingItem, 'normalized_status' | 'current_country_code' | 'origin_country_code' | 'destination_country_code'>,
): number {
  switch (t.normalized_status) {
    case null: case 'UNKNOWN': case 'PRE_TRANSIT': return 0;
    case 'PICKED_UP': return 1;
    case 'OUT_FOR_DELIVERY': return 3;
    case 'DELIVERED': return 4;
    default: {
      const international = !!t.destination_country_code && t.destination_country_code !== t.origin_country_code;
      return international && t.current_country_code === t.destination_country_code ? 3 : 2;
    }
  }
}

/** "منذ 8 دقائق" — relative to now, Arabic. */
export function timeAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return 'منذ لحظات';
  const m = Math.round(s / 60);
  if (m < 60) return m === 1 ? 'منذ دقيقة' : m === 2 ? 'منذ دقيقتين' : m <= 10 ? `منذ ${m} دقائق` : `منذ ${m} دقيقة`;
  const h = Math.round(m / 60);
  if (h < 24) return h === 1 ? 'منذ ساعة' : h === 2 ? 'منذ ساعتين' : h <= 10 ? `منذ ${h} ساعات` : `منذ ${h} ساعة`;
  const d = Math.round(h / 24);
  return d === 1 ? 'منذ يوم' : d === 2 ? 'منذ يومين' : d <= 10 ? `منذ ${d} أيام` : `منذ ${d} يومًا`;
}

/** A timestamp in Saudi time: "30/10/2026, 14:22". */
export function formatRiyadh(iso: string | null | undefined, withDate = true): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', {
    timeZone: 'Asia/Riyadh',
    ...(withDate ? { day: '2-digit', month: '2-digit', year: 'numeric' } : {}),
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

/** "2026-10-22" → "22/10/2026", without Date (no timezone shift). */
export function formatYmd(ymd: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd ?? '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
}

/** DHL local checkpoint time, as DHL shows it: { date: "10/08/2023", time: "11:59", offset: "GMT+12:00" }. */
export function formatLocal(local: string | null | undefined, offset?: string | null) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(local ?? '');
  if (!m) return null;
  return { date: `${m[3]}/${m[2]}/${m[1]}`, time: `${m[4]}:${m[5]}`, offset: offset ? `GMT${offset}` : null };
}

/** DHL's estimated delivery ("2023-08-11T23:59:00", local, no offset) → "11/08/2023". */
export const formatEstimated = (v: string | null | undefined) => formatYmd(v);

/** City + country → "السعودية — RIYADH" (Arabic first, reads naturally in RTL); else DHL's "RIYADH-SA". */
export function placeLabel(label: string | null, city: string | null, cc: string | null): string {
  if (city && cc) return `${countryNameAr(cc)} — ${city}`;
  if (label) return label;
  if (cc) return countryNameAr(cc);
  return '—';
}

/** Arabic reason for a failed tracking request (codes from the Backend). */
export function describeTrackingError(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case 'TRACKING_REFRESH_COOLDOWN':
      case 'DHL_NOT_CONFIGURED':
      case 'DHL_AUTH_FAILED':
      case 'DHL_RATE_LIMITED':
      case 'DHL_TIMEOUT':
      case 'DHL_UNAVAILABLE':
      case 'DHL_BAD_RESPONSE':
      case 'DHL_BAD_REQUEST':
      case 'TRACKING_NOT_FOUND':
        return err.message;
    }
    if (err.status === 404) return 'لا توجد شحنة DHL بهذا الرقم في SHIPPEC';
  }
  return describeApiError(err, fallback);
}

/** Why the last attempt failed, in Arabic (stored error codes). */
export function syncProblemText(t: Pick<TrackingItem, 'sync_status' | 'last_error_code'>): string | null {
  if (t.sync_status === 'not_found') return 'لا تتوفر بيانات تتبع لدى DHL لهذه البوليصة حتى الآن';
  if (t.sync_status !== 'error') return null;
  switch (t.last_error_code) {
    case 'DHL_TIMEOUT': case 'DHL_NETWORK': return 'تعذر التحديث مؤقتًا — لم تستجب DHL';
    case 'DHL_RATE_LIMITED': return 'تعذر التحديث مؤقتًا — DHL مشغولة';
    case 'DHL_UNAUTHORIZED': case 'DHL_FORBIDDEN': return 'تعذر التحديث — راجع إعدادات ربط DHL';
    default: return 'تعذر التحديث مؤقتًا';
  }
}
