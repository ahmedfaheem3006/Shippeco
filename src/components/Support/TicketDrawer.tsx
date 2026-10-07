import { useEffect, useId, useState } from 'react'
import { toast } from 'react-hot-toast'
import { Loader2, Lock, MessageSquare, Send, X } from 'lucide-react'
import { Dialog } from '../shared/Dialog'
import { newClientRef, supportService, type TicketDetail, type TicketPriority, type TicketStatus } from '../../services/supportService'
import { CATEGORY, PRIORITY, TICKET_STATUS, clock, errorText } from '../../utils/support'

type Props = {
  ticketId: number | null
  onClose: () => void
  onOpenConversation: (id: number) => void
  agents: Array<{ id: number; full_name: string }>
  me: { id: number; canReply: boolean; canResolve: boolean; canAssign: boolean }
  refreshKey: number
}

const EVENT_LABEL: Record<string, string> = {
  created: 'إنشاء', assigned: 'إسناد', status_changed: 'تغيير الحالة', priority_changed: 'تغيير الأولوية', category_changed: 'تغيير التصنيف',
  customer_message: 'رسالة العميل', agent_message: 'رد الموظف', ai_handoff: 'تحويل من المساعد', resolved: 'حل', reopened: 'إعادة فتح',
  closed: 'إغلاق', internal_note: 'ملاحظة داخلية', attachment: 'مرفق',
}

