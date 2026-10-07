import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ChatPanel } from './ChatPanel'
import { resolveNotificationTarget } from '../../utils/notificationTarget'
import { canSupport, windowState } from '../../utils/support'
import type { ConversationPanel, SupportMessage } from '../../services/supportService'

afterEach(() => cleanup())

const inHours = (h: number) => new Date(Date.now() + h * 3600_000).toISOString()
const panel = (over: Partial<ConversationPanel['conversation']> = {}): ConversationPanel => ({
  conversation: {
    id: 7, wa_id: '966551112222', phone_e164: '+966551112222', profile_name: 'Ahmed', client_id: 1, client_name: 'أحمد', client_match: 'unique',
    status: 'WAITING_FOR_AGENT', ai_enabled: true, assigned_user_id: null, assigned_name: null, current_intent: 'COMPLAINT', last_message_at: null,
    last_message_preview: null, last_message_sender: null, customer_service_window_expires_at: inHours(5), waiting_since: null, unread_count: 0,
    open_ticket_number: null, open_ticket_priority: null, ai_summary: null, conversation_summary: null, structured_state: {}, ...over,
  },
  customer: { id: 1, name: 'أحمد', phone: '0551112222' }, candidates: [], invoices: [], outstanding: null, tickets: [], ai_summary: null, collected: {}, refs: {},
})
const msg = (over: Partial<SupportMessage>): SupportMessage => ({
  id: 1, direction: 'inbound', sender_type: 'customer', sender_name: null, message_type: 'text', text: 'مرحبا', template_name: null, media_id: null,
  media_kind: null, media_mime: null, media_file_name: null, media_size: null, media_status: null, media_reject_reason: null, provider_status: 'received',
  error_code: null, error_message: null, created_at: new Date().toISOString(), delivered_at: null, read_at: null, failed_at: null, meta: {}, ...over,
})
const handlers = () => ({
  onOlder: vi.fn(), onBack: vi.fn(), onTogglePanel: vi.fn(), onTakeover: vi.fn(), onReturnToAi: vi.fn(), onResolve: vi.fn(),
  onSend: vi.fn(async () => true), onTemplate: vi.fn(),
})
const me = { id: 5, canReply: true, canAssign: false, canResolve: true, canManage: false }

describe('ChatPanel', () => {
  it('waiting conversation: shows the takeover button, no composer; failed AI messages are flagged', () => {
    const h = handlers()
    render(<ChatPanel panel={panel()} busy={false} loading={false} hasOlder={false} me={me} {...h}
      messages={[msg({}), msg({ id: 2, direction: 'outbound', sender_type: 'ai', text: 'أهلًا', provider_status: 'failed', error_message: 'Message undeliverable' })]} />)
    fireEvent.click(screen.getByRole('button', { name: /استلام المحادثة/ }))
    expect(h.onTakeover).toHaveBeenCalledWith(false)
    expect(screen.queryByLabelText('رد الموظف')).toBeNull()
    expect(screen.getByText('لم تُرسل: Message undeliverable')).toBeInTheDocument()
    expect(screen.getByText('المساعد الآلي')).toBeInTheDocument()
  })

  it('owned by me inside the window: composer sends; owned by someone else: shows who', async () => {
    const h = handlers()
    const { rerender } = render(<ChatPanel panel={panel({ status: 'HUMAN_ACTIVE', assigned_user_id: 5, assigned_name: 'أنا' })} busy={false} loading={false} hasOlder={false} me={me} {...h} messages={[]} />)
    fireEvent.change(screen.getByLabelText('رد الموظف'), { target: { value: 'تمت المتابعة' } })
    fireEvent.click(screen.getByRole('button', { name: 'إرسال' }))
    expect(h.onSend).toHaveBeenCalledWith('تمت المتابعة')
    rerender(<ChatPanel panel={panel({ status: 'HUMAN_ACTIVE', assigned_user_id: 9, assigned_name: 'سارة' })} busy={false} loading={false} hasOlder={false} me={me} {...h} messages={[]} />)
    expect(screen.getByText('المحادثة مستلمة بواسطة سارة')).toBeInTheDocument()
    expect(screen.queryByLabelText('رد الموظف')).toBeNull()
  })

  it('outside the 24h window only an approved template can be sent', () => {
    const h = handlers()
    render(<ChatPanel panel={panel({ status: 'HUMAN_ACTIVE', assigned_user_id: 5, customer_service_window_expires_at: inHours(-1) })} busy={false} loading={false} hasOlder={false} me={me} {...h} messages={[]} />)
    expect(screen.queryByLabelText('رد الموظف')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'إرسال قالب متابعة معتمد' }))
    expect(h.onTemplate).toHaveBeenCalled()
  })

  it('view-only roles never see actions', () => {
    render(<ChatPanel panel={panel()} busy={false} loading={false} hasOlder={false} me={{ ...me, canReply: false }} {...handlers()} messages={[]} />)
    expect(screen.queryByRole('button', { name: /استلام المحادثة/ })).toBeNull()
    expect(screen.getByText('صلاحيتك للعرض فقط')).toBeInTheDocument()
  })
})

describe('support helpers', () => {
  it('notifications open the right conversation / ticket', () => {
    expect(resolveNotificationTarget({ type: 'support_handoff', data: { entity_type: 'support_conversation', entity_id: 12 } }).path).toBe('/support?conversation=12')
    expect(resolveNotificationTarget({ type: 'support_ticket', data: { entity_type: 'support_ticket', entity_id: 4 } }).path).toBe('/support?ticket=4')
    expect(resolveNotificationTarget({ type: 'support_ai_limit', data: { entity_type: 'support_conversation', entity_id: 0 } }).path).toBe('/support?tab=analytics')
  })
  it('24h window and role permissions', () => {
    expect(windowState(inHours(2)).open).toBe(true)
    expect(windowState(inHours(-2)).open).toBe(false)
    expect(windowState(null).open).toBe(false)
    expect(canSupport('viewer', 'support.view')).toBe(false)
    expect(canSupport('accountant', 'support.reply')).toBe(false)
    expect(canSupport('employee', 'support.reply')).toBe(true)
  })
})
