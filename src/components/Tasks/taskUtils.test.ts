import { describe, it, expect } from 'vitest'
import { ApiError } from '../../utils/apiClient'
import type { Task, TaskMessage } from '../../services/tasks.service'
import {
  describeTaskError, fieldErrorsFrom, filterTasksBySearch, mergeMessages, nearestSurvivingId, neighborIds, validateTaskForm,
} from './taskUtils'

const msg = (id: number, created_at: string, user_id = 1): TaskMessage => ({ id, task_id: 1, user_id, message: `m${id}`, created_at })
const task = (id: number, title: string, extra: Partial<Task> = {}): Task => ({
  id, title, description: '', assigned_to: 2, assigned_by: 1, status: 'open', created_at: '', updated_at: '', ...extra,
})

describe('validateTaskForm', () => {
  it('requires a real title and an assignee, with Arabic messages', () => {
    const e = validateTaskForm({ title: '   ', description: '', assignedTo: null, invoiceId: null })
    expect(e.title).toBe('عنوان المهمة مطلوب')
    expect(e.assigned_to).toBe('اختر الموظف المسؤول عن المهمة')
  })
  it('rejects too short / too long titles and over-long descriptions', () => {
    expect(validateTaskForm({ title: 'ab', description: '', assignedTo: 1, invoiceId: null }).title).toMatch(/3/)
    expect(validateTaskForm({ title: 'x'.repeat(256), description: '', assignedTo: 1, invoiceId: null }).title).toMatch(/255/)
    expect(validateTaskForm({ title: 'مهمة', description: 'x'.repeat(5001), assignedTo: 1, invoiceId: null }).description).toBeTruthy()
  })
  it('accepts a valid form', () => {
    expect(validateTaskForm({ title: 'مراجعة', description: '', assignedTo: 3, invoiceId: null })).toEqual({})
  })
})

describe('mergeMessages — no duplicate replies', () => {
  it('drops a reply that arrives again (own POST + next refresh) and keeps order', () => {
    const cur = [msg(1, '2026-01-01T10:00:00Z'), msg(2, '2026-01-01T10:01:00Z')]
    const merged = mergeMessages(cur, [msg(2, '2026-01-01T10:01:00Z'), msg(3, '2026-01-01T10:02:00Z')])
    expect(merged.map((m) => m.id)).toEqual([1, 2, 3])
  })
  it('returns the same array when nothing is new (so no re-render / no auto-scroll)', () => {
    const cur = [msg(1, '2026-01-01T10:00:00Z')]
    expect(mergeMessages(cur, [msg(1, '2026-01-01T10:00:00Z')])).toBe(cur)
  })
})

describe('filterTasksBySearch', () => {
  const tasks = [
    task(1, 'مراجعة فاتورة أرامكس', { assigned_to_name: 'أحمد' }),
    task(2, 'تحصيل دفعة', { assigned_by_name: 'سارة', invoice_number: 'INV-77' }),
  ]
  it('matches title, people and invoice number, with Arabic letter normalisation', () => {
    expect(filterTasksBySearch(tasks, 'ارامكس').map((t) => t.id)).toEqual([1])
    expect(filterTasksBySearch(tasks, 'احمد').map((t) => t.id)).toEqual([1])
    expect(filterTasksBySearch(tasks, 'ساره').map((t) => t.id)).toEqual([2])
    expect(filterTasksBySearch(tasks, 'inv-77').map((t) => t.id)).toEqual([2])
    expect(filterTasksBySearch(tasks, '  ')).toBe(tasks)
  })
})

describe('prev/next helpers', () => {
  it('neighborIds follows the visible order and disables the ends', () => {
    expect(neighborIds([5, 3, 9], 5)).toEqual({ prev: null, next: 3, index: 0 })
    expect(neighborIds([5, 3, 9], 3)).toEqual({ prev: 5, next: 9, index: 1 })
    expect(neighborIds([5, 3, 9], 9)).toEqual({ prev: 3, next: null, index: 2 })
    expect(neighborIds([5, 3, 9], 42).index).toBe(-1)
  })
  it('nearestSurvivingId prefers the next card, then the previous one', () => {
    const order = [1, 2, 3, 4]
    expect(nearestSurvivingId(order, 2, (id) => id !== 2)).toBe(3)
    expect(nearestSurvivingId(order, 4, (id) => id !== 4)).toBe(3)
    expect(nearestSurvivingId(order, 2, () => false)).toBeNull()
  })
})

describe('describeTaskError / fieldErrorsFrom', () => {
  it('maps network failures and HTTP errors to Arabic reasons', () => {
    expect(describeTaskError(new TypeError('Failed to fetch'), 'x')).toMatch(/تعذر الاتصال/)
    expect(describeTaskError(new ApiError('Access denied. Required role: admin', 403), 'x')).toMatch(/صلاحية/)
    expect(describeTaskError(new ApiError('boom', 500), 'x')).toMatch(/الخادم/)
    expect(describeTaskError(new ApiError('Validation failed', 400, 'VALIDATION_ERROR', [{ field: 'title', message: 'عنوان المهمة مطلوب' }]), 'x')).toBe('عنوان المهمة مطلوب')
  })
  it('puts server field errors next to the right fields', () => {
    const err = new ApiError('Validation failed', 400, 'VALIDATION_ERROR', [{ field: 'assigned_to', message: 'الموظف المحدد غير موجود أو غير مفعّل' }])
    expect(fieldErrorsFrom(err)).toEqual({ assigned_to: 'الموظف المحدد غير موجود أو غير مفعّل' })
  })
})
