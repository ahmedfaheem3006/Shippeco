import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Loader2, CheckCircle2, AlertCircle, User, Route, Package, PlaneTakeoff, PlaneLanding, ChevronDown } from 'lucide-react'
import { submitQuoteRequest, QuoteRequestError, type QuoteRequestInput } from '../../services/quoteRequestService'
import { SearchableSelect } from '../shared/SearchableSelect'
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

type FieldErrors = Partial<Record<keyof QuoteRequestInput, string>>

// The order fields appear in the form — used to pick which invalid field
// gets focus after a server-side validation error.
const FIELD_ORDER: (keyof QuoteRequestInput)[] = [
  'name', 'phone', 'origin_country', 'origin_city',
  'destination_country', 'destination_city', 'contents', 'weight_approx', 'extra_details',
]

/** Strips a leading "00" or the dial code itself (and one leading trunk
 *  zero) from the digits the visitor typed, so pasting a full
 *  international number never doubles the selected dial code — e.g.
 *  code "+20" + typed "0201012345678" would otherwise become
 *  "+200201012345678" instead of "+201012345678". */
function buildFullPhone(code: string, rawDigits: string): string {
  const codeDigits = code.replace(/\D/g, '')
  let d = rawDigits.replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  if (codeDigits && d.startsWith(codeDigits)) d = d.slice(codeDigits.length)
  d = d.replace(/^0/, '')
  return `${code}${d}`
}

