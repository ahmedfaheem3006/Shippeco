import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { CheckCircle2, ChevronRight, AlertCircle, Loader2, CreditCard, User, Mail, Phone, Lock } from 'lucide-react'
import { api } from '../utils/apiClient'

export function PublicCheckoutPage() {
  const { invoiceId } = useParams()
  
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [invoice, setInvoice] = useState<any>(null)
  
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    // We append a random param to ensure we bypass cache if needed
    api.get(`/paymob/invoice-info/${invoiceId}?t=${Date.now()}`)
      .then(res => {
        const data = res.data || res;
        setInvoice(data)
        // Pre-fill phone if we have it from the backend
        if (data.phone && data.phone !== 'NA') {
          setPhone(data.phone)
        }
        setLoading(false)
      })
      .catch(err => {
        setError(err.response?.data?.error?.message || err.message || 'تعذر تحميل بيانات الفاتورة')
        setLoading(false)
      })
  }, [invoiceId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!phone) {
      alert('الرجاء إدخال رقم الجوال')
      return
    }
    
    setCreating(true)
    
    try {
      const res = await api.post('/paymob/public-create-link', {
        invoice_id: invoiceId,
        amount: invoice.total,
        client_name: invoice.client || 'عميل',
        client_phone: phone,
        client_email: email || undefined,
        description: `دفع فاتورة #${invoice.invoice_number || invoice.id}`
      })
      
      const data = res.data || res;
      const url = data.payment_url_full || data.payment_url || data.payment_link || data.url
      if (url) {
        window.location.href = url
      } else {
        throw new Error('لم يتم إنشاء الرابط بشكل صحيح')
      }
    } catch (err: any) {
      alert(err.response?.data?.error?.message || err.message || 'فشل الانتقال للدفع')
      setCreating(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900" dir="rtl">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    )
  }

  if (error || !invoice) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-slate-900 p-4" dir="rtl">
        <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl shadow-xl max-w-md w-full text-center border border-gray-100 dark:border-slate-700">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle size={32} />
          </div>
          <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-2">عفواً، لا يمكن الوصول للفاتورة</h2>
          <p className="text-gray-500 dark:text-slate-400">{error}</p>
        </div>
      </div>
    )
  }

  if (invoice.status === 'paid') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-slate-900 p-4" dir="rtl">
        <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl shadow-xl max-w-md w-full text-center border border-gray-100 dark:border-slate-700">
          <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 size={32} />
          </div>
          <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-2">الفاتورة مدفوعة مسبقاً</h2>
          <p className="text-gray-500 dark:text-slate-400">تم سداد قيمة هذه الفاتورة بالكامل. شكراً لتعاملكم معنا.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex flex-col items-center justify-center p-4 sm:p-8" dir="rtl">
      
      {/* Header Logo */}
      <div className="mb-8 flex flex-col items-center gap-3">
        <div className="w-16 h-16 rounded-2xl bg-white shadow-sm flex items-center justify-center overflow-hidden border border-gray-100">
          <img src="/Frontend/src/assets/shippec.jpeg" alt="Ship Pec" className="w-12 h-12 object-contain" onError={(e) => {
            (e.target as HTMLImageElement).src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%233b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>'
          }} />
        </div>
        <h1 className="text-2xl font-black tracking-tight text-gray-900 dark:text-white">Ship Pec</h1>
      </div>

      {/* Main Card */}
      <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-xl max-w-md w-full overflow-hidden border border-gray-100 dark:border-slate-700">
        
        {/* Top Section: Invoice Summary */}
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-8 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white opacity-5 rounded-bl-full"></div>
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-black opacity-10 rounded-tr-full"></div>
          
          <div className="relative z-10 flex flex-col gap-1">
            <span className="text-blue-100 font-medium text-sm">إجمالي المبلغ المطلوب</span>
            <div className="flex items-end gap-2 mt-1">
              <span className="text-4xl font-black">{Number(invoice.total).toFixed(2)}</span>
              <span className="text-blue-200 font-bold mb-1">ر.س</span>
            </div>
            
            <div className="mt-6 flex flex-col gap-2">
              <div className="flex justify-between items-center text-sm border-b border-blue-500/30 pb-2">
                <span className="text-blue-100">رقم الفاتورة</span>
                <span className="font-bold">#{invoice.invoice_number || invoice.id}</span>
              </div>
              <div className="flex justify-between items-center text-sm pt-1">
                <span className="text-blue-100">العميل</span>
                <span className="font-bold flex items-center gap-1"><User size={14}/> {invoice.client}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Section: Form */}
        <div className="p-8">
          <div className="mb-6">
            <h3 className="text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2">
              <CreditCard size={20} className="text-blue-600" />
              بيانات التواصل للإيصال
            </h3>
            <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
              يرجى تأكيد بياناتك ليتم إرسال إيصال الدفع لك.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div>
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                رقم الجوال <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-gray-400">
                  <Phone size={18} />
                </div>
                <input
                  type="tel"
                  dir="ltr"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="مثال: 05XXXXXXXX"
                  className="w-full text-right bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl py-3 px-4 pr-10 text-gray-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                البريد الإلكتروني <span className="text-gray-400 text-xs font-normal">(اختياري)</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-gray-400">
                  <Mail size={18} />
                </div>
                <input
                  type="email"
                  dir="ltr"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@example.com"
                  className="w-full text-right bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl py-3 px-4 pr-10 text-gray-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={creating}
              className="w-full mt-4 flex items-center justify-center gap-2 py-4 px-6 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-lg shadow-lg shadow-blue-500/30 transition-all active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {creating ? (
                <>
                  <Loader2 size={24} className="animate-spin" />
                  جاري التحويل...
                </>
              ) : (
                <>
                  <Lock size={20} />
                  استمرار آمن للدفع
                  <ChevronRight size={20} className="mr-auto ml-0" />
                </>
              )}
            </button>
            
            <div className="flex items-center justify-center gap-2 mt-4 text-xs font-medium text-gray-400">
              <Lock size={12} /> مدعوم ومؤمن بواسطة Paymob
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
