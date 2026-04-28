import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { invoiceService } from '../services/invoiceService'
import type { InvoiceStatus } from '../utils/models'
import { useInvoicesStore } from './useInvoicesStore'

type InvoicesFilter = {
  query: string
  status: InvoiceStatus | 'all'
}

// Auto-refresh every 10 minutes to match backend cron
const AUTO_REFRESH_MS = 10 * 60 * 1000

export function useInvoicesData() {
  const invoices = useInvoicesStore((s) => s.invoices)
  const setInvoices = useInvoicesStore((s) => s.setInvoices)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<InvoicesFilter>({ query: '', status: 'all' })
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null)

  // ═══ Pagination State ═══
  const [page, setPage] = useState(1)
  const [limit] = useState(50)
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, pages: 1 })

  // Refs to avoid stale closures in interval
  const filterRef = useRef(filter)
  const pageRef = useRef(page)
  filterRef.current = filter
  pageRef.current = page

  // ═══ Server-side pagination using /invoices/light ═══
  const fetchPage = useCallback(async (
    pageNum?: number,
    filterOverride?: InvoicesFilter,
    silent?: boolean // silent = no loading spinner (for auto-refresh)
  ) => {
    if (!silent) setLoading(true)
    setError(null)
    const currentFilter = filterOverride || filterRef.current
    const currentPage = pageNum || pageRef.current

    try {
      const result = await invoiceService.getInvoicesLight({
        page: currentPage,
        limit,
        status: currentFilter.status !== 'all' ? currentFilter.status : undefined,
        search: currentFilter.query || undefined,
      })

      setInvoices(result.invoices)
      setPagination(result.pagination)
      setLastSyncTime(new Date())
    } catch (e) {
      if (!silent) {
        setError(e instanceof Error ? e.message : 'فشل تحميل الفواتير')
      }
    } finally {
      if (!silent) setLoading(false)
    }
  }, [limit, setInvoices])

  // ═══ Initial load ═══
  useEffect(() => {
    void fetchPage(1)
  }, [])

  // ═══ Auto-refresh every 10 minutes (silent — no loading spinner) ═══
  useEffect(() => {
    const interval = setInterval(() => {
      console.log('[AutoRefresh] Refreshing invoices...')
      void fetchPage(pageRef.current, filterRef.current, true)
    }, AUTO_REFRESH_MS)

    return () => clearInterval(interval)
  }, [fetchPage])

  // ═══ Also refresh when tab becomes visible (user comes back) ═══
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        // Only refresh if last sync was > 2 minutes ago
        const now = new Date()
        if (!lastSyncTime || (now.getTime() - lastSyncTime.getTime()) > 2 * 60 * 1000) {
          console.log('[AutoRefresh] Tab visible — refreshing...')
          void fetchPage(pageRef.current, filterRef.current, true)
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [fetchPage, lastSyncTime])

  // ═══ Re-fetch when filter changes ═══
  const updateFilter = useCallback((newFilter: InvoicesFilter) => {
    setFilter(newFilter)
    setPage(1)
    void fetchPage(1, newFilter)
  }, [fetchPage])

  // ═══ Page change ═══
  const goToPage = useCallback((newPage: number) => {
    setPage(newPage)
    void fetchPage(newPage)
  }, [fetchPage])

  // ═══ Manual Sync and refresh ═══
  const syncFromDb = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      await invoiceService.syncRecent()
      await fetchPage(page)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync failed')
    } finally {
      setLoading(false)
    }
  }, [fetchPage, page])

  // ═══ Sorted invoices ═══
  const filteredInvoices = useMemo(() => {
    return invoices
      .filter((inv: any) => !inv.isDraft)
      .slice()
      .sort((a: any, b: any) => String(b.date).localeCompare(String(a.date)))
  }, [invoices])

  return {
    invoices: filteredInvoices,
    loading,
    error,
    filter,
    setFilter: updateFilter,
    syncFromDb,
    lastSyncTime,
    pagination,
    page,
    setPage: goToPage,
  }
}