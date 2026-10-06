import { describe, expect, it } from 'vitest'
import { addMonths, computeExportRange, describeRange, rangeParams, riyadhToday, weekBounds } from './exportPeriods'
import { activeClientFilterChips, activityRange, clientFilterParams, CLIENT_PRESETS, EMPTY_CLIENT_FILTERS, validateClientFilters } from './clientFilters'
import { filenameFromDisposition } from '../services/exportService'

const range = (key: Parameters<typeof computeExportRange>[0], today: string, extra = {}) => {
  const r = computeExportRange(key, { today, ...extra })
  if (!r.ok) throw new Error(r.error)
  return r.range
}

describe('export periods (inclusive, Saudi calendar days)', () => {
  it('today / yesterday across a month and a year boundary', () => {
    expect(range('today', '2026-10-01')).toEqual({ from: '2026-10-01', to: '2026-10-01' })
    expect(range('yesterday', '2026-10-01')).toEqual({ from: '2026-09-30', to: '2026-09-30' })
    expect(range('yesterday', '2027-01-01')).toEqual({ from: '2026-12-31', to: '2026-12-31' })
  })

  it('this month / last month: first and last day, incl. February and leap years', () => {
    expect(range('this_month', '2026-09-15')).toEqual({ from: '2026-09-01', to: '2026-09-30' })
    expect(range('this_month', '2026-12-31')).toEqual({ from: '2026-12-01', to: '2026-12-31' })
    expect(range('last_month', '2026-03-31')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(range('last_month', '2028-03-01')).toEqual({ from: '2028-02-01', to: '2028-02-29' })
    expect(range('last_month', '2027-01-10')).toEqual({ from: '2026-12-01', to: '2026-12-31' })
  })

  it('rolling windows include today', () => {
    expect(range('last7', '2026-10-06')).toEqual({ from: '2026-09-30', to: '2026-10-06' })
    expect(range('last30', '2026-10-06')).toEqual({ from: '2026-09-07', to: '2026-10-06' })
    expect(range('last3months', '2026-10-06')).toEqual({ from: '2026-07-07', to: '2026-10-06' })
    expect(addMonths('2026-05-31', -3)).toBe('2026-02-28')
  })

  it('this week is Sunday → Saturday; this year is Jan 1 → Dec 31', () => {
    expect(weekBounds('2026-10-06')).toEqual({ from: '2026-10-04', to: '2026-10-10' }) // Tue
    expect(weekBounds('2026-10-04')).toEqual({ from: '2026-10-04', to: '2026-10-10' }) // Sun
    expect(range('this_year', '2026-10-06')).toEqual({ from: '2026-01-01', to: '2026-12-31' })
  })

  it('custom range is validated', () => {
    expect(computeExportRange('custom', { custom: { from: '2026-09-30', to: '2026-09-01' } })).toEqual({
      ok: false, error: 'تاريخ البداية يجب ألا يكون بعد تاريخ النهاية',
    })
    expect(computeExportRange('custom', { custom: { from: '', to: '2026-09-01' } }).ok).toBe(false)
    expect(computeExportRange('custom', { custom: { from: '2026-02-30', to: '2026-03-01' } }).ok).toBe(false)
    expect(range('custom', '2026-10-06', { custom: { from: '2026-09-01', to: '2026-09-30' } })).toEqual({ from: '2026-09-01', to: '2026-09-30' })
  })

  it('all data has no bounds; "current" mirrors the page', () => {
    expect(range('all', '2026-10-06')).toEqual({})
    expect(rangeParams({})).toEqual({})
    expect(range('current', '2026-10-06', { current: { from: '2026-09-01' } })).toEqual({ from: '2026-09-01' })
    expect(describeRange({ from: '2026-09-01', to: '2026-09-30' })).toBe('من 2026-09-01 إلى 2026-09-30')
    expect(describeRange({})).toContain('كل البيانات')
  })

  it('uses the Saudi date even when the device clock is in another zone', () => {
    expect(riyadhToday(new Date('2026-09-30T22:00:00Z'))).toBe('2026-10-01')
  })
})

describe('customer filters', () => {
  it('combine into one query: owes ≥ 5000 + inactive 90 days', () => {
    const p = clientFilterParams({ ...EMPTY_CLIENT_FILTERS, remainingMin: '5000', inactiveDays: '90' }, '2026-10-06')
    expect(Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined))).toEqual({ remaining_min: '5000', inactive_days: '90' })
  })

  it('activity presets become an invoice-date window', () => {
    expect(activityRange({ activity: 'last30', activeFrom: '', activeTo: '' }, '2026-10-06')).toEqual({ from: '2026-09-07', to: '2026-10-06' })
    expect(activityRange({ activity: 'last6m', activeFrom: '', activeTo: '' }, '2026-10-06')).toEqual({ from: '2026-04-07', to: '2026-10-06' })
    expect(clientFilterParams({ ...EMPTY_CLIENT_FILTERS, activity: 'today' }, '2026-10-06')).toMatchObject({ active_from: '2026-10-06', active_to: '2026-10-06' })
  })

  it('presets are transparent patches, chips are removable, bad ranges are caught', () => {
    const reliable = CLIENT_PRESETS.find((p) => p.key === 'reliable')!
    const f = { ...EMPTY_CLIENT_FILTERS, ...reliable.patch }
    expect(clientFilterParams(f, '2026-10-06')).toMatchObject({ collection_min: '90', invoices_min: '3', no_overdue: '1', overdue_days: '30' })
    const chips = activeClientFilterChips(f)
    expect(chips.map((c) => c.label)).toEqual(['عدد الفواتير ≥ 3', 'نسبة التحصيل ≥ 90%', 'بدون متأخرات (> 30 يومًا)'])
    expect(activeClientFilterChips({ ...EMPTY_CLIENT_FILTERS, invoicesMax: '0' })[0].label).toBe('بدون فواتير')
    expect(validateClientFilters({ ...EMPTY_CLIENT_FILTERS, remainingMin: '10', remainingMax: '5' })).toContain('المستحق')
    expect(validateClientFilters(EMPTY_CLIENT_FILTERS)).toBeNull()
  })
})

describe('download file name', () => {
  it('reads the UTF-8 and plain Content-Disposition forms', () => {
    expect(filenameFromDisposition(`attachment; filename="invoices_2026-09-01_to_2026-09-30.xlsx"; filename*=UTF-8''invoices_2026-09-01_to_2026-09-30.xlsx`))
      .toBe('invoices_2026-09-01_to_2026-09-30.xlsx')
    expect(filenameFromDisposition('attachment; filename="customers_all_2026-10-06.csv"')).toBe('customers_all_2026-10-06.csv')
    expect(filenameFromDisposition(null)).toBeNull()
  })
})
