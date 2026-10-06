/**
 * Customer filters (all applied by the server and combined with AND).
 * Every preset only fills visible filter fields, so the user always sees —
 * and can edit — the exact rule behind it.
 */
import { addDays, addMonths, monthBounds, riyadhToday, isIsoDate } from './exportPeriods'

export type ActivityKey = '' | 'today' | 'last7' | 'last30' | 'this_month' | 'last3m' | 'last6m' | 'last_year' | 'custom'

export type ClientFilterState = {
  balance: '' | 'has' | 'none'
  remainingMin: string
  remainingMax: string
  revenueMin: string
  revenueMax: string
  invoicesMin: string
  invoicesMax: string
  openMin: string
  collectionMin: string
  activity: ActivityKey
  activeFrom: string
  activeTo: string
  inactiveDays: string
  overdue: '' | 'yes' | 'no'
  overdueDays: string
  overdueMin: string
  noPaymentDays: string
  allPaid: boolean
}

export const EMPTY_CLIENT_FILTERS: ClientFilterState = {
  balance: '',
  remainingMin: '',
  remainingMax: '',
  revenueMin: '',
  revenueMax: '',
  invoicesMin: '',
  invoicesMax: '',
  openMin: '',
  collectionMin: '',
  activity: '',
  activeFrom: '',
  activeTo: '',
  inactiveDays: '',
  overdue: '',
  overdueDays: '30',
  overdueMin: '',
  noPaymentDays: '',
  allPaid: false,
}

export const ACTIVITY_OPTIONS: { key: ActivityKey; label: string }[] = [
  { key: '', label: 'أي وقت' },
  { key: 'today', label: 'تعامل اليوم' },
  { key: 'last7', label: 'آخر 7 أيام' },
  { key: 'last30', label: 'آخر 30 يومًا' },
  { key: 'this_month', label: 'هذا الشهر' },
  { key: 'last3m', label: 'آخر 3 أشهر' },
  { key: 'last6m', label: 'آخر 6 أشهر' },
  { key: 'last_year', label: 'آخر سنة' },
  { key: 'custom', label: 'فترة مخصصة' },
]

/** "Had at least one invoice dated in…" — inclusive Saudi calendar days. */
export function activityRange(f: Pick<ClientFilterState, 'activity' | 'activeFrom' | 'activeTo'>, today = riyadhToday()): { from?: string; to?: string } {
  switch (f.activity) {
    case 'today': return { from: today, to: today }
    case 'last7': return { from: addDays(today, -6), to: today }
    case 'last30': return { from: addDays(today, -29), to: today }
    case 'this_month': return monthBounds(today)
    case 'last3m': return { from: addDays(addMonths(today, -3), 1), to: today }
    case 'last6m': return { from: addDays(addMonths(today, -6), 1), to: today }
    case 'last_year': return { from: addDays(addMonths(today, -12), 1), to: today }
    case 'custom': return {
      from: isIsoDate(f.activeFrom) ? f.activeFrom : undefined,
      to: isIsoDate(f.activeTo) ? f.activeTo : undefined,
    }
    default: return {}
  }
}

const num = (v: string) => (v.trim() !== '' && Number.isFinite(Number(v)) && Number(v) >= 0 ? v.trim() : undefined)

/** Query parameters understood by GET /clients and GET /clients/export. */
export function clientFilterParams(f: ClientFilterState, today = riyadhToday()): Record<string, string | undefined> {
  const act = activityRange(f, today)
  const hasOverdueRule = f.overdue !== '' || num(f.overdueMin) !== undefined
  return {
    balance: f.balance || undefined,
    remaining_min: num(f.remainingMin),
    remaining_max: num(f.remainingMax),
    revenue_min: num(f.revenueMin),
    revenue_max: num(f.revenueMax),
    invoices_min: num(f.invoicesMin),
    invoices_max: num(f.invoicesMax),
    open_min: num(f.openMin),
    collection_min: num(f.collectionMin),
    active_from: act.from,
    active_to: act.to,
    inactive_days: num(f.inactiveDays),
    has_overdue: f.overdue === 'yes' ? '1' : undefined,
    no_overdue: f.overdue === 'no' ? '1' : undefined,
    overdue_min: num(f.overdueMin),
    overdue_days: hasOverdueRule ? num(f.overdueDays) ?? '30' : undefined,
    no_payment_days: num(f.noPaymentDays),
    all_paid: f.allPaid ? '1' : undefined,
  }
}

