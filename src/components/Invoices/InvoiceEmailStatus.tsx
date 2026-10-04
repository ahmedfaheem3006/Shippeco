import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Clock, Loader2, Mail, MailX, RotateCw, XCircle } from 'lucide-react'
import { api, ApiError } from '../../utils/apiClient'
import { useAuthStore } from '../../hooks/useAuthStore'
import { PAYMENT_EVENTS, batchTouchesInvoice, useRealtimeRefresh } from '../../hooks/useRealtimeRefresh'

type InvoiceEmail = {
  id: number
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'skipped' | 'uncertain'
  skip_reason: 'no_email' | 'invalid_email' | 'mail_not_configured' | null
  recipient: string | null
  attempts: number
  last_attempt_at: string | null
  accepted_at: string | null
  last_error: string | null
  resend_count: number
  created_at: string
  transaction_id: string | null
  payment_cents: string | number | null
  currency: string | null
}

const when = (d: string | null | undefined) => {
  if (!d) return '—'
  try { return new Date(d).toLocaleString('ar-SA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) } catch { return d }
}

/** Plain-language state. "Accepted" is not "delivered": we never claim inbox delivery. */
function describe(e: InvoiceEmail): { label: string; hint?: string; tone: 'ok' | 'wait' | 'warn' | 'bad'; canResend: boolean } {
  switch (e.status) {
    case 'pending':
    case 'sending':
      return { label: 'في انتظار الإرسال', hint: e.attempts > 0 ? `محاولة ${e.attempts} لم تنجح — ستُعاد تلقائيًا` : undefined, tone: 'wait', canResend: false }
    case 'sent':
      return { label: 'قبله مزود البريد', hint: 'قبول المزود لا يؤكد وصولها لصندوق الوارد لدى العميل', tone: 'ok', canResend: true }
    case 'failed':
      return { label: 'تعذر الإرسال', hint: 'رفض مزود البريد الرسالة أو استُنفدت المحاولات', tone: 'bad', canResend: true }
    case 'uncertain':
      return { label: 'نتيجة غير مؤكدة', hint: 'انقطع الاتصال بعد تسليم الرسالة — ربما وصلت. تحقّق قبل إعادة الإرسال', tone: 'warn', canResend: true }
    case 'skipped':
      if (e.skip_reason === 'no_email') return { label: 'بريد العميل غير متوفر', hint: 'أضف البريد في بيانات العميل ثم أعد الإرسال', tone: 'warn', canResend: true }
      if (e.skip_reason === 'invalid_email') return { label: 'بريد العميل غير صالح', hint: 'صحّح البريد في بيانات العميل ثم أعد الإرسال', tone: 'warn', canResend: true }
      return { label: 'إرسال البريد غير مُفعّل', hint: 'لم تُضبط إعدادات البريد على السيرفر وقت الدفع', tone: 'warn', canResend: true }
  }
}

const TONE: Record<string, string> = {
  ok: 'text-emerald-700 dark:text-emerald-400',
  wait: 'text-indigo-700 dark:text-indigo-400',
  warn: 'text-amber-700 dark:text-amber-400',
  bad: 'text-red-700 dark:text-red-400',
}
const ICON = { ok: CheckCircle2, wait: Clock, warn: AlertTriangle, bad: XCircle }

/** Payment-receipt e-mails of one invoice — visible to admin/accountant only. */
export function InvoiceEmailStatus({ invoiceId }: { invoiceId: string | number }) {
  const role = useAuthStore((s) => s.user?.role)
  const allowed = role === 'admin' || role === 'accountant'
  const [emails, setEmails] = useState<InvoiceEmail[]>([])
  const [busyId, setBusyId] = useState<number | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [reload, setReload] = useState(0)

  const fetchEmails = useCallback(async () => {
    const r = await api.get<{ data?: InvoiceEmail[] } | InvoiceEmail[]>(`/invoices/${encodeURIComponent(String(invoiceId))}/emails`)
    return (Array.isArray(r) ? r : r?.data) || []
  }, [invoiceId])

  useEffect(() => {
    if (!allowed) return
    let alive = true
    fetchEmails().then((list) => { if (alive) setEmails(list) }, () => undefined)
    return () => { alive = false }
  }, [allowed, fetchEmails, reload])

  useRealtimeRefresh([...PAYMENT_EVENTS, 'INVOICE_EMAIL_UPDATED'], (batch) => {
    const mine = batch.some(({ event, payload }) =>
      event === 'INVOICE_EMAIL_UPDATED' ? Number((payload as { invoice_id?: unknown })?.invoice_id) === Number(invoiceId) : false
    ) || batchTouchesInvoice(batch, invoiceId)
    if (mine) setReload((n) => n + 1)
  })

  if (!allowed || emails.length === 0) return null

  const resend = async (e: InvoiceEmail) => {
    if (!window.confirm(e.status === 'uncertain'
      ? 'قد تكون الرسالة وصلت للعميل بالفعل. هل تريد إرسالها مرة أخرى؟'
      : 'إعادة إرسال بريد تأكيد الدفع إلى البريد المسجل للعميل؟')) return
    setBusyId(e.id)
    setMessage(null)
    try {
      await api.post(`/invoices/${encodeURIComponent(String(invoiceId))}/emails/${e.id}/resend`, {})
      setMessage({ ok: true, text: 'تمت جدولة إعادة الإرسال' })
      setReload((n) => n + 1)
    } catch (err) {
      setMessage({ ok: false, text: err instanceof ApiError || err instanceof Error ? err.message : 'تعذر إعادة الإرسال' })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div style={{ marginTop: 8 }} className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden" data-testid="invoice-email-status">
      <div className="px-4 py-2.5 border-b border-gray-100 dark:border-slate-700 flex items-center gap-2">
        <Mail size={14} className="text-indigo-500" />
        <span className="text-xs font-bold text-gray-700 dark:text-gray-200">بريد تأكيد الدفع للعميل</span>
      </div>
      <ul className="divide-y divide-gray-100 dark:divide-slate-700">
        {emails.map((e) => {
          const d = describe(e)
          const Icon = e.skip_reason === 'no_email' ? MailX : ICON[d.tone]
          const amount = e.payment_cents != null ? (Number(e.payment_cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 }) : null
          return (
            <li key={e.id} className="px-4 py-3 flex items-start gap-3">
              <Icon size={16} className={`shrink-0 mt-0.5 ${TONE[d.tone]}`} />
              <div className="flex-1 min-w-0 text-xs">
                <div className={`font-bold ${TONE[d.tone]}`} data-testid="invoice-email-label">{d.label}</div>
                {d.hint && <div className="text-gray-500 dark:text-gray-400 mt-0.5">{d.hint}</div>}
                <div className="text-gray-500 dark:text-gray-400 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                  {e.recipient && <span dir="ltr" className="font-inter">{e.recipient}</span>}
                  {amount && <span>دفعة <span dir="ltr" className="font-inter">{amount}</span> ر.س</span>}
                  <span>آخر محاولة: {when(e.accepted_at || e.last_attempt_at || e.created_at)}</span>
                  {e.resend_count > 0 && <span>أُعيد الإرسال {e.resend_count}×</span>}
                </div>
                {e.last_error && e.status !== 'sent' && (
                  <div className="text-gray-400 dark:text-gray-500 mt-1 break-words" dir="auto">السبب: {e.last_error}</div>
                )}
              </div>
              {d.canResend && (
                <button
                  type="button"
                  onClick={() => void resend(e)}
                  disabled={busyId === e.id}
                  className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold rounded-lg border border-gray-200 dark:border-slate-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-50"
                >
                  {busyId === e.id ? <Loader2 size={12} className="animate-spin" /> : <RotateCw size={12} />}
                  إعادة الإرسال
                </button>
              )}
            </li>
          )
        })}
      </ul>
      {message && (
        <div className={`px-4 py-2 text-xs font-bold border-t border-gray-100 dark:border-slate-700 ${message.ok ? 'text-emerald-700' : 'text-red-700'}`}>{message.text}</div>
      )}
    </div>
  )
}
