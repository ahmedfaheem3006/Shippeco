import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import type { TrackingDetails, TrackingItem, TrackingSummary } from '../services/shipmentTracking.service'

const svc = vi.hoisted(() => ({
  list: vi.fn(), summary: vi.fn(), details: vi.fn(), refresh: vi.fn(), lookup: vi.fn(),
  verifyAwbs: vi.fn(), pendingSyncStatus: vi.fn(), startPendingSync: vi.fn(), downloadAwbDocument: vi.fn(), downloadAwbBundle: vi.fn(), resumeSync: vi.fn(),
}))
vi.mock('../services/shipmentTracking.service', () => ({ shipmentTrackingService: svc }))
const dhl = vi.hoisted(() => ({ get: vi.fn(), getPickup: vi.fn(), downloadDocument: vi.fn() }))
vi.mock('../services/dhlShipment.service', () => ({ dhlShipmentService: dhl }))
const auth = vi.hoisted(() => ({ role: 'employee' }))
vi.mock('../hooks/useAuthStore', () => ({ useAuthStore: (sel: (s: unknown) => unknown) => sel({ user: { id: 1, role: auth.role } }) }))
vi.mock('../hooks/useRealtimeRefresh', () => ({ useRealtimeRefresh: () => undefined }))
vi.mock('react-hot-toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
const files = vi.hoisted(() => ({ downloadBlob: vi.fn(), printBlob: vi.fn() }))
vi.mock('../utils/download', () => files)

import { ShipmentTrackingPage } from './ShipmentTrackingPage'
import { AWB_DOC_UNAVAILABLE, ShipmentTrackingDetailsPage } from './ShipmentTrackingDetailsPage'
import { ApiError } from '../utils/apiClient'

const item = (awb: string, over: Partial<TrackingItem> = {}): TrackingItem => ({
  id: Number(awb.slice(-4)), awb, carrier: 'DHL', invoice_id: 77, invoice_number: 'DH2580', client_id: 5, customer_name: 'شركة الاختبار',
  booking_date: '2026-10-28', invoice_destination: null, raw_status: 'AF', normalized_status: 'IN_TRANSIT', requires_action: false,
  current_description: 'Arrived at DHL Sort Facility - RIYADH-SA', current_location: 'RIYADH-SA', current_city: 'RIYADH', current_country_code: 'SA',
  origin: 'RIYADH-SA', origin_city: 'RIYADH', origin_country_code: 'SA', destination: 'DUBAI-AE', destination_city: 'DUBAI', destination_country_code: 'AE',
  product_code: 'P', number_of_pieces: 1, estimated_delivery: '2026-11-02T23:59:00', delivered_at: null, delivered_local: null, delivered_gmt_offset: null,
  delivered_location: null, delivered_signed_by: null, last_event_at: '2026-10-29T09:00:00Z', last_event_local: '2026-10-29 12:00:00', last_event_gmt_offset: '+03:00',
  sync_status: 'ok', last_synced_at: new Date(Date.now() - 8 * 60_000).toISOString(), last_attempt_at: null, next_sync_at: null, consecutive_failures: 0,
  last_error_code: null, last_error_message: null, pickup_local: '2026-10-28 15:10:00', pickup_gmt_offset: '+03:00', freshness: 'current', ...over,
})
const details = (awb: string, over: Partial<TrackingDetails> = {}): TrackingDetails => ({
  ...item(awb), shipment_description: 'DOCUMENTS', total_weight: 0.5, weight_unit: 'metric', shipment_timestamp: '2026-10-28T14:00:00',
  pieces: [{ number: 1, trackingNumber: 'JD014600004617230779', typeCode: 'SMF', description: null, weight: 0.5, actualWeight: 0.5, dimensions: null, eventCount: 2, lastEvent: null }],
  events: [
    { id: 3, raw_status: 'OK', normalized_status: 'DELIVERED', description: 'Delivered', remark: null, next_steps: null, location: 'DUBAI-AE', location_code: 'DXB', city: 'DUBAI', country_code: 'AE', event_date: '2026-11-01', event_time: '10:00:00', gmt_offset: '+04:00', event_at: '2026-11-01T06:00:00Z', signed_by: 'AHMED', sequence: 2 },
    { id: 2, raw_status: 'AF', normalized_status: 'IN_TRANSIT', description: 'Arrived at DHL Sort Facility - RIYADH-SA', remark: 'The shipment is on its way', next_steps: 'Please continue to monitor', location: 'RIYADH-SA', location_code: 'RUH', city: 'RIYADH', country_code: 'SA', event_date: '2026-10-29', event_time: '12:00:00', gmt_offset: '+03:00', event_at: '2026-10-29T09:00:00Z', signed_by: null, sequence: 1 },
    { id: 1, raw_status: 'PU', normalized_status: 'PICKED_UP', description: 'Shipment picked up', remark: null, next_steps: null, location: 'RIYADH-SA', location_code: 'RUH', city: 'RIYADH', country_code: 'SA', event_date: '2026-10-28', event_time: '15:10:00', gmt_offset: '+03:00', event_at: '2026-10-28T12:10:00Z', signed_by: null, sequence: 0 },
  ],
  refresh_cooldown_seconds: 60, ...over,
})
const summary = (): TrackingSummary => ({
  counts: { total: 12, in_transit: 5, out_for_delivery: 2, delivered: 3, problem: 2, exception: 1, on_hold: 1, customs: 1, pre_transit: 0, not_synced: 1, unknown: 0, stale: 0, failed: 0, last_synced_at: new Date().toISOString() },
  countries: { origin: [{ code: 'SA', count: 12 }], destination: [{ code: 'AE', count: 7 }] },
  integration: { enabled: true, env: 'production', usable: true, syncEnabled: true, syncIntervalMinutes: 30, features: { tracking: true, trackingLookup: true } },
})
const page = (items: TrackingItem[], total = items.length, totalPages = 1) => ({ items, pagination: { page: 1, limit: 20, total, totalPages } })

function Where() { const l = useLocation(); return <div data-testid="where">{l.pathname}{l.search}</div> }
const renderApp = (url = '/shipment-tracking') => render(
  <MemoryRouter initialEntries={[url]}>
    <Routes>
      <Route path="/shipment-tracking" element={<ShipmentTrackingPage />} />
      <Route path="/shipment-tracking/:awb" element={<ShipmentTrackingDetailsPage />} />
    </Routes>
    <Where />
  </MemoryRouter>,
)

afterEach(() => cleanup())
beforeEach(() => {
  vi.clearAllMocks()
  auth.role = 'employee'
  svc.summary.mockResolvedValue(summary())
  svc.list.mockResolvedValue(page([item('9988679120'), item('1234567890', { normalized_status: null, last_synced_at: null, current_description: null, last_event_local: null, pickup_local: null, freshness: 'pending', invoice_id: null, invoice_number: null, client_id: null, customer_name: null, receiver_name: 'Gulf Retail' })]))
})

describe('«متابعة البوليصة» — one shipment per row, AWB never split, active / archived dataset', () => {
  it('cards: ONE full-width card per row at every width (single column, never a 2-column grid); the AWB is shown and linked unspaced', async () => {
    renderApp()
    const list = await screen.findByTestId('tracking-card-list')
    const cls = list.className.split(/\s+/)
    expect(cls).toContain('grid-cols-1')
    // no breakpoint may turn the list into several columns (md:grid-cols-2 was the mobile/tablet bug)
    expect(cls.filter((c) => /(^|:)grid-cols-(?!1$)\d+$/.test(c) || /(^|:)columns-/.test(c) || /(^|:)flex-row$/.test(c))).toEqual([])
    const cards = within(list).getAllByTestId('tracking-card')
    expect(cards).toHaveLength(2)
    for (const c of cards) expect(c.className.split(/\s+/)).toContain('w-full')
    const awb = within(cards[0]).getByTestId('tracking-awb')
    expect(awb.textContent).toBe('9988679120')
    expect(awb.getAttribute('href')).toBe('/shipment-tracking/9988679120')
    expect(screen.queryByText('998 867 9120')).toBeNull()
    // the same compact order on the card: AWB, status, customer, invoice, route, created/pickup, ETA, last sync, checkpoint, details
    const text = cards[0].textContent!
    const at = (x: string) => text.indexOf(x)
    for (const [a, b] of [['9988679120', 'قيد النقل'], ['قيد النقل', 'العميل'], ['العميل', 'الفاتورة'], ['الفاتورة', 'المسار'], ['المسار', 'الإنشاء / استلام DHL'],
      ['الإنشاء / استلام DHL', 'التسليم المتوقع'], ['التسليم المتوقع', 'آخر تحديث'], ['آخر تحديث', 'Arrived at DHL Sort Facility'], ['Arrived at DHL Sort Facility', 'تفاصيل الشحنة']]) {
      expect(at(a)).toBeGreaterThanOrEqual(0)
      expect(at(a)).toBeLessThan(at(b))
    }
    // desktop: one full-width table row per shipment, same order of columns
    const heads = within(screen.getByTestId('tracking-table')).getAllByRole('columnheader').map((h) => h.textContent)
    expect(heads.slice(0, 8)).toEqual(['البوليصة', 'الحالة', 'العميل / الفاتورة', 'المنشأ ← الوجهة', 'الإنشاء / استلام DHL', 'التسليم', 'آخر نقطة تتبع', 'آخر تحديث'])
  })

  it('a leading zero survives (string rendering, never a number)', async () => {
    svc.list.mockResolvedValue(page([item('0012345678')]))
    renderApp()
    const cards = await screen.findAllByTestId('tracking-card')
    expect(within(cards[0]).getByTestId('tracking-awb').textContent).toBe('0012345678')
  })

  it('default = active dataset; counters distinguish active / in transit / delivered (12 months) / problems / waiting / archived; «المسلّمة القديمة» asks for view=archived', async () => {
    svc.summary.mockResolvedValue({ ...summary(), counts: { ...summary().counts, total: 900, active: 900, delivered: 300, delivered_recent: 300, waiting_sync: 450, not_synced: 450, archived_delivered: 1200, all_total: 2100 } })
    renderApp()
    await waitFor(() => expect(svc.list).toHaveBeenCalled())
    expect(svc.list.mock.calls[0][0]).toMatchObject({ view: 'active', page: 1 })
    const counters = await screen.findByTestId('tracking-counters')
    await waitFor(() => expect(within(counters).getByRole('radio', { name: /النشطة\s*·\s*900/ })).toBeTruthy())
    expect(within(counters).getByRole('radio', { name: /سُلّمت \(آخر 12 شهرًا\)\s*·\s*300/ })).toBeTruthy()
    expect(within(counters).getByRole('radio', { name: /بانتظار المزامنة\s*·\s*450/ })).toBeTruthy()
    expect(within(counters).getByRole('radio', { name: /قيد النقل\s*·\s*5/ })).toBeTruthy()
    expect(within(counters).getByRole('radio', { name: /يوجد مشكلة\s*·\s*2/ })).toBeTruthy()
    const archived = within(counters).getByRole('radio', { name: /المسلّمة القديمة\s*·\s*1200/ })
    fireEvent.click(archived)
    await waitFor(() => expect(svc.list).toHaveBeenLastCalledWith(expect.objectContaining({ view: 'archived', status: 'all', page: 1 })))
    expect(within(counters).getByRole('radio', { name: /المسلّمة القديمة/ }).getAttribute('aria-checked')).toBe('true')
    expect(await screen.findByText(/سُلّمت قبل أكثر من 12 شهرًا — محفوظة كاملة/)).toBeTruthy()
    fireEvent.click(within(counters).getByRole('radio', { name: /قيد النقل/ }))
    await waitFor(() => expect(svc.list).toHaveBeenLastCalledWith(expect.objectContaining({ view: 'active', status: 'in_transit' })))
  })

  it('details: the heading and the copy button use the exact AWB', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    svc.details.mockResolvedValue(details('6606077671'))
    renderApp('/shipment-tracking/6606077671')
    expect(await screen.findByRole('heading', { name: '6606077671' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'نسخ رقم البوليصة' }))
    expect(writeText).toHaveBeenCalledWith('6606077671')
    expect(document.body.textContent).not.toContain('660 607 7671')
  })

})

