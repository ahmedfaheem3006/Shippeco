/**
 * "القيمة بالتقرير اليومي" / "الوزن بالتقرير اليومي": optional numbers with
 * at most 2 decimals, never negative. Empty = not entered (NULL, never 0).
 * The server validates the same rules (invoice.validator.ts nullableDecimal).
 */
export const DAILY_VALUE_LABEL = 'القيمة بالتقرير اليومي'
export const DAILY_WEIGHT_LABEL = 'الوزن بالتقرير اليومي'
export const DAILY_VALUE_MAX = 999_999_999_999.99
export const DAILY_WEIGHT_MAX = 100_000

/** Arabic error for the input, or null when it is valid (empty is valid). */
export function dailyDecimalError(raw: string, label: string, max: number): string | null {
  const t = String(raw ?? '').trim()
  if (t === '') return null
  if (!/^\d+(\.\d+)?$/.test(t)) return `${label}: أدخل رقمًا صحيحًا`
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return `${label}: منزلتان عشريتان كحد أقصى`
  if (Number(t) > max) return `${label}: القيمة أكبر من المسموح`
  return null
}

/** Input text → value sent to the API: null when empty, a number otherwise. */
export function parseDailyDecimal(raw: string): number | null {
  const t = String(raw ?? '').trim()
  return t === '' ? null : Number(t)
}

/** API value (number, numeric string or null) → number | null. */
export function readDailyDecimal(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/** Stored value → input text ("275.50", "" when not entered). */
export function dailyDecimalInput(value: unknown): string {
  const n = readDailyDecimal(value)
  return n === null ? '' : n.toFixed(2)
}

/** View text: "275.50 ر.س" / "7.25 كجم", "—" when not entered (0 shows as 0.00). */
export function formatDailyValue(value: unknown): string {
  const n = readDailyDecimal(value)
  return n === null ? '—' : `${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`
}
export function formatDailyWeight(value: unknown): string {
  const n = readDailyDecimal(value)
  return n === null ? '—' : `${n.toFixed(2)} كجم`
}
