import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { paymobBackend } from '../services/paymobService'
import { ApiError } from '../utils/apiClient'
import { isValidReceiptEmail, isInAppBrowser, normalizeReceiptEmail } from '../utils/payPage'
import shippecLogo from '../assets/shippec.jpeg'
import {
  CreditCard, Mail, Phone, CheckCircle2, AlertCircle, Lock, RefreshCw,
  Truck, Globe, ShieldCheck, XCircle, Clock, Copy, Info,
} from 'lucide-react'

interface InvoiceInfo {
  invoice_number: string;
  awb?: string;
  carrier?: string;
  status?: string;
}

type ReceiptState = 'queued' | 'accepted' | 'delivered' | 'not_delivered' | 'not_sent' | 'unknown'

interface CheckoutResult {
  state: 'paid' | 'failed' | 'processing' | 'review';
  receipt: { status: ReceiptState; to: string | null } | null;
}

interface PublicLinkDetails {
  id: number;
  client_name: string;
  client_phone: string;
  amount: number | string;
  description: string;
  status: string;
  invoice_id?: number;
  invoice_ids?: number[];
  invoice_info?: InvoiceInfo;
  paymob_order_id?: string | null;
  checkout_result?: CheckoutResult | null;
}

/**
 * Paymob sends the customer back here after checkout with the transaction in
 * the query (?id=<transaction>&order=<order>&success=…). The server confirms
 * that transaction with Paymob's API — the query is only a pointer to it, and
 * its `success` flag is never used to decide anything.
 */
function readReturn(params: URLSearchParams): { tx: string; order: string } | null {
  const tx = params.get('id') || ''
  const order = params.get('order') || ''
  if (!/^\d{1,20}$/.test(tx) || !/^\d{1,20}$/.test(order)) return null
  return { tx, order }
}

const CONFIRM_POLL_MS = 3000
const CONFIRM_MAX_MS = 90_000
const RECEIPT_POLL_MS = 4000
const RECEIPT_MAX_MS = 40_000

const formatSAR = (amount: number | string) => `${Number(amount || 0).toFixed(2)} ر.س`

/** [text before the address, text after it] — the address is rendered isolated (LTR). */
const RECEIPT_TEXT: Record<ReceiptState, [string, string] | string> = {
  queued: ['جارٍ إرسال إيصال السداد إلى ', '.'],
  accepted: ['سلّمنا إيصال السداد لمزوّد البريد لإرساله إلى ', '. إن لم يظهر خلال دقائق فراجع مجلد الرسائل غير المرغوب فيها.'],
  delivered: ['أكّد مزوّد البريد تسليم الإيصال إلى خادم البريد الخاص بـ ', '.'],
  not_delivered: ['تعذّر توصيل الإيصال إلى ', '. الدفع مسجّل لدينا؛ تواصل معنا لتصحيح البريد.'],
  not_sent: 'لم يُرسل إيصال السداد بعد، وسيتابع فريقنا ذلك. الدفع مسجّل لدينا.',
  unknown: 'لم نتمكن من تأكيد حالة إرسال الإيصال بعد. الدفع مسجّل لدينا.',
}

