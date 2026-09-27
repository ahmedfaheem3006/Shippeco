import { describe, expect, it, vi, beforeEach } from 'vitest'

const getMock = vi.fn()
const deleteMock = vi.fn()
vi.mock('./unifiedService', () => ({
  unifiedService: {
    get: (...args: unknown[]) => getMock(...args),
    delete: (...args: unknown[]) => deleteMock(...args),
  },
}))

const postFormDataMock = vi.fn()
vi.mock('../utils/apiClient', () => ({
  api: { postFormData: (...args: unknown[]) => postFormDataMock(...args) },
}))

import { invoiceService } from './invoiceService'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('invoiceService.getTransferReceipts', () => {
  it('unwraps a {success, data} response into the array', async () => {
    getMock.mockResolvedValue({ success: true, data: [{ id: 1 }, { id: 2 }] })
    const result = await invoiceService.getTransferReceipts(5)
    expect(getMock).toHaveBeenCalledWith('/invoices/5/transfer-receipts')
    expect(result).toEqual([{ id: 1 }, { id: 2 }])
  })

  it('returns an empty array (not undefined/throw) for an unexpected shape', async () => {
    getMock.mockResolvedValue({ success: true, data: null })
    const result = await invoiceService.getTransferReceipts(5)
    expect(result).toEqual([])
  })
})

describe('invoiceService.uploadTransferReceipts', () => {
  it('sends every file under the "files" field in one FormData request', async () => {
    postFormDataMock.mockResolvedValue({ success: true, data: [{ id: 1 }] })
    const files = [new File(['a'], 'a.png'), new File(['b'], 'b.png')]
    const result = await invoiceService.uploadTransferReceipts(5, files)

    expect(postFormDataMock).toHaveBeenCalledTimes(1)
    const [endpoint, formData] = postFormDataMock.mock.calls[0]
    expect(endpoint).toBe('/invoices/5/transfer-receipts')
    expect((formData as FormData).getAll('files')).toEqual(files)
    expect(result).toEqual([{ id: 1 }])
  })

  it('throws when the response reports an error, instead of silently succeeding', async () => {
    postFormDataMock.mockResolvedValue({ success: false, error: { message: 'الملف غير مدعوم' } })
    await expect(invoiceService.uploadTransferReceipts(5, [new File(['a'], 'a.png')])).rejects.toThrow(
      'الملف غير مدعوم'
    )
  })

  it('propagates a thrown network/HTTP error unchanged (caller must not treat it as partial success)', async () => {
    postFormDataMock.mockRejectedValue(new Error('اتصال فشل'))
    await expect(invoiceService.uploadTransferReceipts(5, [new File(['a'], 'a.png')])).rejects.toThrow(
      'اتصال فشل'
    )
  })
})

describe('invoiceService.deleteTransferReceipt', () => {
  it('calls DELETE on the scoped invoice+receipt path', async () => {
    deleteMock.mockResolvedValue({ success: true })
    await invoiceService.deleteTransferReceipt(5, 7)
    expect(deleteMock).toHaveBeenCalledWith('/invoices/5/transfer-receipts/7')
  })

  it('throws when the response reports an error', async () => {
    deleteMock.mockResolvedValue({ success: false, error: { message: 'غير موجود' } })
    await expect(invoiceService.deleteTransferReceipt(5, 999)).rejects.toThrow('غير موجود')
  })
})
