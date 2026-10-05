import { useEffect, useId, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Clock, ExternalLink, FileText, Loader2, RefreshCw, X } from 'lucide-react'
import { Dialog } from '../shared/Dialog'
import { paymobBackend } from '../../services/paymobService'
import type { PaymobLinkDetails } from '../../utils/models'
import { describeOpenError } from '../../utils/notificationTarget'
import { describeReviewReason } from '../../utils/paymobReview'
import { ApiError } from '../../utils/apiClient'
import { PAYMENT_EVENTS, batchTouchesLink, useRealtimeRefresh } from '../../hooks/useRealtimeRefresh'

type Props = {
  open: boolean
  linkId: number | null
  onClose: () => void
  onExited?: () => void
}

const ATTEMPT_STATUS: Record<string, string> = {
  open: 'مفتوحة', settled: 'مدفوعة', abandoned: 'متروكة', creating: 'قيد الإنشاء',
  create_failed: 'تعذر إنشاؤها', create_unknown: 'انقطع الاتصال أثناء إنشائها',
}
const TX_STATUS: Record<string, string> = {
  success: 'ناجحة',
  pending: 'قيد المعالجة',
  failed: 'فاشلة',
  authorized: 'تفويض فقط',
  refunded: 'مستردة',
  voided: 'ملغاة',
}

