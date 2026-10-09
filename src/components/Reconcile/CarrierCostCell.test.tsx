import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CarrierCostCell } from './CarrierCostCell'
import { formatSar } from '../../utils/carrierCost'
import type { CostAction } from '../../services/reconcileService'

afterEach(() => cleanup())

const action = (over: Partial<CostAction> = {}): CostAction => ({
  state: 'pending', reason: null, amount: 154.9, candidates: [], can_apply: true, can_reject: true, invoice_id: 12225,
  current_cost: 140, decided_at: null, decided_by_name: null, previous_cost: null, applied_cost: null, ...over,
})
const noop = () => undefined

describe('CarrierCostCell', () => {
  it('pending: amount with ✓ and ✕ (visible buttons, not hover-only)', () => {
    const onApply = vi.fn(); const onReject = vi.fn()
    render(<CarrierCostCell action={action()} busy={null} onApply={onApply} onReject={onReject} />)
    expect(screen.getByText('154.90 ر.س')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /اعتماد تكلفة الناقل 154.90/ }))
    fireEvent.click(screen.getByRole('button', { name: /تجاهل القيمة/ }))
    expect(onApply).toHaveBeenCalledTimes(1)
    expect(onReject).toHaveBeenCalledTimes(1)
  })

  it('applying: both buttons disabled so a double click cannot send twice', () => {
    const onApply = vi.fn()
    render(<CarrierCostCell action={action()} busy="apply" onApply={onApply} onReject={noop} />)
    const ok = screen.getByRole('button', { name: /اعتماد/ })
    expect(ok).toBeDisabled()
    expect(screen.getByRole('button', { name: /تجاهل/ })).toBeDisabled()
    fireEvent.click(ok)
    expect(onApply).not.toHaveBeenCalled()
  })

  it('applied → "✓ تم إضافتها" without buttons; rejected → "تم إزالتها"', () => {
    const { rerender } = render(<CarrierCostCell action={action({ state: 'applied', can_apply: false, can_reject: false, previous_cost: 140, applied_cost: 154.9 })} busy={null} onApply={noop} onReject={noop} />)
    expect(screen.getByText('تم إضافتها')).toBeInTheDocument()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    rerender(<CarrierCostCell action={action({ state: 'rejected', can_apply: false, can_reject: false })} busy={null} onApply={noop} onReject={noop} />)
    expect(screen.getByText('تم إزالتها')).toBeInTheDocument()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('blocked states: no ✓, only ✕, with the Arabic reason', () => {
    const cases: Array<[CostAction['reason'], string]> = [
      ['not_found', 'غير موجودة بالمنصة'], ['multiple_invoices', 'يحتاج مراجعة'], ['duplicate_awb', 'يحتاج مراجعة'],
      ['ambiguous', 'يحتاج مراجعة'], ['unclear', 'تعذر تحديد تكلفة الناقل'], ['legacy', 'تعذر تحديد تكلفة الناقل'],
    ]
    for (const [reason, label] of cases) {
      const { unmount } = render(<CarrierCostCell action={action({ state: 'blocked', reason, can_apply: false, amount: reason === 'unclear' || reason === 'ambiguous' ? null : 154.9 })} busy={null} onApply={noop} onReject={noop} />)
      expect(screen.getByText(label)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /اعتماد/ })).toBeNull()
      expect(screen.getByRole('button', { name: /تجاهل/ })).toBeInTheDocument()
      unmount()
    }
  })

  it('formats money with two decimals', () => {
    expect(formatSar(154.9)).toBe('154.90 ر.س')
    expect(formatSar(1234.5)).toBe('1,234.50 ر.س')
    expect(formatSar(null)).toBe('—')
  })
})

