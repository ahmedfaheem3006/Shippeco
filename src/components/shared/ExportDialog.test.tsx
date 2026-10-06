import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const downloadBlob = vi.fn()
vi.mock('../../utils/download', () => ({ downloadBlob: (...a: unknown[]) => downloadBlob(...a) }))
vi.mock('react-hot-toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('../../utils/env', () => ({ env: { apiUrl: 'http://api.test/api' } }))

import { ExportDialog } from './ExportDialog'

type Call = { url: string }
let calls: Call[] = []
let releaseFile: (() => void) | null = null

beforeEach(() => {
  calls = []
  downloadBlob.mockReset()
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    calls.push({ url })
    if (url.includes('count_only=1')) {
      const n = url.includes('date_from=2026-09-01') ? 357 : 0
      return new Response(JSON.stringify({ success: true, data: { count: n } }), { status: 200 })
    }
    await new Promise<void>((r) => { releaseFile = r })
    return new Response(new Blob(['PK-file']), {
      status: 200,
      headers: { 'Content-Disposition': `attachment; filename="invoices_2026-09-01_to_2026-09-30.xlsx"; filename*=UTF-8''invoices_2026-09-01_to_2026-09-30.xlsx` },
    })
  }))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const renderDialog = (onClose = vi.fn()) =>
  render(
    <ExportDialog
      open
      onClose={onClose}
      title="تصدير الفواتير"
      endpoint="/invoices/export"
      initialFormat="xlsx"
      params={{ profit: 'loss', search: undefined }}
      filterLabels={['الربحية: خاسرة']}
      dateFieldNote="حسب تاريخ الفاتورة"
      fileBase="invoices"
      currentRange={{ from: '2026-09-01', to: '2026-09-30' }}
      defaultPreset="current"
      rowNoun="فاتورة"
    />,
  )

describe('ExportDialog', () => {
  it('shows the exact period, the page filters and the server row count before exporting', async () => {
    renderDialog()
    expect(screen.getByText('من 2026-09-01 إلى 2026-09-30')).toBeInTheDocument()
    expect(screen.getByText('الربحية: خاسرة')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('357')).toBeInTheDocument())
    expect(calls[0].url).toBe('http://api.test/api/invoices/export?profit=loss&date_from=2026-09-01&date_to=2026-09-30&count_only=1')
  })

  it('blocks a custom range whose start is after its end', async () => {
    renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'فترة مخصصة' }))
    fireEvent.change(screen.getByLabelText('من تاريخ'), { target: { value: '2026-09-30' } })
    fireEvent.change(screen.getByLabelText('إلى تاريخ'), { target: { value: '2026-09-01' } })
    expect(screen.getByText('تاريخ البداية يجب ألا يكون بعد تاريخ النهاية')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^تصدير Excel/ })).toBeDisabled()
  })

  it('a double click downloads ONE file with the chosen format, period and filters', async () => {
    const onClose = vi.fn()
    renderDialog(onClose)
    const btn = await screen.findByRole('button', { name: 'تصدير Excel (357)' })
    fireEvent.click(btn)
    fireEvent.click(btn)
    await waitFor(() => expect(screen.getByRole('button', { name: /جاري تجهيز الملف/ })).toBeDisabled())
    await act(async () => { releaseFile?.() })
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledTimes(1))
    const fileCalls = calls.filter((c) => c.url.includes('format='))
    expect(fileCalls).toHaveLength(1)
    expect(fileCalls[0].url).toBe('http://api.test/api/invoices/export?profit=loss&date_from=2026-09-01&date_to=2026-09-30&format=xlsx')
    expect(downloadBlob.mock.calls[0][0]).toBe('invoices_2026-09-01_to_2026-09-30.xlsx')
    expect(onClose).toHaveBeenCalled()
  })

  it('switching to "all data" drops the dates; an empty result disables the export', async () => {
    renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'كل البيانات' }))
    expect(screen.getByText('كل البيانات (بدون تقييد بالتاريخ)')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('لا توجد بيانات مطابقة لهذه الفترة والفلاتر')).toBeInTheDocument())
    expect(calls.at(-1)!.url).toBe('http://api.test/api/invoices/export?profit=loss&count_only=1')
    expect(screen.getByRole('button', { name: /^تصدير Excel/ })).toBeDisabled()
  })
})
