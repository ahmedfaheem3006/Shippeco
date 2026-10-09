import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { NO_CARRIER_COST_LABEL, carrierCostLabel, carrierCostOf } from '../utils/carrierCost'
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { toast as hotToast } from 'react-hot-toast'
import { useAppLayout } from '../components/AppLayout/useAppLayout'
import { InvoiceAddItemModal } from '../components/Invoices/InvoiceAddItemModal'
import { InvoiceViewModal } from '../components/Invoices/InvoiceViewModal'
import { InvoiceWizardModal } from '../components/Invoices/InvoiceWizardModal'
import { useLegacyInvoicesPage } from '../hooks/useLegacyInvoicesPage'
import { useInvoicesStore } from '../hooks/useInvoicesStore'
import { invoiceService } from '../services/invoiceService'
import { clientService } from '../services/clientService'
import { useAuthStore } from '../hooks/useAuthStore'
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
  RotateCcw, X, ListTodo, User, Download,
  UserPlus, Users, Building2, Phone, Mail, MapPin, Loader2,
  FileSpreadsheet, TrendingUp, TrendingDown
} from 'lucide-react'
import { ExportDialog } from '../components/shared/ExportDialog'
import type { ExportFormat } from '../utils/exportPeriods'
import {
  PROFIT_FILTER_OPTIONS, PROFIT_STATUS_CLASS, PROFIT_STATUS_LABEL,
  fmtSigned, netProfitOf, profitStatusOf, type ProfitFilter,
} from '../utils/invoiceProfit'
import { useSettingsStore } from '../hooks/useSettingsStore'
import { downloadInvoicePDF } from '../utils/pdfGenerator'
import { PAYMENT_EVENTS, useRealtimeRefresh } from '../hooks/useRealtimeRefresh'
import { describeOpenError } from '../utils/notificationTarget'

type QuickDate = 'all' | 'today' | 'week' | 'month' | 'year'