export function LandingQuoteForm() {
  const [phoneCode, setPhoneCode] = useState('+20')
  const [form, setForm] = useState<QuoteRequestInput>(EMPTY)
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const fieldRefs = useRef<Partial<Record<keyof QuoteRequestInput, HTMLElement | null>>>({})

  const set = <K extends keyof QuoteRequestInput>(key: K, value: QuoteRequestInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const bindRef = (key: keyof QuoteRequestInput) => (el: HTMLElement | null) => {
    fieldRefs.current[key] = el
  }

  const errorAttrs = (key: keyof QuoteRequestInput) => ({
    'aria-invalid': fieldErrors[key] ? true : undefined,
    'aria-describedby': fieldErrors[key] ? `${key}-error` : undefined,
  })

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (status === 'submitting') return // guards against double-click/duplicate submits
    setStatus('submitting')
    setErrorMessage(null)
    setFieldErrors({})

    try {
      await submitQuoteRequest({ ...form, phone: buildFullPhone(phoneCode, form.phone) })
      setStatus('success')
      setForm(EMPTY) // only clear the form once the server actually confirmed the save
    } catch (err) {
      // Keep whatever the visitor typed — a failure must never lose their input.
      setStatus('error')
      if (err instanceof QuoteRequestError && err.fieldErrors?.length) {
        const map: FieldErrors = {}
        for (const fe of err.fieldErrors) {
          if (fe.field && fe.field !== 'website') map[fe.field as keyof QuoteRequestInput] = fe.message
        }
        setFieldErrors(map)
        setErrorMessage(err.message)
        const firstInvalid = FIELD_ORDER.find((f) => map[f])
        if (firstInvalid) fieldRefs.current[firstInvalid]?.focus()
      } else {
        setErrorMessage(err instanceof QuoteRequestError ? err.message : QUOTE_FORM.genericErrorMessage)
      }
    }
  }

  if (status === 'success') {
    return (
      <section id="quote" className="scroll-mt-20 max-w-2xl mx-auto px-5 py-16 md:py-20 text-center">
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
    <section id="quote" className="scroll-mt-20 max-w-5xl mx-auto px-5 py-16 md:py-20">
      <div className="flex flex-col md:flex-row gap-10 md:gap-8">
        {/* Descriptive column — first in DOM order, sits on the right under
            dir="rtl" on desktop, and appears first on mobile (kept short so
            it never delays reaching the form). */}
        <div className="md:basis-[33%] shp-animate-in">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900">{QUOTE_FORM.title}</h2>
          <p className="mt-3 text-gray-600 leading-relaxed">{QUOTE_FORM.description}</p>
          <ol className="mt-6 flex flex-col gap-3">
            {QUOTE_FORM.steps.map((step, i) => (
              <li key={step} className="flex items-start gap-3 text-sm text-gray-700">
                <span className="shrink-0 w-6 h-6 rounded-full bg-indigo-50 text-indigo-600 text-xs font-extrabold flex items-center justify-center">
                  {i + 1}
                </span>
                <span className="pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
        </div>

        {/* Form card — second in DOM order, sits on the left on desktop. */}
        <div className="md:basis-[67%] shp-animate-in" style={{ animationDelay: '0.06s' }}>
          <form
            onSubmit={handleSubmit}
            className="bg-white border border-gray-200 rounded-2xl shadow-sm p-4 sm:p-6 md:p-8 flex flex-col gap-4"
            noValidate={false}
          >
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

            <GroupHeading icon={User}>بيانات التواصل</GroupHeading>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="الاسم" name="name" required error={fieldErrors.name}>
                <input
                  required
                  ref={bindRef('name')}
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                  className={inputClass(!!fieldErrors.name)}
                  placeholder="اسمك الكامل"
                  {...errorAttrs('name')}
                />
              </Field>

              <Field label="رقم التواصل" name="phone" required error={fieldErrors.phone}>
                <div
                  dir="ltr"
                  className={`flex items-stretch h-12 rounded-xl border overflow-hidden bg-gray-50 focus-within:ring-2 transition-all ${
                    fieldErrors.phone
                      ? 'border-red-300 focus-within:ring-red-500/40 focus-within:border-red-400'
                      : 'border-gray-200 focus-within:ring-indigo-500/40 focus-within:border-indigo-400'
                  }`}
                >
                  <div className="w-[132px] shrink-0 border-e border-gray-200">
                    <SearchableSelect
                      options={PHONE_COUNTRY_CODES}
                      value={phoneCode}
                      onChange={setPhoneCode}
                      placeholder="المفتاح"
                      className="w-full h-full bg-transparent border-none rounded-none px-3 text-sm text-gray-900 flex items-center justify-between gap-1 text-right"
                    />
                  </div>
                  <input
                    required
                    ref={bindRef('phone')}
                    value={form.phone}
                    onChange={(e) => set('phone', e.target.value)}
                    className="flex-1 min-w-0 bg-transparent px-3 text-sm text-gray-900 outline-none"
                    placeholder="5xxxxxxxx"
                    dir="ltr"
                    inputMode="tel"
                    {...errorAttrs('phone')}
                  />
                </div>
              </Field>
            </div>

            <GroupHeading icon={Route}>مسار الشحنة</GroupHeading>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2 text-xs font-extrabold text-indigo-600">
                  <PlaneTakeoff size={14} aria-hidden="true" />
                  من أين؟
                </div>
                <Field label="دولة الإرسال" name="origin_country" required error={fieldErrors.origin_country}>
                  <select
                    required
                    ref={bindRef('origin_country')}
                    value={form.origin_country}
                    onChange={(e) => set('origin_country', e.target.value)}
                    className={inputClass(!!fieldErrors.origin_country)}
                    {...errorAttrs('origin_country')}
                  >
                    {COUNTRY_OPTIONS.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </Field>
                <Field label="مدينة الإرسال" name="origin_city" error={fieldErrors.origin_city}>
                  <input
                    ref={bindRef('origin_city')}
                    value={form.origin_city}
                    onChange={(e) => set('origin_city', e.target.value)}
                    className={inputClass(!!fieldErrors.origin_city)}
                    placeholder="اختياري"
                    {...errorAttrs('origin_city')}
                  />
                </Field>
              </div>

              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2 text-xs font-extrabold text-emerald-600">
                  <PlaneLanding size={14} aria-hidden="true" />
                  إلى أين؟
                </div>
                <Field label="دولة الاستلام" name="destination_country" required error={fieldErrors.destination_country}>
                  <select
                    required
                    ref={bindRef('destination_country')}
                    value={form.destination_country}
                    onChange={(e) => set('destination_country', e.target.value)}
                    className={inputClass(!!fieldErrors.destination_country)}
                    {...errorAttrs('destination_country')}
                  >
                    {COUNTRY_OPTIONS.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </Field>
                <Field label="مدينة الاستلام" name="destination_city" error={fieldErrors.destination_city}>
                  <input
                    ref={bindRef('destination_city')}
                    value={form.destination_city}
                    onChange={(e) => set('destination_city', e.target.value)}
                    className={inputClass(!!fieldErrors.destination_city)}
                    placeholder="اختياري"
                    {...errorAttrs('destination_city')}
                  />
                </Field>
              </div>
            </div>

            <GroupHeading icon={Package}>تفاصيل الشحنة</GroupHeading>
            <Field label="محتويات الشحنة" name="contents" required error={fieldErrors.contents}>
              <textarea
                required
                ref={bindRef('contents')}
                rows={3}
                value={form.contents}
                onChange={(e) => set('contents', e.target.value)}
                className={textareaClass(!!fieldErrors.contents)}
                placeholder="مثال: ملابس، مستلزمات منزلية..."
                {...errorAttrs('contents')}
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="الوزن التقريبي" name="weight_approx" error={fieldErrors.weight_approx}>
                <input
                  type="number"
                  min={0}
                  step="0.1"
                  ref={bindRef('weight_approx')}
                  value={form.weight_approx}
                  onChange={(e) => set('weight_approx', e.target.value)}
                  className={inputClass(!!fieldErrors.weight_approx)}
                  placeholder="اختياري"
                  dir="ltr"
                  {...errorAttrs('weight_approx')}
                />
              </Field>
              <Field label="وحدة الوزن" name="weight_unit">
                <select
                  value={form.weight_unit}
                  onChange={(e) => set('weight_unit', e.target.value as 'kg' | 'lb')}
                  className={inputClass(false)}
                >
                  <option value="kg">كيلوجرام</option>
                  <option value="lb">رطل</option>
                </select>
              </Field>
            </div>

            <details className="group rounded-xl border border-gray-100">
              <summary className="cursor-pointer list-none flex items-center justify-between px-4 py-3 text-sm font-bold text-gray-700 select-none">
                {QUOTE_FORM.additionalDetailsLabel}
                <ChevronDown size={16} className="transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <div className="px-4 pb-4">
                <Field label="تفاصيل إضافية" name="extra_details" error={fieldErrors.extra_details}>
                  <textarea
                    ref={bindRef('extra_details')}
                    rows={2}
                    value={form.extra_details}
                    onChange={(e) => set('extra_details', e.target.value)}
                    className={textareaClass(!!fieldErrors.extra_details)}
                    placeholder="عدد الطرود، الأبعاد، أي ملاحظات إضافية..."
                    {...errorAttrs('extra_details')}
                  />
                </Field>
              </div>
            </details>

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
        </div>
      </div>
    </section>
  )
}

function inputClass(hasError: boolean) {
  return `w-full h-12 bg-gray-50 border rounded-xl px-4 text-sm text-gray-900 focus:outline-none focus:ring-2 transition-all ${
    hasError
      ? 'border-red-300 focus:ring-red-500/40 focus:border-red-400'
      : 'border-gray-200 focus:ring-indigo-500/40 focus:border-indigo-400'
  }`
}

function textareaClass(hasError: boolean) {
  return `w-full bg-gray-50 border rounded-xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 transition-all ${
    hasError
      ? 'border-red-300 focus:ring-red-500/40 focus:border-red-400'
      : 'border-gray-200 focus:ring-indigo-500/40 focus:border-indigo-400'
  }`
}

function GroupHeading({ icon: Icon, children }: { icon: typeof User; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-sm font-extrabold text-gray-800 pt-4 mt-1 border-t border-gray-100 first:pt-0 first:mt-0 first:border-t-0">
      <Icon size={16} className="text-indigo-500" aria-hidden="true" />
      {children}
    </div>
  )
}

function Field({
  label, required, error, name, children,
}: { label: string; required?: boolean; error?: string; name: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-bold text-gray-700">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      {children}
      {error && (
        <span id={`${name}-error`} className="flex items-center gap-1 text-xs font-bold text-red-600">
          <AlertCircle size={12} aria-hidden="true" />
          {error}
        </span>
      )}
    </label>
  )
}
