import { useState, useRef, useEffect, useMemo } from 'react'
import { ChevronDown, Search } from 'lucide-react'

export type Option = {
  value: string
  label: string
}

type Props = {
  options: Option[]
  value: string
  onChange: (val: string) => void
  disabled?: boolean
  placeholder?: string
  className?: string
}

export function SearchableSelect({ options, value, onChange, disabled, placeholder = 'ابحث...', className }: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selectedOption = useMemo(() => options.find((o) => o.value === value), [options, value])

  const filteredOptions = useMemo(() => {
    if (!search) return options
    const lower = search.toLowerCase()
    return options.filter(o => o.label.toLowerCase().includes(lower) || o.value.toLowerCase().includes(lower))
  }, [options, search])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (open) {
      setSearch('')
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  return (
    <div className="relative w-full" ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(!open)}
        className={className || "w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/50 disabled:opacity-50 flex items-center justify-between text-right"}
      >
        <span className="truncate">{selectedOption ? selectedOption.label : placeholder}</span>
        <ChevronDown size={16} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-xl max-h-60 flex flex-col overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="p-2 border-b border-gray-200 dark:border-slate-700 flex items-center gap-2 text-gray-500 dark:text-gray-400">
            <Search size={14} className="shrink-0" />
            <input
              ref={inputRef}
              type="text"
              className="w-full bg-transparent border-none text-sm text-gray-900 dark:text-white placeholder:text-gray-400 outline-none"
              placeholder={placeholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="overflow-y-auto p-1 flex-1">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`w-full text-right px-3 py-2 text-sm rounded-md transition-colors ${opt.value === value ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-bold' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700'}`}
                  onClick={() => {
                    onChange(opt.value)
                    setOpen(false)
                  }}
                >
                  {opt.label}
                </button>
              ))
            ) : (
              <div className="p-3 text-center text-sm text-gray-500 dark:text-gray-400">
                لا توجد نتائج
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
