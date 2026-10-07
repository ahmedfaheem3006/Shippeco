import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  AlertCircle, ArrowRight, Bot, Check, CheckCheck, Clock, FileText, Info, Loader2, Mic, PanelLeft, RotateCcw, Send, ShieldCheck, UserCheck,
} from 'lucide-react'
import type { ConversationPanel, SupportMessage } from '../../services/supportService'
import { supportService } from '../../services/supportService'
import { CONVERSATION_STATUS, INTENT, clock, errorText, windowState } from '../../utils/support'

type Props = {
  panel: ConversationPanel | null
  messages: SupportMessage[]
  loading: boolean
  me: { id: number; canReply: boolean; canAssign: boolean; canResolve: boolean; canManage: boolean }
  busy: boolean
  hasOlder: boolean
  onOlder: () => void
  onBack: () => void
  onTogglePanel: () => void
  onTakeover: (force: boolean) => void
  onReturnToAi: () => void
  onResolve: (status: 'RESOLVED' | 'CLOSED') => void
  onSend: (text: string) => Promise<boolean>
  onTemplate: () => void
}

function MediaView({ m }: { m: SupportMessage }) {
  const [url, setUrl] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    let revoke: string | null = null
    if (m.media_id && m.media_status === 'stored' && (m.media_kind === 'image' || m.media_kind === 'audio')) {
      supportService.mediaUrl(m.media_id).then((u) => { revoke = u; setUrl(u) }).catch((e: unknown) => setErr(errorText(e)))
    }
    return () => { if (revoke) URL.revokeObjectURL(revoke) }
  }, [m.media_id, m.media_status, m.media_kind])

  if (!m.media_id) return null
  if (m.media_status === 'rejected') return <div className="text-[11px] font-bold text-red-500">مرفق مرفوض ({m.media_reject_reason === 'too_large' ? 'حجم كبير' : m.media_reject_reason === 'content_mismatch' ? 'محتوى لا يطابق النوع' : 'نوع غير مسموح'})</div>
  if (m.media_status === 'pending') return <div className="text-[11px] text-gray-400 flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> جاري تحميل المرفق…</div>
  if (m.media_status === 'purged') return <div className="text-[11px] text-gray-400">انتهت مدة الاحتفاظ بالمرفق</div>
  if (m.media_status !== 'stored') return <div className="text-[11px] text-red-500">تعذر تحميل المرفق من واتساب</div>
  if (err) return <div className="text-[11px] text-red-500">{err}</div>
  if (m.media_kind === 'image') return url ? <img src={url} alt="مرفق من العميل" className="max-h-56 rounded-lg border border-black/5" /> : <div className="h-24 w-40 rounded-lg bg-black/5 animate-pulse" />
  if (m.media_kind === 'audio') return url ? <audio controls src={url} className="max-w-[240px]" /> : <div className="text-[11px] flex items-center gap-1"><Mic size={12} /> رسالة صوتية</div>
  return (
    <button type="button" className="flex items-center gap-1.5 text-[12px] font-bold underline" onClick={async () => {
      try { const u = await supportService.mediaUrl(m.media_id!); window.open(u, '_blank', 'noopener'); } catch (e: unknown) { setErr(errorText(e)) }
    }}>
      <FileText size={14} /> {m.media_file_name || 'مستند'} {m.media_size ? `(${Math.ceil(m.media_size / 1024)} KB)` : ''}
    </button>
  )
}

function StatusIcon({ m }: { m: SupportMessage }) {
  if (m.direction !== 'outbound') return null
  const s = m.provider_status
  if (s === 'failed') return <span title={`فشل الإرسال: ${m.error_code ?? ''} ${m.error_message ?? ''}`}><AlertCircle size={13} className="text-red-500" /></span>
  if (s === 'read') return <span title="مقروءة"><CheckCheck size={13} className="text-sky-500" /></span>
  if (s === 'delivered') return <span title="تم التسليم"><CheckCheck size={13} /></span>
  if (s === 'sent') return <span title="أُرسلت"><Check size={13} /></span>
  return <span title="قيد الإرسال"><Clock size={12} /></span>
}

