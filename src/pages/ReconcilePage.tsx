import { useMemo, useState, useRef, useCallback, useEffect } from 'react'
import { invoiceService } from '../services/invoiceService'
import { reconcileApiService } from '../services/reconcileService'
import { parseCsv } from '../utils/csv'
import { formatCurrency } from '../utils/reconcile'
import { extractSheetShipments, fileSha256, type SkippedRow } from '../utils/reconcileSheet'
import { describeApiError, isConflict } from '../utils/apiErrors'
import type { DuplicateRef } from '../services/reconcileService'
import {
  UploadCloud, FileSpreadsheet, RefreshCw, CheckCircle2,
  AlertTriangle, AlertCircle, Search, Loader2, X,
  FileText, ArrowRightLeft, Zap, FileUp,
  Download, Edit3, Eye, ListTodo, User, MessageSquare
} from 'lucide-react'
import { useAuthStore } from '../hooks/useAuthStore'
import { toast } from 'react-hot-toast'
import { CarrierCostCell } from '../components/Reconcile/CarrierCostCell'
import { formatSar } from '../utils/carrierCost'

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

/** Convert Arabic-Indic digits to Western digits */
function toEn(val: any): string {
  return String(val ?? '').replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
}

/* ═══════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════ */
type TabMode = 'dhl-ai' | 'csv-platform'
type DetailState = { open: boolean; awb: string | null }
type DhlJobState = {
  jobId: string | null
  status: 'idle' | 'uploading' | 'processing' | 'done' | 'error'
  step: string
  progress: number
  error: string | null
  result: any | null
  totalTime: number | string | null
}

/* ═══════════════════════════════════════════════════════
   Badge helpers
   ═══════════════════════════════════════════════════════ */
