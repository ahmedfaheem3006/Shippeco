import { Link } from 'react-router-dom'
import { Bot, ExternalLink, FilePlus2, Link2, Ticket, User } from 'lucide-react'
import type { AiSummary, ConversationPanel } from '../../services/supportService'
import { CATEGORY, PAYMENT_STATUS, PRIORITY, TICKET_STATUS } from '../../utils/support'

type Props = {
  panel: ConversationPanel | null
  canAssign: boolean
  canReply: boolean
  canSeeMoney: boolean
  onLink: (clientId: number | null) => void
  onOpenTicket: (id: number) => void
  onNewTicket: () => void
}

const Section = ({ title, children, icon }: { title: string; children: React.ReactNode; icon?: React.ReactNode }) => (
  <section className="rounded-xl border border-gray-100 dark:border-slate-700/70 p-3 space-y-2">
    <h3 className="flex items-center gap-1.5 text-xs font-black text-gray-800 dark:text-gray-100">{icon}{title}</h3>
    {children}
  </section>
)

const SUMMARY_LABELS: Partial<Record<keyof AiSummary, string>> = {
  contact_reason: 'سبب التواصل', problem_type: 'نوع المشكلة', started_when: 'متى بدأت', customer_request: 'ما يطلبه العميل',
  unresolved: 'ما لم يُحل', urgency: 'درجة الاستعجال', handoff_reason: 'سبب التحويل',
}

