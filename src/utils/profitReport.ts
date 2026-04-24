import type { Invoice } from './models'

/* ═══════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════ */

export type ProfitPeriod = 'month' | 'last_month' | 'quarter' | 'year' | 'all' | 'custom'
export type ProfitTab = 'invoices' | 'clients' | 'monthly'
export type ProfitRange = { from: string; to: string; label: string }

export type ProfitInvoiceRow = {
  id: string
  invoiceNumber: string
  client: string
  awb: string
  carrier: string
  status: Invoice['status']
  date: string
  price: number
  cost: number | null
  profit: number | null
  marginPct: number | null
  hasCost: boolean
  losing: boolean
  isLocal: boolean
}

export type ProfitSummary = {
  totalCount: number
  localCount: number
  revenue: number
  localRevenue: number
  countedCount: number
  uncountedCount: number
  cost: number
  profit: number
  avgMarginPct: number
  losingCount: number
  bestMargin: number
  worstMargin: number
  avgProfit: number
}

export type ClientProfitRow = {
  client: string
  count: number
  revenue: number
  cost: number
  profit: number
  hasCostCount: number
  marginPct: number | null
}

export type MonthlyProfitRow = {
  month: string
  count: number
  revenue: number
  cost: number
  profit: number
  hasCostCount: number
  marginPct: number | null
}

export type ProfitExportRow = {
  invoice_id: string
  invoice_number: string
  client: string
  awb: string
  carrier: string
  status: string
  date: string
  price: string
  dhl_cost: string
  profit: string
  margin_pct: string
  source: string
}

export type ProfitChartPoint = {
  label: string
  revenue: number
  cost: number
  profit: number
  count: number
}

/* ═══════════════════════════════════════════════════
   FORMAT — English numbers + SAR
   ═══════════════════════════════════════════════════ */

export function formatSar(value: number): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + ' SAR'
}

export function formatNum(value: number): string {
  return value.toLocaleString('en-US')
}

export function formatPct(value: number | null | undefined): string {
  if (value == null) return '—'
  return value.toFixed(1) + '%'
}

/* ═══════════════════════════════════════════════════
   STATUS LABEL
   ═══════════════════════════════════════════════════ */

export function statusLabel(status: Invoice['status']): string {
  if (status === 'paid') return 'مدفوعة'
  if (status === 'partial') return 'جزئية'
  if (status === 'returned') return 'مرتجعة'
  return 'غير مدفوعة'
}

export function statusColor(status: Invoice['status']): string {
  if (status === 'paid') return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800/30'
  if (status === 'partial') return 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/30'
  if (status === 'returned') return 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800/30'
  return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800/30'
}

/* ═══════════════════════════════════════════════════
   DATE RANGE
   ═══════════════════════════════════════════════════ */

