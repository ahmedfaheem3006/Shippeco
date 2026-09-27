import type { ReactNode } from 'react'
import { AlertCircle } from 'lucide-react'
import { toWesternDigits } from '../../../utils/countries'

export function FieldError({ id, error }: { id: string; error?: string }) {
  if (!error) return null
  return (
    <span id={`${id}-error`} className="flex items-center gap-1 text-xs font-bold text-red-600">
      <AlertCircle size={12} aria-hidden="true" />
      {error}
    </span>
  )
}

function FieldLabel({ htmlFor, label, required }: { htmlFor: string; label: string; required?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="font-bold text-gray-700">
      {label} {required && <span className="text-red-500">*</span>}
    </label>
  )
}

const baseInput = 'w-full h-12 bg-gray-50 border rounded-xl px-4 text-sm text-gray-900 focus:outline-none focus:ring-2 transition-all'
const okBorder = 'border-gray-200 focus:ring-indigo-500/40 focus:border-indigo-400'
const errBorder = 'border-red-300 focus:ring-red-500/40 focus:border-red-400'

export function TextField({
  id, label, value, onChange, error, required, placeholder, autoComplete, dir, multiline,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  error?: string
  required?: boolean
  placeholder?: string
  autoComplete?: string
  dir?: 'ltr' | 'rtl'
  multiline?: boolean
}) {
  const common = {
    id,
    value,
    placeholder,
    autoComplete,
    dir,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? `${id}-error` : undefined,
  }
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <FieldLabel htmlFor={id} label={label} required={required} />
      {multiline ? (
        <textarea
          {...common}
          rows={3}
          onChange={(e) => onChange(e.target.value)}
          className={`${baseInput.replace('h-12', '')} py-3 ${error ? errBorder : okBorder}`}
        />
      ) : (
        <input {...common} type="text" onChange={(e) => onChange(e.target.value)} className={`${baseInput} ${error ? errBorder : okBorder}`} />
      )}
      <FieldError id={id} error={error} />
    </div>
  )
}

/** Decimal input with a fixed unit shown inside the field (e.g. "كجم"),
 *  LTR digits, Arabic-Indic digits converted as they're typed. */
export function NumberUnitField({
  id, label, unit, value, onChange, error, required,
}: {
  id: string
  label: string
  unit: string
  value: string
  onChange: (v: string) => void
  error?: string
  required?: boolean
}) {
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <FieldLabel htmlFor={id} label={label} required={required} />
      <div
        dir="ltr"
        className={`flex items-stretch h-12 rounded-xl border bg-gray-50 focus-within:ring-2 transition-all ${
          error ? 'border-red-300 focus-within:ring-red-500/40' : 'border-gray-200 focus-within:ring-indigo-500/40 focus-within:border-indigo-400'
        }`}
      >
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(toWesternDigits(e.target.value).replace(/[^\d.,٫]/g, ''))}
          className="flex-1 min-w-0 bg-transparent px-4 text-sm text-gray-900 outline-none rounded-s-xl"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        <span className="shrink-0 flex items-center px-3 rounded-e-xl border-s border-gray-200 bg-gray-100 text-xs font-bold text-gray-600" dir="rtl">
          {unit}
        </span>
      </div>
      <FieldError id={id} error={error} />
    </div>
  )
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="text-lg font-extrabold text-gray-900">{children}</h3>
}

/** Visually hidden honeypot input — real visitors never see or fill it. */
export function Honeypot({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)' }} aria-hidden="true">
      <label htmlFor="website">اتركه فارغًا</label>
      <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}
