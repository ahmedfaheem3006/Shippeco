import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../utils/apiClient'
import { downloadBlob } from '../utils/download'
import { rowsToCsv } from '../utils/reports'
import type { AuditTypeFilter } from '../utils/auditLog'
import { formatAtShort } from '../utils/auditLog'

type ExportFormat = 'csv' | 'xlsx'
const PAGE_SIZE = 50

type AuditLogEntry = {
  id: number | string
  action: string
  entity_type: string
  entity_id?: number
  user_id?: number
  user_name?: string
  user_email?: string
  user_role?: string
  description?: string
  old_data?: any
  new_data?: any
  meta?: any
  ip_address?: string
  created_at: string
}

type AuditSummary = {
  total: number
  counts: Record<string, number>
  lastAt: string
}

async function exportXlsx(rows: Record<string, string>[], filename: string) {
  const XLSX = await import('xlsx')
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Audit')
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
  downloadBlob(filename, new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
}

async function fetchAuditLogs(params: {
  page: number
  limit: number
  action?: string
  search?: string
  user_id?: number
}) {
  var qs = new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit),
  })
  if (params.action && params.action !== 'all') {
    qs.set('action', params.action)
  }
  if (params.search) {
    qs.set('search', params.search)
  }
  if (params.user_id) {
    qs.set('user_id', String(params.user_id))
  }

  var result = await api.get('/audit-log?' + qs) as any

  var logs: AuditLogEntry[] = []
  var total = 0
  var page = params.page
  var pages = 1
  var stats = { total: 0, logins: 0, creates: 0, updates: 0, deletes: 0, lastActivity: '' }

  // apiClient returns json.data directly = { entries, pagination, stats }
  // So result.entries should exist directly
  var source: any = null

  if (result && Array.isArray(result.entries)) {
    // api unwrapped: result = { entries, pagination, stats }
    source = result
  } else if (result && result.data && Array.isArray(result.data.entries)) {
    // api returned full: result = { success, data: { entries, pagination, stats } }
    source = result.data
  } else if (Array.isArray(result)) {
    logs = result
    total = result.length
  }

  if (source) {
    logs = source.entries.map(function(e: any) {
      return {
        id: e.id,
        action: e.action || '',
        entity_type: e.entityType || e.entity_type || '',
        entity_id: e.entityId || e.entity_id || null,
        user_id: e.userId || e.user_id || null,
        user_name: e.user || e.user_name || '',
        user_email: e.userEmail || e.user_email || '',
        user_role: e.userRole || e.user_role || '',
        description: e.description || '',
        old_data: e.oldData || e.old_data || null,
        new_data: e.newData || e.new_data || null,
        meta: e.meta || null,
        ip_address: e.ip || e.ip_address || '',
        created_at: e.createdAt || e.created_at || '',
      }
    })
    var p = source.pagination || {}
    total = p.total || logs.length
    page = p.page || params.page
    pages = p.pages || Math.ceil(total / params.limit)
    stats = source.stats || stats
  }

  return { logs: logs, pagination: { page: page, limit: params.limit, total: total, pages: pages }, stats: stats }
}

