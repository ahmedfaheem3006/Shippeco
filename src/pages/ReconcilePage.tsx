import { useMemo, useState, useRef, useCallback, useEffect } from 'react'
import { invoiceService } from '../services/invoiceService'
import { reconcileApiService } from '../services/reconcileService'
import { parseCsv } from '../utils/csv'
import {
  buildReconcileReport,
  filterReconcileRows,
  formatCurrency,
  isoDate,
  type DhlShipmentRow,
  type ReconcileFilter,
  type ReconcileReport,
} from '../utils/reconcile'
import {
  UploadCloud, FileSpreadsheet, RefreshCw, CheckCircle2,
  AlertTriangle, AlertCircle, Search, Loader2, X,
  FileText, ArrowRightLeft, Zap, FileUp,
  Download, Edit3, Eye, ListTodo, User, MessageSquare
} from 'lucide-react'
import { useAuthStore } from '../hooks/useAuthStore'

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
  totalTime: number | null
}

/* ═══════════════════════════════════════════════════════
   Badge helpers
   ═══════════════════════════════════════════════════════ */
function statusBadge(status: string) {
  const map: Record<string, { bg: string; text: string; border: string; icon: any; label: string }> = {
    matched: { bg: 'bg-green-50 dark:bg-green-900/20', text: 'text-green-600 dark:text-green-400', border: 'border-green-200 dark:border-green-800/30', icon: CheckCircle2, label: 'متطابق' },
    discrepancy: { bg: 'bg-yellow-50 dark:bg-yellow-900/20', text: 'text-yellow-600 dark:text-yellow-500', border: 'border-yellow-200 dark:border-yellow-800/20', icon: AlertTriangle, label: 'فروقات' },
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
  if (ps === 'مدفوع جزئياً') return <span className="text-yellow-600 dark:text-yellow-500 font-bold text-xs flex items-center gap-1"><AlertTriangle size={12} /> جزئي</span>
  return <span className="text-gray-400 text-xs font-bold">{ps}</span>
}

/* ═══════════════════════════════════════════════════════
   CSV helpers
   ═══════════════════════════════════════════════════════ */
function parseFloatSafe(v: unknown) {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : 0
}

function extractShipments(rows: Record<string, unknown>[]) {
  if (!rows.length) throw new Error('الملف فارغ أو لا يحتوي على بيانات')
  const AWB_KEYS = ['Waybill No', 'Waybill', 'AWB', 'AWB No', 'AWB Number', 'Airway Bill', 'Shipment No', 'رقم البوليصة', 'رقم الشحنة', 'رقم بوليصة الشحن', 'Shipment Number', 'Hawb', 'HAWB']
  const TOTAL_KEYS = ['Total Charge', 'Total', 'Grand Total', 'Net Charge', 'Amount', 'Charge', 'الإجمالي', 'إجمالي الرسوم', 'Total Amount', 'Invoice Amount', 'Billed Amount']
  const WEIGHT_KEYS = ['Weight', 'Actual Weight', 'Chargeable Weight', 'Billed Weight', 'الوزن', 'وزن الشحنة', 'Weight (KG)', 'Weight KG']
  const DATE_KEYS = ['Shipment Date', 'Date', 'Invoice Date', 'Ship Date', 'تاريخ الشحن', 'التاريخ']
  const DEST_KEYS = ['Destination', 'Destination Country', 'Dest', 'To', 'وجهة', 'الوجهة', 'Destination Code']
  const ORIGIN_KEYS = ['Origin', 'From', 'Origin Country', 'منشأ', 'المنشأ']
  const SERVICE_KEYS = ['Service', 'Service Type', 'Product', 'نوع الخدمة', 'Product Name']
  const FUEL_KEYS = ['Fuel Surcharge', 'Fuel', 'رسوم الوقود']
  const VAT_KEYS = ['VAT', 'Tax', 'Value Added Tax', 'ضريبة', 'ضريبة القيمة المضافة']

  const findKey = (row: Record<string, unknown>, candidates: string[]) => {
    const keys = Object.keys(row)
    for (const c of candidates) { const f = keys.find(k => k.trim().toLowerCase() === c.toLowerCase()); if (f) return f }
    for (const c of candidates) { const f = keys.find(k => { const kk = k.trim().toLowerCase(), cc = c.toLowerCase(); return kk.includes(cc) || cc.includes(kk) }); if (f) return f }
    return null
  }

  const s = rows[0]
  const kAwb = findKey(s, AWB_KEYS), kTotal = findKey(s, TOTAL_KEYS), kWeight = findKey(s, WEIGHT_KEYS)
  const kDate = findKey(s, DATE_KEYS), kDest = findKey(s, DEST_KEYS), kOrigin = findKey(s, ORIGIN_KEYS)
  const kService = findKey(s, SERVICE_KEYS), kFuel = findKey(s, FUEL_KEYS), kVat = findKey(s, VAT_KEYS)
  if (!kAwb) throw new Error('تعذّر إيجاد عمود رقم الشحنة/البوليصة في الملف')

  return rows.map(row => {
    const awb = String(row[kAwb] ?? '').trim().replace(/\s+/g, '')
    if (!awb || awb === '0') return null
    return {
      awb, total_charge: kTotal ? parseFloatSafe(row[kTotal]) : 0,
      weight_kg: kWeight ? parseFloatSafe(row[kWeight]) : 0,
      shipment_date: kDate ? isoDate(row[kDate]) : '—',
      destination: kDest ? String(row[kDest] ?? '').trim() : '—',
      origin: kOrigin ? String(row[kOrigin] ?? '').trim() : '—',
      service_type: kService ? String(row[kService] ?? '').trim() : '—',
      fuel_surcharge: kFuel ? parseFloatSafe(row[kFuel]) : 0,
      vat_amount: kVat ? parseFloatSafe(row[kVat]) : 0,
    }
  }).filter((x): x is DhlShipmentRow => Boolean(x))
}

async function readRowsFromFile(file: File) {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'csv') return parseCsv(await file.text()) as unknown as Record<string, unknown>[]
  if (ext === 'xlsx' || ext === 'xls') {
    const XLSX = await import('xlsx')
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
    let sn = wb.SheetNames[0]
    for (const n of wb.SheetNames) if (/dhl|ship|invoice|شحن|فاتور/i.test(n)) { sn = n; break }
    return XLSX.utils.sheet_to_json(wb.Sheets[sn], { defval: '' }) as Record<string, unknown>[]
  }
  throw new Error('نوع الملف غير مدعوم')
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
  const [csvReport, setCsvReport] = useState<ReconcileReport | null>(null)
  const [csvBusy, setCsvBusy] = useState(false)
  const [csvFilter, setCsvFilter] = useState<ReconcileFilter>('all')
  const [csvDetail, setCsvDetail] = useState<DetailState>({ open: false, awb: null })

  // DHL AI state
  const [dhlJob, setDhlJob] = useState<DhlJobState>({ jobId: null, status: 'idle', step: '', progress: 0, error: null, result: null, totalTime: null })
  const [dhlFilter, setDhlFilter] = useState('all')
  const [dhlDetail, setDhlDetail] = useState<DetailState>({ open: false, awb: null })
  const [dhlManualEdits, setDhlManualEdits] = useState<Record<string, any>>({})
  
  // Backfill state
  const [backfillLoading, setBackfillLoading] = useState(false)
  const [backfillJob, setBackfillJob] = useState<any>(null)
  
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bfPollRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startTimeRef = useRef(0)

  // Edit modal
  const [editModal, setEditModal] = useState<{ open: boolean; awb: string | null }>({ open: false, awb: null })
  const [editFields, setEditFields] = useState({ client: '', weight: '', daftraTotal: '', paymentStatus: '' })

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
    const invId = platData.id || platData.invoice_id;
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
      if (bfPollRef.current) clearTimeout(bfPollRef.current)
    }
  }, [])

  /* ─── Backfill: Recovery Job ─── */
  const startAwbRecovery = async () => {
    setBackfillLoading(true)
    try {
      const { job_id } = await reconcileApiService.startBackfill()
      pollBackfillStatus(job_id)
    } catch (e: any) {
      setError(e.message)
      setBackfillLoading(false)
    }
  }

  const pollBackfillStatus = async (jobId: string) => {
    try {
      const job = await reconcileApiService.getBackfillStatus(jobId)
      setBackfillJob(job)
      if (job.status === 'running') {
        bfPollRef.current = setTimeout(() => pollBackfillStatus(jobId), 2000)
      } else {
        setBackfillLoading(false)
      }
    } catch {
      bfPollRef.current = setTimeout(() => pollBackfillStatus(jobId), 5000)
    }
  }

  /* ─── DHL AI: Submit & Poll ─── */
  const submitDhlInvoice = useCallback(async () => {
    if (!file) return
    setError(null)
    startTimeRef.current = Date.now()
    setDhlJob({ jobId: null, status: 'uploading', step: 'uploading', progress: 5, error: null, result: null, totalTime: null })
    try {
      const { job_id } = await reconcileApiService.submitDhlInvoice(file)
      setDhlJob(p => ({ ...p, jobId: job_id, status: 'processing', step: 'parsing', progress: 10 }))
      pollDhlStatus(job_id)
    } catch (e: any) {
      setDhlJob(p => ({ ...p, status: 'error', error: e.message || 'فشل رفع الملف' }))
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

  /* ─── CSV: Analyze ─── */
  const analyzeCsv = async () => {
    if (!file) return
    setCsvBusy(true); setError(null)
    try {
      const [dbInvoices, fileRows] = await Promise.all([invoiceService.getInvoices({ limit: 10000 }), readRowsFromFile(file)])
      const shipments = extractShipments(fileRows)
      setCsvReport(buildReconcileReport({ filename: file.name, shipments, invoices: dbInvoices ?? [] }))
      setCsvFilter('all')
    } catch (e: any) { setError(e.message); setCsvReport(null) }
    finally { setCsvBusy(false) }
  }

  /* ─── DHL: Export ─── */
  const exportDhlExcel = async () => {
    if (!dhlJob.result) return
    try {
      const blob = await reconcileApiService.exportExcel(dhlJob.result)
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `dhl_reconciliation_${new Date().toISOString().slice(0, 10)}.xlsx`
      a.click()
    } catch { setError('فشل تصدير التقرير') }
  }

  /* ─── DHL: Edit modal ─── */
  const openEditModal = (awb: string) => {
    const r = dhlJob.result?.results?.find((x: any) => x.airwaybill_number === awb)
    if (!r) return
    const m = dhlManualEdits[awb]
    setEditFields({
      client: m?.client || r.daftra_data?.client_name || '',
      weight: String(m?.weight ?? r.daftra_weight_kg ?? ''),
      daftraTotal: String(m?.daftraTotal ?? r.daftra_data?.summary_total ?? ''),
      paymentStatus: m?.paymentStatus || r.daftra_data?.payment_status || '',
    })
    setEditModal({ open: true, awb })
  }

  const saveEdit = () => {
    if (!editModal.awb) return
    setDhlManualEdits(p => ({
      ...p, [editModal.awb!]: {
        client: editFields.client || null,
        weight: editFields.weight ? parseFloat(editFields.weight) : null,
        daftraTotal: editFields.daftraTotal ? parseFloat(editFields.daftraTotal) : null,
        paymentStatus: editFields.paymentStatus || null,
      }
    }))
    setEditModal({ open: false, awb: null })
  }

  /* ─── Reset ─── */
  const resetAll = () => {
    if (pollRef.current) clearTimeout(pollRef.current)
    setFile(null); setError(null); setCsvReport(null); setCsvBusy(false)
    setDhlJob({ jobId: null, status: 'idle', step: '', progress: 0, error: null, result: null, totalTime: null })
    setDhlFilter('all'); setDhlDetail({ open: false, awb: null }); setDhlManualEdits({})
  }

  /* ─── Derived ─── */
  const csvRows = useMemo(() => csvReport ? filterReconcileRows(csvReport, csvFilter) : [], [csvFilter, csvReport])
  const dhlResults = useMemo(() => {
    if (!dhlJob.result?.results) return []
    const all = dhlJob.result.results as any[]
    if (dhlFilter === 'all') return all
    if (dhlFilter === 'not_found') return all.filter((r: any) => r.status === 'not_found_in_daftra' || r.status === 'daftra_error')
    return all.filter((r: any) => r.status === dhlFilter)
  }, [dhlJob.result, dhlFilter])

  const csvSelectedDetail = useMemo(() => {
    if (!csvDetail.open || !csvDetail.awb || !csvReport) return null
    return csvReport.results.find(r => r.airwaybill_number === csvDetail.awb) ?? null
  }, [csvDetail, csvReport])

  const dhlSelectedDetail = useMemo(() => {
    if (!dhlDetail.open || !dhlDetail.awb || !dhlJob.result) return null
    return (dhlJob.result.results as any[]).find((r: any) => r.airwaybill_number === dhlDetail.awb) ?? null
  }, [dhlDetail, dhlJob.result])

  const stepsList = [
    { key: 'parsing', label: 'جاري قراءة الملف...' },
    { key: 'extracting', label: 'جاري تحليل الشحنات (Claude AI)...' },
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
          onClick={tab === 'dhl-ai' ? submitDhlInvoice : analyzeCsv}
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
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 text-red-600 p-4 rounded-xl text-sm font-bold flex items-start gap-3">
          <AlertCircle className="shrink-0 mt-0.5" size={18} /> <p>{error}</p>
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
    const setActiveFilter = mode === 'dhl' ? setDhlFilter : (f: string) => setCsvFilter(f as ReconcileFilter)
    const tableRows = mode === 'dhl' ? dhlResults : csvRows
    const isDhl = mode === 'dhl'

    const dhlAmountLabel = isDhl ? 'إجمالي DHL 🟡' : 'إجمالي DHL 🟡'
    const platAmountLabel = isDhl ? 'إجمالي دفترة 🔵' : 'إجمالي المنصة 🔵'
    const platAmount = isDhl ? rpt.total_daftra_amount : rpt.total_platform_amount

    return (
      <div className="flex flex-col gap-6 animate-in slide-in-from-bottom-4 duration-500">
        {/* Speed + export */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold text-gray-500">{rpt.filename}</span>
            {isDhl && dhlJob.totalTime && (
              <span className="px-3 py-1 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/30 text-green-600 rounded-lg text-xs font-bold">
                ⚡ تم في {dhlJob.totalTime} ثانية
              </span>
            )}
          </div>
          {isDhl && (
            <button className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700"
              onClick={exportDhlExcel}><Download size={16} /> تصدير Excel</button>
          )}
        </div>

        {/* KPI */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard value={rpt.total_shipments} label="إجمالي الشحنات" colorClass="text-gray-900 dark:text-white" />
          <StatCard value={rpt.matched} label="متطابقة" colorClass="text-green-600 dark:text-green-400" />
          <StatCard value={rpt.with_discrepancies} label="فروقات" colorClass="text-yellow-600 dark:text-yellow-500" />
          <StatCard value={rpt.not_found} label={isDhl ? 'غير موجودة بدفترة' : 'غير موجودة بالمنصة'} colorClass="text-red-600 dark:text-red-400" />
        </div>

        {/* Financial */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FinCard value={formatCurrency(rpt.total_dhl_amount)} label={dhlAmountLabel} colorClass="text-yellow-600 dark:text-yellow-500" />
          <FinCard value={formatCurrency(platAmount)} label={platAmountLabel} colorClass="text-indigo-600 dark:text-indigo-400" />
          <FinCard value={formatCurrency(Math.abs(rpt.total_difference))} label="الفرق 📊"
            colorClass={rpt.total_difference > 0.01 ? 'text-red-600' : rpt.total_difference < -0.01 ? 'text-green-600' : 'text-yellow-600'} highlight />
          <FinCard 
            value={rpt.total_dhl_amount > 0 ? ((platAmount - rpt.total_dhl_amount) / rpt.total_dhl_amount * 100).toFixed(1) + '%' : '0%'} 
            label="هامش الربح الكلي %" 
            colorClass={(platAmount - rpt.total_dhl_amount) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'} 
          />
        </div>

        {/* Filter */}
        <div className="flex flex-wrap gap-2 bg-white dark:bg-slate-800 p-3 rounded-2xl border border-gray-200 dark:border-slate-700">
          {[['all', 'الكل'], ['matched', 'متطابق'], ['discrepancy', 'فروقات'], ['not_found', 'غير موجود']].map(([k, label]) => (
            <button key={k} className={`px-4 py-2 text-sm font-bold rounded-xl border transition-all ${
              activeFilter === k ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-900'
            }`} onClick={() => setActiveFilter(k)}>{label}</button>
          ))}
        </div>

        {/* Table */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full text-right border-collapse whitespace-nowrap min-w-[1200px]">
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
                  <th className="p-3 text-yellow-600">سعر DHL</th>
                  <th className="p-3 text-indigo-600">{isDhl ? 'سعر دفترة' : 'سعر المنصة'}</th>
                  <th className="p-3">الفرق</th>
                  <th className="p-3">الهامش</th>
                  <th className="p-3">الدفع</th>
                  <th className="p-3">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200/50 dark:divide-slate-700/50">
                {tableRows.length ? tableRows.map((r: any) => {
                  const awb = isDhl ? r.airwaybill_number : r.airwaybill_number
                  const manual = isDhl ? dhlManualEdits[awb] : null
                  const dhlData = isDhl ? r.dhl_data : r.dhl_data
                  const platData = isDhl ? r.daftra_data : r.platform_data
                  const platTotal = isDhl
                    ? (manual?.daftraTotal ?? r.daftra_data?.summary_total)
                    : platData?.summary_total
                  
                  const dhlCharge = dhlData?.total_charge || 0
                  const diff = platTotal != null ? platTotal - dhlCharge : (r.total_financial_difference ?? 0)
                  const diffClass = diff > 0.01 ? 'text-green-600' : diff < -0.01 ? 'text-red-600' : 'text-gray-400'
                  const diffText = Math.abs(diff) > 0.01 ? `${diff > 0 ? '+' : ''}${formatCurrency(diff)}` : '—'
                  
                  const pm = dhlCharge > 0 && platTotal != null ? ((platTotal - dhlCharge) / dhlCharge * 100) : r.profit_margin_pct
                  const clientName = isDhl ? (manual?.client || r.daftra_data?.client_name || '—') : (platData?.client_name || '—')
                  const payStatus = isDhl ? (manual?.paymentStatus || r.daftra_data?.payment_status) : platData?.payment_status

                  return (
                    <tr key={awb} className="hover:bg-gray-50/50 dark:hover:bg-slate-700/30 transition-colors">
                      <td className="p-3 font-mono text-sm font-bold text-gray-900 dark:text-white">{awb}</td>
                      <td className="p-3">{statusBadge(r.status)}</td>
                      <td className="p-3 text-xs text-gray-500 font-semibold">{dhlData?.shipment_date || dhlData?.shipment_date || '—'}</td>
                      <td className="p-3"><span className="bg-gray-50 dark:bg-slate-900 px-2 py-1 rounded text-xs font-bold border border-gray-200 dark:border-slate-700">{dhlData?.origin_airport || '—'}</span></td>
                      <td className="p-3"><span className="bg-gray-50 dark:bg-slate-900 px-2 py-1 rounded text-xs font-bold border border-gray-200 dark:border-slate-700">{dhlData?.destination_code || '—'}</span></td>
                      <td className="p-3 text-sm font-bold max-w-[140px] truncate" title={clientName}>{clientName}</td>
                      <td className="p-3 text-sm text-gray-500">{dhlData?.weight_kg || 0} كجم</td>
                      <td className="p-3 text-sm font-bold text-gray-700 dark:text-gray-300">{dhlData?.chargeable_weight || dhlData?.weight_kg || 0} كجم</td>
                      <td className="p-3 font-bold text-yellow-600">{formatCurrency(dhlCharge)}</td>
                      <td className="p-3 font-bold text-indigo-600">{platTotal != null ? formatCurrency(platTotal) : '—'}</td>
                      <td className={`p-3 font-black ${diffClass}`}>{diffText}</td>
                      <td className="p-3 text-sm">{pm != null ? <span className={`font-bold ${pm >= 0 ? 'text-green-600' : 'text-red-600'}`}>{pm > 0 ? '+' : ''}{typeof pm === 'number' ? pm.toFixed(1) : pm}%</span> : '—'}</td>
                      <td className="p-3">{paymentBadge(payStatus)}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-1">
                          {isDhl && (
                            <button className={`p-1.5 rounded-lg border text-xs transition-all ${manual ? 'border-green-300 text-green-600 bg-green-50' : 'border-gray-200 dark:border-slate-700 text-gray-400 hover:text-indigo-600'}`}
                              onClick={() => openEditModal(awb)} title="تعديل يدوي"><Edit3 size={14} /></button>
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
                    <td colSpan={14} className="p-16 text-center text-gray-400">
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
          {backfillJob?.status === 'running' && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800/30 rounded-xl text-xs font-bold text-indigo-600 animate-pulse">
              <RefreshCw size={14} className="animate-spin" />
              جاري استعادة البولايص... {backfillJob.progress}% ({backfillJob.filled} تم إيجادهم)
            </div>
          )}
          
          <button 
            className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl border transition-all ${
              backfillLoading ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed' 
              : 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 border-indigo-100 dark:border-indigo-800/30 hover:bg-indigo-600 hover:text-white shadow-sm'
            }`}
            onClick={startAwbRecovery}
            disabled={backfillLoading}
            title="البحث عن أرقام البولايص المفقودة في دفترة وتخزينها في القاعدة"
          >
            {backfillLoading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            استعادة البولايص المفقودة
          </button>

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
                    <FileSpreadsheet size={18} /> {isDhlTab ? 'بيانات دفترة' : 'بيانات المنصة'}
                  </h3>
                  {(() => {
                    const pd = isDhlTab ? selectedRow.daftra_data : selectedRow.platform_data
                    if (!pd) return <div className="text-gray-400 font-bold text-center py-8">غير مسجل</div>
                    return (
                      <div className="flex flex-col gap-3">
                        {[
                          ['رقم الفاتورة', pd.invoice_no || '—'],
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
                        <th className="p-3">البند</th><th className="p-3">قيمة DHL</th><th className="p-3">{isDhlTab ? 'قيمة دفترة' : 'قيمة المنصة'}</th><th className="p-3">الفرق</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedRow.discrepancies.map((d: any, i: number) => (
                        <tr key={i} className="border-b border-gray-200/50 dark:border-slate-700/50">
                          <td className="p-3 font-bold text-sm">{d.field_name_ar}</td>
                          <td className="p-3 text-sm text-yellow-600">{d.dhl_value}</td>
                          <td className="p-3 text-sm text-indigo-600">{isDhlTab ? d.daftra_value : d.platform_value}</td>
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
                <label className="block text-sm font-bold text-gray-500 mb-1.5">إجمالي دفترة (ريال)</label>
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

              {/* Payment Status */}
              <div>
                <label className="block text-sm font-bold text-gray-500 mb-1.5">حالة الدفع</label>
                <select
                  className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-semibold text-gray-900 dark:text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  value={editFields.paymentStatus}
                  onChange={e => setEditFields(p => ({ ...p, paymentStatus: e.target.value }))}
                >
                  <option value="">— اختر —</option>
                  <option value="مدفوع">مدفوع</option>
                  <option value="غير مدفوع">غير مدفوع</option>
                  <option value="مدفوع جزئياً">مدفوع جزئياً</option>
                </select>
              </div>

              {/* Live calc */}
              {(() => {
                const r = dhlJob.result?.results?.find((x: any) => x.airwaybill_number === editModal.awb)
                if (!r) return null
                const dhlTotal = r.dhl_data?.total_charge || 0
                const dafVal = editFields.daftraTotal ? parseFloat(editFields.daftraTotal) : null
                const diff = dafVal != null ? dhlTotal - dafVal : null
                return (
                  <div className="bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl p-4 flex flex-col gap-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500 font-bold">إجمالي DHL</span>
                      <span className="font-bold text-yellow-600">{formatCurrency(dhlTotal)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500 font-bold">إجمالي دفترة (يدوي)</span>
                      <span className="font-bold text-indigo-600">{dafVal != null ? formatCurrency(dafVal) : '—'}</span>
                    </div>
                    <div className="border-t border-gray-200 dark:border-slate-700 pt-2 mt-1 flex justify-between text-base">
                      <span className="font-bold text-gray-900 dark:text-white">الفرق</span>
                      <span className={`font-black ${diff != null ? (diff > 0.01 ? 'text-red-600' : diff < -0.01 ? 'text-green-600' : 'text-gray-400') : 'text-gray-400'}`}>
                        {diff != null ? `${diff > 0 ? '+' : ''}${formatCurrency(diff)}` : '—'}
                      </span>
                    </div>
                  </div>
                )
              })()}

              {/* Actions */}
              <div className="flex gap-3 mt-2">
                <button
                  className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm transition-all shadow-lg shadow-indigo-500/20"
                  onClick={saveEdit}
                >
                  ✓ حفظ التعديل
                </button>
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

      {/* ─── Edit Modal (Manual Override) ─── */}
      {editModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setEditModal({ open: false, awb: null })} />
          <div className="relative bg-white dark:bg-slate-800 w-full max-w-md rounded-3xl shadow-2xl border border-gray-200 dark:border-slate-700 overflow-hidden">
            <div className="p-5 border-b border-gray-100 dark:border-slate-700/50 flex justify-between items-center bg-gray-50/50 dark:bg-slate-900/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 rounded-xl">
                  <Edit3 size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-white text-lg leading-tight">تعديل يدوي</h3>
                  <p className="text-[11px] text-gray-500 font-medium font-mono mt-0.5">{editModal.awb}</p>
                </div>
              </div>
              <button onClick={() => setEditModal({ open: false, awb: null })} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-xl transition-all">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-500">اسم العميل</label>
                <input value={editFields.client} onChange={e => setEditFields(p => ({ ...p, client: e.target.value }))}
                  className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 font-bold" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-500">الوزن (كجم)</label>
                <input type="number" value={editFields.weight} onChange={e => setEditFields(p => ({ ...p, weight: e.target.value }))}
                  className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 font-bold font-mono" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-500">سعر دفترة (ر.س)</label>
                <input type="number" value={editFields.daftraTotal} onChange={e => setEditFields(p => ({ ...p, daftraTotal: e.target.value }))}
                  className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 font-bold font-mono" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-500">حالة الدفع</label>
                <select value={editFields.paymentStatus} onChange={e => setEditFields(p => ({ ...p, paymentStatus: e.target.value }))}
                  className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 font-bold">
                  <option value="">-- غير محدد --</option>
                  <option value="0">غير مدفوع</option>
                  <option value="1">جزئي</option>
                  <option value="2">مدفوع</option>
                </select>
              </div>

              {/* Live Preview */}
              {editFields.daftraTotal && editModal.awb && (() => {
                const r = dhlJob.result?.results?.find((x: any) => x.airwaybill_number === editModal.awb)
                const dhlCharge = r?.dhl_data?.total_charge || 0
                const newDaftra = parseFloat(editFields.daftraTotal) || 0
                const newDiff = newDaftra - dhlCharge
                const newMargin = dhlCharge > 0 ? ((newDaftra - dhlCharge) / dhlCharge * 100) : 0
                return (
                  <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800/30 rounded-xl p-3 space-y-1">
                    <p className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 mb-1">معاينة مباشرة</p>
                    <div className="flex justify-between text-xs font-bold">
                      <span className="text-gray-500">سعر DHL:</span>
                      <span className="text-yellow-600 font-mono">{formatCurrency(dhlCharge)}</span>
                    </div>
                    <div className="flex justify-between text-xs font-bold">
                      <span className="text-gray-500">سعر دفترة:</span>
                      <span className="text-indigo-600 font-mono">{formatCurrency(newDaftra)}</span>
                    </div>
                    <div className="flex justify-between text-xs font-bold">
                      <span className="text-gray-500">الفرق:</span>
                      <span className={`font-mono ${newDiff >= 0 ? 'text-green-600' : 'text-red-600'}`}>{newDiff > 0 ? '+' : ''}{formatCurrency(newDiff)}</span>
                    </div>
                    <div className="flex justify-between text-xs font-bold">
                      <span className="text-gray-500">الهامش:</span>
                      <span className={`font-mono ${newMargin >= 0 ? 'text-green-600' : 'text-red-600'}`}>{newMargin > 0 ? '+' : ''}{newMargin.toFixed(1)}%</span>
                    </div>
                  </div>
                )
              })()}

              <div className="flex gap-3 pt-2">
                <button onClick={saveEdit}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl font-bold text-sm shadow-lg shadow-indigo-500/20 transition-all">
                  حفظ التعديلات
                </button>
                <button onClick={() => setEditModal({ open: false, awb: null })}
                  className="px-6 py-3 bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 rounded-xl font-bold text-sm hover:bg-gray-200 dark:hover:bg-slate-600 transition-all">
                  إلغاء
                </button>
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
                          <span className="text-[10px] bg-gray-100 dark:bg-slate-700 px-2 py-0.5 rounded-md text-gray-600 dark:text-gray-400 font-mono">{new Date(h.upload_date).toLocaleString('ar-EG')}</span>
                        </div>
                        <div className="flex flex-wrap gap-4 text-xs font-bold text-gray-600 dark:text-gray-300">
                          <div className="flex items-center gap-1.5"><span className="text-indigo-500">DHL:</span> <span className="font-mono">{Number(h.total_dhl_amount).toFixed(2)} ر.س</span></div>
                          <div className="flex items-center gap-1.5"><span className="text-blue-500">دفترة:</span> <span className="font-mono">{Number(h.total_platform_amount).toFixed(2)} ر.س</span></div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-gray-500">الفرق:</span> 
                            <span className={`font-mono ${Number(h.difference) < 0 ? 'text-red-500' : 'text-green-500'}`}>
                              {Number(h.difference) > 0 ? '+' : ''}{Number(h.difference).toFixed(2)} ر.س
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 w-full md:w-auto">
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