describe('«متابعة البوليصة» — list', () => {
  it('one full-width row per shipment (cards on small screens); a shipment without DHL data stays visible', async () => {
    renderApp()
    const rows = await screen.findAllByRole('row')
    expect(rows.length).toBe(3) // header + 2
    const r1 = rows.find((r) => r.getAttribute('data-tracking-awb') === '9988679120')!
    expect(within(r1).getByText('9988679120')).toBeTruthy()
    expect(within(r1).getByText('DH2580')).toBeTruthy()
    expect(within(r1).getByText('قيد النقل')).toBeTruthy()
    expect(within(r1).getByText(/استلام: 28\/10\/2026/)).toBeTruthy()
    expect(within(r1).getByRole('link', { name: 'تفاصيل' }).getAttribute('href')).toBe('/shipment-tracking/9988679120')
    const r2 = rows.find((r) => r.getAttribute('data-tracking-awb') === '1234567890')!
    expect(within(r2).getByText('بانتظار أول مزامنة')).toBeTruthy() // visible before DHL ever answered
    expect(within(r2).getByText('لا توجد نقاط تتبع بعد')).toBeTruthy()
    expect(within(r2).getByText('Gulf Retail')).toBeTruthy()
    expect(screen.getAllByRole('article')).toHaveLength(2) // mobile cards carry the same shipments
  })

  it('a shipment DHL has no data for / whose sync failed stays listed with an honest state', async () => {
    svc.list.mockResolvedValue(page([
      item('1111111111', { normalized_status: null, last_synced_at: null, sync_status: 'not_found', freshness: 'unknown' }),
      item('2222222222', { normalized_status: null, last_synced_at: null, sync_status: 'error', freshness: 'unknown' }),
    ]))
    renderApp()
    const rows = await screen.findAllByRole('row')
    expect(within(rows.find((r) => r.getAttribute('data-tracking-awb') === '1111111111')!).getByText('لا تتوفر بيانات تتبع من DHL')).toBeTruthy()
    expect(within(rows.find((r) => r.getAttribute('data-tracking-awb') === '2222222222')!).getByText('غير متاحة مؤقتًا')).toBeTruthy()
  })

  it('filters: year → date range, not delivered, freshness, client; pagination preserved', async () => {
    svc.list.mockResolvedValue(page([item('9988679120')], 45, 3))
    renderApp()
    await screen.findAllByRole('row')
    fireEvent.click(screen.getByRole('button', { name: /الفلاتر/ }))
    fireEvent.change(screen.getByLabelText('السنة'), { target: { value: String(new Date().getFullYear()) } })
    await waitFor(() => expect(svc.list).toHaveBeenLastCalledWith(expect.objectContaining({ from: `${new Date().getFullYear()}-01-01`, to: `${new Date().getFullYear()}-12-31` })))
    fireEvent.change(screen.getByLabelText('الحالة الحالية'), { target: { value: 'not_delivered' } })
    await waitFor(() => expect(svc.list).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'not_delivered', page: 1 })))
    fireEvent.change(screen.getByLabelText('حداثة بيانات DHL'), { target: { value: 'stale' } })
    await waitFor(() => expect(svc.list).toHaveBeenLastCalledWith(expect.objectContaining({ sync: 'stale' })))
    fireEvent.click(screen.getByRole('button', { name: 'الصفحة التالية' }))
    await waitFor(() => expect(svc.list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2, status: 'not_delivered' })))
    fireEvent.click(screen.getAllByTitle('عرض شحنات هذا العميل فقط')[0])
    await waitFor(() => expect(svc.list).toHaveBeenLastCalledWith(expect.objectContaining({ client_id: 5, page: 1 })))
  })
})

