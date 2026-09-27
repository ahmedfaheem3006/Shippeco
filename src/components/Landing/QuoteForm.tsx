import { useState, type FormEvent, type ReactNode } from 'react'
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { submitQuoteRequest, QuoteRequestError, type QuoteRequestInput } from '../../services/quoteRequestService'
import { QUOTE_FORM, COUNTRY_OPTIONS, PHONE_COUNTRY_CODES } from '../../content/landingPageContent'

const EMPTY: QuoteRequestInput = {
  name: '',
  phone: '',
  origin_country: 'EG',
  origin_city: '',
  destination_country: 'SA',
  destination_city: '',
  contents: '',
  weight_approx: '',
  weight_unit: 'kg',
  extra_details: '',
  website: '', // honeypot
}

export function LandingQuoteForm() {
  const [phoneCode, setPhoneCode] = useState('+20')
  const [form, setForm] = useState<QuoteRequestInput>(EMPTY)
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const set = <K extends keyof QuoteRequestInput>(key: K, value: QuoteRequestInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (status === 'submitting') return // guards against double-click/duplicate submits
    setStatus('submitting')
    setErrorMessage(null)

    try {
      await submitQuoteRequest({ ...form, phone: `${phoneCode}${form.phone.replace(/\D/g, '')}` })
      setStatus('success')
      setForm(EMPTY) // only clear the form once the server actually confirmed the save
    } catch (err) {
      // Keep whatever the visitor typed — a failure must never lose their input.
      setStatus('error')
      setErrorMessage(err instanceof QuoteRequestError ? err.message : QUOTE_FORM.genericErrorMessage)
    }
  }

  if (status === 'success') {
    return (
      <section id="quote" className="max-w-2xl mx-auto px-5 py-16 md:py-20 text-center">
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-8 flex flex-col items-center gap-3">
          <CheckCircle2 size={40} className="text-emerald-500" aria-hidden="true" />
          <h2 className="text-xl font-extrabold text-emerald-800">{QUOTE_FORM.successMessage}</h2>
          <button
            type="button"
            onClick={() => setStatus('idle')}
            className="mt-2 text-sm font-bold text-emerald-700 hover:underline"
          >
            إرسال طلب آخر
          </button>
        </div>
      </section>
    )
  }

  return (
    <section id="quote" className="max-w-2xl mx-auto px-5 py-16 md:py-20">
      <div className="text-center mb-8 shp-animate-in">
        <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900">{QUOTE_FORM.title}</h2>
        <p className="mt-3 text-gray-600">{QUOTE_FORM.description}</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 sm:p-7 flex flex-col gap-4">
        {/* Honeypot — visually hidden, never shown to real visitors. Bots
            that fill every field trip this and the Backend rejects it. */}
        <div style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)' }} aria-hidden="true">
          <label htmlFor="website">اتركه فارغًا</label>
          <input
            id="website"
            name="website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={form.website}
            onChange={(e) => set('website', e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="الاسم" required>
            <input
              required
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              className={inputClass}
              placeholder="اسمك الكامل"
            />
          </Field>

          <Field label="رقم التواصل" required>
            <div className="flex gap-2">
              <select value={phoneCode} onChange={(e) => setPhoneCode(e.target.value)} className={`${inputClass} w-28 shrink-0`}>
                {PHONE_COUNTRY_CODES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
              <input
                required
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
                className={`${inputClass} flex-1`}
                placeholder="5xxxxxxxx"
                dir="ltr"
                inputMode="tel"
              />
            </div>
          </Field>

          <Field label="دولة الإرسال" required>
            <select required value={form.origin_country} onChange={(e) => set('origin_country', e.target.value)} className={inputClass}>
              {COUNTRY_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </Field>
          <Field label="مدينة الإرسال">
            <input value={form.origin_city} onChange={(e) => set('origin_city', e.target.value)} className={inputClass} placeholder="اختياري" />
          </Field>

          <Field label="دولة الاستلام" required>
            <select required value={form.destination_country} onChange={(e) => set('destination_country', e.target.value)} className={inputClass}>
              {COUNTRY_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </Field>
          <Field label="مدينة الاستلام">
            <input value={form.destination_city} onChange={(e) => set('destination_city', e.target.value)} className={inputClass} placeholder="اختياري" />
          </Field>
        </div>

        <Field label="محتويات الشحنة" required>
          <textarea
            required
            rows={3}
            value={form.contents}
            onChange={(e) => set('contents', e.target.value)}
            className={inputClass}
            placeholder="مثال: ملابس، مستلزمات منزلية..."
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="الوزن التقريبي">
            <input
              type="number"
              min={0}
              step="0.1"
              value={form.weight_approx}
              onChange={(e) => set('weight_approx', e.target.value)}
              className={inputClass}
              placeholder="اختياري"
              dir="ltr"
            />
          </Field>
          <Field label="وحدة الوزن">
            <select value={form.weight_unit} onChange={(e) => set('weight_unit', e.target.value as 'kg' | 'lb')} className={inputClass}>
              <option value="kg">كيلوجرام</option>
              <option value="lb">رطل</option>
            </select>
          </Field>
        </div>

        <Field label="تفاصيل إضافية">
          <textarea
            rows={2}
            value={form.extra_details}
            onChange={(e) => set('extra_details', e.target.value)}
            className={inputClass}
            placeholder="اختياري — عدد الطرود، الأبعاد..."
          />
        </Field>

        {status === 'error' && errorMessage && (
          <div className="flex items-center gap-2 text-sm font-bold text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <AlertCircle size={16} aria-hidden="true" />
            {errorMessage}
          </div>
        )}

        <button
          type="submit"
          disabled={status === 'submitting'}
          className="mt-2 w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-lg shadow-indigo-500/20 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {status === 'submitting' && <Loader2 size={18} className="animate-spin" aria-hidden="true" />}
          {status === 'submitting' ? 'جارِ الإرسال...' : QUOTE_FORM.submitLabel}
        </button>
        <p className="text-xs text-gray-400 text-center">{QUOTE_FORM.privacyNote}</p>
      </form>
    </section>
  )
}

const inputClass =
  'w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400 transition-all'

function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-bold text-gray-700">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      {children}
    </label>
  )
}