// ── Page flow: ✓ only turns into "تم إضافتها" after the server confirmed ──
const decide = vi.fn()
const toastError = vi.fn()
const toastSuccess = vi.fn()
vi.mock('react-hot-toast', () => ({ toast: { error: (...a: unknown[]) => toastError(...a), success: (...a: unknown[]) => toastSuccess(...a) } }))
const row = (state: CostAction['state']) => ({
  airwaybill_number: '1335833332', status: 'matched', invoice_ids: [12225],
  dhl_data: { total_charge: 154.9, shipment_date: '2026-05-07', origin_airport: 'BRU', destination_code: 'ELQ', weight_kg: 9.5, carrier_cost: { amount: 154.9, status: 'ok', source: 'parser' } },
  daftra_data: { invoice_id: 12225, invoice_no: '12225', client_name: 'عميل', summary_total: 275, payment_status: 'مدفوع', dhl_cost: 140 },
  total_financial_difference: 120.1, profit_margin_pct: 77.5,
  cost_action: action(state === 'applied' ? { state, can_apply: false, can_reject: false, previous_cost: 140, applied_cost: 154.9, current_cost: 154.9 } : {}),
})
const report = (state: CostAction['state']) => ({
  history_id: 9, updated_at: 'x', filename: 'HASIR00000210.pdf', total_shipments: 1, matched: 1, with_discrepancies: 0, needs_review: 0, not_found: 0,
  total_dhl_amount: 154.9, total_daftra_amount: 275, total_difference: -120.1,
  extraction: { complete: true, verified_costs: 1, unverified_costs: 0, extracted_shipments: 1, dhl_invoice_number: 'HASIR00000210' },
  results: [row(state)],
})
vi.mock('../../services/reconcileService', () => ({
  reconcileApiService: {
    submitDhlInvoice: vi.fn(async () => ({ job_id: 'j1' })),
    getJobStatus: vi.fn(async () => ({ status: 'done', result: report('pending') })),
    decideCarrierCost: (...a: unknown[]) => decide(...a),
    getResult: vi.fn(),
  },
}))

describe('ReconcilePage — carrier cost decision', () => {
  it('keeps ✓ ✕ on an API error (toast), and shows "تم إضافتها" only after success', async () => {
    const { ReconcilePage } = await import('../../pages/ReconcilePage')
    const { container } = render(<ReconcilePage />)
    const input = container.querySelector('#rec-file-input') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['%PDF'], 'HASIR00000210.pdf', { type: 'application/pdf' })] } })
    fireEvent.click(screen.getByRole('button', { name: /بدء التحليل الذكي/ }))
    await screen.findByText('تكلفة الناقل الأصلية من DHL')
    expect(screen.getByText('تكلفة الناقل بالفاتورة')).toBeInTheDocument()

    decide.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    fireEvent.click(screen.getByRole('button', { name: /اعتماد تكلفة الناقل/ }))
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('تعذر الاتصال بالخادم — تحقق من الاتصال ثم أعد المحاولة'))
    expect(screen.queryByText('تم إضافتها')).toBeNull()
    expect(screen.getByRole('button', { name: /اعتماد تكلفة الناقل/ })).toBeEnabled()

    let resolve!: (v: unknown) => void
    decide.mockReturnValueOnce(new Promise((r) => { resolve = r }))
    fireEvent.click(screen.getByRole('button', { name: /اعتماد تكلفة الناقل/ }))
    fireEvent.click(screen.getByRole('button', { name: /اعتماد تكلفة الناقل/ }))
    expect(decide).toHaveBeenCalledTimes(2) // the second click of the double click was ignored
    expect(decide).toHaveBeenLastCalledWith(9, '1335833332', 'apply')
    expect(screen.queryByText('تم إضافتها')).toBeNull() // not optimistic
    resolve({ awb: '1335833332', decision: 'applied', idempotent: false, invoice_changed: true, loss_alerts_sent: 0, row: null,
      invoice: { id: 12225, invoice_number: '12225', total: 275, dhl_cost: 154.9, profit_status: 'profit', net: 120.1, loss: 0, margin_pct: 77.53 }, report: report('applied') })
    expect(await screen.findByText('تم إضافتها')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /اعتماد تكلفة الناقل/ })).toBeNull()
    expect(toastSuccess).toHaveBeenCalledWith(expect.stringContaining('154.90 ر.س'), expect.anything())
  })
})
