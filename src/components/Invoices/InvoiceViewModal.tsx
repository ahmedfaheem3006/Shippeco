import { useEffect, useMemo, useState } from 'react'
import type { Invoice, InvoiceItem } from '../../utils/models'
import { invoiceService } from '../../services/invoiceService'
import { enrichSingleInvoice } from '../../services/dbService'
import styles from './InvoiceViewModal.module.css'
import {
  X, CheckCircle2, Circle, AlertTriangle, RotateCcw,
  Phone, Package, Truck, DollarSign, FileText, Send,
  Edit3, Trash2, Plus, Calendar, Hash, CreditCard,
  ArrowUpRight, ArrowDownRight, User, MapPin, Box, Scale,
  Loader2, RefreshCw, CreditCard as PaymobIcon, Copy, Check
} from 'lucide-react'
import { createPaymentLink, checkPayment } from '../../services/paymobService'
import { api } from '../../utils/apiClient'
import { useAuthStore } from '../../hooks/useAuthStore'
import { useSettingsStore } from '../../hooks/useSettingsStore'
import { downloadInvoicePDF, shareInvoiceWhatsApp } from '../../utils/pdfGenerator'
import { Download, MessageCircle } from 'lucide-react'

type Props = {
  open: boolean
  invoice: Invoice | null
  onClose: () => void
  onEdit: () => void
  onAddItem: () => void
  onCollect: () => void
  onDelete: () => void
  onRefresh?: () => void
}

function getInvItems(inv: Invoice): InvoiceItem[] {
  let items: unknown = inv.items
  if (typeof items === 'string') {
    try { items = JSON.parse(items) } catch { items = [] }
  }
  if (Array.isArray(items) && items.length) {
    // Normalize items from backend format to display format
    return items.map((it: any) => ({
      type: it.type || it.description || 'بند',
      details: it.details || it.description || '',
      price: Number(it.price || it.total || it.unit_price || 0),
    }))
  }
  // No items — create one from invoice data
  return [{
    type: inv.itemType || 'شحن دولي',
    details: inv.details || '',
    price: Number(inv.price || 0),
  }]
}

function StatusBadge({ status }: { status: Invoice['status'] }) {
  if (status === 'paid')
    return <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/30"><CheckCircle2 size={14} /> مدفوعة بالكامل</span>
  if (status === 'partial')
    return <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800/20"><AlertTriangle size={14} /> مدفوعة جزئياً</span>
  if (status === 'returned')
    return <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800/30"><RotateCcw size={14} /> مرتجعة</span>
  return <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30"><Circle size={14} /> بانتظار الدفع</span>
}