export function PublicPayPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [returned, setReturned] = useState(() => readReturn(searchParams))
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [link, setLink] = useState<PublicLinkDetails | null>(null)
  // Waiting for the server to confirm the checkout we just came back from.
  const [confirming, setConfirming] = useState(() => !!readReturn(searchParams))
  const [confirmTimedOut, setConfirmTimedOut] = useState(false)

  // Form
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [emailTouched, setEmailTouched] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [pendingNotice, setPendingNotice] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [redirecting, setRedirecting] = useState(false)
  const inFlight = useRef(false)
  const [inApp] = useState(() => isInAppBrowser(typeof navigator !== 'undefined' ? navigator.userAgent : ''))
  const [copied, setCopied] = useState(false)

  const fetchLink = useCallback(async (withReturn: boolean) => {
    if (!id) return null
    const res = await paymobBackend.getPublicLink(id, withReturn && returned ? returned : undefined)
    const data: PublicLinkDetails | null = res && res.success !== false ? (res.data || res) : null
    return data
  }, [id, returned])

  // Initial load
  useEffect(() => {
    if (!id) return
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        const data = await fetchLink(true)
        if (cancelled) return
        if (!data) { setLoadError('رابط الدفع هذا غير صحيح أو غير موجود.'); return }
        setLink(data)
        if (data.client_phone && !/^(966)?0?500000000$/.test(data.client_phone)) setPhone((p) => p || data.client_phone)
      } catch (err: unknown) {
        if (!cancelled) setLoadError(err instanceof ApiError && err.status === 404 ? 'رابط الدفع هذا غير صحيح أو غير موجود.' : 'تعذّر تحميل تفاصيل الدفع. تحقق من الاتصال ثم أعد تحميل الصفحة.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [id, fetchLink])

  // Back from checkout: keep asking the server until it has a final answer
  // for that transaction (Paymob can take a few seconds to settle it).
  const result = link?.checkout_result ?? null
  const settled = link?.status === 'paid' || (result && (result.state === 'paid' || result.state === 'failed' || result.state === 'review'))
  useEffect(() => {
    if (!returned || !confirming || loading || settled) return
    const started = Date.now()
    const timer = setInterval(async () => {
      try {
        const data = await fetchLink(true)
        if (data) setLink(data)
      } catch { /* keep polling */ }
      if (Date.now() - started > CONFIRM_MAX_MS) {
        clearInterval(timer)
        setConfirming(false)
        setConfirmTimedOut(true)
      }
    }, CONFIRM_POLL_MS)
    return () => clearInterval(timer)
  }, [returned, confirming, loading, settled, fetchLink])

  // Paid: follow the receipt e-mail for a short while (queued → accepted …).
  const receiptStatus = result?.receipt?.status
  useEffect(() => {
    if (!returned || receiptStatus !== 'queued') return
    const started = Date.now()
    const timer = setInterval(async () => {
      try {
        const data = await fetchLink(true)
        if (data) setLink(data)
      } catch { /* ignore */ }
      if (Date.now() - started > RECEIPT_MAX_MS) clearInterval(timer)
    }, RECEIPT_POLL_MS)
    return () => clearInterval(timer)
  }, [returned, receiptStatus, fetchLink])

  // Coming back with the browser's Back button from Paymob restores this page
  // from cache with the "redirecting" state: unlock it and refresh the status.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return
      inFlight.current = false
      setRedirecting(false)
      setSubmitting(false)
      fetchLink(false).then((d) => d && setLink(d)).catch(() => undefined)
    }
    window.addEventListener('pageshow', onShow)
    return () => window.removeEventListener('pageshow', onShow)
  }, [fetchLink])

  const checkAgain = async () => {
    try {
      setSubmitting(true)
      const data = await fetchLink(true)
      if (data) setLink(data)
      setPendingNotice(false)
    } catch {
      setFormError('تعذّر التحقق الآن، حاول مرة أخرى بعد لحظات.')
    } finally {
      setSubmitting(false)
    }
  }

  /** Leave the result of a failed checkout and show the form again. */
  const tryAgain = () => {
    setReturned(null)
    setConfirming(false)
    setConfirmTimedOut(false)
    setLink((l) => (l ? { ...l, checkout_result: null } : l))
    navigate(`/pay/${id}`, { replace: true })
  }

  const cleanEmail = normalizeReceiptEmail(email)
  const emailValid = isValidReceiptEmail(cleanEmail)
  const phoneDigits = phone.replace(/\D/g, '')
  const phoneValid = phoneDigits.length >= 9 && phoneDigits.length <= 15

  const startPayment = async (allowWhilePending = false) => {
    if (!id || inFlight.current) return
    setEmailTouched(true)
    setFormError(null)
    if (!emailValid) { setFormError('يرجى كتابة بريد إلكتروني صحيح لاستلام إيصال السداد.'); return }
    if (!phoneValid) { setFormError('يرجى كتابة رقم جوال صحيح.'); return }

    inFlight.current = true
    setSubmitting(true)
    try {
      const data = await paymobBackend.payPublicLink(id, cleanEmail, phoneDigits, allowWhilePending)
      const url = data?.checkout_url || data?.payment_url_full
      if (!url) throw new Error('لم يتم استلام رابط بوابة الدفع من الخادم')
      setRedirecting(true)
      // Same tab: Apple Pay and 3-D Secure work best on Paymob's own page.
      window.location.assign(url)
      return
    } catch (err: unknown) {
      const code = err instanceof ApiError ? err.code : undefined
      if (code === 'PAYMENT_PENDING') {
        setPendingNotice(true)
      } else if (code === 'LINK_NOT_PAYABLE') {
        await checkAgain()
      } else if (err instanceof ApiError && (code === 'INVALID_EMAIL' || code === 'INVALID_PHONE' || code === 'MISSING_FIELDS')) {
        setFormError(err.message)
      } else if (err instanceof ApiError) {
        setFormError(err.message || 'تعذّر بدء عملية الدفع، حاول مرة أخرى.')
      } else {
        // Network dropped: retrying is safe — the server hands back the same checkout.
        setFormError('انقطع الاتصال أثناء تجهيز الدفع. تحقق من الإنترنت ثم اضغط «المتابعة إلى الدفع» مرة أخرى.')
      }
      inFlight.current = false
      setSubmitting(false)
    }
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.origin + `/pay/${id}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch { /* clipboard unavailable */ }
  }

  // ─────────────────────────────── screens ───────────────────────────────

  if (loading || (confirming && !settled && !loadError)) {
    return (
      <Shell>
        <div className="space-y-4 text-center" role="status" aria-live="polite">
          <RefreshCw className="animate-spin text-indigo-500 mx-auto" size={48} />
          <h2 className="text-xl font-bold text-white">{confirming ? 'جارٍ تأكيد الدفع…' : 'جارٍ تحميل تفاصيل الدفع…'}</h2>
          <p className="text-gray-400 text-sm">{confirming ? 'نتحقق من نتيجة العملية مع بوابة الدفع، لا تغلق الصفحة.' : 'يرجى الانتظار لحظات'}</p>
        </div>
      </Shell>
    )
  }

  if (loadError || !link) {
    return (
      <Shell>
        <Card>
          <div className="text-center space-y-5">
            <IconBadge tone="red"><AlertCircle size={32} /></IconBadge>
            <h1 className="text-2xl font-black text-white">تعذّر فتح رابط الدفع</h1>
            <p className="text-gray-400 text-sm leading-relaxed">{loadError || 'رابط الدفع هذا غير موجود أو منتهي الصلاحية.'}</p>
            <a href="https://shippec.com" className="inline-flex items-center justify-center w-full py-4 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-2xl transition-all">
              الذهاب للموقع الرئيسي
            </a>
          </div>
        </Card>
      </Shell>
    )
  }

  // Paid: the link is settled, or the server recorded THIS checkout's payment.
  if (link.status === 'paid' || result?.state === 'paid') {
    const receipt = result?.state === 'paid' ? result.receipt : null
    return (
      <Shell>
        <Card tone="emerald">
          <div className="text-center space-y-6">
            <IconBadge tone="emerald"><CheckCircle2 size={40} /></IconBadge>
            <div className="space-y-2">
              <h1 className="text-2xl sm:text-3xl font-black text-white">تم سداد الفاتورة بنجاح</h1>
              <p className="text-emerald-400 text-sm font-bold">شكرًا لك! تم استلام دفعتك وتأكيدها.</p>
            </div>
            <Summary link={link} showReference />
            {receipt && receipt.to && (
              <div className={`flex items-start gap-3 rounded-2xl p-4 text-right text-sm leading-relaxed border ${receipt.status === 'not_delivered' ? 'bg-amber-500/10 border-amber-500/30 text-amber-200' : 'bg-slate-950/60 border-slate-800 text-gray-300'}`} aria-live="polite">
                <Mail size={18} className="mt-0.5 flex-shrink-0" />
                <span>{(() => {
                  const t = RECEIPT_TEXT[receipt.status] ?? RECEIPT_TEXT.unknown
                  return typeof t === 'string' ? t : <>{t[0]}<bdi dir="ltr">{receipt.to}</bdi>{t[1]}</>
                })()}</span>
              </div>
            )}
            <SecureNote />
          </div>
        </Card>
      </Shell>
    )
  }

  // Came back from Paymob and the server recorded a decline/cancel.
  if (returned && result?.state === 'failed') {
    return (
      <Shell>
        <Card>
          <div className="text-center space-y-5">
            <IconBadge tone="red"><XCircle size={36} /></IconBadge>
            <h1 className="text-2xl font-black text-white">لم تكتمل عملية الدفع</h1>
            <p className="text-gray-400 text-sm leading-relaxed">
              رُفضت العملية أو أُلغيت، ولم يُخصم أي مبلغ مقابل هذه الفاتورة لدينا. يمكنك المحاولة مرة أخرى ببطاقة أخرى أو بوسيلة دفع مختلفة.
            </p>
            <button onClick={tryAgain} className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-2xl transition-all active:scale-[0.98]">
              المحاولة مرة أخرى
            </button>
          </div>
        </Card>
      </Shell>
    )
  }

  // Back from Paymob but no final answer yet (bank still processing).
  if (returned && (confirmTimedOut || result?.state === 'processing' || result?.state === 'review' || !result)) {
    return (
      <Shell>
        <Card>
          <div className="text-center space-y-5">
            <IconBadge tone="amber"><Clock size={34} /></IconBadge>
            <h1 className="text-2xl font-black text-white">جارٍ تأكيد الدفع</h1>
            <p className="text-gray-400 text-sm leading-relaxed">
              لم تصلنا النتيجة النهائية من بوابة الدفع بعد. لا تُعِد الدفع الآن؛ سنسجّل العملية تلقائيًا فور تأكيدها، ويمكنك التحقق بعد دقيقة.
            </p>
            <button onClick={checkAgain} disabled={submitting} className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white font-bold rounded-2xl transition-all flex items-center justify-center gap-2">
              {submitting ? <RefreshCw className="animate-spin" size={18} /> : <RefreshCw size={18} />}
              التحقق من حالة الدفع
            </button>
          </div>
        </Card>
      </Shell>
    )
  }

  // ── The form: e-mail + phone → one click → Paymob ──
  const showEmailError = emailTouched && email.trim() !== '' && !emailValid
  return (
    <Shell>
      <div className="text-center mb-6">
        <img src={shippecLogo} alt="ShipPec" className="h-16 w-auto max-w-[180px] object-contain rounded-2xl p-1 bg-white shadow-2xl mx-auto mb-3" />
        <h1 className="text-xl sm:text-2xl font-black text-white">سداد فاتورة ShipPec</h1>
        <p className="text-gray-400 text-xs mt-1">دفع آمن عبر بوابة Paymob</p>
      </div>

      <Card>
        <div className="space-y-5">
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs text-gray-500 font-bold">المبلغ المطلوب</span>
              <p className="text-2xl font-extrabold text-emerald-400" dir="ltr">{formatSAR(link.amount)}</p>
            </div>
            <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-xl"><CreditCard size={24} /></div>
          </div>

          <Summary link={link} />

          {inApp && (
            <div className="flex items-start gap-3 bg-sky-500/10 border border-sky-500/30 rounded-2xl p-3.5 text-xs text-sky-100 leading-relaxed">
              <Info size={16} className="mt-0.5 flex-shrink-0" />
              <div className="space-y-2">
                <p>يبدو أنك فتحت الرابط داخل تطبيق. إذا لم يظهر Apple Pay أو تعذّر الدفع، افتح الرابط في Safari أو Chrome.</p>
                <button type="button" onClick={copyLink} className="inline-flex items-center gap-1.5 font-bold text-sky-300">
                  <Copy size={14} /> {copied ? 'تم نسخ الرابط' : 'نسخ رابط الدفع'}
                </button>
              </div>
            </div>
          )}

          <form noValidate onSubmit={(e) => { e.preventDefault(); void startPayment() }} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="receipt-email" className="text-sm font-bold text-gray-300">
                البريد الإلكتروني لاستلام إيصال السداد <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Mail size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                <input
                  id="receipt-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="off"
                  spellCheck={false}
                  required
                  dir="ltr"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setFormError(null); setPendingNotice(false) }}
                  onBlur={() => setEmailTouched(true)}
                  placeholder="name@example.com"
                  aria-invalid={showEmailError}
                  aria-describedby="receipt-email-help"
                  disabled={submitting || redirecting}
                  className={`w-full bg-slate-950 border rounded-xl py-3.5 pl-4 pr-12 text-white text-base focus:outline-none focus:ring-4 transition-all placeholder:text-gray-600 ${showEmailError ? 'border-red-500 focus:ring-red-500/10' : 'border-slate-800 focus:border-indigo-500 focus:ring-indigo-500/10'}`}
                />
              </div>
              <p id="receipt-email-help" className={`text-xs ${showEmailError ? 'text-red-400' : 'text-gray-500'}`}>
                {showEmailError ? 'صيغة البريد غير صحيحة — يرجى تصحيحها.' : 'سنرسل إيصال هذه العملية إلى هذا البريد بعد نجاح الدفع.'}
              </p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="payer-phone" className="text-sm font-bold text-gray-300">رقم الجوال <span className="text-red-500">*</span></label>
              <div className="relative">
                <Phone size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                <input
                  id="payer-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  required
                  dir="ltr"
                  value={phone}
                  onChange={(e) => { setPhone(e.target.value); setFormError(null) }}
                  placeholder="05XXXXXXXX"
                  disabled={submitting || redirecting}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3.5 pl-4 pr-12 text-white text-base focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all placeholder:text-gray-600"
                />
              </div>
              <p className="text-xs text-gray-500">تطلبه بوابة الدفع لإتمام العملية.</p>
            </div>

            {emailValid && (
              <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-2xl p-4 space-y-1" aria-live="polite">
                <p className="text-xs text-indigo-200">سيُرسل إيصال السداد إلى:</p>
                <p className="text-base font-bold text-white break-all" dir="ltr">{cleanEmail}</p>
                <p className="text-[11px] text-gray-400">تأكد من صحة البريد؛ يمكنك تعديله أعلاه قبل المتابعة.</p>
              </div>
            )}

            {pendingNotice && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 space-y-3 text-sm text-amber-100" role="alert">
                <p>توجد عملية دفع سابقة لهذا الرابط ما زالت قيد المعالجة لدى البنك. تحقق منها أولًا حتى لا يتم الدفع مرتين.</p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <button type="button" onClick={checkAgain} disabled={submitting} className="flex-1 py-2.5 rounded-xl bg-amber-500 text-slate-950 font-bold disabled:opacity-60">التحقق الآن</button>
                  <button type="button" onClick={() => void startPayment(true)} disabled={submitting} className="flex-1 py-2.5 rounded-xl border border-amber-500/50 font-bold disabled:opacity-60">المتابعة بمحاولة جديدة</button>
                </div>
              </div>
            )}

            {formError && (
              <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl p-3" role="alert">{formError}</p>
            )}

            <button
              type="submit"
              disabled={submitting || redirecting}
              className="w-full bg-gradient-to-l from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-bold py-4 px-6 rounded-2xl flex items-center justify-center gap-2.5 transition-all shadow-xl shadow-indigo-600/10 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting || redirecting ? <RefreshCw className="animate-spin" size={18} /> : <ShieldCheck size={18} className="text-indigo-200" />}
              <span>{redirecting ? 'جارٍ فتح بوابة الدفع…' : submitting ? 'جارٍ التجهيز…' : 'المتابعة إلى الدفع'}</span>
            </button>

            <p className="flex items-start gap-2 text-[11px] text-gray-500 leading-relaxed">
              <Lock size={14} className="text-emerald-600 flex-shrink-0 mt-0.5" />
              <span>ستنتقل إلى صفحة Paymob الآمنة لإتمام الدفع (Apple Pay أو مدى أو فيزا أو ماستركارد) ثم تعود هنا لرؤية النتيجة. لا نستقبل بيانات بطاقتك.</span>
            </p>
          </form>
        </div>
      </Card>

      <footer className="mt-8 flex items-center gap-2 text-gray-600 text-[11px]">
        <Globe size={12} />
        <span>© {new Date().getFullYear()} ShipPec</span>
      </footer>
    </Shell>
  )
}

// ─────────────────────────────── pieces ───────────────────────────────

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 flex flex-col items-center justify-center font-cairo px-4 py-8" dir="rtl">
      {children}
    </div>
  )
}

function Card({ children, tone }: { children: React.ReactNode; tone?: 'emerald' }) {
  return (
    <div className={`max-w-md w-full bg-slate-900 border rounded-3xl p-5 sm:p-8 shadow-2xl ${tone === 'emerald' ? 'border-emerald-500/30' : 'border-slate-800'}`}>
      {children}
    </div>
  )
}

function IconBadge({ children, tone }: { children: React.ReactNode; tone: 'red' | 'emerald' | 'amber' }) {
  const cls = { red: 'bg-red-500/10 text-red-500', emerald: 'bg-emerald-500/15 text-emerald-500', amber: 'bg-amber-500/10 text-amber-400' }[tone]
  return <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto ${cls}`}>{children}</div>
}

