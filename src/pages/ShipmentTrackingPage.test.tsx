import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import type { TrackingDetails, TrackingItem, TrackingSummary } from '../services/shipmentTracking.service'

const svc = vi.hoisted(() => ({
  list: vi.fn(), summary: vi.fn(), details: vi.fn(), refresh: vi.fn(), lookup: vi.fn(),
  syncStatus: vi.fn(), discoverInvoices: vi.fn(), startBackfill: vi.fn(), pauseBackfill: vi.fn(),
  repairFalseNotFound: vi.fn(), verifyAwbs: vi.fn(), downloadAwbDocument: vi.fn(), resumeSync: vi.fn(),
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

  it('admin: the DHL quota as learnt (adaptive, last 429 + Retry-After, pause) and a resume after a 401/403 stop', async () => {
    auth.role = 'admin'
    const base = {
      env: 'production', blocked_by: 'auth_stopped', bulk_batch_size: 100, calls_per_cycle: 2, daily_call_limit: 0, backfill_daily_call_limit: 0, verify_max_awbs: 5, run: null,
      registration: { invoice_awbs: 10, registered_from_invoices: 10, tracked: 10, synced: 4, waiting_first_sync: 6, not_found: 0, errors: 0, polling: 6, last_synced_at: null },
      today: { api_calls: 1500, errors: 1, awbs_requested: 1500, awbs_found: 1400, awbs_not_found: 99, awbs_failed: 1 }, last_successful_sync_at: null,
      quota: {
        mode: 'adaptive', daily_call_limit: 0, calls_today: 1500, state: 'stopped', pause_reason: 'auth_stopped', paused_until: null,
        last_429_at: new Date(Date.now() - 3600_000).toISOString(), last_retry_after_seconds: 600, consecutive_429: 0, total_429: 2, consecutive_failures: 0,
        last_failure_at: null, last_failure_code: null, last_auth_error_at: new Date().toISOString(), last_auth_error_code: 'DHL_UNAUTHORIZED', last_dhl_answer_at: null,
        last_paused_at: null, last_resumed_at: null, resume_reason: null,
        pacing: { min_request_interval_ms: 1500, max_concurrency: 1, in_flight: 0, last_request_at: null, backfill_calls_per_minute: 2 },
        batch: { backfill_effective_size: 1, sync_effective_size: 100, max_size: 100 },
      },
    }
    svc.syncStatus.mockResolvedValue(base)
    svc.resumeSync.mockResolvedValue({ ...base, blocked_by: null, quota: { ...base.quota, state: 'running', pause_reason: null } })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderApp()
    const bar = await screen.findByTestId('tracking-sync-status')
    const q = within(bar).getByTestId('quota-status').textContent!
    expect(q).toContain('الحصة: تكيّفية')
    expect(q).toContain('Retry-After 600')
    expect(q).toContain('فاصل الطلبات: 1.5 ث')
    expect(within(bar).getByText(/رفضت DHL بيانات الربط \(401\/403\)/)).toBeTruthy()
    expect(within(bar).getByText(/طلبات DHL اليوم/).textContent).not.toContain('/ 0')
    fireEvent.click(within(bar).getByTestId('quota-resume'))
    await waitFor(() => expect(svc.resumeSync).toHaveBeenCalledTimes(1))
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
    expect(screen.getByRole('button', { name: /ملصق الشحن/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /تحديث الحالة من DHL/ })).toBeTruthy()
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

describe('«متابعة البوليصة» — backfill accounting, repair, verification', () => {
  const baseRun = {
    id: 2, status: 'paused', scope: 'unsynced', batch_size: 100, discovered: 12996, queued: 8796, processed: 4200, successful: 0, not_found: 4200, failed: 0,
    temporary_errors: 0, permanent_errors: 0, skipped: 0, remaining: 8796, batches_completed: 42, api_calls: 42, started_at: new Date().toISOString(),
    last_activity_at: new Date().toISOString(), paused_at: new Date().toISOString(), finished_at: null, last_error_code: null, last_error_at: null,
    awb_attempted: 4200, awb_successful: 0, individually_verified_not_found: 0, unverified_not_found: 4200, batch_rejected: 0,
    temporary_failed: 0, permanent_failed: 0, effective_batch_size: 100, pause_reason: 'admin', repaired_total: 0,
  }
  const status = (run: Record<string, unknown> = baseRun) => ({
    env: 'production', blocked_by: null, bulk_batch_size: 100, calls_per_cycle: 2, daily_call_limit: 300, backfill_daily_call_limit: 240, verify_max_awbs: 5,
    run,
    registration: { invoice_awbs: 14276, registered_from_invoices: 14276, tracked: 14280, synced: 1281, waiting_first_sync: 8796, not_found: 4200, errors: 0, polling: 900, last_synced_at: new Date().toISOString() },
    today: { api_calls: 242, errors: 0, awbs_requested: 19026, awbs_found: 1281, awbs_not_found: 4200, awbs_failed: 0 },
    last_successful_sync_at: new Date().toISOString(),
  })

  it('false not_found from a batch-level 404 is flagged; «إصلاح» repairs (after confirmation); accounting separates batch rejections', async () => {
    auth.role = 'admin'
    svc.syncStatus.mockResolvedValue(status())
    svc.repairFalseNotFound.mockResolvedValue({ examined: 4200, repaired: 4200, skipped_success: 0, skipped_individual_not_found: 0, remaining_pending: 12996, tracking_rows_reset: 4200, runs: [] })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderApp()
    const bar = await screen.findByTestId('tracking-sync-status')
    expect(within(bar).getByRole('alert').textContent).toContain('4,200')
    const acc = within(bar).getByTestId('backfill-accounting')
    expect(acc.textContent).toContain('دفعات رفضتها DHL')
    expect(acc.textContent).toContain('غير موجودة (مؤكدة فرديًا): 0')
    expect(acc.textContent).toContain('حجم الدفعة الفعلي: 100')
    fireEvent.click(within(bar).getByRole('button', { name: /إصلاح «غير موجودة» الخاطئة/ }))
    await waitFor(() => expect(svc.repairFalseNotFound).toHaveBeenCalledTimes(1))
    expect(confirm).toHaveBeenCalled()
    confirm.mockRestore()
  })

  it('no false not_found → no repair button; budget pause explained; resume with a small batch size', async () => {
    auth.role = 'admin'
    svc.syncStatus.mockResolvedValue(status({ ...baseRun, not_found: 3, unverified_not_found: 0, individually_verified_not_found: 3, batch_rejected: 7, effective_batch_size: 12, pause_reason: 'budget_exhausted' }))
    svc.startBackfill.mockResolvedValue({ run_id: 2, created: false, resumed: true, status: status() })
    renderApp()
    const bar = await screen.findByTestId('tracking-sync-status')
    expect(within(bar).queryByRole('button', { name: /إصلاح/ })).toBeNull()
    expect(within(bar).getByText(/نفدت حصة اليوم/)).toBeTruthy()
    expect(within(bar).getByTestId('backfill-accounting').textContent).toContain('دفعات رفضتها DHL: 7')
    fireEvent.change(within(bar).getByLabelText('عدد البوالص في كل طلب DHL'), { target: { value: '5' } })
    fireEvent.click(within(bar).getByRole('button', { name: /استئناف المزامنة/ }))
    await waitFor(() => expect(svc.startBackfill).toHaveBeenCalledWith(5))
  })

  it('controlled verification: up to 5 AWBs, results per AWB', async () => {
    auth.role = 'admin'
    svc.syncStatus.mockResolvedValue(status())
    svc.verifyAwbs.mockResolvedValue({
      api_calls: 2, stopped_by: null,
      results: [
        { input: '6606077671', awb: '6606077671', result: 'success', registered: true, normalized_status: 'IN_TRANSIT', error_code: null, detail: '12 نقطة تتبع' },
        { input: '1000000004', awb: '1000000004', result: 'not_found', registered: true, normalized_status: null, error_code: 'DHL_NOT_FOUND', detail: null },
        { input: 'ABC', awb: null, result: 'skipped', registered: false, normalized_status: null, error_code: 'INVALID_AWB', detail: 'ليس رقم DHL' },
      ],
    })
    renderApp()
    const bar = await screen.findByTestId('tracking-sync-status')
    fireEvent.click(within(bar).getByRole('button', { name: /تحقق تجريبي/ }))
    const panel = within(bar).getByTestId('verify-panel')
    fireEvent.change(within(panel).getByLabelText('أرقام البوالص للتحقق'), { target: { value: '6606077671, 1000000004\nABC 1 2 3 4' } })
    fireEvent.click(within(panel).getByRole('button', { name: /^تحقق$/ }))
    await waitFor(() => expect(svc.verifyAwbs).toHaveBeenCalledWith(['6606077671', '1000000004', 'ABC', '1', '2']))
    const list = await within(panel).findByRole('list', { name: 'نتائج التحقق' })
    expect(list.textContent).toContain('نجحت')
    expect(list.textContent).toContain('غير موجودة لدى DHL (طلب منفرد)')
    expect(list.textContent).toContain('لم تُرسل')
  })
})
