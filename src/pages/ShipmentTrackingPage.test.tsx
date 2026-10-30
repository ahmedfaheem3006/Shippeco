import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import type { TrackingDetails, TrackingItem, TrackingSummary } from '../services/shipmentTracking.service'

const svc = vi.hoisted(() => ({ list: vi.fn(), summary: vi.fn(), details: vi.fn(), refresh: vi.fn() }))
vi.mock('../services/shipmentTracking.service', () => ({ shipmentTrackingService: svc }))
const auth = vi.hoisted(() => ({ role: 'employee' }))
vi.mock('../hooks/useAuthStore', () => ({
  useAuthStore: (sel: (s: unknown) => unknown) => sel({ user: { id: 1, role: auth.role } }),
}))
const realtime = vi.hoisted(() => ({ handlers: [] as Array<{ events: readonly string[]; fn: (b: unknown[]) => void }> }))
vi.mock('../hooks/useRealtimeRefresh', () => ({
  useRealtimeRefresh: (events: readonly string[], fn: (b: unknown[]) => void) => { realtime.handlers.push({ events, fn }) },
}))
vi.mock('react-hot-toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { ShipmentTrackingPage } from './ShipmentTrackingPage'
import { ApiError } from '../utils/apiClient'

Element.prototype.scrollTo = vi.fn() as never
Element.prototype.scrollBy = vi.fn() as never

const item = (awb: string, over: Partial<TrackingItem> = {}): TrackingItem => ({
  id: Number(awb.slice(-4)), awb, carrier: 'DHL', invoice_id: 77, invoice_number: 'DH2580', client_id: 5, customer_name: 'شركة الاختبار',
  booking_date: '2026-10-28', invoice_destination: null, raw_status: 'AF', normalized_status: 'IN_TRANSIT', requires_action: false,
  current_description: 'Arrived at DHL Sort Facility - RIYADH-SA', current_location: 'RIYADH-SA', current_city: 'RIYADH', current_country_code: 'SA',
  origin: 'RIYADH-SA', origin_city: 'RIYADH', origin_country_code: 'SA', destination: 'DUBAI-AE', destination_city: 'DUBAI', destination_country_code: 'AE',
  product_code: 'P', number_of_pieces: 1, estimated_delivery: '2026-11-02T23:59:00', delivered_at: null, delivered_local: null,
  delivered_gmt_offset: null, delivered_location: null, delivered_signed_by: null, last_event_at: '2026-10-29T09:00:00Z',
  last_event_local: '2026-10-29 12:00:00', last_event_gmt_offset: '+03:00', sync_status: 'ok', last_synced_at: new Date(Date.now() - 8 * 60_000).toISOString(),
  last_attempt_at: null, next_sync_at: null, consecutive_failures: 0, last_error_code: null, last_error_message: null, ...over,
})
const details = (awb: string, over: Partial<TrackingDetails> = {}): TrackingDetails => ({
  ...item(awb), shipment_description: 'DOCUMENTS', total_weight: 0.5, weight_unit: 'metric', shipment_timestamp: null,
  pieces: [{ number: 1, trackingNumber: 'JD014600004617230779', typeCode: 'SMF', description: null, weight: 0.5, actualWeight: 0.5, dimensions: { length: 30, width: 20, height: 5 }, eventCount: 2, lastEvent: null }],
  events: [
    { id: 2, raw_status: 'AF', normalized_status: 'IN_TRANSIT', description: 'Arrived at DHL Sort Facility - RIYADH-SA', remark: 'The shipment is on its way', next_steps: 'Please continue to monitor', location: 'RIYADH-SA', location_code: 'RUH', city: 'RIYADH', country_code: 'SA', event_date: '2026-10-29', event_time: '12:00:00', gmt_offset: '+03:00', event_at: '2026-10-29T09:00:00Z', signed_by: null, sequence: 1 },
    { id: 1, raw_status: 'PU', normalized_status: 'PICKED_UP', description: 'Shipment picked up', remark: null, next_steps: null, location: 'RIYADH-SA', location_code: 'RUH', city: 'RIYADH', country_code: 'SA', event_date: '2026-10-29', event_time: '08:00:00', gmt_offset: '+03:00', event_at: '2026-10-29T05:00:00Z', signed_by: null, sequence: 0 },
  ],
  refresh_cooldown_seconds: 60,
  ...over,
})
const summary = (over: Partial<TrackingSummary['counts']> = {}): TrackingSummary => ({
  counts: { total: 12, in_transit: 5, out_for_delivery: 2, delivered: 3, problem: 2, exception: 1, on_hold: 1, customs: 1, pre_transit: 0, not_synced: 0, unknown: 0, stale: 0, failed: 0, last_synced_at: new Date().toISOString(), ...over },
  countries: { origin: [{ code: 'SA', count: 12 }], destination: [{ code: 'AE', count: 7 }, { code: 'GB', count: 5 }] },
  integration: { enabled: true, env: 'production', usable: true, syncEnabled: true, syncIntervalMinutes: 30 },
})
const page = (items: TrackingItem[], total = items.length, totalPages = 1, p = 1) => ({ items, pagination: { page: p, limit: 20, total, totalPages } })

function Where() {
  return <div data-testid="where">{useLocation().search}</div>
}
const renderPage = (url = '/shipment-tracking') =>
  render(<MemoryRouter initialEntries={[url]}><ShipmentTrackingPage /><Where /></MemoryRouter>)

afterEach(() => cleanup())
beforeEach(() => {
  vi.clearAllMocks()
  realtime.handlers = []
  auth.role = 'employee'
  svc.summary.mockResolvedValue(summary())
  svc.list.mockResolvedValue(page([item('9988679120'), item('1111111111', { normalized_status: 'DELIVERED', raw_status: 'OK' })]))
  svc.details.mockImplementation(async (awb: string) => details(awb))
})

describe('ShipmentTrackingPage', () => {
  it('summary cards come from the API (PostgreSQL), and a card filters the list', async () => {
    renderPage()
    for (const [label, n] of [['إجمالي الشحنات', '12'], ['قيد النقل', '5'], ['خرجت للتسليم', '2'], ['يوجد مشكلة', '2'], ['تم التسليم', '3']]) {
      const card = (await screen.findAllByText(label)).map((el) => el.closest('button')).find((b) => b?.getAttribute('aria-pressed') !== null)!
      expect(card).toHaveTextContent(n)
    }
    const problem = screen.getAllByText('يوجد مشكلة').map((el) => el.closest('button')).find((b) => b?.hasAttribute('aria-pressed'))!
    fireEvent.click(problem)
    await waitFor(() => expect(svc.list).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'problem', page: 1 })))
  })

  it('shows a skeleton while loading, then the shipment cards with every field', async () => {
    let resolve!: (v: unknown) => void
    svc.list.mockReturnValueOnce(new Promise((r) => { resolve = r }))
    renderPage()
    expect(screen.getByRole('status', { name: 'جاري تحميل الشحنات' })).toBeInTheDocument()
    await act(async () => resolve(page([item('9988679120')])))
    const card = (await screen.findByText('998 867 9120')).closest('article')!
    const c = within(card)
    expect(c.getByText('قيد النقل')).toBeInTheDocument()
    expect(c.getByRole('link', { name: /DH2580/ })).toHaveAttribute('href', '/invoices?invoice=77')
    expect(c.getByText('شركة الاختبار')).toBeInTheDocument()
    expect(c.getByText('Arrived at DHL Sort Facility - RIYADH-SA')).toBeInTheDocument()
    expect(c.getByText('28/10/2026')).toBeInTheDocument() // booking date
    expect(c.getByText('02/11/2026')).toBeInTheDocument() // estimated delivery
    expect(c.getByText('29/10/2026 · 12:00')).toBeInTheDocument() // last event (DHL local time)
    expect(c.getByText(/آخر تحديث: منذ 8 دقائق/)).toBeInTheDocument()
  })

  it('search is server-side and debounced; AWB separators are sent as typed (normalized by the server)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    renderPage()
    await waitFor(() => expect(svc.list).toHaveBeenCalledTimes(1))
    const box = screen.getByRole('searchbox')
    fireEvent.change(box, { target: { value: 'AWB 998-867' } })
    fireEvent.change(box, { target: { value: 'AWB 998-867-9120' } })
    expect(svc.list).toHaveBeenCalledTimes(1) // nothing per keystroke
    await act(async () => { vi.advanceTimersByTime(400) })
    await waitFor(() => expect(svc.list).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'AWB 998-867-9120', page: 1 })))
    expect(svc.list).toHaveBeenCalledTimes(2)
    expect(svc.refresh).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('filters: status chips, dates, countries, last sync, customer', async () => {
    renderPage()
    await screen.findByText('998 867 9120')
    fireEvent.click(screen.getByRole('radio', { name: 'الجمارك' }))
    await waitFor(() => expect(svc.list).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'customs' })))
    fireEvent.click(screen.getByRole('button', { name: /^الفلاتر/ }))
    fireEvent.change(screen.getByLabelText('من تاريخ الحجز'), { target: { value: '2026-10-01' } })
    fireEvent.change(screen.getByLabelText('بلد الوجهة'), { target: { value: 'AE' } })
    fireEvent.change(screen.getByLabelText('آخر مزامنة'), { target: { value: 'stale' } })
    await waitFor(() => expect(svc.list).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'customs', from: '2026-10-01', destination: 'AE', sync: 'stale' })))
    fireEvent.click(screen.getAllByTitle('عرض شحنات هذا العميل فقط')[0])
    await waitFor(() => expect(svc.list).toHaveBeenLastCalledWith(expect.objectContaining({ client_id: 5 })))
    expect(screen.getByText('العميل: شركة الاختبار')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /مسح البحث والفلاتر/ }))
    await waitFor(() => expect(svc.list).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'all', from: '', client_id: '' })))
  })

  it('pagination is server-side', async () => {
    svc.list.mockResolvedValue(page([item('9988679120')], 45, 3))
    renderPage()
    expect(await screen.findByText(/صفحة 1 من 3 · 45 شحنة/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'الصفحة التالية' }))
    await waitFor(() => expect(svc.list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2, limit: 20 })))
  })

  it('empty state: no DHL shipments at all', async () => {
    svc.list.mockResolvedValue(page([]))
    renderPage()
    expect(await screen.findByText('لا توجد شحنات DHL للمتابعة حاليًا')).toBeInTheDocument()
  })

  it('API error state with retry', async () => {
    svc.list.mockRejectedValueOnce(new ApiError('boom', 500))
    renderPage()
    expect(await screen.findByText('تعذر تحميل الشحنات')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /إعادة المحاولة/ }))
    expect(await screen.findByText('998 867 9120')).toBeInTheDocument()
  })

  it('a never-synced AWB says so — no fake status', async () => {
    svc.list.mockResolvedValue(page([item('2222222222', { normalized_status: null, raw_status: null, last_synced_at: null, sync_status: 'pending', current_description: null })]))
    renderPage()
    const card = (await screen.findByText('222 222 2222')).closest('article')!
    expect(within(card).getAllByText('لم تتم مزامنة بيانات DHL بعد').length).toBeGreaterThan(0)
    expect(within(card).getByText('لم تتم المزامنة')).toBeInTheDocument()
  })

  it('DHL not configured: a clear banner, the list still works', async () => {
    svc.summary.mockResolvedValue({ ...summary(), integration: { enabled: false, env: null, usable: false, syncEnabled: false, syncIntervalMinutes: 30 } })
    renderPage()
    expect(await screen.findByText(/ربط DHL \(MyDHL API\) غير مفعّل/)).toBeInTheDocument()
    expect(await screen.findByText('998 867 9120')).toBeInTheDocument()
  })

  it('realtime: a background-sync event re-reads list and cards without a page refresh', async () => {
    renderPage()
    await screen.findByText('998 867 9120')
    svc.list.mockResolvedValue(page([item('9988679120', { normalized_status: 'OUT_FOR_DELIVERY', raw_status: 'WC' })]))
    svc.summary.mockResolvedValue(summary({ out_for_delivery: 3 }))
    const h = realtime.handlers.filter((x) => x.events.includes('shipment-tracking:updated'))[0]
    await act(async () => h.fn([{ event: 'shipment-tracking:updated', payload: { awbs: ['9988679120'] } }]))
    const card = (await screen.findByText('998 867 9120')).closest('article')!
    await waitFor(() => expect(within(card).getByText('خرجت للتسليم')).toBeInTheDocument())
  })
})

