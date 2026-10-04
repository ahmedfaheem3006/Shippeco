import { describe, expect, it } from 'vitest'
import { extractSheetShipments, findColumn, parseAmount } from './reconcileSheet'

describe('reconcile sheet reading', () => {
  it('does not let a short key like "To" grab the "Total" column (regression)', () => {
    expect(findColumn(['AWB', 'Total Charge', 'Weight'], ['Destination', 'Dest', 'To'])).toBeNull()
    expect(findColumn(['AWB', 'Total Charge'], ['Total Charge', 'Total'])).toBe('Total Charge')
    expect(findColumn(['رقم البوليصة', 'الإجمالي'], ['AWB', 'رقم البوليصة'])).toBe('رقم البوليصة')
  })

  it('keeps leading zeros from the displayed text and reads amounts exactly', () => {
    const raw = [{ AWB: 12345678, 'Total Charge': '1,234.50', Weight: 2 }]
    const text = [{ AWB: '0012345678', 'Total Charge': '1,234.50', Weight: '2' }]
    const { shipments, skipped } = extractSheetShipments(raw, text)
    expect(skipped).toEqual([])
    expect(shipments[0]).toMatchObject({ airwaybill_number: '0012345678', total_charge: 1234.5, weight_kg: 2 })
  })

  it('reports unusable rows instead of turning them into 0', () => {
    const rows = [
      { AWB: '1000000001', Total: '10' },
      { AWB: '', Total: '5' },
      { AWB: '1000000002', Total: 'n/a' },
      { AWB: '', Total: '' },
    ]
    const { shipments, skipped } = extractSheetShipments(rows)
    expect(shipments.map((s) => s.airwaybill_number)).toEqual(['1000000001'])
    expect(skipped).toEqual([
      { row: 3, reason: 'رقم البوليصة فارغ' },
      { row: 4, reason: 'مبلغ غير صالح للبوليصة 1000000002' },
    ])
  })

  it('refuses a sheet without an amount column', () => {
    expect(() => extractSheetShipments([{ AWB: '1', Weight: '2' }])).toThrow(/الإجمالي|المبلغ/)
  })

  it('parses amounts strictly', () => {
    expect(parseAmount('SAR 12.30')).toBe(12.3)
    expect(parseAmount('12,000')).toBe(12000)
    expect(parseAmount('12a')).toBeNull()
    expect(parseAmount('')).toBeNull()
  })
})
