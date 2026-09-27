// Pure state, validation and payload-building for the shipping journey —
// no React, so it's unit-testable and the components stay presentational.
import type { CountryCode } from 'libphonenumber-js'
import { toWesternDigits } from '../../../utils/countries'
import type { ShipmentPackage } from '../../../services/quoteRequestService'

export type Stage = 'route' | 'details' | 'path' | 'contact' | 'waybill' | 'review'
export type ShipmentType = 'document' | 'package'

export type PackageRow = { id: string; weight: string; length: string; width: string; height: string }

export type PhoneState = { country: CountryCode; raw: string }

export type PartyState = {
  name: string
  phone: PhoneState
  address_line: string
  city: string
  postal_code: string
}

export type JourneyState = {
  stage: Stage
  origin: string
  destination: string
  shipmentType: ShipmentType | null
  documentWeight: string
  packages: PackageRow[]
  serviceName: string
  contact: { name: string; phone: PhoneState }
  waybill: {
    sender: PartyState
    receiver: PartyState
    contents: string
    declaredValue: string
    declaredCurrency: string
    customsInfo: string
  }
}

// Business limits here are only sanity bounds matching the Backend
// validator (1000 kg / 1000 cm) — not a claim about any carrier's limits.
export const MAX_WEIGHT_KG = 1000
export const MAX_DIMENSION_CM = 1000
export const MAX_PACKAGES = 20

let packageSeq = 0
export function newPackageRow(): PackageRow {
  packageSeq += 1
  return { id: `pkg-${packageSeq}`, weight: '', length: '', width: '', height: '' }
}

const emptyParty = (country: CountryCode): PartyState => ({
  name: '',
  phone: { country, raw: '' },
  address_line: '',
  city: '',
  postal_code: '',
})

export function initialJourneyState(): JourneyState {
  return {
    stage: 'route',
    origin: '',
    destination: '',
    shipmentType: null,
    documentWeight: '',
    packages: [],
    serviceName: '',
    contact: { name: '', phone: { country: 'SA', raw: '' } },
    waybill: {
      sender: emptyParty('SA'),
      receiver: emptyParty('SA'),
      contents: '',
      declaredValue: '',
      declaredCurrency: 'SAR',
      customsInfo: '',
    },
  }
}

/** Parses a visitor-typed decimal (Arabic digits and "٫"/"," accepted). */
export function parseDecimal(raw: string): number | null {
  const s = toWesternDigits(raw).replace('٫', '.').replace(',', '.').trim()
  if (!s || !/^\d*\.?\d+$/.test(s)) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function positiveWithin(raw: string, max: number, label: string): string | undefined {
  const n = parseDecimal(raw)
  if (n === null) return `أدخل ${label} بالأرقام`
  if (n <= 0) return `${label} يجب أن يكون أكبر من صفر`
  if (n > max) return `${label} أكبر من الحد المسموح (${max})`
  return undefined
}

export type DetailsErrors = {
  documentWeight?: string
  packages: Record<string, Partial<Record<'weight' | 'length' | 'width' | 'height', string>>>
}

export function validateDetails(state: JourneyState): DetailsErrors {
  const errors: DetailsErrors = { packages: {} }
  if (state.shipmentType === 'document') {
    errors.documentWeight = positiveWithin(state.documentWeight, MAX_WEIGHT_KG, 'الوزن')
  } else if (state.shipmentType === 'package') {
    for (const p of state.packages) {
      const rowErrors = {
        weight: positiveWithin(p.weight, MAX_WEIGHT_KG, 'الوزن'),
        length: positiveWithin(p.length, MAX_DIMENSION_CM, 'الطول'),
        width: positiveWithin(p.width, MAX_DIMENSION_CM, 'العرض'),
        height: positiveWithin(p.height, MAX_DIMENSION_CM, 'الارتفاع'),
      }
      if (Object.values(rowErrors).some(Boolean)) errors.packages[p.id] = rowErrors
    }
  }
  return errors
}

export function hasDetailsErrors(e: DetailsErrors): boolean {
  return !!e.documentWeight || Object.keys(e.packages).length > 0
}

/** Only the fields that apply to the CURRENT shipment type are sent —
 *  switching from "package" to "document" keeps the typed package rows in
 *  state (in case the visitor switches back) but never submits them. */
export function buildShipmentPayload(state: JourneyState): { shipment_type?: ShipmentType; packages?: ShipmentPackage[] } {
  if (state.shipmentType === 'document') {
    const w = parseDecimal(state.documentWeight)
    return { shipment_type: 'document', packages: w && w > 0 ? [{ weight_kg: w }] : undefined }
  }
  if (state.shipmentType === 'package') {
    const packages = state.packages.flatMap((p): ShipmentPackage[] => {
      const weight = parseDecimal(p.weight)
      if (weight === null || weight <= 0) return []
      return [{
        weight_kg: weight,
        length_cm: parseDecimal(p.length) ?? undefined,
        width_cm: parseDecimal(p.width) ?? undefined,
        height_cm: parseDecimal(p.height) ?? undefined,
      }]
    })
    return { shipment_type: 'package', packages: packages.length ? packages : undefined }
  }
  return {}
}

export function isInternational(state: JourneyState): boolean {
  return !!state.origin && !!state.destination && state.origin !== state.destination
}
