import { describe, it, expect, vi, afterEach } from 'vitest'
import { useState } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Dialog } from './Dialog'

afterEach(() => cleanup())

function Harness({ onRequestClose }: { onRequestClose?: (r: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    // Regression: the page wrapper animates with a transform (.animate-in),
    // which made `position: fixed` modals relative to the whole page.
    <div data-testid="page" style={{ transform: 'translate3d(0,0,0)' }}>
      <button onClick={() => setOpen(true)}>فتح</button>
      <Dialog
        open={open}
        onRequestClose={(r) => {
          onRequestClose?.(r)
          setOpen(false)
        }}
        labelledBy="t"
      >
        <h2 id="t">عنوان</h2>
        <input aria-label="حقل" />
        <button onClick={() => setOpen(false)}>إغلاق</button>
      </Dialog>
    </div>
  )
}

describe('Dialog', () => {
  it('portals to <body>, outside any transformed page wrapper', () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('فتح'))
    const dialog = screen.getByRole('dialog', { name: 'عنوان' })
    expect(screen.getByTestId('page').contains(dialog)).toBe(false)
    expect(dialog.closest('.shp-dialog-layer')?.parentElement).toBe(document.body)
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  it('Escape asks the owner to close; a child that handled Escape keeps it open', () => {
    const onRequestClose = vi.fn()
    render(<Harness onRequestClose={onRequestClose} />)
    fireEvent.click(screen.getByText('فتح'))
    const input = screen.getByLabelText('حقل')
    input.addEventListener('keydown', (e) => e.preventDefault(), { once: true })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onRequestClose).not.toHaveBeenCalled()
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onRequestClose).toHaveBeenCalledWith('escape')
  })

  it('returns focus to the opener without scrolling (preventScroll)', () => {
    vi.useFakeTimers()
    render(<Harness />)
    const opener = screen.getByText('فتح')
    opener.focus()
    fireEvent.click(opener)
    const spy = vi.spyOn(opener, 'focus')
    fireEvent.click(screen.getByText('إغلاق'))
    expect(spy).toHaveBeenCalledWith({ preventScroll: true })
    expect(document.activeElement).toBe(opener)
    act(() => { vi.advanceTimersByTime(500) }) // exit transition fallback
    expect(screen.queryByRole('dialog')).toBeNull()
    vi.useRealTimers()
  })

  it('moves initial focus into the dialog without scrolling', () => {
    const spy = vi.spyOn(HTMLElement.prototype, 'focus')
    render(<Harness />)
    fireEvent.click(screen.getByText('فتح'))
    expect(document.activeElement).toBe(screen.getByRole('dialog'))
    expect(spy.mock.calls.every(([opts]) => (opts as FocusOptions | undefined)?.preventScroll === true)).toBe(true)
    spy.mockRestore()
  })
})
