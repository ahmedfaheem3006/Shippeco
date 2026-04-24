import type { Invoice } from './models'

function toKey(value: unknown) {
  return String(value ?? '').trim()
}

export function normalizeInvoice(inv: Invoice): Invoice {
  return {
    ...inv,
    id: toKey(inv.id),
    codeType: inv.codeType ?? 'barcode',
    status: inv.status ?? 'unpaid',
    date: inv.date ? String(inv.date).slice(0, 10) : new Date().toISOString().slice(0, 10),
  }
}

export function mergeInvoices(dbInvoices: Invoice[], localInvoices: Invoice[]): Invoice[] {
  const normalizedDb = (dbInvoices ?? []).map(normalizeInvoice)
  const normalizedLocal = (localInvoices ?? []).map(normalizeInvoice)

  const dbById = new Map<string, Invoice>()
  for (const inv of normalizedDb) dbById.set(toKey(inv.id), inv)

  const merged: Invoice[] = []
  for (const local of normalizedLocal) {
    const id = toKey(local.id)
    const db = dbById.get(id)
    merged.push(db ?? local)
    if (db) dbById.delete(id)
  }

  for (const remaining of dbById.values()) merged.push(remaining)

  const seenIds = new Set<string>()
  const dedupById: Invoice[] = []
  for (const inv of merged) {
    const id = toKey(inv.id)
    if (!id || seenIds.has(id)) continue
    seenIds.add(id)
    dedupById.push(inv)
  }

  const seenDaftra = new Set<string>()
  const dedupByDaftra: Invoice[] = []
  for (const inv of dedupById) {
    const dId = toKey(inv.daftra_id)
    if (!dId) {
      dedupByDaftra.push(inv)
      continue
    }
    if (seenDaftra.has(dId)) continue
    seenDaftra.add(dId)
    dedupByDaftra.push(inv)
  }

  return dedupByDaftra
}
