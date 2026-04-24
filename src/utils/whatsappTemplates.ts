import type { Invoice } from './models'
import { readJson, storageKeys, writeJson } from './storage'

export type WaTemplateKey = 'paid' | 'unpaid' | 'collection' | 'payment_link'

export type WaTemplates = Record<WaTemplateKey, string>

const WA_DEFAULT_TEMPLATES: WaTemplates = {
  paid: `مرحباً {اسم_العميل} 👋

✅ *تم إصدار بوليصة شحنتك بنجاح!*

📦 *رقم AWB:* \`{رقم_الشحنة}\`
🚚 *الناقل:* {الناقل}

🔗 *تتبع الشحنة:*
{رابط_التتبع}

📌 في حال اختلاف الوزن عند DHL يُطبَّق الفرق وفق الشروط.

شيب بيك تتمنى لك شحناً موفقاً 🌟`,
  unpaid: `مرحباً {اسم_العميل} 👋

نشكرك على تواصلك مع شيب بيك 🚀

🧾 *الفاتورة رقم:* #{رقم_الفاتورة}
💰 *المبلغ:* {المبلغ} ر.س
⏳ *الحالة:* بانتظار الدفع
{رابط_الدفع}

⚠️ سيتم إرسال بوليصة الشحن بعد إتمام الدفع.

شكراً لثقتك 🌟`,
  collection: `مرحباً {اسم_العميل} 👋

نود تذكيرك بفاتورة مستحقة لدى شيب بيك 🧾

🔖 *رقم الفاتورة:* #{رقم_الفاتورة}
📦 *رقم الشحنة:* {رقم_الشحنة}
💰 *المبلغ المستحق:* *{المتبقي} ر.س*
💰 *المدفوع:* {المدفوع} ر.س من {المبلغ} ر.س
📅 *التاريخ:* {التاريخ}
⏳ *الحالة:* مدفوع جزئياً
{رابط_الدفع}

نأمل منكم سرعة التسوية. شكراً لثقتكم 🌟
شيب بيك`,
  payment_link: `مرحباً {اسم_العميل} 👋

يسعدنا خدمتك! إليك رابط دفع فاتورتك:

🧾 رقم الفاتورة: #{رقم_الفاتورة}
📦 رقم الشحنة: {رقم_الشحنة}
💰 المبلغ: {المبلغ} ريال

💳 رابط الدفع الآمن:
{رابط_الدفع}

يمكنك الدفع بالبطاقة الائتمانية أو مدى 🔒
شكراً لتعاملكم مع شيب بيك 🚀`,
}

export const WA_TEMPLATE_META: Array<{
  key: WaTemplateKey
  title: string
  sub: string
  icon: string
  tone: 'green' | 'gold' | 'red' | 'blue'
  statusMatch: string
}> = [
  { key: 'paid', title: 'إرسال بوليصة', sub: 'بعد الدفع وإصدار AWB', icon: '📦', tone: 'green', statusMatch: 'paid' },
  { key: 'unpaid', title: 'طلب دفع', sub: 'قبل الدفع — بانتظار التحويل', icon: '💰', tone: 'gold', statusMatch: 'unpaid' },
  { key: 'collection', title: 'مطالبة بالمتبقي', sub: 'تذكير بمبلغ متبقي — جزئية', icon: '🔔', tone: 'red', statusMatch: 'partial' },
  { key: 'payment_link', title: 'رابط دفع Paymob', sub: 'إرسال رابط الدفع الإلكتروني', icon: '💳', tone: 'blue', statusMatch: '' },
]

export const WA_TEMPLATE_VARIABLES: Array<{ token: string; label: string }> = [
  { token: '{اسم_العميل}', label: 'اسم العميل' },
  { token: '{رقم_الفاتورة}', label: 'رقم الفاتورة' },
  { token: '{المبلغ}', label: 'المبلغ الإجمالي' },
  { token: '{المدفوع}', label: 'المبلغ المدفوع' },
  { token: '{المتبقي}', label: 'المبلغ المتبقي' },
  { token: '{رقم_الشحنة}', label: 'رقم الشحنة AWB' },
  { token: '{الناقل}', label: 'الناقل' },
  { token: '{رابط_التتبع}', label: 'رابط التتبع' },
  { token: '{رابط_الدفع}', label: 'رابط الدفع' },
  { token: '{التاريخ}', label: 'التاريخ' },
]