describe('Shipment details', () => {
  const open = async (awb = '9988679120') => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: awb.replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2 $3') }))
    return screen.findByRole('dialog')
  }

  it('header, journey, full timeline with remarks/next steps, pieces', async () => {
    const dlg = within(await open())
    expect(await dlg.findByText('رحلة الشحنة كاملة (2)')).toBeInTheDocument()
    expect(dlg.getByText('The shipment is on its way')).toBeInTheDocument()
    expect(dlg.getByText('Please continue to monitor')).toBeInTheDocument()
    expect(dlg.getByText('JD014600004617230779')).toBeInTheDocument()
    expect(dlg.getByRole('link', { name: /DH2580/ })).toHaveAttribute('href', '/invoices?invoice=77')
    const steps = dlg.getByLabelText('مراحل رحلة الشحنة').querySelectorAll('li')
    expect(steps).toHaveLength(5)
    expect(steps[2]).toHaveAttribute('aria-current', 'step') // in transit
    expect(dlg.getByText(/ليست موقعًا مباشرًا \(GPS\)/)).toBeInTheDocument()
  })

  it('delivered: ✓ تم التسليم with date, time, place and signer', async () => {
    svc.details.mockResolvedValue(details('9988679120', {
      normalized_status: 'DELIVERED', raw_status: 'OK', delivered_local: '2026-10-30 10:15:00', delivered_gmt_offset: '+04:00',
      delivered_location: 'DUBAI-AE', delivered_signed_by: 'AHMED K', delivered_at: '2026-10-30T06:15:00Z',
    }))
    const dlg = within(await open())
    expect(await dlg.findByText('✓ تم التسليم', { selector: 'div' })).toBeInTheDocument()
    expect(dlg.getByText('30/10/2026')).toBeInTheDocument()
    expect(dlg.getByText('10:15 (GMT+04:00)')).toBeInTheDocument()
    expect(dlg.getByText('AHMED K')).toBeInTheDocument()
    expect(dlg.getByLabelText('مراحل رحلة الشحنة').querySelectorAll('li')[4]).toHaveAttribute('aria-current', 'step')
  })

  it.each([
    ['EXCEPTION', 'BA', 'Bad or insufficient address'],
    ['ON_HOLD', 'OH', 'Shipment on hold'],
    ['CUSTOMS', 'CD', 'Clearance delay - importer action required'],
  ])('%s → ⚠ يوجد إجراء مطلوب with the DHL description', async (status, code, text) => {
    svc.details.mockResolvedValue(details('9988679120', { normalized_status: status as never, raw_status: code, requires_action: true, current_description: text }))
    const dlg = within(await open())
    const alert = await dlg.findByRole('alert')
    expect(alert).toHaveTextContent('⚠ يوجد إجراء مطلوب')
    expect(alert).toHaveTextContent(text)
  })

  it('manual refresh: Backend call, then a cooldown (no spam clicking)', async () => {
    svc.refresh.mockResolvedValue({ outcome: 'updated', record: details('9988679120', { normalized_status: 'OUT_FOR_DELIVERY', raw_status: 'WC' }) })
    const dlg = within(await open())
    const btn = await dlg.findByRole('button', { name: 'تحديث الحالة' })
    fireEvent.click(btn)
    fireEvent.click(btn)
    await waitFor(() => expect(svc.refresh).toHaveBeenCalledTimes(1))
    expect(svc.refresh).toHaveBeenCalledWith('9988679120')
    const after = await dlg.findByRole('button', { name: /تحديث الحالة \(\d+\)/ })
    expect(after).toBeDisabled()
    expect(dlg.getAllByText('خرجت للتسليم').length).toBeGreaterThan(0)
  })

  it('refresh failure keeps the old data and says when the last good data is from', async () => {
    svc.refresh.mockRejectedValue(new ApiError('لم تستجب DHL في الوقت المحدد — أعد المحاولة بعد قليل', 504, 'DHL_TIMEOUT'))
    const dlg = within(await open())
    fireEvent.click(await dlg.findByRole('button', { name: 'تحديث الحالة' }))
    expect(await dlg.findByText(/لم تستجب DHL في الوقت المحدد/)).toHaveTextContent(/آخر بيانات ناجحة: \d{2}:\d{2}/)
    expect(dlg.getByText('رحلة الشحنة كاملة (2)')).toBeInTheDocument()
  })

  it('viewer sees details but no refresh button', async () => {
    auth.role = 'viewer'
    const dlg = within(await open())
    await dlg.findByText('رحلة الشحنة كاملة (2)')
    expect(dlg.queryByRole('button', { name: /تحديث الحالة/ })).toBeNull()
  })

  it('not synced yet: honest message', async () => {
    svc.details.mockResolvedValue(details('9988679120', { normalized_status: null, raw_status: null, last_synced_at: null, events: [], pieces: [] }))
    const dlg = within(await open())
    expect((await dlg.findAllByText(/لم تتم مزامنة بيانات DHL بعد/)).length).toBeGreaterThan(0)
  })

  it('notification deep link ?awb= opens the shipment and closing clears it', async () => {
    renderPage('/shipment-tracking?awb=9988679120')
    const dlg = within(await screen.findByRole('dialog'))
    expect(await dlg.findByText('رحلة الشحنة كاملة (2)')).toBeInTheDocument()
    expect(svc.details).toHaveBeenCalledWith('9988679120')
    expect(svc.list).toHaveBeenCalledWith(expect.objectContaining({ q: '9988679120' }))
    fireEvent.click(dlg.getByRole('button', { name: 'إغلاق' }))
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe(''))
  })

  it('details API error', async () => {
    svc.details.mockRejectedValue(new ApiError('لا توجد شحنة DHL بهذا الرقم في SHIPPEC', 404, 'TRACKING_NOT_FOUND'))
    const dlg = within(await open())
    expect(await dlg.findByText('لا توجد شحنة DHL بهذا الرقم في SHIPPEC')).toBeInTheDocument()
  })
})
