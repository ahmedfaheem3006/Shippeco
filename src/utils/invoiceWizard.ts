import type { Invoice, InvoiceStatus } from './models'

export type WizardMode = 'calc' | 'direct'
export type WizardStep = 0 | 1 | 2

export type InvoiceDraftInput = {
  client: string
  phone: string
  itemType: string
  carrier: string
  awb: string
  price: string
  dhlCost: string
  weight: string
  dimensions: string
  date: string
  status: InvoiceStatus
  partialPaid: string
  payment: string
  codeType: 'barcode' | 'qrcode'
  details: string
  shipperSameAsClient: boolean
  shipperName: string
  shipperPhone: string
  shipperAddress: string
  receiverName: string
  receiverPhone: string
  receiverAddress: string
  receiverCountry: string
}

export function createNewInvoiceDraftInput(todayIso: string): InvoiceDraftInput {
  return {
    client: '',
    phone: '',
    itemType: 'شحن دولي',
    carrier: 'DHL Express',
    awb: '',
    price: '',
    dhlCost: '',
    weight: '',
    dimensions: '',
    date: todayIso,
    status: 'unpaid',
    partialPaid: '',
    payment: '',
    codeType: 'barcode',
    details: '',
    shipperSameAsClient: true,
    shipperName: '',
    shipperPhone: '',
    shipperAddress: '',
    receiverName: '',
    receiverPhone: '',
    receiverAddress: '',
    receiverCountry: 'Saudi Arabia',
  }
}

export function computeBackStep(mode: WizardMode, currentStep: WizardStep): WizardStep {
  if (currentStep === 0) return 0
  if (currentStep === 1) return 0
  return mode === 'calc' ? 1 : 0
}

export function toNumberOrUndefined(value: string) {
  const n = Number(value)
  if (!Number.isFinite(n)) return undefined
  return n
}

function formatBlock(title: string, lines: Array<[string, string]>) {
  const body = lines
    .map(([k, v]) => `${k}: ${v}`)
    .filter((l) => !l.endsWith(': '))
    .join('\n')
  return body ? `\n\n${title}\n${body}` : ''
}

export function toInvoiceFromDraft(
  id: string,
  draft: InvoiceDraftInput,
  options: { forceDraft?: boolean } = {},
): Invoice {
  const price = toNumberOrUndefined(draft.price) ?? 0
  const dhlCost = toNumberOrUndefined(draft.dhlCost)
  const partialPaid = toNumberOrUndefined(draft.partialPaid)
  const weight = draft.weight ? draft.weight : undefined

  const shipperName = draft.shipperSameAsClient ? draft.client : draft.shipperName
  const shipperPhone = draft.shipperSameAsClient ? draft.phone : draft.shipperPhone

  const extraDetails =
    formatBlock('المرسل (SHIPPER)', [
      ['الاسم', shipperName.trim()],
      ['الجوال', shipperPhone.trim()],
      ['العنوان', draft.shipperAddress.trim()],
    ]) +
    formatBlock('المستلم (RECEIVER)', [
      ['الاسم', draft.receiverName.trim()],
      ['الجوال', draft.receiverPhone.trim()],
      ['العنوان', draft.receiverAddress.trim()],
      ['الدولة', draft.receiverCountry.trim()],
    ])

  const details = `${draft.details || ''}${extraDetails}`.trim() || undefined

  return {
    id,
    client: draft.client || '—',
    phone: draft.phone || undefined,
    awb: draft.awb || undefined,
    carrier: draft.carrier || undefined,
    date: draft.date || new Date().toISOString().slice(0, 10),
    status: draft.status,
    payment: draft.payment || undefined,
    price,
    partialPaid,
    dhlCost,
    weight,
    dimensions: draft.dimensions || undefined,
    itemType: draft.itemType || undefined,
    details,
    shipperName: shipperName.trim() || undefined,
    shipperPhone: shipperPhone.trim() || undefined,
    shipperAddress: draft.shipperAddress.trim() || undefined,
    receiverName: draft.receiverName.trim() || undefined,
    receiverPhone: draft.receiverPhone.trim() || undefined,
    receiverAddress: draft.receiverAddress.trim() || undefined,
    receiverCountry: draft.receiverCountry.trim() || undefined,
    codeType: draft.codeType,
    isDraft: Boolean(options.forceDraft || !draft.client || !draft.phone),
  }
}

export function toDraftFromInvoice(inv: Invoice): InvoiceDraftInput {
  return {
    client: inv.client ?? '',
    phone: inv.phone ?? '',
    itemType: inv.itemType ?? 'شحن دولي',
    carrier: inv.carrier ?? 'DHL Express',
    awb: inv.awb ?? '',
    price: String(inv.price ?? ''),
    dhlCost: inv.dhlCost !== undefined ? String(inv.dhlCost) : '',
    weight: inv.weight !== undefined ? String(inv.weight) : '',
    dimensions: inv.dimensions || '',
    date: inv.date ? String(inv.date).slice(0, 10) : new Date().toISOString().slice(0, 10),
    status: inv.status && ['paid', 'unpaid', 'partial', 'returned'].includes(inv.status) 
      ? inv.status 
      : 'unpaid',
    partialPaid: inv.partialPaid !== undefined ? String(inv.partialPaid) : '',
    payment: inv.payment ?? '',
    codeType: inv.codeType ?? 'barcode',
    details: inv.details ?? '',
    shipperSameAsClient: Boolean(!inv.shipperName && !inv.shipperPhone),
    shipperName: inv.shipperName ?? '',
    shipperPhone: inv.shipperPhone ?? '',
    shipperAddress: inv.shipperAddress ?? '',
    receiverName: inv.receiverName ?? '',
    receiverPhone: inv.receiverPhone ?? '',
    receiverAddress: inv.receiverAddress ?? '',
    receiverCountry: inv.receiverCountry ?? 'Saudi Arabia',
  }
}

