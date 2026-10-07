import { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import { CheckCircle2, FlaskConical, Loader2, Plus, RefreshCw, Save, XCircle } from 'lucide-react'
import { supportService, type KbArticle, type SupportHealth, type SupportSettings } from '../../services/supportService'
import { errorText } from '../../utils/support'

type Props = { canManage: boolean; canEditKb: boolean; sandbox: boolean; onOpenConversation: (id: number) => void }

const Flag = ({ ok, label }: { ok: boolean; label: string }) => (
  <span className={`inline-flex items-center gap-1 text-[11px] font-bold ${ok ? 'text-emerald-600' : 'text-red-500'}`}>{ok ? <CheckCircle2 size={13} /> : <XCircle size={13} />} {label}</span>
)
const Box = ({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) => (
  <section className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-4 space-y-3">
    <div className="flex items-center gap-2"><h3 className="text-sm font-black flex-1">{title}</h3>{action}</div>
    {children}
  </section>
)

function HealthBox() {
  const [h, setH] = useState<SupportHealth | null>(null)
  const [loading, setLoading] = useState(false)
  const load = async (live: boolean) => {
    setLoading(true)
    try { setH(await supportService.health(live)) } catch (e: unknown) { toast.error(errorText(e)) } finally { setLoading(false) }
  }
  useEffect(() => {
    let alive = true
    supportService.health(false).then((x) => { if (alive) setH(x) }).catch((e: unknown) => toast.error(errorText(e)))
    return () => { alive = false }
  }, [])
  const modeLabel: Record<string, string> = { live: 'متصل (حقيقي)', mock: 'وضع المحاكاة (محلي)', not_configured: 'غير مهيأ' }
  return (
    <Box title="حالة التكامل" action={<button type="button" disabled={loading} onClick={() => load(true)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold border border-gray-200 dark:border-slate-700 disabled:opacity-50">{loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} فحص مباشر</button>}>
      {!h ? <Loader2 className="animate-spin" /> : (
        <div className="grid md:grid-cols-2 gap-4 text-xs">
          <div className="space-y-1.5">
            <div className="font-black">WhatsApp Cloud API — {modeLabel[h.whatsapp.mode] ?? h.whatsapp.mode}</div>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {Object.entries(h.whatsapp.configured).map(([k, v]) => <Flag key={k} ok={Boolean(v)} label={k} />)}
            </div>
            <div className="text-gray-500">Graph API: {h.whatsapp.graph_api_version}</div>
            <div className="text-gray-500">Webhook URL: <span dir="ltr" className="font-mono select-all">{h.whatsapp.webhook_url}</span></div>
            <div className="text-gray-500">آخر Webhook: {h.whatsapp.last_webhook_at ?? '—'}</div>
            <div className="text-gray-500">آخر إرسال ناجح: {h.whatsapp.last_outbound_success_at ?? '—'}</div>
            <div className="text-gray-500">القوالب: {h.whatsapp.templates.followup ?? 'غير مضبوط'} / {h.whatsapp.templates.ticket_update ?? 'غير مضبوط'} ({h.whatsapp.templates.language})</div>
            {Array.isArray(h.whatsapp.templates.statuses) && h.whatsapp.templates.statuses.map((t) => <div key={t.name} className="text-gray-500">{t.name}: <b>{t.status}</b> ({t.category})</div>)}
            {h.whatsapp.live && <div className={h.whatsapp.live.ok ? 'text-emerald-600 font-bold' : 'text-red-500 font-bold'}>{h.whatsapp.live.ok ? `الرقم: ${h.whatsapp.live.display_phone_number} · ${h.whatsapp.live.verified_name} · الجودة ${h.whatsapp.live.quality_rating}` : `فشل الفحص: ${h.whatsapp.live.error}`}</div>}
          </div>
          <div className="space-y-1.5">
            <div className="font-black">Gemini — {modeLabel[h.gemini.mode] ?? h.gemini.mode}</div>
            <Flag ok={h.gemini.configured} label="GEMINI_API_KEY" />
            <div className="text-gray-500">النموذج: <span dir="ltr">{h.gemini.model}</span> · التفكير: {h.gemini.thinking_level} · حد الرد {h.gemini.max_output_tokens} توكن</div>
            <div className="text-gray-500">آخر طلب ناجح: {h.gemini.last_success_at ?? '—'}</div>
            {h.gemini.live && <div className={h.gemini.live.ok ? 'text-emerald-600 font-bold' : 'text-red-500 font-bold'}>{h.gemini.live.ok ? 'الاتصال بـ Gemini يعمل' : `فشل الفحص: ${h.gemini.live.error}`}</div>}
          </div>
        </div>
      )}
    </Box>
  )
}

function SettingsBox({ canManage }: { canManage: boolean }) {
  const [s, setS] = useState<SupportSettings | null>(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => { supportService.settings().then(setS).catch((e: unknown) => toast.error(errorText(e))) }, [])
  if (!s) return <Box title="إعدادات خدمة العملاء"><Loader2 className="animate-spin" /></Box>
  const save = async () => {
    setSaving(true)
    try { setS(await supportService.saveSettings(s)); toast.success('تم حفظ الإعدادات') } catch (e: unknown) { toast.error(errorText(e)) } finally { setSaving(false) }
  }
  const chk = (k: 'aiEnabled' | 'voiceEnabled' | 'autoHandoff', label: string, hint: string) => (
    <label className="flex items-start gap-2 text-xs cursor-pointer">
      <input type="checkbox" className="mt-0.5 accent-indigo-600" checked={s[k]} disabled={!canManage} onChange={(e) => setS({ ...s, [k]: e.target.checked })} />
      <span><b>{label}</b><span className="block text-[10px] text-gray-400">{hint}</span></span>
    </label>
  )
  const roles: Array<[string, string]> = [['admin', 'المدير'], ['manager', 'المدير التنفيذي'], ['employee', 'موظفو خدمة العملاء'], ['accountant', 'المحاسبون']]
  return (
    <Box title="إعدادات خدمة العملاء" action={canManage && <button type="button" disabled={saving} onClick={save} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 text-white disabled:opacity-50">{saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} حفظ</button>}>
      <div className="grid md:grid-cols-2 gap-3">
        {chk('aiEnabled', 'تشغيل المساعد الآلي', 'عند الإيقاف تُحوَّل كل الرسائل الجديدة للموظفين مع رد آمن واحد')}
        {chk('autoHandoff', 'التحويل التلقائي', 'تحويل عند انخفاض الثقة أو فشل الأدوات أو غضب العميل أو بلوغ حد الردود')}
        {chk('voiceEnabled', 'معالجة الرسائل الصوتية', 'تحويل الصوت لنص عبر Gemini (تُحسب تكلفته في الاستخدام)')}
        <label className="text-xs space-y-1"><b>أقصى عدد ردود آلية قبل التحويل</b>
          <input type="number" min={1} max={100} value={s.maxAiReplies} disabled={!canManage} onChange={(e) => setS({ ...s, maxAiReplies: Number(e.target.value) || 1 })} className="w-24 block bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg px-2 py-1" /></label>
        <label className="text-xs space-y-1 md:col-span-2"><b>مواعيد العمل المعتمدة (يقرؤها المساعد كما هي)</b>
          <input value={s.workingHours} maxLength={300} disabled={!canManage} onChange={(e) => setS({ ...s, workingHours: e.target.value })} placeholder="اتركه فارغًا إذا لم تُعتمد مواعيد — لن يذكر المساعد أي مواعيد" className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg px-2 py-1.5" /></label>
        <div className="text-xs space-y-1 md:col-span-2"><b>الفريق الذي يستلم التنبيهات</b>
          <div className="flex flex-wrap gap-3">{roles.map(([k, l]) => (
            <label key={k} className="flex items-center gap-1"><input type="checkbox" className="accent-indigo-600" disabled={!canManage} checked={s.teamRoles.includes(k)}
              onChange={(e) => setS({ ...s, teamRoles: e.target.checked ? [...s.teamRoles, k] : s.teamRoles.filter((x) => x !== k) })} /> {l}</label>
          ))}</div>
        </div>
      </div>
    </Box>
  )
}

function KbBox({ canEdit }: { canEdit: boolean }) {
  const [items, setItems] = useState<KbArticle[]>([])
  const [edit, setEdit] = useState<Partial<KbArticle> | null>(null)
  const [saving, setSaving] = useState(false)
  const load = () => supportService.kb().then(setItems).catch((e: unknown) => toast.error(errorText(e)))
  useEffect(() => { void load() }, [])
  const save = async () => {
    if (!edit) return
    setSaving(true)
    try { await supportService.saveKb(edit.id ?? null, edit); toast.success('تم الحفظ (نسخة جديدة)'); setEdit(null); await load() } catch (e: unknown) { toast.error(errorText(e)) } finally { setSaving(false) }
  }
  const input = 'w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-xs'
  return (
    <Box title="قاعدة المعرفة المعتمدة (المصدر الوحيد لمعلومات الشركة لدى المساعد)" action={canEdit && <button type="button" onClick={() => setEdit({ title: '', content: '', category: '', keywords: '', active: true })} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold border border-gray-200 dark:border-slate-700"><Plus size={13} /> مقال</button>}>
      {edit && (
        <div className="rounded-xl border border-indigo-200 dark:border-indigo-900 p-3 space-y-2">
          <input className={input} placeholder="العنوان" value={edit.title ?? ''} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <input className={input} placeholder="التصنيف" value={edit.category ?? ''} onChange={(e) => setEdit({ ...edit, category: e.target.value })} />
            <input className={input} placeholder="كلمات مفتاحية للبحث" value={edit.keywords ?? ''} onChange={(e) => setEdit({ ...edit, keywords: e.target.value })} />
          </div>
          <textarea className={input} rows={4} placeholder="المحتوى المعتمد — اكتب الحقائق فقط" value={edit.content ?? ''} onChange={(e) => setEdit({ ...edit, content: e.target.value })} />
          <label className="flex items-center gap-1 text-xs"><input type="checkbox" className="accent-indigo-600" checked={edit.active !== false} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> مفعّل (يستخدمه المساعد)</label>
          <div className="flex gap-2">
            <button type="button" disabled={saving} onClick={save} className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold disabled:opacity-50">حفظ</button>
            <button type="button" onClick={() => setEdit(null)} className="px-3 py-1.5 rounded-lg border text-xs font-bold">إلغاء</button>
          </div>
        </div>
      )}
      <ul className="divide-y divide-gray-100 dark:divide-slate-700/60">
        {items.map((a) => (
          <li key={a.id} className="py-2 flex gap-2 items-start">
            <div className="flex-1 min-w-0">
              <div className="text-xs font-black">{a.title} <span className={`text-[9px] px-1.5 rounded ${a.active ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-400'}`}>{a.active ? 'مفعّل' : 'موقوف'}</span> <span className="text-[9px] text-gray-400">v{a.version}</span></div>
              <div className="text-[11px] text-gray-500 line-clamp-2">{a.content}</div>
            </div>
            {canEdit && <button type="button" onClick={() => setEdit(a)} className="text-[11px] font-bold text-indigo-600 shrink-0">تعديل</button>}
          </li>
        ))}
      </ul>
    </Box>
  )
}

function SandboxBox({ onOpenConversation }: { onOpenConversation: (id: number) => void }) {
  const [phone, setPhone] = useState('+966500000001')
  const [text, setText] = useState('السلام عليكم')
  const [busy, setBusy] = useState(false)
  const send = async () => {
    setBusy(true)
    try { const r = await supportService.sandboxIncoming({ phone, text, name: 'عميل تجريبي' }); toast.success('أُرسلت رسالة تجريبية'); onOpenConversation(r.conversationId) } catch (e: unknown) { toast.error(errorText(e)) } finally { setBusy(false) }
  }
  return (
    <Box title="بيئة الاختبار المحلية (غير متاحة في الإنتاج)" action={<FlaskConical size={16} className="text-amber-500" />}>
      <p className="text-[11px] text-gray-500">تحاكي رسالة واردة من واتساب وتمر بالمسار الكامل (المساعد، الأدوات، التذاكر). لا يُرسل أي شيء لواتساب في وضع المحاكاة.</p>
      <div className="flex flex-col sm:flex-row gap-2">
        <input value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" className="sm:w-44 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-xs" aria-label="رقم تجريبي" />
        <input value={text} onChange={(e) => setText(e.target.value)} className="flex-1 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-xs" aria-label="نص الرسالة" />
        <button type="button" disabled={busy || !text.trim()} onClick={send} className="px-3 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-bold disabled:opacity-50">إرسال كعميل</button>
      </div>
    </Box>
  )
}

export function SupportAdminTab({ canManage, canEditKb, sandbox, onOpenConversation }: Props) {
  return (
    <div className="space-y-4">
      {canManage && <HealthBox />}
      <SettingsBox canManage={canManage} />
      <KbBox canEdit={canEditKb} />
      {sandbox && canManage && <SandboxBox onOpenConversation={onOpenConversation} />}
    </div>
  )
}