describe('«متابعة البوليصة» — direct AWB search', () => {
  it('local or remote result opens the details page', async () => {
    svc.lookup.mockResolvedValue({ result: 'remote', awb: '5550000777', record: details('5550000777') })
    svc.details.mockResolvedValue(details('5550000777'))
    renderApp()
    fireEvent.change(screen.getByPlaceholderText('1234567890'), { target: { value: 'AWB 555-000-0777' } })
    fireEvent.click(screen.getByRole('button', { name: 'بحث' }))
    await waitFor(() => expect(svc.lookup).toHaveBeenCalledWith('5550000777'))
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/shipment-tracking/5550000777'))
  })

  it('not found, no permission, disabled and rate-limited answers are explained', async () => {
    renderApp()
    const input = screen.getByPlaceholderText('1234567890')
    const search = async (awb: string) => { fireEvent.change(input, { target: { value: awb } }); fireEvent.click(screen.getByRole('button', { name: 'بحث' })) }
    svc.lookup.mockResolvedValueOnce({ result: 'not_found', awb: '1111111111', record: null })
    await search('1111111111')
    expect(await screen.findByText('لا توجد بيانات لدى DHL لهذه البوليصة.')).toBeTruthy()
    svc.lookup.mockResolvedValueOnce({ result: 'remote_lookup_required', awb: '2222222222', record: null, remote_lookup_available: false })
    await search('2222222222')
    expect(await screen.findByText(/والبحث لدى DHL غير متاح لدورك/)).toBeTruthy()
    svc.lookup.mockRejectedValueOnce(new ApiError('disabled', 503, 'DHL_LOOKUP_DISABLED'))
    await search('3333333333')
    expect(await screen.findByText('البحث المباشر لدى DHL غير مفعّل حاليًا')).toBeTruthy()
    svc.lookup.mockRejectedValueOnce(new ApiError('slow down', 429, 'RATE_LIMIT'))
    await search('4444444444')
    expect(await screen.findByText(/طلبات بحث كثيرة/)).toBeTruthy()
    fireEvent.change(input, { target: { value: '12345' } })
    expect((screen.getByRole('button', { name: 'بحث' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('an old notification link (?awb=) opens the details page', async () => {
    svc.details.mockResolvedValue(details('9988679120'))
    renderApp('/shipment-tracking?awb=9988679120')
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/shipment-tracking/9988679120'))
  })
})

describe('/shipment-tracking/:awb — details', () => {
  it('summary, timeline with highlighted milestones, delivery proof, pieces and the SHIPPEC side', async () => {
    svc.details.mockResolvedValue(details('9988679120', { normalized_status: 'DELIVERED', delivered_local: '2026-11-01 10:00:00', delivered_gmt_offset: '+04:00', delivered_signed_by: 'AHMED', delivered_location: 'DUBAI-AE', dhl_shipment_id: 4 }))
    dhl.get.mockResolvedValue({ id: 4, shippec_reference: 'SHIPPEC-ABC', product_name: 'EXPRESS WORLDWIDE', pickup_option: 'none', pickup_id: null, service_point_name: null,
      documents: [{ id: 1, document_type: 'shipping_label', content_type: 'application/pdf', size_bytes: 1, sha256: 'x' }] })
    renderApp('/shipment-tracking/9988679120')
    expect(await screen.findByRole('heading', { name: /9988679120/ })).toBeTruthy()
    const timeline = screen.getByRole('heading', { name: /رحلة الشحنة \(3\)/ }).parentElement!
    const events = within(timeline).getAllByRole('listitem')
    expect(events.map((e) => e.getAttribute('data-event-code'))).toEqual(['OK', 'AF', 'PU'])
    expect(within(events[2]).getByText(/تم الاستلام من المرسل/)).toBeTruthy()
    expect(within(events[0]).getByText('AHMED')).toBeTruthy()
    expect(screen.getByText('تم التسليم', { selector: 'h2' })).toBeTruthy()
    expect(screen.getAllByText('AHMED').length).toBeGreaterThan(0)
    expect(screen.getByText('JD014600004617230779')).toBeTruthy()
    expect(await screen.findByText('SHIPPEC-ABC')).toBeTruthy()
    expect(screen.getByText('EXPRESS WORLDWIDE')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'ملصق الشحن' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'ملصق الشحن الكامل' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /تحديث الحالة من DHL/ })).toBeTruthy()
  })

  it('«ملصق الشحن الكامل» comes FIRST (above the single documents) and downloads the complete DHL PDF of the AWB — never a new shipment; unavailable → a clear message', async () => {
    svc.details.mockResolvedValue(details('1675565474', { normalized_status: 'PRE_TRANSIT', dhl_shipment_id: 7 }))
    dhl.get.mockResolvedValue({ id: 7, creation_status: 'created', shippec_reference: 'SHIPPEC-5513F39F33A4', product_name: 'EXPRESS WORLDWIDE', pickup_option: 'none', pickup_id: null, service_point_name: null,
      documents: [
        { id: 1, document_type: 'shipping_label', content_type: 'application/pdf', size_bytes: 1, sha256: 'x' },
        { id: 2, document_type: 'waybill', content_type: 'application/pdf', size_bytes: 1, sha256: 'y' },
        { id: 3, document_type: 'proforma_invoice', content_type: 'application/pdf', size_bytes: 1, sha256: 'z' },
      ] })
    svc.downloadAwbBundle.mockResolvedValue({ blob: new Blob(['%PDF']), filename: 'DHL-1675565474-documents.pdf', pages: 3 })
    renderApp('/shipment-tracking/1675565474')
    const box = await screen.findByTestId('tracking-documents')
    const buttons = within(box).getAllByRole('button')
    expect(buttons.map((b) => b.textContent?.trim())).toEqual(['ملصق الشحن الكامل', 'ملصق الشحن', 'بوليصة الشحن', 'الفاتورة المبدئية'])
    fireEvent.click(buttons[0])
    await waitFor(() => expect(files.downloadBlob).toHaveBeenCalledWith('DHL-1675565474-documents.pdf', expect.any(Blob)))
    expect(svc.downloadAwbBundle).toHaveBeenCalledWith('1675565474')
    expect(screen.getByRole('link', { name: /إدارة الشحنة والمستندات/ }).getAttribute('href')).toBe('/create-shipment/success/7')
    const { toast } = await import('react-hot-toast')
    svc.downloadAwbBundle.mockRejectedValue(new ApiError('none', 404, 'DOCUMENTS_UNAVAILABLE'))
    fireEvent.click(screen.getByTestId('full-shipping-documents'))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/لا تُنشأ بوليصة جديدة/)))
  })

  it('a SHIPPEC shipment cancelled / superseded in SHIPPEC keeps its tracking page and shows that state (with the replacement AWB)', async () => {
    svc.details.mockResolvedValue(details('1675565474', { normalized_status: 'PRE_TRANSIT', shipment_status: 'superseded', replaced_by_awb: '1675565999' }))
    renderApp('/shipment-tracking/1675565474')
    const tag = await screen.findByTestId('tracking-shipment-superseded')
    expect(tag.textContent).toContain('1675565999')
    expect(within(tag).getByRole('link').getAttribute('href')).toBe('/shipment-tracking/1675565999')
    cleanup()
    svc.details.mockResolvedValue(details('1675565474', { shipment_status: 'cancelled' }))
    renderApp('/shipment-tracking/1675565474')
    expect((await screen.findByTestId('tracking-shipment-cancelled')).textContent).toBe('ملغاة في SHIPPEC')
    cleanup()
    svc.list.mockResolvedValue(page([item('1675565474', { shipment_status: 'cancelled' }), item('1675565999', { shipment_status: 'booked' })]))
    renderApp('/shipment-tracking')
    expect((await screen.findAllByTestId('tracking-row-cancelled')).length).toBeGreaterThan(0)
  })

  it('QA 3D.1: no DHL pickup event — "not picked up yet" only before transit; otherwise "not available from DHL"', async () => {
    svc.details.mockResolvedValue(details('9356579890', { normalized_status: 'DELIVERED', pickup_local: null, pickup_gmt_offset: null }))
    renderApp('/shipment-tracking/9356579890')
    await screen.findByRole('heading', { name: /9356579890/ })
    expect(screen.getByText('الاستلام من DHL').parentElement!.textContent).toContain('غير متاح من DHL')
    expect(screen.queryByText('لم تستلمها DHL بعد')).toBeNull()
    cleanup()
    svc.details.mockResolvedValue(details('4623576403', { normalized_status: 'PRE_TRANSIT', pickup_local: null, pickup_gmt_offset: null, events: [] }))
    renderApp('/shipment-tracking/4623576403')
    await screen.findByRole('heading', { name: /4623576403/ })
    expect(screen.getByText('الاستلام من DHL').parentElement!.textContent).toContain('لم تستلمها DHL بعد')
  })

  it('an AWB SHIPPEC does not track: staff may ask DHL; a viewer cannot (and cannot refresh)', async () => {
    svc.details.mockRejectedValue(new ApiError('not found', 404, 'TRACKING_NOT_FOUND'))
    svc.lookup.mockResolvedValue({ result: 'remote', awb: '5550000777', record: details('5550000777') })
    renderApp('/shipment-tracking/5550000777')
    fireEvent.click(await screen.findByRole('button', { name: /البحث لدى DHL/ }))
    expect(await screen.findByRole('heading', { name: /5550000777/ })).toBeTruthy()
    cleanup()
    auth.role = 'viewer'
    svc.details.mockResolvedValue(details('9988679120'))
    renderApp('/shipment-tracking/9988679120')
    await screen.findByRole('heading', { name: /9988679120/ })
    expect(screen.queryByRole('button', { name: /تحديث الحالة/ })).toBeNull()
    cleanup()
    svc.details.mockRejectedValue(new ApiError('not found', 404, 'TRACKING_NOT_FOUND'))
    renderApp('/shipment-tracking/5550000777')
    expect(await screen.findByText(/غير مسجلة في SHIPPEC بعد/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /البحث لدى DHL/ })).toBeNull()
  })
})