/** Client-side check so the user sees a clear message before any request. */
export function validateClientFilters(f: ClientFilterState): string | null {
  const pairs: [string, string, string][] = [
    [f.remainingMin, f.remainingMax, 'المستحق'],
    [f.revenueMin, f.revenueMax, 'إجمالي التعامل'],
    [f.invoicesMin, f.invoicesMax, 'عدد الفواتير'],
  ]
  for (const [lo, hi, label] of pairs) {
    const a = num(lo)
    const b = num(hi)
    if (a !== undefined && b !== undefined && Number(a) > Number(b)) return `نطاق ${label}: "من" أكبر من "إلى"`
  }
  if (f.activity === 'custom' && f.activeFrom && f.activeTo && f.activeFrom > f.activeTo) return 'فترة النشاط: البداية بعد النهاية'
  return null
}

const sar = (v: string) => `${Number(v).toLocaleString('en-US')} ر.س`

export type FilterChip = { id: string; label: string; clear: Partial<ClientFilterState> }

/** One removable chip per active filter, in plain Arabic. */
export function activeClientFilterChips(f: ClientFilterState): FilterChip[] {
  const chips: FilterChip[] = []
  if (f.balance === 'has') chips.push({ id: 'balance', label: 'عليهم مستحقات', clear: { balance: '' } })
  if (f.balance === 'none') chips.push({ id: 'balance', label: 'بدون مستحقات', clear: { balance: '' } })
  const range = (id: string, lo: string, hi: string, name: string, fmt: (v: string) => string, clear: Partial<ClientFilterState>) => {
    const a = num(lo)
    const b = num(hi)
    if (a !== undefined && b !== undefined) chips.push({ id, label: `${name} بين ${fmt(a)} و ${fmt(b)}`, clear })
    else if (a !== undefined) chips.push({ id, label: `${name} ≥ ${fmt(a)}`, clear })
    else if (b !== undefined) chips.push({ id, label: `${name} ≤ ${fmt(b)}`, clear })
  }
  range('remaining', f.remainingMin, f.remainingMax, 'المستحق', sar, { remainingMin: '', remainingMax: '' })
  range('revenue', f.revenueMin, f.revenueMax, 'إجمالي التعامل', sar, { revenueMin: '', revenueMax: '' })
  if (num(f.invoicesMax) === '0' && num(f.invoicesMin) === undefined) chips.push({ id: 'invoices', label: 'بدون فواتير', clear: { invoicesMin: '', invoicesMax: '' } })
  else range('invoices', f.invoicesMin, f.invoicesMax, 'عدد الفواتير', (v) => v, { invoicesMin: '', invoicesMax: '' })
  if (num(f.openMin)) chips.push({ id: 'open', label: `فواتير غير مسددة ≥ ${f.openMin}`, clear: { openMin: '' } })
  if (num(f.collectionMin)) chips.push({ id: 'collection', label: `نسبة التحصيل ≥ ${f.collectionMin}%`, clear: { collectionMin: '' } })
  if (f.activity) {
    const label = ACTIVITY_OPTIONS.find((o) => o.key === f.activity)?.label ?? ''
    const r = activityRange(f)
    chips.push({
      id: 'activity',
      label: f.activity === 'custom' ? `تعامل من ${r.from ?? '…'} إلى ${r.to ?? '…'}` : `تعامل: ${label}`,
      clear: { activity: '', activeFrom: '', activeTo: '' },
    })
  }
  if (num(f.inactiveDays)) chips.push({ id: 'inactive', label: `لا تعامل منذ ${f.inactiveDays} يومًا`, clear: { inactiveDays: '' } })
  const od = num(f.overdueDays) ?? '30'
  if (f.overdue === 'yes') chips.push({ id: 'overdue', label: `لديهم متأخرات (> ${od} يومًا)`, clear: { overdue: '' } })
  if (f.overdue === 'no') chips.push({ id: 'overdue', label: `بدون متأخرات (> ${od} يومًا)`, clear: { overdue: '' } })
  if (num(f.overdueMin)) chips.push({ id: 'overdueMin', label: `متأخرات ≥ ${sar(f.overdueMin)}`, clear: { overdueMin: '' } })
  if (num(f.noPaymentDays)) chips.push({ id: 'nopay', label: `لم يسددوا منذ ${f.noPaymentDays} يومًا`, clear: { noPaymentDays: '' } })
  if (f.allPaid) chips.push({ id: 'allPaid', label: 'كل فواتيرهم مسددة', clear: { allPaid: false } })
  return chips
}

