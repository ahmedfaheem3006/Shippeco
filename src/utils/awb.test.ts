import { describe, expect, it } from 'vitest'
import { displayAwb } from './awb'

describe('displayAwb', () => {
  it('shows the AWB exactly as stored: no spaces, no grouping, no locale formatting', () => {
    expect(displayAwb('6606077671')).toBe('6606077671')
    expect(displayAwb('9988679120')).not.toContain(' ')
    expect(displayAwb(' 6606077671 ')).toBe('6606077671')
  })
  it('keeps leading zeros (string rendering, never a number)', () => {
    expect(displayAwb('0012345678')).toBe('0012345678')
  })
  it('non-DHL values and empties pass through safely', () => {
    expect(displayAwb('ABC')).toBe('ABC')
    expect(displayAwb(null)).toBe('')
    expect(displayAwb(undefined)).toBe('')
  })
})
