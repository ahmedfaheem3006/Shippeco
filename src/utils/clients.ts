import type { Invoice } from './models'
import { amount, formatSar, statusLabel } from './reports'

export type ClientRow = {
  name: string
  phone: string
  count: number
  revenue: number
  paidCount: number
  unpaidCount: number
  partialCount: number
  lastDate: string
  lastInvoiceId: string
}

export type ClientInvoiceRow = {
  id: string
  date: string
  statusLabel: string
  totalText: string
  awb: string
  carrier: string
  paymentUrl: string | null
}

export function normalizeClientName(value: unknown) {
  const s = String(value ?? '').trim()
  return s ? s : 'غير محدد'
}

function isoDate(value: unknown) {
  return String(value ?? '').slice(0, 10)
}

export function computeClientRows(invoices: Invoice[]): ClientRow[] {
  const map = new Map<string, ClientRow>()
  for (const inv of invoices) {
    if (inv.isDraft) continue
    const name = normalizeClientName(inv.client)
    const cur =
      map.get(name) ??
      ({
        name,
        phone: '',
        count: 0,
        revenue: 0,
        paidCount: 0,
        unpaidCount: 0,
        partialCount: 0,
        lastDate: '',
        lastInvoiceId: '',
      } satisfies ClientRow)

    cur.count += 1
    cur.revenue += amount(inv.price)

    if (inv.status === 'paid') cur.paidCount += 1
    else if (inv.status === 'partial') cur.partialCount += 1
    else cur.unpaidCount += 1

    const d = isoDate(inv.date)
    if (d && (!cur.lastDate || d > cur.lastDate)) {
      cur.lastDate = d
      cur.lastInvoiceId = String(inv.id ?? '')
    }

    const phone = String(inv.phone ?? '').trim()
    if (phone) cur.phone = phone

    map.set(name, cur)
  }

  return [...map.values()].sort((a, b) => b.revenue - a.revenue)
}

export function filterClientRows(rows: ClientRow[], query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return rows
  return rows.filter((r) => {
    const hay = [r.name, r.phone].join(' ').toLowerCase()
    return hay.includes(q)
  })
}

export function computeClientInvoiceRows(invoices: Invoice[], clientName: string): ClientInvoiceRow[] {
  const name = normalizeClientName(clientName)
  return invoices
    .filter((inv) => !inv.isDraft && normalizeClientName(inv.client) === name)
    .sort((a, b) => isoDate(b.date).localeCompare(isoDate(a.date)))
    .map((inv) => ({
      id: String(inv.id ?? ''),
      date: isoDate(inv.date) || '—',
      statusLabel: statusLabel(inv.status),
      totalText: formatSar(amount(inv.price)),
      awb: String(inv.awb ?? '').trim() || '—',
      carrier: String(inv.carrier ?? '').trim() || '—',
      paymentUrl: inv.paymentUrl ? String(inv.paymentUrl) : null,
    }))
}

export function computeClientsSummary(rows: ClientRow[]) {
  let revenue = 0
  let invoices = 0
  let paid = 0
  let unpaid = 0
  let partial = 0
  for (const r of rows) {
    revenue += r.revenue
    invoices += r.count
    paid += r.paidCount
    unpaid += r.unpaidCount
    partial += r.partialCount
  }
  return { clients: rows.length, invoices, revenue, paid, unpaid, partial }
}

export function toClientsExportRows(rows: ClientRow[]) {
  return rows.map((r) => ({
    client: r.name === 'غير محدد' ? '' : r.name,
    phone: r.phone,
    invoices_count: String(r.count),
    paid_count: String(r.paidCount),
    unpaid_count: String(r.unpaidCount),
    partial_count: String(r.partialCount),
    revenue: r.revenue.toFixed(2),
    last_invoice_date: r.lastDate,
    last_invoice_id: r.lastInvoiceId,
  }))
}