function toIsoDate(d: Date) {
  return d.toISOString().slice(0, 10)
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

export function computeProfitRange(period: ProfitPeriod, custom: { from: string; to: string }): ProfitRange {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const to = toIsoDate(now)

  if (period === 'custom') {
    const fromVal = custom.from || '2020-01-01'
    const toVal = custom.to || '2099-12-31'
    const a = fromVal <= toVal ? fromVal : toVal
    const b = fromVal <= toVal ? toVal : fromVal
    return { from: a, to: b, label: `${a} → ${b}` }
  }
  if (period === 'month') {
    const from = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-01`
    return { from, to, label: 'هذا الشهر' }
  }
  if (period === 'last_month') {
    const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const lme = new Date(now.getFullYear(), now.getMonth(), 0)
    return { from: toIsoDate(lm), to: toIsoDate(lme), label: 'الشهر السابق' }
  }
  if (period === 'quarter') {
    const from = toIsoDate(new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000))
    return { from, to, label: 'آخر 3 أشهر' }
  }
  if (period === 'year') {
    const from = `${now.getFullYear()}-01-01`
    return { from, to, label: 'هذه السنة' }
  }
  return { from: '2020-01-01', to: '2099-12-31', label: 'كل الفترات' }
}

/* ═══════════════════════════════════════════════════
   MONTH LABEL
   ═══════════════════════════════════════════════════ */

export function formatMonthLabel(month: string): string {
  const m = String(month || '').trim()
  const match = /^(\d{4})-(\d{2})/.exec(m)
  if (!match) return m || 'بدون تاريخ'
  const yr = match[1]
  const idx = Number(match[2]) - 1
  const months = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
  return `${months[idx] ?? m} ${yr}`
}

/* ═══════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════ */

function n(value: unknown): number {
  const num = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(num) ? num : 0
}

/** Check if invoice was created locally (not from Daftra sync) */
function isLocalInvoice(inv: Invoice): boolean {
  // Local invoices have source='local' or no daftra_id, or created_via='manual'
  if ((inv as any).source === 'local') return true
  if ((inv as any).created_via === 'manual') return true
  // If daftra_id is missing or 0, it's local
  const daftraId = n((inv as any).daftra_id || (inv as any).daftraId)
  if (!daftraId) return true
  return false
}

export type InvoiceProfit = {
  price: number
  cost: number
  hasCost: boolean
  profit: number | null
  marginPct: number | null
}

export function calcInvoiceProfit(inv: Invoice): InvoiceProfit {
  const price = n(inv.price)
  const cost = n(inv.dhlCost)
  const hasCost = cost > 0
  const profit = hasCost ? price - cost : null
  const marginPct = hasCost && price > 0 ? (profit! / price) * 100 : null
  return { price, cost, hasCost, profit, marginPct }
}

/* ═══════════════════════════════════════════════════
   FILTER
   ═══════════════════════════════════════════════════ */

export function filterProfitInvoices(
  invoices: Invoice[],
  range: ProfitRange,
  query: string,
  localOnly: boolean = true,
): Invoice[] {
  const from = range.from
  const to = range.to
  const q = query.trim().toLowerCase()

  return invoices.filter((i) => {
    if (i.isDraft) return false
    // If localOnly, only show invoices created in the website
    if (localOnly && !isLocalInvoice(i)) return false
    // Exclude returned
    if (i.status === 'returned') return false
    const d = String(i.date || '').slice(0, 10)
    if (d && d < from) return false
    if (d && d > to) return false
    if (!q) return true
    const hay = [i.client || '', String(i.id), i.awb || '', (i as any).invoiceNumber || ''].join(' ').toLowerCase()
    return hay.includes(q)
  })
}

/* ═══════════════════════════════════════════════════
   INVOICE ROWS
   ═══════════════════════════════════════════════════ */

export function toProfitInvoiceRows(filtered: Invoice[]): ProfitInvoiceRow[] {
  return [...filtered]
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    .map((inv) => {
      const p = calcInvoiceProfit(inv)
      const losing = p.hasCost && (p.profit ?? 0) < 0
      return {
        id: String(inv.id ?? ''),
        invoiceNumber: (inv as any).invoiceNumber || (inv as any).invoice_number || String(inv.id ?? ''),
        client: inv.client || '—',
        awb: inv.awb || '',
        carrier: inv.carrier || '—',
        status: inv.status,
        date: String(inv.date || '').slice(0, 10) || '—',
        price: p.price,
        cost: p.hasCost ? p.cost : null,
        profit: p.profit,
        marginPct: p.marginPct,
        hasCost: p.hasCost,
        losing,
        isLocal: isLocalInvoice(inv),
      }
    })
}

/* ═══════════════════════════════════════════════════
   SUMMARY
   ═══════════════════════════════════════════════════ */

export function computeProfitSummary(filtered: Invoice[]): ProfitSummary {
  const localInvs = filtered.filter(isLocalInvoice)
  const revenue = filtered.reduce((s, i) => s + n(i.price), 0)
  const localRevenue = localInvs.reduce((s, i) => s + n(i.price), 0)
  const hasCost = filtered.filter((i) => n(i.dhlCost) > 0)
  const uncountedCount = filtered.length - hasCost.length
  const cost = hasCost.reduce((s, i) => s + n(i.dhlCost), 0)
  const profit = hasCost.reduce((s, i) => s + (n(i.price) - n(i.dhlCost)), 0)
  const losingCount = hasCost.filter((i) => n(i.price) < n(i.dhlCost)).length

  const margins = hasCost.map((i) => calcInvoiceProfit(i).marginPct ?? 0)
  const avgMarginPct = margins.length ? margins.reduce((a, b) => a + b, 0) / margins.length : 0
  const bestMargin = margins.length ? Math.max(...margins) : 0
  const worstMargin = margins.length ? Math.min(...margins) : 0
  const avgProfit = hasCost.length ? profit / hasCost.length : 0

  return {
    totalCount: filtered.length,
    localCount: localInvs.length,
    revenue,
    localRevenue,
    countedCount: hasCost.length,
    uncountedCount,
    cost,
    profit,
    avgMarginPct,
    losingCount,
    bestMargin,
    worstMargin,
    avgProfit,
  }
}

/* ═══════════════════════════════════════════════════
   CLIENT ROWS
   ═══════════════════════════════════════════════════ */

export function computeClientProfitRows(filtered: Invoice[]): ClientProfitRow[] {
  const map = new Map<string, Omit<ClientProfitRow, 'marginPct'>>()
  for (const inv of filtered) {
    const client = inv.client || 'غير محدد'
    const cur = map.get(client) ?? { client, count: 0, revenue: 0, cost: 0, profit: 0, hasCostCount: 0 }
    cur.count += 1
    cur.revenue += n(inv.price)
    if (n(inv.dhlCost) > 0) {
      cur.cost += n(inv.dhlCost)
      cur.profit += n(inv.price) - n(inv.dhlCost)
      cur.hasCostCount += 1
    }
    map.set(client, cur)
  }
  return [...map.values()]
    .map((r) => ({
      ...r,
      marginPct: r.hasCostCount && r.revenue > 0 ? (r.profit / r.revenue) * 100 : null,
    }))
    .sort((a, b) => b.revenue - a.revenue)
}

/* ═══════════════════════════════════════════════════
   MONTHLY ROWS
   ═══════════════════════════════════════════════════ */

export function computeMonthlyProfitRows(filtered: Invoice[]): MonthlyProfitRow[] {
  const map = new Map<string, Omit<MonthlyProfitRow, 'marginPct'>>()
  for (const inv of filtered) {
    const d = String(inv.date || '').slice(0, 7) || 'بدون تاريخ'
    const cur = map.get(d) ?? { month: d, count: 0, revenue: 0, cost: 0, profit: 0, hasCostCount: 0 }
    cur.count += 1
    cur.revenue += n(inv.price)
    if (n(inv.dhlCost) > 0) {
      cur.cost += n(inv.dhlCost)
      cur.profit += n(inv.price) - n(inv.dhlCost)
      cur.hasCostCount += 1
    }
    map.set(d, cur)
  }
  return [...map.values()]
    .map((r) => ({
      ...r,
      marginPct: r.hasCostCount && r.revenue > 0 ? (r.profit / r.revenue) * 100 : null,
    }))
    .sort((a, b) => b.month.localeCompare(a.month))
}

/* ═══════════════════════════════════════════════════
   CHART DATA
   ═══════════════════════════════════════════════════ */

export function computeProfitChartData(filtered: Invoice[]): ProfitChartPoint[] {
  const map = new Map<string, ProfitChartPoint>()
  for (const inv of filtered) {
    const d = String(inv.date || '').slice(0, 7) || 'N/A'
    const cur = map.get(d) ?? { label: d, revenue: 0, cost: 0, profit: 0, count: 0 }
    const price = n(inv.price)
    const cost = n(inv.dhlCost)
    cur.revenue += price
    cur.count += 1
    if (cost > 0) {
      cur.cost += cost
      cur.profit += price - cost
    }
    map.set(d, cur)
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label))
}

/* ═══════════════════════════════════════════════════
   EXPORT
   ═══════════════════════════════════════════════════ */

export function toProfitExportRows(rows: ProfitInvoiceRow[]): ProfitExportRow[] {
  return rows.map((r) => ({
    invoice_id: r.id,
    invoice_number: r.invoiceNumber,
    client: r.client === '—' ? '' : r.client,
    awb: r.awb || '',
    carrier: r.carrier === '—' ? '' : r.carrier,
    status: statusLabel(r.status),
    date: r.date === '—' ? '' : r.date,
    price: r.price.toFixed(2),
    dhl_cost: r.hasCost && r.cost != null ? r.cost.toFixed(2) : '',
    profit: r.hasCost && r.profit != null ? r.profit.toFixed(2) : '',
    margin_pct: r.hasCost && r.marginPct != null ? r.marginPct.toFixed(1) : '',
    source: r.isLocal ? 'Local' : 'Daftra',
  }))
}