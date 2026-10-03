import { describe, expect, it } from 'vitest'
import { describeOpenError, resolveNotificationTarget } from './notificationTarget'

describe('resolveNotificationTarget', () => {
  it('payment received on one invoice → that invoice (new format)', () => {
    expect(resolveNotificationTarget({
      type: 'payment_received',
      data: { entity_type: 'invoice', entity_id: 812, invoice_id: 812, link_id: 4, transaction_id: '99' },
    })).toEqual({ kind: 'invoice', id: 812, path: '/invoices?invoice=812' })
  })

  it('payment covering several invoices → the payment link, no guessed invoice', () => {
    expect(resolveNotificationTarget({
      type: 'payment_received',
      data: { entity_type: 'payment_link', entity_id: 4, invoice_ids: [1, 2], link_id: 4 },
    })).toEqual({ kind: 'payment_link', id: 4, path: '/paymob-links?link=4' })
  })

  it('legacy payment notifications (as on production) use their stored invoice_id', () => {
    expect(resolveNotificationTarget({ type: 'payment_received', data: { invoice_id: 15, invoice_ids: null, amount: 203 } }).path)
      .toBe('/invoices?invoice=15')
    expect(resolveNotificationTarget({ type: 'payment_received', data: '{"invoice_id":16,"amount":5}' }).path)
      .toBe('/invoices?invoice=16')
    expect(resolveNotificationTarget({ type: 'payment_received', data: { invoice_id: null, invoice_ids: '[21]' } }).path)
      .toBe('/invoices?invoice=21')
  })

  it('legacy payment without any stored id → general page + explanation (never a guess)', () => {
    const t = resolveNotificationTarget({ type: 'payment_received', data: { invoice_id: null, invoice_ids: null, amount: 409 } })
    expect(t.kind).toBe('page')
    expect(t.path).toBe('/paymob-links')
    expect(t.kind === 'page' && t.unresolvedMessage).toBeTruthy()
  })

  it('task notifications open the task (new + backfilled), legacy without id → tasks page', () => {
    expect(resolveNotificationTarget({ type: 'task', data: { entity_type: 'task', entity_id: 7, taskId: 7, invoiceId: 3 } }).path).toBe('/tasks?task=7')
    expect(resolveNotificationTarget({ type: 'task', data: { invoiceId: 3, taskId: 9 } }).path).toBe('/tasks?task=9')
    const legacy = resolveNotificationTarget({ type: 'task', data: { invoiceId: 3 } })
    expect(legacy.path).toBe('/tasks')
    expect(legacy.kind === 'page' && legacy.unresolvedMessage).toBeTruthy()
  })

  it('collection reminders open the invoice', () => {
    expect(resolveNotificationTarget({ type: 'collection_reminder', data: { invoiceId: 44 } }).path).toBe('/invoices?invoice=44')
  })

  it('review notifications open the payment link', () => {
    expect(resolveNotificationTarget({ type: 'payment_review', data: { link_id: 5, reason: 'amount_mismatch' } }).path).toBe('/paymob-links?link=5')
  })

  it('user notifications', () => {
    expect(resolveNotificationTarget({ type: 'new_user', data: { user_id: 2 } }).path).toBe('/settings')
    expect(resolveNotificationTarget({ type: 'user_approved', data: null }).path).toBe('/dashboard')
  })

  it('ignores any URL carried in the notification and rejects non-numeric / unsafe ids', () => {
    expect(resolveNotificationTarget({ type: 'payment_received', data: { route: 'https://evil.example', invoice_id: 3 } }).path).toBe('/invoices?invoice=3')
    expect(resolveNotificationTarget({ type: 'unknown', data: { route: '/settings' } }).path).toBe('/dashboard')
    expect(resolveNotificationTarget({ type: 'payment_received', data: { invoice_id: '3/../../x' } }).kind).toBe('page')
    expect(resolveNotificationTarget({ type: 'payment_received', data: { invoice_id: -1 } }).kind).toBe('page')
    expect(resolveNotificationTarget({ type: 'task', data: { entity_type: 'task', entity_id: '1e3' } }).kind).toBe('page')
  })
})

describe('describeOpenError', () => {
  it('gives Arabic messages for deleted / forbidden items', () => {
    expect(describeOpenError('invoice', 404)).toBe('الفاتورة غير موجودة أو تم حذفها')
    expect(describeOpenError('payment_link', 404)).toBe('رابط الدفع غير موجود أو تم حذفه')
    expect(describeOpenError('task', 403)).toBe('ليست لديك صلاحية لعرض المهمة')
    expect(describeOpenError('invoice', 500)).toBe('تعذّر فتح الفاتورة، حاول مرة أخرى')
  })
})