export function InvoiceViewModal({ open, invoice, onClose, onEdit, onAddItem, onCollect, onDelete, onRefresh }: Props) {
  const [loadingFull, setLoadingFull] = useState(false)
  const [enriching, setEnriching] = useState(false)
  const [fullInvoice, setFullInvoice] = useState<Invoice | null>(null)
  const [creatingLink, setCreatingLink] = useState(false)
  const [copied, setCopied] = useState(false)
  const [localToast, setLocalToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const user = useAuthStore(s => s.user)
  const isAdmin = user?.role === 'admin'
  const invoiceTemplate = useSettingsStore(s => s.invoiceTemplate)

  // الفاتورة النهائية المعروضة
  const displayInv = fullInvoice ?? invoice

  // عند فتح المودال → جلب البيانات الكاملة من DB
  useEffect(() => {
    if (!open || !invoice) {
      setFullInvoice(null)
      return
    }

    let cancelled = false

    const loadFull = async () => {
      setLoadingFull(true)
      try {
        const data = await invoiceService.getInvoice(String(invoice.id))
        if (cancelled) return

        // Parse items
        let items: InvoiceItem[] = []
        try {
          items = typeof data.items === 'string' ? JSON.parse(data.items) : (data.items || [])
        } catch { items = [] }

        const fullData: Invoice = { ...invoice, ...data, items }
        setFullInvoice(fullData)

        // لو البيانات ناقصة → enrich من دفترة
        const needsEnrich = (data as any).needs_enrichment && data.daftra_id
        if (needsEnrich && !cancelled) {
          setEnriching(true)
          try {
            const enriched = await enrichSingleInvoice(data.daftra_id!)
            if (!cancelled && enriched.ok && enriched.invoice) {
              let enrichedItems: InvoiceItem[] = []
              try {
                enrichedItems = typeof enriched.invoice.items === 'string'
                  ? JSON.parse(enriched.invoice.items as string)
                  : (enriched.invoice.items || [])
              } catch { enrichedItems = [] }
              setFullInvoice({ ...fullData, ...enriched.invoice, items: enrichedItems })
            }
          } catch {
            // فشل الإثراء — نعرض البيانات الموجودة
          } finally {
            if (!cancelled) setEnriching(false)
          }
        }
      } catch {
        // فشل جلب التفاصيل — نعرض البيانات الأساسية
        setFullInvoice(null)
      } finally {
        if (!cancelled) setLoadingFull(false)
      }
    }

    void loadFull()
    return () => { cancelled = true }
  }, [open, invoice?.id, invoice?.daftra_id])

  // إعادة الإثراء يدوياً
  const handleManualEnrich = async () => {
    const daftraId = displayInv?.daftra_id
    if (!daftraId || enriching) return
    setEnriching(true)
    try {
      const enriched = await enrichSingleInvoice(daftraId)
      if (enriched.ok && enriched.invoice) {
        let items: InvoiceItem[] = []
        try {
          items = typeof enriched.invoice.items === 'string'
            ? JSON.parse(enriched.invoice.items as string)
            : (enriched.invoice.items || [])
        } catch { items = [] }
        setFullInvoice(prev => ({ ...(prev ?? invoice!), ...enriched.invoice, items }))
      }
    } catch { /* silent */ }
    finally { setEnriching(false) }
  }

  const handlePaymob = async () => {
    if (!displayInv) return
    
    if (displayInv.status === 'paid') {
      setLocalToast({ type: 'error', message: 'الفاتورة مدفوعة بالفعل!' })
      setTimeout(() => setLocalToast(null), 3000)
      return
    }

    if (displayInv.status === 'returned') {
      setLocalToast({ type: 'error', message: 'الفاتورة مرتجعة، لا يمكن الدفع.' })
      setTimeout(() => setLocalToast(null), 3000)
      return
    }

    setCreatingLink(true)
    let newWindow: Window | null = null;
    // On some mobile browsers, window.open must be called directly in the click event
    if (window.innerWidth < 768) {
      newWindow = window.open('', '_blank');
    }

    try {
      const res = await createPaymentLink({
        invoice_id: String(displayInv.id),
        amount: remainingAmount,
        client_name: displayInv.client,
        client_phone: displayInv.phone || '0500000000',
        description: `دفع فاتورة #${displayInv.invoice_number || displayInv.id}`
      })

      if (res.payment_url_full || res.payment_url) {
        const url = res.payment_url_full || res.payment_url
        if (newWindow) {
          newWindow.location.href = url!;
        } else {
          window.open(url!, '_blank')
        }
        setLocalToast({ type: 'success', message: 'تم إنشاء رابط الدفع وفتحه بنجاح' })
        
        // Audit: generate paymob link
        try {
          await api.post('/audit/write', {
            action: 'payment_link',
            entityType: 'invoice',
            entityId: parseInt(String(displayInv.id), 10),
            newData: { amount: remainingAmount, url }
          })
        } catch { /* silent */ }
      }
    } catch (err: any) {
      console.error('[Paymob] Error:', err)
      setLocalToast({ type: 'error', message: err.message || 'فشل إنشاء رابط الدفع' })
    } finally {
      setCreatingLink(false)
      setTimeout(() => setLocalToast(null), 4000)
    }
  }

  const handleCopyLink = async () => {
    if (!displayInv || creatingLink) return
    
    if (displayInv.status === 'paid') {
      setLocalToast({ type: 'error', message: 'الفاتورة مدفوعة بالفعل!' })
      setTimeout(() => setLocalToast(null), 3000)
      return
    }

    setCreatingLink(true)
    try {
      const res = await createPaymentLink({
        invoice_id: String(displayInv.id),
        amount: remainingAmount,
        client_name: displayInv.client,
        client_phone: displayInv.phone || '0500000000',
        description: `دفع فاتورة #${displayInv.invoice_number || displayInv.id}`
      })

      const url = res.payment_url_full || res.payment_url
      if (url) {
        let success = false;
        // On mobile, navigator.clipboard often fails due to strict permission/context rules.
        // We use the textarea fallback as a primary or reliable secondary.
        if (window.innerWidth < 768) {
          const textArea = document.createElement("textarea");
          textArea.value = url;
          textArea.style.position = "fixed";
          textArea.style.left = "-9999px";
          textArea.style.top = "0";
          document.body.appendChild(textArea);
          textArea.focus();
          textArea.select();
          try {
            success = document.execCommand('copy');
          } catch (copyErr) {
            console.error('Mobile fallback copy failed', copyErr);
          }
          document.body.removeChild(textArea);
        }

        if (!success) {
          try {
            await navigator.clipboard.writeText(url);
            success = true;
          } catch (err) {
            const textArea = document.createElement("textarea");
            textArea.value = url;
            document.body.appendChild(textArea);
            textArea.select();
            try {
              success = document.execCommand('copy');
            } catch (copyErr) {
              console.error('Final fallback copy failed', copyErr);
            }
            document.body.removeChild(textArea);
          }
        }
        
        if (success) {
          setCopied(true)
          setLocalToast({ type: 'success', message: 'تم نسخ رابط الدفع!' })
          setTimeout(() => setCopied(false), 2000)
        } else {
          setLocalToast({ type: 'error', message: 'فشل النسخ تلقائياً، يرجى نسخ الرابط يدوياً' })
        }
        
        // Audit
        try {
          await api.post('/audit/write', {
            action: 'payment_link_copy',
            entityType: 'invoice',
            entityId: parseInt(String(displayInv.id), 10),
            newData: { amount: remainingAmount, url }
          })
        } catch { /* silent */ }
      }
    } catch (err: any) {
      setLocalToast({ type: 'error', message: err.message || 'فشل إنشاء الرابط' })
    } finally {
      setCreatingLink(false)
      setTimeout(() => setLocalToast(null), 4000)
    }
  }

  const items = useMemo(() => (displayInv ? getInvItems(displayInv) : []), [displayInv])
  const total = useMemo(() => {
    // Use invoice total first (from DB), fallback to items sum
    const invTotal = Number(displayInv?.price || displayInv?.total || 0)
    if (invTotal > 0) return invTotal
    return items.reduce((s, it) => s + (Number(it.price) || 0), 0)
  }, [displayInv, items])

  const paidAmount = useMemo(() => {
    if (!displayInv) return 0
    if (displayInv.status === 'paid') return total
    // Read from all possible field names
    const paid = Number(
      (displayInv as any).paid_amount ?? 
      displayInv.partialPaid ?? 
      displayInv.partial_paid ?? 
      0
    )
    return paid
  }, [displayInv, total])

  const remainingAmount = useMemo(() => {
    if (!displayInv) return 0
    if (displayInv.status === 'paid') return 0
    return Math.max(0, total - paidAmount)
  }, [displayInv, total, paidAmount])

  const dhlCost = Number(displayInv?.dhl_cost || displayInv?.dhlCost || (displayInv as any)?.dhl_cost || 0)
  const profit = total > 0 && dhlCost > 0 ? total - dhlCost : 0

  if (!open || !displayInv) return null

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true">
      <div className={styles.modal}>

        {/* Local Toast */}
        {localToast && (
          <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-[300] px-6 py-3 rounded-2xl shadow-2xl border flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300 ${
            localToast.type === 'success' 
              ? 'bg-green-600 text-white border-green-500' 
              : 'bg-red-600 text-white border-red-500'
          }`}>
            {localToast.type === 'success' ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
            <span className="font-bold text-sm">{localToast.message}</span>
          </div>
        )}

        {/* ═══ Header ═══ */}
        <div className={styles.header}>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-xl border border-indigo-100 dark:border-indigo-800/20 hidden sm:flex">
              <FileText size={22} />
            </div>
            <div>
              <h2 className={styles.title}>
                <span className="flex items-center gap-2">
                  فاتورة #{displayInv.invoice_number || displayInv.daftra_id || displayInv.id}
                  {displayInv.isDraft && <span className="text-[9px] bg-gray-200 dark:bg-slate-700 text-gray-500 px-2 py-0.5 rounded uppercase font-inter">مسودة</span>}
                  {(loadingFull || enriching) && (
                    <span className="inline-flex items-center gap-1 text-[9px] bg-blue-50 dark:bg-blue-900/20 text-blue-500 px-2 py-0.5 rounded">
                      <Loader2 size={10} className="animate-spin" />
                      {loadingFull ? 'جاري التحميل...' : 'جلب التفاصيل...'}
                    </span>
                  )}
                </span>
              </h2>
              <div className="text-xs text-gray-500 dark:text-gray-400 font-semibold mt-0.5">
                <span className="text-gray-400">العميل:</span>{' '}
                <span className="text-gray-900 dark:text-white">{displayInv.client}</span>
                {displayInv.phone && <span className="text-green-500 mr-2">· {displayInv.phone}</span>}
                {displayInv.daftra_id && <span className="text-indigo-500 mr-2">· دفترة #{displayInv.daftra_id}</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {displayInv.daftra_id && (
              <button
                type="button"
                title="إعادة جلب التفاصيل من دفترة"
                className="text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors p-2 rounded-xl"
                onClick={handleManualEnrich}
                disabled={enriching}
              >
                <RefreshCw size={16} className={enriching ? 'animate-spin' : ''} />
              </button>
            )}
            <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ═══ Body ═══ */}
        <div className={styles.body}>

          {/* ─── بيانات أساسية ─── */}
          <div className={styles.topGrid}>
            <div className={styles.card}>
              <div className={styles.k}><Calendar size={13} /> الحالة</div>
              <StatusBadge status={displayInv.status} />
            </div>
            <div className={styles.card}>
              <div className={styles.k}><Calendar size={13} /> التاريخ</div>
              <div className={styles.v}>{String(displayInv.date).slice(0, 10) || '—'}</div>
            </div>
            <div className={styles.card}>
              <div className={styles.k}><Phone size={13} /> جوال العميل</div>
              <div className={`${styles.v} ${styles.mono}`} dir="ltr">{displayInv.phone || '—'}</div>
            </div>
            <div className={styles.card}>
              <div className={styles.k}><Hash size={13} /> رقم دفترة</div>
              <div className={`${styles.v} ${styles.mono}`}>{displayInv.daftra_id ? `#${displayInv.daftra_id}` : '—'}</div>
            </div>
          </div>

          {/* ─── بيانات الشحن ─── */}
          <div className={styles.topGrid} style={{ marginTop: 12 }}>
            <div className={styles.card}>
              <div className={styles.k}><Package size={13} /> رقم البوليصة (AWB)</div>
              <div className={`${styles.v} ${styles.mono}`} dir="ltr">{displayInv.awb || '—'}</div>
            </div>
            <div className={styles.card}>
              <div className={styles.k}><Truck size={13} /> شركة الشحن</div>
              <div className={styles.v}>{displayInv.carrier || '—'}</div>
            </div>
          </div>

          {/* ─── المرسل والمستلم ─── */}
          {(displayInv.sender || displayInv.receiver || displayInv.sender_phone || displayInv.receiver_phone) && (
            <div style={{ marginTop: 12 }} className="bg-blue-50/50 dark:bg-blue-900/5 rounded-xl border border-blue-100 dark:border-blue-800/20 overflow-hidden">
              <div className="bg-blue-50 dark:bg-blue-900/10 px-4 py-2.5 border-b border-blue-100 dark:border-blue-800/20 text-xs font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                <Truck size={13} /> معلومات التوجيه اللوجستي
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4">
                {/* المرسل */}
                <div className="flex flex-col gap-2 p-3 bg-white dark:bg-slate-800 rounded-lg border border-gray-100 dark:border-slate-700">
                  <div className="text-[10px] font-bold text-blue-500 flex items-center gap-1 uppercase tracking-wider">
                    <Send size={10} /> المُرسل (Shipper)
                  </div>
                  <div className="text-sm font-bold text-gray-900 dark:text-white">
                    {displayInv.sender || displayInv.shipperName || '—'}
                  </div>
                  {(displayInv.sender_phone || displayInv.shipperPhone) && (
                    <div className="text-xs text-gray-500 font-inter" dir="ltr">
                      <Phone size={10} className="inline mr-1" />
                      {displayInv.sender_phone || displayInv.shipperPhone}
                    </div>
                  )}
                  {(displayInv.sender_address || displayInv.shipperAddress) && (
                    <div className="text-xs text-gray-500 flex items-start gap-1">
                      <MapPin size={10} className="mt-0.5 shrink-0" />
                      <span className="leading-relaxed">{displayInv.sender_address || displayInv.shipperAddress}</span>
                    </div>
                  )}
                </div>

                {/* المستلم */}
                <div className="flex flex-col gap-2 p-3 bg-white dark:bg-slate-800 rounded-lg border border-gray-100 dark:border-slate-700">
                  <div className="text-[10px] font-bold text-green-500 flex items-center gap-1 uppercase tracking-wider">
                    <User size={10} /> المُستلم (Receiver)
                  </div>
                  <div className="text-sm font-bold text-gray-900 dark:text-white">
                    {displayInv.receiver || displayInv.receiverName || '—'}
                  </div>
                  {(displayInv.receiver_phone || displayInv.receiverPhone) && (
                    <div className="text-xs text-gray-500 font-inter" dir="ltr">
                      <Phone size={10} className="inline mr-1" />
                      {displayInv.receiver_phone || displayInv.receiverPhone}
                    </div>
                  )}
                  {(displayInv.receiver_address || displayInv.receiverAddress) && (
                    <div className="text-xs text-gray-500 flex items-start gap-1">
                      <MapPin size={10} className="mt-0.5 shrink-0" />
                      <span className="leading-relaxed">{displayInv.receiver_address || displayInv.receiverAddress}</span>
                    </div>
                  )}
                  {(displayInv.receiver_country || displayInv.receiverCountry) && (
                    <div className="text-[10px] text-indigo-500 font-bold mt-1">
                      🌍 {displayInv.receiver_country || displayInv.receiverCountry}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ─── الوزن والأبعاد ─── */}
          {(displayInv.weight || displayInv.final_weight || displayInv.dimensions) && (
            <div className={styles.topGrid} style={{ marginTop: 12, gridTemplateColumns: '1fr 1fr 1fr' }}>
              <div className={styles.card}>
                <div className={styles.k}><Scale size={13} /> الوزن الفعلي</div>
                <div className={styles.v}>{displayInv.weight || '—'}</div>
              </div>
              <div className={styles.card} style={{ background: displayInv.final_weight ? 'rgba(245, 158, 11, 0.08)' : undefined, borderColor: displayInv.final_weight ? 'rgba(245, 158, 11, 0.2)' : undefined }}>
                <div className={styles.k} style={{ color: displayInv.final_weight ? '#d97706' : undefined }}>
                  <Scale size={13} /> الوزن النهائي
                </div>
                <div className={styles.v} style={{ color: displayInv.final_weight ? '#b45309' : undefined, fontFamily: 'var(--mono)' }}>
                  {displayInv.final_weight || '—'}
                </div>
              </div>
              <div className={styles.card}>
                <div className={styles.k}><Box size={13} /> الأبعاد</div>
                <div className={styles.v}>{displayInv.dimensions || '—'}</div>
              </div>
            </div>
          )}

          {/* ─── ملخص مالي ─── */}
          <div style={{ marginTop: 16 }} className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
            <div className="grid grid-cols-3 divide-x divide-gray-100 dark:divide-slate-700 rtl:divide-x-reverse">
              <div className="p-3 text-center">
                <div className="text-[10px] font-bold text-gray-400 mb-1 flex items-center justify-center gap-1">
                  <DollarSign size={11} /> الإجمالي
                </div>
                <div className="font-inter font-black text-lg text-gray-900 dark:text-white">{total.toFixed(2)}</div>
                <div className="text-[9px] text-gray-400">ر.س</div>
              </div>
              <div className="p-3 text-center">
                <div className="text-[10px] font-bold text-green-600 dark:text-green-400 mb-1 flex items-center justify-center gap-1">
                  <ArrowUpRight size={11} /> المدفوع
                </div>
                <div className="font-inter font-black text-lg text-green-600 dark:text-green-400">{paidAmount.toFixed(2)}</div>
                <div className="text-[9px] text-green-500/70">ر.س</div>
              </div>
              <div className="p-3 text-center">
                <div className="text-[10px] font-bold text-red-500 dark:text-red-400 mb-1 flex items-center justify-center gap-1">
                  <ArrowDownRight size={11} /> المتبقي
                </div>
                <div className={`font-inter font-black text-lg ${remainingAmount > 0 ? 'text-red-500 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                  {remainingAmount > 0 ? remainingAmount.toFixed(2) : '0.00'}
                </div>
                <div className="text-[9px] text-gray-400">ر.س</div>
              </div>
            </div>

            {/* Progress bar */}
            {total > 0 && (
              <div className="px-3 pb-3">
                <div className="w-full bg-gray-100 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                  <div className="h-full bg-green-500 rounded-full transition-all duration-700" style={{ width: `${Math.min(100, (paidAmount / total) * 100)}%` }} />
                </div>
                <div className="flex justify-between mt-1 text-[9px] font-bold">
                  <span className="text-green-600 dark:text-green-400">{total > 0 ? ((paidAmount / total) * 100).toFixed(0) : 0}% محصّل</span>
                  <span className="text-gray-400">{total.toFixed(2)} ر.س</span>
                </div>
              </div>
            )}
          </div>

          {/* ─── تكلفة الناقل + الربح ─── */}
          {dhlCost > 0 && (
            <div style={{ marginTop: 12 }} className="flex items-center gap-2 px-3 py-2.5 bg-orange-50 dark:bg-orange-900/10 border border-orange-100 dark:border-orange-800/20 rounded-lg">
              <Truck size={14} className="text-orange-500" />
              <span className="text-xs font-bold text-orange-700 dark:text-orange-400">تكلفة الناقل:</span>
              <span className="text-xs font-inter font-bold text-orange-600">{dhlCost.toFixed(2)} ر.س</span>
              {profit > 0 && (
                <span className="text-[10px] text-green-600 dark:text-green-400 font-bold mr-auto">
                  ربح: {profit.toFixed(2)} ر.س ({((profit / total) * 100).toFixed(0)}%)
                </span>
              )}
            </div>
          )}

          {/* ─── طريقة الدفع ─── */}
          {displayInv.payment && (
            <div style={{ marginTop: 8 }} className="flex items-center gap-2 px-3 py-2 bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-800/20 rounded-lg">
              <CreditCard size={14} className="text-indigo-500" />
              <span className="text-xs font-bold text-indigo-700 dark:text-indigo-400">طريقة الدفع:</span>
              <span className="text-xs font-semibold text-indigo-600">{displayInv.payment}</span>
            </div>
          )}

          {/* ─── بنود الفاتورة ─── */}
          <div className={styles.items}>
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
              <div className="bg-gray-50 dark:bg-slate-700/50 px-4 py-2.5 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between">
                <span className="text-xs font-bold text-gray-700 dark:text-gray-300">بنود الفاتورة</span>
                <span className="text-[10px] font-bold text-gray-500 bg-white dark:bg-slate-800 px-2 py-0.5 rounded-md border border-gray-200 dark:border-slate-700">
                  {items.length} عنصر
                </span>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-slate-700/50">
                {items.map((it, idx) => (
                  <div key={`${it.type}-${idx}`} className={styles.itemRow}>
                    <div className="flex flex-col gap-1 min-w-0 flex-1" style={{ padding: '12px 16px' }}>
                      <span className={styles.badge}>{it.type}</span>
                      {it.details && (
                        <span className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed whitespace-pre-wrap" style={{ display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {it.details}
                        </span>
                      )}
                    </div>
                    <div className="font-inter font-bold text-sm text-yellow-600 dark:text-yellow-500 shrink-0 whitespace-nowrap" style={{ padding: '12px 16px' }}>
                      {Number(it.price || 0).toFixed(2)} <span className="text-[10px]">ر.س</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {displayInv.details && (
            <div style={{ marginTop: 12 }} className="bg-gray-50 dark:bg-slate-800/50 rounded-xl border border-gray-200 dark:border-slate-700 p-3">
              <div className="text-[10px] font-bold text-gray-400 mb-1 flex items-center gap-1"><FileText size={10} /> تفاصيل إضافية</div>
              <div className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">{displayInv.details}</div>
            </div>
          )}

          {/* ─── ملاحظات الإدارة (Admins Only) ─── */}
          {isAdmin && displayInv.notes && (
            <div style={{ marginTop: 12 }} className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/30 rounded-xl p-3">
              <div className="text-[10px] font-bold text-amber-600 mb-1 flex items-center gap-1">🔒 ملاحظات الإدارة (خاصة)</div>
              <div className="text-xs text-amber-700 dark:text-amber-400 font-mono leading-relaxed whitespace-pre-wrap">
                {displayInv.notes}
              </div>
            </div>
          )}
        </div>

        {/* ═══ Footer ═══ */}
        <div className={styles.footer}>
          {(!displayInv.isDraft && displayInv.status !== 'paid' && displayInv.status !== 'returned' && displayInv.phone) && (
            <button type="button" className={styles.btnGhost} onClick={onCollect} style={{ color: '#25d366', borderColor: 'rgba(37,211,102,0.3)' }}>
              <Send size={14} style={{ display: 'inline', marginLeft: 4 }} /> مطالبة واتساب
            </button>
          )}
          <button type="button" className={styles.btnGhost} onClick={onAddItem}>
            <Plus size={14} style={{ display: 'inline', marginLeft: 4 }} /> إضافة بند
          </button>
          <button type="button" className={styles.btnPrimary} onClick={onEdit}>
            <Edit3 size={14} style={{ display: 'inline', marginLeft: 4 }} /> {displayInv.isDraft ? 'إكمال' : 'تعديل'}
          </button>
          
          <button 
            type="button" 
            onClick={handlePaymob}
            disabled={creatingLink}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white font-bold transition-all shadow-lg active:scale-95 disabled:opacity-50 disabled:grayscale"
            style={{ 
              background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
              boxShadow: '0 4px 12px rgba(168, 85, 247, 0.3)'
            }}
          >
            {creatingLink ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <PaymobIcon size={16} />
            )}
            Paymob
          </button>

          {displayInv.status === 'unpaid' && (
            <button 
              type="button" 
              title="فحص حالة الدفع"
              onClick={async () => {
                setCreatingLink(true);
                try {
                  // Find if there's a pending link for this invoice in the backend
                  const res = await api.get<any>(`/paymob/links?status=pending&limit=10`);
                  const links = res?.data?.links || res?.links || [];
                  const link = links.find((l: any) => Number(l.invoice_id) === Number(displayInv.id));
                  
                  if (link && link.paymob_order_id) {
                    const check = await checkPayment(link.paymob_order_id);
                    if (check.paid) {
                      setLocalToast({ type: 'success', message: '✅ تم تأكيد الدفع وتحديث الفاتورة!' });
                      if (onRefresh) onRefresh();
                    } else {
                      setLocalToast({ type: 'error', message: '⏳ لم يتم الدفع بعد عبر هذا الرابط' });
                    }
                  } else {
                    setLocalToast({ type: 'error', message: 'لا يوجد رابط دفع معلق لهذه الفاتورة' });
                  }
                } catch (e) {
                  setLocalToast({ type: 'error', message: 'فشل فحص الحالة' });
                } finally {
                  setCreatingLink(false);
                }
              }}
              disabled={creatingLink}
              className="p-2.5 bg-amber-50 dark:bg-amber-900/20 text-amber-600 rounded-xl border border-amber-200 dark:border-amber-800/30 hover:bg-amber-100 transition-all disabled:opacity-50"
            >
              {creatingLink ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            </button>
          )}

          <button 
            type="button" 
            onClick={handleCopyLink}
            disabled={creatingLink}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all border shadow-sm active:scale-95 disabled:opacity-50"
            style={{ 
              backgroundColor: copied ? '#f0fdf4' : '#fff',
              borderColor: copied ? '#22c55e' : '#e2e8f0',
              color: copied ? '#16a34a' : '#64748b'
            }}
            title="نسخ رابط الدفع"
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
          </button>
          <div style={{ flex: 1 }} />

          {displayInv && invoiceTemplate && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => downloadInvoicePDF(displayInv, invoiceTemplate)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 font-bold text-xs transition-all active:scale-95"
                title="تحميل PDF"
              >
                <Download size={16} />
                <span className="hidden sm:inline">PDF</span>
              </button>
              
              <button
                type="button"
                onClick={() => shareInvoiceWhatsApp(displayInv, invoiceTemplate)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-green-50 hover:bg-green-100 text-green-600 border border-green-200 font-bold text-xs transition-all active:scale-95"
                title="مشاركة عبر واتساب"
              >
                <MessageCircle size={16} />
                <span className="hidden sm:inline">واتساب</span>
              </button>
            </div>
          )}

          <div style={{ width: 12 }} />

          <button type="button" className={styles.btnDanger} onClick={onDelete}>
            <Trash2 size={14} style={{ display: 'inline', marginLeft: 4 }} /> حذف
          </button>
        </div>
      </div>
    </div>
  )
}