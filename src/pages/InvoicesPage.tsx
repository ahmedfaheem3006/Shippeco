import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppLayout } from '../components/AppLayout/useAppLayout'
import { InvoiceAddItemModal } from '../components/Invoices/InvoiceAddItemModal'
import { InvoiceViewModal } from '../components/Invoices/InvoiceViewModal'
import { InvoiceWizardModal } from '../components/Invoices/InvoiceWizardModal'
import { useLegacyInvoicesPage } from '../hooks/useLegacyInvoicesPage'
import { useInvoicesStore } from '../hooks/useInvoicesStore'
import { invoiceService } from '../services/invoiceService'
import type { Invoice } from '../utils/models'
import type { InvoiceDraftInput } from '../utils/invoiceWizard'
import { toDraftFromInvoice, toInvoiceFromDraft } from '../utils/invoiceWizard'
import { applyWaTemplate, getSmartTemplateKey } from '../utils/whatsappTemplates'
import { openWhatsApp } from '../utils/whatsapp'
import {
  Search, SlidersHorizontal, RefreshCw,
  PlusCircle, FileText, ChevronRight, ChevronLeft,
  AlertCircle, AlertTriangle, CheckCircle2,
  Clock, Eye, Edit3, Plus, Trash2, MessageSquare,
  RotateCcw
} from 'lucide-react'

type QuickDate = 'all' | 'today' | 'week' | 'month' | 'year'
type QuickStatus = 'all' | 'unpaid' | 'partial' | 'paid' | 'returned'

