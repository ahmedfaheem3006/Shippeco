import { describe, expect, it } from 'vitest'
import { readJson, removeKey, writeJson } from './storage'

describe('storage utils', () => {
  it('reads back written JSON', () => {
    const storage = window.localStorage
    storage.clear()

    const ok = writeJson('k', { a: 1 }, storage)
    expect(ok).toBe(true)
    expect(readJson<{ a: number }>('k', storage)).toEqual({ a: 1 })
  })

  it('returns undefined on invalid JSON', () => {
    const storage = window.localStorage
    storage.clear()
    storage.setItem('bad', '{not-json')
    expect(readJson('bad', storage)).toBeUndefined()
  })

  it('removeKey does not throw', () => {
    const storage = window.localStorage
    storage.clear()
    storage.setItem('x', '1')
    removeKey('x', storage)
    expect(storage.getItem('x')).toBeNull()
  })
})
