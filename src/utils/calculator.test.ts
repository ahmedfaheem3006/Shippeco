import { describe, expect, it } from 'vitest'
import { computeTotals, toCalcPieces, type PieceInput } from './calculator'

describe('calculator', () => {
  it('toCalcPieces normalizes qty and numbers', () => {
    const pieces = toCalcPieces([{ qty: '0', weight: '1.5', l: '10', w: '0', h: '5' }])
    expect(pieces[0].qty).toBe(1)
    expect(pieces[0].weight).toBe(1.5)
    expect(pieces[0].l).toBe(10)
  })

  it('computeTotals computes actual and volumetric and chargeable', () => {
    const inputs: PieceInput[] = [
      { qty: '2', weight: '1', l: '0', w: '0', h: '0' },
      { qty: '1', weight: '1', l: '60', w: '40', h: '35' },
    ]
    const out = computeTotals(inputs)
    expect(out.actualKg).toBeGreaterThan(0)
    expect(out.volumetricKg).toBeGreaterThan(0)
    expect(out.chargeableKg).not.toBeNull()
    if (out.chargeableKg == null) throw new Error('missing chargeableKg')
    expect(out.chargeableKg).toBeGreaterThanOrEqual(out.actualKg)
  })
})

