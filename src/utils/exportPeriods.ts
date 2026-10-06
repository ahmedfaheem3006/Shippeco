/**
 * Export period presets. All dates are calendar days in Saudi time
 * (Asia/Riyadh) and both ends are inclusive — the server compares
 * invoice_date >= from AND invoice_date <= to (whole days).
 */

export type ExportFormat = 'xlsx' | 'csv'

export type ExportPresetKey =
  | 'current'
  | 'today'
  | 'yesterday'
  | 'last7'
  | 'last30'
  | 'this_week'
  | 'this_month'
  | 'last_month'
  | 'last3months'
  | 'this_year'
  | 'all'
  | 'custom'

export const EXPORT_PRESETS: { key: Exclude<ExportPresetKey, 'current'>; label: string }[] = [
  { key: 'today', label: 'اليوم' },
  { key: 'yesterday', label: 'أمس' },
  { key: 'last7', label: 'آخر 7 أيام' },
  { key: 'last30', label: 'آخر 30 يومًا' },
  { key: 'this_week', label: 'هذا الأسبوع' },
  { key: 'this_month', label: 'هذا الشهر' },
  { key: 'last_month', label: 'الشهر السابق' },
  { key: 'last3months', label: 'آخر 3 أشهر' },
  { key: 'this_year', label: 'هذا العام' },
  { key: 'all', label: 'كل البيانات' },
  { key: 'custom', label: 'فترة مخصصة' },
]

/** Inclusive range; no bounds = all data. */
export type ExportRange = { from?: string; to?: string }

export type RangeResult = { ok: true; range: ExportRange } | { ok: false; error: string }

const ISO = /^\d{4}-\d{2}-\d{2}$/

export function isIsoDate(v: string | undefined | null): v is string {
  if (!v || !ISO.test(v)) return false
  const [y, m, d] = v.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

/** Today's calendar date in Saudi Arabia, whatever the device time zone. */
export function riyadhToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now)
}

const toUtc = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}
const fromUtc = (d: Date) => d.toISOString().slice(0, 10)

export function addDays(iso: string, days: number): string {
  const d = toUtc(iso)
  d.setUTCDate(d.getUTCDate() + days)
  return fromUtc(d)
}

export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const target = new Date(Date.UTC(y, m - 1 + months, 1))
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(d, last))
  return fromUtc(target)
}

export function monthBounds(iso: string, offset = 0): { from: string; to: string } {
  const [y, m] = iso.split('-').map(Number)
  const first = new Date(Date.UTC(y, m - 1 + offset, 1))
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0))
  return { from: fromUtc(first), to: fromUtc(last) }
}

/** Saudi working week: Sunday → Saturday. */
export function weekBounds(iso: string): { from: string; to: string } {
  const from = addDays(iso, -toUtc(iso).getUTCDay())
  return { from, to: addDays(from, 6) }
}

export function computeExportRange(
  key: ExportPresetKey,
  opts: { today?: string; custom?: { from: string; to: string }; current?: ExportRange } = {},
): RangeResult {
  const today = opts.today ?? riyadhToday()
  switch (key) {
    case 'current':
      return { ok: true, range: { ...(opts.current ?? {}) } }
    case 'today':
      return { ok: true, range: { from: today, to: today } }
    case 'yesterday': {
      const y = addDays(today, -1)
      return { ok: true, range: { from: y, to: y } }
    }
    case 'last7':
      return { ok: true, range: { from: addDays(today, -6), to: today } }
    case 'last30':
      return { ok: true, range: { from: addDays(today, -29), to: today } }
    case 'this_week':
      return { ok: true, range: weekBounds(today) }
    case 'this_month':
      return { ok: true, range: monthBounds(today) }
    case 'last_month':
      return { ok: true, range: monthBounds(today, -1) }
    case 'last3months':
      return { ok: true, range: { from: addDays(addMonths(today, -3), 1), to: today } }
    case 'this_year':
      return { ok: true, range: { from: `${today.slice(0, 4)}-01-01`, to: `${today.slice(0, 4)}-12-31` } }
    case 'all':
      return { ok: true, range: {} }
    case 'custom': {
      const from = opts.custom?.from ?? ''
      const to = opts.custom?.to ?? ''
      if (!from || !to) return { ok: false, error: 'اختر تاريخ البداية وتاريخ النهاية' }
      if (!isIsoDate(from) || !isIsoDate(to)) return { ok: false, error: 'تاريخ غير صالح' }
      if (from > to) return { ok: false, error: 'تاريخ البداية يجب ألا يكون بعد تاريخ النهاية' }
      return { ok: true, range: { from, to } }
    }
  }
}

/** "من 2026-09-01 إلى 2026-09-30" — always the real dates, never just a word. */
export function describeRange(r: ExportRange): string {
  if (r.from && r.to) return r.from === r.to ? `يوم ${r.from}` : `من ${r.from} إلى ${r.to}`
  if (r.from) return `من ${r.from} حتى الآن`
  if (r.to) return `حتى ${r.to}`
  return 'كل البيانات (بدون تقييد بالتاريخ)'
}

export function rangeParams(r: ExportRange): Record<string, string> {
  const out: Record<string, string> = {}
  if (r.from) out.date_from = r.from
  if (r.to) out.date_to = r.to
  return out
}
