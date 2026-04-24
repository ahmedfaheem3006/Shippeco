export function safeAmountNumber(value: unknown) {
  const s = String(value ?? '').trim()
  if (!s) return null
  const n = Number(s.replace(/,/g, ''))
  if (!Number.isFinite(n)) return null
  return n
}

export function buildPaymobWaMessage(input: { name: string; amount: number; description?: string; url: string }) {
  const name = (input.name || 'عزيزي العميل').trim() || 'عزيزي العميل'
  const amount = Number.isFinite(input.amount) ? input.amount : 0
  const desc = String(input.description ?? '').trim()
  const url = String(input.url ?? '').trim()

  const lines: string[] = []
  lines.push(`مرحباً ${name} 👋`)
  lines.push('')
  lines.push('إليك رابط الدفع الآمن عبر Paymob:')
  lines.push('')
  lines.push(`💰 المبلغ: ${amount.toFixed(2)} ريال`)
  if (desc && desc !== 'خدمة شحن') lines.push(`📦 ${desc}`)
  lines.push('')
  lines.push('💳 رابط الدفع الآمن:')
  lines.push(url)
  lines.push('')
  lines.push('يمكنك الدفع بـ 💳 بطاقة ائتمانية أو مدى أو 🍎 Apple Pay')
  lines.push('شيب بيك 🚀')

  return lines.join('\n')
}