export function CustomerPanel({ panel, canAssign, canReply, canSeeMoney, onLink, onOpenTicket, onNewTicket }: Props) {
  if (!panel) return null
  const c = panel.conversation
  const s = panel.ai_summary
  const money = (v?: string) => (v === undefined ? null : `${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2 })} ر.س`)
  return (
    <div className="h-full overflow-y-auto p-3 space-y-3 text-xs">
      <Section title="العميل" icon={<User size={13} />}>
        {panel.customer ? (
          <div className="space-y-1">
            <div className="font-black text-sm text-gray-900 dark:text-white">{panel.customer.name}</div>
            <div className="text-gray-500" dir="ltr">{panel.customer.phone}</div>
            <div className="text-[10px] text-emerald-600 font-bold">{c.client_match === 'manual' ? 'رُبط يدويًا' : 'مرتبط تلقائيًا برقم الجوال'}</div>
            <div className="flex flex-wrap gap-2 pt-1">
              <Link to={`/clients?profile=${panel.customer.id}`} className="inline-flex items-center gap-1 text-indigo-600 font-bold"><ExternalLink size={12} /> ملف العميل</Link>
              {canAssign && <button type="button" onClick={() => onLink(null)} className="text-gray-400 font-bold hover:text-red-500">فك الربط</button>}
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
            <div className="text-gray-500">{c.client_match === 'ambiguous' ? 'الرقم مسجل لأكثر من عميل — اختر الصحيح:' : 'غير مرتبط بحساب عميل.'}</div>
            <div className="text-gray-500">{c.profile_name ? `اسم واتساب: ${c.profile_name}` : ''}</div>
            {canAssign && panel.candidates.map((k) => (
              <button key={k.id} type="button" onClick={() => onLink(k.id)} className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 hover:border-indigo-300 font-bold">
                <Link2 size={12} /> {k.name} <span className="text-gray-400 mr-auto" dir="ltr">{k.phone}</span>
              </button>
            ))}
          </div>
        )}
        {canSeeMoney && panel.outstanding !== null && (
          <div className="flex justify-between pt-1 border-t border-gray-100 dark:border-slate-700/60">
            <span className="text-gray-500">المستحق</span>
            <span className={`font-black ${panel.outstanding > 0 ? 'text-red-600' : 'text-gray-500'}`}>{panel.outstanding.toLocaleString('en-US', { minimumFractionDigits: 2 })} ر.س</span>
          </div>
        )}
      </Section>

      {s && (
        <Section title="ملخص المساعد للموظف" icon={<Bot size={13} />}>
          <dl className="space-y-1">
            {(Object.entries(SUMMARY_LABELS) as Array<[keyof AiSummary, string]>).map(([k, label]) => (s[k] ? (
              <div key={k}><dt className="text-[10px] font-bold text-gray-400">{label}</dt><dd className="text-gray-800 dark:text-gray-200">{String(s[k])}</dd></div>
            ) : null))}
            {([['invoice_numbers', 'الفواتير'], ['awbs', 'AWB'], ['tickets', 'التذاكر']] as const).map(([k, label]) => (s[k]?.length ? (
              <div key={k}><dt className="text-[10px] font-bold text-gray-400">{label}</dt><dd dir="ltr" className="text-right">{s[k]!.join(', ')}</dd></div>
            ) : null))}
            {Array.isArray(s.collected_info) && s.collected_info.length > 0 && (
              <div><dt className="text-[10px] font-bold text-gray-400">ما جمعه المساعد</dt><dd><ul className="list-disc pr-4">{s.collected_info.map((x, i) => <li key={i}>{x}</li>)}</ul></dd></div>
            )}
            {Array.isArray(s.verified_facts) && s.verified_facts.length > 0 && (
              <div><dt className="text-[10px] font-bold text-gray-400">ما تم التحقق منه</dt><dd><ul className="list-disc pr-4">{s.verified_facts.map((x, i) => <li key={i}>{x}</li>)}</ul></dd></div>
            )}
            {Array.isArray(s.tools_used) && s.tools_used.length > 0 && (
              <div><dt className="text-[10px] font-bold text-gray-400">الأدوات المستخدمة</dt><dd dir="ltr" className="text-right text-[10px] text-gray-500">{s.tools_used.map((t) => `${t.name}: ${t.summary}`).join(' · ')}</dd></div>
            )}
          </dl>
        </Section>
      )}

      {Object.keys(panel.collected ?? {}).length > 0 && (
        <Section title="البيانات المجمعة">
          <dl className="grid grid-cols-2 gap-x-2 gap-y-1">
            {Object.entries(panel.collected).map(([k, v]) => (
              <div key={k} className="min-w-0"><dt className="text-[10px] text-gray-400 truncate" dir="ltr">{k}</dt><dd className="font-bold truncate" dir="auto">{String(v)}</dd></div>
            ))}
          </dl>
        </Section>
      )}

      <Section title="التذاكر" icon={<Ticket size={13} />}>
        {panel.tickets.length ? panel.tickets.map((t) => (
          <button key={t.id} type="button" onClick={() => onOpenTicket(t.id)} className="w-full text-right p-2 rounded-lg border border-gray-100 dark:border-slate-700 hover:border-indigo-300">
            <div className="flex items-center gap-1.5">
              <span className="font-black" dir="ltr">{t.ticket_number}</span>
              <span className={`px-1.5 rounded text-[9px] font-bold ${PRIORITY[t.priority].cls}`}>{PRIORITY[t.priority].label}</span>
              <span className="mr-auto text-[10px] text-gray-400">{TICKET_STATUS[t.status]}</span>
            </div>
            <div className="text-[11px] text-gray-500 truncate">{CATEGORY[t.category] ?? t.category} · {t.subject}</div>
          </button>
        )) : <div className="text-gray-400">لا توجد تذاكر</div>}
        {canReply && (
          <button type="button" onClick={onNewTicket} className="w-full inline-flex items-center justify-center gap-1 py-1.5 rounded-lg border border-dashed border-gray-300 dark:border-slate-600 font-bold text-gray-500 hover:text-indigo-600">
            <FilePlus2 size={13} /> تذكرة جديدة
          </button>
        )}
      </Section>

      {panel.invoices.length > 0 && (
        <Section title="آخر الفواتير">
          {panel.invoices.map((i) => (
            <Link key={i.id} to={`/invoices?invoice=${i.id}`} className="block p-2 rounded-lg border border-gray-100 dark:border-slate-700 hover:border-indigo-300">
              <div className="flex items-center gap-1.5">
                <span className="font-black" dir="ltr">{i.invoice_number}</span>
                <span className="text-[10px] text-gray-400">{String(i.invoice_date ?? '').slice(0, 10)}</span>
                <span className="mr-auto text-[10px] font-bold">{PAYMENT_STATUS[i.payment_status] ?? '—'}</span>
              </div>
              <div className="text-[10px] text-gray-500 flex gap-2">
                {i.awb && <span dir="ltr">AWB {i.awb}</span>}
                {canSeeMoney && money(i.total) && <span>{money(i.total)}</span>}
              </div>
            </Link>
          ))}
        </Section>
      )}
    </div>
  )
}
