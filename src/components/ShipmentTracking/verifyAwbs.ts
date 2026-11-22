/** «تحقق البوليصة» — pure helpers (input parsing, Arabic counts and reasons). */
import type { VerifyAwbResult } from '../../services/shipmentTracking.service';
import { isDhlAwb, normalizeAwb } from './trackingUtils';

/** AWBs one verification may hold; the Backend takes ≤ 5 per request (one DHL request per AWB). */
export const VERIFY_MAX_AWBS = 50;

const n = (v: number) => new Intl.NumberFormat('en-US').format(v);
/** Arabic count: بوليصة واحدة / بوليصتين / 3–10 بوالص / 11+ بوليصة. */
export function awbCount(v: number): string {
  if (v === 1) return 'بوليصة واحدة';
  if (v === 2) return 'بوليصتين';
  if (v >= 3 && v <= 10) return `${n(v)} بوالص`;
  return `${n(v)} بوليصة`;
}

/**
 * The admin's input → DHL AWBs: one per line, separated by commas (, ،) or
 * semicolons, or pasted on one line with spaces. Each entry is normalized
 * like the Backend ("AWB 660-607-7671" → "6606077671"), kept as a string
 * (leading zeros preserved), and must be 10 digits. Duplicates are dropped.
 */
export function parseAwbInput(text: string): { valid: string[]; invalid: string[]; duplicates: number } {
  const valid: string[] = [];
  const invalid: string[] = [];
  let duplicates = 0;
  const push = (awb: string) => { if (valid.includes(awb)) duplicates++; else valid.push(awb); };
  for (const raw of text.split(/[\r\n,،;؛]+/)) {
    const token = raw.trim();
    if (!token) continue;
    const whole = normalizeAwb(token);
    if (isDhlAwb(whole)) { push(whole); continue; }
    const parts = token.split(/\s+/).map(normalizeAwb).filter(Boolean);
    if (parts.length > 1 && parts.every(isDhlAwb)) parts.forEach(push);
    else invalid.push(token.slice(0, 40));
  }
  return { valid, invalid, duplicates };
}

/** Why an AWB could not be verified, in plain Arabic (stable Backend codes; never DHL's raw text). */
export function verifyFailureText(r: Pick<VerifyAwbResult, 'error_code' | 'detail'>): string {
  switch (r.error_code) {
    case 'DHL_RATE_LIMITED': case 'DHL_PAUSED': case 'DHL_TRACKING_PAUSED': return 'DHL مشغولة حاليًا — أعد المحاولة بعد قليل.';
    case 'DHL_TIMEOUT': case 'DHL_NETWORK': return 'لم تستجب DHL في الوقت المحدد — أعد المحاولة بعد قليل.';
    case 'DHL_SERVER': case 'DHL_MALFORMED': return 'خدمة DHL غير متاحة مؤقتًا — أعد المحاولة بعد قليل.';
    case 'DHL_BAD_REQUEST': return 'رفضت DHL رقم البوليصة هذا.';
    case 'NOT_REGISTERED': return 'غير مسجلة في SHIPPEC، والبحث المباشر لدى DHL غير مفعّل على الخادم.';
    case 'DHL_TRACKING_OUT_OF_SCOPE': return 'خارج نطاق التتبع المسموح على الخادم.';
    case 'BUSY': return 'تُزامَن الآن — أعد المحاولة بعد قليل.';
    case 'DHL_UNAUTHORIZED': case 'DHL_FORBIDDEN': return 'رفضت DHL بيانات الربط — راجع إعدادات MyDHL على الخادم.';
    case 'DHL_FEATURE_DISABLED': case 'DHL_NOT_CONFIGURED': return 'التتبع من DHL غير مفعّل على الخادم حاليًا.';
    case 'DHL_BUDGET_EXHAUSTED': return 'تم بلوغ الحد اليومي لطلبات DHL — أعد المحاولة لاحقًا.';
    case 'REQUEST_FAILED': return r.detail || 'تعذر التحقق — أعد المحاولة بعد قليل.';
    default: return 'تعذر التحقق مؤقتًا — أعد المحاولة بعد قليل.';
  }
}
