// Validation + payload building for the two submission paths. Kept apart
// from journeyState.ts because it needs libphonenumber-js — this module
// (and the stages that use it) is lazily loaded, so the phone metadata is
// never part of the landing page's initial bundle.
import { parseNationalInput } from '../../../utils/phone'
import type { ContactRequestInput, WaybillRequestInput } from '../../../services/quoteRequestService'
import { buildShipmentPayload, isInternational, parseDecimal, type JourneyState, type PartyState, type PhoneState } from './journeyState'

export function validatePhone(phone: PhoneState): { e164?: string; error?: string } {
  if (!phone.raw.trim()) return { error: 'رقم الجوال مطلوب' }
  const result = parseNationalInput(phone.raw, phone.country)
  if (!result.isValid || !result.e164) return { error: 'رقم الجوال غير صحيح للدولة المختارة' }
  return { e164: result.e164 }
}

export type ContactErrors = { name?: string; phone?: string }

export function validateContact(state: JourneyState): ContactErrors {
  const errors: ContactErrors = {}
  if (state.contact.name.trim().length < 2) errors.name = 'الاسم مطلوب'
  const phone = validatePhone(state.contact.phone)
  if (phone.error) errors.phone = phone.error
  return errors
}

export function buildContactPayload(state: JourneyState, clientRequestId: string): ContactRequestInput {
  const phone = validatePhone(state.contact.phone).e164 ?? ''
  return {
    request_type: 'contact',
    name: state.contact.name.trim(),
    phone,
    origin_country: state.origin || undefined,
    destination_country: state.destination || undefined,
    service_name: state.serviceName || undefined,
    client_request_id: clientRequestId,
    ...buildShipmentPayload(state),
  }
}

export type PartyErrors = Partial<Record<'name' | 'phone' | 'address_line' | 'city', string>>
export type WaybillErrors = { sender: PartyErrors; receiver: PartyErrors; contents?: string; declaredValue?: string }

function validateParty(p: PartyState): PartyErrors {
  const e: PartyErrors = {}
  if (p.name.trim().length < 2) e.name = 'الاسم مطلوب'
  const phone = validatePhone(p.phone)
  if (phone.error) e.phone = phone.error
  if (p.address_line.trim().length < 3) e.address_line = 'العنوان مطلوب'
  if (!p.city.trim()) e.city = 'المدينة مطلوبة'
  return e
}

export function validateWaybill(state: JourneyState): WaybillErrors {
  const errors: WaybillErrors = {
    sender: validateParty(state.waybill.sender),
    receiver: validateParty(state.waybill.receiver),
  }
  if (state.waybill.contents.trim().length < 2) errors.contents = 'اذكر محتويات الشحنة'
  if (state.waybill.declaredValue.trim()) {
    const v = parseDecimal(state.waybill.declaredValue)
    if (v === null || v <= 0) errors.declaredValue = 'أدخل قيمة صحيحة أكبر من صفر'
  }
  return errors
}

export function hasWaybillErrors(e: WaybillErrors): boolean {
  return Object.keys(e.sender).length > 0 || Object.keys(e.receiver).length > 0 || !!e.contents || !!e.declaredValue
}

function partyPayload(p: PartyState) {
  return {
    name: p.name.trim(),
    phone: validatePhone(p.phone).e164 ?? '',
    address_line: p.address_line.trim(),
    city: p.city.trim(),
    postal_code: p.postal_code.trim() || undefined,
  }
}

export function buildWaybillPayload(state: JourneyState, clientRequestId: string): WaybillRequestInput {
  const international = isInternational(state)
  const value = parseDecimal(state.waybill.declaredValue)
  return {
    request_type: 'waybill',
    origin_country: state.origin,
    destination_country: state.destination,
    shipment_type: state.shipmentType ?? 'package',
    ...buildShipmentPayload(state),
    contents: state.waybill.contents.trim(),
    sender: partyPayload(state.waybill.sender),
    receiver: partyPayload(state.waybill.receiver),
    // Customs/value details only apply to international shipments.
    declared_value: international && value ? value : undefined,
    declared_currency: international && value ? state.waybill.declaredCurrency : undefined,
    customs_info: international ? state.waybill.customsInfo.trim() || undefined : undefined,
    service_name: state.serviceName || undefined,
    client_request_id: clientRequestId,
  }
}
