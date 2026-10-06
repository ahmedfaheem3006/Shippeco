import { useCallback, useState, useRef } from 'react'
import { invoiceService } from '../services/invoiceService'
import type { Invoice, InvoiceItem, InvoiceStatus } from '../utils/models'
import { useInvoicesStore } from './useInvoicesStore'
import { PROFIT_FILTER_OPTIONS, type InvoiceProfitSummary, type ProfitFilter } from '../utils/invoiceProfit'

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
  /** Profit/loss filter (server-side, same rule as the profit report). */
  profit: ProfitFilter
  /** Minimum net profit / loss in SAR ('' = none). */
  minProfit: string
  minLoss: string
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
  if (quickDate === 'week') {
    const ws = new Date(now); ws.setDate(now.getDate() - now.getDay())
    const we = new Date(ws); we.setDate(ws.getDate() + 6)
    return { from: toIsoDate(ws), to: toIsoDate(we) }
  }
  if (quickDate === 'month') {
    const ms = new Date(now.getFullYear(), now.getMonth(), 1)
    const me = new Date(now.getFullYear(), now.getMonth() + 1, 0) // last day of month
    return { from: toIsoDate(ms), to: toIsoDate(me) }
  }
  // 'year': from Jan 1 to Dec 31 of current year (NOT just "to today")
  const ys = new Date(now.getFullYear(), 0, 1)
  const ye = new Date(now.getFullYear(), 11, 31)
  return { from: toIsoDate(ys), to: toIsoDate(ye) }
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

const STATUS_LABELS: Record<string, string> = { unpaid: 'غير مدفوعة', partial: 'جزئية', paid: 'مدفوعة', returned: 'مرتجعة' }

/** Filters sent to the server for the list AND the export. */
function serverFilterParams(s: LegacyInvoicesUiState) {
  return {
    carrier: s.advCarrier || undefined,
    payment_method: s.advPayment || undefined,
    profit: s.profit || undefined,
    min_profit: Number(s.minProfit) > 0 ? s.minProfit : undefined,
    min_loss: Number(s.minLoss) > 0 ? s.minLoss : undefined,
  }
}

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
    profit: '',
    minProfit: '',
    minLoss: '',
  }))
  const [summary, setSummary] = useState<InvoiceProfitSummary | null>(null)

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
        ...serverFilterParams(s),
        status: statusFilter,
        search,
        date_from: dateFrom,
        date_to: dateTo,
        ...sort,
        include_summary: true,
      })

      setInvoices(result.invoices)
      setServerPagination(result.pagination)
      setSummary(result.summary ?? null)
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

  // Every filter (incl. carrier / payment method / profit) runs on the
  // server, so the count, the summary and the export all match the list.
  const filtered = invoices

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
    const next = { ...ui, advCarrier, page: 1 }
    setUi(next)
    void fetchPage(1, next)
  }, [fetchPage, ui])

  const setAdvPayment = useCallback((advPayment: string) => {
    const next = { ...ui, advPayment, page: 1 }
    setUi(next)
    void fetchPage(1, next)
  }, [fetchPage, ui])

  const setProfit = useCallback((profit: ProfitFilter) => {
    const next = { ...ui, profit, page: 1 }
    setUi(next)
    void fetchPage(1, next)
  }, [fetchPage, ui])

  const amountTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const setMinAmount = useCallback((key: 'minProfit' | 'minLoss', value: string) => {
    const clean = value.replace(/[^\d.]/g, '')
    setUi(prev => ({ ...prev, [key]: clean, page: 1 }))
    if (amountTimer.current) clearTimeout(amountTimer.current)
    amountTimer.current = setTimeout(() => {
      void fetchPage(1, { ...ui, [key]: clean, page: 1 })
    }, 500)
  }, [fetchPage, ui])

  const toggleAdvOpen = useCallback(() => {
    setUi(prev => ({ ...prev, advOpen: !prev.advOpen }))
  }, [])

  const clearAdvSearch = useCallback(() => {
    const next: LegacyInvoicesUiState = {
      ...ui, advCarrier: '', advPayment: '', advStatus: '' as const,
      advDateFrom: '', advDateTo: '', page: 1,
      profit: '', minProfit: '', minLoss: '',
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

  // ── Export: the same filters as the list (the dialog supplies the dates) ──
  const effectiveStatus = ui.advStatus || (ui.quickStatus !== 'all' ? ui.quickStatus : '')
  const sortParams = getSortParams(ui)
  const exportParams = {
    ...serverFilterParams(ui),
    status: effectiveStatus || undefined,
    search: ui.q.trim() || undefined,
    ...sortParams,
  }
  const exportFilterLabels = [
    ...(effectiveStatus ? [`الحالة: ${STATUS_LABELS[effectiveStatus]}`] : []),
    ...(ui.q.trim() ? [`بحث: ${ui.q.trim()}`] : []),
    ...(ui.advCarrier ? [`الناقل: ${ui.advCarrier}`] : []),
    ...(ui.advPayment ? [`طريقة الدفع: ${ui.advPayment}`] : []),
    ...(ui.profit ? [`الربحية: ${PROFIT_FILTER_OPTIONS.find((o) => o.key === ui.profit)?.label}`] : []),
    ...(Number(ui.minProfit) > 0 ? [`ربح ≥ ${ui.minProfit} ر.س`] : []),
    ...(Number(ui.minLoss) > 0 ? [`خسارة ≥ ${ui.minLoss} ر.س`] : []),
  ]
  const shownFrom = ui.quickDateFrom || ui.advDateFrom
  const shownTo = ui.quickDateTo || ui.advDateTo
  const currentRange = { from: shownFrom || undefined, to: shownTo || undefined }

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
    setProfit,
    setMinAmount,
    summary,
    exportParams,
    exportFilterLabels,
    currentRange,
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