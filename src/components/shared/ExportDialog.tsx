import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import {
  AlertCircle, CalendarRange, CheckCircle2, Download, FileSpreadsheet, Filter, Loader2, X,
} from 'lucide-react'
import { Dialog } from './Dialog'
import {
  EXPORT_PRESETS,
  computeExportRange,
  describeRange,
  rangeParams,
  riyadhToday,
  type ExportFormat,
  type ExportPresetKey,
  type ExportRange,
} from '../../utils/exportPeriods'
import { downloadExport, fetchExportCount, type ExportParams } from '../../services/exportService'

export type ExportDialogProps = {
  open: boolean
  onClose: () => void
  /** e.g. "تصدير الفواتير" */
  title: string
  /** Backend export endpoint, e.g. "/invoices/export" */
  endpoint: string
  /** Format of the button that opened the dialog (switchable inside). */
  initialFormat: ExportFormat
  /** The page's current filters (without dates) — sent as-is with the export. */
  params: ExportParams
  /** Human-readable list of the page filters that will apply. */
  filterLabels: string[]
  /** Which date the period applies to on this page. */
  dateFieldNote: string
  /** File name prefix used if the server does not name the file. */
  fileBase: string
  /** Range the page currently shows (offered as "الفترة المعروضة حاليًا"). */
  currentRange?: ExportRange
  defaultPreset?: ExportPresetKey
  /** What one row is, for the counter ("فاتورة", "عميل", "عملية"). */
  rowNoun?: string
}

