/**
 * Reads DHL shipments from an uploaded Excel/CSV sheet (Excel/CSV tab of
 * «مطابقة الفواتير»). Matching and comparison happen on the server; this
 * only maps columns and reports rows it could not use — nothing is silently
 * turned into 0.
 */

export type SheetShipment = {
  airwaybill_number: string
  total_charge: number
  weight_kg?: number
  shipment_date?: string
  origin_airport?: string
  destination_code?: string
  service_type?: string
  fuel_surcharge?: number
  vat_amount?: number
}

export type SkippedRow = { row: number; reason: string }

const COLUMNS = {
  awb: ['Waybill No', 'Waybill', 'AWB', 'AWB No', 'AWB Number', 'Airway Bill', 'Airwaybill', 'Shipment No', 'Shipment Number', 'HAWB', 'رقم البوليصة', 'رقم الشحنة', 'رقم بوليصة الشحن'],
  total: ['Total Charge', 'Total Amount', 'Grand Total', 'Net Charge', 'Invoice Amount', 'Billed Amount', 'Total', 'Amount', 'Charge', 'الإجمالي', 'إجمالي الرسوم'],
  weight: ['Chargeable Weight', 'Billed Weight', 'Actual Weight', 'Weight (KG)', 'Weight KG', 'Weight', 'الوزن', 'وزن الشحنة'],
  date: ['Shipment Date', 'Ship Date', 'Invoice Date', 'Date', 'تاريخ الشحن', 'التاريخ'],
  dest: ['Destination Code', 'Destination Country', 'Destination', 'Dest', 'الوجهة', 'وجهة'],
  origin: ['Origin Country', 'Origin', 'المنشأ', 'منشأ'],
  service: ['Service Type', 'Product Name', 'Service', 'Product', 'نوع الخدمة'],
  fuel: ['Fuel Surcharge', 'رسوم الوقود'],
  vat: ['Value Added Tax', 'VAT', 'Tax', 'ضريبة القيمة المضافة', 'ضريبة'],
} as const

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

/**
 * Exact header match first; then "header contains candidate" for candidates
 * of 4+ letters only (the old matcher let "To" match "Total").
 */
export function findColumn(headers: string[], candidates: readonly string[]): string | null {
  for (const c of candidates) {
    const hit = headers.find((h) => norm(h) === norm(c))
    if (hit) return hit
  }
  for (const c of candidates) {
    if (norm(c).length < 4) continue
    const hit = headers.find((h) => norm(h).includes(norm(c)))
    if (hit) return hit
  }
  return null
}

/** "1,234.50" / " 12 " → number; anything else → null (never 0 by default). */
export function parseAmount(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = String(v ?? '').replace(/[,\s]/g, '').replace(/^SAR|ر\.?س$/i, '')
  if (!s) return null
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null
}

function toIsoDate(v: unknown): string {
  if (v instanceof Date && Number.isFinite(v.getTime())) return v.toISOString().slice(0, 10)
  const s = String(v ?? '').trim()
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : s
}

/**
 * rawRows: cell values (numbers, dates) — for amounts/dates.
 * textRows: the same rows as displayed text — for identifiers, so an AWB
 *           stored as a number keeps its leading zeros.
 */
export function extractSheetShipments(rawRows: Record<string, unknown>[], textRows: Record<string, unknown>[] = rawRows) {
  if (!rawRows.length) throw new Error('الملف فارغ أو لا يحتوي على بيانات')
  const headers = Object.keys(rawRows[0])
  const col = Object.fromEntries(Object.entries(COLUMNS).map(([k, c]) => [k, findColumn(headers, c)])) as Record<keyof typeof COLUMNS, string | null>
  if (!col.awb) throw new Error('تعذّر إيجاد عمود رقم البوليصة في الملف (مثل AWB أو Waybill)')
  if (!col.total) throw new Error('تعذّر إيجاد عمود إجمالي المبلغ في الملف (مثل Total Charge)')

  const shipments: SheetShipment[] = []
  const skipped: SkippedRow[] = []
  rawRows.forEach((raw, i) => {
    const text = textRows[i] ?? raw
    const rowNo = i + 2 // header is row 1
    const awb = String(text[col.awb!] ?? raw[col.awb!] ?? '').trim().replace(/\s+/g, '')
    const values = Object.values(raw).map((v) => String(v ?? '').trim())
    if (!values.some(Boolean)) return // blank line
    if (!awb || /^0+$/.test(awb)) { skipped.push({ row: rowNo, reason: 'رقم البوليصة فارغ' }); return }
    const total = parseAmount(raw[col.total!])
    if (total === null || total < 0) { skipped.push({ row: rowNo, reason: `مبلغ غير صالح للبوليصة ${awb}` }); return }
    const opt = (key: keyof typeof COLUMNS) => (col[key] ? parseAmount(raw[col[key]!]) ?? undefined : undefined)
    const str = (key: keyof typeof COLUMNS) => (col[key] ? String(text[col[key]!] ?? '').trim() || undefined : undefined)
    shipments.push({
      airwaybill_number: awb,
      total_charge: total,
      weight_kg: opt('weight'),
      shipment_date: col.date ? toIsoDate(raw[col.date]) || undefined : undefined,
      origin_airport: str('origin'),
      destination_code: str('dest'),
      service_type: str('service'),
      fuel_surcharge: opt('fuel'),
      vat_amount: opt('vat'),
    })
  })
  return { shipments, skipped, columns: col }
}

/** SHA-256 of the file bytes (hex) — lets the server spot a re-upload. */
export async function fileSha256(file: Blob): Promise<string | null> {
  try {
    const buf = await file.arrayBuffer()
    const digest = await crypto.subtle.digest('SHA-256', buf)
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
  } catch {
    return null
  }
}