function Summary({ link, showReference }: { link: PublicLinkDetails; showReference?: boolean }) {
  return (
    <div className="space-y-2.5 bg-slate-950/40 p-4 rounded-xl border border-slate-800 text-sm text-right">
      <Row label="العميل" value={link.client_name} />
      <Row label="البيان" value={link.description} />
      {link.invoice_info && <Row label="رقم الفاتورة" value={link.invoice_info.invoice_number} mono />}
      {link.invoice_info?.awb && (
        <div className="flex justify-between gap-3">
          <span className="text-gray-500">بوليصة الشحن</span>
          <span className="flex items-center gap-1.5 text-white font-mono font-bold"><Truck size={14} className="text-indigo-400" />{link.invoice_info.awb}</span>
        </div>
      )}
      {showReference && <Row label="المبلغ" value={formatSAR(link.amount)} ltr />}
      {showReference && link.paymob_order_id && <Row label="رقم مرجع الدفع" value={String(link.paymob_order_id)} mono />}
    </div>
  )
}

function Row({ label, value, mono, ltr }: { label: string; value: string; mono?: boolean; ltr?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-gray-500 flex-shrink-0">{label}</span>
      <span className={`text-white font-bold text-left break-words ${mono ? 'font-mono' : ''}`} dir={ltr || mono ? 'ltr' : undefined}>{value}</span>
    </div>
  )
}

function SecureNote() {
  return (
    <div className="text-xs text-gray-500 flex items-center justify-center gap-2">
      <ShieldCheck size={14} className="text-emerald-500" />
      <span>تمت معالجة الدفع عبر بوابة Paymob الآمنة</span>
    </div>
  )
}