function statusBadge(status: string) {
  const map: Record<string, { bg: string; text: string; border: string; icon: any; label: string }> = {
    matched: { bg: 'bg-green-50 dark:bg-green-900/20', text: 'text-green-600 dark:text-green-400', border: 'border-green-200 dark:border-green-800/30', icon: CheckCircle2, label: 'متطابق' },
    discrepancy: { bg: 'bg-yellow-50 dark:bg-yellow-900/20', text: 'text-yellow-600 dark:text-yellow-500', border: 'border-yellow-200 dark:border-yellow-800/20', icon: AlertTriangle, label: 'فروقات' },
    needs_review: { bg: 'bg-orange-50 dark:bg-orange-900/20', text: 'text-orange-600 dark:text-orange-400', border: 'border-orange-200 dark:border-orange-800/30', icon: AlertTriangle, label: 'يحتاج مراجعة' },
    not_found_in_platform: { bg: 'bg-red-50 dark:bg-red-900/20', text: 'text-red-600 dark:text-red-400', border: 'border-red-200 dark:border-red-800/30', icon: AlertCircle, label: 'غير موجود بالمنصة' },
    not_found_in_daftra: { bg: 'bg-red-50 dark:bg-red-900/20', text: 'text-red-600 dark:text-red-400', border: 'border-red-200 dark:border-red-800/30', icon: AlertCircle, label: 'غير موجود بدفترة' },
    daftra_error: { bg: 'bg-red-50 dark:bg-red-900/20', text: 'text-red-600 dark:text-red-400', border: 'border-red-200 dark:border-red-800/30', icon: AlertCircle, label: 'خطأ دفترة' },
  }
  const v = map[status] ?? { bg: 'bg-gray-50 dark:bg-slate-900', text: 'text-gray-500', border: 'border-gray-200 dark:border-slate-700', icon: FileText, label: status }
  const Icon = v.icon
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border ${v.bg} ${v.text} ${v.border} whitespace-nowrap`}>
      <Icon size={12} strokeWidth={3} /> {v.label}
    </span>
  )
}

function paymentBadge(ps: string | null | undefined) {
  if (!ps) return <span className="text-gray-400 font-bold">—</span>
  if (ps === 'مدفوع') return <span className="text-green-600 dark:text-green-400 font-bold text-xs flex items-center gap-1"><CheckCircle2 size={12} /> مدفوع</span>
  if (ps === 'غير مدفوع') return <span className="text-red-600 dark:text-red-400 font-bold text-xs flex items-center gap-1"><AlertCircle size={12} /> غير مدفوع</span>
  if (ps === 'مرتجعة') return <span className="text-purple-600 dark:text-purple-400 font-bold text-xs">مرتجعة</span>
  if (ps === 'مدفوع جزئياً') return <span className="text-yellow-600 dark:text-yellow-500 font-bold text-xs flex items-center gap-1"><AlertTriangle size={12} /> جزئي</span>
  return <span className="text-gray-400 text-xs font-bold">{ps}</span>
}

/* ═══════════════════════════════════════════════════════
   CSV helpers
   ═══════════════════════════════════════════════════════ */
const REVIEW_TEXT: Record<string, string> = {
  shipper_reference: 'مطابقة عبر مرجع الشاحن مع رقم فاتورة داخلي — تحتاج تأكيدًا',
  daftra_only: 'الفاتورة موجودة في دفترة فقط وغير مسجلة في المنصة',
  multiple_clients: 'البوليصة مرتبطة بفواتير لأكثر من عميل',
}
const MATCH_TEXT: Record<string, string> = {
  awb: 'رقم البوليصة في الفاتورة', details: 'رقم البوليصة في وصف الفاتورة', shipper_reference: 'مرجع الشاحن', daftra: 'دفترة',
}

/** Rows as cell values (amounts/dates) and as displayed text (identifiers keep leading zeros). */
async function readRowsFromFile(file: File): Promise<{ raw: Record<string, unknown>[]; text: Record<string, unknown>[] }> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'csv') {
    const rows = parseCsv(await file.text()) as unknown as Record<string, unknown>[]
    return { raw: rows, text: rows }
  }
  if (ext === 'xlsx' || ext === 'xls') {
    const XLSX = await import('xlsx')
    let wb
    try { wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true }) } catch { throw new Error('الملف تالف أو ليس ملف Excel صالحًا') }
    let sn = wb.SheetNames[0]
    for (const n of wb.SheetNames) if (/dhl|ship|invoice|شحن|فاتور/i.test(n)) { sn = n; break }
    const sheet = wb.Sheets[sn]
    return {
      raw: XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, unknown>[],
      text: XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false }) as Record<string, unknown>[],
    }
  }
  throw new Error('نوع الملف غير مدعوم — المسموح: .xlsx ، .xls ، .csv')
}

function filterRows(report: any, filter: string): any[] {
  const all: any[] = report?.results || []
  if (filter === 'all') return all
  if (filter === 'not_found') return all.filter((r) => r.status === 'not_found_in_daftra' || r.status === 'daftra_error' || r.status === 'not_found_in_platform')
  return all.filter((r) => r.status === filter)
}

/* ═══════════════════════════════════════════════════════
   Stat cards
   ═══════════════════════════════════════════════════════ */
const StatCard = ({ value, label, colorClass, highlight }: any) => (
  <div className={`bg-white dark:bg-slate-800 rounded-2xl p-4 border shadow-sm flex flex-col items-center text-center justify-center gap-1 ${highlight ? 'border-indigo-500 dark:border-indigo-500/40' : 'border-gray-200 dark:border-slate-700'}`}>
    <div className={`text-2xl lg:text-3xl font-black ${colorClass}`}>{value}</div>
    <div className="text-sm font-bold text-gray-500 dark:text-gray-400">{label}</div>
  </div>
)

const FinCard = ({ value, label, colorClass, highlight }: any) => (
  <div className={`bg-white dark:bg-slate-800 rounded-2xl p-5 border shadow-sm flex flex-col justify-center gap-1.5 ${highlight ? 'border-indigo-500 dark:border-indigo-500/40 bg-indigo-50/50 dark:bg-indigo-900/10' : 'border-gray-200 dark:border-slate-700'}`}>
    <div className="text-sm font-bold text-gray-500 dark:text-gray-400">{label}</div>
    <div className={`text-xl font-bold ${colorClass}`}>{toEn(value)}</div>
  </div>
)

/* ═══════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════ */
export function ReconcilePage() {
  const [tab, setTab] = useState<TabMode>('dhl-ai')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)

  // CSV state
  const [csvReport, setCsvReport] = useState<any | null>(null)
  const [csvBusy, setCsvBusy] = useState(false)
  const [csvFilter, setCsvFilter] = useState('all')
  const [csvSkipped, setCsvSkipped] = useState<SkippedRow[]>([])
  // Same file uploaded before → offer the stored report or a re-analysis.
  const [duplicate, setDuplicate] = useState<{ tab: TabMode; previous: DuplicateRef } | null>(null)
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [csvDetail, setCsvDetail] = useState<DetailState>({ open: false, awb: null })

  // DHL AI state
  const [dhlJob, setDhlJob] = useState<DhlJobState>({ jobId: null, status: 'idle', step: '', progress: 0, error: null, result: null, totalTime: null })
  const [dhlFilter, setDhlFilter] = useState('all')
  const [dhlDetail, setDhlDetail] = useState<DetailState>({ open: false, awb: null })
  
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startTimeRef = useRef(0)

  // ✓ / ✕ on the DHL carrier cost: per-AWB request in flight (a ref blocks a
  // second click before React re-renders the disabled buttons).
  const [costBusy, setCostBusy] = useState<Record<string, 'apply' | 'reject'>>({})
  const costBusyRef = useRef(new Set<string>())

  // Edit modal
  const [editModal, setEditModal] = useState<{ open: boolean; awb: string | null }>({ open: false, awb: null })
  const [editFields, setEditFields] = useState({ client: '', weight: '', daftraTotal: '' })

  // Task Modal State
  const [taskModalOpen, setTaskModalOpen] = useState(false)
  const [taskInvoice, setTaskInvoice] = useState<any>(null)
  const [usersList, setUsersList] = useState<{id: number, full_name: string, role: string}[]>([])
  const [taskRecipientId, setTaskRecipientId] = useState('')
  const [taskResponsibleId, setTaskResponsibleId] = useState('')
  const [taskNotes, setTaskNotes] = useState('')
  const [taskLoading, setTaskLoading] = useState(false)
  const [taskHistory, setTaskHistory] = useState<any[]>([])

  const user = useAuthStore((s) => s.user)

  // ── History Modal ──
  const [historyModalOpen, setHistoryModalOpen] = useState(false)
  const [historyList, setHistoryList] = useState<any[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  const loadHistory = async () => {
    setHistoryLoading(true)
    try {
      const data = await reconcileApiService.getHistory(50, 0)
      setHistoryList(data)
      // Also load users list for the client assignment dropdown
      if (usersList.length === 0) {
        try {
          const { api } = await import('../utils/apiClient')
          const uRes = await api.get('/users/list')
          setUsersList(Array.isArray(uRes) ? uRes : uRes.data || [])
        } catch {}
      }
    } catch (e) {
      console.error(e)
    } finally {
      setHistoryLoading(false)
    }
  }

  const handleOpenTaskModal = async (platData: any) => {
    if (!platData || (!platData.id && !platData.invoice_id)) {
      window.alert('لا يوجد معرف للفاتورة في قاعدة البيانات');
      return;
    }
    const invId = platData.invoice_id || platData.id;
    setTaskModalOpen(true)
    setTaskNotes('')
    setTaskRecipientId('')
    setTaskLoading(true)
    try {
      const dbInvoice = await invoiceService.getInvoice(invId);
      setTaskInvoice(dbInvoice);
      setTaskResponsibleId(dbInvoice.assigned_to ? String(dbInvoice.assigned_to) : '');

      const { api } = await import('../utils/apiClient')
      const [uRes, hRes] = await Promise.all([
        api.get('/users/list'),
        api.get(`/notifications/invoice/${invId}`)
      ]);
      setUsersList(Array.isArray(uRes) ? uRes : uRes.data || [])
      setTaskHistory(Array.isArray(hRes) ? hRes : hRes.data || [])
    } catch (e: any) {
      console.error('[Reconcile] Failed to load task data', e)
    } finally {
      setTaskLoading(false)
    }
  }

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
    } catch (err: any) {
      console.error('[Reconcile] Send task failed', err)
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
    } catch (err: any) {
      console.error('[Reconcile] Assign responsible failed', err)
    }
  }

  useEffect(() => {
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current)
    }
  }, [])

  /* ─── DHL AI: Submit & Poll ─── */
  const submitDhlInvoice = useCallback(async (force = false) => {
    if (!file) return
    setError(null)
    setDuplicate(null)
    startTimeRef.current = Date.now()
    setDhlJob({ jobId: null, status: 'uploading', step: 'uploading', progress: 5, error: null, result: null, totalTime: null })
    try {
      const res = await reconcileApiService.submitDhlInvoice(file, force)
      if (res.duplicate_of) {
        setDuplicate({ tab: 'dhl-ai', previous: res.duplicate_of })
        setDhlJob({ jobId: null, status: 'idle', step: '', progress: 0, error: null, result: null, totalTime: null })
        return
      }
      const jobId = res.job_id!
      setDhlJob(p => ({ ...p, jobId, status: 'processing', step: 'parsing', progress: 10 }))
      pollDhlStatus(jobId)
    } catch (e: any) {
      setDhlJob(p => ({ ...p, status: 'error', error: describeApiError(e, 'فشل رفع الملف') }))
    }
  }, [file])

  const pollDhlStatus = useCallback(async (jobId: string) => {
    if (pollRef.current) clearTimeout(pollRef.current)
    try {
      const data = await reconcileApiService.getJobStatus(jobId)
      if (data.status === 'done') {
        setDhlJob({ jobId, status: 'done', step: 'complete', progress: 100, error: null, result: data.result, totalTime: parseFloat(((Date.now() - startTimeRef.current) / 1000).toFixed(1)) })
        return
      }
      if (data.status === 'error') {
        setDhlJob(p => ({ ...p, status: 'error', error: data.error || 'خطأ', step: data.step || '' }))
        return
      }
      setDhlJob(p => ({ ...p, status: 'processing', step: data.step || p.step, progress: data.progress || p.progress }))
      const elapsed = Date.now() - startTimeRef.current
      const next = elapsed < 3000 ? 600 : elapsed < 10000 ? 1500 : 2500
      pollRef.current = setTimeout(() => pollDhlStatus(jobId), next)
    } catch {
      pollRef.current = setTimeout(() => pollDhlStatus(jobId), 3000)
    }
  }, [])

  /* ─── CSV: Analyze (rows read here, matched on the server) ─── */
  const analyzeCsv = async (force = false) => {
    if (!file || csvBusy) return
    setCsvBusy(true); setError(null); setDuplicate(null)
    try {
      const { raw, text } = await readRowsFromFile(file)
      const { shipments, skipped } = extractSheetShipments(raw, text)
      setCsvSkipped(skipped)
      if (!shipments.length) throw new Error('لا توجد صفوف صالحة في الملف')
      const res = await reconcileApiService.matchSheet({ filename: file.name, file_hash: await fileSha256(file), force, shipments })
      if (res?.duplicate_of) { setDuplicate({ tab: 'csv-platform', previous: res.duplicate_of }); return }
      setCsvReport(res)
      setCsvFilter('all')
    } catch (e: any) { setError(describeApiError(e, 'تعذّر تحليل الملف')); setCsvReport(null) }
    finally { setCsvBusy(false) }
  }

  /** Open a stored report (history / duplicate upload) in the current tab. */
  const openStoredReport = async (id: number, targetTab: TabMode) => {
    try {
      const rec = await reconcileApiService.getResult(id)
      const details = typeof rec.details === 'string' ? JSON.parse(rec.details) : rec.details
      if (!details?.results) { setError('لا توجد تفاصيل محفوظة لهذه المطابقة'); return }
      const report = { ...details, history_id: rec.id, updated_at: rec.updated_at }
      setDuplicate(null)
      if (targetTab === 'csv-platform') { setTab('csv-platform'); setCsvReport(report); setCsvFilter('all') }
      else { setTab('dhl-ai'); setDhlJob({ jobId: 'history-' + rec.id, status: 'done', step: 'complete', progress: 100, error: null, result: report, totalTime: 'سجل محفوظ' }); setDhlFilter('all') }
    } catch (e) { setError(describeApiError(e, 'تعذّر فتح التقرير المحفوظ')) }
  }

  const activeReport = tab === 'dhl-ai' ? dhlJob.result : csvReport
  const setActiveReport = (report: any) => {
    if (tab === 'dhl-ai') setDhlJob(prev => ({ ...prev, result: report }))
    else setCsvReport(report)
  }

  /* ─── Export (stored report, current filter) ─── */
  const exportDhlExcel = async () => {
    const rpt = activeReport
    if (!rpt?.history_id || exporting) return
    const filter = tab === 'dhl-ai' ? dhlFilter : csvFilter
    setExporting(true)
    try {
      const blob = await reconcileApiService.exportExcel(rpt.history_id, filter)
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `dhl_reconciliation_${rpt.history_id}_${filter}_${new Date().toISOString().slice(0, 10)}.xlsx`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
    } catch (e) { setError(describeApiError(e, 'فشل تصدير التقرير')) }
    finally { setExporting(false) }
  }

  /* ─── Manual correction (report only — never changes the invoice) ─── */
  const openEditModal = (awb: string) => {
    const r = activeReport?.results?.find((x: any) => x.airwaybill_number === awb)
    if (!r?.daftra_data) return
    const original = r.original ?? { summary_total: r.daftra_data.summary_total, client_name: r.daftra_data.client_name, weight: r.daftra_weight_kg }
    const m = r.manual_edit
    setEditFields({
      client: m?.client ?? original.client_name ?? '',
      weight: String(m?.weight ?? original.weight ?? ''),
      daftraTotal: String(m?.daftraTotal ?? original.summary_total ?? ''),
    })
    setEditError(null)
    setEditModal({ open: true, awb })
  }

  const saveEdit = async (clear = false) => {
    const rpt = activeReport
    if (!editModal.awb || !rpt?.history_id || editSaving) return
    const num = (v: string) => (v.trim() === '' ? null : Number(v))
    const edits = clear ? null : { client: editFields.client.trim() || null, weight: num(editFields.weight), daftraTotal: num(editFields.daftraTotal) }
    if (edits && ([edits.weight, edits.daftraTotal].some((v) => v !== null && (!Number.isFinite(v) || v < 0)))) {
      setEditError('أدخل أرقامًا صحيحة غير سالبة'); return
    }
    setEditSaving(true); setEditError(null)
    try {
      const updated = await reconcileApiService.updateHistory(rpt.history_id, editModal.awb, edits, rpt.updated_at)
      setActiveReport(updated)
      setEditModal({ open: false, awb: null })
    } catch (e) {
      setEditError(describeApiError(e, 'لم يتم حفظ التعديل'))
      if (isConflict(e)) {
        try {
          const rec = await reconcileApiService.getResult(rpt.history_id)
          const details = typeof rec.details === 'string' ? JSON.parse(rec.details) : rec.details
          setActiveReport({ ...details, history_id: rec.id, updated_at: rec.updated_at })
        } catch { /* keep the message */ }
      }
    } finally { setEditSaving(false) }
  }

  /* ─── DHL carrier cost: ✓ apply to the invoice / ✕ ignore ─── */
  const decideCarrierCost = async (awb: string, action: 'apply' | 'reject') => {
    const rpt = dhlJob.result
    if (!rpt?.history_id || costBusyRef.current.has(awb)) return
    costBusyRef.current.add(awb)
    setCostBusy((b) => ({ ...b, [awb]: action }))
    try {
      // The state changes only from the server's answer — never optimistically.
      const res = await reconcileApiService.decideCarrierCost(rpt.history_id, awb, action)
      if (res.report) setDhlJob((p) => (p.result?.history_id === rpt.history_id ? { ...p, result: res.report } : p))
      if (action === 'reject') {
        toast.success(`تم تجاهل تكلفة البوليصة ${awb} — لم تتغير الفاتورة`)
      } else if (!res.invoice_changed) {
        toast.success(`تكلفة الفاتورة ${res.invoice?.invoice_number ?? ''} مطابقة بالفعل لقيمة DHL — تم تسجيل الاعتماد`)
      } else {
        const inv = res.invoice
        const profit = inv?.profit_status === 'loss' ? ` — الفاتورة الآن خاسرة بقيمة ${formatSar(inv.loss)}`
          : inv?.profit_status === 'profit' ? ` — صافي الربح ${formatSar(inv.net)}`
          : inv?.profit_status === 'break_even' ? ' — الفاتورة متعادلة' : ''
        toast.success(`تم تحديث تكلفة الناقل للفاتورة ${inv?.invoice_number ?? ''} إلى ${formatSar(inv?.dhl_cost)}${profit}`, { duration: 6000 })
      }
    } catch (e) {
      toast.error(describeApiError(e, action === 'apply' ? 'تعذر اعتماد تكلفة الناقل — حاول مرة أخرى' : 'تعذر تجاهل القيمة — حاول مرة أخرى'))
      // Someone else decided meanwhile (409): show what the server has now.
      if (isConflict(e)) {
        try {
          const rec = await reconcileApiService.getResult(rpt.history_id)
          const details = typeof rec.details === 'string' ? JSON.parse(rec.details) : rec.details
          setDhlJob((p) => (p.result?.history_id === rpt.history_id ? { ...p, result: { ...details, history_id: rec.id, updated_at: rec.updated_at } } : p))
        } catch { /* keep the current table */ }
      }
    } finally {
      costBusyRef.current.delete(awb)
      setCostBusy((b) => { const n = { ...b }; delete n[awb]; return n })
    }
  }

  /* ─── Reset ─── */
  const resetAll = () => {
    if (pollRef.current) clearTimeout(pollRef.current)
    setFile(null); setError(null); setCsvReport(null); setCsvBusy(false)
    setDhlJob({ jobId: null, status: 'idle', step: '', progress: 0, error: null, result: null, totalTime: null })
    setDhlFilter('all'); setDhlDetail({ open: false, awb: null }); setCsvSkipped([]); setDuplicate(null)
  }

  /* ─── Derived ─── */
  const csvRows = useMemo(() => filterRows(csvReport, csvFilter), [csvFilter, csvReport])
  const dhlResults = useMemo(() => filterRows(dhlJob.result, dhlFilter), [dhlJob.result, dhlFilter])

  const csvSelectedDetail = useMemo(() => {
    if (!csvDetail.open || !csvDetail.awb || !csvReport) return null
    return (csvReport.results as any[]).find((r: any) => r.airwaybill_number === csvDetail.awb) ?? null
  }, [csvDetail, csvReport])

  const dhlSelectedDetail = useMemo(() => {
    if (!dhlDetail.open || !dhlDetail.awb || !dhlJob.result) return null
    return (dhlJob.result.results as any[]).find((r: any) => r.airwaybill_number === dhlDetail.awb) ?? null
  }, [dhlDetail, dhlJob.result])

  const stepsList = [
    { key: 'parsing', label: 'جاري قراءة الملف...' },
    { key: 'extracting', label: 'جاري استخراج الشحنات وتكلفة كل بوليصة (TOTAL CHARGE)...' },
    { key: 'daftra', label: 'جاري البحث في قاعدة البيانات...' },
    { key: 'comparing', label: 'جاري المقارنة والمطابقة...' },
  ]
  const stepMap: Record<string, number> = { uploading: 0, parsing: 0, extracting: 1, daftra: 2, comparing: 3, finalizing: 3 }

  /* ═══════════════════════════════════════════════════════
     Upload Zone (shared between tabs)
     ═══════════════════════════════════════════════════════ */
  const acceptTypes = tab === 'dhl-ai' ? '.pdf,.xlsx,.xls' : '.xlsx,.xls,.csv'
  const uploadLabel = tab === 'dhl-ai' ? 'ارفع فاتورة DHL (PDF أو Excel)' : 'ارفع ملف DHL (Excel أو CSV)'
  const uploadDesc = tab === 'dhl-ai'
    ? 'سيتم تحليل الملف بالذكاء الاصطناعي ومقارنته مع دفترة تلقائياً'
    : 'سيتم مقارنة الشحنات مع فواتير المنصة المخزنة'

  const UploadZone = () => (
    <div className="max-w-3xl mx-auto flex flex-col gap-4">
      <div
        className={`border-2 border-dashed rounded-3xl p-10 text-center cursor-pointer transition-all group flex flex-col items-center justify-center gap-4 min-h-[280px] ${
          file ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/10' : 'border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 hover:border-indigo-500'
        }`}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) setFile(f) }}
        onClick={() => document.getElementById('rec-file-input')?.click()}
      >
        <div className={`w-20 h-20 rounded-full flex items-center justify-center transition-all ${file ? 'bg-indigo-600 text-white shadow-lg scale-110' : 'bg-white dark:bg-slate-800 text-gray-400 group-hover:text-indigo-600'}`}>
          {file ? <FileUp size={40} /> : <UploadCloud size={40} />}
        </div>
        <div>
          <h3 className={`text-xl font-bold mb-1 ${file ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-900 dark:text-white'}`}>
            {file ? file.name : uploadLabel}
          </h3>
          <p className="text-sm text-gray-500 font-semibold">{uploadDesc}</p>
        </div>
        {tab === 'dhl-ai' ? (
          <div className="flex gap-2 mt-2">
            <span className="px-3 py-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-xs font-bold text-gray-500">PDF</span>
            <span className="px-3 py-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-xs font-bold text-gray-500">XLSX</span>
            <span className="px-3 py-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-xs font-bold text-gray-500">XLS</span>
          </div>
        ) : (
          <div className="flex gap-2 mt-2">
            <span className="px-3 py-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-xs font-bold text-gray-500">XLSX</span>
            <span className="px-3 py-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-xs font-bold text-gray-500">XLS</span>
            <span className="px-3 py-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-xs font-bold text-gray-500">CSV</span>
          </div>
        )}
        <input type="file" id="rec-file-input" accept={acceptTypes} className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) setFile(f) }} />
      </div>

      <div className="flex gap-3 justify-center" onClick={e => e.stopPropagation()}>
        <button
          className="flex-1 max-w-sm flex justify-center items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl font-bold shadow-lg shadow-indigo-500/20 transition-all disabled:opacity-50"
          onClick={() => (tab === 'dhl-ai' ? submitDhlInvoice() : analyzeCsv())}
          disabled={!file || csvBusy || dhlJob.status === 'uploading'}
        >
          {(csvBusy || dhlJob.status === 'uploading') ? <Loader2 className="animate-spin" size={20} /> : tab === 'dhl-ai' ? <Zap size={20} /> : <Search size={20} />}
          {tab === 'dhl-ai' ? 'بدء التحليل الذكي' : 'بدء المطابقة'}
        </button>
        {file && (
          <button className="p-3 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-400 hover:text-red-500 rounded-xl"
            onClick={() => setFile(null)}><X size={20} /></button>
        )}
      </div>

      {error && (
        <div role="alert" className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 text-red-600 p-4 rounded-xl text-sm font-bold flex items-start gap-3">
          <AlertCircle className="shrink-0 mt-0.5" size={18} /> <p>{error}</p>
        </div>
      )}

      {duplicate && duplicate.tab === tab && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/30 p-4 rounded-xl text-sm flex flex-col gap-3" data-testid="reconcile-duplicate">
          <p className="font-bold text-amber-800 dark:text-amber-200">
            هذا الملف نفسه رُفع سابقًا ({duplicate.previous.file_name} — {new Date(duplicate.previous.upload_date).toLocaleString('en-GB')}). لم يُنشأ سجل جديد.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold" onClick={() => openStoredReport(duplicate.previous.id, tab)}>فتح التقرير السابق</button>
            <button type="button" className="px-4 py-2 bg-white dark:bg-slate-800 border border-amber-300 text-amber-800 dark:text-amber-200 rounded-xl text-xs font-bold"
              onClick={() => { if (window.confirm('إعادة التحليل ستستبدل نتائج التقرير السابق وتعديلاته اليدوية بنتيجة جديدة لنفس السجل. متابعة؟')) { if (tab === 'dhl-ai') void submitDhlInvoice(true); else void analyzeCsv(true) } }}>
              إعادة التحليل وتحديث نفس السجل
            </button>
          </div>
        </div>
      )}
    </div>
  )

  /* ═══════════════════════════════════════════════════════
     DHL Processing Progress
     ═══════════════════════════════════════════════════════ */
  const DhlProgress = () => (
    <div className="max-w-lg mx-auto flex flex-col items-center justify-center min-h-[50vh] gap-6">
      <div className="w-16 h-16 border-4 border-gray-200 dark:border-slate-700 border-t-indigo-600 rounded-full animate-spin" />
      <div className="w-full flex flex-col gap-3">
        {stepsList.map((s, i) => {
          const activeIdx = stepMap[dhlJob.step] ?? 0
          const isDone = i < activeIdx
          const isActive = i === activeIdx
          return (
            <div key={s.key} className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
              isDone ? 'border-green-200 dark:border-green-800/30 bg-green-50/50 dark:bg-green-900/10 opacity-70'
              : isActive ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/10'
              : 'border-gray-200 dark:border-slate-700 opacity-40'
            }`}>
              <div className={`w-3 h-3 rounded-full ${isDone ? 'bg-green-500' : isActive ? 'bg-indigo-600 animate-pulse' : 'bg-gray-300 dark:bg-slate-600'}`} />
              <span className="text-sm font-bold">{s.label}</span>
              {isDone && <CheckCircle2 size={16} className="text-green-500 mr-auto" />}
            </div>
          )
        })}
      </div>
      <div className="w-full h-2 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
        <div className="h-full bg-indigo-600 rounded-full transition-all duration-500" style={{ width: `${Math.min(dhlJob.progress, 98)}%` }} />
      </div>
    </div>
  )

  /* ═══════════════════════════════════════════════════════
     Results Table (shared layout, different data)
     ═══════════════════════════════════════════════════════ */
  const ResultsView = ({ mode }: { mode: 'dhl' | 'csv' }) => {
    const rpt = mode === 'dhl' ? dhlJob.result : csvReport
    if (!rpt) return null

    const activeFilter = mode === 'dhl' ? dhlFilter : csvFilter
    const setActiveFilter = mode === 'dhl' ? setDhlFilter : setCsvFilter
    const tableRows = mode === 'dhl' ? dhlResults : csvRows
    const isDhl = mode === 'dhl'
    const platAmount = Number(rpt.total_daftra_amount ?? 0)
    const extraction = rpt.extraction
    const canEdit = Boolean(rpt.history_id)

    return (
      <div className="flex flex-col gap-6 animate-in slide-in-from-bottom-4 duration-500 motion-reduce:animate-none">
        {/* Speed + export */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold text-gray-500">{rpt.filename}</span>
            {isDhl && dhlJob.totalTime && (
              <span className="px-3 py-1 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/30 text-green-600 rounded-lg text-xs font-bold">
                ⚡ {typeof dhlJob.totalTime === 'number' ? `تم في ${dhlJob.totalTime} ثانية` : dhlJob.totalTime}
              </span>
            )}
          </div>
          {rpt.history_id && (
            <button className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 disabled:opacity-50"
              onClick={exportDhlExcel} disabled={exporting}>
              {exporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} تصدير Excel ({activeFilter === 'all' ? 'كل الشحنات' : 'الفلتر الحالي'})
            </button>
          )}
        </div>

        {error && (
          <div role="alert" className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 text-red-600 p-4 rounded-xl text-sm font-bold flex items-start gap-3">
            <AlertCircle className="shrink-0 mt-0.5" size={18} /> <p className="flex-1">{error}</p>
            <button type="button" onClick={() => setError(null)} aria-label="إغلاق"><X size={16} /></button>
          </div>
        )}
        {extraction && extraction.complete === false && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/30 text-amber-800 dark:text-amber-200 p-4 rounded-xl text-sm font-bold flex items-start gap-3">
            <AlertTriangle className="shrink-0 mt-0.5" size={18} />
            <p>
              الاستخراج غير مكتمل: الفاتورة تذكر {extraction.invoice_shipments ?? '؟'} شحنة بإجمالي {extraction.invoice_total != null ? formatCurrency(extraction.invoice_total) : '؟'}،
              وتم استخراج {extraction.extracted_shipments} شحنة بإجمالي {formatCurrency(extraction.extracted_total)}. راجع الملف قبل الاعتماد على النتائج.
            </p>
          </div>
        )}
        {isDhl && extraction?.verified_costs != null && (
          <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 p-3 rounded-xl text-xs font-bold text-gray-600 dark:text-gray-300 flex flex-wrap items-center gap-x-4 gap-y-1" data-testid="cost-extraction-summary">
            <span>فاتورة DHL: <span dir="ltr">{extraction.dhl_invoice_number || rpt.filename}</span></span>
            <span>تكلفة الناقل مستخرجة من سطر TOTAL CHARGE لكل بوليصة: {extraction.verified_costs} من {extraction.extracted_shipments}</span>
            {extraction.unverified_costs > 0 && <span className="text-amber-600">تعذر تحديد {extraction.unverified_costs}</span>}
            <span className="text-gray-400">لن تتغير أي فاتورة إلا بعد الضغط على ✓</span>
          </div>
        )}
        {!isDhl && csvSkipped.length > 0 && (
          <details className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/30 text-amber-800 dark:text-amber-200 p-4 rounded-xl text-sm">
            <summary className="font-bold cursor-pointer">تم تجاهل {csvSkipped.length} صف غير صالح من الملف — اضغط للتفاصيل</summary>
            <ul className="mt-2 space-y-1 text-xs">{csvSkipped.slice(0, 50).map((x) => <li key={x.row}>السطر {x.row}: {x.reason}</li>)}</ul>
          </details>
        )}

        {/* KPI */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard value={rpt.total_shipments} label="إجمالي الشحنات" colorClass="text-gray-900 dark:text-white" />
          <StatCard value={rpt.matched} label="متطابقة" colorClass="text-green-600 dark:text-green-400" />
          <StatCard value={rpt.with_discrepancies} label="فروقات" colorClass="text-yellow-600 dark:text-yellow-500" />
          <StatCard value={rpt.needs_review ?? 0} label="تحتاج مراجعة" colorClass="text-orange-600 dark:text-orange-400" />
          <StatCard value={rpt.not_found} label="غير موجودة بالمنصة" colorClass="text-red-600 dark:text-red-400" />
        </div>

        {/* Financial */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FinCard value={formatCurrency(rpt.total_dhl_amount)} label="إجمالي DHL (كل الشحنات) 🟡" colorClass="text-yellow-600 dark:text-yellow-500" />
          <FinCard value={formatCurrency(platAmount)} label="إجمالي المنصة (المطابق فقط) 🔵" colorClass="text-indigo-600 dark:text-indigo-400" />
          <FinCard value={formatCurrency(Math.abs(rpt.total_difference))} label="الفرق (DHL − المنصة) 📊"
            colorClass={rpt.total_difference > 0.01 ? 'text-red-600' : rpt.total_difference < -0.01 ? 'text-green-600' : 'text-yellow-600'} highlight />
          <FinCard 
            value={rpt.total_dhl_amount > 0 ? ((platAmount - rpt.total_dhl_amount) / rpt.total_dhl_amount * 100).toFixed(1) + '%' : '0%'} 
            label="هامش الربح الكلي %" 
            colorClass={(platAmount - rpt.total_dhl_amount) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'} 
          />
        </div>

        {/* Filter */}
        <div className="flex flex-wrap gap-2 bg-white dark:bg-slate-800 p-3 rounded-2xl border border-gray-200 dark:border-slate-700">
          {[['all', 'الكل'], ['matched', 'متطابق'], ['discrepancy', 'فروقات'], ['needs_review', 'يحتاج مراجعة'], ['not_found', 'غير موجود']].map(([k, label]) => (
            <button key={k} className={`px-4 py-2 text-sm font-bold rounded-xl border transition-all ${
              activeFilter === k ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-900'
            }`} onClick={() => setActiveFilter(k)}>{label}</button>
          ))}
        </div>

        {/* Table */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className={`w-full text-right border-collapse whitespace-nowrap ${isDhl ? 'min-w-[1450px]' : 'min-w-[1200px]'}`}>
              <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-slate-900/90 backdrop-blur-sm">
                <tr className="border-b border-gray-200 dark:border-slate-700 text-gray-500 text-xs uppercase font-bold tracking-wider">
                  <th className="p-3">البوليصة</th>
                  <th className="p-3">الحالة</th>
                  <th className="p-3">التاريخ</th>
                  <th className="p-3">المنشأ</th>
                  <th className="p-3">الوجهة</th>
                  <th className="p-3">العميل</th>
                  <th className="p-3">الوزن الفعلي</th>
                  <th className="p-3">وزن الفوترة</th>
                  {isDhl ? (
                    <>
                      <th className="p-3 text-orange-600">تكلفة الناقل بالفاتورة</th>
                      <th className="p-3 text-yellow-600">تكلفة الناقل الأصلية من DHL</th>
                    </>
                  ) : <th className="p-3 text-yellow-600">سعر DHL</th>}
                  <th className="p-3 text-indigo-600">سعر المنصة</th>
                  <th className="p-3">الفرق</th>
                  <th className="p-3">الهامش</th>
                  <th className="p-3">الدفع</th>
                  <th className="p-3">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200/50 dark:divide-slate-700/50">
                {tableRows.length ? tableRows.map((r: any) => {
                  const awb = r.airwaybill_number
                  const manual = r.manual_edit
                  const dhlData = r.dhl_data
                  const platData = r.daftra_data
                  const platTotal = platData?.summary_total ?? null
                  const dhlCharge = dhlData?.total_charge || 0
                  const diff = platTotal != null ? r.total_financial_difference : null
                  const diffClass = diff == null ? 'text-gray-400' : diff > 0.004 ? 'text-green-600' : diff < -0.004 ? 'text-red-600' : 'text-gray-400'
                  const diffText = diff == null || Math.abs(diff) < 0.005 ? '—' : `${diff > 0 ? '+' : ''}${formatCurrency(diff)}`
                  const pm = r.profit_margin_pct
                  const clientName = platData?.client_name || '—'
                  const payStatus = platData?.payment_status

                  return (
                    <tr key={awb} className="hover:bg-gray-50/50 dark:hover:bg-slate-700/30 transition-colors">
                      <td className="p-3 font-mono text-sm font-bold text-gray-900 dark:text-white">{awb}</td>
                      <td className="p-3" title={r.review_reason ? REVIEW_TEXT[r.review_reason] || r.review_reason : undefined}>{statusBadge(r.status)}{manual && <span className="mr-1 text-[10px] font-bold text-indigo-500">✎ يدوي</span>}</td>
                      <td className="p-3 text-xs text-gray-500 font-semibold">{dhlData?.shipment_date || dhlData?.shipment_date || '—'}</td>
                      <td className="p-3"><span className="bg-gray-50 dark:bg-slate-900 px-2 py-1 rounded text-xs font-bold border border-gray-200 dark:border-slate-700">{dhlData?.origin_airport || '—'}</span></td>
                      <td className="p-3"><span className="bg-gray-50 dark:bg-slate-900 px-2 py-1 rounded text-xs font-bold border border-gray-200 dark:border-slate-700">{dhlData?.destination_code || '—'}</span></td>
                      <td className="p-3 text-sm font-bold max-w-[140px] truncate" title={clientName}>{clientName}</td>
                      <td className="p-3 text-sm text-gray-500">{dhlData?.weight_kg || 0} كجم</td>
                      <td className="p-3 text-sm font-bold text-gray-700 dark:text-gray-300">{dhlData?.chargeable_weight || dhlData?.weight_kg || 0} كجم</td>
                      {isDhl ? (
                        <>
                          <td className="p-3 font-bold text-orange-600 tabular-nums" dir="ltr">{r.cost_action?.current_cost != null ? formatSar(r.cost_action.current_cost) : '—'}</td>
                          <td className="p-3">
                            <CarrierCostCell action={r.cost_action} fallbackAmount={dhlCharge} busy={costBusy[awb] ?? null}
                              onApply={() => void decideCarrierCost(awb, 'apply')} onReject={() => void decideCarrierCost(awb, 'reject')} />
                          </td>
                        </>
                      ) : <td className="p-3 font-bold text-yellow-600">{formatCurrency(dhlCharge)}</td>}
                      <td className="p-3 font-bold text-indigo-600">{platTotal != null ? formatCurrency(platTotal) : '—'}</td>
                      <td className={`p-3 font-black ${diffClass}`}>{diffText}</td>
                      <td className="p-3 text-sm">{pm != null ? <span className={`font-bold ${pm >= 0 ? 'text-green-600' : 'text-red-600'}`}>{pm > 0 ? '+' : ''}{typeof pm === 'number' ? pm.toFixed(1) : pm}%</span> : '—'}</td>
                      <td className="p-3">{paymentBadge(payStatus)}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-1">
                          {canEdit && platData && (
                            <button className={`p-1.5 rounded-lg border text-xs transition-all ${manual ? 'border-green-300 text-green-600 bg-green-50' : 'border-gray-200 dark:border-slate-700 text-gray-400 hover:text-indigo-600'}`}
                              onClick={() => openEditModal(awb)} title="تصحيح يدوي في التقرير"><Edit3 size={14} /></button>
                          )}
                          {platData && (
                            <>
                              <button className="p-1.5 rounded-lg border border-gray-200 dark:border-slate-700 text-gray-400 hover:text-indigo-600 text-xs transition-all"
                                onClick={() => isDhl ? setDhlDetail({ open: true, awb }) : setCsvDetail({ open: true, awb })} title="عرض التفاصيل"><Eye size={14} /></button>
                              <button className="p-1.5 rounded-lg border border-gray-200 dark:border-slate-700 text-gray-400 hover:text-indigo-600 text-xs transition-all"
                                onClick={() => handleOpenTaskModal(platData)} title="إرسال مهمة / تعيين موظف"><ListTodo size={14} /></button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                }) : (
                  <tr>
                    <td colSpan={isDhl ? 15 : 14} className="p-16 text-center text-gray-400">
                      <Search size={40} className="mx-auto mb-3 opacity-30" />
                      <p className="font-bold text-lg">لا توجد نتائج في هذه الفئة</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )
  }

  /* ═══════════════════════════════════════════════════════
     Detail Modal (shared)
     ═══════════════════════════════════════════════════════ */
  const activeDetail = tab === 'dhl-ai' ? dhlDetail : csvDetail
  const selectedRow = tab === 'dhl-ai' ? dhlSelectedDetail : csvSelectedDetail
  const closeDetail = () => tab === 'dhl-ai' ? setDhlDetail({ open: false, awb: null }) : setCsvDetail({ open: false, awb: null })
  const isDhlTab = tab === 'dhl-ai'

  /* ═══════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════ */
  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-20 lg:pb-0 relative">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-slate-800 p-4 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-xl border border-indigo-100 dark:border-indigo-800/20">
            <ArrowRightLeft size={24} />
          </div>
          <div>
            <h1 className="font-bold text-lg text-gray-900 dark:text-white">مطابقة الفواتير</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold">مقارنة فواتير DHL مع دفترة أو بيانات المنصة</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            className="flex items-center gap-2 px-4 py-2 text-sm font-bold bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 border border-indigo-100 dark:border-indigo-800/30 hover:bg-indigo-600 hover:text-white rounded-xl shadow-sm transition-all"
            onClick={() => { setHistoryModalOpen(true); void loadHistory(); }}
          >
            <ListTodo size={16} />
            الفواتير السابقة
          </button>


          <button className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-gray-500 bg-gray-50 dark:bg-slate-900 hover:text-red-600 hover:bg-red-50 rounded-xl border border-gray-200 dark:border-slate-700 transition-all disabled:opacity-50"
            onClick={resetAll} disabled={csvBusy || dhlJob.status === 'uploading'}>
            <X size={16} /> إعادة تعيين
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 bg-white dark:bg-slate-800 p-2 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm">
        <button className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-bold transition-all ${tab === 'dhl-ai' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-slate-700'}`}
          onClick={() => setTab('dhl-ai')}><Zap size={18} /> مطابقة ذكية (PDF + Claude AI + دفترة)</button>
        <button className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-bold transition-all ${tab === 'csv-platform' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-slate-700'}`}
          onClick={() => setTab('csv-platform')}><FileSpreadsheet size={18} /> مطابقة Excel/CSV مع المنصة</button>
      </div>

      {/* ═══ TAB 1: DHL AI ═══ */}
      {tab === 'dhl-ai' && (
        <>
          {dhlJob.status === 'idle' && <UploadZone />}
          {(dhlJob.status === 'uploading' || dhlJob.status === 'processing') && <DhlProgress />}
          {dhlJob.status === 'error' && (
            <div className="max-w-lg mx-auto flex flex-col items-center gap-4 py-16">
              <AlertCircle size={48} className="text-red-500" />
              <p className="text-red-600 font-bold text-lg text-center">{dhlJob.error}</p>
              <button className="px-6 py-2 bg-indigo-600 text-white rounded-xl font-bold" onClick={resetAll}>حاول مرة أخرى</button>
            </div>
          )}
          {dhlJob.status === 'done' && <ResultsView mode="dhl" />}
        </>
      )}

      {/* ═══ TAB 2: CSV/Platform ═══ */}
      {tab === 'csv-platform' && (
        <>
          {!csvReport && <UploadZone />}
          {csvBusy && !csvReport && <div className="flex justify-center"><Loader2 className="animate-spin text-indigo-600" size={28} /></div>}
          {csvReport && <ResultsView mode="csv" />}
        </>
      )}

      {/* ═══ Detail Modal ═══ */}
      {activeDetail.open && selectedRow && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200"
          onClick={closeDetail}>
          <div className="bg-white dark:bg-slate-800 w-full max-w-4xl rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700 flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-slate-700 bg-gray-50/50 dark:bg-slate-700/30">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">تفاصيل المطابقة</h2>
                <p className="text-sm font-semibold text-gray-500 font-mono mt-1">AWB: {selectedRow.airwaybill_number}</p>
              </div>
              <button className="w-10 h-10 rounded-xl bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors"
                onClick={closeDetail}><X size={24} /></button>
            </div>
            <div className="p-5 overflow-y-auto flex-1 flex flex-col gap-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* DHL Data */}
                <div className="bg-gray-50 dark:bg-slate-700/50 border border-yellow-200 dark:border-yellow-800/20 rounded-xl p-5">
                  <h3 className="font-bold text-yellow-600 dark:text-yellow-500 flex items-center gap-2 mb-4 border-b border-gray-200/50 dark:border-slate-600 pb-2"><FileText size={18} /> بيانات DHL</h3>
                  <div className="flex flex-col gap-3">
                    {[
                      ['تاريخ الشحن', (isDhlTab ? selectedRow.dhl_data : selectedRow.dhl_data)?.shipment_date || '—'],
                      ['المنشأ', (isDhlTab ? selectedRow.dhl_data : selectedRow.dhl_data)?.origin_airport || '—'],
                      ['الوجهة', (isDhlTab ? selectedRow.dhl_data : selectedRow.dhl_data)?.destination_code || '—'],
                      ['الوزن', `${(isDhlTab ? selectedRow.dhl_data : selectedRow.dhl_data)?.weight_kg || 0} كجم`],
                      ['الإجمالي', `${formatCurrency((isDhlTab ? selectedRow.dhl_data : selectedRow.dhl_data)?.total_charge)} ر.س`],
                    ].map(([k, v]) => (
                      <div key={k} className="flex justify-between text-sm">
                        <span className="text-gray-500 font-bold">{k}</span>
                        <span className="font-bold text-gray-900 dark:text-white">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Platform/Daftra Data */}
                <div className="bg-gray-50 dark:bg-slate-700/50 border border-indigo-100 dark:border-indigo-800/20 rounded-xl p-5">
                  <h3 className="font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-2 mb-4 border-b border-gray-200/50 dark:border-slate-600 pb-2">
                    <FileSpreadsheet size={18} /> بيانات المنصة
                  </h3>
                  {(() => {
                    const pd = selectedRow.daftra_data
                    if (!pd) return <div className="text-gray-400 font-bold text-center py-8">غير مسجل</div>
                    return (
                      <div className="flex flex-col gap-3">
                        {[
                          ['رقم الفاتورة', pd.invoice_no || '—'],
                          ['طريقة المطابقة', MATCH_TEXT[selectedRow.match_type] || '—'],
                          ['العميل', pd.client_name || '—'],
                          ['التاريخ', pd.date || '—'],
                          ['الإجمالي', `${formatCurrency(pd.summary_total)} ر.س`],
                          ['المدفوع', `${formatCurrency(pd.summary_paid)} ر.س`],
                          ['المتبقي', `${formatCurrency(pd.summary_unpaid)} ر.س`],
                          ['حالة الدفع', pd.payment_status || '—'],
                        ].map(([k, v]) => (
                          <div key={k} className="flex justify-between text-sm">
                            <span className="text-gray-500 font-bold">{k}</span>
                            <span className="font-bold text-gray-900 dark:text-white">{v}</span>
                          </div>
                        ))}
                      </div>
                    )
                  })()}
                </div>
              </div>

              {selectedRow.review_reason && (
                <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800/30 text-orange-800 dark:text-orange-200 rounded-xl p-4 text-sm font-bold">
                  يحتاج مراجعة: {REVIEW_TEXT[selectedRow.review_reason] || selectedRow.review_reason}. لم تُعتمد هذه المطابقة تلقائيًا ولم تُحتسب في إجمالي المنصة.
                </div>
              )}
              {selectedRow.manual_edit && (
                <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800/30 text-indigo-800 dark:text-indigo-200 rounded-xl p-4 text-sm font-bold">
                  تم تصحيح قيم هذا الصف يدويًا في التقرير. القيم الأصلية: الإجمالي {formatCurrency(selectedRow.original?.summary_total)} — الوزن {selectedRow.original?.weight ?? '—'} كجم.
                </div>
              )}
              {/* Discrepancies */}
              {selectedRow.discrepancies?.length > 0 && (
                <div className="border border-red-200 dark:border-red-800/30 rounded-xl overflow-hidden">
                  <div className="bg-red-50 dark:bg-red-900/20 px-4 py-3 border-b border-red-200 dark:border-red-800/30 flex items-center gap-2">
                    <AlertTriangle className="text-red-500" size={18} />
                    <h3 className="font-bold text-red-600 text-sm">الفروقات المكتشفة</h3>
                  </div>
                  <table className="w-full text-right bg-white dark:bg-slate-800">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-slate-900 text-gray-500 text-xs font-bold uppercase border-b border-gray-200 dark:border-slate-700">
                        <th className="p-3">البند</th><th className="p-3">قيمة DHL</th><th className="p-3">قيمة المنصة</th><th className="p-3">الفرق</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedRow.discrepancies.map((d: any, i: number) => (
                        <tr key={i} className="border-b border-gray-200/50 dark:border-slate-700/50">
                          <td className="p-3 font-bold text-sm">{d.field_name_ar}</td>
                          <td className="p-3 text-sm text-yellow-600">{d.dhl_value}</td>
                          <td className="p-3 text-sm text-indigo-600">{d.daftra_value ?? d.platform_value}</td>
                          <td className={`p-3 text-sm font-black ${d.difference > 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {d.difference > 0 ? '+' : ''}{typeof d.difference === 'number' ? formatCurrency(d.difference) : d.difference}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══ Edit Modal (DHL AI tab only) ═══ */}
      {editModal.open && editModal.awb && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
          onClick={() => setEditModal({ open: false, awb: null })}>
          <div className="bg-white dark:bg-slate-800 w-full max-w-md rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700 p-6 animate-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}>
            
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <Edit3 size={20} className="text-indigo-600" /> تعديل يدوي
                </h3>
                <p className="text-xs font-mono text-indigo-600 mt-1">AWB: {editModal.awb}</p>
                <p className="text-[11px] text-gray-500 mt-1">تصحيح في تقرير المطابقة فقط — لا يغيّر الفاتورة ولا حالة سدادها.</p>
              </div>
              <button className="w-8 h-8 rounded-lg bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 flex items-center justify-center text-gray-400 hover:text-red-500"
                onClick={() => setEditModal({ open: false, awb: null })}>
                <X size={18} />
              </button>
            </div>

            <div className="flex flex-col gap-4">
              {/* Client name */}
              <div>
                <label className="block text-sm font-bold text-gray-500 mb-1.5">اسم العميل</label>
                <input
                  type="text"
                  className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-semibold text-gray-900 dark:text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  placeholder="اسم العميل"
                  value={editFields.client}
                  onChange={e => setEditFields(p => ({ ...p, client: e.target.value }))}
                />
              </div>

              {/* Weight */}
              <div>
                <label className="block text-sm font-bold text-gray-500 mb-1.5">الوزن (كجم)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-semibold text-gray-900 dark:text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  placeholder="0.00"
                  value={editFields.weight}
                  onChange={e => setEditFields(p => ({ ...p, weight: e.target.value }))}
                />
              </div>

              {/* Daftra Total */}
              <div>
                <label className="block text-sm font-bold text-gray-500 mb-1.5">إجمالي المنصة (ريال)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-semibold text-gray-900 dark:text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  placeholder="0.00"
                  value={editFields.daftraTotal}
                  onChange={e => setEditFields(p => ({ ...p, daftraTotal: e.target.value }))}
                />
              </div>

              {/* Live calc */}
              {(() => {
                const r = activeReport?.results?.find((x: any) => x.airwaybill_number === editModal.awb)
                if (!r) return null
                const dhlTotal = r.dhl_data?.total_charge || 0
                const dafVal = editFields.daftraTotal ? parseFloat(editFields.daftraTotal) : null
                const diff = dafVal != null && Number.isFinite(dafVal) ? Math.round((dafVal - dhlTotal) * 100) / 100 : null
                return (
                  <div className="bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl p-4 flex flex-col gap-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500 font-bold">إجمالي DHL</span>
                      <span className="font-bold text-yellow-600">{formatCurrency(dhlTotal)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500 font-bold">إجمالي المنصة (يدوي)</span>
                      <span className="font-bold text-indigo-600">{dafVal != null ? formatCurrency(dafVal) : '—'}</span>
                    </div>
                    <div className="border-t border-gray-200 dark:border-slate-700 pt-2 mt-1 flex justify-between text-base">
                      <span className="font-bold text-gray-900 dark:text-white">الفرق (المنصة − DHL)</span>
                      <span className={`font-black ${diff != null ? (diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-600' : 'text-gray-400') : 'text-gray-400'}`}>
                        {diff != null ? `${diff > 0 ? '+' : ''}${formatCurrency(diff)}` : '—'}
                      </span>
                    </div>
                  </div>
                )
              })()}

              {editError && <div role="alert" className="bg-red-50 dark:bg-red-900/20 text-red-600 p-3 rounded-xl text-sm font-bold">{editError}</div>}
              {/* Actions */}
              <div className="flex flex-wrap gap-3 mt-2">
                <button
                  className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-60 flex items-center justify-center gap-2"
                  onClick={() => saveEdit(false)} disabled={editSaving}
                >
                  {editSaving && <Loader2 size={16} className="animate-spin" />} ✓ حفظ التصحيح
                </button>
                {activeReport?.results?.find((x: any) => x.airwaybill_number === editModal.awb)?.manual_edit && (
                  <button className="px-4 py-3 border border-red-200 text-red-600 rounded-xl font-bold text-sm disabled:opacity-60" onClick={() => saveEdit(true)} disabled={editSaving}>
                    إلغاء التصحيح
                  </button>
                )}
                <button
                  className="px-6 py-3 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-500 hover:text-gray-900 rounded-xl font-bold text-sm transition-all"
                  onClick={() => setEditModal({ open: false, awb: null })}
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
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

      {/* ─── History Modal (Previous Invoices) ─── */}
      {historyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setHistoryModalOpen(false)} />
          <div className="relative bg-white dark:bg-slate-800 w-full max-w-4xl max-h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-gray-200 dark:border-slate-700">
            <div className="p-5 border-b border-gray-100 dark:border-slate-700/50 flex justify-between items-center bg-gray-50/50 dark:bg-slate-900/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 rounded-xl">
                  <ListTodo size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-white text-lg leading-tight">الفواتير السابقة</h3>
                  <p className="text-[11px] text-gray-500 font-medium mt-0.5">سجل مطابقات فواتير DHL السابقة المحفوظة في قاعدة البيانات</p>
                </div>
              </div>
              <button onClick={() => setHistoryModalOpen(false)} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-xl transition-all">
                <X size={20} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 bg-gray-50/30 dark:bg-slate-900/20">
              {historyLoading ? (
                <div className="flex justify-center items-center py-12">
                  <Loader2 size={32} className="animate-spin text-indigo-500" />
                </div>
              ) : historyList.length === 0 ? (
                <div className="text-center py-12 text-gray-500 font-bold">لا يوجد فواتير سابقة</div>
              ) : (
                <div className="space-y-3">
                  {historyList.map(h => (
                    <div key={h.id} className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm hover:shadow-md transition-all">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-bold text-sm text-gray-900 dark:text-white">{h.file_name}</span>
                          <span className="text-[10px] bg-gray-100 dark:bg-slate-700 px-2 py-0.5 rounded-md text-gray-600 dark:text-gray-400 font-mono">{new Date(h.upload_date).toLocaleString('en-GB')}</span>
                        </div>
                        <div className="flex flex-wrap gap-4 text-xs font-bold text-gray-600 dark:text-gray-300">
                          <div className="flex items-center gap-1.5"><span className="text-indigo-500">DHL:</span> <span className="font-mono">{Number(h.total_dhl_amount).toFixed(2)} ر.س</span></div>
                          <div className="flex items-center gap-1.5"><span className="text-blue-500">المنصة:</span> <span className="font-mono">{Number(h.total_platform_amount).toFixed(2)} ر.س</span></div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-gray-500">الفرق:</span> 
                            <span className={`font-mono ${Number(h.difference) > 0 ? 'text-red-500' : 'text-green-500'}`}>
                              {Number(h.difference) > 0 ? '+' : ''}{Number(h.difference).toFixed(2)} ر.س
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 w-full md:w-auto">
                        <button 
                          onClick={() => { setHistoryModalOpen(false); void openStoredReport(h.id, 'dhl-ai') }}
                          className="p-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-xl border border-blue-100 dark:border-blue-800/30 hover:bg-blue-100 transition-all font-bold text-[10px] whitespace-nowrap"
                        >
                          عرض الجدول
                        </button>
                        <select 
                          value={h.assigned_client_id || ''}
                          onChange={async (e) => {
                            const val = e.target.value ? Number(e.target.value) : null;
                            try {
                              await reconcileApiService.assignClient(h.id, val);
                              setHistoryList(prev => prev.map(x => x.id === h.id ? { ...x, assigned_client_id: val } : x));
                            } catch(err) { console.error(err); alert('فشل تعيين العميل'); }
                          }}
                          className="bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold min-w-[150px]"
                        >
                          <option value="">-- تعيين عميل --</option>
                          {usersList.map(u => (
                            <option key={u.id} value={u.id}>{u.full_name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}