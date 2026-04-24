import { describe, expect, it } from 'vitest'
import { hashPassword, isHashedPassword, verifyPassword } from './password'

describe('password', () => {
  it('hashPassword returns encoded value and verifyPassword checks it', async () => {
    const hashed = await hashPassword('secret')
    expect(isHashedPassword(hashed)).toBe(true)
    expect(await verifyPassword(hashed, 'secret')).toBe(true)
    expect(await verifyPassword(hashed, 'wrong')).toBe(false)
  })

  it('verifyPassword supports legacy plain text', async () => {
    expect(await verifyPassword('plain', 'plain')).toBe(true)
    expect(await verifyPassword('plain', 'x')).toBe(false)
  })
})