function formatDate(d: string) {
  const date = new Date(d)
  if (Number.isNaN(date.getTime())) return d
  return date.toISOString().slice(0, 10)
}

export function defaultWaTemplates(): WaTemplates {
  return { ...WA_DEFAULT_TEMPLATES }
}

export function normalizeWaTemplates(input: unknown): WaTemplates {
  const base = defaultWaTemplates()
  if (!input || typeof input !== 'object') return base
  const obj = input as Record<string, unknown>
  const out: WaTemplates = { ...base }
  for (const k of Object.keys(base) as WaTemplateKey[]) {
    const v = obj[k]
    if (typeof v === 'string') out[k] = v
  }
  return out
}

export function readWaTemplatesCache(): WaTemplates | null {
  if (typeof localStorage === 'undefined') return null
  const raw = readJson<unknown>(storageKeys.waTemplates, localStorage)
  if (!raw) return null
  return normalizeWaTemplates(raw)
}

export function writeWaTemplatesCache(templates: WaTemplates) {
  if (typeof localStorage === 'undefined') return false
  return writeJson(storageKeys.waTemplates, templates, localStorage)
}

// ══════════════════════════════════════════
// Smart Template Selection based on invoice status
// ══════════════════════════════════════════

export function getSmartTemplateKey(inv: Invoice): WaTemplateKey {
  const status = inv.status

  if (status === 'paid') return 'paid'
  if (status === 'partial') return 'collection'
  if (status === 'unpaid') return 'unpaid'
  if (status === 'returned') return 'paid'

  return 'unpaid'
}

export function getTemplateLabel(key: WaTemplateKey): string {
  const meta = WA_TEMPLATE_META.find((m) => m.key === key)
  return meta ? `${meta.icon} ${meta.title}` : key
}

export function applyWaTemplate(
  templateKey: WaTemplateKey,
  inv: Invoice,
  templates?: Partial<WaTemplates>,
  extraVars?: Record<string, string>,
) {
  const cached = templates ? null : readWaTemplatesCache()
  const src = (
    templates?.[templateKey] ??
    cached?.[templateKey] ??
    WA_DEFAULT_TEMPLATES[templateKey] ??
    ''
  ).trim()

  let msg = src
  const trackingUrl =
    inv.awb
      ? `https://www.dhl.com/sa-en/home/tracking.html?tracking-id=${inv.awb}&submit=1`
      : ''

  const price = Number(inv.price || 0)
  const paid = Number(
    (inv as any).paid_amount ??
    inv.partialPaid ??
    inv.partial_paid ??
    0
  )
  const remaining = Number((inv as any).remaining ?? Math.max(0, price - paid))

  const vars: Record<string, string> = {
    اسم_العميل: inv.client || 'العميل',
    رقم_الفاتورة: inv.invoice_number || String(inv.id),
    المبلغ: price.toFixed(2),
    المدفوع: paid.toFixed(2),
    المتبقي: remaining.toFixed(2),
    رقم_الشحنة: inv.awb || '',
    الناقل: inv.carrier || 'DHL',
    رابط_التتبع: trackingUrl,
    رابط_الدفع: inv.paymentUrl || '',
    رابط_البوليصة: '',
    التاريخ: formatDate(inv.date),
    ...(extraVars ?? {}),
  }

  for (const [k, v] of Object.entries(vars)) {
    msg = msg.replace(new RegExp(`\\{${k}\\}`, 'g'), v || '')
  }

  // Clean up empty lines from empty variables
  msg = msg.replace(/\n{3,}/g, '\n\n').trim()

  // Remove lines that are just empty after variable replacement
  msg = msg
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim()
      // Keep the line unless it's ONLY a label with no value
      return trimmed !== '' || line === ''
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return msg
}