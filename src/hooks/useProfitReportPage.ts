import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../utils/apiClient'
import { downloadBlob } from '../utils/download'
import { rowsToCsv } from '../utils/reports'
import {
  computeProfitRange,
  formatSar,
  toProfitExportRows,
  isLocalInvoice,
  type ProfitPeriod,
  type ProfitTab,
  type ProfitInvoiceRow,
  type ProfitSummary,
  type ClientProfitRow,
  type MonthlyProfitRow,
  type ProfitChartPoint,
} from '../utils/profitReport'

type ExportFormat = 'csv' | 'xlsx'
const PAGE_SIZE = 50

async function exportXlsx(rows: Record<string, string>[], filename: string) {
  const XLSX = await import('xlsx')
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Profit')
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
  downloadBlob(
    filename,
    new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
  )
}

/* ═══════════════════════════════════════════════════
   FETCH — tries /profit-data, falls back to /light
   ═══════════════════════════════════════════════════ */

async function fetchProfitData(params: {
  date_from: string
  date_to: string
  local_only: boolean
  search: string
  page: number
  limit: number
}) {
  // ── Try dedicated endpoint ──
  try {
    const qs = new URLSearchParams({
      date_from: params.date_from,
      date_to: params.date_to,
      local_only: params.local_only ? '1' : '0',
      search: params.search,
      page: String(params.page),
      limit: String(params.limit),
    })
    const result = await api.get(`/invoices/profit-data?${qs}`)
    if (result && (result.summary || result.invoices)) return result
  } catch {
    // fallback
  }

  // ── Fallback: /invoices/light ──
  const qs = new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit),
    date_from: params.date_from,
    date_to: params.date_to,
  })
  if (params.search) qs.set('search', params.search)

  const result = await api.get(`/invoices/light?${qs}`)

  let invoices: any[] = []
  let paginationInfo = { page: params.page, limit: params.limit, total: 0, pages: 1 }

  if (Array.isArray(result)) {
    invoices = result
    paginationInfo.total = result.length
  } else if (result?.data && Array.isArray(result.data)) {
    invoices = result.data
    paginationInfo = result.pagination || result.meta || paginationInfo
  } else if (Array.isArray(result?.invoices)) {
    invoices = result.invoices
    paginationInfo = result.pagination || paginationInfo
  }

  // Filter local only
  if (params.local_only) {
    invoices = invoices.filter((inv: any) => isLocalInvoice(inv))
  }

  // Exclude returned
  invoices = invoices.filter((inv: any) => {
    const ps = inv.payment_status ?? inv.paymentStatus
    return ps !== 3 && inv.status !== 'returned'
  })

  // Compute stats
  let totalRevenue = 0, totalCost = 0, totalProfit = 0
  let countedCount = 0, uncountedCount = 0, losingCount = 0
  const margins: number[] = []

  const monthMap = new Map<string, { revenue: number; cost: number; profit: number; count: number }>()
  const clientMap = new Map<string, { client: string; count: number; revenue: number; cost: number; profit: number; hasCostCount: number }>()

  const mapped = invoices.map((inv: any) => {
    const price = Number(inv.total || inv.price || 0)
    const cost = Number(inv.dhl_cost || inv.dhlCost || 0)
    const hasCost = cost > 0
    const date = (inv.invoice_date || inv.date || '').toString().slice(0, 10)
    const client = inv.client_name || inv.client || '—'

    totalRevenue += price
    if (hasCost) {
      totalCost += cost
      totalProfit += price - cost
      countedCount++
      if (price > 0) margins.push(((price - cost) / price) * 100)
      if (price < cost) losingCount++
    } else {
      uncountedCount++
    }

    // Month aggregation
    const m = date.slice(0, 7) || 'N/A'
    const mc = monthMap.get(m) || { revenue: 0, cost: 0, profit: 0, count: 0 }
    mc.revenue += price; mc.count++
    if (hasCost) { mc.cost += cost; mc.profit += price - cost }
    monthMap.set(m, mc)

    // Client aggregation
    const cc = clientMap.get(client) || { client, count: 0, revenue: 0, cost: 0, profit: 0, hasCostCount: 0 }
    cc.count++; cc.revenue += price
    if (hasCost) { cc.cost += cost; cc.profit += price - cost; cc.hasCostCount++ }
    clientMap.set(client, cc)

    return {
      id: inv.id,
      daftra_id: inv.daftra_id || inv.daftraId,
      invoiceNumber: inv.invoice_number || inv.invoiceNumber || String(inv.id),
      client,
      phone: inv.phone || '',
      carrier: inv.carrier || '—',
      price,
      dhlCost: cost,
      awb: inv.awb || '',
      status: inv.status || (inv.payment_status === 2 ? 'paid' : inv.payment_status === 1 ? 'partial' : 'unpaid'),
      date,
      paidAmount: Number(inv.paid_amount || inv.paidAmount || 0),
    }
  })

  const avgMarginPct = margins.length ? margins.reduce((a, b) => a + b, 0) / margins.length : 0

  return {
    summary: {
      totalCount: paginationInfo.total || mapped.length,
      revenue: totalRevenue,
      countedCount,
      uncountedCount,
      cost: totalCost,
      profit: totalProfit,
      avgMarginPct,
      losingCount,
      bestMargin: margins.length ? Math.max(...margins) : 0,
      worstMargin: margins.length ? Math.min(...margins) : 0,
      avgProfit: countedCount > 0 ? totalProfit / countedCount : 0,
    },
    invoices: mapped,
    chartData: [...monthMap.entries()]
      .map(([label, d]) => ({ label, ...d }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    clientRows: [...clientMap.values()]
      .map((r) => ({
        ...r,
        marginPct: r.hasCostCount > 0 && r.revenue > 0 ? (r.profit / r.revenue) * 100 : null,
      }))
      .sort((a, b) => b.revenue - a.revenue),
    pagination: paginationInfo,
  }
}

/* ═══════════════════════════════════════════════════
   HOOK
   ═══════════════════════════════════════════════════ */

export function useProfitReportPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [serverSummary, setServerSummary] = useState<ProfitSummary | null>(null)
  const [invoiceRows, setInvoiceRows] = useState<ProfitInvoiceRow[]>([])
  const [clientRows, setClientRows] = useState<ClientProfitRow[]>([])
  const [dailyRows, setDailyRows] = useState<MonthlyProfitRow[]>([])
  const [weeklyRows, setWeeklyRows] = useState<MonthlyProfitRow[]>([])
  const [monthlyRows, setMonthlyRows] = useState<MonthlyProfitRow[]>([])
  const [yearlyRows, setYearlyRows] = useState<MonthlyProfitRow[]>([])
  const [chartData, setChartData] = useState<ProfitChartPoint[]>([])
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, pages: 1 })

  const [period, setPeriod] = useState<ProfitPeriod>('month')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [tab, setTab] = useState<ProfitTab>('invoices')
  const [localOnly, setLocalOnly] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)

  // ── Debounce Search Query ──
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query)
    }, 500)
    return () => clearTimeout(timer)
  }, [query])

  const range = useMemo(() => computeProfitRange(period, { from, to }), [from, period, to])

  const fetchData = useCallback(
    async (pageNum?: number) => {
      setLoading(true)
      setError(null)
      const pg = pageNum ?? currentPage

      try {
        const data = await fetchProfitData({
          date_from: range.from,
          date_to: range.to,
          local_only: localOnly,
          search: query,
          page: pg,
          limit: PAGE_SIZE,
        })

        if (data.summary) {
          setServerSummary({
            totalCount: data.summary.totalCount || 0,
            localCount: data.summary.totalCount || 0,
            revenue: data.summary.revenue || 0,
            localRevenue: data.summary.revenue || 0,
            countedCount: data.summary.countedCount || 0,
            uncountedCount: data.summary.uncountedCount || 0,
            cost: data.summary.cost || 0,
            profit: data.summary.profit || 0,
            avgMarginPct: data.summary.avgMarginPct || 0,
            losingCount: data.summary.losingCount || 0,
            bestMargin: data.summary.bestMargin || 0,
            worstMargin: data.summary.worstMargin || 0,
            avgProfit: data.summary.avgProfit || 0,
          })
        }

        if (data.invoices) {
          setInvoiceRows(
            data.invoices.map((inv: any) => {
              const price = Number(inv.price) || 0
              const cost = Number(inv.dhlCost) || 0
              const hasCost = cost > 0
              const profit = hasCost ? price - cost : null
              const marginPct = hasCost && price > 0 ? (profit! / price) * 100 : null
              return {
                id: String(inv.id || ''),
                invoiceNumber: inv.invoiceNumber || String(inv.id || ''),
                client: inv.client || '—',
                awb: inv.awb || '',
                carrier: inv.carrier || '—',
                status: inv.status || 'unpaid',
                date: inv.date || '—',
                price,
                cost: hasCost ? cost : null,
                profit,
                marginPct,
                hasCost,
                losing: hasCost && (profit ?? 0) < 0,
                isLocal: isLocalInvoice(inv),
                raw: inv,
              }
            }),
          )
        }

        if (data.chartData) setChartData(data.chartData)
        if (data.clientRows) setClientRows(data.clientRows)

        if (data.clientRows) setClientRows(data.clientRows)

        if (data.invoices) {
          const invoices = data.invoices as any[]
          const group = (sliceLen: number | ((d: string) => string)) => {
            const map = new Map<string, any>()
            invoices.forEach((inv) => {
              const d = inv.date || ''
              let key = ''
              if (typeof sliceLen === 'function') {
                key = sliceLen(d)
              } else if (sliceLen === 10.1) {
                // Special case for Weekly
                const date = new Date(d)
                if (Number.isNaN(date.getTime())) {
                  key = 'N/A'
                } else {
                  const day = date.getDay()
                  const diff = date.getDate() - day + (day === 0 ? -6 : 1) // Sunday start adjustment
                  const start = new Date(date.setDate(diff))
                  key = `Week: ${start.toISOString().slice(0, 10)}`
                }
              } else {
                key = d.slice(0, sliceLen)
              }
              
              if (!key) return
              const cur = map.get(key) || { month: key, count: 0, revenue: 0, cost: 0, profit: 0 }
              cur.count++
              cur.revenue += Number(inv.price) || 0
              if (Number(inv.dhlCost) > 0) {
                cur.cost += Number(inv.dhlCost)
                cur.profit += (Number(inv.price) || 0) - (Number(inv.dhlCost) || 0)
              }
              map.set(key, cur)
            })
            return [...map.values()]
              .map((r) => ({
                ...r,
                marginPct: r.revenue > 0 && r.cost > 0 ? (r.profit / r.revenue) * 100 : null,
              }))
              .sort((a, b) => b.month.localeCompare(a.month))
          }

          setDailyRows(group(10))
          setMonthlyRows(group(7))
          setYearlyRows(group(4))
          setWeeklyRows(group(10.1)) // 10.1 is our internal flag for Weekly grouping
        }

        if (data.pagination) setPagination(data.pagination)
      } catch (e: any) {
        console.error('[ProfitReport] Error:', e.message)
        setError(e.message || 'فشل تحميل البيانات')
      } finally {
        setLoading(false)
      }
    },
    [range.from, range.to, localOnly, debouncedQuery, currentPage],
  )

  const refresh = useCallback(async () => {
    if (!from || !to) {
      const init = computeProfitRange(period, { from: '', to: '' })
      setFrom(init.from)
      setTo(init.to)
    }
    setCurrentPage(1)
    await fetchData(1)
  }, [fetchData, from, to, period])

  const onSetPeriod = useCallback((p: ProfitPeriod) => {
    const next = computeProfitRange(p, { from: '', to: '' })
    setPeriod(p)
    setFrom(next.from)
    setTo(next.to)
    setCurrentPage(1)
  }, [])

  const onSetQuery = useCallback((q: string) => { setQuery(q); setCurrentPage(1) }, [])
  const onSetTab = useCallback((t: ProfitTab) => { setTab(t); setCurrentPage(1) }, [])
  const onSetLocalOnly = useCallback((val: boolean) => { setLocalOnly(val); setCurrentPage(1) }, [])
  const onSetPage = useCallback((pg: number) => { setCurrentPage(pg); void fetchData(pg) }, [fetchData])

  const summary: ProfitSummary = serverSummary ?? {
    totalCount: 0, localCount: 0, revenue: 0, localRevenue: 0,
    countedCount: 0, uncountedCount: 0, cost: 0, profit: 0,
    avgMarginPct: 0, losingCount: 0, bestMargin: 0, worstMargin: 0, avgProfit: 0,
  }

  const summaryCards = useMemo(() => {
    const profitColor = summary.profit >= 0 ? '#22c55e' : '#ef4444'
    return {
      revenue: { label: 'الإيرادات', value: formatSar(summary.revenue), sub: `من ${summary.totalCount} فاتورة`, color: '#eab308', icon: 'revenue' as const },
      cost: { label: 'تكلفة DHL', value: formatSar(summary.cost), sub: `من ${summary.countedCount} فاتورة محسوبة`, color: '#ef4444', icon: 'cost' as const },
      profit: { label: 'صافي الربح', value: formatSar(summary.profit), sub: `من ${summary.countedCount} فاتورة`, color: profitColor, icon: 'profit' as const },
      margin: { label: 'متوسط الهامش', value: `${summary.avgMarginPct.toFixed(1)}%`, sub: `${summary.countedCount} فاتورة محسوبة`, color: '#6366f1', icon: 'margin' as const },
      avgProfit: { label: 'متوسط الربح / فاتورة', value: formatSar(summary.avgProfit), sub: `أفضل: ${summary.bestMargin.toFixed(1)}% | أسوأ: ${summary.worstMargin.toFixed(1)}%`, color: '#06b6d4', icon: 'avg' as const },
      uncounted: { label: 'غير محسوبة', value: String(summary.uncountedCount), sub: 'بدون تكلفة DHL', color: '#9ca3af', icon: 'uncounted' as const },
      losing: { label: 'فواتير خاسرة', value: String(summary.losingCount), sub: 'تكلفة أعلى من السعر', color: '#ef4444', icon: 'losing' as const },
    }
  }, [summary])

  const exportReport = useCallback(
    async (format: ExportFormat) => {
      try {
        const allData = await fetchProfitData({
          date_from: range.from, date_to: range.to,
          local_only: localOnly, search: query, page: 1, limit: 5000,
        })
        const allRows: ProfitInvoiceRow[] = (allData.invoices || []).map((inv: any) => {
          const price = Number(inv.price) || 0
          const cost = Number(inv.dhlCost) || 0
          const hasCost = cost > 0
          const profit = hasCost ? price - cost : null
          const marginPct = hasCost && price > 0 ? (profit! / price) * 100 : null
          return {
            id: String(inv.id || ''), invoiceNumber: inv.invoiceNumber || String(inv.id || ''),
            client: inv.client || '—', awb: inv.awb || '', carrier: inv.carrier || '—',
            status: inv.status || 'unpaid', date: inv.date || '—', price,
            cost: hasCost ? cost : null, profit, marginPct, hasCost,
            losing: hasCost && (profit ?? 0) < 0, isLocal: !inv.daftra_id,
            raw: inv,
          }
        })
        const rows = toProfitExportRows(allRows)
        const stamp = range.label.replace(/[^\w\u0600-\u06FF-]+/g, '-')
        if (format === 'csv') {
          downloadBlob(`profit-report-${stamp}.csv`, new Blob([rowsToCsv(rows)], { type: 'text/csv;charset=utf-8' }))
          return
        }
        await exportXlsx(rows, `profit-report-${stamp}.xlsx`)
      } catch (e: any) {
        console.error('[ProfitReport] Export error:', e.message)
      }
    },
    [range, localOnly, query],
  )

  return {
    loading, error, refresh,
    period, setPeriod: onSetPeriod,
    from, setFrom, to, setTo,
    query, setQuery: onSetQuery,
    tab, setTab: onSetTab,
    localOnly, setLocalOnly: onSetLocalOnly,
    range, summary, summaryCards,
    invoiceRows, allInvoiceRows: invoiceRows,
    clientRows, allClientRows: clientRows,
    dailyRows, weeklyRows, monthlyRows, yearlyRows,
    chartData, exportReport,
    currentPage, setCurrentPage: onSetPage,
    totalPages: pagination.pages,
    totalClientPages: Math.ceil(clientRows.length / PAGE_SIZE) || 1,
    pageSize: PAGE_SIZE,
    totalFiltered: pagination.total,
  }
}