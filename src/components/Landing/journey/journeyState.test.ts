import { describe, it, expect } from 'vitest'
import {
  buildShipmentPayload,
  hasDetailsErrors,
  initialJourneyState,
  newPackageRow,
  parseDecimal,
  validateDetails,
  type JourneyState,
} from './journeyState'
import { buildContactPayload, buildWaybillPayload, hasWaybillErrors, validateContact, validateWaybill } from './journeyPhone'

function withPackages(rows: Array<Partial<ReturnType<typeof newPackageRow>>>): JourneyState {
  const s = initialJourneyState()
  return {
    ...s,
    origin: 'SA',
    destination: 'EG',
    shipmentType: 'package',
    packages: rows.map((r) => ({ ...newPackageRow(), ...r })),
  }
}

describe('parseDecimal', () => {
  it('parses Western, Arabic-Indic and comma/Arabic decimal separators', () => {
    expect(parseDecimal('2.5')).toBe(2.5)
    expect(parseDecimal('٢٫٥')).toBe(2.5)
    expect(parseDecimal('3,75')).toBe(3.75)
    expect(parseDecimal('')).toBeNull()
    expect(parseDecimal('abc')).toBeNull()
  })
})

describe('validateDetails', () => {
  it('requires a positive weight and all dimensions for each package', () => {
    const errors = validateDetails(withPackages([{ weight: '0', length: '40', width: '', height: '20' }]))
    expect(hasDetailsErrors(errors)).toBe(true)
    const row = Object.values(errors.packages)[0]
    expect(row.weight).toBeTruthy()
    expect(row.width).toBeTruthy()
    expect(row.length).toBeUndefined()
  })

  it('passes for complete positive values', () => {
    expect(hasDetailsErrors(validateDetails(withPackages([{ weight: '3', length: '40', width: '30', height: '20' }])))).toBe(false)
  })

  it('rejects values above the sanity limits', () => {
    const errors = validateDetails(withPackages([{ weight: '5000', length: '40', width: '30', height: '20' }]))
    expect(hasDetailsErrors(errors)).toBe(true)
  })

  it('documents need only a weight (no dimensions)', () => {
    const s: JourneyState = { ...initialJourneyState(), shipmentType: 'document', documentWeight: '0.5' }
    expect(hasDetailsErrors(validateDetails(s))).toBe(false)
    expect(hasDetailsErrors(validateDetails({ ...s, documentWeight: '' }))).toBe(true)
  })
})

describe('buildShipmentPayload', () => {
  it('sends every package with numeric weight/dimensions', () => {
    const payload = buildShipmentPayload(
      withPackages([
        { weight: '3', length: '40', width: '30', height: '20' },
        { weight: '1.5', length: '10', width: '10', height: '10' },
      ])
    )
    expect(payload).toEqual({
      shipment_type: 'package',
      packages: [
        { weight_kg: 3, length_cm: 40, width_cm: 30, height_cm: 20 },
        { weight_kg: 1.5, length_cm: 10, width_cm: 10, height_cm: 10 },
      ],
    })
  })

  it('switching to "document" keeps package rows in state but never sends them', () => {
    const s = withPackages([{ weight: '3', length: '40', width: '30', height: '20' }])
    const asDocument: JourneyState = { ...s, shipmentType: 'document', documentWeight: '0.4' }
    expect(asDocument.packages).toHaveLength(1)
    expect(buildShipmentPayload(asDocument)).toEqual({ shipment_type: 'document', packages: [{ weight_kg: 0.4 }] })
  })

  it('never sends placeholder zero/default values', () => {
    const s: JourneyState = { ...initialJourneyState(), shipmentType: 'document', documentWeight: '' }
    expect(buildShipmentPayload(s)).toEqual({ shipment_type: 'document', packages: undefined })
  })
})

describe('contact path', () => {
  it('needs only a name and a valid phone — no route or measurements', () => {
    const s = initialJourneyState()
    expect(validateContact(s)).toEqual({ name: 'الاسم مطلوب', phone: 'رقم الجوال مطلوب' })
    const filled: JourneyState = { ...s, contact: { name: 'سارة', phone: { country: 'SA', raw: '0501234567' } } }
    expect(validateContact(filled)).toEqual({})
    const payload = buildContactPayload(filled, 'req-12345678')
    expect(payload).toMatchObject({ request_type: 'contact', name: 'سارة', phone: '+966501234567', client_request_id: 'req-12345678' })
    expect(payload.origin_country).toBeUndefined()
  })

  it('carries along any route/shipment details already entered, plus the chosen service', () => {
    const s: JourneyState = {
      ...withPackages([{ weight: '3', length: '40', width: '30', height: '20' }]),
      serviceName: 'خدمات التخزين',
      contact: { name: 'سارة', phone: { country: 'EG', raw: '01012345678' } },
    }
    expect(buildContactPayload(s, 'req-12345678')).toMatchObject({
      origin_country: 'SA',
      destination_country: 'EG',
      shipment_type: 'package',
      service_name: 'خدمات التخزين',
      phone: '+201012345678',
    })
  })
})

describe('waybill path', () => {
  const party = (phone: string, country: 'SA' | 'EG') => ({
    name: 'أحمد',
    phone: { country, raw: phone },
    address_line: 'شارع 10',
    city: 'الدمام',
    postal_code: '',
  })

  it('requires sender/receiver details and contents', () => {
    const errors = validateWaybill(initialJourneyState())
    expect(hasWaybillErrors(errors)).toBe(true)
    expect(errors.sender.phone).toBeTruthy()
    expect(errors.contents).toBeTruthy()
  })

  it('builds a payload with E.164 phones, and customs/value only for international shipments', () => {
    const base = withPackages([{ weight: '3', length: '40', width: '30', height: '20' }])
    const s: JourneyState = {
      ...base,
      waybill: {
        sender: party('0501234567', 'SA'),
        receiver: party('01012345678', 'EG'),
        contents: 'ملابس',
        declaredValue: '500',
        declaredCurrency: 'SAR',
        customsInfo: 'هدايا شخصية',
      },
    }
    expect(hasWaybillErrors(validateWaybill(s))).toBe(false)
    const payload = buildWaybillPayload(s, 'req-12345678')
    expect(payload.sender.phone).toBe('+966501234567')
    expect(payload.receiver.phone).toBe('+201012345678')
    expect(payload.declared_value).toBe(500)
    expect(payload.customs_info).toBe('هدايا شخصية')

    const domestic = buildWaybillPayload({ ...s, destination: 'SA' }, 'req-12345678')
    expect(domestic.declared_value).toBeUndefined()
    expect(domestic.customs_info).toBeUndefined()
  })
})
