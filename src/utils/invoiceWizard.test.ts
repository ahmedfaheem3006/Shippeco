import { describe, expect, it } from 'vitest'
import { computeBackStep, createNewInvoiceDraftInput, toInvoiceFromDraft } from './invoiceWizard'

describe('invoiceWizard helpers', () => {
  it('creates expected defaults', () => {
    const draft = createNewInvoiceDraftInput('2026-03-16')
    expect(draft.itemType).toBe('شحن دولي')
    expect(draft.carrier).toBe('DHL Express')
    expect(draft.status).toBe('unpaid')
    expect(draft.codeType).toBe('barcode')
    expect(draft.date).toBe('2026-03-16')
  })

  it('computes back step like legacy', () => {
    expect(computeBackStep('calc', 2)).toBe(1)
    expect(computeBackStep('direct', 2)).toBe(0)
    expect(computeBackStep('calc', 1)).toBe(0)
  })

  it('maps draft to invoice and marks draft when missing required fields', () => {
    const draft = createNewInvoiceDraftInput('2026-03-16')
    draft.client = ''
    draft.phone = ''
    draft.price = '10'
    const inv = toInvoiceFromDraft('1', draft)
    expect(inv.id).toBe('1')
    expect(inv.price).toBe(10)
    expect(inv.isDraft).toBe(true)
  })

  it('forces draft when requested', () => {
    const draft = createNewInvoiceDraftInput('2026-03-16')
    draft.client = 'A'
    draft.phone = '05'
    const inv = toInvoiceFromDraft('1', draft, { forceDraft: true })
    expect(inv.isDraft).toBe(true)
  })
})