function Bubble({ m }: { m: SupportMessage }) {
  if (m.direction === 'internal') {
    return (
      <div className="flex justify-center my-2">
        <span className="px-3 py-1 rounded-full bg-gray-100 dark:bg-slate-800 text-[11px] font-bold text-gray-500 dark:text-gray-400 flex items-center gap-1"><Info size={12} /> {m.text}</span>
      </div>
    )
  }
  const customer = m.sender_type === 'customer'
  const tone = customer
    ? 'bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-900 dark:text-gray-100'
    : m.sender_type === 'ai'
      ? 'bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-100 dark:border-indigo-900 text-gray-900 dark:text-gray-100'
      : m.sender_type === 'agent'
        ? 'bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900 text-gray-900 dark:text-gray-100'
        : 'bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900 text-gray-900 dark:text-gray-100'
  const who = customer ? 'العميل' : m.sender_type === 'ai' ? 'المساعد الآلي' : m.sender_type === 'agent' ? (m.sender_name || 'موظف') : 'النظام'
  return (
    <div className={`flex ${customer ? 'justify-start' : 'justify-end'} my-1.5`}>
      <div className={`max-w-[85%] sm:max-w-[70%] rounded-2xl px-3 py-2 shadow-sm ${tone} ${m.provider_status === 'failed' ? 'ring-1 ring-red-300' : ''}`}>
        <div className="flex items-center gap-1 text-[10px] font-black opacity-70 mb-0.5">
          {m.sender_type === 'ai' ? <Bot size={11} /> : m.sender_type === 'agent' ? <UserCheck size={11} /> : null} {who}
          {m.meta?.intent && <span className="font-bold opacity-80">· {INTENT[m.meta.intent] ?? m.meta.intent}</span>}
        </div>
        <MediaView m={m} />
        {m.message_type === 'audio' && m.meta?.transcript && <div className="text-[11px] italic opacity-80 mt-1">نص تقريبي: {m.meta.transcript}</div>}
        {m.text && <div className="text-sm whitespace-pre-wrap break-words leading-relaxed" dir="auto">{m.text}</div>}
        {m.meta?.rate_limited && <div className="text-[10px] text-amber-600 font-bold mt-1">رسائل كثيرة خلال دقيقة — لم يرد عليها المساعد</div>}
        {m.meta?.tools?.length ? <div className="text-[10px] opacity-60 mt-1" dir="ltr">🔧 {m.meta.tools.join(' · ')}</div> : null}
        {m.provider_status === 'failed' && <div className="text-[10px] text-red-600 font-bold mt-1">لم تُرسل: {m.error_message || m.error_code}</div>}
        <div className="flex items-center justify-end gap-1 text-[10px] opacity-60 mt-0.5"><span dir="ltr">{clock(m.created_at)}</span><StatusIcon m={m} /></div>
      </div>
    </div>
  )
}

