import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { BarChart3, Headphones, Inbox, Loader2, Settings2, Ticket, X } from 'lucide-react'
import { useAppLayout } from '../components/AppLayout/useAppLayout'
import { useAuthStore } from '../hooks/useAuthStore'
import { useRealtimeRefresh } from '../hooks/useRealtimeRefresh'
import { ConversationList } from '../components/Support/ConversationList'
import { ChatPanel } from '../components/Support/ChatPanel'
import { CustomerPanel } from '../components/Support/CustomerPanel'
import { TicketsTab } from '../components/Support/TicketsTab'
import { TicketDrawer } from '../components/Support/TicketDrawer'
import { AnalyticsTab } from '../components/Support/AnalyticsTab'
import { SupportAdminTab } from '../components/Support/SupportAdminTab'
import { Dialog } from '../components/shared/Dialog'
import {
  SUPPORT_EVENTS, newClientRef, supportService, type ConversationPanel, type ConversationRow, type SupportMessage, type TicketPriority,
} from '../services/supportService'
import { CATEGORY, PRIORITY, canSupport, errorText } from '../utils/support'

type Tab = 'inbox' | 'tickets' | 'analytics' | 'admin'

function NewTicketDialog({ conversationId, onClose, onCreated }: { conversationId: number | null; onClose: () => void; onCreated: (id: number) => void }) {
  const headingId = useId()
  const [subject, setSubject] = useState('')
  const [category, setCategory] = useState('OTHER')
  const [priority, setPriority] = useState<TicketPriority | ''>('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const ref = useRef(newClientRef())
  const submit = async () => {
    if (!conversationId || busy || subject.trim().length < 3) return
    setBusy(true)
    try {
      const t = await supportService.createTicket({ conversation_id: conversationId, category, subject: subject.trim(), description: description.trim() || undefined, priority: priority || undefined, client_ref: ref.current })
      toast.success(`أُنشئت التذكرة ${t.ticket_number}`)
      onCreated(t.id)
    } catch (e: unknown) { toast.error(errorText(e)) } finally { setBusy(false) }
  }
  const input = 'w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm'
  return (
    <Dialog open={conversationId !== null} onRequestClose={onClose} labelledBy={headingId} panelClassName="sm:max-w-lg">
      <div className="p-4 border-b border-gray-100 dark:border-slate-700 flex items-center"><h2 id={headingId} className="font-black flex-1">تذكرة جديدة</h2><button type="button" onClick={onClose} aria-label="إغلاق"><X size={18} /></button></div>
      <div className="p-4 space-y-3">
        <input className={input} placeholder="عنوان المشكلة" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={300} />
        <div className="grid grid-cols-2 gap-2">
          <select className={input} value={category} onChange={(e) => setCategory(e.target.value)} aria-label="التصنيف">{Object.entries(CATEGORY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <select className={input} value={priority} onChange={(e) => setPriority(e.target.value as TicketPriority)} aria-label="الأولوية"><option value="">الأولوية حسب القواعد</option>{Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        </div>
        <textarea className={input} rows={4} placeholder="التفاصيل" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={4000} />
      </div>
      <div className="p-4 border-t border-gray-100 dark:border-slate-700 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border text-sm font-bold">إلغاء</button>
        <button type="button" onClick={submit} disabled={busy || subject.trim().length < 3} className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold disabled:opacity-50">{busy ? <Loader2 size={15} className="animate-spin" /> : 'إنشاء'}</button>
      </div>
    </Dialog>
  )
}

export function SupportCenterPage() {
  useAppLayout()
  const user = useAuthStore((s) => s.user)
  const role = user?.role
  const me = {
    id: Number(user?.id),
    canReply: canSupport(role, 'support.reply'),
    canAssign: canSupport(role, 'support.assign'),
    canResolve: canSupport(role, 'support.resolve'),
    canManage: canSupport(role, 'support.manage'),
    canMoney: canSupport(role, 'support.view_financial'),
    canKb: canSupport(role, 'support.manage_knowledge_base'),
  }
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) || 'inbox'
  const selectedId = params.get('conversation') ? Number(params.get('conversation')) : null
  const ticketParam = params.get('ticket') ? Number(params.get('ticket')) : null
  const setParam = useCallback((patch: Record<string, string | null>) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      for (const [k, v] of Object.entries(patch)) { if (v === null) next.delete(k); else next.set(k, v) }
      return next
    }, { replace: true })
  }, [setParams])

  const [filter, setFilter] = useState('all')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  // Results remember the request they answer; "loading" = no result yet for the current request.
  const [list, setList] = useState<{ key: string; rows: ConversationRow[]; total: number } | null>(null)
  const [page, setPage] = useState(1)
  const [conv, setConv] = useState<{ id: number; panel: ConversationPanel; messages: SupportMessage[]; hasOlder: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [showPanel, setShowPanel] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [agents, setAgents] = useState<Array<{ id: number; full_name: string }>>([])
  const [sandbox, setSandbox] = useState(false)
  const [newTicketFor, setNewTicketFor] = useState<number | null>(null)

  useEffect(() => { const t = setTimeout(() => { setSearch(searchInput); setPage(1) }, 350); return () => clearTimeout(t) }, [searchInput])
  useEffect(() => {
    supportService.agents().then(setAgents).catch(() => {})
    supportService.me().then((m) => setSandbox(m.sandbox)).catch(() => {})
  }, [])

  const listKey = JSON.stringify({ filter, search, page })
  const loadList = useCallback((quiet = false) =>
    supportService.conversations({ filter, search, page: 1, limit: 30 * page })
      .then((r) => setList({ key: listKey, rows: r.conversations, total: r.pagination.total }))
      .catch((e: unknown) => {
        if (!quiet) toast.error(errorText(e))
        setList((prev) => ({ key: listKey, rows: prev?.rows ?? [], total: prev?.total ?? 0 }))
      }), [filter, search, page, listKey])
  useEffect(() => { if (tab === 'inbox') void loadList() }, [loadList, tab])
  const rows = list?.rows ?? []
  const total = list?.total ?? 0
  const pages = Math.ceil(total / 30) || 1
  const listLoading = list?.key !== listKey

  const loadConversation = useCallback((id: number) =>
    Promise.all([supportService.conversation(id), supportService.messages(id)])
      .then(([panel, messages]) => {
        setConv({ id, panel, messages, hasOlder: messages.length >= 60 })
        void supportService.markRead(id).then(() => setList((l) => (l ? { ...l, rows: l.rows.map((r) => (r.id === id ? { ...r, unread_count: 0 } : r)) } : l)))
      })
      .catch((e: unknown) => {
        toast.error(errorText(e, 'تعذر فتح المحادثة'))
        setParam({ conversation: null })
      }), [setParam])
  useEffect(() => { if (selectedId) void loadConversation(selectedId) }, [selectedId, loadConversation])
  const current = conv && conv.id === selectedId ? conv : null
  const panel = current?.panel ?? null
  const messages = current?.messages ?? []
  const hasOlder = current?.hasOlder ?? false
  const convLoading = selectedId !== null && !current

  useRealtimeRefresh(SUPPORT_EVENTS, (batch) => {
    void loadList(true)
    const touches = batch.some((b) => b.event === 'resync' || Number((b.payload as { conversation_id?: unknown } | undefined)?.conversation_id) === selectedId)
    if (selectedId && touches) void loadConversation(selectedId)
    if (batch.some((b) => b.event === 'support:ticket' || b.event === 'resync')) setRefreshKey((k) => k + 1)
  }, 300)

  const act = async (fn: () => Promise<unknown>, ok?: string) => {
    if (busy || !selectedId) return
    setBusy(true)
    try { await fn(); if (ok) toast.success(ok); await loadConversation(selectedId); void loadList(true) }
    catch (e: unknown) { toast.error(errorText(e, 'تعذر تنفيذ العملية')); if (selectedId) void loadConversation(selectedId) }
    finally { setBusy(false) }
  }

  const tabs: Array<{ key: Tab; label: string; icon: React.ReactNode; show: boolean }> = [
    { key: 'inbox', label: 'المحادثات', icon: <Inbox size={15} />, show: true },
    { key: 'tickets', label: 'التذاكر', icon: <Ticket size={15} />, show: true },
    { key: 'analytics', label: 'الإحصائيات', icon: <BarChart3 size={15} />, show: true },
    { key: 'admin', label: 'الإعدادات والمعرفة', icon: <Settings2 size={15} />, show: true },
  ]

  return (
    <div className="space-y-3 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <h1 className="text-xl font-black text-gray-900 dark:text-white flex items-center gap-2"><Headphones className="text-indigo-600" size={24} /> مركز خدمة العملاء</h1>
        <div className="flex gap-1.5 md:mr-auto overflow-x-auto" role="tablist">
          {tabs.filter((t) => t.show).map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setParam({ tab: t.key === 'inbox' ? null : t.key })}
              className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border ${tab === t.key ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-600 dark:text-gray-300'}`}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'inbox' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm overflow-hidden h-[calc(100dvh-170px)] min-h-[480px] flex">
          <aside className={`${selectedId ? 'hidden lg:flex' : 'flex'} w-full lg:w-80 shrink-0 flex-col border-l border-gray-100 dark:border-slate-700/60`}>
            <ConversationList rows={rows} total={total} loading={listLoading} filter={filter} search={searchInput} selectedId={selectedId}
              hasMore={page < pages} onMore={() => setPage((p) => p + 1)}
              onFilter={(f) => { setFilter(f); setPage(1) }} onSearch={setSearchInput} onSelect={(id) => setParam({ conversation: String(id) })} />
          </aside>
          <main className={`${selectedId ? 'flex' : 'hidden lg:flex'} flex-1 min-w-0 flex-col`}>
            <ChatPanel panel={panel} messages={messages} loading={convLoading} busy={busy}
              me={{ id: me.id, canReply: me.canReply, canAssign: me.canAssign, canResolve: me.canResolve, canManage: me.canManage }}
              hasOlder={hasOlder}
              onOlder={async () => {
                if (!current || !messages.length) return
                const older = await supportService.messages(current.id, messages[0].id)
                setConv((c) => (c && c.id === current.id ? { ...c, messages: [...older, ...c.messages], hasOlder: older.length >= 60 } : c))
              }}
              onBack={() => setParam({ conversation: null })}
              onTogglePanel={() => setShowPanel((v) => !v)}
              onTakeover={(force) => act(() => supportService.takeover(selectedId!, force), 'استلمت المحادثة — المساعد الآلي متوقف')}
              onReturnToAi={() => { if (window.confirm('إعادة المحادثة للمساعد الآلي؟ سيعود للرد تلقائيًا على العميل.')) void act(() => supportService.returnToAi(selectedId!), 'أُعيدت المحادثة للمساعد') }}
              onResolve={(s) => act(() => supportService.setStatus(selectedId!, s), 'تم إنهاء المحادثة')}
              onSend={async (text) => {
                try { await supportService.reply(selectedId!, text, newClientRef()); await loadConversation(selectedId!); return true }
                catch (e: unknown) { toast.error(errorText(e, 'تعذر الإرسال')); return false }
              }}
              onTemplate={() => {
                const name = panel?.customer?.name || panel?.conversation.profile_name || 'عميلنا'
                if (window.confirm(`إرسال قالب المتابعة المعتمد إلى ${name}؟`)) void act(() => supportService.template(selectedId!, 'followup', [name], newClientRef()), 'أُرسل القالب')
              }}
            />
          </main>
          {panel && (
            <aside className={`${showPanel ? 'fixed inset-0 z-40 bg-white dark:bg-slate-900 pt-14' : 'hidden'} xl:static xl:block xl:pt-0 xl:z-auto w-full xl:w-80 shrink-0 border-r border-gray-100 dark:border-slate-700/60`}>
              {showPanel && <button type="button" onClick={() => setShowPanel(false)} className="xl:hidden absolute top-3 left-3 p-2 rounded-lg bg-gray-100 dark:bg-slate-800" aria-label="إغلاق"><X size={18} /></button>}
              <CustomerPanel panel={panel} canAssign={me.canAssign} canReply={me.canReply} canSeeMoney={me.canMoney}
                onLink={(id) => act(() => supportService.linkCustomer(selectedId!, id), id ? 'تم ربط العميل' : 'تم فك الربط')}
                onOpenTicket={(id) => setParam({ ticket: String(id) })}
                onNewTicket={() => setNewTicketFor(selectedId)} />
            </aside>
          )}
        </div>
      )}

      {tab === 'tickets' && <TicketsTab refreshKey={refreshKey} onOpen={(id) => setParam({ ticket: String(id) })} />}
      {tab === 'analytics' && <AnalyticsTab refreshKey={refreshKey} />}
      {tab === 'admin' && <SupportAdminTab canManage={me.canManage} canEditKb={me.canKb} sandbox={sandbox} onOpenConversation={(id) => setParam({ tab: null, conversation: String(id) })} />}

      <TicketDrawer ticketId={ticketParam} refreshKey={refreshKey} agents={agents}
        me={{ id: me.id, canReply: me.canReply, canResolve: me.canResolve, canAssign: me.canAssign }}
        onClose={() => setParam({ ticket: null })}
        onOpenConversation={(id) => setParam({ ticket: null, tab: null, conversation: String(id) })} />
      <NewTicketDialog conversationId={newTicketFor} onClose={() => setNewTicketFor(null)}
        onCreated={(id) => { setNewTicketFor(null); setParam({ ticket: String(id) }); if (selectedId) void loadConversation(selectedId) }} />
    </div>
  )
}

export default SupportCenterPage