export function InvoicesPage() {
  useAppLayout()
  const navTo = useNavigate()
  const {
    invoices, rawCount, page, totalPages, startIdx, pageSize,
    loading, error, ui,
    setQuery, setAdvCarrier, setAdvPayment, setAdvStatus,
    setQuickDateFrom, setQuickDateTo,
    clearDateRangeVisible, clearDateRange, toggleAdvOpen, clearAdvSearch,
    setQuickDate, setQuickStatus, togglePriceSort, toggleDateSort,
    setPage, syncFromDb, formatDateEnGb, readItemLabel,
  } = useLegacyInvoicesPage()

  const storeInvoices = useInvoicesStore((s) => s.invoices)
  const [mutating, setMutating] = useState(false)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [wizardKey, setWizardKey] = useState(0)
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null)
  const [wizardInitialDraft, setWizardInitialDraft] = useState<InvoiceDraftInput | undefined>(undefined)
  const [wizardTitle, setWizardTitle] = useState<string | undefined>(undefined)
  const [viewInvoiceId, setViewInvoiceId] = useState<string | null>(null)
  const [addItemInvoiceId, setAddItemInvoiceId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const openNewWizard = useCallback(() => {
    navTo('/new-invoice')
  }, [navTo])

  useEffect(() => { void syncFromDb(false) }, [syncFromDb])

  useEffect(() => {
    const handler = () => openNewWizard()
    window.addEventListener('shippec_open_new_invoice', handler)
    return () => window.removeEventListener('shippec_open_new_invoice', handler)
  }, [openNewWizard])

  useEffect(() => {
    let shouldOpen = false
    try {
      shouldOpen = sessionStorage.getItem('shippec_open_new_invoice') === '1'
      if (shouldOpen) sessionStorage.removeItem('shippec_open_new_invoice')
    } catch { shouldOpen = false }
    if (!shouldOpen) return
    const t = window.setTimeout(() => openNewWizard(), 0)
    return () => window.clearTimeout(t)
  }, [openNewWizard])

  const displayValue = (value: unknown) => {
    const s = String(value ?? '').trim()
    return s || '—'
  }

  const displayDate = (value: unknown) => {
    const s = String(value ?? '').trim()
    if (!s) return '—'

    // Match yyyy-mm-dd (handles "2026-03-07" and "2026-03-07T00:00:00.000Z")
    const match = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (match) {
      const [, y, m, d] = match
      return `${d}/${m}/${y}`
    }

    // Fallback to formatDateEnGb from hook
    const formatted = formatDateEnGb(s)
    return formatted === '—' ? '—' : formatted
  }

  // ══════════════════════════════════════════
  // Helper: read paid amount from all possible fields
  // ══════════════════════════════════════════
  const readPaid = (inv: Invoice): number => {
    if (inv.status === 'paid') return Number(inv.price || 0)
    return Number(
      (inv as any).paid_amount ??
      inv.partialPaid ??
      inv.partial_paid ??
      0
    )
  }

  const readRemainingAmount = (inv: Invoice): number => {
    if (inv.status === 'paid') return 0
    if (inv.status === 'returned') return 0
    const price = Number(inv.price || 0)
    const paid = readPaid(inv)
    // Use server remaining if available
    const serverRemaining = Number((inv as any).remaining ?? 0)
    if (serverRemaining > 0) return serverRemaining
    return Math.max(0, price - paid)
  }

  const statusBadge = (inv: Invoice) => {
    if (inv.isDraft) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-gray-400">
          <Clock size={11} /> مسودة
        </span>
      )
    }
    if (inv.status === 'paid') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400">
          <CheckCircle2 size={11} /> مدفوعة
        </span>
      )
    }
    if (inv.status === 'partial') {
      const rem = readRemainingAmount(inv)
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-500">
          <AlertTriangle size={11} /> جزئية
          {rem > 0 && <span className="text-[9px] opacity-70 font-inter">({rem.toFixed(0)})</span>}
        </span>
      )
    }
    if (inv.status === 'returned') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400">
          <RotateCcw size={11} /> مرتجعة
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400">
        <AlertCircle size={11} /> غير مدفوعة
      </span>
    )
  }

  /* ── Actions ── */
  const handleView = (id: string) => setViewInvoiceId(id)

  const handleEdit = (id: string) => {
    const inv = storeInvoices.find((i) => String(i.id) === id)
    if (!inv) return
    setEditingInvoiceId(id)
    setWizardInitialDraft(toDraftFromInvoice(inv))
    setWizardTitle(`${inv.isDraft ? 'إكمال المسودة' : 'تعديل الفاتورة'} #${inv.invoice_number || inv.id}`)
    setWizardKey((k) => k + 1)
    setWizardOpen(true)
  }

  const handleAddItem = (id: string) => setAddItemInvoiceId(id)

  const handleCollect = (id: string) => {
    const inv = storeInvoices.find((i) => String(i.id) === id)
    if (!inv || !inv.phone) return
    const templateKey = getSmartTemplateKey(inv)
    const msg = applyWaTemplate(templateKey, inv)
    openWhatsApp(inv.phone, msg)
  }

  const handleDelete = (id: string) => {
    const inv = storeInvoices.find((i) => String(i.id) === id)
    const label = inv ? `#${inv.invoice_number || inv.daftra_id || inv.id}` : `#${id}`
    if (!window.confirm(`هل تريد حذف الفاتورة ${label} نهائياً؟`)) return
    setDeletingId(id)
    void (async () => {
      setMutating(true)
      try {
        await invoiceService.deleteInvoice(id)
        console.log(`[Invoices] ✅ Deleted invoice ${label}`)
        await syncFromDb()
      } catch (e: any) {
        const msg = e?.message || e?.error?.message || 'فشل في حذف الفاتورة'
        if (msg.includes('مدفوعات')) {
          window.alert('⚠️ لا يمكن حذف هذه الفاتورة لأنها تحتوي على مدفوعات مسجلة.\n\nاحذف المدفوعات أولاً ثم حاول مرة أخرى.')
        } else {
          window.alert(msg)
        }
      } finally { setMutating(false); setDeletingId(null) }
    })()
  }

  // ══════════════════════════════════════════
  // WIZARD SAVE — Update sends only clean DB fields
  // ══════════════════════════════════════════
  const onWizardSave = (draft: InvoiceDraftInput, options: { asDraft: boolean }) => {
    if (mutating) return
    const id = editingInvoiceId ? String(editingInvoiceId) : `${Date.now()}`

    void (async () => {
      setMutating(true)
      try {
        if (editingInvoiceId) {
          const { api } = await import('../utils/apiClient')

          const updatePayload: Record<string, any> = {}

          if (draft.client) updatePayload.client_name = draft.client
          if (draft.phone) updatePayload.phone = draft.phone
          if (draft.awb) updatePayload.awb = draft.awb
          if (draft.carrier) updatePayload.carrier = draft.carrier
          if (draft.price) updatePayload.total = Number(draft.price) || 0
          if (draft.dhlCost) updatePayload.dhl_cost = Number(draft.dhlCost) || 0
          if (draft.weight) updatePayload.weight = Number(draft.weight) || 0
          if (draft.dimensions) updatePayload.dimensions = draft.dimensions
          if (draft.status) updatePayload.status = draft.status
          if (draft.date) updatePayload.invoice_date = draft.date
          if (draft.details) updatePayload.details = draft.details
          if (draft.itemType) updatePayload.shipping_type = draft.itemType
          if (draft.codeType) updatePayload.code_type = draft.codeType

          // Handle partial payment amount
          if (draft.status === 'partial' && draft.partialPaid) {
            updatePayload.paid_amount = Number(draft.partialPaid) || 0
          }

          console.log(`[Invoices] Updating #${id}:`, updatePayload)
          await api.put(`/invoices/${id}`, updatePayload)
          console.log(`[Invoices] ✅ Updated invoice #${id}`)
        } else {
          const next = toInvoiceFromDraft(id, draft, { forceDraft: options.asDraft })
          await invoiceService.createInvoice(next)
          console.log(`[Invoices] ✅ Created new invoice`)
        }

        await syncFromDb()
        setWizardOpen(false)
        setEditingInvoiceId(null)
        setWizardInitialDraft(undefined)
        setWizardTitle(undefined)
      } catch (e: any) {
        console.error('[Invoices] ❌ Save failed:', e)
        window.alert(e?.message || 'فشل في حفظ الفاتورة')
      } finally {
        setMutating(false)
      }
    })()
  }

  /* ── Action Button Component ── */
  const ActionBtn = ({ icon: Icon, label, onClick, color = 'gray', disabled = false }: {
    icon: any; label: string; onClick: () => void; color?: string; disabled?: boolean
  }) => {
    const colors: Record<string, string> = {
      blue: 'text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20',
      green: 'text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20',
      yellow: 'text-yellow-600 dark:text-yellow-500 hover:bg-yellow-50 dark:hover:bg-yellow-900/20',
      red: 'text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20',
      whatsapp: 'text-[#25d366] hover:bg-[#25d366]/10',
      gray: 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700',
    }
    return (
      <button
        type="button"
        title={label}
        onClick={onClick}
        disabled={disabled}
        className={`p-1.5 rounded-lg transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed ${colors[color] || colors.gray}`}
      >
        <Icon size={16} strokeWidth={2} />
      </button>
    )
  }

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      {/* Action Bar */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-3 bg-white dark:bg-slate-800 p-4 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl transition-all bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-500 border border-yellow-200 dark:border-yellow-800/30 hover:bg-yellow-100 disabled:opacity-50"
            onClick={() => void syncFromDb(false)}
            disabled={loading}
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">مزامنة</span>
          </button>
          <span className="text-xs font-bold text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-slate-900 px-3 py-2 rounded-xl border border-gray-200 dark:border-slate-700">
            {rawCount} فاتورة
          </span>
        </div>
        <button
          className="w-full xl:w-auto bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-50"
          onClick={openNewWizard}
        >
          <PlusCircle size={18} /> إنشاء فاتورة
        </button>
      </div>

      {/* Search & Filters */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-gray-200 dark:border-slate-700 shadow-sm space-y-4">
        <div className="relative">
          <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="بحث بالاسم، الجوال، رقم الفاتورة، رقم دفترة..."
            className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl py-2.5 pr-11 pl-4 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 outline-none transition-all"
            value={ui.q}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select value={ui.quickDate} onChange={(e) => setQuickDate(e.target.value as QuickDate)} className="bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs font-bold text-gray-700 dark:text-gray-300 focus:ring-1 focus:ring-indigo-500 outline-none">
            <option value="all">كل الفترات</option>
            <option value="today">اليوم</option>
            <option value="week">هذا الأسبوع</option>
            <option value="month">هذا الشهر</option>
            <option value="year">هذه السنة</option>
          </select>
          <select value={ui.quickStatus} onChange={(e) => setQuickStatus(e.target.value as QuickStatus)} className="bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs font-bold text-gray-700 dark:text-gray-300 focus:ring-1 focus:ring-indigo-500 outline-none">
            <option value="all">كل الحالات</option>
            <option value="unpaid">غير مدفوعة</option>
            <option value="partial">جزئية</option>
            <option value="paid">مدفوعة</option>
            <option value="returned">مرتجعة</option>
          </select>
          <button onClick={togglePriceSort} className="px-3 py-1.5 text-xs font-bold rounded-lg bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors">
            السعر {ui.priceSort === 'desc' ? '↓' : ui.priceSort === 'asc' ? '↑' : ''}
          </button>
          <button onClick={toggleDateSort} className="px-3 py-1.5 text-xs font-bold rounded-lg bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors">
            التاريخ {ui.dateSort === 'desc' ? '↓' : '↑'}
          </button>
          <button onClick={toggleAdvOpen} className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-colors flex items-center gap-1 ${ui.advOpen ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800/30' : 'bg-gray-50 dark:bg-slate-900 border-gray-200 dark:border-slate-700 text-gray-600 dark:text-gray-300'}`}>
            <SlidersHorizontal size={13} /> متقدم
          </button>

          <div className="flex items-center gap-1.5 mr-auto">
            <input type="date" value={ui.quickDateFrom} onChange={(e) => setQuickDateFrom(e.target.value)} className="bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-md px-2 py-1 text-[11px] text-gray-700 dark:text-gray-300 focus:ring-1 focus:ring-indigo-500 outline-none font-inter" />
            <span className="text-gray-400 text-[10px]">→</span>
            <input type="date" value={ui.quickDateTo} onChange={(e) => setQuickDateTo(e.target.value)} className="bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-md px-2 py-1 text-[11px] text-gray-700 dark:text-gray-300 focus:ring-1 focus:ring-indigo-500 outline-none font-inter" />
            {clearDateRangeVisible && (
              <button onClick={clearDateRange} className="text-[10px] text-red-500 hover:underline font-bold">مسح</button>
            )}
          </div>
        </div>

        {ui.advOpen && (
          <div className="bg-gray-50 dark:bg-slate-700/30 p-3 border border-gray-200 dark:border-slate-700 rounded-xl grid grid-cols-1 md:grid-cols-4 gap-3 animate-in slide-in-from-top-1 duration-150">
            <select value={ui.advCarrier} onChange={(e) => setAdvCarrier(e.target.value)} className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-gray-700 dark:text-gray-300 focus:ring-1 focus:ring-indigo-500 outline-none">
              <option value="">كل الناقلين</option>
              <option>DHL Express</option><option>DHL</option><option>Aramex</option><option>FedEx</option><option>SMSA</option><option>UPS</option>
            </select>
            <select value={ui.advPayment} onChange={(e) => setAdvPayment(e.target.value)} className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-gray-700 dark:text-gray-300 focus:ring-1 focus:ring-indigo-500 outline-none">
              <option value="">كل طرق الدفع</option>
              <option>تحويل بنكي</option><option>سداد إلكتروني</option><option>دفع نقدي</option>
            </select>
            <select value={ui.advStatus} onChange={(e) => setAdvStatus(e.target.value as '' | 'unpaid' | 'partial' | 'paid' | 'returned')} className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-gray-700 dark:text-gray-300 focus:ring-1 focus:ring-indigo-500 outline-none">
              <option value="">كل الحالات</option>
              <option value="unpaid">غير مدفوعة</option><option value="partial">جزئية</option><option value="paid">مدفوعة</option><option value="returned">مرتجعة</option>
            </select>
            <button onClick={clearAdvSearch} className="text-xs font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 px-3 py-2 rounded-lg transition-colors">مسح الفلاتر</button>
          </div>
        )}
      </div>

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/30 rounded-xl text-xs font-bold flex items-center gap-2">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {rawCount === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-2xl">
          <FileText size={40} className="text-gray-300 dark:text-slate-600 mb-3" />
          <div className="text-lg font-bold text-gray-900 dark:text-white mb-1">لا توجد نتائج</div>
          <div className="text-sm text-gray-500 dark:text-gray-400">{ui.q.trim() ? 'جرّب بحثاً مختلفاً' : 'لا توجد فواتير'}</div>
        </div>
      ) : (
        <>
          {/* ═══ Desktop Table ═══ */}
          <div className="hidden lg:block bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="w-full overflow-x-auto">
              <table className="w-full text-right border-collapse" style={{ minWidth: 1000 }}>
                <thead>
                  <tr className="bg-gray-50 dark:bg-slate-900/60 border-b border-gray-200 dark:border-slate-700">
                    {['الفاتورة', 'العميل', 'الجوال', 'الناقل', 'التفاصيل', 'المبلغ', 'المدفوع', 'المتبقي', 'الحالة', 'التاريخ', 'إجراءات'].map((h) => (
                      <th key={h} className="px-3 py-3 text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700/50">
                  {invoices.map((inv) => {
                    const price = Number(inv.price || 0)
                    const paid = readPaid(inv)
                    const remaining = readRemainingAmount(inv)
                    const isDeleting = deletingId === String(inv.id)

                    return (
                      <tr
                        key={inv.id}
                        className={`hover:bg-gray-50/80 dark:hover:bg-slate-700/20 transition-colors ${isDeleting ? 'opacity-40' : ''} ${inv.isDraft ? 'opacity-70' : ''}`}
                      >
                        <td className="px-3 py-3">
                          <div className="font-inter font-bold text-sm text-gray-900 dark:text-white">
                            #{inv.invoice_number || inv.daftra_id || inv.id}
                          </div>
                          {inv.awb && (
                            <div className="text-[9px] text-blue-500 dark:text-blue-400 font-mono font-bold mt-0.5 truncate max-w-[100px]" title={inv.awb}>
                              AWB: {inv.awb}
                            </div>
                          )}
                          {!inv.awb && inv.daftra_id && (
                            <div className="text-[9px] text-indigo-500 dark:text-indigo-400 font-bold mt-0.5">دفترة #{inv.daftra_id}</div>
                          )}
                        </td>

                        <td className="px-3 py-3">
                          <div className="font-bold text-sm text-gray-900 dark:text-white truncate max-w-[140px]">{inv.client || '—'}</div>
                        </td>

                        <td className="px-3 py-3 font-inter text-xs text-gray-500 dark:text-gray-400 direction-ltr" dir="ltr">
                          {displayValue(inv.phone)}
                        </td>

                        <td className="px-3 py-3">
                          <span className="text-[10px] font-bold bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-md">
                            {displayValue(inv.carrier)}
                          </span>
                        </td>

                        <td className="px-3 py-3">
                          <div className="text-[11px] font-semibold text-gray-600 dark:text-gray-300 truncate max-w-[180px]" title={(inv as any).details || readItemLabel(inv)}>
                            {(inv as any).details
                              ? String((inv as any).details).split('\n')[0].slice(0, 50)
                              : readItemLabel(inv)}
                          </div>
                        </td>

                        <td className="px-3 py-3 font-inter font-bold text-sm text-gray-900 dark:text-white whitespace-nowrap">
                          {price.toFixed(2)} <span className="text-[10px] text-gray-400">ر.س</span>
                        </td>

                        <td className="px-3 py-3 font-inter font-bold text-xs whitespace-nowrap">
                          {paid > 0 ? (
                            <span className="text-green-600 dark:text-green-400">{paid.toFixed(2)}</span>
                          ) : (
                            <span className="text-gray-300 dark:text-slate-600">0.00</span>
                          )}
                        </td>

                        <td className="px-3 py-3 font-inter font-bold text-xs whitespace-nowrap">
                          {inv.status === 'returned' ? (
                            <span className="text-purple-500 dark:text-purple-400 flex items-center gap-0.5"><RotateCcw size={11} /> مرتجع</span>
                          ) : remaining > 0 ? (
                            <span className="text-red-500 dark:text-red-400">{remaining.toFixed(2)}</span>
                          ) : (
                            <span className="text-green-600 dark:text-green-400 flex items-center gap-0.5"><CheckCircle2 size={11} /> تم</span>
                          )}
                        </td>

                        <td className="px-3 py-3">{statusBadge(inv)}</td>

                        <td className="px-3 py-3 text-xs text-gray-500 dark:text-gray-400 font-inter whitespace-nowrap">
                          {displayDate(inv.date)}
                        </td>

                        <td className="px-3 py-3">
                          <div className="flex items-center gap-0.5">
                            <ActionBtn icon={Eye} label="عرض" onClick={() => handleView(String(inv.id))} color="blue" />
                            <ActionBtn icon={Edit3} label="تعديل" onClick={() => handleEdit(String(inv.id))} color="yellow" />
                            <ActionBtn icon={Plus} label="إضافة بند" onClick={() => handleAddItem(String(inv.id))} color="green" />
                            {inv.phone && (
                              <ActionBtn icon={MessageSquare} label="واتساب" onClick={() => handleCollect(String(inv.id))} color="whatsapp" disabled={mutating} />
                            )}
                            <ActionBtn icon={Trash2} label="حذف" onClick={() => handleDelete(String(inv.id))} color="red" disabled={mutating || isDeleting} />
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ═══ Mobile Cards ═══ */}
          <div className="flex flex-col gap-3 lg:hidden">
            {invoices.map((inv) => {
              const price = Number(inv.price || 0)
              const paid = readPaid(inv)
              const remaining = readRemainingAmount(inv)

              return (
                <div key={inv.id} className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-4 shadow-sm">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="font-bold text-sm text-gray-900 dark:text-white">{inv.client || '—'}</div>
                      <div className="text-[11px] text-gray-500 dark:text-gray-400 font-inter mt-0.5">
                        #{inv.invoice_number || inv.daftra_id || inv.id} · {displayDate(inv.date)}
                        {inv.awb && <span className="text-blue-500 mr-1">· AWB: {inv.awb}</span>}
                      </div>
                    </div>
                    {statusBadge(inv)}
                  </div>

                  <div className="grid grid-cols-3 gap-2 mb-3 text-center">
                    <div className="bg-gray-50 dark:bg-slate-700/30 rounded-lg p-2">
                      <div className="text-[9px] text-gray-400 font-bold mb-0.5">المبلغ</div>
                      <div className="font-inter font-bold text-xs text-gray-900 dark:text-white">{price.toFixed(2)}</div>
                    </div>
                    <div className="bg-gray-50 dark:bg-slate-700/30 rounded-lg p-2">
                      <div className="text-[9px] text-gray-400 font-bold mb-0.5">المدفوع</div>
                      <div className="font-inter font-bold text-xs text-green-600 dark:text-green-400">{paid.toFixed(2)}</div>
                    </div>
                    <div className="bg-gray-50 dark:bg-slate-700/30 rounded-lg p-2">
                      <div className="text-[9px] text-gray-400 font-bold mb-0.5">المتبقي</div>
                      <div className={`font-inter font-bold text-xs ${
                        inv.status === 'returned' ? 'text-purple-500' :
                        remaining > 0 ? 'text-red-500' : 'text-green-600 dark:text-green-400'
                      }`}>
                        {inv.status === 'returned' ? 'مرتجع' : remaining > 0 ? remaining.toFixed(2) : 'تم ✓'}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5 mb-3 text-[10px]">
                    <span className="bg-gray-100 dark:bg-slate-700 px-2 py-0.5 rounded font-bold text-gray-600 dark:text-gray-300">{displayValue(inv.carrier)}</span>
                    <span className="bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded font-bold text-blue-600 dark:text-blue-400 truncate max-w-[120px]">{readItemLabel(inv)}</span>
                    {inv.phone && <span className="bg-gray-100 dark:bg-slate-700 px-2 py-0.5 rounded font-inter text-gray-500 dark:text-gray-400" dir="ltr">{inv.phone}</span>}
                  </div>

                  <div className="flex items-center gap-1 pt-2 border-t border-gray-100 dark:border-slate-700">
                    <ActionBtn icon={Eye} label="عرض" onClick={() => handleView(String(inv.id))} color="blue" />
                    <ActionBtn icon={Edit3} label="تعديل" onClick={() => handleEdit(String(inv.id))} color="yellow" />
                    <ActionBtn icon={Plus} label="إضافة بند" onClick={() => handleAddItem(String(inv.id))} color="green" />
                    {inv.phone && (
                      <ActionBtn icon={MessageSquare} label="واتساب" onClick={() => handleCollect(String(inv.id))} color="whatsapp" disabled={mutating} />
                    )}
                    <div className="flex-1" />
                    <ActionBtn icon={Trash2} label="حذف" onClick={() => handleDelete(String(inv.id))} color="red" disabled={mutating} />
                  </div>
                </div>
              )
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl">
              <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                {startIdx + 1} — {Math.min(startIdx + pageSize, rawCount)} من {rawCount}
              </span>
              <div className="flex items-center gap-1.5">
                <button onClick={() => setPage(1)} disabled={page <= 1} className="p-1.5 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg text-gray-500 hover:text-gray-900 disabled:opacity-40 transition-colors"><ChevronRight size={14} strokeWidth={3} /></button>
                <button onClick={() => setPage(page - 1)} disabled={page <= 1} className="px-2.5 py-1 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg text-xs font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-100 disabled:opacity-40 transition-colors">السابق</button>
                <span className="text-xs font-bold text-gray-900 dark:text-white px-2">{page} / {totalPages}</span>
                <button onClick={() => setPage(page + 1)} disabled={page >= totalPages} className="px-2.5 py-1 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg text-xs font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-100 disabled:opacity-40 transition-colors">التالي</button>
                <button onClick={() => setPage(totalPages)} disabled={page >= totalPages} className="p-1.5 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg text-gray-500 hover:text-gray-900 disabled:opacity-40 transition-colors"><ChevronLeft size={14} strokeWidth={3} /></button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modals */}
      <InvoiceWizardModal
        key={wizardKey}
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onSave={onWizardSave}
        title={wizardTitle}
        initialDraft={wizardInitialDraft}
        initialStep={wizardInitialDraft ? 2 : undefined}
        saving={mutating}
      />

      <InvoiceViewModal
        open={Boolean(viewInvoiceId)}
        invoice={viewInvoiceId ? storeInvoices.find((i) => String(i.id) === String(viewInvoiceId)) ?? null : null}
        onClose={() => setViewInvoiceId(null)}
        onAddItem={() => { if (viewInvoiceId) { setAddItemInvoiceId(viewInvoiceId); setViewInvoiceId(null) } }}
        onEdit={() => { if (viewInvoiceId) { handleEdit(viewInvoiceId); setViewInvoiceId(null) } }}
        onCollect={() => { if (viewInvoiceId) { handleCollect(viewInvoiceId); setViewInvoiceId(null) } }}
        onDelete={() => { if (viewInvoiceId) { handleDelete(viewInvoiceId); setViewInvoiceId(null) } }}
      />

      <InvoiceAddItemModal
        open={Boolean(addItemInvoiceId)}
        invoice={addItemInvoiceId ? storeInvoices.find((i) => String(i.id) === String(addItemInvoiceId)) ?? null : null}
        onClose={() => setAddItemInvoiceId(null)}
        saving={mutating}
        onSave={(next: Invoice) => {
          if (mutating || !addItemInvoiceId) return
          void (async () => {
            setMutating(true)
            try {
              const allItems = Array.isArray(next.items) ? next.items : []
              const newItem = allItems[allItems.length - 1]

              if (newItem) {
                const { api } = await import('../utils/apiClient')

                await api.post(`/invoices/${addItemInvoiceId}/items`, {
                  description: (newItem as any).type || (newItem as any).details || 'بند إضافي',
                  quantity: 1,
                  unit_price: Number(newItem.price) || 0,
                  total: Number(newItem.price) || 0,
                })

                const newTotal = allItems.reduce((s, it) => s + (Number(it.price) || 0), 0)
                await api.put(`/invoices/${addItemInvoiceId}`, {
                  total: newTotal,
                })

                console.log(`[Invoices] ✅ Added item to #${addItemInvoiceId}, total: ${newTotal}`)
              }

              await syncFromDb()
              setAddItemInvoiceId(null)
            } catch (e: any) {
              console.error('[Invoices] ❌ Add item failed:', e)
              window.alert(e?.message || 'فشل في إضافة البند')
            } finally {
              setMutating(false)
            }
          })()
        }}
      />
    </div>
  )
}