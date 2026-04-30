import { useState, useRef, useEffect, useCallback } from 'react'
import { User, Phone, Loader2, CheckCircle2 } from 'lucide-react'
import { api } from '../../utils/apiClient'

type ClientResult = {
  name: string
  phone: string
}

type Props = {
  nameValue: string
  phoneValue: string
  onSelect: (name: string, phone: string) => void
  onNameChange: (val: string) => void
  onPhoneChange: (val: string) => void
}

export function SearchableClientInput({ nameValue, phoneValue, onSelect, onNameChange, onPhoneChange }: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<ClientResult[]>([])
  const [hasSelected, setHasSelected] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Reset selected state if the user modifies the values after selection
  useEffect(() => {
    if (hasSelected) {
       // We don't reset here immediately to avoid loops, 
       // but we should reset on manual input.
    }
  }, [nameValue, phoneValue, hasSelected])

  const searchClients = useCallback(async (q: string) => {
    if (!q || q.length < 2) {
      setResults([])
      setOpen(false)
      return
    }
    setLoading(true)
    setOpen(true)
    try {
      const res = await api.get(`/clients/search?q=${encodeURIComponent(q)}`)
      // ApiClient already unwraps success/data, so res IS the array
      if (Array.isArray(res)) {
        setResults(res)
      } else if (res?.data && Array.isArray(res.data)) {
        // Fallback for safety if it's not unwrapped for some reason
        setResults(res.data)
      }
    } catch (e) {
      console.error('Failed to search clients:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleNameChange = (val: string) => {
    setHasSelected(false)
    onNameChange(val)
    const trimmed = val.trim()
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    searchTimeoutRef.current = setTimeout(() => searchClients(trimmed), 300)
  }

  const handlePhoneChange = (val: string) => {
    setHasSelected(false)
    onPhoneChange(val)
    const trimmed = val.trim()
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    searchTimeoutRef.current = setTimeout(() => searchClients(trimmed), 300)
  }

  const handleSelect = (name: string, phone: string) => {
    onSelect(name, phone)
    setHasSelected(true)
    setOpen(false)
    setResults([])
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative" ref={containerRef}>
      {/* Name Input */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-bold text-gray-500 dark:text-gray-400 flex justify-between">
          <span>اسم العميل</span>
          {hasSelected && <span className="text-green-600 dark:text-green-400 flex items-center gap-1"><CheckCircle2 size={12}/> تم الاختيار</span>}
        </label>
        <div className="relative">
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-gray-400">
            <User size={16} />
          </div>
          <input
            className={`w-full bg-gray-50 dark:bg-slate-900 border ${hasSelected ? 'border-green-500 ring-1 ring-green-500/20' : 'border-gray-200 dark:border-slate-700'} rounded-lg pr-10 pl-3 py-2.5 text-sm font-bold text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/50`}
            placeholder="ابحث عن العميل بالاسم..."
            value={nameValue}
            onChange={(e) => handleNameChange(e.target.value)}
            onFocus={() => { if (results.length > 0) setOpen(true) }}
          />
        </div>
      </div>

      {/* Phone Input */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-bold text-gray-500 dark:text-gray-400 flex justify-between">
          <span>رقم الجوال</span>
          {hasSelected && <span className="text-green-600 dark:text-green-400 flex items-center gap-1"><CheckCircle2 size={12}/> تم الاختيار</span>}
        </label>
        <div className="relative">
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-gray-400">
            <Phone size={16} />
          </div>
          <input
            className={`w-full bg-gray-50 dark:bg-slate-900 border ${hasSelected ? 'border-green-500 ring-1 ring-green-500/20' : 'border-gray-200 dark:border-slate-700'} rounded-lg pr-10 pl-3 py-2.5 text-sm font-bold text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/50 text-left font-mono`}
            placeholder="أو ابحث برقم الجوال..."
            dir="ltr"
            value={phoneValue}
            onChange={(e) => handlePhoneChange(e.target.value)}
            onFocus={() => { if (results.length > 0) setOpen(true) }}
          />
        </div>
      </div>

      {/* Dropdown Results */}
      {open && (
        <div className="absolute top-[calc(100%-8px)] mt-1 w-full z-[100] bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-2xl max-h-60 overflow-y-auto animate-in zoom-in-95 duration-150">
          {loading ? (
            <div className="flex items-center justify-center p-6 text-gray-500 dark:text-gray-400">
              <Loader2 size={24} className="animate-spin text-indigo-500" />
            </div>
          ) : results.length > 0 ? (
            <div className="p-1.5">
              <div className="text-[10px] font-black text-gray-400 dark:text-gray-500 px-3 py-1 uppercase tracking-wider">نتائج البحث من قاعدة البيانات</div>
              {results.map((r, idx) => (
                <button
                  key={idx}
                  type="button"
                  className="w-full text-right px-3 py-2.5 hover:bg-indigo-50 dark:hover:bg-slate-700/50 rounded-md transition-colors flex justify-between items-center group"
                  onClick={() => handleSelect(r.name, r.phone)}
                >
                  <div className="flex flex-col items-start">
                    <span className="text-sm font-bold text-gray-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{r.name}</span>
                    <span className="text-[10px] text-gray-400 dark:text-gray-500 font-bold">عميل مسجل مسبقاً</span>
                  </div>
                  <span className="text-xs font-mono font-bold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-slate-900 px-2 py-1 rounded" dir="ltr">{r.phone}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="p-6 text-center">
              <div className="text-indigo-500 dark:text-indigo-400 mb-2 flex justify-center"><User size={24} /></div>
              <div className="text-sm font-bold text-gray-900 dark:text-white mb-1">لا توجد نتائج مطابقة</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">يمكنك كتابة بيانات عميل جديد يدوياً</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