const sar = (v: number | string | null | undefined) => `${Number(v || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })} ر.س`
const fromCents = (v: number | string | null | undefined) => sar(Number(v || 0) / 100)
const when = (d: string | null | undefined) => {
  if (!d) return '—'
  try { return new Date(d).toLocaleString('ar-SA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) } catch { return d }
}

export function PaymentLinkDetailsDialog({ open, linkId, onClose, onExited }: Props) {
  const headingId = useId()
  const navigate = useNavigate()
  // Result of the last fetch, tagged with the link id + reload counter it
  // belongs to; state is only written from the async callbacks.
  const [reload, setReload] = useState(0)
  const [result, setResult] = useState<{ key: string; link: PaymobLinkDetails | null; error: string | null } | null>(null)
  const requestKey = open && linkId ? `${linkId}:${reload}` : null

  useEffect(() => {
    if (!requestKey || !linkId) return
    let cancelled = false
    paymobBackend.getLinkDetails(linkId).then(
      (data) => { if (!cancelled) setResult({ key: requestKey, link: data, error: null }) },
      (err: unknown) => {
        if (!cancelled) {
          setResult({ key: requestKey, link: null, error: describeOpenError('payment_link', err instanceof ApiError ? err.status : undefined) })
        }
      },
    )
    return () => { cancelled = true }
  }, [requestKey, linkId])

  const sameLink = result && linkId !== null && result.key.startsWith(`${linkId}:`)
  const link = sameLink ? result.link : null
  const error = sameLink ? result.error : null
  const loading = requestKey !== null && result?.key !== requestKey
  const load = () => setReload((n) => n + 1)

  useRealtimeRefresh(PAYMENT_EVENTS, (batch) => {
    if (open && batchTouchesLink(batch, linkId, (link?.invoices || []).map((i) => Number(i.id)))) load()
  })

  const paid = link?.status === 'paid'

  return (
    <Dialog open={open} onRequestClose={onClose} onExited={onExited} labelledBy={headingId} panelClassName="sm:max-w-2xl">
      <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-200 dark:border-slate-700">
        <h2 id={headingId} className="font-bold text-base text-slate-900 dark:text-white">
          تفاصيل رابط الدفع {linkId ? <span className="font-inter text-slate-400">#{linkId}</span> : null}
        </h2>
        <div className="flex items-center gap-1">
          <button type="button" onClick={load} disabled={loading} title="تحديث"
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button type="button" onClick={onClose} title="إغلاق" className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700">
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4 text-sm" data-testid="payment-link-details">
        {loading && !link && (
          <div className="flex items-center justify-center py-10 text-slate-400"><Loader2 className="animate-spin" size={24} /></div>
        )}

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 font-bold border border-red-200 dark:border-red-800/30">
            <AlertTriangle size={18} /> {error}
          </div>
        )}

        {link && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                <div className="text-[11px] text-slate-500 font-bold">الحالة</div>
                <div className={`font-bold flex items-center gap-1 ${paid ? 'text-green-600' : 'text-amber-600'}`}>
                  {paid ? <CheckCircle2 size={14} /> : <Clock size={14} />} {paid ? 'مدفوع' : 'معلّق'}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                <div className="text-[11px] text-slate-500 font-bold">مبلغ الرابط</div>
                <div className="font-bold font-inter">{sar(link.amount)}</div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                <div className="text-[11px] text-slate-500 font-bold">المحصّل</div>
                <div className="font-bold font-inter text-green-600" data-testid="payment-link-paid-amount">{sar(link.paid_amount)}</div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                <div className="text-[11px] text-slate-500 font-bold">تاريخ الدفع</div>
                <div className="font-bold text-xs">{when(link.paid_at)}</div>
              </div>
            </div>

            <div className="text-slate-600 dark:text-slate-300">
              <span className="font-bold">{link.client_name}</span>
              <span className="font-inter mx-2 text-slate-400">{link.client_phone}</span>
              {link.description ? <span>— {link.description}</span> : null}
            </div>

            {link.review_reason && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/30">
                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                <span className="font-bold">تحتاج مراجعة: {describeReviewReason(link.review_reason)}</span>
              </div>
            )}

            <section>
              <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-2 flex items-center gap-1"><FileText size={14} /> الفواتير المرتبطة</h3>
              {link.invoices.length === 0 && link.missing_invoice_ids.length === 0 ? (
                <p className="text-slate-500 text-xs">رابط دفع حر — غير مرتبط بفاتورة.</p>
              ) : (
                <ul className="space-y-2">
                  {link.invoices.map((inv) => (
                    <li key={inv.id} className="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700">
                      <div>
                        <div className="font-bold">#{inv.invoice_number || inv.id} <span className="font-normal text-slate-500">{inv.client_name}</span></div>
                        <div className="text-xs text-slate-500 font-inter">
                          {sar(inv.paid_amount)} / {sar(inv.total)} · المتبقي {sar(inv.remaining)}
                        </div>
                      </div>
                      <button type="button" onClick={() => { onClose(); navigate(`/invoices?invoice=${inv.id}`) }}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-100">
                        <ExternalLink size={12} /> فتح الفاتورة
                      </button>
                    </li>
                  ))}
                  {link.missing_invoice_ids.map((id) => (
                    <li key={`missing-${id}`} className="p-2.5 rounded-xl border border-dashed border-red-200 text-red-600 text-xs font-bold">
                      الفاتورة رقم {id} لم تعد موجودة
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {link.attempts.length > 0 && (
              <section>
                <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-2">محاولات الدفع وبريد الإيصال</h3>
                <ul className="space-y-1.5">
                  {link.attempts.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-900 text-xs">
                      <span className="font-inter text-slate-500">طلب #{a.paymob_order_id.startsWith('ref:') ? '—' : a.paymob_order_id}</span>
                      <span dir="ltr" className="font-inter">{a.payer_email || 'بدون بريد (صفحة قديمة)'}</span>
                      <span className="text-slate-500">{ATTEMPT_STATUS[a.status] || a.status}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section>
              <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-2">عمليات Paymob</h3>
              {link.transactions.length === 0 ? (
                <p className="text-slate-500 text-xs">لم تصل أي عملية دفع لهذا الرابط بعد.</p>
              ) : (
                <ul className="space-y-1.5">
                  {link.transactions.map((t) => (
                    <li key={t.paymob_transaction_id} className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-900 text-xs">
                      <span className="font-inter text-slate-500">#{t.paymob_transaction_id}</span>
                      <span className="font-bold">{TX_STATUS[t.status] || t.status}</span>
                      <span className="font-inter">{fromCents(t.amount_cents)}</span>
                      <span className={t.applied ? 'text-green-600 font-bold' : 'text-slate-400'}>{t.applied ? 'مسجّلة' : 'غير مسجّلة'}</span>
                      {t.needs_review && <span className="text-amber-600 font-bold w-full">{describeReviewReason(t.review_reason)}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </Dialog>
  )
}
