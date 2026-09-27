import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Search, X, ChevronDown, AlertCircle } from 'lucide-react'
import { COUNTRIES } from '../../../utils/countries'

type Props = {
  id: string
  label: string
  value: string
  onChange: (iso: string) => void
  error?: string
}

function normalize(text: string) {
  return text.toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').trim()
}

/** Searchable country field (Arabic names, English names, or ISO code). Its
 *  panel is absolutely positioned with its own z-index and no clipping
 *  ancestor, so it floats over the rest of the journey card. */
export function CountryPicker({ id, label, value, onChange, error }: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const selected = COUNTRIES.find((c) => c.iso === value)

  const filtered = useMemo(() => {
    if (!search) return COUNTRIES
    const q = normalize(search)
    return COUNTRIES.filter(
      (c) => normalize(c.nameAr).includes(q) || normalize(c.nameEn).includes(q) || c.iso.toLowerCase() === q
    )
  }, [search])

  useEffect(() => {
    if (!open) return
    setSearch('')
    const t = setTimeout(() => searchRef.current?.focus(), 30)
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => {
      clearTimeout(t)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open])

  const close = () => {
    setOpen(false)
    triggerRef.current?.focus()
  }

  const choose = (iso: string) => {
    onChange(iso)
    close()
  }

  // Arrow keys move through the options; Enter in the search box picks the
  // first match; Escape closes and returns focus to the field.
  const onPanelKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
      return
    }
    const options = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('button[role="option"]') ?? [])
    const idx = options.indexOf(document.activeElement as HTMLButtonElement)
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      options[Math.min(idx + 1, options.length - 1)]?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (idx <= 0) searchRef.current?.focus()
      else options[idx - 1]?.focus()
    } else if (e.key === 'Enter' && document.activeElement === searchRef.current && filtered[0]) {
      e.preventDefault()
      choose(filtered[0].iso)
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <div
        className={`flex items-center rounded-xl border bg-white transition-colors ${
          error ? 'border-red-300' : open ? 'border-indigo-400 ring-2 ring-indigo-500/20' : 'border-gray-200 hover:border-gray-300'
        }`}
      >
        <button
          id={id}
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-describedby={error ? `${id}-error` : undefined}
          className="flex-1 min-w-0 text-right px-4 py-3"
        >
          <span className="block text-xs font-bold text-gray-500">{label}</span>
          <span className={`block mt-0.5 text-base font-bold truncate ${selected ? 'text-indigo-600' : 'text-gray-400 font-medium'}`}>
            {selected ? selected.nameAr : 'ابحث عن دولة'}
          </span>
        </button>
        {selected ? (
          <button
            type="button"
            onClick={() => onChange('')}
            className="p-3 text-gray-400 hover:text-gray-700 rounded-lg"
            aria-label={`مسح ${label}`}
          >
            <X size={18} aria-hidden="true" />
          </button>
        ) : (
          <ChevronDown size={18} className="mx-3 text-gray-400" aria-hidden="true" />
        )}
      </div>

      {open && (
        <div
          className="absolute z-40 top-full mt-2 inset-x-0 bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden shp-pop-in"
          onKeyDown={onPanelKeyDown}
        >
          <div className="p-2 border-b border-gray-100 flex items-center gap-2 text-gray-400">
            <Search size={16} className="shrink-0" aria-hidden="true" />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث بالاسم العربي أو الإنجليزي"
              aria-label={`بحث: ${label}`}
              className="w-full bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400 py-1.5"
            />
          </div>
          <div ref={listRef} role="listbox" aria-label={label} className="max-h-64 overflow-y-auto p-1">
            {filtered.length > 0 ? (
              filtered.map((c) => (
                <button
                  key={c.iso}
                  type="button"
                  role="option"
                  aria-selected={c.iso === value}
                  onClick={() => choose(c.iso)}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-sm text-right transition-colors focus:outline-none focus:bg-indigo-50 ${
                    c.iso === value ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <span>{c.nameAr}</span>
                  <span className="text-xs text-gray-400" dir="ltr">{c.nameEn}</span>
                </button>
              ))
            ) : (
              <div className="p-3 text-center text-sm text-gray-400">لا توجد نتائج — يمكنك اختيار «تواصلوا معي» بالأسفل</div>
            )}
          </div>
        </div>
      )}
      {error && (
        <span id={`${id}-error`} className="mt-1.5 flex items-center gap-1 text-xs font-bold text-red-600">
          <AlertCircle size={12} aria-hidden="true" />
          {error}
        </span>
      )}
    </div>
  )
}
