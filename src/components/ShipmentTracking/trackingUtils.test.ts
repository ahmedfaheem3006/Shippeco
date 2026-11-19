import { describe, expect, it } from 'vitest'
import { ApiError } from '../../utils/apiClient'
import {
  canRefreshTracking, describeTrackingError, formatAwb, formatLocal, formatRiyadh, formatYmd, isDhlAwb, journeyStage, needsAction,
  normalizeAwb, placeLabel, rowBadge, statusBadge, syncProblemText, timeAgo,
} from './trackingUtils'

describe('AWB normalization', () => {
  it('ignores separators, spaces and a leading "AWB"', () => {
    expect(normalizeAwb('AWB 998-867-9120')).toBe('9988679120')
    expect(normalizeAwb(' 998 867 9120 ')).toBe('9988679120')
    expect(normalizeAwb('awb:9988679120')).toBe('9988679120')
    expect(isDhlAwb(normalizeAwb('AWB 998-867-9120'))).toBe(true)
    expect(isDhlAwb('12345')).toBe(false)
  })
  it('formats for reading', () => {
    expect(formatAwb('9988679120')).toBe('998 867 9120')
    expect(formatAwb('ABC')).toBe('ABC')
  })
})

describe('status presentation', () => {
  it('never-synced shipments show "not synced", not a fake status', () => {
    expect(statusBadge(null).label).toBe('لم تتم المزامنة')
    expect(statusBadge('DELIVERED').label).toBe('✓ تم التسليم')
    expect(statusBadge('EXCEPTION').label).toBe('يوجد مشكلة')
  })
  it('list badge before DHL ever answered: waiting / not at DHL / temporarily unavailable — then the real status', () => {
    expect(rowBadge({ normalized_status: null, sync_status: 'pending' }).label).toBe('بانتظار أول مزامنة')
    expect(rowBadge({ normalized_status: null, sync_status: 'not_found' }).label).toBe('غير موجودة لدى DHL')
    expect(rowBadge({ normalized_status: null, sync_status: 'error' }).label).toBe('غير متاحة مؤقتًا')
    expect(rowBadge({ normalized_status: 'PRE_TRANSIT', sync_status: 'ok' }).label).toBe('بانتظار الاستلام')
    expect(rowBadge({ normalized_status: 'IN_TRANSIT', sync_status: 'error' }).label).toBe('قيد النقل') // last known status kept
  })
  it('«يوجد إجراء مطلوب» follows the Backend rule', () => {
    expect(needsAction({ normalized_status: 'EXCEPTION', requires_action: false })).toBe(true)
    expect(needsAction({ normalized_status: 'ON_HOLD', requires_action: false })).toBe(true)
    expect(needsAction({ normalized_status: 'CUSTOMS', requires_action: true })).toBe(true)
    expect(needsAction({ normalized_status: 'CUSTOMS', requires_action: false })).toBe(false)
    expect(needsAction({ normalized_status: 'DELIVERED', requires_action: true })).toBe(false)
    expect(needsAction({ normalized_status: null, requires_action: false })).toBe(false)
  })
  it('refresh is for every role except viewer', () => {
    expect(['admin', 'manager', 'accountant', 'employee'].every(canRefreshTracking)).toBe(true)
    expect(canRefreshTracking('viewer')).toBe(false)
    expect(canRefreshTracking(undefined)).toBe(false)
  })
})

describe('journey stage (from checkpoints, not GPS)', () => {
  const t = (normalized_status: never | string | null, current = 'SA', origin = 'SA', dest = 'AE') =>
    journeyStage({ normalized_status: normalized_status as never, current_country_code: current, origin_country_code: origin, destination_country_code: dest })
  it('maps statuses to the 5 stages', () => {
    expect(t(null)).toBe(0)
    expect(t('PRE_TRANSIT')).toBe(0)
    expect(t('PICKED_UP')).toBe(1)
    expect(t('IN_TRANSIT')).toBe(2)
    expect(t('IN_TRANSIT', 'AE')).toBe(3) // checkpoint already in the destination country
    expect(t('CUSTOMS', 'AE')).toBe(3)
    expect(t('OUT_FOR_DELIVERY')).toBe(3)
    expect(t('DELIVERED')).toBe(4)
  })
  it('domestic shipments stay "in transit" until out for delivery', () => {
    expect(t('IN_TRANSIT', 'SA', 'SA', 'SA')).toBe(2)
  })
})

describe('time formatting', () => {
  const now = new Date('2026-10-30T12:00:00Z').getTime()
  it('relative Arabic times', () => {
    expect(timeAgo('2026-10-30T11:59:40Z', now)).toBe('منذ لحظات')
    expect(timeAgo('2026-10-30T11:52:00Z', now)).toBe('منذ 8 دقائق')
    expect(timeAgo('2026-10-30T11:30:00Z', now)).toBe('منذ 30 دقيقة')
    expect(timeAgo('2026-10-30T10:00:00Z', now)).toBe('منذ ساعتين')
    expect(timeAgo('2026-10-28T12:00:00Z', now)).toBe('منذ يومين')
    expect(timeAgo(null, now)).toBe('—')
  })
  it('timestamps in Saudi time (UTC+3), not the browser timezone', () => {
    expect(formatRiyadh('2026-10-30T11:22:00Z')).toBe('30/10/2026, 14:22')
    expect(formatRiyadh('2026-10-30T11:22:00Z', false)).toBe('14:22')
  })
  it('DHL local checkpoint time is shown as DHL reports it, with its offset', () => {
    expect(formatLocal('2023-08-10 11:59:23', '+12:00')).toEqual({ date: '10/08/2023', time: '11:59', offset: 'GMT+12:00' })
    expect(formatLocal(null)).toBeNull()
    expect(formatYmd('2026-10-22')).toBe('22/10/2026')
  })
})

describe('places and errors', () => {
  it('place labels', () => {
    expect(placeLabel('RIYADH-SA', 'RIYADH', 'SA')).toMatch(/ — RIYADH$/)
    expect(placeLabel('SYDNEY-AU', null, null)).toBe('SYDNEY-AU')
    expect(placeLabel(null, null, null)).toBe('—')
  })
  it('server error codes keep their Arabic message', () => {
    expect(describeTrackingError(new ApiError('لم تستجب DHL في الوقت المحدد', 504, 'DHL_TIMEOUT'), 'x')).toBe('لم تستجب DHL في الوقت المحدد')
    expect(describeTrackingError(new ApiError('Not found', 404), 'x')).toBe('لا توجد شحنة DHL بهذا الرقم في SHIPPEC')
    expect(describeTrackingError(new TypeError('Failed to fetch'), 'x')).toMatch(/تعذر الاتصال/)
  })
  it('last-attempt problems', () => {
    expect(syncProblemText({ sync_status: 'ok', last_error_code: null })).toBeNull()
    expect(syncProblemText({ sync_status: 'error', last_error_code: 'DHL_TIMEOUT' })).toMatch(/تعذر التحديث مؤقتًا/)
    expect(syncProblemText({ sync_status: 'not_found', last_error_code: 'DHL_NOT_FOUND' })).toMatch(/لا تتوفر بيانات/)
  })
})
