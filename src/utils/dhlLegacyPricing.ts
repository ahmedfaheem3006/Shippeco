import {
  COUNTRIES,
  GOGREEN_RATE,
  R_QT,
  R_Z1,
  R_Z2,
  R_Z3,
  R_Z4,
  R_Z5_EXP,
  R_Z5_IMP,
  R_Z6_EXP,
  R_Z6_IMP,
  R_Z7,
} from '../legacy/dhlData'

export type LegacyService = 'domestic' | 'import' | 'export'

export type ZoneInfo = {
  zone: 'SA' | 'QT' | number
  label: string
  name: string
}

const zoneNames: Record<number, string> = {
  1: 'الخليج',
  2: 'الشرق الأوسط',
  3: 'أوروبا الأساسية',
  4: 'أمريكا',
  5: 'آسيا والمحيط الهادئ',
  6: 'أوروبا الموسعة',
  7: 'عالمي',
}

export function getZoneInfoLegacy(service: LegacyService, from: string, to: string): ZoneInfo | null {
  if (!from || !to) return null
  if (service === 'domestic') return { zone: 'SA', label: 'A', name: 'محلي' }
  const foreign = service === 'export' ? to : from
  if (foreign === 'Qatar') return { zone: 'QT', label: 'QT', name: 'قطر' }
  const c = COUNTRIES.find((x) => x.en === foreign)
  const z = c ? c.z : null
  if (!z) return null
  return { zone: z, label: String(z), name: zoneNames[z] ?? `Zone ${z}` }
}

export function lookupFromTable(w: number, table: Record<number, number>): number {
  const rounded = Math.ceil(w < 1 ? 1 : w)
  if (table[rounded] !== undefined) return table[rounded]
  const keys = Object.keys(table)
    .map(Number)
    .sort((a, b) => a - b)
  const above = keys.find((k) => k >= rounded)
  if (above !== undefined) return table[above]
  const last = keys[keys.length - 1]
  const prev = keys[keys.length - 2]
  return table[last] + (rounded - last) * ((table[last] - table[prev]) / (last - prev))
}

export function lookupRate(chargeW: number, zoneInfo: ZoneInfo, service: LegacyService): number | null {
  const z = zoneInfo.zone
  if (service === 'domestic' || z === 'SA') return lookupFromTable(chargeW, R_Z1)
  let table: Record<number, number> | undefined
  if (z === 'QT') table = R_QT
  else if (z === 1) table = R_Z1
  else if (z === 2) table = R_Z2
  else if (z === 3) table = R_Z3
  else if (z === 4) table = R_Z4
  else if (z === 5) table = service === 'export' ? R_Z5_EXP : R_Z5_IMP
  else if (z === 6) table = service === 'export' ? R_Z6_EXP : R_Z6_IMP
  else if (z === 7) table = R_Z7
  else return null
  return lookupFromTable(chargeW, table)
}

export type LegacyCalcInput = {
  service: LegacyService
  from: string
  to: string
  chargeW: number
  fuelPct: number
  profitPct: number
}

export type LegacyCalcOutput = {
  zoneInfo: ZoneInfo
  baseRate: number
  fuelAmt: number
  goGreen: number
  markup: number
  total: number
  afterFuel: number
}

export type LegacyCalcError =
  | { kind: 'missing_route' }
  | { kind: 'missing_weight' }
  | { kind: 'missing_zone' }
  | { kind: 'no_rate' }

export function computeLegacyPrice(input: LegacyCalcInput): LegacyCalcOutput | LegacyCalcError {
  const { service, from, to, chargeW } = input
  if (!from || !to) return { kind: 'missing_route' }
  if (!chargeW) return { kind: 'missing_weight' }

  const zoneInfo = getZoneInfoLegacy(service, from, to)
  if (!zoneInfo) return { kind: 'missing_zone' }

  const baseRate = lookupRate(chargeW, zoneInfo, service)
  if (baseRate === null || baseRate === undefined) return { kind: 'no_rate' }

  const fuelPct = Number.isFinite(input.fuelPct) ? input.fuelPct : 0
  const profitPct = Number.isFinite(input.profitPct) ? input.profitPct : 0

  const fuelAmt = baseRate * (fuelPct / 100)
  const goGreen = service !== 'domestic' ? chargeW * GOGREEN_RATE : 0
  const afterFuel = baseRate + fuelAmt + goGreen
  const markup = afterFuel * (profitPct / 100)
  const total = afterFuel + markup

  return { zoneInfo, baseRate, fuelAmt, goGreen, afterFuel, markup, total }
}

