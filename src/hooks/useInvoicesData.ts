import { useCallback, useEffect, useMemo, useState } from 'react'
import { invoiceService } from '../services/invoiceService'
import type { InvoiceStatus } from '../utils/models'
import { useInvoicesStore } from './useInvoicesStore'

type InvoicesFilter = {
  query: string
  status: InvoiceStatus | 'all'
}

export function useInvoicesData() {
  const invoices = useInvoicesStore((s) => s.invoices)
  const setInvoices = useInvoicesStore((s) => s.setInvoices)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<InvoicesFilter>({ query: '', status: 'all' })

  // ═══ Pagination State ═══
  const [page, setPage] = useState(1)
  const [limit] = useState(50)
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, pages: 1 })

  // ═══ Server-side pagination using /invoices/light ═══
  const fetchPage = useCallback(async (
    pageNum?: number,
    filterOverride?: InvoicesFilter
  ) => {
    setLoading(true)
    setError(null)
    const currentFilter = filterOverride || filter
    const currentPage = pageNum || page

    try {
      const result = await invoiceService.getInvoicesLight({
        page: currentPage,
        limit,
        status: currentFilter.status !== 'all' ? currentFilter.status : undefined,
        search: currentFilter.query || undefined,
      })

      setInvoices(result.invoices)
      setPagination(result.pagination)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل تحميل الفواتير')
    } finally {
      setLoading(false)
    }
  }, [filter, page, limit, setInvoices])

  // ═══ Initial load ═══
  useEffect(() => {
    void fetchPage(1)
  }, [])

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

  // ═══ Sync and refresh ═══
  const syncFromDb = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Quick sync recent from Daftra
      await invoiceService.syncRecent()
      // Then reload current page
      await fetchPage(page)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync failed')
    } finally {
      setLoading(false)
    }
  }, [fetchPage, page])

  // ═══ Sorted invoices (already sorted from server, but keep for compatibility) ═══
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
    // ═══ Pagination ═══
    pagination,
    page,
    setPage: goToPage,
  }
}