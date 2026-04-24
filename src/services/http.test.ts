import { describe, expect, it, vi } from 'vitest'
import { HttpError, requestJson } from './http'

describe('requestJson', () => {
  it('returns parsed JSON on ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      })) as unknown as typeof fetch,
    )

    const data = await requestJson<{ ok: boolean }>('https://example.test')
    expect(data).toEqual({ ok: true })
  })

  it('throws HttpError with status and url on non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 500,
        text: async () => 'fail',
      })) as unknown as typeof fetch,
    )

    await expect(requestJson('https://example.test')).rejects.toBeInstanceOf(HttpError)
    await expect(requestJson('https://example.test')).rejects.toMatchObject({
      info: { status: 500, url: 'https://example.test', bodyText: 'fail' },
    })
  })
})
