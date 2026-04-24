const PREFIX = 'pbkdf2$sha256$'
const ITERATIONS = 100_000

function hasSubtle(): boolean {
  return typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined'
}

function toBase64(bytes: Uint8Array) {
  if (typeof btoa !== 'function') throw new Error('Base64 غير متوفر')
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

function fromBase64(b64: string) {
  if (typeof atob !== 'function') throw new Error('Base64 غير متوفر')
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function textToBytes(text: string) {
  return new TextEncoder().encode(text)
}

function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false
  const anyCrypto = crypto as unknown as { timingSafeEqual?: (x: Uint8Array, y: Uint8Array) => boolean }
  if (typeof anyCrypto.timingSafeEqual === 'function') return anyCrypto.timingSafeEqual(a, b)
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

export function isHashedPassword(value: string) {
  return String(value || '').startsWith(PREFIX)
}

export async function hashPassword(password: string, saltB64?: string) {
  const pw = String(password || '')
  if (!pw) return ''

  const salt = saltB64 ? fromBase64(saltB64) : crypto.getRandomValues(new Uint8Array(16))
  if (!hasSubtle()) throw new Error('WebCrypto غير متوفر')

  const key = await crypto.subtle.importKey('raw', textToBytes(pw), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS, salt },
    key,
    256,
  )
  const hash = new Uint8Array(bits)
  const saltOut = toBase64(salt)
  const hashOut = toBase64(hash)
  return `${PREFIX}${ITERATIONS}$${saltOut}$${hashOut}`
}

export async function verifyPassword(stored: string, input: string) {
  const s = String(stored || '').trim()
  const pw = String(input || '')
  if (!s || !pw) return false

  if (!isHashedPassword(s)) {
    return s === pw
  }

  const parts = s.split('$')
  if (parts.length !== 5) return false
  const iterStr = parts[2]
  const saltB64 = parts[3]
  const hashB64 = parts[4]
  const iter = Number(iterStr)
  if (!Number.isFinite(iter) || iter <= 0) return false

  if (!hasSubtle()) return false

  const salt = fromBase64(saltB64)
  const expected = fromBase64(hashB64)
  const key = await crypto.subtle.importKey('raw', textToBytes(pw), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', iterations: iter, salt }, key, 256)
  const actual = new Uint8Array(bits)
  return timingSafeEqualBytes(actual, expected)
}
