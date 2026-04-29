import { useCallback, useMemo, useState } from 'react'
import { invoiceService } from '../services/invoiceService'
import type { Invoice } from '../utils/models'
import {
  buildSparkAreaPath, buildSparklinePath,
  computeDashboardKpis, computeDashboardRange,
  computePartialClients, computeRecentInvoices, computeRevenueSeries, computeTopClients,
  filterForDashboard, formatNum, formatSar,
  type DashboardChartView, type DashboardPeriod, type SeriesPoint,
  type TopClientAgg, type PartialClientAgg, type RecentInvoiceRow,
} from '../utils/dashboard'

const STATUS_MAP: Record<number, string> = { 0: 'unpaid', 1: 'partial', 2: 'paid', 3: 'returned' }

export function useDashboardPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [dataSource, setDataSource] = useState<'railway' | 'unknown'>('unknown')
  const [serverData, setServerData] = useState<any>(null)
  const [daftraSummary] = useState<any | null>(null)
  const [summaryLoading] = useState(false)

  const [period, setPeriod] = useState<DashboardPeriod>('all')
  const [chartView, setChartView] = useState<DashboardChartView>('monthly')

  const range = useMemo(() => computeDashboardRange(period), [period])
  const filtered = useMemo(() => filterForDashboard(invoices, range), [invoices, range])
  const kpis = useMemo(() => computeDashboardKpis(filtered), [filtered])

  const useServer = serverData?.summary != null

  // ═══ CHARTS — now supports daily/monthly/yearly from server ═══
  const revenueSeries = useMemo((): SeriesPoint[] => {
    if (useServer && serverData.chart) {
      if (chartView === 'daily' && serverData.chart.daily?.length) return serverData.chart.daily
      if (chartView === 'monthly' && serverData.chart.monthly?.length) return serverData.chart.monthly
      if (chartView === 'yearly' && serverData.chart.yearly?.length) return serverData.chart.yearly
    }
    return computeRevenueSeries(filtered, chartView)
  }, [useServer, serverData, chartView, filtered])

  // ═══ TOP CLIENTS ═══
  const topClients = useMemo((): TopClientAgg[] => {
    if (useServer && serverData.top_clients?.length) return serverData.top_clients
    return computeTopClients(filtered, 6)
  }, [useServer, serverData, filtered])

  // ═══ PARTIAL CLIENTS ═══
  const partialClients = useMemo((): PartialClientAgg[] => {
    if (useServer && serverData.partial_clients?.length) return serverData.partial_clients
    return computePartialClients(filtered, 20)
  }, [useServer, serverData, filtered])

  // ═══ RECENT ═══
  const recent = useMemo((): RecentInvoiceRow[] => {
    if (useServer && serverData.recent?.length) {
      return serverData.recent.slice(0, 10).map((r: any) => ({
        id: String(r.id),
        invoiceNumber: r.daftra_id ? String(r.daftra_id) : (r.invoice_number || ''),
        client: r.client_name || r.display_name || '—',
        date: String(r.invoice_date || r.created_at || '').slice(0, 10),
        status: STATUS_MAP[r.payment_status] || 'unpaid',
        amount: parseFloat(r.total) || 0,
        remaining: parseFloat(r.remaining) || Math.max(0, (parseFloat(r.total) || 0) - (parseFloat(r.paid_amount) || 0)),
        partialPaid: parseFloat(r.paid_amount) || 0,
      }))
    }
    return computeRecentInvoices(filtered, 10)
  }, [useServer, serverData, filtered])

  const revenuePoints = useMemo(() => revenueSeries.map((p) => p.value), [revenueSeries])
  const sparkPath = useMemo(() => buildSparklinePath(revenuePoints, 260, 46, 3), [revenuePoints])
  const sparkAreaPath = useMemo(() => (sparkPath ? buildSparkAreaPath(sparkPath, 46, 3) : ''), [sparkPath])

  // ═══ REFRESH ═══
  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    setDataSource('unknown')
    try {
      const [dashData, recentResult] = await Promise.all([
        invoiceService.getDashboardData(period).catch((err) => {
          console.error('[Dashboard] getDashboardData failed:', err)
          return null
        }),
        invoiceService.getInvoicesLight({ 
          page: 1, 
          limit: 200,
          sort_by: 'date',
          sort_dir: 'desc',
        }).catch(() => ({ invoices: [] })),
      ])

      if (dashData) {
        setServerData(dashData)
      }
      setInvoices(recentResult.invoices || [])
      setDataSource('railway')

      console.log('[Dashboard] Period:', period, 'Total:', dashData?.summary?.total?.count || 0, 'invoices')

      void (async () => { try { await invoiceService.syncRecent() } catch { } })()
    } catch (e) {
      console.error('[Dashboard] Failed:', e)
      setError(e instanceof Error ? e.message : 'فشل تحميل البيانات')
    } finally {
      setLoading(false)
    }
  }, [period])

  // ═══ CARDS ═══
  const cards = useMemo(() => {
    if (useServer) {
      const s = serverData.summary
      const pr = serverData.profit || {}
      const ret = serverData.returned || {}
      const totalCount = s.total?.count || 0
      const totalSales = (s.paid?.total || 0) + (s.unpaid?.total || 0) + (s.partial?.total || 0)
      const totalCollected = s.collected || 0
      const unpaidCount = s.unpaid?.count || 0
      const unpaidAmount = s.unpaid?.total || 0
      const partialCount = s.partial?.count || 0
      const partialTotal = s.partial?.total || 0
      const partialPaidAmt = s.partial?.paid_amount || 0
      const partialRemaining = partialTotal - partialPaidAmt
      const remaining = s.uncollected || 0
      const returnedCount = ret.count || s.returned?.count || 0
      const returnedAmount = ret.total || s.returned?.total || 0

      return {
        totalCount: { value: formatNum(totalCount), detail: 'فاتورة في الفترة' },
        totalSales: { value: formatSar(totalSales), detail: 'إجمالي المبيعات' },
        totalCollected: { value: formatSar(totalCollected), detail: 'إجمالي المحصّل' },
        unpaid: { value: formatNum(unpaidCount), detail: formatSar(unpaidAmount) },
        partial: {
          value: formatNum(partialCount), detail: formatSar(partialTotal),
          paidAmount: formatSar(partialPaidAmt), remainingAmount: formatSar(partialRemaining),
          paidRaw: partialPaidAmt, remainingRaw: partialRemaining, totalRaw: partialTotal,
        },
        remaining: { value: formatSar(remaining), detail: 'غير مدفوعة + جزئية' },
        returned: { value: formatNum(returnedCount), detail: formatSar(returnedAmount) },
        profit: { value: pr.count > 0 ? formatSar(pr.total) : '—', detail: `من ${pr.count || 0} فاتورة بتكلفة DHL` },
        margin: { value: pr.count > 0 ? `${pr.avg_margin}%` : '—', detail: `على ${pr.count || 0} فاتورة محسوبة` },
        losing: { value: formatNum(pr.losing_count || 0), detail: 'تكلفة أعلى من السعر' },
      }
    }
    return {
      totalCount: { value: formatNum(kpis.totalCount), detail: 'فاتورة في الفترة' },
      totalSales: { value: formatSar(kpis.totalSales), detail: 'إجمالي المبيعات' },
      totalCollected: { value: formatSar(kpis.totalCollected), detail: 'إجمالي المحصّل' },
      unpaid: { value: formatNum(kpis.unpaid.count), detail: formatSar(kpis.unpaid.amount) },
      partial: {
        value: formatNum(kpis.partial.count), detail: formatSar(kpis.partial.amount),
        paidAmount: formatSar(kpis.partial.paidAmount), remainingAmount: formatSar(kpis.partial.remainingAmount),
        paidRaw: kpis.partial.paidAmount, remainingRaw: kpis.partial.remainingAmount, totalRaw: kpis.partial.amount,
      },
      remaining: { value: formatSar(kpis.remaining), detail: 'غير مدفوعة + جزئية' },
      returned: { value: formatNum(kpis.returned.count), detail: formatSar(kpis.returned.amount) },
      profit: { value: kpis.profitTotal != null ? formatSar(kpis.profitTotal) : '—', detail: 'من الفواتير بتكلفة DHL' },
      margin: { value: kpis.marginAvgPct != null ? `${kpis.marginAvgPct.toFixed(1)}%` : '—', detail: 'على الفواتير المحسوبة' },
      losing: { value: formatNum(kpis.losingCount), detail: 'تكلفة أعلى من السعر' },
    }
  }, [useServer, serverData, kpis])

  // ═══ STATUS BARS ═══
  const statusBars = useMemo(() => {
    if (useServer) {
      const s = serverData.summary
      const ret = serverData.returned || {}
      const total = s.total?.count || 1
      return [
        { label: 'مدفوعة', color: '#10B981', pct: ((s.paid?.count || 0) / total) * 100, count: s.paid?.count || 0 },
        { label: 'جزئية', color: '#F59E0B', pct: ((s.partial?.count || 0) / total) * 100, count: s.partial?.count || 0 },
        { label: 'غير مدفوعة', color: '#EF4444', pct: ((s.unpaid?.count || 0) / total) * 100, count: s.unpaid?.count || 0 },
        { label: 'مرتجعة', color: '#8B5CF6', pct: ((ret.count || s.returned?.count || 0) / total) * 100, count: ret.count || s.returned?.count || 0 },
      ]
    }
    const total = kpis.totalCount || 1
    return [
      { label: 'مدفوعة', color: '#10B981', pct: (kpis.paid.count / total) * 100, count: kpis.paid.count },
      { label: 'جزئية', color: '#F59E0B', pct: (kpis.partial.count / total) * 100, count: kpis.partial.count },
      { label: 'غير مدفوعة', color: '#EF4444', pct: (kpis.unpaid.count / total) * 100, count: kpis.unpaid.count },
      { label: 'مرتجعة', color: '#8B5CF6', pct: (kpis.returned.count / total) * 100, count: kpis.returned.count },
    ]
  }, [useServer, serverData, kpis])

  // ═══ COLLECTION RATE ═══
  const collectionRate = useMemo(() => {
    if (useServer) {
      const s = serverData.summary
      const total = (s.paid?.total || 0) + (s.unpaid?.total || 0) + (s.partial?.total || 0)
      if (total <= 0) return 0
      return Math.round((s.collected / total) * 100)
    }
    if (kpis.totalSales <= 0) return 0
    return Math.round((kpis.totalCollected / kpis.totalSales) * 100)
  }, [useServer, serverData, kpis])

  // ═══ TOTAL CLIENTS — from server ═══
  const totalClients = useMemo(() => {
    if (serverData?.total_clients) return serverData.total_clients
    return 0
  }, [serverData])

  const daftraStats = useMemo(() => {
    if (!daftraSummary?.total?.count) return null
    return {
      month: daftraSummary.month, totalCount: daftraSummary.total.count,
      totalAmount: daftraSummary.total.total, collected: daftraSummary.collected,
      uncollected: daftraSummary.uncollected, paidCount: daftraSummary.paid.count,
      unpaidCount: daftraSummary.unpaid.count, partialCount: daftraSummary.partial.count,
      returnedCount: daftraSummary.returned.count,
    }
  }, [daftraSummary])

  return {
    loading, error, refresh,
    period, setPeriod, chartView, setChartView, range,
    cards, revenueSeries, sparkPath, sparkAreaPath,
    statusBars, topClients, partialClients,
    itemsDist: [], recent, collectionRate,
    daftraStats, summaryLoading, dataSource, totalClients,
  }
}