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

/**
 * Parse a date string safely — handles ISO, yyyy-mm-dd, etc.
 * Returns null if invalid.
 */
function parseDate(date: string): Date | null {
  if (!date) return null
  const s = String(date).trim()
  if (!s) return null

  // If it's just a date (yyyy-mm-dd), parse as local date (not UTC)
  // This prevents timezone shift issues (e.g., 2026-02-11 becoming Feb 10)
  const dateOnlyMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (dateOnlyMatch) {
    const [, y, m, d] = dateOnlyMatch
    return new Date(Number(y), Number(m) - 1, Number(d))
  }

  // If it's an ISO string with time, also extract just the date part
  // to avoid UTC→local timezone issues
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})T/)
  if (isoMatch) {
    const [, y, m, d] = isoMatch
    return new Date(Number(y), Number(m) - 1, Number(d))
  }

  // Fallback
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return null
  return d
}

/**
 * Format date as dd/mm/yyyy (Gregorian, Arabic-friendly)
 * Examples: 11/02/2026, 28/04/2026
 */
function formatDateEnGb(date: string): string {
  const d = parseDate(date)
  if (!d) return '—'

  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()

  return `${day}/${month}/${year}`
}

function toIsoDate(d: Date) {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
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

  const getSortParams = useCallback((s: LegacyInvoicesUiState) => {
    if (s.priceSort) return { sort_by: 'price', sort_dir: s.priceSort }
    if (s.dateSort) return { sort_by: 'date', sort_dir: s.dateSort }
    return { sort_by: 'date', sort_dir: 'desc' }
  }, [])

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
    try {
      const { unifiedService } = await import('../services/unifiedService')
      unifiedService.invalidateCache()
    } catch { /* silent */ }
    await fetchPage(ui.page)
  }, [fetchPage, ui.page])

  const filtered = useMemo(() => {
    let list = [...invoices]
    if (ui.advCarrier) list = list.filter(i => i.carrier === ui.advCarrier)
    if (ui.advPayment) list = list.filter(i => i.payment === ui.advPayment)
    // NO client-side sorting — server already sorts correctly
    return list
  }, [invoices, ui.advCarrier, ui.advPayment])

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