export function ChatPanel(p: Props) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const lastId = p.messages[p.messages.length - 1]?.id
  useLayoutEffect(() => { endRef.current?.scrollIntoView?.({ block: 'end' }) }, [lastId])

  if (!p.panel) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 p-8 text-center">
        {p.loading ? <Loader2 className="animate-spin" /> : <div><ShieldCheck size={36} className="mx-auto mb-2 opacity-40" /><p className="text-sm font-bold">اختر محادثة لعرضها</p></div>}
      </div>
    )
  }
  const c = p.panel.conversation
  const st = CONVERSATION_STATUS[c.status]
  const win = windowState(c.customer_service_window_expires_at)
  const mine = c.status === 'HUMAN_ACTIVE' && c.assigned_user_id === p.me.id
  const ownedByOther = c.status === 'HUMAN_ACTIVE' && c.assigned_user_id && c.assigned_user_id !== p.me.id

  const send = async () => {
    const t = text.trim()
    if (!t || sending) return
    setSending(true)
    const ok = await p.onSend(t)
    setSending(false)
    if (ok) setText('')
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-100 dark:border-slate-700/60">
        <button type="button" onClick={p.onBack} className="lg:hidden p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700" aria-label="رجوع"><ArrowRight size={18} /></button>
        <div className="min-w-0 flex-1">
          <div className="font-black text-sm text-gray-900 dark:text-white truncate">{p.panel.customer?.name || c.profile_name || c.phone_e164}</div>
          <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
            <span dir="ltr" className="text-gray-400">{c.phone_e164}</span>
            <span className={`px-1.5 py-0.5 rounded font-bold ${st.cls}`}>{st.label}</span>
            {c.assigned_name && <span className="font-bold text-emerald-600">مع {c.assigned_name}</span>}
            <span className={`font-bold ${win.open ? 'text-gray-400' : 'text-red-500'}`}>{win.label}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {p.me.canResolve && c.status !== 'RESOLVED' && c.status !== 'CLOSED' && (
            <button type="button" disabled={p.busy} onClick={() => p.onResolve('RESOLVED')} className="hidden sm:inline-flex px-2.5 py-1.5 rounded-lg text-[11px] font-bold border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-50">إنهاء المحادثة</button>
          )}
          {(mine || p.me.canManage) && c.status === 'HUMAN_ACTIVE' && (
            <button type="button" disabled={p.busy} onClick={p.onReturnToAi} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border border-indigo-200 dark:border-indigo-800 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950 disabled:opacity-50">
              <RotateCcw size={12} /> إعادة المحادثة للمساعد
            </button>
          )}
          <button type="button" onClick={p.onTogglePanel} className="xl:hidden p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700" aria-label="بيانات العميل"><PanelLeft size={18} /></button>
        </div>
      </div>

      <div role="log" aria-live="polite" aria-label="رسائل المحادثة" className="flex-1 min-h-0 overflow-y-auto px-3 py-2 bg-[#f6f7fb] dark:bg-slate-900/60">
        {p.hasOlder && (
          <div className="text-center my-2"><button type="button" onClick={p.onOlder} className="text-[11px] font-bold text-indigo-600">رسائل أقدم</button></div>
        )}
        {p.messages.map((m) => <Bubble key={m.id} m={m} />)}
        <div ref={endRef} />
      </div>

      <div className="border-t border-gray-100 dark:border-slate-700/60 p-2.5">
        {!p.me.canReply ? (
          <div className="text-center text-[11px] font-bold text-gray-400 py-2">صلاحيتك للعرض فقط</div>
        ) : !mine ? (
          <div className="flex flex-col sm:flex-row items-center gap-2 justify-between">
            <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 text-center">
              {ownedByOther ? `المحادثة مستلمة بواسطة ${c.assigned_name ?? 'موظف آخر'}` : c.status === 'WAITING_FOR_AGENT' ? 'العميل بانتظار موظف — استلم المحادثة للرد، وسيتوقف المساعد الآلي' : 'المساعد الآلي يتعامل مع المحادثة — الاستلام يوقفه فورًا'}
            </span>
            {ownedByOther ? (
              p.me.canAssign && <button type="button" disabled={p.busy} onClick={() => p.onTakeover(true)} className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-50">نقل المحادثة إليّ</button>
            ) : (
              <button type="button" disabled={p.busy} onClick={() => p.onTakeover(false)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow disabled:opacity-50">
                {p.busy ? <Loader2 size={15} className="animate-spin" /> : <UserCheck size={15} />} استلام المحادثة
              </button>
            )}
          </div>
        ) : !win.open ? (
          <div className="flex flex-col sm:flex-row items-center gap-2 justify-between">
            <span className="text-[11px] font-bold text-red-500">لا يمكن إرسال رسالة حرة بعد 24 ساعة من آخر رسالة للعميل (سياسة واتساب).</span>
            <button type="button" disabled={p.busy} onClick={p.onTemplate} className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white disabled:opacity-50">إرسال قالب متابعة معتمد</button>
          </div>
        ) : (
          <div className="flex items-end gap-2">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }}
              rows={2}
              maxLength={4000}
              placeholder="اكتب ردك للعميل… (Enter للإرسال، Shift+Enter لسطر جديد)"
              aria-label="رد الموظف"
              className="flex-1 resize-none bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              dir="auto"
            />
            <button type="button" onClick={() => void send()} disabled={!text.trim() || sending} className="p-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-40" aria-label="إرسال">
              {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} className="rotate-180" />}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
