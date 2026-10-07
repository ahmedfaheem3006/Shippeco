import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { supportService, type SupportAnalytics } from '../../services/supportService'
import { CATEGORY, errorText, fmtSeconds } from '../../utils/support'

const Card = ({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) => (
  <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-4">
    <div className="text-[11px] font-bold text-gray-400">{label}</div>
    <div className="text-xl font-black text-gray-900 dark:text-white mt-1" dir="ltr" style={{ textAlign: 'right' }}>{value}</div>
    {sub && <div className="text-[10px] text-gray-400 mt-0.5">{sub}</div>}
  </div>
)

export function AnalyticsTab({ refreshKey }: { refreshKey: number }) {
  const [days, setDays] = useState(30)
  const key = `${days}:${refreshKey}`
  const [res, setRes] = useState<{ key: string; data?: SupportAnalytics; err?: string } | null>(null)
  useEffect(() => {
    let live = true
    supportService.analytics(days)
      .then((data) => { if (live) setRes({ key, data }) })
      .catch((e: unknown) => { if (live) setRes({ key, err: errorText(e) }) })
    return () => { live = false }
  }, [days, key])
  // The previous numbers stay on screen while a refresh loads.
  const a = res?.data
  if (res?.err && res.key === key) return <div className="p-6 text-center text-red-500 text-sm font-bold">{res.err}</div>
  if (!a) return <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-indigo-500" /></div>
  const u = a.ai_usage
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold text-gray-500">الفترة:</span>
        {[7, 30, 90].map((d) => (
          <button key={d} type="button" onClick={() => setDays(d)} className={`px-3 py-1 rounded-lg text-xs font-bold border ${days === d ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 dark:border-slate-700'}`}>آخر {d} يومًا</button>
        ))}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card label="محادثات اليوم" value={a.conversations_today} />
        <Card label="محادثات الفترة" value={a.conversations} />
        <Card label="تعامل معها المساعد فقط" value={a.ai_handled} />
        <Card label="تعامل معها موظف" value={a.human_handled} />
        <Card label="نسبة التحويل لموظف" value={`${a.handoff_rate}%`} />
        <Card label="تذاكر مفتوحة" value={a.open_tickets} sub={`${a.urgent_tickets} عاجلة`} />
        <Card label="متوسط زمن أول رد" value={fmtSeconds(a.avg_first_response_seconds)} sub="من أول رسالة حتى أول رد (آلي أو موظف)" />
        <Card label="متوسط زمن الحل" value={fmtSeconds(a.avg_resolution_seconds)} sub="للتذاكر المحلولة" />
        <Card label="نسبة أخطاء الذكاء الاصطناعي" value={`${a.ai_error_rate}%`} />
        <Card label="توكنز اليوم" value={Number(u.tokensToday).toLocaleString('en-US')} sub={`الحد اليومي ${Number(u.limits.dailyTokens).toLocaleString('en-US')}`} />
        <Card label="توكنز الشهر" value={Number(u.tokensMonth).toLocaleString('en-US')} sub={`${u.callsMonth} طلب · ${u.failuresMonth} فشل`} />
        <Card label="التكلفة التقديرية (الشهر)" value={`$${u.costMonthUsd.toFixed(4)}`} sub={`اليوم $${u.costTodayUsd.toFixed(4)} · تنبيه عند $${u.limits.monthlyCostAlertUsd}`} />
        <Card label="ردود المساعد (الشهر)" value={u.aiRepliesMonth} />
        <Card label="متوسط التكلفة لكل محادثة" value={`$${u.avgCostPerConversationUsd.toFixed(5)}`} sub={`${u.conversationsMonth} محادثة استخدمت الذكاء الاصطناعي`} />
      </div>
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-4">
        <h3 className="text-sm font-black mb-2">أكثر تصنيفات الشكاوى</h3>
        {a.top_complaint_categories.length ? (
          <ul className="space-y-1.5">
            {a.top_complaint_categories.map((c) => {
              const max = a.top_complaint_categories[0].n
              return (
                <li key={c.category} className="flex items-center gap-2 text-xs">
                  <span className="w-28 shrink-0 font-bold">{CATEGORY[c.category] ?? c.category}</span>
                  <span className="flex-1 h-2 rounded-full bg-gray-100 dark:bg-slate-700 overflow-hidden"><span className="block h-full bg-indigo-500" style={{ width: `${(c.n / max) * 100}%` }} /></span>
                  <span className="w-8 text-left font-black">{c.n}</span>
                </li>
              )
            })}
          </ul>
        ) : <p className="text-xs text-gray-400">لا توجد شكاوى في هذه الفترة</p>}
      </div>
    </div>
  )
}