export function useAuditLogPage() {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  const [entries, setEntries] = useState<AuditLogEntry[]>([])
  const [users, setUsers] = useState<Array<{ id: number; full_name: string; email: string }>>([])
  const [query, setQuery] = useState('')
  const [type, setType] = useState<AuditTypeFilter>('all')
  const [selectedUserId, setSelectedUserId] = useState<number | 'all'>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, pages: 1 })

  var fetchData = useCallback(
    async function(pageNum?: number) {
      setLoading(true)
      setError(null)
      var pg = pageNum ?? currentPage

      try {
        var data = await fetchAuditLogs({
          page: pg,
          limit: PAGE_SIZE,
          action: type !== 'all' ? type : undefined,
          search: query || undefined,
          user_id: selectedUserId !== 'all' ? selectedUserId : undefined,
        })

        setEntries(data.logs)
        setPagination(data.pagination)
        setServerStats(data.stats || {})
        setCurrentPage(data.pagination.page)
      } catch (e: any) {
        console.error('[AuditLog] Error:', e.message)
        setError(e.message || 'فشل تحميل السجل')
        setEntries([])
      } finally {
        setLoading(false)
      }
    },
    [type, query, selectedUserId],
  )

  // Fetch users for dropdown
  useEffect(() => {
    async function loadUsers() {
      try {
        const res = await api.get('/audit-log/users') as any
        if (res && res.data) {
          setUsers(res.data)
        } else if (Array.isArray(res)) {
          setUsers(res)
        }
      } catch (e) {
        console.error('Failed to load audit users:', e)
      }
    }
    void loadUsers()
  }, [])

    // Auto-fetch on mount and when filters change
  useEffect(function() {
    fetchData(1)
  }, [type, query, selectedUserId])

  const refresh = useCallback(async () => {
    setCurrentPage(1)
    await fetchData(1)
  }, [fetchData])

  var [serverStats, setServerStats] = useState<any>({})

  var summary: AuditSummary = useMemo(function() {
    var s = serverStats || {}
    var counts: Record<string, number> = {
      login: s.logins || 0,
      create: s.creates || 0,
      update: s.updates || 0,
      delete: s.deletes || 0,
      import: 0,
      export: 0,
      payment_link: 0,
      paid: 0,
    }
    var lastAt = s.lastActivity || (entries.length ? entries[0].created_at : '')
    return { total: s.total || pagination.total, counts: counts, lastAt: lastAt }
  }, [entries, pagination.total, serverStats])

  // ── Clear ──
  const clear = useCallback(async () => {
    setSaving(true)
    setError(null)
    setStatus(null)
    try {
      await api.delete('/audit-log')
      setEntries([])
      setPagination({ page: 1, limit: PAGE_SIZE, total: 0, pages: 1 })
      setStatus('تم مسح السجل بنجاح')
    } catch (e: any) {
      setError(e.message || 'فشل مسح السجل')
    } finally {
      setSaving(false)
    }
  }, [])

  // ── Export ──
  const exportReport = useCallback(
    async (format: ExportFormat) => {
      try {
        // Fetch all for export (up to 5000)
        const allData = await fetchAuditLogs({
          page: 1,
          limit: 5000,
          action: type !== 'all' ? type : undefined,
          search: query || undefined,
        })

        const rows = allData.logs.map((e) => ({
          id: String(e.id),
          time: formatAtShort(e.created_at),
          user: e.user_name || String(e.user_id || '—'),
          action: e.action || '—',
          entity: e.entity_type || '—',
          entity_id: String(e.entity_id || ''),
          description: e.description || '—',
          ip: e.ip_address || '',
          meta: e.meta ? JSON.stringify(e.meta) : '',
        }))

        const stamp = new Date().toISOString().slice(0, 10)
        if (format === 'csv') {
          const csv = rowsToCsv(rows)
          downloadBlob(`audit-log-${stamp}.csv`, new Blob([csv], { type: 'text/csv;charset=utf-8' }))
          return
        }
        await exportXlsx(rows, `audit-log-${stamp}.xlsx`)
      } catch (e: any) {
        console.error('[AuditLog] Export error:', e.message)
      }
    },
    [type, query],
  )

  // ── Type filter options ──
  const typeOptions = useMemo(() => [
    { key: 'all' as AuditTypeFilter, label: 'الكل' },
    { key: 'login' as AuditTypeFilter, label: '🔐 دخول' },
    { key: 'create' as AuditTypeFilter, label: '➕ إنشاء' },
    { key: 'update' as AuditTypeFilter, label: '✏️ تعديل' },
    { key: 'delete' as AuditTypeFilter, label: '🗑️ حذف' },
    { key: 'import' as AuditTypeFilter, label: '📥 استيراد' },
    { key: 'export' as AuditTypeFilter, label: '📤 تصدير' },
    { key: 'payment_link' as AuditTypeFilter, label: '💳 رابط دفع' },
    { key: 'paid' as AuditTypeFilter, label: '✅ سداد' },
    { key: 'sync' as AuditTypeFilter, label: '🔄 مزامنة' },
  ], [])

  const onSetType = useCallback((t: AuditTypeFilter) => {
    setType(t)
    setCurrentPage(1)
  }, [])

  const onSetQuery = useCallback((q: string) => {
    setQuery(q)
  }, [])

  const onSetSelectedUserId = useCallback((id: number | 'all') => {
    setSelectedUserId(id)
  }, [])

  const onSetPage = useCallback((pg: number) => {
    setCurrentPage(pg)
    void fetchData(pg)
  }, [fetchData])

  const getTypeCount = useCallback(
    (t: string) => summary.counts[t] ?? 0,
    [summary.counts],
  )

  var displayEntries = useMemo(function() {
    return entries.map(function(e) {
      return {
        id: String(e.id),
        type: (e.action || 'update') as any,
        at: e.created_at || '',
        user: e.user_name || '—',
        userEmail: e.user_email || '',
        userRole: e.user_role || '',
        note: e.description || ((e.action || '') + ' ' + (e.entity_type || '') + ' ' + (e.entity_id ? '#' + e.entity_id : '')).trim(),
        meta: e.old_data || e.new_data || e.meta || undefined,
        entityType: e.entity_type,
        entityId: e.entity_id,
        ip: e.ip_address,
      }
    })
  }, [entries])

  return {
    loading,
    saving,
    error,
    status,

    query,
    setQuery: onSetQuery,
    type,
    setType: onSetType,
    typeOptions,
    
    users,
    selectedUserId,
    setSelectedUserId: onSetSelectedUserId,

    entries: displayEntries,
    rawEntries: entries,
    totalAll: pagination.total,
    summary,
    getTypeCount,

    refresh,
    clear,
    exportReport,

    // Pagination
    currentPage,
    setCurrentPage: onSetPage,
    totalPages: pagination.pages,
    pageSize: PAGE_SIZE,
  }
}