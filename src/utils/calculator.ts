import { computeChargeableWeightKg, computeVolumetricWeightKg, type CalcPiece } from './chargeableWeight'

export type CalcKind = 'economy' | 'local' | 'import' | 'export'

export type PieceInput = {
  qty: string
  weight: string
  l: string
  w: string
  h: string
}

function n(value: string) {
  const v = Number(String(value ?? '').replace(/,/g, '').trim())
  return Number.isFinite(v) ? v : 0
}

export function toCalcPieces(inputs: readonly PieceInput[]): CalcPiece[] {
  return inputs.map((p) => ({
    qty: Math.max(1, Math.floor(n(p.qty) || 1)),
    weight: Math.max(0, n(p.weight)),
    l: Math.max(0, n(p.l)),
    w: Math.max(0, n(p.w)),
    h: Math.max(0, n(p.h)),
  }))
}

export function computeTotals(inputs: readonly PieceInput[]) {
  const pieces = toCalcPieces(inputs)
  const actualKg = pieces.reduce((s, p) => s + (p.weight > 0 ? p.weight * p.qty : 0), 0)
  const volumetricKg = pieces.reduce((s, p) => {
    const vw = computeVolumetricWeightKg(p, 'metric')
    return s + (vw > 0 ? vw * p.qty : 0)
  }, 0)
  const chargeableKg = computeChargeableWeightKg(pieces, 'metric')
  return { pieces, actualKg, volumetricKg, chargeableKg }
}

