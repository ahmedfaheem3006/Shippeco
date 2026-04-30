import type { AuditEntry } from './models'
export type AuditEntryType = 'login' | 'create' | 'update' | 'delete' | 'import' | 'export' | 'payment_link' | 'paid' | 'sync'
const TYPES: AuditEntryType[] = ['login', 'create', 'update', 'delete', 'import', 'export', 'payment_link', 'paid', 'sync']

function isAuditType(value: unknown): value is AuditEntryType {
  return typeof value === 'string' && (TYPES as string[]).includes(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readString(v: unknown) {
  const s = typeof v === 'string' ? v : String(v ?? '')
  return s.trim()
}

function safeAt(v: unknown) {
  const s = readString(v)
  if (!s) return ''
  const d = new Date(s)
  if (!Number.isFinite(d.getTime())) return s
  return d.toISOString()
}

function safeId(v: unknown) {
  const s = readString(v)
  return s || crypto.randomUUID()
}

export type AuditTypeFilter = 'all' | AuditEntryType

export function normalizeAuditEntries(raw: unknown): AuditEntry[] {
  const list = Array.isArray(raw) ? raw : []
  const out: AuditEntry[] = []
  for (const item of list) {
    if (!isRecord(item)) continue
    const typeRaw = item.type
    const type = isAuditType(typeRaw) ? typeRaw : 'update'
    out.push({
      id: safeId(item.id),
      type,
      at: safeAt(item.at),
      user: readString(item.user) || undefined,
      note: readString(item.note) || undefined,
      meta: isRecord(item.meta) ? (item.meta as Record<string, unknown>) : undefined,
    })
  }
  out.sort((a, b) => String(b.at).localeCompare(String(a.at)))
  return out
}

export function formatAuditType(type: AuditEntryType) {
  if (type === 'login') return '🔐 تسجيل دخول'
  if (type === 'create') return '➕ إنشاء'
  if (type === 'update') return '✏️ تعديل'
  if (type === 'delete') return '🗑️ حذف'
  if (type === 'import') return '📥 استيراد'
  if (type === 'export') return '📤 تصدير'
  if (type === 'payment_link') return '💳 رابط دفع'
  if (type === 'sync') return '🔄 مزامنة'
  return '✅ سداد'
}

export function formatAtShort(atIso: string) {
  const iso = readString(atIso)
  if (!iso) return '—'
  return iso.replace('T', ' ').slice(0, 16)
}

export function filterAuditEntries(entries: AuditEntry[], query: string, type: AuditTypeFilter) {
  const q = query.trim().toLowerCase()
  return entries.filter((e) => {
    if (type !== 'all' && e.type !== type) return false
    if (!q) return true
    const hay = [e.id, e.user ?? '', e.note ?? '', e.type, JSON.stringify(e.meta ?? {})].join(' ').toLowerCase()
    return hay.includes(q)
  })
}

export function computeAuditSummary(entries: AuditEntry[]) {
  const counts: Record<AuditEntryType, number> = {
    login: 0,
    create: 0,
    update: 0,
    delete: 0,
    import: 0,
    export: 0,
    payment_link: 0,
    paid: 0,
    sync: 0,
  }
  for (const e of entries) counts[e.type] += 1
  const lastAt = entries.length ? entries[0].at : ''
  return { total: entries.length, counts, lastAt }
}

export function toAuditExportRows(entries: AuditEntry[]) {
  return entries.map((e) => ({
    at: e.at,
    at_short: formatAtShort(e.at),
    type: e.type,
    type_label: formatAuditType(e.type),
    user: e.user ?? '',
    note: e.note ?? '',
    meta: e.meta ? JSON.stringify(e.meta) : '',
    id: e.id,
  }))
}

