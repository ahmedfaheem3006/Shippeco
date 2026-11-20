import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../hooks/useAuthStore', () => ({ useAuthStore: { getState: () => ({ token: 'tok-123' }) } }))
vi.mock('../utils/env', () => ({ env: { apiUrl: 'https://backend.test/api' } }))

import { shipmentTrackingService } from './shipmentTracking.service'
import { ApiError } from '../utils/apiClient'

afterEach(() => vi.unstubAllGlobals())

describe('shipmentTrackingService.downloadAwbDocument', () => {
  it('calls the authenticated SHIPPEC endpoint (never DHL) and returns the PDF with its file name', async () => {
    const pdf = new Blob(['%PDF-1.4'], { type: 'application/pdf' })
    const fetchMock = vi.fn(async () => new Response(pdf, {
      status: 200,
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="DHL-AWB-6606077671.pdf"' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    const r = await shipmentTrackingService.downloadAwbDocument('6606077671')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://backend.test/api/shipment-tracking/6606077671/waybill')
    expect(url).not.toMatch(/dhl\.com/i)
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok-123')
    expect(r.filename).toBe('DHL-AWB-6606077671.pdf')
    expect(r.blob.type).toBe('application/pdf')
  })

  it('no file name header → DHL-AWB-<AWB>.pdf', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob(['x'], { type: 'application/pdf' }), { status: 200 })))
    expect((await shipmentTrackingService.downloadAwbDocument('6606077671')).filename).toBe('DHL-AWB-6606077671.pdf')
  })

  it('unavailable document → ApiError with the Backend code and Arabic message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: false, error: { message: 'مستند البوليصة غير متاح', code: 'AWB_DOCUMENT_UNAVAILABLE' } }), { status: 404 })))
    const err = await shipmentTrackingService.downloadAwbDocument('6606077671').catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ status: 404, code: 'AWB_DOCUMENT_UNAVAILABLE', message: 'مستند البوليصة غير متاح' })
  })

  it('no permission → 403 ApiError', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: false, error: { message: 'Forbidden', code: 'FORBIDDEN' } }), { status: 403 })))
    await expect(shipmentTrackingService.downloadAwbDocument('6606077671')).rejects.toMatchObject({ status: 403 })
  })
})
