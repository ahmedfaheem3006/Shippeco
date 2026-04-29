import type { Invoice } from './models'

export type DashboardPeriod = 'today' | 'week' | 'month' | 'year' | 'all'
export type DashboardChartView = 'daily' | 'monthly' | 'yearly'

export type DashRange = { from: string; to: string; label: string }

function toIsoDate(d: Date) {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addDays(d: Date, days: number) {
  const out = new Date(d.getTime())
  out.setDate(out.getDate() + days)
  return out
}

function startOfWeek(date: Date) {
  const out = new Date(date.getTime())
  out.setHours(0, 0, 0, 0)
  const day = out.getDay()
  out.setDate(out.getDate() - day)
  return out
}

function endOfWeek(date: Date) { return addDays(startOfWeek(date), 6) }

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

function pad2(n: number) { return String(n).padStart(2, '0') }

export function computeDashboardRange(period: DashboardPeriod): DashRange {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  if (period === 'today') { const iso = toIsoDate(now); return { from: iso, to: iso, label: 'اليوم' } }
  if (period === 'week') {
    const ws = startOfWeek(now)
    const we = endOfWeek(now) // ← was using endOfWeek already (correct)
    return { from: toIsoDate(ws), to: toIsoDate(we), label: 'هذا الأسبوع' }
  }
  if (period === 'month') {
    const ms = startOfMonth(now)
    const me = endOfMonth(now) // ← was using endOfMonth already (correct)
    return { from: toIsoDate(ms), to: toIsoDate(me), label: `هذا الشهر (${now.getFullYear()}-${pad2(now.getMonth() + 1)})` }
  }
  if (period === 'year') {
    // Fix: use Dec 31 as end date, NOT today — so full-year filter is consistent
    const ys = startOfYear(now)
    const ye = endOfYear(now)
    return { from: toIsoDate(ys), to: toIsoDate(ye), label: `هذه السنة (${now.getFullYear()})` }
  }
  return { from: '0000-01-01', to: '9999-12-31', label: 'الكل' }
}

function n(value: unknown) {
  const num = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(num) ? num : 0
}

function getPartialPaid(inv: Invoice): number { return n(inv.partialPaid) || n(inv.partial_paid) || 0 }
function getDhlCost(inv: Invoice): number { return n(inv.dhlCost) || n(inv.dhl_cost) || 0 }

export function realInvoiceStatus(inv: Invoice): string {
  const price = n(inv.price)
  const paid = getPartialPaid(inv)
  if (inv.status === 'returned') return 'returned'
  if (inv.status === 'paid') return 'paid'
  if (inv.status === 'partial') return 'partial'
  if (paid > 0 && paid < price) return 'partial'
  if (paid >= price && price > 0) return 'paid'
  return 'unpaid'
}

export function invoiceRevenue(inv: Invoice): number {
  return realInvoiceStatus(inv) === 'returned' ? 0 : n(inv.price)
}

export function collectedAmount(inv: Invoice): number {
  const st = realInvoiceStatus(inv)
  if (st === 'paid') return n(inv.price)
  if (st === 'partial') return Math.min(n(inv.price), Math.max(0, getPartialPaid(inv)))
  return 0
}

export function remainingAmount(inv: Invoice): number {
  const st = realInvoiceStatus(inv)
  if (st === 'unpaid') return n(inv.price)
  if (st === 'partial') return Math.max(0, n(inv.price) - getPartialPaid(inv))
  return 0
}

export type StatusAgg = { count: number; amount: number }

export type DashboardKpis = {
  totalCount: number; totalSales: number; totalCollected: number
  unpaid: StatusAgg; partial: StatusAgg & { paidAmount: number; remainingAmount: number }
  paid: StatusAgg; returned: StatusAgg; remaining: number
  profitTotal: number | null; marginAvgPct: number | null; losingCount: number
}

export function filterForDashboard(invoices: Invoice[], range: DashRange) {
  // Max valid date: 1 year from today (to catch corrupted future dates from day/month swap bug)
  const maxValidDate = new Date()
  maxValidDate.setFullYear(maxValidDate.getFullYear() + 1)
  const maxValidStr = maxValidDate.toISOString().slice(0, 10)

  return invoices.filter((inv) => {
    if (inv.isDraft) return false
    const d = String(inv.date || '').slice(0, 10)
    if (!d || d < '2000-01-01') return false
    // Reject suspiciously far-future dates (corrupted from day/month swap)
    if (d > maxValidStr) return false
    return d >= range.from && d <= range.to
  })
}

export function computeDashboardKpis(invoices: Invoice[]): DashboardKpis {
  let totalSales = 0, totalCollected = 0, remaining = 0
  let paidCount = 0, unpaidCount = 0, partialCount = 0, returnedCount = 0
  let paidAmount = 0, unpaidAmount = 0, partialAmount = 0, returnedAmount = 0
  let partialPaidTotal = 0, partialRemainingTotal = 0
  let profitTotal = 0, profitCount = 0, marginSum = 0, losingCount = 0

  for (const inv of invoices) {
    const st = realInvoiceStatus(inv)
    const price = n(inv.price)
    totalSales += invoiceRevenue(inv)
    totalCollected += collectedAmount(inv)
    remaining += remainingAmount(inv)

    if (st === 'paid') { paidCount++; paidAmount += price }
    else if (st === 'partial') { partialCount++; partialAmount += price; partialPaidTotal += collectedAmount(inv); partialRemainingTotal += remainingAmount(inv) }
    else if (st === 'unpaid') { unpaidCount++; unpaidAmount += price }
    else if (st === 'returned') { returnedCount++; returnedAmount += price }

    const cost = getDhlCost(inv)
    if (cost > 0 && price > 0 && st !== 'returned') {
      const profit = price - cost
      profitTotal += profit; profitCount++; marginSum += (profit / price) * 100
      if (profit < 0) losingCount++
    }
  }

  return {
    totalCount: invoices.length, totalSales, totalCollected,
    unpaid: { count: unpaidCount, amount: unpaidAmount },
    partial: { count: partialCount, amount: partialAmount, paidAmount: partialPaidTotal, remainingAmount: partialRemainingTotal },
    paid: { count: paidCount, amount: paidAmount },
    returned: { count: returnedCount, amount: returnedAmount },
    remaining,
    profitTotal: profitCount ? profitTotal : null,
    marginAvgPct: profitCount ? marginSum / profitCount : null,
    losingCount,
  }
}

export type SeriesPoint = { label: string; value: number }

export function computeRevenueSeries(invoices: Invoice[], view: DashboardChartView): SeriesPoint[] {
  if (view === 'yearly') {
    const map = new Map<string, number>()
    for (const inv of invoices) {
      if (realInvoiceStatus(inv) === 'returned') continue
      const year = String(inv.date || '').slice(0, 4)
      if (!/^\d{4}$/.test(year)) continue
      map.set(year, (map.get(year) ?? 0) + n(inv.price))
    }
    return [...map.keys()].sort().map((k) => ({ label: k, value: map.get(k) ?? 0 }))
  }

  if (view === 'monthly') {
    const map = new Map<string, number>()
    for (const inv of invoices) {
      if (realInvoiceStatus(inv) === 'returned') continue
      const key = String(inv.date || '').slice(0, 7)
      if (!/^\d{4}-\d{2}$/.test(key)) continue
      map.set(key, (map.get(key) ?? 0) + n(inv.price))
    }
    const keys = [...map.keys()].sort()
    return keys.slice(Math.max(0, keys.length - 12)).map((k) => ({ label: k, value: map.get(k) ?? 0 }))
  }

  // daily
  const map = new Map<string, number>()
  for (const inv of invoices) {
    if (realInvoiceStatus(inv) === 'returned') continue
    const key = String(inv.date || '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue
    map.set(key, (map.get(key) ?? 0) + n(inv.price))
  }
  const keys = [...map.keys()].sort()
  return keys.slice(Math.max(0, keys.length - 14)).map((k) => ({ label: k, value: map.get(k) ?? 0 }))
}

export type TopClientAgg = { name: string; count: number; amount: number }
export type PartialClientAgg = { name: string; count: number; totalAmount: number; paidAmount: number; remainingAmount: number }
export type RecentInvoiceRow = { id: string; invoiceNumber: string; client: string; date: string; status: Invoice['status']; amount: number; remaining: number; partialPaid: number }

export function computeTopClients(invoices: Invoice[], limit = 5): TopClientAgg[] {
  const map = new Map<string, { count: number; revenue: number }>()
  for (const inv of invoices) {
    const name = String(inv.client || '').trim() || '—'
    const cur = map.get(name) ?? { count: 0, revenue: 0 }
    cur.count += 1; cur.revenue += invoiceRevenue(inv)
    map.set(name, cur)
  }
  return [...map.entries()].map(([name, v]) => ({ name, count: v.count, amount: v.revenue }))
    .sort((a, b) => b.amount - a.amount).slice(0, limit)
}

export function computePartialClients(invoices: Invoice[], limit = 10): PartialClientAgg[] {
  const map = new Map<string, { count: number; total: number; paid: number; remaining: number }>()
  for (const inv of invoices) {
    if (realInvoiceStatus(inv) !== 'partial') continue
    const name = String(inv.client || '').trim() || '—'
    const cur = map.get(name) ?? { count: 0, total: 0, paid: 0, remaining: 0 }
    cur.count += 1; cur.total += n(inv.price); cur.paid += collectedAmount(inv); cur.remaining += remainingAmount(inv)
    map.set(name, cur)
  }
  return [...map.entries()].map(([name, v]) => ({ name, count: v.count, totalAmount: v.total, paidAmount: v.paid, remainingAmount: v.remaining }))
    .sort((a, b) => b.remainingAmount - a.remainingAmount).slice(0, limit)
}

export function computeRecentInvoices(invoices: Invoice[], limit = 6): RecentInvoiceRow[] {
  return [...invoices].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    .slice(0, limit).map((inv) => ({
      id: String(inv.id ?? ''),
      invoiceNumber: String(inv.invoice_number || inv.daftra_id || inv.id || ''),
      client: inv.client || '—',
      date: String(inv.date || '').slice(0, 10) || '—', status: inv.status,
      amount: n(inv.price), remaining: remainingAmount(inv), partialPaid: collectedAmount(inv),
    }))
}

export function computeItemsDistribution(_invoices: Invoice[], _limit = 8) { return [] as any[] }

export function formatSar(nValue: number) { return nValue.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' SAR' }
export function formatNum(nValue: number) { return nValue.toLocaleString('en-US') }

export function buildSparklinePath(points: number[], width: number, height: number, padding = 2) {
  if (!points.length) return ''
  const min = Math.min(...points); const max = Math.max(...points)
  const span = max - min || 1; const w = Math.max(1, width - padding * 2); const h = Math.max(1, height - padding * 2)
  const step = points.length === 1 ? 0 : w / (points.length - 1)
  const coords = points.map((v, i) => ({ x: padding + step * i, y: padding + (1 - (v - min) / span) * h }))
  return coords.map((c, idx) => `${idx === 0 ? 'M' : 'L'} ${c.x.toFixed(2)} ${c.y.toFixed(2)}`).join(' ')
}

export function buildSparkAreaPath(linePath: string, height: number, padding = 2) {
  const p = String(linePath || '').trim()
  if (!p) return ''
  const nums = p.replace(/[ML]/g, '').trim().split(/\s+/).map((x) => Number(x)).filter((x) => Number.isFinite(x))
  if (nums.length < 4) return ''
  const xs: number[] = []; for (let i = 0; i < nums.length; i += 2) xs.push(nums[i])
  return `M ${Math.min(...xs)} ${height - padding} ${p} L ${Math.max(...xs)} ${height - padding} Z`
}