import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import {
  DAILY_VALUE_LABEL, DAILY_VALUE_MAX, DAILY_WEIGHT_LABEL, DAILY_WEIGHT_MAX,
  dailyDecimalError, dailyDecimalInput, formatDailyValue, formatDailyWeight, parseDailyDecimal, readDailyDecimal,
} from './dailyReport'
import { carrierCostLabel, carrierCostOf } from './carrierCost'
import { createNewInvoiceDraftInput, toDraftFromInvoice, toInvoiceFromDraft } from './invoiceWizard'
import type { Invoice } from './models'

afterEach(() => cleanup())

describe('daily-report fields', () => {
  it('validates like the server: empty ok, numbers ≥ 0 with ≤ 2 decimals', () => {
    const v = (x: string) => dailyDecimalError(x, DAILY_VALUE_LABEL, DAILY_VALUE_MAX)
    expect([v(''), v('  '), v('0'), v('275.50'), v('7.5')]).toEqual([null, null, null, null, null])
    expect(v('abc')).toBe('القيمة بالتقرير اليومي: أدخل رقمًا صحيحًا')
    expect(v('-1')).toMatch(/أدخل رقمًا صحيحًا/)
    expect(v('1.234')).toMatch(/منزلتان عشريتان/)
    expect(v('Infinity')).toMatch(/أدخل رقمًا صحيحًا/)
    expect(dailyDecimalError('100001', DAILY_WEIGHT_LABEL, DAILY_WEIGHT_MAX)).toMatch(/أكبر من المسموح/)
  })

  it('empty means NULL, never 0; display uses — for NULL', () => {
    expect(parseDailyDecimal('')).toBeNull()
    expect(parseDailyDecimal('275.50')).toBe(275.5)
    expect(readDailyDecimal('7.25')).toBe(7.25)
    expect(readDailyDecimal(null)).toBeNull()
    expect(dailyDecimalInput('275.5')).toBe('275.50')
    expect(dailyDecimalInput(null)).toBe('')
    expect(formatDailyValue('275.50')).toBe('275.50 ر.س')
    expect(formatDailyWeight(7.25)).toBe('7.25 كجم')
    expect(formatDailyWeight(7)).toBe('7.00 كجم')
    expect(formatDailyValue(null)).toBe('—')
    expect(formatDailyWeight(undefined)).toBe('—')
    expect(formatDailyValue(0)).toBe('0.00 ر.س') // a real zero stays a zero
  })

  it('edit form round trip: invoice → form → payload keeps the values (and NULLs)', () => {
    const inv = { id: '1', client: 'A', price: 275, date: '2026-09-15', status: 'unpaid', daily_report_value: 275.5, daily_report_weight: 7.25 } as Invoice
    const draft = toDraftFromInvoice(inv)
    expect([draft.dailyReportValue, draft.dailyReportWeight]).toEqual(['275.50', '7.25'])
    const out = toInvoiceFromDraft('1', draft)
    expect([out.daily_report_value, out.daily_report_weight]).toEqual([275.5, 7.25])
    const empty = toInvoiceFromDraft('2', createNewInvoiceDraftInput('2026-09-15'))
    expect([empty.daily_report_value, empty.daily_report_weight]).toEqual([null, null])
    // the daily figures never change price or cost
    const withoutDaily = toInvoiceFromDraft('1', { ...draft, dailyReportValue: '', dailyReportWeight: '' })
    expect([out.price, out.dhlCost]).toEqual([withoutDaily.price, withoutDaily.dhlCost])
  })
})

describe('carrier cost label (invoices.dhl_cost)', () => {
  it('"170.91 ر.س", or "بدون تكلفة" for NULL / 0 (the no_cost rule)', () => {
    expect(carrierCostLabel(170.91)).toBe('170.91 ر.س')
    expect(carrierCostLabel('190.5')).toBe('190.50 ر.س')
    expect(carrierCostLabel(null)).toBe('بدون تكلفة')
    expect(carrierCostLabel(0)).toBe('بدون تكلفة')
    expect(carrierCostOf(undefined)).toBeNull()
  })
})

// ── Edit form: inputs, inline validation, save disabled while invalid ──
describe('InvoiceWizardModal daily-report inputs', () => {
  it('shows the two fields, blocks save on invalid input and sends the typed values', async () => {
    const { InvoiceWizardModal } = await import('../components/Invoices/InvoiceWizardModal')
    const onSave = vi.fn()
    const draft = { ...createNewInvoiceDraftInput('2026-09-15'), client: 'عميل', phone: '0551234567', price: '275', dhlCost: '170.91' }
    render(<InvoiceWizardModal open onClose={() => undefined} onSave={onSave} initialDraft={draft} initialStep={2} title="تعديل الفاتورة #1" />)
    const value = screen.getByLabelText('القيمة بالتقرير اليومي (ر.س)')
    const weight = screen.getByLabelText('الوزن بالتقرير اليومي (كجم)')
    const save = screen.getByRole('button', { name: /إصدار الفاتورة النهائية/ })

    fireEvent.change(value, { target: { value: 'abc' } })
    expect(screen.getByRole('alert')).toHaveTextContent('القيمة بالتقرير اليومي: أدخل رقمًا صحيحًا')
    expect(save).toBeDisabled()
    fireEvent.change(value, { target: { value: '275.50' } })
    fireEvent.change(weight, { target: { value: '-2' } })
    expect(save).toBeDisabled()
    fireEvent.change(weight, { target: { value: '7.25' } })
    await waitFor(() => expect(save).toBeEnabled())
    fireEvent.click(save)
    const sent = onSave.mock.calls[0][0]
    expect([sent.dailyReportValue, sent.dailyReportWeight]).toEqual(['275.50', '7.25'])
    expect(toInvoiceFromDraft('1', sent)).toMatchObject({ daily_report_value: 275.5, daily_report_weight: 7.25, dhlCost: 170.91 })
  }, 60_000)
})
