import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import type { TrackingDetails, TrackingItem, TrackingSummary } from '../services/shipmentTracking.service'

const svc = vi.hoisted(() => ({
  list: vi.fn(), summary: vi.fn(), details: vi.fn(), refresh: vi.fn(), lookup: vi.fn(),
  syncStatus: vi.fn(), discoverInvoices: vi.fn(), startBackfill: vi.fn(), pauseBackfill: vi.fn(),
}))
vi.mock('../services/shipmentTracking.service', () => ({ shipmentTrackingService: svc }))
const dhl = vi.hoisted(() => ({ get: vi.fn(), getPickup: vi.fn(), downloadDocument: vi.fn() }))
vi.mock('../services/dhlShipment.service', () => ({ dhlShipmentService: dhl }))
const auth = vi.hoisted(() => ({ role: 'employee' }))
vi.mock('../hooks/useAuthStore', () => ({ useAuthStore: (sel: (s: unknown) => unknown) => sel({ user: { id: 1, role: auth.role } }) }))
vi.mock('../hooks/useRealtimeRefresh', () => ({ useRealtimeRefresh: () => undefined }))
vi.mock('react-hot-toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { ShipmentTrackingPage } from './ShipmentTrackingPage'
import { ShipmentTrackingDetailsPage } from './ShipmentTrackingDetailsPage'
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

describe('«متابعة البوليصة» — list', () => {
  it('one full-width row per shipment (cards on small screens); a shipment without DHL data stays visible', async () => {
    renderApp()
    const rows = await screen.findAllByRole('row')
    expect(rows.length).toBe(3) // header + 2
    const r1 = rows.find((r) => r.getAttribute('data-tracking-awb') === '9988679120')!
    expect(within(r1).getByText('998 867 9120')).toBeTruthy()
    expect(within(r1).getByText('DH2580')).toBeTruthy()
    expect(within(r1).getByText('قيد النقل')).toBeTruthy()
    expect(within(r1).getByText(/استلام DHL: 28\/10\/2026/)).toBeTruthy()
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
    expect(within(rows.find((r) => r.getAttribute('data-tracking-awb') === '1111111111')!).getByText('غير موجودة لدى DHL')).toBeTruthy()
    expect(within(rows.find((r) => r.getAttribute('data-tracking-awb') === '2222222222')!).getByText('غير متاحة مؤقتًا')).toBeTruthy()
  })

  it('admin sees the DHL sync status (registered / synced / remaining) and can start the backfill; other roles do not', async () => {
    const status = {
      env: 'production', blocked_by: null, bulk_batch_size: 100, calls_per_cycle: 2, daily_call_limit: 300,
      run: { id: 1, status: 'running', scope: 'unsynced', batch_size: 100, discovered: 14271, queued: 5971, processed: 8300, successful: 8000, not_found: 280, failed: 20,
        temporary_errors: 20, permanent_errors: 0, skipped: 0, remaining: 5971, batches_completed: 83, api_calls: 84, started_at: new Date().toISOString(),
        last_activity_at: new Date().toISOString(), paused_at: null, finished_at: null, last_error_code: null, last_error_at: null },
      registration: { invoice_awbs: 14271, registered_from_invoices: 12840, tracked: 12850, synced: 8300, waiting_first_sync: 4000, not_found: 280, errors: 20, polling: 900, last_synced_at: new Date().toISOString() },
      today: { api_calls: 84, errors: 0, awbs_requested: 8300, awbs_found: 8000, awbs_not_found: 280, awbs_failed: 20 },
      last_successful_sync_at: new Date().toISOString(),
    }
    svc.syncStatus.mockResolvedValue(status)
    renderApp()
    await screen.findAllByRole('row')
    expect(screen.queryByTestId('tracking-sync-status')).toBeNull() // employee: nothing
    expect(svc.syncStatus).not.toHaveBeenCalled()
    cleanup()

    auth.role = 'admin'
    renderApp()
    const bar = await screen.findByTestId('tracking-sync-status')
    expect(within(bar).getByText('تم تسجيل 12,840 من 14,271 بوليصة — تمت مزامنة 8,300')).toBeTruthy()
    expect(within(bar).getByText(/المتبقي/).textContent).toContain('5,971')
    expect(within(bar).getByRole('progressbar').getAttribute('aria-valuenow')).toBe('58')
    // running → pause is offered; the list stays usable meanwhile
    svc.pauseBackfill.mockResolvedValue({ ...status, run: { ...status.run, status: 'paused' } })
    fireEvent.click(within(bar).getByRole('button', { name: /إيقاف مؤقت/ }))
    await waitFor(() => expect(svc.pauseBackfill).toHaveBeenCalledTimes(1))
    expect(screen.getAllByRole('row').length).toBeGreaterThan(1)

    // nothing running → start (after confirmation)
    cleanup()
    svc.syncStatus.mockResolvedValue({ ...status, run: null, blocked_by: 'sync_disabled' })
    svc.startBackfill.mockResolvedValue({ run_id: 2, created: true, resumed: false, status })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderApp()
    const bar2 = await screen.findByTestId('tracking-sync-status')
    fireEvent.click(within(bar2).getByRole('button', { name: /بدء المزامنة الأولية/ }))
    await waitFor(() => expect(svc.startBackfill).toHaveBeenCalledTimes(1))
    expect(confirm).toHaveBeenCalled()
    confirm.mockRestore()
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
    expect(await screen.findByRole('heading', { name: /998 867 9120/ })).toBeTruthy()
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
    expect(screen.getByRole('button', { name: /ملصق الشحن/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /تحديث الحالة من DHL/ })).toBeTruthy()
  })

  it('QA 3D.1: no DHL pickup event — "not picked up yet" only before transit; otherwise "not available from DHL"', async () => {
    svc.details.mockResolvedValue(details('9356579890', { normalized_status: 'DELIVERED', pickup_local: null, pickup_gmt_offset: null }))
    renderApp('/shipment-tracking/9356579890')
    await screen.findByRole('heading', { name: /935 657 9890/ })
    expect(screen.getByText('الاستلام من DHL').parentElement!.textContent).toContain('غير متاح من DHL')
    expect(screen.queryByText('لم تستلمها DHL بعد')).toBeNull()
    cleanup()
    svc.details.mockResolvedValue(details('4623576403', { normalized_status: 'PRE_TRANSIT', pickup_local: null, pickup_gmt_offset: null, events: [] }))
    renderApp('/shipment-tracking/4623576403')
    await screen.findByRole('heading', { name: /462 357 6403/ })
    expect(screen.getByText('الاستلام من DHL').parentElement!.textContent).toContain('لم تستلمها DHL بعد')
  })

  it('an AWB SHIPPEC does not track: staff may ask DHL; a viewer cannot (and cannot refresh)', async () => {
    svc.details.mockRejectedValue(new ApiError('not found', 404, 'TRACKING_NOT_FOUND'))
    svc.lookup.mockResolvedValue({ result: 'remote', awb: '5550000777', record: details('5550000777') })
    renderApp('/shipment-tracking/5550000777')
    fireEvent.click(await screen.findByRole('button', { name: /البحث لدى DHL/ }))
    expect(await screen.findByRole('heading', { name: /555 000 0777/ })).toBeTruthy()
    cleanup()
    auth.role = 'viewer'
    svc.details.mockResolvedValue(details('9988679120'))
    renderApp('/shipment-tracking/9988679120')
    await screen.findByRole('heading', { name: /998 867 9120/ })
    expect(screen.queryByRole('button', { name: /تحديث الحالة/ })).toBeNull()
    cleanup()
    svc.details.mockRejectedValue(new ApiError('not found', 404, 'TRACKING_NOT_FOUND'))
    renderApp('/shipment-tracking/5550000777')
    expect(await screen.findByText(/غير مسجلة في SHIPPEC بعد/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /البحث لدى DHL/ })).toBeNull()
  })
})
