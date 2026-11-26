/**
 * «إضافة عميل جديد / Add New Customer» — the ONE customer-creation form of
 * SHIPPEC (Customers page, Invoices page, manual invoice, Create Shipment).
 *
 *   - same endpoint as before: POST /clients through clientService.createClient
 *     (Backend validation, role check — admin / accountant — and audit unchanged);
 *   - same fields and rules: full name required, every other field optional,
 *     an e-mail (when typed) must be valid — exactly what the Backend schema checks;
 *   - the record the Backend returns (with its real id) is handed to `onCreated`;
 *     nothing is ever created in the browser only;
 *   - one request per click: Save is disabled and a second submit is ignored
 *     while the first is running; a failure keeps the typed values and changes
 *     nothing in the caller (invoice / shipment draft stay as they were);
 *   - `successScreen`: the Customers / Invoices pages keep their 2-second
 *     «تم تسجيل العميل بنجاح» confirmation; a quick add closes at once so the
 *     caller can select the new customer.
 */
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AlertCircle, Building2, CheckCircle2, FileText, Loader2, Mail, MapPin, Phone, UserPlus, Users, X } from 'lucide-react'
import { clientService } from '../../services/clientService'
import { ApiError } from '../../utils/apiClient'
import { describeApiError } from '../../utils/apiErrors'

export type CreatedCustomer = {
  id: number
  name: string
  phone: string | null
  email: string | null
  company: string | null
  city: string | null
  address: string | null
  tax_number: string | null
}

type Lang = 'ar' | 'en'

type Props = {
  open: boolean
  onClose: () => void
  /** Called once with the customer the Backend saved; the modal closes itself afterwards. */
  onCreated: (customer: CreatedCustomer) => void
  lang?: Lang
  successScreen?: boolean
}

const SUCCESS_SCREEN_MS = 2000
// the Backend checks the same thing (zod .email()); this only answers before the round trip
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function messageFor(err: unknown, lang: Lang): string {
  const ar = lang === 'ar'
  if (err instanceof ApiError) {
    if (err.status === 403) return ar ? 'ليست لديك صلاحية لإضافة العملاء' : 'You do not have permission to add customers'
    if (err.status === 400) {
      if (err.details.some((d) => d.field === 'email')) return ar ? 'البريد الإلكتروني غير صحيح' : 'Enter a valid email address'
      if (err.details.some((d) => d.field === 'name')) return ar ? 'الاسم الكامل مطلوب' : 'Full name is required'
    }
  }
  if (ar) return describeApiError(err, 'حدث خطأ أثناء إضافة العميل')
  return 'The customer could not be saved — nothing was changed. Try again.'
}

function toCustomer(raw: unknown): CreatedCustomer | null {
  const r = (raw && typeof raw === 'object' ? raw : null) as Record<string, unknown> | null
  const id = Number(r?.id)
  if (!r || !Number.isInteger(id) || id <= 0) return null
  const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null)
  return {
    id, name: s(r.name) ?? '', phone: s(r.phone), email: s(r.email), company: s(r.company),
    city: s(r.city), address: s(r.address), tax_number: s(r.tax_number),
  }
}

export function QuickAddCustomerModal(props: Props) {
  // mounted only while open → every opening starts from an empty form
  return props.open ? <CustomerForm {...props} /> : null
}

