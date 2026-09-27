import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { ReceiptAttachmentsField } from './ReceiptAttachmentsField'
import type { InvoiceReceipt } from '../../utils/models'

const deleteTransferReceiptMock = vi.fn()
vi.mock('../../services/invoiceService', () => ({
  invoiceService: {
    deleteTransferReceipt: (...args: unknown[]) => deleteTransferReceiptMock(...args),
  },
}))

function makeFile(name: string, sizeBytes: number, type = 'image/png') {
  const file = new File([new Uint8Array(sizeBytes)], name, { type })
  return file
}

function existingReceipt(id: number): InvoiceReceipt {
  return {
    id,
    invoice_id: 1,
    data_url: 'data:image/png;base64,AAAA',
    created_at: '2026-01-01T00:00:00Z',
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  vi.spyOn(window, 'alert').mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
})

describe('ReceiptAttachmentsField', () => {
  it('renders already-saved receipts', () => {
    render(
      <ReceiptAttachmentsField
        invoiceId={1}
        existing={[existingReceipt(1), existingReceipt(2)]}
        onExistingChange={() => {}}
        pendingFiles={[]}
        onPendingFilesChange={() => {}}
      />
    )
    expect(screen.getAllByAltText('سند التحويل')).toHaveLength(2)
  })

  it('adds newly-picked files to pendingFiles without touching existing ones', () => {
    const onPendingFilesChange = vi.fn()
    render(
      <ReceiptAttachmentsField
        invoiceId={1}
        existing={[]}
        onExistingChange={() => {}}
        pendingFiles={[]}
        onPendingFilesChange={onPendingFilesChange}
      />
    )
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = makeFile('a.png', 1000)
    fireEvent.change(input, { target: { files: [file] } })

    expect(onPendingFilesChange).toHaveBeenCalledWith([file])
  })

  it('rejects a file larger than 5MB and does not add it', () => {
    const onPendingFilesChange = vi.fn()
    render(
      <ReceiptAttachmentsField
        invoiceId={1}
        existing={[]}
        onExistingChange={() => {}}
        pendingFiles={[]}
        onPendingFilesChange={onPendingFilesChange}
      />
    )
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const tooBig = makeFile('big.png', 6 * 1024 * 1024)
    fireEvent.change(input, { target: { files: [tooBig] } })

    expect(onPendingFilesChange).not.toHaveBeenCalled()
    expect(screen.getByText(/أكبر من 5 ميجابايت/)).toBeInTheDocument()
  })

  it('rejects adding files that would exceed the 10-image total (existing + pending)', () => {
    const existing = Array.from({ length: 9 }, (_, i) => existingReceipt(i + 1))
    const onPendingFilesChange = vi.fn()
    render(
      <ReceiptAttachmentsField
        invoiceId={1}
        existing={existing}
        onExistingChange={() => {}}
        pendingFiles={[]}
        onPendingFilesChange={onPendingFilesChange}
      />
    )
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const twoMore = [makeFile('a.png', 100), makeFile('b.png', 100)]
    fireEvent.change(input, { target: { files: twoMore } })

    expect(onPendingFilesChange).not.toHaveBeenCalled()
    expect(screen.getByText(/الحد الأقصى 10 صور/)).toBeInTheDocument()
  })

  it('deletes an existing receipt via the API after confirmation, and reports it removed', async () => {
    deleteTransferReceiptMock.mockResolvedValue(undefined)
    const onExistingChange = vi.fn()
    render(
      <ReceiptAttachmentsField
        invoiceId={42}
        existing={[existingReceipt(7)]}
        onExistingChange={onExistingChange}
        pendingFiles={[]}
        onPendingFilesChange={() => {}}
      />
    )
    const deleteButtons = screen.getAllByTitle('حذف الصورة')
    fireEvent.click(deleteButtons[0])

    await waitFor(() => expect(deleteTransferReceiptMock).toHaveBeenCalledWith(42, 7))
    expect(onExistingChange).toHaveBeenCalledWith([])
  })

  it('does not call the delete API when the confirmation is cancelled', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const onExistingChange = vi.fn()
    render(
      <ReceiptAttachmentsField
        invoiceId={42}
        existing={[existingReceipt(7)]}
        onExistingChange={onExistingChange}
        pendingFiles={[]}
        onPendingFilesChange={() => {}}
      />
    )
    fireEvent.click(screen.getAllByTitle('حذف الصورة')[0])

    expect(deleteTransferReceiptMock).not.toHaveBeenCalled()
    expect(onExistingChange).not.toHaveBeenCalled()
  })

  it('removing a pending (not-yet-saved) file never calls the delete API', () => {
    const file = makeFile('a.png', 100)
    const onPendingFilesChange = vi.fn()
    render(
      <ReceiptAttachmentsField
        invoiceId={1}
        existing={[]}
        onExistingChange={() => {}}
        pendingFiles={[file]}
        onPendingFilesChange={onPendingFilesChange}
      />
    )
    fireEvent.click(screen.getByTitle('إزالة الصورة'))
    expect(onPendingFilesChange).toHaveBeenCalledWith([])
    expect(deleteTransferReceiptMock).not.toHaveBeenCalled()
  })
})
