import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { paymobBackend } from '../services/paymobService'
import shippecLogo from '../assets/shippec.jpeg'
import { 
  CreditCard, Mail, Phone, CheckCircle2, 
  AlertCircle, ExternalLink, Lock, RefreshCw, 
  Truck, Globe, ShieldCheck
} from 'lucide-react'
import toast from 'react-hot-toast'

interface InvoiceInfo {
  invoice_number: string;
  awb?: string;
  carrier?: string;
  status?: string;
}

interface PublicLinkDetails {
  id: number;
  client_name: string;
  client_phone: string;
  amount: number;
  description: string;
  status: string;
  invoice_id?: number;
  invoice_ids?: number[];
  invoice_info?: InvoiceInfo;
  paymob_order_id?: string;
  client_secret?: string;
  payment_url_full?: string;
}

export function PublicPayPage() {
  const { id } = useParams<{ id: string }>()
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const [linkDetails, setLinkDetails] = useState<PublicLinkDetails | null>(null)
  
  // Form Inputs
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  
  // Payment state
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null)
  const [iframeLoading, setIframeLoading] = useState(true)
  
  // Polling reference
  const pollingIntervalRef = useRef<any | null>(null)

  // Fetch link details on mount
  useEffect(() => {
    if (!id) return;
    
    const fetchDetails = async () => {
      try {
        setLoading(true)
        setError(null)
        const res = await paymobBackend.getPublicLink(id)
        if (res && res.success !== false) {
          const data = res.data || res
          setLinkDetails(data)
          // Pre-fill email and phone if they are already saved in DB (but hide dummy ones)
          if (data.client_phone && data.client_phone !== '966500000000' && data.client_phone !== '0500000000') {
            setPhone(data.client_phone)
          }
          
          // If already paid, no need to show form
          if (data.status === 'paid' && data.payment_url_full) {
            setPaymentUrl(data.payment_url_full)
          }
        } else {
          setError('رابط الدفع هذا غير صحيح أو غير موجود.')
        }
      } catch (err: any) {
        console.error('[PublicPay] Fetch error:', err)
        setError(err.message || 'حدث خطأ أثناء تحميل تفاصيل الدفع.')
      } finally {
        setLoading(false)
      }
    }
    
    void fetchDetails()
  }, [id])

  // Poll status when payment intent is created
  useEffect(() => {
    if (!id || !paymentUrl || linkDetails?.status === 'paid') return;
    
    // Poll status every 5 seconds
    pollingIntervalRef.current = setInterval(async () => {
      try {
        const res = await paymobBackend.getPublicLink(id)
        const data = res?.data || res
        if (data && data.status === 'paid') {
          // Success! Update status
          setLinkDetails(data)
          toast.success('تم استلام دفعتك بنجاح!')
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current)
          }
        }
      } catch (err) {
        console.warn('[PublicPay] Polling error:', err)
      }
    }, 5000)
    
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
      }
    }
  }, [id, paymentUrl, linkDetails])

  const handleManualCheck = async () => {
    if (!id) return;
    try {
      setSubmitting(true)
      const res = await paymobBackend.getPublicLink(id)
      const data = res?.data || res
      if (data) {
        setLinkDetails(data)
        if (data.status === 'paid') {
          toast.success('تم استلام دفعتك بنجاح!')
        } else {
          toast.error('لم يتم تأكيد الدفع بعد. يرجى المحاولة بعد إتمام عملية الدفع.')
        }
      }
    } catch (err: any) {
      toast.error(err.message || 'فشل التحقق من حالة الدفع')
    } finally {
      setSubmitting(false)
    }
  }

  const handleStartPayment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!id) return;
    
    // Validations
    if (!email.trim() || !email.includes('@')) {
      toast.error('يرجى إدخال بريد إلكتروني صحيح')
      return;
    }
    
    const cleanPhone = phone.replace(/\D/g, '')
    if (cleanPhone.length < 9) {
      toast.error('يرجى إدخال رقم جوال صحيح')
      return;
    }

    try {
      setSubmitting(true)
      setError(null)
      const res = await paymobBackend.payPublicLink(id, email.trim(), cleanPhone)
      if (res && res.success !== false) {
        const data = res.data || res
        if (data.payment_url_full) {
          setPaymentUrl(data.payment_url_full)
          setIframeLoading(true)
          toast.success('جاري تحميل بوابة الدفع الآمنة...')
        } else {
          throw new Error('لم يتم استلام رابط الدفع من الخادم')
        }
      } else {
        throw new Error(res?.error?.message || 'فشل تهيئة الدفع')
      }
    } catch (err: any) {
      console.error('[PublicPay] Payment error:', err)
      toast.error(err.message || 'فشل بدء عملية الدفع. يرجى مراجعة البيانات.')
    } finally {
      setSubmitting(false)
    }
  }

  // Format currency
  const formatSAR = (amount: number) => {
    return new Intl.NumberFormat('sa-SA', { style: 'currency', currency: 'SAR' }).format(amount)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center font-cairo" dir="rtl">
        <div className="space-y-4 text-center">
          <RefreshCw className="animate-spin text-indigo-500 mx-auto" size={48} />
          <h2 className="text-xl font-bold text-white">جاري تحميل تفاصيل الدفع...</h2>
          <p className="text-gray-400 text-sm">يرجى الانتظار لحين تحميل البيانات بأمان</p>
        </div>
      </div>
    )
  }

  if (error || !linkDetails) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center font-cairo px-4" dir="rtl">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center space-y-6 shadow-2xl">
          <div className="w-16 h-16 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto ring-4 ring-red-500/5">
            <AlertCircle size={32} />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-black text-white">خطأ في الرابط</h1>
            <p className="text-gray-400 text-sm leading-relaxed">
              {error || 'رابط الدفع هذا غير موجود أو منتهي الصلاحية.'}
            </p>
          </div>
          <div className="pt-2">
            <a 
              href="https://shippec.com" 
              className="inline-flex items-center justify-center w-full py-4 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-2xl transition-all"
            >
              الذهاب للموقع الرئيسي
            </a>
          </div>
        </div>
      </div>
    )
  }

  // Paid/Success screen
  if (linkDetails.status === 'paid') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 flex flex-col items-center justify-center font-cairo px-4 py-8" dir="rtl">
        <div className="max-w-xl w-full bg-slate-900/80 backdrop-blur-md border border-emerald-500/30 rounded-3xl p-8 text-center space-y-8 shadow-2xl relative overflow-hidden">
          {/* Confetti-like gradient effect */}
          <div className="absolute top-0 right-1/2 translate-x-1/2 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl" />
          
          <div className="w-20 h-20 bg-emerald-500/15 text-emerald-500 rounded-full flex items-center justify-center mx-auto ring-8 ring-emerald-500/5 animate-bounce">
            <CheckCircle2 size={40} />
          </div>
          
          <div className="space-y-3">
            <h1 className="text-3xl font-black text-white">تم سداد الفاتورة بنجاح</h1>
            <p className="text-emerald-400 text-sm font-bold">شكراً لك! تم استلام وتأكيد دفعتك بالكامل.</p>
          </div>
          
          <div className="border-t border-b border-slate-800 py-6 my-2 space-y-4">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">اسم العميل</span>
              <span className="text-white font-bold">{linkDetails.client_name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">مبلغ السداد</span>
              <span className="text-emerald-400 font-extrabold text-base">{formatSAR(linkDetails.amount)}</span>
            </div>
            {linkDetails.invoice_info && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">رقم الفاتورة</span>
                <span className="text-white font-mono font-bold">{linkDetails.invoice_info.invoice_number}</span>
              </div>
            )}
            {linkDetails.invoice_info?.awb && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">رقم بوليصة الشحن (AWB)</span>
                <span className="text-white font-mono font-bold">{linkDetails.invoice_info.awb}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">الوصف</span>
              <span className="text-gray-300">{linkDetails.description}</span>
            </div>
            {linkDetails.paymob_order_id && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">رقم مرجع الدفع</span>
                <span className="text-gray-300 font-mono">{linkDetails.paymob_order_id}</span>
              </div>
            )}
          </div>

          <div className="pt-2 text-center text-xs text-gray-500 flex items-center justify-center gap-2">
            <ShieldCheck size={14} className="text-emerald-500" />
            <span>بوابة دفع آمنة مشفرة متوافقة مع PCI-DSS</span>
          </div>
        </div>
      </div>
    )
  }

  // Active Checkout page (Iframe embedded)
  if (paymentUrl) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col font-cairo" dir="rtl">
        {/* Navigation / Header */}
        <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between sticky top-0 z-50">
          <div className="flex items-center gap-3">
            <img src={shippecLogo} alt="Ship Pec" className="w-10 h-10 rounded-xl object-cover" />
            <div>
              <h2 className="text-lg font-black text-white">بوابة دفع ShipPec الآمنة</h2>
              <p className="text-gray-400 text-xs">سداد فاتورة العميل: {linkDetails.client_name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 hidden sm:inline">المبلغ المستحق:</span>
            <span className="text-indigo-400 font-extrabold text-sm sm:text-base bg-indigo-500/10 px-3 py-1.5 rounded-lg">
              {formatSAR(linkDetails.amount)}
            </span>
          </div>
        </header>

        {/* Iframe Viewport */}
        <main className="flex-1 flex flex-col lg:flex-row gap-6 p-4 sm:p-6 max-w-7xl mx-auto w-full">
          {/* Right column: Info & actions */}
          <div className="w-full lg:w-[30%] space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-6">
              <h3 className="text-md font-bold text-white border-b border-slate-800 pb-3">تفاصيل المعاملة</h3>
              
              <div className="space-y-4 text-sm">
                <div>
                  <label className="text-gray-500 text-xs block mb-1">العميل المستلم</label>
                  <span className="text-white font-bold">{linkDetails.client_name}</span>
                </div>
                <div>
                  <label className="text-gray-500 text-xs block mb-1">وصف الخدمة</label>
                  <span className="text-gray-300 leading-relaxed block">{linkDetails.description}</span>
                </div>
                {linkDetails.invoice_info && (
                  <>
                    <div>
                      <label className="text-gray-500 text-xs block mb-1">رقم الفاتورة</label>
                      <span className="text-white font-mono font-bold">{linkDetails.invoice_info.invoice_number}</span>
                    </div>
                    {linkDetails.invoice_info.awb && (
                      <div>
                        <label className="text-gray-500 text-xs block mb-1">بوليصة الشحن (AWB)</label>
                        <div className="flex items-center gap-2 text-white mt-1">
                          <Truck size={16} className="text-indigo-400" />
                          <span className="font-mono font-bold">{linkDetails.invoice_info.awb}</span>
                          <span className="text-xs text-gray-500">({linkDetails.invoice_info.carrier})</span>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Support Actions */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
              <h4 className="text-sm font-bold text-white">هل تواجه مشكلة في الدفع؟</h4>
              <p className="text-xs text-gray-400 leading-relaxed">
                إذا كان المتصفح يمنع فتح بوابة الدفع أو إذا كنت تفضل استخدام Apple Pay في نافذة مخصصة، يمكنك فتح بوابة الدفع مباشرة في نافذة جديدة.
              </p>
              
              <a 
                href={paymentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold rounded-2xl transition-all shadow-lg shadow-indigo-600/10 active:scale-[0.98]"
              >
                <ExternalLink size={16} />
                فتح بوابة الدفع في نافذة جديدة
              </a>

              <button
                onClick={handleManualCheck}
                disabled={submitting}
                className="flex items-center justify-center gap-2 w-full py-3 border border-slate-800 hover:border-slate-700 text-gray-300 text-sm font-bold rounded-2xl transition-all bg-slate-950 active:scale-[0.98] disabled:opacity-50"
              >
                {submitting ? (
                  <RefreshCw className="animate-spin" size={16} />
                ) : (
                  <CheckCircle2 size={16} className="text-emerald-500" />
                )}
                التحقق من حالة الدفع يدوياً
              </button>
            </div>

            {/* PCI-DSS certification notice */}
            <div className="flex items-center gap-3 text-gray-500 text-xs px-4">
              <Lock size={16} className="text-emerald-600 flex-shrink-0" />
              <p className="leading-relaxed">
                بيانات بطاقتك الائتمانية مشفرة تماماً وتُعالج مباشرة بواسطة Paymob. لا يتم تخزين أي بيانات للبطاقات على خوادمنا.
              </p>
            </div>
          </div>

          {/* Left column: Embedded Paymob Iframe */}
          <div className="flex-1 bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl relative min-h-[600px] lg:min-h-[700px] flex flex-col">
            {iframeLoading && (
              <div className="absolute inset-0 bg-slate-900 flex flex-col items-center justify-center space-y-4 z-40">
                <RefreshCw className="animate-spin text-indigo-500" size={36} />
                <p className="text-sm text-gray-400">جاري تحميل بوابة الدفع الآمنة...</p>
              </div>
            )}
            
            <iframe 
              src={paymentUrl} 
              title="بوابة دفع Paymob الآمنة"
              className="w-full flex-1 border-none"
              onLoad={() => setIframeLoading(false)}
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
            />
          </div>
        </main>
      </div>
    )
  }

  // Contact form state (email, phone number gathering)
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 flex flex-col items-center justify-center font-cairo px-4 py-8" dir="rtl">
      {/* Brand logo & header */}
      <div className="text-center mb-8">
        <div className="relative inline-block mb-3">
          <div className="absolute -inset-2 bg-gradient-to-br from-indigo-500/20 to-sky-500/20 rounded-3xl blur-xl" />
          <img 
            src={shippecLogo} 
            alt="ShipPec Logo" 
            className="relative w-16 h-16 rounded-2xl object-cover shadow-2xl ring-2 ring-white/10 mx-auto animate-pulse" 
          />
        </div>
        <h1 className="text-2xl font-black text-white">منصة ShipPec للتحصيل الإلكتروني</h1>
        <p className="text-gray-400 text-xs mt-1">بوابة دفع آمنة ومشفرة بالكامل بالتعاون مع Paymob</p>
      </div>

      {/* Main card */}
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl">
        {/* Invoice Summary header */}
        <div className="bg-slate-950 border border-slate-850 rounded-2xl p-5 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] text-gray-500 uppercase font-bold tracking-wider">مبلغ السداد المطلوب</span>
            <h2 className="text-xl sm:text-2xl font-extrabold text-emerald-400 font-inter">
              {formatSAR(linkDetails.amount)}
            </h2>
          </div>
          <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-xl">
            <CreditCard size={24} />
          </div>
        </div>

        {/* Invoice description */}
        <div className="space-y-3 bg-slate-900/50 p-4 rounded-xl border border-slate-850 text-sm leading-relaxed">
          <div className="flex justify-between">
            <span className="text-gray-500">العميل المستلم:</span>
            <span className="text-white font-bold">{linkDetails.client_name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">البيان:</span>
            <span className="text-gray-300">{linkDetails.description}</span>
          </div>
          {linkDetails.invoice_info && (
            <>
              <div className="flex justify-between border-t border-slate-800/50 pt-2.5 mt-2">
                <span className="text-gray-500">رقم الفاتورة:</span>
                <span className="text-white font-mono font-bold">{linkDetails.invoice_info.invoice_number}</span>
              </div>
              {linkDetails.invoice_info.awb && (
                <div className="flex justify-between mt-1">
                  <span className="text-gray-500">بوليصة الشحن (AWB):</span>
                  <span className="text-white font-mono font-bold">{linkDetails.invoice_info.awb}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Divider */}
        <div className="relative py-2">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-800" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-slate-900 px-4 text-gray-500 font-bold">معلومات السداد والاتصال</span>
          </div>
        </div>

        {/* Customer Contact Details Form */}
        <form onSubmit={handleStartPayment} className="space-y-4">
          {/* Email input */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-400 mr-1">البريد الإلكتروني للعميل <span className="text-red-500">*</span></label>
            <div className="relative group">
              <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none text-gray-500 group-focus-within:text-indigo-400 transition-colors">
                <Mail size={18} />
              </div>
              <input
                required
                type="email"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3.5 pl-4 pr-12 text-white text-sm focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all placeholder:text-gray-600 font-inter"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="customer@email.com"
                dir="ltr"
                disabled={submitting}
              />
            </div>
            <p className="text-[10px] text-gray-500 mr-1">سنرسل إيصال السداد الإلكتروني إلى هذا البريد.</p>
          </div>

          {/* Phone input */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-400 mr-1">رقم جوال العميل <span className="text-red-500">*</span></label>
            <div className="relative group">
              <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none text-gray-555 group-focus-within:text-indigo-400 transition-colors">
                <Phone size={18} className="text-gray-500" />
              </div>
              <input
                required
                type="tel"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3.5 pl-4 pr-12 text-white text-sm focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all placeholder:text-gray-600 font-inter"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0501234567"
                dir="ltr"
                disabled={submitting}
              />
            </div>
            <p className="text-[10px] text-gray-500 mr-1">مطلوب من بوابة الدفع للتحقق من هوية العملية الماليّة.</p>
          </div>

          {/* Secure details reminder */}
          <div className="bg-slate-950/40 p-3.5 rounded-xl border border-indigo-500/10 flex items-start gap-3">
            <Lock className="text-indigo-400 mt-0.5 flex-shrink-0" size={16} />
            <p className="text-[11px] text-gray-400 leading-relaxed">
              بإدخال هذه البيانات، سيتم فتح بوابة سداد Paymob الآمنة لتعبئة بيانات بطاقتك (مدى، فيزا، ماستركارد) وإتمام السداد مباشرة.
            </p>
          </div>

          {/* Submit CTA button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="w-full relative overflow-hidden bg-gradient-to-l from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-bold py-4 px-6 rounded-2xl flex items-center justify-center gap-2.5 transition-all shadow-xl shadow-indigo-600/10 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <RefreshCw className="animate-spin" size={18} />
              ) : (
                <ShieldCheck size={18} className="text-indigo-200" />
              )}
              <span>الانتقال للدفع الآمن</span>
            </button>
          </div>
        </form>
      </div>

      {/* Footer info */}
      <footer className="mt-8 flex items-center gap-2 text-gray-600 text-[11px]">
        <Globe size={12} />
        <span>بوابة دفع آمنة متكاملة ومحمية بالكامل © 2026 ShipPec</span>
      </footer>
    </div>
  )
}
