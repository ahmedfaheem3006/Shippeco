import { useCallback, useMemo, useState, useRef } from 'react'
import { invoiceService } from '../services/invoiceService'
import type { Invoice, InvoiceItem, InvoiceStatus } from '../utils/models'
import { useInvoicesStore } from './useInvoicesStore'

type QuickDate = 'all' | 'today' | 'week' | 'month' | 'year'
type SortDir = 'asc' | 'desc' | null

export type LegacyInvoicesUiState = {
  q: string
  advCarrier: string
  advPayment: string
  advStatus: '' | InvoiceStatus
  advDateFrom: string
  advDateTo: string
  quickDateFrom: string
  quickDateTo: string
  quickDate: QuickDate
  quickStatus: InvoiceStatus | 'all'
  priceSort: SortDir
  dateSort: SortDir
  page: number
  advOpen: boolean
}

function normalizeDateInput(date: string) {
  return date ? String(date).slice(0, 10) : ''
}

function parseDate(date: string) {
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return null
  return d
}

function formatDateEnGb(date: string) {
  const d = parseDate(date)
  if (!d) return '—'
  return d.toLocaleDateString('en-GB', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

function toIsoDate(d: Date) {
  return d.toISOString().slice(0, 10)
}

function computeQuickDateRange(quickDate: QuickDate) {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  if (quickDate === 'all') return { from: '', to: '' }
  if (quickDate === 'today') { const f = toIsoDate(now); return { from: f, to: f } }
  if (quickDate === 'week') { const ws = new Date(now); ws.setDate(now.getDate() - now.getDay()); return { from: toIsoDate(ws), to: toIsoDate(now) } }
  if (quickDate === 'month') { return { from: toIsoDate(new Date(now.getFullYear(), now.getMonth(), 1)), to: toIsoDate(now) } }
  return { from: toIsoDate(new Date(now.getFullYear(), 0, 1)), to: toIsoDate(now) }
}

function parseItems(inv: Invoice): InvoiceItem[] {
  let items: unknown = inv.items
  if (typeof items === 'string') { try { items = JSON.parse(items) } catch { items = [] } }
  if (Array.isArray(items) && items.length > 0) return items as InvoiceItem[]
  return []
}

function readItemLabel(inv: Invoice) {
  const items = parseItems(inv)
  if (items.length > 1) return items.map((i) => i.type).join(' + ')
  if (items.length === 1) return items[0].type || inv.itemType || 'شحن دولي'
  return inv.itemType || inv.details || 'شحن دولي'
}

function readRemaining(inv: Invoice) {
  const price = Number(inv.price || 0)
  const paid = Number(inv.partialPaid ?? inv.partial_paid ?? 0)
  return Math.max(0, price - paid).toFixed(0)
}

const PAGE_SIZE = 50

export function useLegacyInvoicesPage() {
  const invoices = useInvoicesStore((s) => s.invoices)
  const setInvoices = useInvoicesStore((s) => s.setInvoices)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [serverPagination, setServerPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, pages: 1 })

  const [ui, setUi] = useState<LegacyInvoicesUiState>(() => ({
    q: '',
    advCarrier: '',
    advPayment: '',
    advStatus: '' as const,
    advDateFrom: '',
    advDateTo: '',
    quickDateFrom: '',
    quickDateTo: '',
    quickDate: 'all',
    quickStatus: 'all',
    priceSort: null,
    dateSort: 'desc',
    page: 1,
    advOpen: false,
  }))

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ═══ Build sort params from UI state ═══
  const getSortParams = useCallback((s: LegacyInvoicesUiState) => {
    if (s.priceSort) return { sort_by: 'price', sort_dir: s.priceSort }
    if (s.dateSort) return { sort_by: 'date', sort_dir: s.dateSort }
    // Default: الأحدث أولاً
    return { sort_by: 'date', sort_dir: 'desc' }
  }, [])

  // ═══ Core fetch — ALL filtering/sorting on server ═══
  const fetchPage = useCallback(async (pageNum: number, uiState?: LegacyInvoicesUiState) => {
    setLoading(true)
    setError(null)
    const s = uiState || ui

    try {
      let statusFilter: string | undefined
      const effectiveStatus = s.advStatus || (s.quickStatus !== 'all' ? s.quickStatus : '')
      if (effectiveStatus) statusFilter = effectiveStatus

      const search = s.q.trim() || undefined
      const dateFrom = s.quickDateFrom || s.advDateFrom || undefined
      const dateTo = s.quickDateTo || s.advDateTo || undefined
      const sort = getSortParams(s)

      const result = await invoiceService.getInvoicesLight({
        page: pageNum,
        limit: PAGE_SIZE,
        status: statusFilter,
        search,
        date_from: dateFrom,
        date_to: dateTo,
        ...sort,
      })

      setInvoices(result.invoices)
      setServerPagination(result.pagination)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل تحميل الفواتير')
    } finally {
      setLoading(false)
    }
  }, [ui, setInvoices, getSortParams])

  const syncFromDb = useCallback(async (_forceSync = false) => {
    // مزامنة = refresh البيانات فقط — الـ cron job بيتعامل مع دفترة كل 15 دقيقة
    try {
      const { unifiedService } = await import('../services/unifiedService')
      unifiedService.invalidateCache()
    } catch { /* silent */ }
    await fetchPage(ui.page)
  }, [fetchPage, ui.page])

  // ═══ No client-side filtering needed — server does everything ═══
  const filtered = useMemo(() => {
    let list = [...invoices]
    // Only client-side: carrier and payment (not on server yet)
    if (ui.advCarrier) list = list.filter(i => i.carrier === ui.advCarrier)
    if (ui.advPayment) list = list.filter(i => i.payment === ui.advPayment)
    return list
  }, [invoices, ui.advCarrier, ui.advPayment])

  // ═══ Setters — all trigger server fetch ═══
  const setQuery = useCallback((q: string) => {
    setUi(prev => ({ ...prev, q, page: 1 }))
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      const next = { ...ui, q, page: 1 }
      void fetchPage(1, next)
    }, 400)
  }, [fetchPage, ui])

  const setQuickStatus = useCallback((quickStatus: InvoiceStatus | 'all') => {
    const next = { ...ui, quickStatus, advStatus: '' as const, page: 1 }
    setUi(next)
    void fetchPage(1, next)
  }, [fetchPage, ui])

  const setAdvStatus = useCallback((advStatus: '' | InvoiceStatus) => {
    const next = { ...ui, advStatus, page: 1 }
    setUi(next)
    void fetchPage(1, next)
  }, [fetchPage, ui])

  const setPage = useCallback((page: number) => {
    const p = Math.max(1, Math.min(page, serverPagination.pages || 1))
    setUi(prev => ({ ...prev, page: p }))
    void fetchPage(p)
  }, [fetchPage, serverPagination.pages])

  const setQuickDate = useCallback((quickDate: QuickDate) => {
    const r = computeQuickDateRange(quickDate)
    const next = { ...ui, quickDate, quickDateFrom: r.from, quickDateTo: r.to, page: 1 }
    setUi(next)
    void fetchPage(1, next)
  }, [fetchPage, ui])

  const setQuickDateFrom = useCallback((from: string) => {
    const next = { ...ui, quickDateFrom: normalizeDateInput(from), page: 1 }
    setUi(next)
    void fetchPage(1, next)
  }, [fetchPage, ui])

  const setQuickDateTo = useCallback((to: string) => {
    const next = { ...ui, quickDateTo: normalizeDateInput(to), page: 1 }
    setUi(next)
    void fetchPage(1, next)
  }, [fetchPage, ui])

  const setAdvCarrier = useCallback((advCarrier: string) => {
    setUi(prev => ({ ...prev, advCarrier, page: 1 }))
  }, [])

  const setAdvPayment = useCallback((advPayment: string) => {
    setUi(prev => ({ ...prev, advPayment, page: 1 }))
  }, [])

  const toggleAdvOpen = useCallback(() => {
    setUi(prev => ({ ...prev, advOpen: !prev.advOpen }))
  }, [])

  const clearAdvSearch = useCallback(() => {
    const next: LegacyInvoicesUiState = {
      ...ui, advCarrier: '', advPayment: '', advStatus: '' as const,
      advDateFrom: '', advDateTo: '', page: 1
    }
    setUi(next)
    void fetchPage(1, next)
  }, [fetchPage, ui])

  const applyDateRange = useCallback((from: string, to: string) => {
    const next = { ...ui, quickDateFrom: normalizeDateInput(from), quickDateTo: normalizeDateInput(to), quickDate: 'all' as QuickDate, page: 1 }
    setUi(next)
    void fetchPage(1, next)
  }, [fetchPage, ui])

  const clearDateRange = useCallback(() => {
    const next = { ...ui, quickDateFrom: '', quickDateTo: '', page: 1 }
    setUi(next)
    void fetchPage(1, next)
  }, [fetchPage, ui])

  const togglePriceSort = useCallback(() => {
    setUi(prev => {
      const nextSort: SortDir = prev.priceSort === 'desc' ? 'asc' : prev.priceSort === 'asc' ? null : 'desc'
      const next: LegacyInvoicesUiState = { ...prev, priceSort: nextSort, dateSort: null, page: 1 }
      void fetchPage(1, next)
      return next
    })
  }, [fetchPage])

  const toggleDateSort = useCallback(() => {
    setUi(prev => {
      const nextSort: SortDir = prev.dateSort === 'desc' ? 'asc' : 'desc'
      const next: LegacyInvoicesUiState = { ...prev, dateSort: nextSort, priceSort: null, page: 1 }
      void fetchPage(1, next)
      return next
    })
  }, [fetchPage])

  const clearDateRangeVisible = Boolean(ui.quickDateFrom || ui.quickDateTo)

  return {
    invoices: filtered,
    rawCount: serverPagination.total,
    page: ui.page,
    totalPages: serverPagination.pages,
    startIdx: (ui.page - 1) * PAGE_SIZE,
    pageSize: PAGE_SIZE,
    loading,
    error,
    ui,
    setUi,
    setQuery,
    setAdvCarrier,
    setAdvPayment,
    setAdvStatus,
    setQuickDateFrom,
    setQuickDateTo,
    applyDateRange,
    clearDateRange,
    clearDateRangeVisible,
    setQuickDate,
    setQuickStatus,
    togglePriceSort,
    toggleDateSort,
    setPage,
    toggleAdvOpen,
    clearAdvSearch,
    syncFromDb,
    formatDateEnGb,
    readItemLabel,
    readRemaining,
  }
}