export function TicketDrawer({ ticketId, onClose, onOpenConversation, agents, me, refreshKey }: Props) {
  const headingId = useId()
  const [loaded, setLoaded] = useState<{ id: number; t: TicketDetail } | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [reply, setReply] = useState('')
  const t = loaded && loaded.id === ticketId ? loaded.t : null
  const loading = ticketId !== null && !t

  useEffect(() => {
    if (!ticketId) return
    let live = true
    supportService.ticket(ticketId)
      .then((x) => { if (live) setLoaded({ id: ticketId, t: x }) })
      .catch((e: unknown) => { if (live) toast.error(errorText(e)) })
    return () => { live = false }
  }, [ticketId, refreshKey])

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    if (busy || !ticketId) return
    setBusy(true)
    try {
      const r = await fn()
      const isTicket = (x: unknown): x is TicketDetail => typeof x === 'object' && x !== null && 'ticket_number' in x
      setLoaded({ id: ticketId, t: isTicket(r) ? r : await supportService.ticket(ticketId) })
      if (ok) toast.success(ok)
    } catch (e: unknown) { toast.error(errorText(e, 'تعذر تنفيذ العملية')) } finally { setBusy(false) }
  }

  const select = 'bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-xs font-bold w-full'
  return (
    <Dialog open={ticketId !== null} onRequestClose={onClose} labelledBy={headingId} panelClassName="sm:max-w-2xl max-h-[92dvh]">
      <div className="flex items-center gap-2 p-4 border-b border-gray-100 dark:border-slate-700/60">
        <h2 id={headingId} className="font-black text-base text-gray-900 dark:text-white flex-1 truncate">
          {t ? <><span dir="ltr">{t.ticket_number}</span> — {t.subject}</> : 'تذكرة'}
        </h2>
        <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700" aria-label="إغلاق"><X size={18} /></button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 text-xs">
        {loading || !t ? <div className="flex justify-center py-10"><Loader2 className="animate-spin text-indigo-500" /></div> : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <label className="space-y-1"><span className="font-bold text-gray-400">الحالة</span>
                <select className={select} value={t.status} disabled={!me.canResolve || busy} onChange={(e) => run(() => supportService.ticketStatus(t.id, e.target.value as TicketStatus), 'تم تحديث الحالة')}>
                  {Object.entries(TICKET_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select></label>
              <label className="space-y-1"><span className="font-bold text-gray-400">الأولوية</span>
                <select className={select} value={t.priority} disabled={!me.canResolve || busy} onChange={(e) => run(() => supportService.ticketPriority(t.id, e.target.value as TicketPriority), 'تم تحديث الأولوية')}>
                  {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select></label>
              <label className="space-y-1"><span className="font-bold text-gray-400">التصنيف</span>
                <select className={select} value={t.category} disabled={!me.canResolve || busy} onChange={(e) => run(() => supportService.ticketCategory(t.id, e.target.value), 'تم تحديث التصنيف')}>
                  {Object.entries(CATEGORY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select></label>
              <label className="space-y-1"><span className="font-bold text-gray-400">المسؤول</span>
                <select className={select} value={t.assigned_to ?? ''} disabled={!me.canReply || busy}
                  onChange={(e) => run(() => supportService.ticketAssign(t.id, e.target.value ? Number(e.target.value) : null), 'تم الإسناد')}>
                  <option value="">— بدون —</option>
                  {(me.canAssign ? agents : agents.filter((a) => a.id === me.id || a.id === t.assigned_to)).map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
                </select></label>
            </div>
            {t.priority_reason && <div className="text-[11px] text-gray-500">سبب الأولوية: {t.priority_reason}</div>}
            <div className="flex flex-wrap gap-2 text-[11px]">
              {t.client_name && <span className="px-2 py-1 rounded-lg bg-gray-100 dark:bg-slate-800 font-bold">{t.client_name}</span>}
              {t.invoice_number && <span className="px-2 py-1 rounded-lg bg-gray-100 dark:bg-slate-800 font-bold" dir="ltr">{t.invoice_number}</span>}
              {t.awb && <span className="px-2 py-1 rounded-lg bg-gray-100 dark:bg-slate-800 font-bold" dir="ltr">AWB {t.awb}</span>}
              {t.conversation_id && <button type="button" onClick={() => onOpenConversation(t.conversation_id!)} className="px-2 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-600 font-bold inline-flex items-center gap-1"><MessageSquare size={12} /> فتح المحادثة</button>}
            </div>
            {t.description && <p className="whitespace-pre-wrap text-gray-700 dark:text-gray-200" dir="auto">{t.description}</p>}

            <div>
              <h3 className="font-black mb-2">السجل</h3>
              <ol className="space-y-1.5 border-r-2 border-gray-100 dark:border-slate-700 pr-3">
                {t.events.map((e) => (
                  <li key={e.id} className={e.event_type === 'internal_note' ? 'bg-amber-50 dark:bg-amber-950/30 rounded-lg p-2' : ''}>
                    <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
                      {e.event_type === 'internal_note' && <Lock size={10} className="text-amber-600" />}
                      <span className="font-bold text-gray-600 dark:text-gray-300">{EVENT_LABEL[e.event_type] ?? e.event_type}</span>
                      <span>{e.actor_name ?? (e.actor_type === 'ai' ? 'المساعد' : e.actor_type === 'customer' ? 'العميل' : 'النظام')}</span>
                      {e.from_value || e.to_value ? <span dir="ltr">{e.from_value ?? ''} → {e.to_value ?? ''}</span> : null}
                      <span className="mr-auto" dir="ltr">{clock(e.created_at)}</span>
                    </div>
                    {e.note && <div className="text-[12px] whitespace-pre-wrap" dir="auto">{e.note}</div>}
                  </li>
                ))}
              </ol>
            </div>

            {me.canReply && (
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <div className="font-black flex items-center gap-1"><Lock size={12} className="text-amber-600" /> ملاحظة داخلية (لا تصل للعميل)</div>
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={4000} className="w-full rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/20 p-2" />
                  <button type="button" disabled={!note.trim() || busy} onClick={() => run(async () => { const r = await supportService.ticketNote(t.id, note.trim()); setNote(''); return r }, 'أُضيفت الملاحظة')} className="px-3 py-1.5 rounded-lg bg-amber-500 text-white font-bold disabled:opacity-40">حفظ الملاحظة</button>
                </div>
                {t.conversation_id && (
                  <div className="space-y-1.5">
                    <div className="font-black flex items-center gap-1"><Send size={12} className="text-emerald-600" /> رد للعميل على واتساب</div>
                    <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={3} maxLength={4000} dir="auto" className="w-full rounded-lg border border-emerald-200 dark:border-emerald-900 p-2 bg-white dark:bg-slate-900" />
                    <button type="button" disabled={!reply.trim() || busy} onClick={() => run(async () => { const r = await supportService.ticketReply(t.id, reply.trim(), newClientRef()); setReply(''); return r }, 'أُرسل الرد')} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-bold disabled:opacity-40">إرسال</button>
                    <p className="text-[10px] text-gray-400">يتطلب أن تكون قد استلمت المحادثة وأن تكون نافذة الـ24 ساعة مفتوحة.</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </Dialog>
  )
}