describe('/shipment-tracking/:awb — AWB / waybill download & print', () => {
  const withDoc = (awb: string) => details(awb, { awb_document: { available: true, type: 'waybill', content_type: 'application/pdf' } })

  it('«تنزيل البوليصة» next to «طباعة البوليصة»: one authenticated Backend download, DHL-AWB-<AWB>.pdf, loading state, double click ignored', async () => {
    svc.details.mockResolvedValue(withDoc('6606077671'))
    let resolve!: (v: { blob: Blob; filename: string }) => void
    svc.downloadAwbDocument.mockReturnValue(new Promise((r) => { resolve = r }))
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    renderApp('/shipment-tracking/6606077671')
    await screen.findByRole('heading', { name: /6606077671/ })
    const actions = screen.getByTestId('awb-actions')
    const print = within(actions).getByRole('button', { name: /طباعة البوليصة/ })
    const download = within(actions).getByRole('button', { name: /تنزيل البوليصة/ })
    // side by side, in the same action group as the DHL refresh
    expect(print.nextElementSibling).toBe(download)
    expect(within(actions).getByRole('button', { name: /تحديث الحالة من DHL/ })).toBeTruthy()

    fireEvent.click(download)
    fireEvent.click(download)
    fireEvent.click(print)
    expect(await within(actions).findByText('جاري التنزيل…')).toBeTruthy()
    expect((within(actions).getByRole('button', { name: /جاري التنزيل/ }) as HTMLButtonElement).disabled).toBe(true)
    expect(svc.downloadAwbDocument).toHaveBeenCalledTimes(1)
    expect(svc.downloadAwbDocument).toHaveBeenCalledWith('6606077671')

    const blob = new Blob(['%PDF-1.4'], { type: 'application/pdf' })
    resolve({ blob, filename: 'DHL-AWB-6606077671.pdf' })
    await waitFor(() => expect(files.downloadBlob).toHaveBeenCalledWith('DHL-AWB-6606077671.pdf', blob))
    expect(files.printBlob).not.toHaveBeenCalled()
    expect(await within(actions).findByRole('button', { name: /تنزيل البوليصة/ })).toBeTruthy()
    // the page itself never contacted DHL (the service talks to the SHIPPEC Backend)
    expect(fetchSpy.mock.calls.some(([u]) => /dhl\.com/i.test(String(u)))).toBe(false)
    fetchSpy.mockRestore()
  })

  it('print uses the same stored document (no new tab, no base64)', async () => {
    svc.details.mockResolvedValue(withDoc('6606077671'))
    const blob = new Blob(['%PDF-1.4'], { type: 'application/pdf' })
    svc.downloadAwbDocument.mockResolvedValue({ blob, filename: 'DHL-AWB-6606077671.pdf' })
    renderApp('/shipment-tracking/6606077671')
    fireEvent.click(await screen.findByRole('button', { name: /طباعة البوليصة/ }))
    await waitFor(() => expect(files.printBlob).toHaveBeenCalledWith(blob))
    expect(files.downloadBlob).not.toHaveBeenCalled()
  })

  it('no stored document: Arabic "unavailable" toast, no request; a Backend 404 is explained the same way', async () => {
    const { toast } = await import('react-hot-toast')
    svc.details.mockResolvedValue(details('6606077671', { awb_document: { available: false, type: null, content_type: null } }))
    renderApp('/shipment-tracking/6606077671')
    fireEvent.click(await screen.findByRole('button', { name: /تنزيل البوليصة/ }))
    expect(svc.downloadAwbDocument).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith(AWB_DOC_UNAVAILABLE, expect.anything())
    cleanup()

    svc.details.mockResolvedValue(withDoc('6606077671'))
    svc.downloadAwbDocument.mockRejectedValue(new ApiError('مستند البوليصة غير متاح', 404, 'AWB_DOCUMENT_UNAVAILABLE'))
    renderApp('/shipment-tracking/6606077671')
    fireEvent.click(await screen.findByRole('button', { name: /تنزيل البوليصة/ }))
    await waitFor(() => expect(toast.error).toHaveBeenLastCalledWith(AWB_DOC_UNAVAILABLE))
    expect(files.downloadBlob).not.toHaveBeenCalled()
  })

  it('a role without the document right (viewer) sees no print / download', async () => {
    auth.role = 'viewer'
    svc.details.mockResolvedValue(withDoc('6606077671'))
    renderApp('/shipment-tracking/6606077671')
    await screen.findByRole('heading', { name: /6606077671/ })
    expect(screen.queryByRole('button', { name: /تنزيل البوليصة/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /طباعة البوليصة/ })).toBeNull()
  })
})

