export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function safeJsonParse<T>(raw: string): T | undefined {
  try {
    return JSON.parse(raw) as T
  } catch {
    return undefined
  }
}

function safeJsonStringify(value: unknown): string | undefined {
  try {
    return JSON.stringify(value)
  } catch {
    return undefined
  }
}

export function readJson<T>(
  key: string,
  storage: StorageLike,
): T | undefined {
  const raw = storage.getItem(key)
  if (!raw) return undefined
  return safeJsonParse<T>(raw)
}

export function writeJson(key: string, value: unknown, storage: StorageLike) {
  const raw = safeJsonStringify(value)
  if (!raw) return false
  try {
    storage.setItem(key, raw)
    return true
  } catch {
    return false
  }
}

export function removeKey(key: string, storage: StorageLike) {
  try {
    storage.removeItem(key)
  } catch {
    return
  }
}

export const storageKeys = {
  settings: 'shippec_settings',
  invoiceTemplate: 'shippec_template',
  users: 'shippec_users',
  session: 'shippec_session',
  invoices: 'shipco_invoices',
  daftraCache: 'shippec_daftra_cache',
  waTemplates: 'shippec_wa_templates',
  paymobHistory: 'shippec_pm_history',
  auditLog: 'erp_audit_log',
} as const
