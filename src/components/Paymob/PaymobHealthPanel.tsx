import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, ChevronDown, Loader2, RefreshCw, XCircle } from 'lucide-react'
import { paymobBackend, type PaymobHealth } from '../../services/paymobService'
import { PAYMENT_EVENTS, useRealtimeRefresh } from '../../hooks/useRealtimeRefresh'

const when = (d: string | null | undefined) => {
  if (!d) return '—'
  try { return new Date(d).toLocaleString('ar-SA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) } catch { return d }
}

type Verdict = { level: 'ok' | 'warn' | 'error'; title: string; detail?: string }

/** One-line answer to "are payments being picked up?", worst problem first. */
function verdict(h: PaymobHealth): Verdict {
  if (h.config.missing.length) {
    return { level: 'error', title: 'إعدادات Paymob ناقصة في السيرفر', detail: h.config.missing.join('، ') }
  }
  if (!h.api_auth.ok) {
    return { level: 'error', title: 'تعذّر الاتصال بـ Paymob API — لن تُؤكَّد الدفعات تلقائياً', detail: h.api_auth.error }
  }
  if (h.reconciler.last_error) {
    return { level: 'warn', title: 'آخر فحص تلقائي فشل', detail: h.reconciler.last_error }
  }
  if (h.last_webhook && h.last_webhook.hmac_valid === false) {
    return {
      level: 'warn',
      title: 'توقيع إشعارات Paymob (HMAC) غير مطابق — الدفعات تُؤكَّد عبر Paymob API',
      detail: 'صحّح قيمة PAYMOB_HMAC_SECRET في Railway لتطابق HMAC في لوحة Paymob.',
    }
  }
  if (!h.last_webhook) {
    return {
      level: 'warn',
      title: 'لم يصل أي إشعار من Paymob بعد — الدفعات تُلتقط بالفحص التلقائي كل دقيقة',
      detail: h.config.notification_url ? `رابط الإشعارات: ${h.config.notification_url}` : undefined,
    }
  }
  return { level: 'ok', title: 'بوابة الدفع تعمل — الدفعات تُسجَّل فور وصولها' }
}

const STYLE: Record<Verdict['level'], string> = {
  ok: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/30 text-emerald-700 dark:text-emerald-400',
  warn: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/30 text-amber-700 dark:text-amber-400',
  error: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/30 text-red-700 dark:text-red-400',
}

/**
 * Gateway status for admins/accountants (the endpoint answers 403 to
 * everyone else, and then nothing is shown).
 */
export function PaymobHealthPanel() {
  const [health, setHealth] = useState<PaymobHealth | null>(null)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setHealth(await paymobBackend.health())
    } catch {
      setHealth(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let alive = true
    paymobBackend.health().then((h) => { if (alive) setHealth(h) }, () => undefined)
    return () => { alive = false }
  }, [])
  useRealtimeRefresh(PAYMENT_EVENTS, () => { void load() })

  if (!health) return null
  const v = verdict(health)
  const Icon = v.level === 'ok' ? CheckCircle2 : v.level === 'warn' ? AlertTriangle : XCircle
  const r = health.reconciler

  return (
    <div className={`rounded-xl border text-xs font-bold ${STYLE[v.level]}`}>
      <div className="flex items-start gap-2 p-3">
        <Icon size={16} className="shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div>{v.title}</div>
          {v.detail && <div className="mt-1 font-medium opacity-80 break-words">{v.detail}</div>}
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} title="تحديث الحالة"
          className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 shrink-0">
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
        </button>
        <button type="button" onClick={() => setExpanded((e) => !e)} aria-expanded={expanded} title="تفاصيل حالة بوابة الدفع"
          className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 shrink-0">
          <ChevronDown size={14} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
      </div>
      {expanded && (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 px-3 pb-3 font-medium text-gray-600 dark:text-gray-300">
          <dt>آخر إشعار من Paymob</dt>
          <dd className="font-inter">{when(health.last_webhook?.created_at)}{health.last_webhook ? ` — ${health.last_webhook.status}` : ''}</dd>
          <dt>آخر فحص تلقائي</dt>
          <dd className="font-inter">{when(r.last_checked_at)}</dd>
          <dt>محاولات دفع مفتوحة</dt>
          <dd className="font-inter">{r.open_attempts} (مستحقة الآن: {r.due_now})</dd>
          <dt>عمليات تحتاج مراجعة</dt>
          <dd className="font-inter">{health.needs_review}</dd>
          <dt>الفحص التلقائي</dt>
          <dd>{r.enabled ? `كل ${r.interval_seconds} ثانية` : 'متوقف'}</dd>
          {r.recent_errors.length > 0 && (
            <>
              <dt className="col-span-2 mt-1">أخطاء الفحص (آخر 24 ساعة)</dt>
              {r.recent_errors.map((e) => (
                <dd key={e.error} className="col-span-2 break-words opacity-80">• {e.error} ({e.count})</dd>
              ))}
            </>
          )}
        </dl>
      )}
    </div>
  )
}
