import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Search, AlertCircle } from 'lucide-react'
import type { CountryCode } from 'libphonenumber-js'
import { COUNTRIES, nationalPlaceholder, parseNationalInput, toWesternDigits, type ParsedPhoneResult } from '../../utils/phone'

type Props = {
  id: string
  label: string
  required?: boolean
  error?: string
  country: CountryCode
  onCountryChange: (country: CountryCode) => void
  rawValue: string
  onRawChange: (raw: string, result: ParsedPhoneResult) => void
  inputRef?: (el: HTMLInputElement | null) => void
}

function normalize(text: string) {
  return text.toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').trim()
}

/** The real fix for the phone field (previously: the country-search
 *  dropdown got clipped by the composed field's own rounded/overflow-hidden
 *  wrapper, so it rendered squashed inside the field instead of floating
 *  above the page). This component has NO overflow-hidden ancestor — the
 *  "single field" look instead comes from rounding only the code button's
 *  start corners and the number input's end corners (rounded-s-xl /
 *  rounded-e-xl), so the dropdown panel is free to render at a normal
 *  absolute position with its own z-index, and is never cut off. */
export function PhoneField({ id, label, required, error, country, onCountryChange, rawValue, onRawChange, inputRef }: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [openUpward, setOpenUpward] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const selected = COUNTRIES.find((c) => c.iso === country) ?? COUNTRIES[0]

  const filtered = useMemo(() => {
    if (!search) return COUNTRIES
    const q = normalize(search)
    return COUNTRIES.filter(
      (c) => normalize(c.nameAr).includes(q) || normalize(c.nameEn).includes(q) || c.dialCode.includes(q)
    )
  }, [search])

  useEffect(() => {
    if (!open) return
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    document.addEventListener('keydown', onEscape)
    return () => {
      document.removeEventListener('mousedown', onClickOutside)
      document.removeEventListener('keydown', onEscape)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    setSearch('')
    const rect = containerRef.current?.getBoundingClientRect()
    setOpenUpward(!!rect && window.innerHeight - rect.bottom < 320)
    const t = setTimeout(() => searchInputRef.current?.focus(), 30)
    return () => clearTimeout(t)
  }, [open])

  const handleRawChange = (value: string) => {
    const cleaned = toWesternDigits(value)
    const result = parseNationalInput(cleaned, country)
    // A pasted/typed full international number ("+20…" / "00966…") is
    // normalized: the selected country follows the number, and only the
    // national part stays in the field — the dial code is never shown twice.
    const international = /^(\+|00)/.test(cleaned.trim())
    if (international && result.country && result.national) {
      if (result.country !== country) onCountryChange(result.country)
      onRawChange(result.national, result)
      return
    }
    onRawChange(cleaned, result)
  }

  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <span className="font-bold text-gray-700">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      <div className="relative" ref={containerRef}>
        <div
          dir="ltr"
          className={`flex items-stretch h-12 rounded-xl border bg-gray-50 focus-within:ring-2 transition-all ${
            error
              ? 'border-red-300 focus-within:ring-red-500/40 focus-within:border-red-400'
              : 'border-gray-200 focus-within:ring-indigo-500/40 focus-within:border-indigo-400'
          }`}
        >
          <button
            type="button"
            ref={triggerRef}
            onClick={() => setOpen((v) => !v)}
            aria-haspopup="listbox"
            aria-expanded={open}
            className="shrink-0 flex items-center gap-1 px-3 rounded-s-xl border-e border-gray-200 text-sm font-bold text-gray-800 hover:bg-gray-100 transition-colors"
          >
            <span>{selected.dialCode}</span>
            <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
          <input
            id={id}
            ref={inputRef}
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            dir="ltr"
            value={rawValue}
            onChange={(e) => handleRawChange(e.target.value)}
            className="flex-1 min-w-0 bg-transparent px-3 text-sm text-gray-900 outline-none rounded-e-xl"
            placeholder={nationalPlaceholder(country)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
          />
        </div>

        {open && (
          <div
            role="listbox"
            dir="rtl"
            className={`absolute z-50 w-72 max-w-[90vw] bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden flex flex-col ${
              openUpward ? 'bottom-full mb-2' : 'top-full mt-2'
            } left-0`}
          >
            <div className="p-2 border-b border-gray-100 flex items-center gap-2 text-gray-400">
              <Search size={14} className="shrink-0" aria-hidden="true" />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ابحث بالاسم أو المفتاح..."
                className="w-full bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400"
              />
            </div>
            <div className="max-h-64 overflow-y-auto p-1">
              {filtered.length > 0 ? (
                filtered.map((c) => (
                  <button
                    key={c.iso}
                    type="button"
                    role="option"
                    aria-selected={c.iso === country}
                    onClick={() => {
                      onCountryChange(c.iso)
                      setOpen(false)
                      triggerRef.current?.focus()
                    }}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm text-right transition-colors ${
                      c.iso === country ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <span>{c.nameAr}</span>
                    <span className="text-gray-400" dir="ltr">{c.dialCode}</span>
                  </button>
                ))
              ) : (
                <div className="p-3 text-center text-sm text-gray-400">لا توجد نتائج</div>
              )}
            </div>
          </div>
        )}
      </div>
      {error && (
        <span id={`${id}-error`} className="flex items-center gap-1 text-xs font-bold text-red-600">
          <AlertCircle size={12} aria-hidden="true" />
          {error}
        </span>
      )}
    </div>
  )
}
