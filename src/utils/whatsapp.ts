/**
 * Smart phone number formatter
 * يكتشف الدولة تلقائياً من شكل الرقم
 */
export function normalizePhone(p: string): string {
  if (!p) return ''
  let s = String(p).trim()

  // Handle + prefix
  if (s.startsWith('+')) {
    return s.replace(/[^0-9]/g, '')
  }

  s = s.replace(/[^0-9]/g, '')
  if (!s) return ''

  // Remove 00 international prefix
  if (s.startsWith('00')) {
    return s.substring(2)
  }

  // 🇪🇬 Egypt: 01x (011, 012, 010, 015) — 11 digits
  if (/^01[0125]\d{8}$/.test(s)) {
    return '20' + s.substring(1)
  }

  // 🇸🇦 Saudi: 05x — 10 digits
  if (/^05\d{8}$/.test(s)) {
    return '966' + s.substring(1)
  }

  // 🇸🇦 Saudi: 5x — 9 digits
  if (/^5\d{8}$/.test(s)) {
    return '966' + s
  }

  // 🇪🇬 Egypt: 1x — 10 digits (without leading 0)
  if (/^1[0125]\d{8}$/.test(s)) {
    return '20' + s
  }

  // 🇦🇪 UAE: 05x — 10 digits
  if (/^05[0-9]\d{7}$/.test(s)) {
    return '971' + s.substring(1)
  }

  // 🇯🇴 Jordan: 07x — 10 digits
  if (/^07[789]\d{7}$/.test(s)) {
    return '962' + s.substring(1)
  }

  // 🇰🇼 Kuwait: 8 digits starting with 5, 6, 9
  if (/^[569]\d{7}$/.test(s) && s.length === 8) {
    return '965' + s
  }

  // 🇶🇦 Qatar: 8 digits
  if (/^[3567]\d{7}$/.test(s) && s.length === 8) {
    return '974' + s
  }

  // 🇴🇲 Oman: 8 digits
  if (/^[79]\d{7}$/.test(s) && s.length === 8) {
    return '968' + s
  }

  // 🇧🇭 Bahrain: 8 digits
  if (/^3[0-9]\d{6}$/.test(s) && s.length === 8) {
    return '973' + s
  }

  // Already has country code
  if (/^(966|20|971|965|974|973|968|962)\d{7,}$/.test(s)) {
    return s
  }

  // 11+ digits — assume already has country code
  if (s.length >= 11) {
    return s
  }

  // Fallback: assume Saudi
  if (s.startsWith('0')) return '966' + s.substring(1)
  return '966' + s
}

export function formatWAPhone(p: string): string {
  return normalizePhone(p)
}

export function openWhatsApp(phone: string, msg: string): boolean {
  const wa = formatWAPhone(phone)
  if (!wa) return false
  const url = `https://wa.me/${wa}?text=${encodeURIComponent(msg)}`
  window.open(url, '_blank', 'noopener,noreferrer')
  return true
}