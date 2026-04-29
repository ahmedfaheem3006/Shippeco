import type { Invoice } from './models'

export type ReportsPeriod = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom'
export type ReportsStatus = 'all' | 'paid' | 'unpaid' | 'partial' | 'returned' | 'unpaid_all'

export type DateRange = { from: string; to: string; label: string }

export function toIsoDate(d: Date) {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function parseIsoDate(value: string) {
  const s = String(value || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const d = new Date(s + 'T00:00:00.000Z')
  if (!Number.isFinite(d.getTime())) return null
  return d
}

function addDays(d: Date, days: number) {
  const out = new Date(d.getTime())
  out.setDate(out.getDate() + days)
  return out
}

function startOfWeek(date: Date) {
  const out = new Date(date.getTime())
  out.setHours(0, 0, 0, 0)
  out.setDate(out.getDate() - out.getDay())
  return out
}

function endOfWeek(date: Date) {
  return addDays(startOfWeek(date), 6)
}

function startOfMonth(date: Date) {
  const out = new Date(date.getTime())
  out.setHours(0, 0, 0, 0)
  out.setDate(1)
  return out
}

function endOfMonth(date: Date) {
  const out = new Date(date.getTime())
  out.setHours(0, 0, 0, 0)
  out.setMonth(out.getMonth() + 1, 0)
  return out
}

function startOfYear(date: Date) {
  const out = new Date(date.getTime())
  out.setHours(0, 0, 0, 0)
  out.setMonth(0, 1)
  return out
}

function endOfYear(date: Date) {
  const out = new Date(date.getTime())
  out.setHours(0, 0, 0, 0)
  out.setMonth(11, 31)
  return out
}

export function computeRange(period: ReportsPeriod, navOffset: number, custom: { from: string; to: string }): DateRange {
  const now = new Date()
  now.setHours(0, 0, 0, 0)

  if (period === 'custom') {
    const from = parseIsoDate(custom.from) ?? now
    const to = parseIsoDate(custom.to) ?? from
    const a = from.getTime() <= to.getTime() ? from : to
    const b = from.getTime() <= to.getTime() ? to : from
    return { from: toIsoDate(a), to: toIsoDate(b), label: `${toIsoDate(a)} → ${toIsoDate(b)}` }
  }

  if (period === 'daily') {
    const day = addDays(now, navOffset)
    const iso = toIsoDate(day)
    return { from: iso, to: iso, label: iso }
  }

  if (period === 'weekly') {
    const base = addDays(now, navOffset * 7)
    const a = startOfWeek(base)
    const b = endOfWeek(base)
    return { from: toIsoDate(a), to: toIsoDate(b), label: `${toIsoDate(a)} → ${toIsoDate(b)}` }
  }

  if (period === 'monthly') {
    const base = new Date(now.getTime())
    base.setMonth(base.getMonth() + navOffset, 1)
    const a = startOfMonth(base)
    const b = endOfMonth(base)
    return { from: toIsoDate(a), to: toIsoDate(b), label: `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}` }
  }

  const base = new Date(now.getTime())
  base.setFullYear(base.getFullYear() + navOffset)
  const a = startOfYear(base)
  const b = endOfYear(base)
  return { from: toIsoDate(a), to: toIsoDate(b), label: String(base.getFullYear()) }
}

export function statusLabel(status: Invoice['status'] | undefined) {
  if (status === 'paid') return 'مدفوعة'
  if (status === 'partial') return 'جزئية'
  if (status === 'returned') return 'مرتجعة'
  return 'غير مدفوعة'
}

export function amount(n: unknown) {
  const num = typeof n === 'number' ? n : Number(n)
  return Number.isFinite(num) ? num : 0
}

function getPartialPaid(inv: Invoice): number {
  return amount(inv.partialPaid) || amount(inv.partial_paid) || 0
}

function getDhlCost(inv: Invoice): number {
  return amount(inv.dhlCost) || amount(inv.dhl_cost) || 0
}

export function computeRemaining(inv: Invoice) {
  const total = amount(inv.price)
  if (inv.status === 'paid') return 0
  if (inv.status === 'returned') return 0
  if (inv.status === 'partial') return Math.max(0, total - getPartialPaid(inv))
  return total
}

export function computeCollected(inv: Invoice) {
  const total = amount(inv.price)
  if (inv.status === 'paid') return total
  if (inv.status === 'partial') return Math.min(total, Math.max(0, getPartialPaid(inv)))
  return 0
}

/** نسبة التحصيل: مدفوعة=100%، جزئية=نسبة المدفوع، غير مدفوعة=0% */
export function computeCollectionPct(inv: Invoice): number {
  const total = amount(inv.price)
  if (total <= 0) return 0
  if (inv.status === 'paid') return 100
  if (inv.status === 'returned') return 0
  if (inv.status === 'partial') {
    const paid = getPartialPaid(inv)
    return Math.min(100, Math.max(0, (paid / total) * 100))
  }
  return 0
}

export type ReportsFilters = {
  query: string
  status: ReportsStatus
  range: DateRange
}

export function filterInvoices(invoices: Invoice[], filters: ReportsFilters) {
  const q = filters.query.trim().toLowerCase()
  const from = filters.range.from
  const to = filters.range.to

  return invoices.filter((inv) => {
    if (inv.isDraft) return false

    const date = String(inv.date || '').slice(0, 10)
    if (date && date < from) return false
    if (date && date > to) return false

    if (filters.status === 'paid' && inv.status !== 'paid') return false
    if (filters.status === 'unpaid' && inv.status !== 'unpaid') return false
    if (filters.status === 'partial' && inv.status !== 'partial') return false
    if (filters.status === 'returned' && inv.status !== 'returned') return false
    if (filters.status === 'unpaid_all' && inv.status === 'paid') return false

    if (!q) return true
    const hay = [inv.id, inv.client, inv.phone ?? '', inv.carrier ?? '', inv.daftra_id ?? ''].join(' ').toLowerCase()
    return hay.includes(q)
  })
}

export type ReportsSummary = {
  totalCount: number
  totalAmount: number
  paidCount: number
  paidAmount: number
  unpaidCount: number
  unpaidAmount: number
  partialCount: number
  partialAmount: number
  returnedCount: number
  returnedAmount: number
  remainingAmount: number
  collectedAmount: number
  profitTotal: number
  profitCount: number
  losingCount: number
  avgInvoice: number
  collectionRate: number
}

export function computeSummary(invoices: Invoice[]): ReportsSummary {
  let totalAmount = 0, paidAmount = 0, unpaidAmount = 0, partialAmount = 0, returnedAmount = 0
  let paidCount = 0, unpaidCount = 0, partialCount = 0, returnedCount = 0
  let remainingAmount = 0, collectedAmount = 0
  let profitTotal = 0, profitCount = 0, losingCount = 0

  for (const inv of invoices) {
    const v = amount(inv.price)
    totalAmount += v
    remainingAmount += computeRemaining(inv)
    collectedAmount += computeCollected(inv)

    if (inv.status === 'paid') { paidCount++; paidAmount += v }
    else if (inv.status === 'partial') { partialCount++; partialAmount += v }
    else if (inv.status === 'returned') { returnedCount++; returnedAmount += v }
    else { unpaidCount++; unpaidAmount += v }

    const cost = getDhlCost(inv)
    if (cost > 0 && v > 0) {
      const profit = v - cost
      profitTotal += profit
      profitCount++
      if (profit < 0) losingCount++
    }
  }

  const totalCount = invoices.length
  return {
    totalCount, totalAmount, paidCount, paidAmount, unpaidCount, unpaidAmount,
    partialCount, partialAmount, returnedCount, returnedAmount,
    remainingAmount, collectedAmount, profitTotal, profitCount, losingCount,
    avgInvoice: totalCount > 0 ? totalAmount / totalCount : 0,
    collectionRate: totalAmount > 0 ? (collectedAmount / totalAmount) * 100 : 0,
  }
}

// ── تحليل الناقلين ──
export type CarrierAgg = { carrier: string; count: number; amount: number; percentage: number }

export function computeCarrierBreakdown(invoices: Invoice[]): CarrierAgg[] {
  const map = new Map<string, { count: number; amount: number }>()
  for (const inv of invoices) {
    const c = (inv.carrier || 'غير محدد').trim()
    const cur = map.get(c) ?? { count: 0, amount: 0 }
    cur.count++; cur.amount += amount(inv.price)
    map.set(c, cur)
  }
  const total = invoices.length || 1
  return [...map.entries()]
    .map(([carrier, v]) => ({ carrier, count: v.count, amount: v.amount, percentage: (v.count / total) * 100 }))
    .sort((a, b) => b.count - a.count)
}

// ── أكبر العملاء ──
export type ClientAgg = { name: string; count: number; amount: number; remaining: number }

export function computeTopClients(invoices: Invoice[], limit = 10): ClientAgg[] {
  const map = new Map<string, { count: number; amount: number; remaining: number }>()
  for (const inv of invoices) {
    const name = (inv.client || '—').trim()
    const cur = map.get(name) ?? { count: 0, amount: 0, remaining: 0 }
    cur.count++; cur.amount += amount(inv.price); cur.remaining += computeRemaining(inv)
    map.set(name, cur)
  }
  return [...map.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit)
}

// ── الإيرادات اليومية ──
export type DailyPoint = { date: string; amount: number; count: number }

export function computeDailySeries(invoices: Invoice[]): DailyPoint[] {
  const map = new Map<string, { amount: number; count: number }>()
  for (const inv of invoices) {
    const d = String(inv.date || '').slice(0, 10)
    if (!d) continue
    const cur = map.get(d) ?? { amount: 0, count: 0 }
    cur.amount += amount(inv.price); cur.count++
    map.set(d, cur)
  }
  return [...map.entries()].map(([date, v]) => ({ date, ...v })).sort((a, b) => a.date.localeCompare(b.date))
}

// ── تنسيق الأرقام (إنجليزي) + SAR ──
export function formatSar(n: number | undefined | null) {
  const v = Number(n) || 0;
  return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' SAR';
}

export function formatNum(n: number | undefined | null) {
  const v = Number(n) || 0;
  return v.toLocaleString('en-US');
}

export function formatPct(n: number | undefined | null) {
  const v = Number(n) || 0;
  return v.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
}

// ── تصدير ──
export type ExportRow = Record<string, string>

export function toExportRows(invoices: Invoice[]): ExportRow[] {
  return invoices.map((inv) => ({
    'رقم الفاتورة': String(inv.id ?? ''),
    'رقم دفترة': String(inv.daftra_id ?? ''),
    'التاريخ': String(inv.date ?? '').slice(0, 10),
    'العميل': String(inv.client ?? ''),
    'الجوال': String(inv.phone ?? ''),
    'الناقل': String(inv.carrier ?? ''),
    'الحالة': statusLabel(inv.status),
    'المبلغ (SAR)': amount(inv.price).toFixed(2),
    'المدفوع (SAR)': computeCollected(inv).toFixed(2),
    'المتبقي (SAR)': computeRemaining(inv).toFixed(2),
    'نسبة التحصيل': computeCollectionPct(inv).toFixed(1) + '%',
  }))
}

export function rowsToCsv(rows: Record<string, string>[]) {
  if (!rows.length) return ''
  const headers = Object.keys(rows[0])
  const esc = (v: string) => {
    const s = String(v ?? '')
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }
  const lines = [headers.join(',')]
  for (const r of rows) lines.push(headers.map((h) => esc(r[h] ?? '')).join(','))
  return '\uFEFF' + lines.join('\n')
}