function CustomerForm({ onClose, onCreated, lang = 'ar', successScreen = false }: Props) {
  const ar = lang === 'ar'
  const t = (a: string, e: string) => (ar ? a : e)
  const titleId = useId()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [company, setCompany] = useState('')
  const [city, setCity] = useState('')
  const [address, setAddress] = useState('')
  const [taxNumber, setTaxNumber] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<{ message: string; field?: 'name' | 'email' } | null>(null)
  const [done, setDone] = useState(false)
  const inFlight = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !inFlight.current) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    // React events bubble through portals: never let this submit reach a form of the caller
    e.stopPropagation()
    if (inFlight.current) return
    if (!name.trim()) { setError({ message: t('الاسم الكامل مطلوب', 'Full name is required'), field: 'name' }); return }
    if (email.trim() && !EMAIL_RE.test(email.trim())) { setError({ message: t('البريد الإلكتروني غير صحيح', 'Enter a valid email address'), field: 'email' }); return }
    inFlight.current = true
    setSaving(true)
    setError(null)
    try {
      const created = toCustomer(await clientService.createClient({
        name: name.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        company: company.trim() || undefined,
        city: city.trim() || undefined,
        address: address.trim() || undefined,
        tax_number: taxNumber.trim() || undefined,
      }))
      if (!created) {
        // saved (2xx) but no id came back — never retry blindly, that would duplicate the customer
        setError({ message: t('تم الحفظ لكن لم يُرجع الخادم رقم العميل — ابحث عنه بالاسم بدل إضافته مرة أخرى', 'Saved, but the server did not return the customer id — search for the customer by name instead of adding it again') })
        return
      }
      onCreated(created)
      if (successScreen) {
        setDone(true)
        timer.current = setTimeout(onClose, SUCCESS_SCREEN_MS)
      } else {
        onClose()
      }
    } catch (err) {
      setError({ message: messageFor(err, lang) })
    } finally {
      inFlight.current = false
      setSaving(false)
    }
  }

  // icons sit at the start of the field (right in Arabic, left in English)
  const iconCls = `absolute ${ar ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none`
  const inputCls = (invalid = false) =>
    `w-full bg-gray-50 dark:bg-slate-900 border ${invalid ? 'border-red-400 dark:border-red-500' : 'border-gray-200 dark:border-slate-700'} rounded-xl py-2.5 ${ar ? 'pr-10 pl-4' : 'pl-10 pr-4'} text-sm font-bold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all`
  const field = (label: string, icon: ReactNode, input: ReactNode, wide = false) => (
    <label className={`flex flex-col gap-1.5 ${wide ? 'md:col-span-2' : ''}`}>
      <span className="text-xs font-bold text-gray-500 dark:text-gray-400">{label}</span>
      <span className="relative block">{icon}{input}</span>
    </label>
  )

  // portal: a transformed / animated ancestor (wizard steps, page sections) must not trap the fixed overlay
  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
      <div
        role="dialog" aria-modal="true" aria-labelledby={titleId} data-testid="quick-add-customer-modal"
        className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-3xl w-full max-w-lg max-h-[calc(100vh-2rem)] flex flex-col overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200"
        dir={ar ? 'rtl' : 'ltr'}
      >
        {done ? (
          <div className="p-12 flex flex-col items-center justify-center text-center space-y-4 animate-in zoom-in-95 duration-200" role="status">
            <div className="w-20 h-20 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-500 rounded-full flex items-center justify-center animate-bounce shadow-lg shadow-emerald-500/20">
              <CheckCircle2 size={48} className="stroke-[3]" />
            </div>
            <div>
              <h3 id={titleId} className="text-xl font-black text-gray-900 dark:text-white">{t('تم تسجيل العميل بنجاح!', 'Customer registered successfully!')}</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-bold mt-1.5">{t('تم إنشاء ملف تعريف العميل وحفظ بياناته في النظام.', "The customer's profile was created and saved.")}</p>
            </div>
          </div>
        ) : (
          <>
            <div className="p-5 border-b border-gray-100 dark:border-slate-700/50 flex justify-between items-center bg-gray-50/50 dark:bg-slate-900/10">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 rounded-xl">
                  <UserPlus size={20} />
                </div>
                <div>
                  <h3 id={titleId} className="font-black text-base text-gray-900 dark:text-white">{t('إضافة عميل جديد', 'Add New Customer')}</h3>
                  <p className="text-[10px] text-gray-400 font-bold mt-0.5">{t('أدخل بيانات العميل لإنشاء ملف تعريفي خاص به', "Enter the customer's details to create their profile")}</p>
                </div>
              </div>
              <button type="button" onClick={onClose} disabled={saving} aria-label={t('إغلاق', 'Close')}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-700 transition-all disabled:opacity-50">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col min-h-0">
              <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
                {error && (
                  <div role="alert" className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/30 text-red-600 dark:text-red-400 px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2">
                    <AlertCircle size={16} className="shrink-0" />
                    <span>{error.message}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {field(t('الاسم الكامل *', 'Full Name *'), <Users size={16} className={iconCls} />,
                    <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus aria-required="true"
                      aria-invalid={error?.field === 'name'} placeholder={t('مثال: أحمد محمد علي', 'e.g. Ahmed Mohammed Ali')} className={inputCls(error?.field === 'name')} />, true)}
                  {field(t('رقم الجوال', 'Mobile Number'), <Phone size={16} className={iconCls} />,
                    <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="05xxxxxxxx" dir="ltr" inputMode="tel"
                      className={`${inputCls()} font-mono ${ar ? 'text-right' : 'text-left'}`} />)}
                  {field(t('البريد الإلكتروني', 'Email Address'), <Mail size={16} className={iconCls} />,
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="customer@example.com" dir="ltr"
                      aria-invalid={error?.field === 'email'} className={`${inputCls(error?.field === 'email')} ${ar ? 'text-right' : 'text-left'}`} />)}
                  {field(t('اسم الشركة', 'Company Name'), <Building2 size={16} className={iconCls} />,
                    <input type="text" value={company} onChange={(e) => setCompany(e.target.value)} placeholder={t('مؤسسة الشحن للمقاولات', 'e.g. Gulf Trading Est.')} className={inputCls()} />)}
                  {field(t('المدينة', 'City'), <MapPin size={16} className={iconCls} />,
                    <input type="text" value={city} onChange={(e) => setCity(e.target.value)} placeholder={t('الرياض / جدة...', 'Riyadh / Jeddah...')} className={inputCls()} />)}
                  {field(t('العنوان بالتفصيل', 'Detailed Address'), <MapPin size={16} className={iconCls} />,
                    <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} placeholder={t('الرمز البريدي، اسم الشارع، رقم البناية', 'Postal code, street name, building number')} className={inputCls()} />, true)}
                  {field(t('الرقم الضريبي (إن وجد)', 'Tax Number (if any)'), <FileText size={16} className={iconCls} />,
                    <input type="text" value={taxNumber} onChange={(e) => setTaxNumber(e.target.value)} placeholder="3xxxxxxxxxxxxxx" className={`${inputCls()} font-mono`} />, true)}
                </div>
              </div>

              <div className="p-5 border-t border-gray-100 dark:border-slate-700/50 bg-gray-50/50 dark:bg-slate-900/10 flex justify-end gap-2">
                <button type="button" onClick={onClose} disabled={saving}
                  className="px-5 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 text-sm font-bold text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50">
                  {t('إلغاء', 'Cancel')}
                </button>
                <button type="submit" disabled={saving} aria-busy={saving}
                  className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-bold text-sm shadow-lg shadow-emerald-500/20 active:scale-95 disabled:opacity-50 transition-all">
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
                  <span>{t('حفظ وإضافة', 'Save & Add')}</span>
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