export type ClientPreset = {
  key: string
  label: string
  /** Exactly what the preset does — shown as the button tooltip. */
  hint: string
  patch?: Partial<ClientFilterState>
  sort?: { field: 'revenue' | 'invoices' | 'remaining' | 'collection'; order: 'desc' | 'asc' }
}

export const CLIENT_PRESETS: ClientPreset[] = [
  { key: 'no_balance', label: 'بدون مستحقات', hint: 'لا يوجد عليهم أي مبلغ مستحق', patch: { balance: 'none' } },
  { key: 'has_balance', label: 'عليهم مستحقات', hint: 'عليهم رصيد مستحق أكبر من صفر', patch: { balance: 'has' } },
  { key: 'big_balance', label: 'مبالغ كبيرة', hint: 'مستحق 10,000 ر.س فأكثر (يمكن تعديل المبلغ)', patch: { remainingMin: '10000' } },
  { key: 'top_value', label: 'الأعلى قيمة', hint: 'ترتيب حسب إجمالي التعامل من الأعلى', sort: { field: 'revenue', order: 'desc' } },
  { key: 'most_invoices', label: 'الأكثر تعاملًا', hint: 'ترتيب حسب عدد الفواتير من الأعلى', sort: { field: 'invoices', order: 'desc' } },
  {
    key: 'reliable', label: 'الأكثر التزامًا بالسداد',
    hint: 'نسبة تحصيل 90% فأكثر + 3 فواتير فأكثر + بدون متأخرات أقدم من 30 يومًا',
    patch: { collectionMin: '90', invoicesMin: '3', overdue: 'no', overdueDays: '30' }, sort: { field: 'collection', order: 'desc' },
  },
  { key: 'active', label: 'نشطون', hint: 'لديهم فاتورة خلال آخر 30 يومًا', patch: { activity: 'last30' } },
  { key: 'inactive', label: 'غير نشطين', hint: 'آخر فاتورة لهم أقدم من 90 يومًا', patch: { inactiveDays: '90' } },
  { key: 'overdue', label: 'لديهم متأخرات', hint: 'فواتير غير مسددة مضى على استحقاقها (أو تاريخها) أكثر من 30 يومًا', patch: { overdue: 'yes', overdueDays: '30' } },
  { key: 'many_unpaid', label: 'فواتير كثيرة غير مسددة', hint: '3 فواتير غير مسددة أو جزئية فأكثر', patch: { openMin: '3' } },
  { key: 'no_invoices', label: 'بدون فواتير', hint: 'عملاء مسجلون بلا أي فاتورة', patch: { invoicesMin: '', invoicesMax: '0' } },
  { key: 'all_paid', label: 'كل فواتيرهم مسددة', hint: 'لديهم فواتير ولا يوجد عليهم أي مستحق', patch: { allPaid: true, balance: '' } },
]