/** Net profit of one invoice: green profit, red loss, amber break-even. */
function ProfitBadge({ inv }: { inv: Invoice }) {
  const st = profitStatusOf(inv)
  const net = netProfitOf(inv)
  if (st === 'no_cost') {
    return <span className="text-[10px] font-bold text-gray-300 dark:text-slate-600" title="لا توجد تكلفة DHL لحساب الربح">بدون تكلفة</span>
  }
  if (st === 'returned' || net === null) {
    return <span className="text-[10px] font-bold text-purple-400" title="المرتجعات لا تدخل في حساب الربح">—</span>
  }
  const margin = inv.margin_pct
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-bold font-inter whitespace-nowrap ${PROFIT_STATUS_CLASS[st]}`}
      title={`${PROFIT_STATUS_LABEL[st]}: الإيراد ${Number(inv.price || 0).toFixed(2)} − تكلفة DHL ${Number(inv.dhl_cost || 0).toFixed(2)}${margin != null ? ` · الهامش ${margin}%` : ''}`}
    >
      {st === 'loss' ? <TrendingDown size={11} /> : st === 'profit' ? <TrendingUp size={11} /> : null}
      {st === 'break_even' ? 'تعادل 0.00' : <span dir="ltr">{fmtSigned(net)}</span>}
    </span>
  )
}
type QuickStatus = 'all' | 'unpaid' | 'partial' | 'paid' | 'returned'

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return 'الآن';
  if (diffMin < 60) return `منذ ${diffMin} دقيقة`;
  if (diffHr < 24) return `منذ ${diffHr} ساعة`;
  if (diffDay < 7) return `منذ ${diffDay} يوم`;
  return new Date(dateStr).toLocaleDateString('ar-EG');
}

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
    setProfit, setMinAmount, summary, exportParams, exportFilterLabels, currentRange,
  } = useLegacyInvoicesPage()
  const [exportFormat, setExportFormat] = useState<ExportFormat | null>(null)
  const location = useLocation()

  const storeInvoices = useInvoicesStore((s) => s.invoices)
  const user = useAuthStore((s) => s.user)
  const invoiceTemplate = useSettingsStore((s) => s.invoiceTemplate)
  const [mutating, setMutating] = useState(false)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [wizardKey, setWizardKey] = useState(0)
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null)
  const [wizardInitialDraft, setWizardInitialDraft] = useState<InvoiceDraftInput | undefined>(undefined)
  const [wizardTitle, setWizardTitle] = useState<string | undefined>(undefined)
  const [viewInvoiceId, setViewInvoiceId] = useState<string | null>(null)
  // Invoice opened by id (notification deep link / task link) that may not be
  // on the current page of results or match the current filter.
  const [openedInvoice, setOpenedInvoice] = useState<Invoice | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const deepLinkInvoiceId = searchParams.get('invoice')
  const [addItemInvoiceId, setAddItemInvoiceId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Client Registration Modal State ──
  const [showAddModal, setShowAddModal] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [company, setCompany] = useState("")
  const [city, setCity] = useState("")
  const [address, setAddress] = useState("")
  const [taxNumber, setTaxNumber] = useState("")
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  const handleAddClientSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setAddError("الاسم الكامل مطلوب")
      return
    }
    setAdding(true)
    setAddError(null)
    try {
      await clientService.createClient({
        name: name.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        company: company.trim() || undefined,
        city: city.trim() || undefined,
        address: address.trim() || undefined,
        tax_number: taxNumber.trim() || undefined,
      })
      setName("")
      setPhone("")
      setEmail("")
      setCompany("")
      setCity("")
      setAddress("")
      setTaxNumber("")
      
      setShowSuccess(true)
      setTimeout(() => {
        setShowSuccess(false)
        setShowAddModal(false)
      }, 2000)
    } catch (err: any) {
      setAddError(err.message || "حدث خطأ أثناء إضافة العميل")
    } finally {
      setAdding(false)
    }
  }

  // ── Task Modal State ──
  const [taskModalOpen, setTaskModalOpen] = useState(false)
  const [taskInvoice, setTaskInvoice] = useState<Invoice | null>(null)
  const [usersList, setUsersList] = useState<{id: number, full_name: string, role: string}[]>([])
  const [taskRecipientId, setTaskRecipientId] = useState('')
  const [taskResponsibleId, setTaskResponsibleId] = useState('')
  const [taskNotes, setTaskNotes] = useState('')
  const [taskLoading, setTaskLoading] = useState(false)
  const [taskHistory, setTaskHistory] = useState<any[]>([])

  const handleOpenTaskModal = async (inv: Invoice) => {
    setTaskInvoice(inv)
    setTaskModalOpen(true)
    setTaskNotes('')
    setTaskRecipientId('')
    setTaskResponsibleId(inv.assigned_to ? String(inv.assigned_to) : '')
    setTaskLoading(true)
    try {
      const { api } = await import('../utils/apiClient')
      
      // Fetch users and history in parallel
      const [uRes, hRes] = await Promise.all([
        api.get('/users/list'),
        api.get(`/notifications/invoice/${inv.id}`)
      ]);
      
      setUsersList(Array.isArray(uRes) ? uRes : uRes.data || [])
      setTaskHistory(Array.isArray(hRes) ? hRes : hRes.data || [])
    } catch (e: any) {
      console.error('[Invoices] Failed to load task data', e)
    } finally {
      setTaskLoading(false)
    }
  }

  // ── Real-time payment updates ── (one refresh per burst of events; the
  // list is swapped in place, so the page does not jump or lose its scroll;
  // an open edit wizard keeps its unsaved input)
  useRealtimeRefresh(PAYMENT_EVENTS, () => {
    void syncFromDb(false)
  })

  const handleSendTask = async () => {
    if (!taskRecipientId || !taskNotes.trim() || !taskInvoice) return
    setTaskLoading(true)
    try {
      const { api } = await import('../utils/apiClient')
      await api.post('/notifications/send', {
        recipientId: taskRecipientId,
        message: taskNotes,
        data: { 
          invoiceId: taskInvoice.id, 
          invoiceNumber: taskInvoice.invoice_number || taskInvoice.daftra_id || taskInvoice.id 
        }
      })
      setTaskModalOpen(false)
      window.alert('تم إرسال المهمة بنجاح')
      if (taskInvoice) handleOpenTaskModal(taskInvoice) // Refresh history if still open (though we close it, maybe user wants it open)
    } catch (err: any) {
      console.error('[Invoices] Send task failed', err)
      window.alert(err.response?.data?.error || 'حدث خطأ أثناء الإرسال')
    } finally {
      setTaskLoading(false)
    }
  }

  const handleAssignResponsible = async (employeeId: string) => {
    if (!taskInvoice) return
    setTaskResponsibleId(employeeId)
    try {
      await invoiceService.assignInvoice(taskInvoice.id, employeeId ? parseInt(employeeId, 10) : null)
      void syncFromDb(false) 
    } catch (err: any) {
      console.error('[Invoices] Assign responsible failed', err)
    }
  }

  // ── Client Profile State ──
  // (Overlay moved to external ClientsPage)

  const openClientProfile = useCallback(async (clientName: string, clientId?: string | number) => {
    const lookupId = clientId ? String(clientId) : clientName
    if (!lookupId) return
    navTo('/clients?profile=' + encodeURIComponent(lookupId))
  }, [navTo])

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

  // ── Deep link: /invoices?invoice=<id> (notifications) ──
  // Fetched by its primary key, so it opens even when it is not on the
  // current page or filter. The API enforces access; a deleted or forbidden
  // invoice shows an Arabic message instead of an empty dialog.
  useEffect(() => {
    if (!deepLinkInvoiceId) return
    const clearParam = () => setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('invoice')
      return next
    }, { replace: true })
    if (!/^\d+$/.test(deepLinkInvoiceId)) { clearParam(); return }
    let cancelled = false
    void (async () => {
      try {
        const inv = await invoiceService.getInvoice(deepLinkInvoiceId, { strict: true, fresh: true })
        if (cancelled) return
        setOpenedInvoice(inv)
        setViewInvoiceId(String(inv.id))
      } catch (err: any) {
        if (cancelled) return
        hotToast.error(describeOpenError('invoice', err?.status), { id: `invoice-open-${deepLinkInvoiceId}` })
        clearParam()
      }
    })()
    return () => { cancelled = true }
  }, [deepLinkInvoiceId, setSearchParams])

  const closeInvoiceView = useCallback(() => {
    setViewInvoiceId(null)
    if (searchParams.has('invoice')) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.delete('invoice')
        return next
      }, { replace: true })
    }
  }, [searchParams, setSearchParams])

  // ── Handle incoming navigation state (task window "open invoice" link) ──
  useEffect(() => {
    if (!location.state?.invoiceId || !(location.state?.openTask || location.state?.openInvoice)) return
    const invId = String(location.state.invoiceId);
    const openTask = Boolean(location.state?.openTask);
    // Clear state so it doesn't re-open on refresh
    navTo(location.pathname + location.search, { replace: true, state: {} });
    // Open edit (fetches the invoice by id itself, wherever it is in the list)
    handleEdit(invId);
    if (openTask) {
      const listed = invoices.find(i => String(i.id) === invId);
      if (listed) handleOpenTaskModal(listed);
      else invoiceService.getInvoice(invId, { strict: true }).then(handleOpenTaskModal).catch(() => undefined);
    }
  }, [location.state, invoices, navTo, location.pathname, location.search]);

  const findInvoice = (id: string | null) =>
    id === null
      ? null
      : storeInvoices.find((i) => String(i.id) === String(id))
        ?? (openedInvoice && String(openedInvoice.id) === String(id) ? openedInvoice : null)

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
    if (mutating) return
    void (async () => {
      setMutating(true)
      try {
        const fullInv = await invoiceService.getInvoice(id)
        setEditingInvoiceId(id)
        setWizardInitialDraft(toDraftFromInvoice(fullInv))
        setWizardTitle(`${fullInv.isDraft ? 'إكمال المسودة' : 'تعديل الفاتورة'} #${fullInv.invoice_number || fullInv.id}`)
        setWizardKey((k) => k + 1)
        setWizardOpen(true)
      } catch (err: any) {
        console.error('[Invoices] Failed to load invoice details:', err)
        window.alert('فشل في تحميل تفاصيل الفاتورة')
      } finally {
        setMutating(false)
      }
    })()
  }

  const handleAddItem = (id: string) => setAddItemInvoiceId(id)

  const handleCollect = (id: string) => {
    const inv = findInvoice(id)
    if (!inv || !inv.phone) return

    // Fetch or CREATE Paymob link for this invoice, then send WhatsApp
    void (async () => {
      let paymentUrl = inv.paymentUrl || ''
      const price = Number(inv.price || 0)
      const paid = Number((inv as any).paid_amount ?? inv.partialPaid ?? inv.partial_paid ?? 0)
      const remainingAmount = Math.max(0, price - paid)

      // Step 1: Try to find existing Paymob link for this invoice
      if (!paymentUrl) {
        try {
          const { api } = await import('../utils/apiClient')
          const res = await api.get<any>(`/paymob/links?invoice_id=${inv.id}&limit=1`)
          const links = res?.links || res?.data?.links || []
          if (links.length > 0) {
            paymentUrl = links[0].payment_url || links[0].payment_link || ''
          }
        } catch {
          // Silent - continue to create
        }
      }

      // Step 2: If no link exists, AUTO-CREATE one
      if (!paymentUrl && remainingAmount > 0) {
        try {
          const { createPaymentLink } = await import('../services/paymobService')
          const res = await createPaymentLink({
            invoice_id: String(inv.id),
            amount: remainingAmount,
            client_name: inv.client || 'عميل',
            client_phone: inv.phone || '0500000000',
            description: `دفع فاتورة #${inv.invoice_number || inv.id}`,
          })
          paymentUrl = res.payment_url_full || res.payment_url || res.payment_link || ''
          console.log('[Collect] ✅ Auto-created Paymob link:', paymentUrl)
        } catch (err) {
          console.error('[Collect] ⚠️ Failed to auto-create payment link:', err)
        }
      }

      // Step 3: Build message with the link and open WhatsApp
      const invWithUrl = paymentUrl ? { ...inv, paymentUrl } : inv
      const templateKey = getSmartTemplateKey(invWithUrl)
      const msg = applyWaTemplate(templateKey, invWithUrl)
      openWhatsApp(inv.phone!, msg)
    })()
  }

  const handleDelete = (id: string) => {
    const inv = findInvoice(id)
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

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast({ type, message })
    toastTimerRef.current = setTimeout(() => {
      setToast(null)
      if (type === 'success') window.location.reload()
    }, 15000)
  }, [])

  const dismissToast = useCallback(() => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    const wasSuccess = toast?.type === 'success'
    setToast(null)
    if (wasSuccess) window.location.reload()
  }, [toast])

  // ══════════════════════════════════════════
  // WIZARD SAVE — Update sends only clean DB fields
  // ══════════════════════════════════════════
  const onWizardSave = (draft: InvoiceDraftInput, options: { asDraft: boolean }, pendingReceiptFiles?: File[]) => {
    if (mutating) return
    const id = editingInvoiceId ? String(editingInvoiceId) : `${Date.now()}`

    void (async () => {
      setMutating(true)
      try {
        let savedInvoiceId = editingInvoiceId ? String(editingInvoiceId) : ''

        if (editingInvoiceId) {
          const next = toInvoiceFromDraft(id, draft, { forceDraft: options.asDraft })
          console.log(`[Invoices] Updating #${id}:`, next)
          await invoiceService.updateInvoice(id, next)
          savedInvoiceId = id
          console.log(`[Invoices] ✅ Updated invoice #${id}`)
        } else {
          const next = toInvoiceFromDraft(id, draft, { forceDraft: options.asDraft })
          const created = await invoiceService.createInvoice(next)
          savedInvoiceId = String((created as any)?.id || id)
          console.log(`[Invoices] ✅ Created new invoice`)
        }

        // Upload any newly-picked receipt images (added to whatever's
        // already saved — never replaces it). A failure here must NOT be
        // reported as a full success, and must NOT lose the user's picked
        // files: the wizard stays open (its pendingReceiptFiles state is
        // untouched) so clicking Save again retries the upload without
        // re-entering the whole form. If this was a brand-new invoice,
        // point future retries at the now-real id instead of creating a
        // second invoice.
        if (pendingReceiptFiles && pendingReceiptFiles.length > 0 && savedInvoiceId) {
          try {
            await invoiceService.uploadTransferReceipts(savedInvoiceId, pendingReceiptFiles)
            console.log(`[Invoices] ✅ ${pendingReceiptFiles.length} receipt(s) uploaded for #${savedInvoiceId}`)
          } catch (e) {
            console.error('[Invoices] ⚠️ Receipt upload failed:', e)
            if (!editingInvoiceId) setEditingInvoiceId(savedInvoiceId)
            await syncFromDb(false)
            showToast('error', `تم حفظ الفاتورة #${savedInvoiceId} لكن فشل رفع صور سند التحويل — عدّل الفاتورة والصور لاتزال جاهزة، اضغط حفظ لإعادة المحاولة`)
            return
          }
        }

        setWizardOpen(false)
        setEditingInvoiceId(null)
        setWizardInitialDraft(undefined)
        setWizardTitle(undefined)
        // Auto-refresh the invoices list to show updates
        await syncFromDb(false)
        showToast('success', editingInvoiceId ? `✅ تم تحديث الفاتورة #${id} بنجاح` : '✅ تم إنشاء الفاتورة بنجاح')
      } catch (e: any) {
        console.error('[Invoices] ❌ Save failed:', e)
        showToast('error', e?.message || 'فشل في حفظ الفاتورة')
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
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[200] max-w-lg w-[90%] flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-2xl border animate-in slide-in-from-top-2 duration-300 ${toast.type === 'success' ? 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800/40 text-green-700 dark:text-green-300' : 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800/40 text-red-700 dark:text-red-300'}`}>
          {toast.type === 'success' ? <CheckCircle2 size={20} className="shrink-0" /> : <AlertCircle size={20} className="shrink-0" />}
          <span className="flex-1 text-sm font-bold">{toast.message}</span>
          <button type="button" onClick={dismissToast} className="p-1 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 transition-colors shrink-0">
            <X size={16} />
          </button>
        </div>
      )}
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
          <button
            type="button"
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-bold rounded-xl border border-green-200 dark:border-green-800/30 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 hover:bg-green-100 disabled:opacity-50"
            onClick={() => setExportFormat('xlsx')}
            disabled={exportFormat !== null}
          >
            <FileSpreadsheet size={16} /> Excel
          </button>
          <button
            type="button"
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-bold rounded-xl border border-blue-200 dark:border-blue-800/30 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 hover:bg-blue-100 disabled:opacity-50"
            onClick={() => setExportFormat('csv')}
            disabled={exportFormat !== null}
          >
            <Download size={16} /> CSV
          </button>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-2 w-full xl:w-auto">
          <button
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-bold rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-lg shadow-emerald-500/20 active:scale-95 transition-all duration-200 transform hover:-translate-y-0.5"
            onClick={() => {
              setAddError(null)
              setShowAddModal(true)
            }}
            type="button"
          >
            <UserPlus size={16} />
            <span>إضافة عميل جديد</span>
          </button>
          <button
            className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-50"
            onClick={openNewWizard}
          >
            <PlusCircle size={18} /> إنشاء فاتورة
          </button>
        </div>
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
          <select
            value={ui.profit}
            onChange={(e) => setProfit(e.target.value as ProfitFilter)}
            aria-label="فلتر الربحية"
            className={`border rounded-lg px-3 py-1.5 text-xs font-bold focus:ring-1 focus:ring-indigo-500 outline-none ${
              ui.profit === 'loss' ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/40 text-red-700 dark:text-red-400'
                : ui.profit === 'profit' ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/40 text-green-700 dark:text-green-400'
                : 'bg-gray-50 dark:bg-slate-900 border-gray-200 dark:border-slate-700 text-gray-700 dark:text-gray-300'
            }`}
          >
            {PROFIT_FILTER_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
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
            <label className="flex items-center gap-2 text-[11px] font-bold text-green-700 dark:text-green-400 md:col-span-2">
              <TrendingUp size={14} className="shrink-0" /> ربح لا يقل عن
              <input inputMode="decimal" value={ui.minProfit} onChange={(e) => setMinAmount('minProfit', e.target.value)} placeholder="مثال: 100"
                className="flex-1 min-w-0 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs font-inter text-gray-700 dark:text-gray-300 focus:ring-1 focus:ring-indigo-500 outline-none" />
              ر.س
            </label>
            <label className="flex items-center gap-2 text-[11px] font-bold text-red-600 dark:text-red-400 md:col-span-2">
              <TrendingDown size={14} className="shrink-0" /> خسارة لا تقل عن
              <input inputMode="decimal" value={ui.minLoss} onChange={(e) => setMinAmount('minLoss', e.target.value)} placeholder="مثال: 50"
                className="flex-1 min-w-0 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs font-inter text-gray-700 dark:text-gray-300 focus:ring-1 focus:ring-indigo-500 outline-none" />
              ر.س
            </label>
          </div>
        )}

        {summary && summary.count > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-1" aria-label="ملخص ربحية الفواتير المعروضة">
            <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50/60 dark:bg-slate-900/40 px-3 py-2">
              <div className="text-[10px] font-bold text-gray-400">إجمالي الإيراد (بدون المرتجعات)</div>
              <div className="font-inter font-black text-sm text-gray-900 dark:text-white">{summary.revenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-[10px] text-gray-400">ر.س</span></div>
            </div>
            <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50/60 dark:bg-slate-900/40 px-3 py-2">
              <div className="text-[10px] font-bold text-gray-400">تكلفة DHL ({summary.countedCount} فاتورة لها تكلفة)</div>
              <div className="font-inter font-black text-sm text-gray-900 dark:text-white">{summary.cost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-[10px] text-gray-400">ر.س</span></div>
            </div>
            <div className={`rounded-xl border px-3 py-2 ${summary.net < 0 ? 'border-red-200 dark:border-red-800/40 bg-red-50/60 dark:bg-red-900/10' : 'border-green-200 dark:border-green-800/40 bg-green-50/60 dark:bg-green-900/10'}`}>
              <div className="text-[10px] font-bold text-gray-500">صافي الربح/الخسارة{summary.marginPct != null ? ` · الهامش ${summary.marginPct}%` : ''}</div>
              <div className={`font-inter font-black text-sm ${summary.net < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}><span dir="ltr">{fmtSigned(summary.net)}</span> <span className="text-[10px] opacity-70">ر.س</span></div>
            </div>
            <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50/60 dark:bg-slate-900/40 px-3 py-2 flex flex-wrap items-center gap-1.5 text-[10px] font-bold">
              <button type="button" onClick={() => setProfit('profit')} className="px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400" title="عرض الرابحة فقط">رابحة {summary.profitCount}</button>
              <button type="button" onClick={() => setProfit('loss')} className="px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400" title="عرض الخاسرة فقط">خاسرة {summary.lossCount}</button>
              <button type="button" onClick={() => setProfit('break_even')} className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400" title="عرض المتعادلة فقط">متعادلة {summary.breakEvenCount}</button>
              <button type="button" onClick={() => setProfit('no_cost')} className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-slate-800 text-gray-500" title="فواتير بدون تكلفة DHL — لا يمكن حساب ربحها">بدون تكلفة {summary.noCostCount}</button>
            </div>
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
              <table className="w-full text-right border-collapse" style={{ minWidth: 1200 }}>
                <thead>
                  <tr className="bg-gray-50 dark:bg-slate-900/60 border-b border-gray-200 dark:border-slate-700">
                    {['الفاتورة', 'العميل', 'المسؤول', 'الجوال', 'الناقل', 'التفاصيل', 'تكلفة الناقل الأصلية', 'المبلغ', 'المدفوع', 'المتبقي', 'الربح', 'الحالة', 'التاريخ', 'إجراءات'].map((h) => (
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
                          <button
                            type="button"
                            onClick={() => openClientProfile(inv.client || '', (inv as any).client_id)}
                            className="font-bold text-sm text-gray-900 dark:text-white truncate max-w-[140px] text-right hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer"
                            title={`فتح بروفايل ${inv.client}`}
                          >
                            {inv.client || '—'}
                          </button>
                        </td>

                        <td className="px-3 py-3">
                          {inv.assigned_employee_name ? (
                            <div className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 px-2 py-1 rounded-lg border border-indigo-100 dark:border-indigo-800/30">
                              <User size={10} />
                              {inv.assigned_employee_name}
                            </div>
                          ) : (
                            <span className="text-[10px] text-gray-300 dark:text-slate-600">—</span>
                          )}
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

                        <td className="px-3 py-3 whitespace-nowrap" data-testid="invoice-carrier-cost">
                          {carrierCostOf(inv.dhl_cost ?? inv.dhlCost) !== null ? (
                            <span className="font-inter font-bold text-xs text-orange-600 dark:text-orange-400">
                              {carrierCostOf(inv.dhl_cost ?? inv.dhlCost)!.toFixed(2)} <span className="text-[10px] text-gray-400">ر.س</span>
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-gray-300 dark:text-slate-600">{NO_CARRIER_COST_LABEL}</span>
                          )}
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

                        <td className="px-3 py-3"><ProfitBadge inv={inv} /></td>

                        <td className="px-3 py-3">{statusBadge(inv)}</td>

                        <td className="px-3 py-3 text-xs text-gray-500 dark:text-gray-400 font-inter whitespace-nowrap">
                          {displayDate(inv.date)}
                        </td>

                        <td className="px-3 py-3">
                          <div className="flex items-center gap-0.5">
                            <ActionBtn icon={Eye} label="عرض" onClick={() => handleView(String(inv.id))} color="blue" />
                            <ActionBtn icon={Edit3} label="تعديل" onClick={() => handleEdit(String(inv.id))} color="yellow" />
                            {invoiceTemplate && (
                              <ActionBtn icon={Download} label="تحميل PDF" onClick={() => downloadInvoicePDF(inv, invoiceTemplate)} color="red" />
                            )}
                            <ActionBtn icon={ListTodo} label="إرسال مهمة" onClick={() => handleOpenTaskModal(inv)} color="gray" />
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
                      <button
                        type="button"
                        onClick={() => openClientProfile(inv.client || '', (inv as any).client_id)}
                        className="font-bold text-sm text-gray-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors text-right cursor-pointer"
                        title={`فتح بروفايل ${inv.client}`}
                      >
                        {inv.client || '—'}
                      </button>
                      <div className="text-[11px] text-gray-500 dark:text-gray-400 font-inter mt-0.5">
                        #{inv.invoice_number || inv.daftra_id || inv.id} · {displayDate(inv.date)}
                        {inv.awb && <span className="text-blue-500 mr-1">· AWB: {inv.awb}</span>}
                      </div>
                      {inv.assigned_employee_name && (
                        <div className="flex items-center gap-1 text-[9px] font-bold text-indigo-600 dark:text-indigo-400 mt-1">
                          <User size={10} />
                          المسؤول: {inv.assigned_employee_name}
                        </div>
                      )}
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

                  <div className="flex flex-wrap items-center gap-1.5 mb-3 text-[10px]">
                    <span className="text-gray-400 font-bold">تكلفة الناقل الأصلية:</span>
                    <span className={`font-inter font-bold ${carrierCostOf(inv.dhl_cost ?? inv.dhlCost) !== null ? 'text-orange-600 dark:text-orange-400' : 'text-gray-300 dark:text-slate-600'}`} data-testid="invoice-card-carrier-cost">{carrierCostLabel(inv.dhl_cost ?? inv.dhlCost)}</span>
                    <span className="text-gray-400 font-bold">الربح:</span> <ProfitBadge inv={inv} />
                    <span className="bg-gray-100 dark:bg-slate-700 px-2 py-0.5 rounded font-bold text-gray-600 dark:text-gray-300">{displayValue(inv.carrier)}</span>
                    <span className="bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded font-bold text-blue-600 dark:text-blue-400 truncate max-w-[120px]">{readItemLabel(inv)}</span>
                    {inv.phone && <span className="bg-gray-100 dark:bg-slate-700 px-2 py-0.5 rounded font-inter text-gray-500 dark:text-gray-400" dir="ltr">{inv.phone}</span>}
                  </div>

                  <div className="flex items-center gap-1 pt-2 border-t border-gray-100 dark:border-slate-700">
                    <ActionBtn icon={Eye} label="عرض" onClick={() => handleView(String(inv.id))} color="blue" />
                    <ActionBtn icon={Edit3} label="تعديل" onClick={() => handleEdit(String(inv.id))} color="yellow" />
                    <ActionBtn icon={ListTodo} label="إرسال مهمة" onClick={() => handleOpenTaskModal(inv)} color="gray" />
                    <ActionBtn icon={Plus} label="إضافة بند" onClick={() => handleAddItem(String(inv.id))} color="green" />
                    {invoiceTemplate && (
                      <ActionBtn icon={Download} label="تحميل PDF" onClick={() => downloadInvoicePDF(inv, invoiceTemplate)} color="red" />
                    )}
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
      <ExportDialog
        open={exportFormat !== null}
        onClose={() => setExportFormat(null)}
        title="تصدير الفواتير"
        endpoint="/invoices/export"
        initialFormat={exportFormat ?? 'xlsx'}
        params={exportParams}
        filterLabels={exportFilterLabels}
        dateFieldNote="حسب تاريخ الفاتورة"
        fileBase="invoices"
        currentRange={currentRange}
        defaultPreset="current"
        rowNoun="فاتورة"
      />
      <InvoiceWizardModal
        key={wizardKey}
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onSave={onWizardSave}
        title={wizardTitle}
        initialDraft={wizardInitialDraft}
        initialStep={wizardInitialDraft ? 2 : undefined}
        saving={mutating}
        editingInvoiceId={editingInvoiceId ?? undefined}
      />

      <InvoiceViewModal
        open={Boolean(viewInvoiceId)}
        invoice={findInvoice(viewInvoiceId)}
        onClose={closeInvoiceView}
        onAddItem={() => { if (viewInvoiceId) { setAddItemInvoiceId(viewInvoiceId); closeInvoiceView() } }}
        onEdit={() => { if (viewInvoiceId) { handleEdit(viewInvoiceId); closeInvoiceView() } }}
        onCollect={() => { if (viewInvoiceId) { handleCollect(viewInvoiceId); closeInvoiceView() } }}
        onDelete={() => { if (viewInvoiceId) { handleDelete(viewInvoiceId); closeInvoiceView() } }}
        onRefresh={() => syncFromDb(false)}
      />

      <InvoiceAddItemModal
        open={Boolean(addItemInvoiceId)}
        invoice={findInvoice(addItemInvoiceId)}
        onClose={() => setAddItemInvoiceId(null)}
        saving={mutating}
        onSave={(next: Invoice) => {
          if (mutating || !addItemInvoiceId) return
          void (async () => {
            setMutating(true)
            try {
              await invoiceService.updateInvoice(addItemInvoiceId, next)
              console.log(`[Invoices] ✅ Added/updated items for #${addItemInvoiceId}`)
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
      {/* Task Modal / Chat */}
      {taskModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={() => setTaskModalOpen(false)}>
          <div className="w-full max-w-2xl bg-white dark:bg-slate-800 rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 border border-gray-100 dark:border-slate-700 flex flex-col h-[80vh]" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-700/50 flex items-center justify-between bg-white dark:bg-slate-800 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-50 dark:bg-indigo-500/10 rounded-xl text-indigo-600 dark:text-indigo-400">
                  <ListTodo size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-white">المهام والمراسلات</h3>
                  <p className="text-[10px] text-gray-500 font-bold">فاتورة #{taskInvoice?.invoice_number || taskInvoice?.daftra_id || taskInvoice?.id}</p>
                </div>
              </div>
              <button onClick={() => setTaskModalOpen(false)} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full transition-all">
                <X size={20} />
              </button>
            </div>

            {/* Chat History */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50/50 dark:bg-slate-900/50">
              {taskLoading && taskHistory.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400">
                  <RefreshCw size={24} className="animate-spin mb-2" />
                  <p className="text-xs font-bold">جاري تحميل المراسلات...</p>
                </div>
              ) : taskHistory.length > 0 ? (
                taskHistory.map((msg, idx) => {
                  const isMe = String(msg.data?.senderId) === String(user?.id);
                  const sName = msg.sender_name || 'موظف';
                  const rName = msg.recipient_name || 'موظف';

                  return (
                    <div key={msg.id || idx} className={`flex flex-col ${isMe ? 'items-start' : 'items-end'} animate-in fade-in slide-in-from-bottom-2 mb-4`}>
                      <div className="flex items-center gap-2 mb-1 px-1">
                        <span className="text-[11px] font-bold text-gray-700 dark:text-gray-300">
                          {sName}
                        </span>
                        <span className="text-[9px] text-gray-400 font-medium">
                          • {timeAgo(msg.created_at)}
                        </span>
                      </div>
                      
                      <div className={`max-w-[90%] rounded-2xl px-4 py-3 shadow-md ${
                        isMe 
                          ? 'bg-white dark:bg-slate-800 border border-indigo-100 dark:border-indigo-900/30 text-gray-900 dark:text-white rounded-tr-none' 
                          : 'bg-indigo-600 text-white rounded-tl-none'
                      }`}>
                        <p className="text-sm leading-relaxed whitespace-pre-wrap font-medium">{msg.message}</p>
                      </div>

                      <div className={`mt-2 flex ${isMe ? 'justify-start' : 'justify-end'}`}>
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-full border border-indigo-100 dark:border-indigo-800/30 text-[10px] font-bold shadow-sm hover:scale-105 transition-transform cursor-default">
                          <User size={10} />
                          موجه إلى: {rName}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 opacity-50">
                  <MessageSquare size={48} className="mb-4" />
                  <p className="text-sm font-bold">لا توجد مراسلات سابقة لهذه الفاتورة</p>
                  <p className="text-xs mt-1">ابدأ بإرسال أول مهمة أو استفسار</p>
                </div>
              )}
            </div>

            {/* Reply / Send Form */}
            <div className="p-6 border-t border-gray-100 dark:border-slate-700/50 bg-white dark:bg-slate-800 shrink-0">
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex-1 space-y-1.5">
                    <label className="text-[11px] font-bold text-gray-500 dark:text-gray-400 flex items-center gap-1.5 mr-1">
                      <User size={14} className="text-indigo-500" /> توجيه إلى
                    </label>
                    <select
                      value={taskRecipientId}
                      onChange={(e) => setTaskRecipientId(e.target.value)}
                      className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all font-bold"
                      disabled={taskLoading}
                    >
                      <option value="">-- اختر الموظف --</option>
                      {usersList.map((u) => (
                        <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex-1 space-y-1.5">
                    <label className="text-[11px] font-bold text-gray-500 dark:text-gray-400 flex items-center gap-1.5 mr-1">
                      <CheckCircle2 size={14} className="text-green-500" /> الموظف المسؤول
                    </label>
                    <select
                      value={taskResponsibleId}
                      onChange={(e) => handleAssignResponsible(e.target.value)}
                      className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all font-bold"
                      disabled={taskLoading}
                    >
                      <option value="">-- غير محدد --</option>
                      {usersList.map((u) => (
                        <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="relative">
                  <textarea
                    value={taskNotes}
                    onChange={(e) => setTaskNotes(e.target.value)}
                    placeholder="اكتب ردك أو تفاصيل المهمة هنا..."
                    className="w-full h-24 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none transition-all placeholder:text-gray-400"
                    disabled={taskLoading}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && e.ctrlKey) {
                        void handleSendTask();
                      }
                    }}
                  />
                  <div className="absolute left-3 bottom-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSendTask}
                      disabled={taskLoading || !taskRecipientId || !taskNotes.trim()}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-xl text-xs font-bold shadow-lg shadow-indigo-500/20 transition-all disabled:opacity-50 disabled:grayscale flex items-center gap-2"
                    >
                      {taskLoading ? 'جاري الإرسال...' : 'إرسال'}
                    </button>
                  </div>
                </div>
                <p className="text-[10px] text-gray-400 text-center font-medium">Ctrl + Enter للإرسال السريع</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Client Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
          <div 
            className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200"
            dir="rtl"
          >
            {showSuccess ? (
              <div className="p-12 flex flex-col items-center justify-center text-center space-y-4 animate-in zoom-in-95 duration-200">
                <div className="w-20 h-20 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-500 rounded-full flex items-center justify-center animate-bounce shadow-lg shadow-emerald-500/20">
                  <CheckCircle2 size={48} className="stroke-[3]" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-gray-900 dark:text-white">تم تسجيل العميل بنجاح!</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-bold mt-1.5">تم إنشاء ملف تعريف العميل وحفظ بياناته في النظام.</p>
                </div>
              </div>
            ) : (
              <>
                {/* Modal Header */}
                <div className="p-5 border-b border-gray-100 dark:border-slate-700/50 flex justify-between items-center bg-gray-50/50 dark:bg-slate-900/10">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 rounded-xl">
                      <UserPlus size={20} />
                    </div>
                    <div>
                      <h3 className="font-black text-base text-gray-900 dark:text-white">إضافة عميل جديد</h3>
                      <p className="text-[10px] text-gray-400 font-bold mt-0.5">أدخل بيانات العميل لإنشاء ملف تعريفي خاص به</p>
                    </div>
                  </div>
                  <button 
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-700 transition-all"
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Modal Body / Form */}
                <form onSubmit={handleAddClientSubmit}>
                  <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
                    {addError && (
                      <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/30 text-red-600 dark:text-red-400 px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2">
                        <AlertCircle size={16} className="shrink-0" />
                        <span>{addError}</span>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Name Input */}
                      <div className="flex flex-col gap-1.5 md:col-span-2">
                        <label className="text-xs font-bold text-gray-500 dark:text-gray-400">الاسم الكامل *</label>
                        <div className="relative">
                          <Users size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                          <input 
                            required
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="مثال: أحمد محمد علي"
                            className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl py-2.5 pr-10 pl-4 text-sm font-bold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all"
                          />
                        </div>
                      </div>

                      {/* Phone Input */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-gray-500 dark:text-gray-400">رقم الجوال</label>
                        <div className="relative">
                          <Phone size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                          <input 
                            type="text"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            placeholder="05xxxxxxxx"
                            dir="ltr"
                            className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl py-2.5 pr-10 pl-4 text-sm font-bold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all font-mono text-right"
                          />
                        </div>
                      </div>

                      {/* Email Input */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-gray-500 dark:text-gray-400">البريد الإلكتروني</label>
                        <div className="relative">
                          <Mail size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                          <input 
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="customer@example.com"
                            dir="ltr"
                            className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl py-2.5 pr-10 pl-4 text-sm font-bold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all text-right"
                          />
                        </div>
                      </div>

                      {/* Company Input */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-gray-500 dark:text-gray-400">اسم الشركة</label>
                        <div className="relative">
                          <Building2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                          <input 
                            type="text"
                            value={company}
                            onChange={(e) => setCompany(e.target.value)}
                            placeholder="مؤسسة الشحن للمقاولات"
                            className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl py-2.5 pr-10 pl-4 text-sm font-bold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all"
                          />
                        </div>
                      </div>

                      {/* City Input */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-gray-500 dark:text-gray-400">المدينة</label>
                        <div className="relative">
                          <MapPin size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                          <input 
                            type="text"
                            value={city}
                            onChange={(e) => setCity(e.target.value)}
                            placeholder="الرياض / جدة..."
                            className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl py-2.5 pr-10 pl-4 text-sm font-bold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all"
                          />
                        </div>
                      </div>

                      {/* Address Input */}
                      <div className="flex flex-col gap-1.5 md:col-span-2">
                        <label className="text-xs font-bold text-gray-500 dark:text-gray-400">العنوان بالتفصيل</label>
                        <div className="relative">
                          <MapPin size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                          <input 
                            type="text"
                            value={address}
                            onChange={(e) => setAddress(e.target.value)}
                            placeholder="الرمز البريدي، اسم الشارع، رقم البناية"
                            className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl py-2.5 pr-10 pl-4 text-sm font-bold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all"
                          />
                        </div>
                      </div>

                      {/* Tax Number Input */}
                      <div className="flex flex-col gap-1.5 md:col-span-2">
                        <label className="text-xs font-bold text-gray-500 dark:text-gray-400">الرقم الضريبي (إن وجد)</label>
                        <div className="relative">
                          <FileText size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                          <input 
                            type="text"
                            value={taxNumber}
                            onChange={(e) => setTaxNumber(e.target.value)}
                            placeholder="3xxxxxxxxxxxxxx"
                            className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl py-2.5 pr-10 pl-4 text-sm font-bold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all font-mono"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Modal Footer */}
                  <div className="p-5 border-t border-gray-100 dark:border-slate-700/50 bg-gray-50/50 dark:bg-slate-900/10 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowAddModal(false)}
                      className="px-5 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 text-sm font-bold text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
                    >
                      إلغاء
                    </button>
                    <button
                      type="submit"
                      disabled={adding}
                      className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-bold text-sm shadow-lg shadow-emerald-500/20 active:scale-95 disabled:opacity-50 transition-all"
                    >
                      {adding ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
                      <span>حفظ وإضافة</span>
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}

    </div>
  )
}
