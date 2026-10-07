import { Bot, Loader2, MessageSquare, Search, User, UserCheck } from 'lucide-react'
import type { ConversationRow } from '../../services/supportService'
import { CONVERSATION_FILTERS, CONVERSATION_STATUS, PRIORITY, ago } from '../../utils/support'

type Props = {
  rows: ConversationRow[]
  total: number
  loading: boolean
  filter: string
  search: string
  selectedId: number | null
  hasMore: boolean
  onFilter: (f: string) => void
  onSearch: (s: string) => void
  onSelect: (id: number) => void
  onMore: () => void
}

export function ConversationList(p: Props) {
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="p-3 space-y-2 border-b border-gray-100 dark:border-slate-700/60">
        <div className="relative">
          <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            value={p.search}
            onChange={(e) => p.onSearch(e.target.value)}
            placeholder="بحث: الاسم، الهاتف، الفاتورة، التذكرة، AWB"
            aria-label="بحث في المحادثات"
            className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl py-2 pr-9 pl-3 text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
          />
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1 hidden-scrollbar" role="tablist" aria-label="تصفية المحادثات">
          {CONVERSATION_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={p.filter === f.key}
              onClick={() => p.onFilter(f.key)}
              className={`shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors ${
                p.filter === f.key ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-slate-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-slate-700'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="text-[10px] font-bold text-gray-400">{p.total.toLocaleString('en-US')} محادثة</div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {p.loading && !p.rows.length ? (
          <div className="p-3 space-y-2" aria-busy="true">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-16 rounded-xl bg-gray-100 dark:bg-slate-800 animate-pulse" />)}
          </div>
        ) : !p.rows.length ? (
          <div className="p-8 text-center text-gray-400">
            <MessageSquare size={30} className="mx-auto mb-2 opacity-50" />
            <p className="text-xs font-bold">لا توجد محادثات مطابقة</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-slate-700/50">
            {p.rows.map((c) => {
              const st = CONVERSATION_STATUS[c.status]
              const active = c.id === p.selectedId
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => p.onSelect(c.id)}
                    className={`w-full text-right px-3 py-2.5 flex gap-2.5 transition-colors ${active ? 'bg-indigo-50 dark:bg-indigo-950/40' : 'hover:bg-gray-50 dark:hover:bg-slate-800/60'}`}
                  >
                    <div className={`mt-0.5 w-9 h-9 shrink-0 rounded-full flex items-center justify-center ${c.status === 'HUMAN_ACTIVE' ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40' : c.status === 'WAITING_FOR_AGENT' ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/40' : 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40'}`}>
                      {c.status === 'HUMAN_ACTIVE' ? <UserCheck size={16} /> : c.status === 'WAITING_FOR_AGENT' ? <User size={16} /> : <Bot size={16} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={`truncate text-sm ${c.unread_count ? 'font-black text-gray-900 dark:text-white' : 'font-bold text-gray-700 dark:text-gray-200'}`}>
                          {c.client_name || c.profile_name || c.phone_e164}
                        </span>
                        <span className="mr-auto text-[10px] text-gray-400 shrink-0">{ago(c.last_message_at)}</span>
                      </div>
                      <div className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                        {c.last_message_sender === 'ai' ? '🤖 ' : c.last_message_sender === 'agent' ? '👤 ' : ''}{c.last_message_preview || '—'}
                      </div>
                      <div className="flex flex-wrap items-center gap-1 mt-1">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${st.cls}`}>{st.label}</span>
                        {c.open_ticket_number && c.open_ticket_priority && (
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${PRIORITY[c.open_ticket_priority].cls}`}>{c.open_ticket_number} · {PRIORITY[c.open_ticket_priority].label}</span>
                        )}
                        {c.assigned_name && <span className="text-[9px] font-bold text-emerald-600">{c.assigned_name}</span>}
                        {c.unread_count > 0 && <span className="mr-auto min-w-[18px] h-[18px] px-1 rounded-full bg-indigo-600 text-white text-[10px] font-black flex items-center justify-center">{c.unread_count}</span>}
                      </div>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        {p.hasMore && (
          <button type="button" onClick={p.onMore} disabled={p.loading} className="w-full py-3 text-xs font-bold text-indigo-600 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-50">
            {p.loading ? <Loader2 size={14} className="inline animate-spin" /> : 'عرض المزيد'}
          </button>
        )}
      </div>
    </div>
  )
}
