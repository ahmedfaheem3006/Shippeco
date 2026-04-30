import React, { useState, useRef, useEffect, useCallback } from 'react'
import { User, Phone, Search, Loader2 } from 'lucide-react'
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
  const containerRef = useRef<HTMLDivElement>(null)
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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
      if (res.data?.success) {
        setResults(res.data.data || [])
      }
    } catch (e) {
      console.error('Failed to search clients:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleNameChange = (val: string) => {
    onNameChange(val)
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    searchTimeoutRef.current = setTimeout(() => searchClients(val), 300)
  }

  const handlePhoneChange = (val: string) => {
    onPhoneChange(val)
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    searchTimeoutRef.current = setTimeout(() => searchClients(val), 300)
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative" ref={containerRef}>
      {/* Name Input */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-bold text-gray-500 dark:text-gray-400">اسم العميل</label>
        <div className="relative">
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-gray-400">
            <User size={16} />
          </div>
          <input
            className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg pr-10 pl-3 py-2.5 text-sm font-bold text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/50"
            placeholder="اسم العميل..."
            value={nameValue}
            onChange={(e) => handleNameChange(e.target.value)}
            onFocus={() => { if (results.length > 0) setOpen(true) }}
          />
        </div>
      </div>

      {/* Phone Input */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-bold text-gray-500 dark:text-gray-400">رقم الجوال</label>
        <div className="relative">
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-gray-400">
            <Phone size={16} />
          </div>
          <input
            className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg pr-10 pl-3 py-2.5 text-sm font-bold text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/50 text-left font-mono"
            placeholder="05..."
            dir="ltr"
            value={phoneValue}
            onChange={(e) => handlePhoneChange(e.target.value)}
            onFocus={() => { if (results.length > 0) setOpen(true) }}
          />
        </div>
      </div>

      {/* Dropdown Results */}
      {open && (
        <div className="absolute top-full mt-1 w-full z-50 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-xl max-h-60 overflow-y-auto animate-in fade-in duration-150">
          {loading ? (
            <div className="flex items-center justify-center p-4 text-gray-500 dark:text-gray-400">
              <Loader2 size={18} className="animate-spin" />
            </div>
          ) : results.length > 0 ? (
            <div className="p-1">
              {results.map((r, idx) => (
                <button
                  key={idx}
                  type="button"
                  className="w-full text-right px-3 py-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-md transition-colors flex justify-between items-center"
                  onClick={() => {
                    onSelect(r.name, r.phone)
                    setOpen(false)
                  }}
                >
                  <span className="text-sm font-bold text-gray-900 dark:text-white">{r.name}</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 font-mono" dir="ltr">{r.phone}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="p-3 text-center text-sm text-gray-500 dark:text-gray-400">
              لا توجد نتائج (يمكنك المتابعة لإنشاء عميل جديد)
            </div>
          )}
        </div>
      )}
    </div>
  )
}
