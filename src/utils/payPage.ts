/**
 * Helpers of the public payment page (/pay/:id).
 *
 * The e-mail check mirrors the server's (Backend isValidEmail): a well-formed
 * address only — it says nothing about whether the mailbox exists or belongs
 * to the payer. The server validates again; this only gives instant feedback.
 */

/** Surrounding spaces only — the address itself is never "corrected". */
export function normalizeReceiptEmail(value: string): string {
  return (value || '').trim()
}

export function isValidReceiptEmail(value: string): boolean {
  const v = value
  if (v.length < 6 || v.length > 254 || /\s/.test(v)) return false
  const m = /^([A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64})@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)$/.exec(v)
  if (!m) return false
  const [, local, domain] = m
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) return false
  if (domain.split('.').some((l) => !l || l.startsWith('-') || l.endsWith('-'))) return false
  if (!/^[A-Za-z]{2,}$/.test(domain.split('.').pop() || '')) return false
  if (/^(example\.(com|org|net)|test\.com|localhost)$/i.test(domain) || /(^|\.)shippec\.com$/i.test(domain)) return false
  return true
}

/**
 * Browsers built into social apps, where Apple Pay / some wallets may be
 * unavailable. Only used to show a short hint — a page cannot make the phone
 * open the link in Safari or Chrome.
 */
export function isInAppBrowser(ua: string): boolean {
  return /FBAN|FBAV|FB_IAB|Instagram|Line\/|Snapchat|TikTok|musical_ly|Twitter|LinkedInApp|GSA\//i.test(ua || '')
}
