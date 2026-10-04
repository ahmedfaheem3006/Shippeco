/**
 * Display helpers for amounts that arrive from the API as exact NUMERIC
 * strings ("1234.50"). Formatting never does arithmetic on the value.
 */
export function formatMoney(value: string | number | null | undefined, opts: { currency?: boolean } = {}): string {
  if (value === null || value === undefined || value === '') return '—'
  const s = typeof value === 'number' ? value.toFixed(2) : String(value).trim()
  const m = /^(-)?(\d+)(?:\.(\d+))?$/.exec(s)
  if (!m) return s
  const int = m[2].replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const frac = ((m[3] || '') + '00').slice(0, 2)
  const out = `${m[1] ? '-' : ''}${int}.${frac}`
  return opts.currency === false ? out : `${out} ر.س`
}

/** "2026-10-04" (or an ISO timestamp) → "04/10/2026" (Gregorian, no timezone shift). */
export function formatDate(value: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ''))
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—'
}

/** Amount typed by a user: positive, max 2 decimals, fits NUMERIC(12,2). */
export function isValidAmount(input: string): boolean {
  const s = input.trim()
  return /^\d{1,10}(\.\d{1,2})?$/.test(s) && Number(s) > 0
}
