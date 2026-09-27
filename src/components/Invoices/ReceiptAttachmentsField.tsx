import { useEffect, useRef, useState } from 'react'
import { ImagePlus, Trash2, Loader2, X } from 'lucide-react'
import type { InvoiceReceipt } from '../../utils/models'
import { invoiceService } from '../../services/invoiceService'

const MAX_FILES = 10
const MAX_SIZE_MB = 5
const ACCEPT = 'image/*,.pdf'

type Props = {
  invoiceId?: string | number
  /** Already-saved receipts (only non-empty when editing an existing invoice
   *  that has some). Deleting one calls the API immediately. */
  existing: InvoiceReceipt[]
  onExistingChange: (next: InvoiceReceipt[]) => void
  /** Newly-picked files not uploaded yet — uploaded together at Save time,
   *  same as the rest of the invoice form. Removing one here is purely
   *  local (no API call) since nothing was ever persisted for it. This is
   *  the single source of truth for pending files — previews below are
   *  derived from it, not tracked separately, so they can never desync
   *  from what the parent actually holds. */
  pendingFiles: File[]
  onPendingFilesChange: (next: File[]) => void
  disabled?: boolean
}

function isImageUrl(url: string) {
  return url.startsWith('data:image') || /\.(png|jpe?g|gif|webp)$/i.test(url)
}

export function ReceiptAttachmentsField({
  invoiceId,
  existing,
  onExistingChange,
  pendingFiles,
  onPendingFilesChange,
  disabled,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [pickError, setPickError] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<string | null>(null)

  // Object URLs derived from pendingFiles — recomputed whenever the file
  // list itself changes, and always revoked on cleanup to avoid leaks.
  const [previewUrls, setPreviewUrls] = useState<(string | null)[]>([])
  useEffect(() => {
    const urls = pendingFiles.map((f) => (f.type.startsWith('image/') ? URL.createObjectURL(f) : null))
    setPreviewUrls(urls)
    return () => {
      urls.forEach((u) => { if (u) URL.revokeObjectURL(u) })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingFiles])

  const totalCount = existing.length + pendingFiles.length

  const handlePick = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return
    setPickError(null)
    const incoming = Array.from(fileList)

    if (totalCount + incoming.length > MAX_FILES) {
      setPickError(`الحد الأقصى ${MAX_FILES} صور لكل فاتورة (لديك ${totalCount} حاليًا)`)
      return
    }
    const tooLarge = incoming.find((f) => f.size > MAX_SIZE_MB * 1024 * 1024)
    if (tooLarge) {
      setPickError(`حجم الملف "${tooLarge.name}" أكبر من ${MAX_SIZE_MB} ميجابايت`)
      return
    }

    onPendingFilesChange([...pendingFiles, ...incoming])
    if (inputRef.current) inputRef.current.value = ''
  }

  const removePending = (index: number) => {
    onPendingFilesChange(pendingFiles.filter((_, i) => i !== index))
  }

  const removeExisting = async (receipt: InvoiceReceipt) => {
    if (!invoiceId) return
    if (!window.confirm('حذف هذه الصورة نهائيًا؟ لا يمكن التراجع عن هذا الإجراء.')) return
    setDeletingId(receipt.id)
    try {
      await invoiceService.deleteTransferReceipt(invoiceId, receipt.id)
      onExistingChange(existing.filter((r) => r.id !== receipt.id))
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'فشل حذف الصورة')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="flex flex-col gap-2 sm:col-span-2 mt-1">
      <label className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
        <ImagePlus size={14} /> إرفاق سند التحويل البنكي
      </label>

      {(existing.length > 0 || pendingFiles.length > 0) && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {existing.map((r) => (
            <div key={`existing-${r.id}`} className="relative group">
              {isImageUrl(r.data_url) ? (
                <img
                  src={r.data_url}
                  alt="سند التحويل"
                  onClick={() => setLightbox(r.data_url)}
                  className="w-full h-28 object-cover rounded-xl border-2 border-emerald-200 dark:border-emerald-800/40 bg-white dark:bg-slate-900 cursor-zoom-in"
                />
              ) : (
                <a
                  href={r.data_url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center w-full h-28 rounded-xl border-2 border-emerald-200 dark:border-emerald-800/40 bg-emerald-50 dark:bg-emerald-900/10 text-xs font-bold text-emerald-700 dark:text-emerald-400"
                >
                  ملف PDF
                </a>
              )}
              <button
                type="button"
                disabled={disabled || deletingId === r.id}
                className="absolute top-1.5 left-1.5 p-1.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg hover:bg-red-600 disabled:opacity-50"
                onClick={() => removeExisting(r)}
                title="حذف الصورة"
              >
                {deletingId === r.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              </button>
            </div>
          ))}

          {pendingFiles.map((file, i) => (
            <div key={`pending-${i}`} className="relative group">
              {previewUrls[i] ? (
                <img
                  src={previewUrls[i]!}
                  alt="صورة جديدة (لم تُحفظ بعد)"
                  onClick={() => setLightbox(previewUrls[i])}
                  className="w-full h-28 object-cover rounded-xl border-2 border-dashed border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 cursor-zoom-in"
                />
              ) : (
                <div className="flex items-center justify-center w-full h-28 rounded-xl border-2 border-dashed border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/10 text-xs font-bold text-amber-700 dark:text-amber-400 px-2 text-center">
                  {file.name}
                </div>
              )}
              <span className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-amber-500 text-white text-[9px] font-bold rounded-md">
                لم تُحفظ بعد
              </span>
              <button
                type="button"
                disabled={disabled}
                className="absolute top-1.5 left-1.5 p-1.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg hover:bg-red-600 disabled:opacity-50"
                onClick={() => removePending(i)}
                title="إزالة الصورة"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        disabled={disabled || totalCount >= MAX_FILES}
        className="flex flex-col items-center justify-center gap-2 py-5 border-2 border-dashed border-emerald-300 dark:border-emerald-700 rounded-xl bg-emerald-50/50 dark:bg-emerald-900/10 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        onClick={() => inputRef.current?.click()}
      >
        <ImagePlus size={24} className="text-emerald-500 dark:text-emerald-400" />
        <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
          {totalCount === 0 ? 'اضغط لإرفاق صورة سند التحويل' : 'إضافة صورة أخرى'}
        </span>
        <span className="text-[10px] text-gray-400 dark:text-gray-500">
          JPG, PNG, WEBP, PDF — حتى {MAX_SIZE_MB} ميجابايت لكل صورة، {MAX_FILES} صور كحد أقصى ({totalCount}/{MAX_FILES})
        </span>
      </button>

      {pickError && (
        <p className="text-[11px] font-bold text-red-500 dark:text-red-400">{pickError}</p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => handlePick(e.target.files)}
      />

      {lightbox && (
        <div
          className="fixed inset-0 z-[80] bg-black/80 flex items-center justify-center p-6"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            className="absolute top-4 left-4 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white"
            onClick={() => setLightbox(null)}
          >
            <X size={20} />
          </button>
          <img src={lightbox} alt="سند التحويل" className="max-w-full max-h-full rounded-xl object-contain" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  )
}
