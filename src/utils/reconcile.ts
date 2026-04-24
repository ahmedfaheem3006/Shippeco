import type { Invoice } from './models'

export type ReconcileStatus = 'matched' | 'discrepancy' | 'not_found_in_platform'

export type DhlData = {
  airwaybill_number: string
  shipment_date: string
  origin_airport: string
  destination_code: string
  service_type: string
  weight_kg: number
  standard_charge: number
  fuel_surcharge: number
  gogreen_charge: number
  vat_amount: number
  total_charge: number
}

export type PlatformData = {
  invoice_no: string
  client_name: string
  phone?: string
  date: string
  summary_subtotal: number
  summary_total: number
  summary_paid: number
  summary_unpaid: number
  payment_status: string
  created_by: string
  weight_kg: null
}

export type Discrepancy = {
  field_name_ar: string
  dhl_value: string
  platform_value: string
  difference: number
}

export type ReconcileRow = {
  airwaybill_number: string
  status: ReconcileStatus
  dhl_data: DhlData
  platform_data: PlatformData | null
  total_dhl_amount: number
  total_platform_amount: number | null
  total_financial_difference: number | null
  profit_margin_pct: number | null
  discrepancies: Discrepancy[]
}

export type ReconcileReport = {
  filename: string
  total_shipments: number
  matched: number
  with_discrepancies: number
  not_found: number
  total_dhl_amount: number
  total_platform_amount: number
  total_difference: number
  results: ReconcileRow[]
}

export type DhlShipmentRow = {
  awb: string
  total_charge: number
  weight_kg: number
  shipment_date: string
  destination: string
  origin: string
  service_type: string
  fuel_surcharge: number
  vat_amount: number
}

export function normalizeAwb(value: unknown) {
  return String(value || '')
    .trim()
    .replace(/[\s-]/g, '')
    .toUpperCase()
}

function paymentStatus(inv: Invoice) {
  if (inv.status === 'paid') return 'مدفوع'
  if (inv.status === 'partial') return 'مدفوع جزئياً'
  return 'غير مدفوع'
}

export function buildReconcileReport(
  opts: {
    filename: string
    shipments: DhlShipmentRow[]
    invoices: Invoice[]
    discrepancyThreshold?: number
  },
): ReconcileReport {
  const threshold = opts.discrepancyThreshold ?? 0.5
  const invMap = new Map<string, Invoice>()
  for (const inv of opts.invoices) {
    const key = normalizeAwb(inv.awb)
    if (key) invMap.set(key, inv)
  }

  let totalDhl = 0
  let totalPlatform = 0
  let matched = 0
  let withDisc = 0
  let notFound = 0

  const results: ReconcileRow[] = opts.shipments.map((dhl) => {
    const awbNorm = normalizeAwb(dhl.awb)
    const inv = invMap.get(awbNorm) ?? null
    totalDhl += dhl.total_charge

    const dhl_data: DhlData = {
      airwaybill_number: dhl.awb,
      shipment_date: dhl.shipment_date || '—',
      origin_airport: dhl.origin || '—',
      destination_code: dhl.destination || '—',
      service_type: dhl.service_type || '—',
      weight_kg: dhl.weight_kg || 0,
      standard_charge: dhl.total_charge - dhl.fuel_surcharge - dhl.vat_amount,
      fuel_surcharge: dhl.fuel_surcharge || 0,
      gogreen_charge: 0,
      vat_amount: dhl.vat_amount || 0,
      total_charge: dhl.total_charge || 0,
    }

    if (!inv) {
      notFound++
      return {
        airwaybill_number: dhl.awb,
        status: 'not_found_in_platform',
        dhl_data,
        platform_data: null,
        total_dhl_amount: dhl.total_charge,
        total_platform_amount: null,
        total_financial_difference: null,
        profit_margin_pct: null,
        discrepancies: [],
      }
    }

    const platformTotal = Number(inv.price || 0)
    totalPlatform += platformTotal

    const diff = platformTotal - dhl.total_charge
    const profitMargin = dhl.total_charge > 0 ? (diff / dhl.total_charge) * 100 : null

    const platform_data: PlatformData = {
      invoice_no: String(inv.id),
      client_name: inv.client,
      phone: inv.phone,
      date: inv.date,
      summary_subtotal: platformTotal / 1.15,
      summary_total: platformTotal,
      summary_paid:
        inv.status === 'paid' ? platformTotal : inv.status === 'partial' ? Number(inv.partialPaid || 0) : 0,
      summary_unpaid:
        inv.status === 'paid'
          ? 0
          : inv.status === 'partial'
            ? Math.max(0, platformTotal - Number(inv.partialPaid || 0))
            : platformTotal,
      payment_status: paymentStatus(inv),
      created_by: inv.created_by || '—',
      weight_kg: null,
    }

    const discrepancies: Discrepancy[] = []
    const priceDiff = Math.round((platformTotal - dhl.total_charge) * 100) / 100
    if (Math.abs(priceDiff) > threshold) {
      discrepancies.push({
        field_name_ar: 'إجمالي المبلغ',
        dhl_value: `${dhl.total_charge.toFixed(2)} ﷼`,
        platform_value: `${platformTotal.toFixed(2)} ﷼`,
        difference: priceDiff,
      })
    }

    const status: ReconcileStatus = discrepancies.length ? 'discrepancy' : 'matched'
    if (status === 'matched') matched++
    else withDisc++

    return {
      airwaybill_number: dhl.awb,
      status,
      dhl_data,
      platform_data,
      total_dhl_amount: dhl.total_charge,
      total_platform_amount: platformTotal,
      total_financial_difference: diff,
      profit_margin_pct: profitMargin,
      discrepancies,
    }
  })

  return {
    filename: opts.filename,
    total_shipments: opts.shipments.length,
    matched,
    with_discrepancies: withDisc,
    not_found: notFound,
    total_dhl_amount: totalDhl,
    total_platform_amount: totalPlatform,
    total_difference: totalPlatform - totalDhl,
    results,
  }
}

export type ReconcileFilter = 'all' | 'matched' | 'discrepancy' | 'not_found'

export function filterReconcileRows(report: ReconcileReport, filter: ReconcileFilter) {
  if (filter === 'all') return report.results
  if (filter === 'not_found') return report.results.filter((r) => r.status === 'not_found_in_platform')
  return report.results.filter((r) => r.status === filter)
}

export function formatCurrency(n: number | null | undefined) {
  if (n === null || n === undefined) return '—'
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' SAR'
}

export function isoDate(value: unknown) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0, 10)
  const s = String(value ?? '').trim()
  return s ? s.slice(0, 10) : '—'
}
