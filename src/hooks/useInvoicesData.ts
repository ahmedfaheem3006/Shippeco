import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { invoiceService } from '../services/invoiceService'
import type { InvoiceStatus } from '../utils/models'
import { useInvoicesStore } from './useInvoicesStore'

type InvoicesFilter = {
  query: string
  status: InvoiceStatus | 'all'
}

const AUTO_REFRESH_MS = 10 * 60 * 1000

export function useInvoicesData() {
  const invoices = useInvoicesStore((s) => s.invoices)
  const setInvoices = useInvoicesStore((s) => s.setInvoices)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<InvoicesFilter>({ query: '', status: 'all' })
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null)

  const [page, setPage] = useState(1)
  const [limit] = useState(50)
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, pages: 1 })

  const filterRef = useRef(filter)
  const pageRef = useRef(page)
  filterRef.current = filter
  pageRef.current = page

  const fetchPage = useCallback(async (
    pageNum?: number,
    filterOverride?: InvoicesFilter,
    silent?: boolean
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
        // Always sort by date descending by default
        sort_by: 'date',
        sort_dir: 'desc',
      })

      // Server already returns sorted data — DO NOT re-sort on client
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

  useEffect(() => {
    void fetchPage(1)
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      console.log('[AutoRefresh] Refreshing invoices...')
      void fetchPage(pageRef.current, filterRef.current, true)
    }, AUTO_REFRESH_MS)

    return () => clearInterval(interval)
  }, [fetchPage])

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
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

  const updateFilter = useCallback((newFilter: InvoicesFilter) => {
    setFilter(newFilter)
    setPage(1)
    void fetchPage(1, newFilter)
  }, [fetchPage])

  const goToPage = useCallback((newPage: number) => {
    setPage(newPage)
    void fetchPage(newPage)
  }, [fetchPage])

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

  // Server already sorts — just filter out drafts, NO re-sorting
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv: any) => !inv.isDraft)
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