const fmtBytes = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`)

export function ExportDialog(props: ExportDialogProps) {
  const {
    open, onClose, title, endpoint, initialFormat, params, filterLabels, dateFieldNote,
    fileBase, currentRange, defaultPreset = 'all', rowNoun = 'سجل',
  } = props
  const headingId = useId()
  const [format, setFormat] = useState<ExportFormat>(initialFormat)
  const [preset, setPreset] = useState<ExportPresetKey>(defaultPreset)
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [countRes, setCountRes] = useState<{ key: string; n?: number; error?: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const busyRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)

  // Fresh state every time it opens (derived during render, not in an effect).
  const [wasOpen, setWasOpen] = useState(false)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      const today = riyadhToday()
      setFormat(initialFormat)
      setPreset(defaultPreset)
      setCustomFrom(currentRange?.from || today.slice(0, 8) + '01')
      setCustomTo(currentRange?.to || today)
      setError(null)
      setProgress(0)
    }
  }

  const paramsKey = JSON.stringify(params)
  const result = useMemo(
    () => computeExportRange(preset, { custom: { from: customFrom, to: customTo }, current: currentRange }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [preset, customFrom, customTo, currentRange?.from, currentRange?.to],
  )
  const range = result.ok ? result.range : null
  const allParams = useMemo<ExportParams>(
    () => (range ? { ...params, ...rangeParams(range) } : params),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [paramsKey, range?.from, range?.to],
  )

  // Live row count for the chosen period + filters. A result only counts for
  // the exact parameters it was fetched with, so a stale number never shows.
  const countKey = range ? `${endpoint}?${JSON.stringify(allParams)}` : ''
  const current = countRes && countRes.key === countKey ? countRes : null
  const counting = Boolean(countKey) && !current
  const count = current?.n ?? null
  const countError = current?.error ?? null
  useEffect(() => {
    if (!open || !countKey) return
    const ctrl = new AbortController()
    const t = window.setTimeout(() => {
      fetchExportCount(endpoint, allParams, ctrl.signal)
        .then((n) => setCountRes({ key: countKey, n }))
        .catch((e: unknown) => {
          if (!ctrl.signal.aborted) setCountRes({ key: countKey, error: e instanceof Error ? e.message : 'تعذّر حساب عدد السجلات' })
        })
    }, 250)
    return () => { ctrl.abort(); window.clearTimeout(t) }
  }, [open, countKey, endpoint, allParams])

  const requestClose = () => {
    if (busyRef.current) {
      abortRef.current?.abort()
      busyRef.current = false
      setBusy(false)
    }
    onClose()
  }

  const startExport = async () => {
    if (busyRef.current || !range) return // double-click guard
    busyRef.current = true
    setBusy(true)
    setError(null)
    setProgress(0)
    const ctrl = new AbortController()
    abortRef.current = ctrl
    try {
      const span = range.from && range.to ? `${range.from}_to_${range.to}` : `all_${riyadhToday()}`
      const { filename } = await downloadExport(endpoint, allParams, format, {
        fallbackName: `${fileBase}_${span}.${format}`,
        signal: ctrl.signal,
        onProgress: setProgress,
      })
      toast.success(`تم تنزيل الملف ${filename}${count != null ? ` (${count.toLocaleString('en-US')} ${rowNoun})` : ''}`)
      busyRef.current = false
      setBusy(false)
      onClose()
    } catch (e: unknown) {
      if (ctrl.signal.aborted) return
      setError(e instanceof Error && e.message ? e.message : 'تعذّر تجهيز ملف التصدير، حاول مرة أخرى')
      busyRef.current = false
      setBusy(false)
    }
  }

  const presetBtn = (key: ExportPresetKey, label: string) => (
    <button
      key={key}
      type="button"
      onClick={() => setPreset(key)}
      disabled={busy}
      aria-pressed={preset === key}
      className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all text-center ${
        preset === key
          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
          : 'bg-white dark:bg-slate-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-slate-700 hover:border-indigo-300'
      }`}
    >
      {label}
    </button>
  )

  const canExport = Boolean(range) && !busy && !counting && count !== 0 && !countError

  return (
    <Dialog open={open} onRequestClose={requestClose} labelledBy={headingId} panelClassName="sm:max-w-2xl max-h-[92dvh]">
      <div className="flex items-center justify-between gap-3 p-5 border-b border-gray-100 dark:border-slate-700/60">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 shrink-0">
            <FileSpreadsheet size={20} />
          </div>
          <div className="min-w-0">
            <h2 id={headingId} className="font-black text-base text-gray-900 dark:text-white truncate">{title}</h2>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 font-bold">اختر الفترة ثم أكّد — يُصدَّر كل السجلات المطابقة وليس الصفحة الحالية فقط</p>
          </div>
        </div>
        <button type="button" onClick={requestClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-slate-700" aria-label="إغلاق">
          <X size={18} />
        </button>
      </div>

      <div className="p-5 space-y-5 overflow-y-auto flex-1 min-h-0">
        {/* Format */}
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="صيغة الملف">
          {(['xlsx', 'csv'] as const).map((f) => (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={format === f}
              disabled={busy}
              onClick={() => setFormat(f)}
              className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold border transition-all ${
                format === f
                  ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800'
                  : 'bg-white dark:bg-slate-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-slate-700'
              }`}
            >
              {f === 'xlsx' ? <FileSpreadsheet size={16} /> : <Download size={16} />}
              {f === 'xlsx' ? 'Excel (.xlsx)' : 'CSV (.csv)'}
            </button>
          ))}
        </div>

        {/* Period */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-black text-gray-700 dark:text-gray-200">
            <CalendarRange size={14} className="text-indigo-500" /> الفترة
            <span className="font-bold text-gray-400">— {dateFieldNote}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {currentRange && presetBtn('current', 'الفترة المعروضة حاليًا')}
            {EXPORT_PRESETS.map((p) => presetBtn(p.key, p.label))}
          </div>
          {preset === 'custom' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <label className="flex flex-col gap-1 text-[11px] font-bold text-gray-500 dark:text-gray-400">
                من تاريخ
                <input type="date" value={customFrom} max={customTo || undefined} onChange={(e) => setCustomFrom(e.target.value)} disabled={busy}
                  className="bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm font-inter text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/30 outline-none" />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-bold text-gray-500 dark:text-gray-400">
                إلى تاريخ
                <input type="date" value={customTo} min={customFrom || undefined} onChange={(e) => setCustomTo(e.target.value)} disabled={busy}
                  className="bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm font-inter text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/30 outline-none" />
              </label>
            </div>
          )}
        </div>

        {/* What will be exported */}
        <div className="rounded-2xl border border-indigo-100 dark:border-indigo-900/40 bg-indigo-50/60 dark:bg-indigo-950/20 p-4 space-y-2.5 text-sm">
          {result.ok ? (
            <div className="font-black text-gray-900 dark:text-white">
              الفترة المختارة: <span className="font-inter text-indigo-700 dark:text-indigo-300" dir="rtl">{describeRange(result.range)}</span>
              {result.range.from && result.range.to && <span className="text-[11px] font-bold text-gray-500"> (شاملة اليومين)</span>}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-red-600 dark:text-red-400 font-bold"><AlertCircle size={15} /> {result.error}</div>
          )}
          <div className="flex items-start gap-1.5 text-xs text-gray-600 dark:text-gray-300">
            <Filter size={13} className="mt-0.5 shrink-0 text-indigo-500" />
            {filterLabels.length ? (
              <div className="flex flex-wrap gap-1.5">
                <span className="font-bold">مع فلاتر الصفحة الحالية:</span>
                {filterLabels.map((l) => (
                  <span key={l} className="px-2 py-0.5 rounded-md bg-white dark:bg-slate-800 border border-indigo-100 dark:border-slate-700 font-bold">{l}</span>
                ))}
              </div>
            ) : (
              <span className="font-bold">بدون فلاتر إضافية — كل السجلات داخل الفترة</span>
            )}
          </div>
          <div className="text-xs font-black">
            {counting ? (
              <span className="flex items-center gap-1.5 text-gray-500"><Loader2 size={13} className="animate-spin" /> جاري حساب عدد السجلات...</span>
            ) : countError ? (
              <span className="text-red-600 dark:text-red-400">{countError}</span>
            ) : count === 0 ? (
              <span className="text-amber-600 dark:text-amber-400">لا توجد بيانات مطابقة لهذه الفترة والفلاتر</span>
            ) : count != null ? (
              <span className="text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 size={14} /> سيتم تصدير <span className="font-inter">{count.toLocaleString('en-US')}</span> {rowNoun} بكل الأعمدة
              </span>
            ) : null}
          </div>
        </div>

        {error && (
          <div role="alert" className="flex items-start gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 text-red-700 dark:text-red-300 text-xs font-bold">
            <AlertCircle size={16} className="shrink-0" /> {error}
          </div>
        )}
      </div>

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 p-4 border-t border-gray-100 dark:border-slate-700/60 bg-gray-50/60 dark:bg-slate-900/20">
        <button type="button" onClick={requestClose} className="px-5 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 text-sm font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800">
          {busy ? 'إلغاء التصدير' : 'إلغاء'}
        </button>
        <button
          type="button"
          onClick={() => void startExport()}
          disabled={!canExport}
          className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
          {busy
            ? `جاري تجهيز الملف...${progress > 0 ? ` ${fmtBytes(progress)}` : ''}`
            : `تصدير ${format === 'xlsx' ? 'Excel' : 'CSV'}${count ? ` (${count.toLocaleString('en-US')})` : ''}`}
        </button>
      </div>
    </Dialog>
  )
}