describe('«متابعة البوليصة» — the two admin actions («تحقق البوليصة» / «مزامنة الفواتير»)', () => {
  const idle = { eligible: 324, run: null, blocked: null }
  const rec = (over: Record<string, unknown> = {}) => ({
    normalized_status: 'IN_TRANSIT', sync_status: 'ok', current_description: 'Arrived at DHL Sort Facility - RIYADH-SA', current_location: 'RIYADH-SA',
    last_event_local: '2026-11-20 10:15:00', last_event_gmt_offset: '+03:00', last_synced_at: new Date().toISOString(), last_attempt_at: null, ...over,
  })
  const ok = (awb: string, over: Record<string, unknown> = {}) => ({ input: awb, awb, result: 'success', registered: true, normalized_status: 'IN_TRANSIT', error_code: null, detail: null, registered_now: false, record: rec(), ...over })
  const actions = () => screen.findByTestId('tracking-actions')

  it('the old engineering panel is gone: only «تحقق البوليصة» and «مزامنة الفواتير» (admin); other roles see neither', async () => {
    svc.pendingSyncStatus.mockResolvedValue(idle)
    renderApp()
    await screen.findAllByRole('row')
    expect(screen.queryByTestId('tracking-actions')).toBeNull()
    expect(svc.pendingSyncStatus).not.toHaveBeenCalled()
    cleanup()

    auth.role = 'admin'
    renderApp()
    const bar = await actions()
    expect(within(bar).getAllByRole('button').map((b) => b.textContent!.trim())).toEqual(['تحقق البوليصة', 'مزامنة الفواتير'])
    await screen.findAllByRole('row')
    const text = document.body.textContent!
    for (const gone of ['تم تسجيل', 'فحص الفواتير', 'تحقق تجريبي', 'حجم الدفعة', 'بدء المزامنة الأولية', 'الحصة', 'فاصل الطلبات', 'طلبات DHL اليوم', 'دفعات رفضتها DHL', 'بوالص في كل طلب', 'إيقاف مؤقت']) {
      expect([gone, text.includes(gone)]).toEqual([gone, false])
    }
    // the normal SHIPPEC search and the list are unchanged
    expect(screen.getByPlaceholderText('رقم البوليصة، رقم الفاتورة، اسم العميل أو الجوال')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'ابحث برقم البوليصة AWB' })).toBeTruthy()
  })

  it('«بانتظار المزامنة» and «لا تتوفر بيانات DHL» are two separate counters / filters', async () => {
    svc.summary.mockResolvedValue({ ...summary(), counts: { ...summary().counts, not_synced: 8688, waiting_sync: 4, pending_sync: 4, dhl_no_data: 8684 } })
    renderApp()
    const counters = await screen.findByTestId('tracking-counters')
    await waitFor(() => expect(within(counters).getByRole('radio', { name: /بانتظار المزامنة\s*·\s*4$/ })).toBeTruthy())
    fireEvent.click(within(counters).getByRole('radio', { name: /بانتظار المزامنة/ }))
    await waitFor(() => expect(svc.list).toHaveBeenLastCalledWith(expect.objectContaining({ view: 'active', status: 'pending_sync', page: 1 })))
    fireEvent.click(within(counters).getByRole('radio', { name: /لا تتوفر بيانات DHL\s*·\s*8684/ }))
    await waitFor(() => expect(svc.list).toHaveBeenLastCalledWith(expect.objectContaining({ view: 'active', status: 'dhl_no_data', page: 1 })))
  })

  it('«تحقق البوليصة»: lines / commas, leading zeros kept, duplicates dropped, invalid numbers never sent, 5 AWBs per request, summary + each result, page refreshed', async () => {
    auth.role = 'admin'
    svc.pendingSyncStatus.mockResolvedValue(idle)
    renderApp()
    const bar = await actions()
    fireEvent.click(within(bar).getByRole('button', { name: /تحقق البوليصة/ }))
    const panel = await screen.findByTestId('verify-panel')
    const input = within(panel).getByLabelText('أرقام البوالص')
    const send = () => within(panel).getByRole('button', { name: /تحقق الآن|جاري التحقق/ }) as HTMLButtonElement

    fireEvent.change(input, { target: { value: '6606077671\n12345, 2816850120' } })
    expect(within(panel).getByRole('alert').textContent).toContain('12345')
    expect(send().disabled).toBe(true)

    const awbs = ['6606077671', '2816850120', '0012345678', '1000000001', '1000000002', '1000000003', '1000000004']
    fireEvent.change(input, { target: { value: `${awbs.slice(0, 3).join('\n')}\n${awbs.slice(3).join(', ')}, 6606077671` } })
    expect(panel.textContent).toContain('7 بوالص — حُذف المكرر (1)')
    svc.verifyAwbs
      .mockResolvedValueOnce({ api_calls: 5, stopped_by: null, results: [
        ok('6606077671'),
        ok('2816850120', { registered_now: true }),
        { input: '0012345678', awb: '0012345678', result: 'not_found', registered: true, normalized_status: null, error_code: 'DHL_NOT_FOUND', detail: null, record: rec({ normalized_status: null, sync_status: 'not_found', current_description: null, last_synced_at: null }) },
        ok('1000000001'), ok('1000000002'),
      ] })
      .mockResolvedValueOnce({ api_calls: 1, stopped_by: null, results: [
        { input: '1000000003', awb: '1000000003', result: 'temporary_error', registered: true, normalized_status: null, error_code: 'DHL_TIMEOUT', detail: 'raw dhl text', record: null },
        { input: '1000000004', awb: '1000000004', result: 'not_found', registered: false, normalized_status: null, error_code: 'DHL_NOT_FOUND', detail: null, record: null },
      ] })
    const summaryCalls = svc.summary.mock.calls.length
    fireEvent.click(send())
    fireEvent.click(send()) // double click: one verification
    const results = await within(panel).findByTestId('verify-results')
    expect(svc.verifyAwbs.mock.calls).toEqual([[awbs.slice(0, 5)], [awbs.slice(5)]])
    expect(results.textContent).toContain('تم التحقق من 7 بوالص')
    expect(results.textContent).toContain('وجدت بيانات: 4')
    expect(results.textContent).toContain('لا تتوفر بيانات: 2')
    expect(results.textContent).toContain('تعذر التحقق مؤقتًا: 1')
    const row = (awb: string) => results.querySelector(`[data-verify-awb="${awb}"]`) as HTMLElement
    expect(row('0012345678').textContent).toContain('0012345678') // never split, leading zeros kept
    expect(row('6606077671').textContent).toContain('تم العثور على بيانات البوليصة وتحديثها بنجاح.')
    expect(row('6606077671').textContent).toContain('Arrived at DHL Sort Facility')
    expect(row('6606077671').textContent).toContain('20/11/2026 10:15')
    expect(within(row('6606077671')).getByRole('link', { name: 'فتح تفاصيل الشحنة' }).getAttribute('href')).toBe('/shipment-tracking/6606077671')
    expect(row('2816850120').textContent).toContain('وأُضيفت إلى متابعة SHIPPEC')
    expect(row('0012345678').textContent).toContain('لا تتوفر بيانات تتبع من DHL لهذه البوليصة.')
    expect(row('0012345678').textContent).toContain('تم التحقق مباشرة من DHL.')
    expect(row('1000000003').textContent).toContain('لم تستجب DHL في الوقت المحدد')
    expect(results.textContent).not.toContain('raw dhl text') // never DHL's raw text / JSON
    await waitFor(() => expect(svc.summary.mock.calls.length).toBeGreaterThan(summaryCalls)) // counters + list refreshed
  })

  it('«تحقق البوليصة»: DHL asks to slow down (429) → the rest is not sent and shown as "not verified for now"', async () => {
    auth.role = 'admin'
    svc.pendingSyncStatus.mockResolvedValue(idle)
    svc.verifyAwbs.mockResolvedValueOnce({ api_calls: 1, stopped_by: 'DHL_RATE_LIMITED', results: [
      { input: '1000000001', awb: '1000000001', result: 'temporary_error', registered: true, normalized_status: null, error_code: 'DHL_RATE_LIMITED', detail: null, record: null },
      { input: '1000000002', awb: '1000000002', result: 'skipped', registered: true, normalized_status: null, error_code: 'DHL_RATE_LIMITED', detail: null, record: null },
    ] })
    renderApp()
    fireEvent.click(within(await actions()).getByRole('button', { name: /تحقق البوليصة/ }))
    const panel = await screen.findByTestId('verify-panel')
    fireEvent.change(within(panel).getByLabelText('أرقام البوالص'), { target: { value: Array.from({ length: 8 }, (_, i) => String(1000000001 + i)).join('\n') } })
    fireEvent.click(within(panel).getByRole('button', { name: /تحقق الآن/ }))
    const results = await within(panel).findByTestId('verify-results')
    expect(svc.verifyAwbs).toHaveBeenCalledTimes(1) // nothing more after DHL's 429
    expect(results.textContent).toContain('تم التحقق من 8 بوالص')
    expect(results.textContent).toContain('تعذر التحقق مؤقتًا: 8')
    expect(results.textContent).toContain('DHL مشغولة حاليًا')
  })

  it('«مزامنة الفواتير»: confirmation with the eligible count → one start (double click safe) → minimal progress → «اكتملت المزامنة» + page refreshed', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      auth.role = 'admin'
      const running = { id: 9, status: 'running', total: 324, processed: 85, found: 63, no_data: 18, temporary: 4, skipped: 0, started_at: new Date().toISOString(), finished_at: null }
      svc.pendingSyncStatus.mockResolvedValue(idle)
      let resolveStart!: (v: unknown) => void
      svc.startPendingSync.mockReturnValue(new Promise((r) => { resolveStart = r }))
      renderApp()
      fireEvent.click(within(await actions()).getByRole('button', { name: /مزامنة الفواتير/ }))
      const dialog = await screen.findByTestId('sync-dialog')
      expect(dialog.textContent).toContain('سيتم بدء مزامنة البوالص الموجودة حاليًا في «بانتظار المزامنة» مع DHL.')
      expect((await within(dialog).findByTestId('sync-eligible')).textContent).toContain('عدد البوالص المؤهلة للمزامنة: 324')
      const start = within(dialog).getByRole('button', { name: /بدء المزامنة/ })
      fireEvent.click(start)
      fireEvent.click(start)
      expect(svc.startPendingSync).toHaveBeenCalledTimes(1)
      svc.pendingSyncStatus.mockResolvedValue({ eligible: 0, run: running, blocked: null })
      resolveStart({ started: true, already_running: false, nothing_to_sync: false, run_id: 9, queued: 324, status: { eligible: 0, run: running, blocked: null } })

      const progress = await screen.findByTestId('pending-sync-progress')
      expect(progress.textContent).toContain('تمت معالجة 85 من 324')
      expect(progress.textContent).toContain('وجدت بيانات: 63')
      expect(progress.textContent).toContain('لا تتوفر بيانات: 18')
      expect(progress.textContent).toContain('تعذر مؤقتًا: 4')
      const syncBtn = within(screen.getByTestId('tracking-actions')).getByRole('button', { name: /جاري المزامنة/ }) as HTMLButtonElement
      expect(syncBtn.disabled).toBe(true)
      for (const word of ['concurrency', 'batch', 'lane', 'Retry-After', 'حجم الدفعة']) expect(progress.textContent).not.toContain(word)

      // the run completes → result + counters, filters and list refreshed
      const summaryCalls = svc.summary.mock.calls.length
      const listCalls = svc.list.mock.calls.length
      svc.pendingSyncStatus.mockResolvedValue({ eligible: 0, run: { ...running, status: 'completed', processed: 324, found: 270, no_data: 46, temporary: 8, finished_at: new Date().toISOString() }, blocked: null })
      await vi.advanceTimersByTimeAsync(5_100)
      const done = await screen.findByTestId('pending-sync-done')
      expect(done.textContent).toContain('اكتملت المزامنة')
      for (const [label, v] of [['تمت معالجة', '324'], ['تم تحديثها بنجاح', '270'], ['لا تتوفر لها بيانات من DHL', '46'], ['تعذر التحقق مؤقتًا', '8']]) {
        expect(done.textContent).toContain(`${label}${v}`)
      }
      expect(svc.summary.mock.calls.length).toBeGreaterThan(summaryCalls)
      expect(svc.list.mock.calls.length).toBeGreaterThan(listCalls)
      expect((within(screen.getByTestId('tracking-actions')).getByRole('button', { name: /مزامنة الفواتير/ }) as HTMLButtonElement).disabled).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('«مزامنة الفواتير» with nothing pending: «لا توجد بوالص بانتظار المزامنة حاليًا.» and no run is started', async () => {
    auth.role = 'admin'
    svc.pendingSyncStatus.mockResolvedValue({ eligible: 0, run: null, blocked: null })
    renderApp()
    fireEvent.click(within(await actions()).getByRole('button', { name: /مزامنة الفواتير/ }))
    const dialog = await screen.findByTestId('sync-dialog')
    expect(await within(dialog).findByText('لا توجد بوالص بانتظار المزامنة حاليًا.')).toBeTruthy()
    expect(within(dialog).queryByRole('button', { name: /بدء المزامنة/ })).toBeNull()
    fireEvent.click(within(dialog).getByRole('button', { name: 'حسنًا' }))
    expect(svc.startPendingSync).not.toHaveBeenCalled()
  })

  it('«مزامنة الفواتير» while DHL tracking is switched off on the server: explained, cannot start', async () => {
    auth.role = 'admin'
    svc.pendingSyncStatus.mockResolvedValue({ eligible: 12, run: null, blocked: 'tracking_disabled' })
    renderApp()
    fireEvent.click(within(await actions()).getByRole('button', { name: /مزامنة الفواتير/ }))
    const dialog = await screen.findByTestId('sync-dialog')
    expect((await within(dialog).findByRole('alert')).textContent).toContain('التتبع من DHL غير مفعّل على الخادم')
    expect((within(dialog).getByRole('button', { name: /بدء المزامنة/ }) as HTMLButtonElement).disabled).toBe(true)
  })
})
