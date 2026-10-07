import { useCallback, useEffect, useState } from 'react'
import { Loader2, Search, Ticket } from 'lucide-react'
import { supportService, type TicketRow } from '../../services/supportService'
import { CATEGORY, PRIORITY, TICKET_STATUS, ago, errorText } from '../../utils/support'

type Props = { onOpen: (id: number) => void; refreshKey: number }

export function TicketsTab({ onOpen, refreshKey }: Props) {
  const [page, setPage] = useState(1)
  const [f, setF] = useState({ status: 'open', priority: '', category: '', assigned: '', search: '' })
  const [search, setSearch] = useState('')
  const [res, setRes] = useState<{ key: string; rows: TicketRow[]; total: number; pages: number; err?: string } | null>(null)

  useEffect(() => { const t = setTimeout(() => setF((x) => ({ ...x, search })), 350); return () => clearTimeout(t) }, [search])

  const key = JSON.stringify({ f, page, refreshKey })
  const load = useCallback(() => {
    let live = true
    supportService.tickets({ ...f, page, limit: 25 })
      .then((r) => { if (live) setRes({ key, rows: r.tickets, total: r.pagination.total, pages: r.pagination.pages }) })
      .catch((e: unknown) => { if (live) setRes((prev) => ({ key, rows: prev?.rows ?? [], total: prev?.total ?? 0, pages: prev?.pages ?? 1, err: errorText(e) })) })
    return () => { live = false }
  }, [f, page, key])
  useEffect(() => load(), [load])
  const rows = res?.rows ?? []
  const total = res?.total ?? 0
  const pages = res?.pages ?? 1
  const loading = res?.key !== key

  const sel = 'bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-xs font-bold'
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLSelectElement>) => { setPage(1); setF((x) => ({ ...x, [k]: e.target.value })) }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={(e) => { setPage(1); setSearch(e.target.value) }} placeholder="رقم التذكرة، العميل، الفاتورة، AWB، الهاتف" aria-label="بحث في التذاكر"
            className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl py-2 pr-9 pl-3 text-xs" />
        </div>
        <select className={sel} value={f.status} onChange={set('status')} aria-label="الحالة">
          <option value="open">المفتوحة</option><option value="">كل الحالات</option>
          {Object.entries(TICKET_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className={sel} value={f.priority} onChange={set('priority')} aria-label="الأولوية">
          <option value="">كل الأولويات</option>{Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select className={sel} value={f.category} onChange={set('category')} aria-label="التصنيف">
          <option value="">كل التصنيفات</option>{Object.entries(CATEGORY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className={sel} value={f.assigned} onChange={set('assigned')} aria-label="المسؤول">
          <option value="">الكل</option><option value="me">المسندة لي</option><option value="none">غير مسندة</option>
        </select>
        <span className="text-[11px] font-bold text-gray-400">{total} تذكرة</span>
        {res?.err && <span className="text-[11px] font-bold text-red-500">{res.err}</span>}
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 overflow-hidden">
        {loading && !rows.length ? <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-indigo-500" /></div>
          : !rows.length ? <div className="p-10 text-center text-gray-400"><Ticket className="mx-auto mb-2 opacity-40" /><p className="text-xs font-bold">لا توجد تذاكر</p></div>
          : (
            <ul className="divide-y divide-gray-100 dark:divide-slate-700/60">
              {rows.map((t) => (
                <li key={t.id}>
                  <button type="button" onClick={() => onOpen(t.id)} className="w-full text-right p-3 hover:bg-gray-50 dark:hover:bg-slate-700/30 grid grid-cols-1 sm:grid-cols-[110px_1fr_auto] gap-1 sm:gap-3 items-center">
                    <span className="font-black text-sm" dir="ltr">{t.ticket_number}</span>
                    <span className="min-w-0">
                      <span className="block font-bold text-sm text-gray-900 dark:text-white truncate">{t.subject}</span>
                      <span className="block text-[11px] text-gray-500 truncate">{CATEGORY[t.category] ?? t.category} · {t.client_name ?? t.phone_e164 ?? '—'}{t.invoice_number ? ` · ${t.invoice_number}` : ''}</span>
                    </span>
                    <span className="flex items-center gap-1.5 text-[10px]">
                      <span className={`px-1.5 py-0.5 rounded font-bold ${PRIORITY[t.priority].cls}`}>{PRIORITY[t.priority].label}</span>
                      <span className="font-bold text-gray-500">{TICKET_STATUS[t.status]}</span>
                      <span className="text-gray-400">{t.assigned_name ?? 'غير مسندة'}</span>
                      <span className="text-gray-400">{ago(t.updated_at)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-center gap-2 text-xs font-bold">
          <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-3 py-1.5 rounded-lg border disabled:opacity-40">السابق</button>
          <span>{page} / {pages}</span>
          <button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)} className="px-3 py-1.5 rounded-lg border disabled:opacity-40">التالي</button>
        </div>
      )}
    </div>
  )
}
