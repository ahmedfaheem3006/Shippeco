/** Customer service center API (backend: /api/support/*). */
import { api } from '../utils/apiClient'
import { useAuthStore } from '../hooks/useAuthStore'
import { env } from '../utils/env'

export type ConversationStatus = 'AI_ACTIVE' | 'AI_COLLECTING_DATA' | 'WAITING_FOR_AGENT' | 'HUMAN_ACTIVE' | 'RESOLVED' | 'CLOSED'
export type TicketStatus = 'OPEN' | 'WAITING_FOR_AGENT' | 'IN_PROGRESS' | 'WAITING_FOR_CUSTOMER' | 'RESOLVED' | 'CLOSED'
export type TicketPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'

export interface ConversationRow {
  id: number
  wa_id: string
  phone_e164: string
  profile_name: string | null
  client_id: number | null
  client_name: string | null
  client_match: string
  status: ConversationStatus
  ai_enabled: boolean
  assigned_user_id: number | null
  assigned_name: string | null
  current_intent: string | null
  last_message_at: string | null
  last_message_preview: string | null
  last_message_sender: string | null
  customer_service_window_expires_at: string | null
  waiting_since: string | null
  unread_count: number
  open_ticket_number: string | null
  open_ticket_priority: TicketPriority | null
}

export interface SupportMessage {
  id: number
  direction: 'inbound' | 'outbound' | 'internal'
  sender_type: 'customer' | 'ai' | 'agent' | 'system'
  sender_name: string | null
  message_type: string
  text: string | null
  template_name: string | null
  media_id: number | null
  media_kind: string | null
  media_mime: string | null
  media_file_name: string | null
  media_size: number | null
  media_status: string | null
  media_reject_reason: string | null
  provider_status: string
  error_code: string | null
  error_message: string | null
  created_at: string
  delivered_at: string | null
  read_at: string | null
  failed_at: string | null
  meta: { intent?: string; tools?: string[]; transcript?: string; rate_limited?: boolean; event?: string; fallback?: string }
}

export interface TicketRow {
  id: number
  ticket_number: string
  category: string
  priority: TicketPriority
  status: TicketStatus
  subject: string
  created_at: string
  updated_at: string
  conversation_id: number | null
  client_id: number | null
  client_name: string | null
  invoice_number: string | null
  awb: string | null
  assigned_name: string | null
  assigned_to: number | null
  phone_e164: string | null
}

export interface TicketEvent {
  id: number
  event_type: string
  actor_type: string
  actor_name: string | null
  from_value: string | null
  to_value: string | null
  note: string | null
  media_id: number | null
  created_at: string
}

export interface TicketDetail extends TicketRow {
  description: string | null
  ai_summary: AiSummary | null
  priority_reason: string | null
  customer_sentiment: string | null
  conversation_status: string | null
  profile_name: string | null
  events: TicketEvent[]
}

export interface ConversationPanel {
  conversation: ConversationRow & { ai_summary: AiSummary | null; conversation_summary: string | null; structured_state: Record<string, unknown> }
  customer: { id: number; name: string; phone: string | null } | null
  candidates: Array<{ id: number; name: string; phone: string | null }>
  invoices: Array<{ id: number; invoice_number: string; invoice_date: string | null; payment_status: number; carrier: string | null; awb: string | null; total?: string; paid_amount?: string; remaining?: string }>
  outstanding: number | null
  tickets: Array<{ id: number; ticket_number: string; category: string; priority: TicketPriority; status: TicketStatus; subject: string; created_at: string }>
  ai_summary: AiSummary | null
  collected: Record<string, unknown>
  refs: Record<string, string[]>
}

export interface AiSummary {
  customer?: string | null; phone?: string; invoice_numbers?: string[]; awbs?: string[]; tickets?: string[]; handoff_reason?: string
  contact_reason?: string; problem_type?: string | null; started_when?: string | null; collected_info?: string[]; verified_facts?: string[]
  unresolved?: string; customer_request?: string; urgency?: string; tools_used?: Array<{ name: string; summary: string }>; source?: string
}

export interface SupportAnalytics {
  period_days: number; conversations: number; conversations_today: number; ai_handled: number; human_handled: number; handoff_rate: number
  open_tickets: number; urgent_tickets: number; tickets_created: number; avg_first_response_seconds: number | null; avg_resolution_seconds: number | null
  top_complaint_categories: Array<{ category: string; n: number }>; ai_error_rate: number
  ai_usage: {
    tokensToday: number; tokensMonth: number; costTodayUsd: number; costMonthUsd: number; callsMonth: number; failuresMonth: number
    aiRepliesMonth: number; conversationsMonth: number; avgCostPerConversationUsd: number; limits: { dailyTokens: number; monthlyCostAlertUsd: number }
  }
}

type LiveCheck = { ok: boolean; error?: string; display_phone_number?: string; verified_name?: string; quality_rating?: string }
export interface SupportHealth {
  whatsapp: {
    mode: string; graph_api_version: string; configured: Record<string, boolean>; webhook_url: string; last_webhook_at: string | null
    last_outbound_success_at: string | null; live?: LiveCheck
    templates: { followup: string | null; ticket_update: string | null; language: string; statuses?: Array<{ name: string; status: string; category: string }> | { error: string } }
  }
  gemini: { mode: string; configured: boolean; model: string; thinking_level: string; max_output_tokens: number; last_success_at: string | null; live?: LiveCheck }
  sandbox_enabled: boolean
}

export interface KbArticle { id: number; title: string; category: string | null; content: string; keywords: string | null; active: boolean; version: number; updated_at: string; updated_by_name: string | null }

export interface SupportSettings { aiEnabled: boolean; voiceEnabled: boolean; maxAiReplies: number; workingHours: string; autoHandoff: boolean; teamRoles: string[] }

type Page<T, K extends string> = { [k in K]: T[] } & { pagination: { page: number; limit: number; total: number; pages: number } }

const qs = (p: Record<string, string | number | undefined | null>) => {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== null && v !== '') q.set(k, String(v))
  const s = q.toString()
  return s ? `?${s}` : ''
}

export const newClientRef = () => (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9-]/g, '').slice(0, 60)

export const supportService = {
  me: () => api.get<{ permissions: string[]; sandbox: boolean; model: string }>('/support/me'),
  agents: () => api.get<Array<{ id: number; full_name: string; role: string }>>('/support/agents'),
  conversations: (p: { filter?: string; search?: string; page?: number; limit?: number }) =>
    api.get<Page<ConversationRow, 'conversations'>>(`/support/conversations${qs(p)}`),
  conversation: (id: number) => api.get<ConversationPanel>(`/support/conversations/${id}`),
  messages: (id: number, before?: number) => api.get<SupportMessage[]>(`/support/conversations/${id}/messages${qs({ before, limit: 60 })}`),
  markRead: (id: number) => api.post(`/support/conversations/${id}/read`, {}),
  takeover: (id: number, force = false) => api.post(`/support/conversations/${id}/takeover`, { force }),
  returnToAi: (id: number) => api.post(`/support/conversations/${id}/return-to-ai`, {}),
  reply: (id: number, text: string, clientRef: string) => api.post<{ message_id: number }>(`/support/conversations/${id}/reply`, { text, client_ref: clientRef }),
  template: (id: number, kind: 'followup' | 'ticketUpdate', params: string[], clientRef: string) =>
    api.post(`/support/conversations/${id}/template`, { kind, params, client_ref: clientRef }),
  setStatus: (id: number, status: 'RESOLVED' | 'CLOSED') => api.post(`/support/conversations/${id}/status`, { status }),
  linkCustomer: (id: number, clientId: number | null) => api.post(`/support/conversations/${id}/link-customer`, { client_id: clientId }),

  tickets: (p: { status?: string; priority?: string; category?: string; assigned?: string; search?: string; page?: number; limit?: number }) =>
    api.get<Page<TicketRow, 'tickets'>>(`/support/tickets${qs(p)}`),
  ticket: (id: number) => api.get<TicketDetail>(`/support/tickets/${id}`),
  createTicket: (b: { conversation_id: number; category: string; subject: string; description?: string; priority?: TicketPriority; client_ref: string }) =>
    api.post<TicketDetail>('/support/tickets', b),
  ticketStatus: (id: number, status: TicketStatus, note?: string) => api.post<TicketDetail>(`/support/tickets/${id}/status`, { status, note }),
  ticketPriority: (id: number, priority: TicketPriority, note?: string) => api.post<TicketDetail>(`/support/tickets/${id}/priority`, { priority, note }),
  ticketCategory: (id: number, category: string) => api.post<TicketDetail>(`/support/tickets/${id}/category`, { category }),
  ticketAssign: (id: number, userId: number | null) => api.post<TicketDetail>(`/support/tickets/${id}/assign`, { user_id: userId }),
  ticketNote: (id: number, note: string) => api.post<TicketDetail>(`/support/tickets/${id}/notes`, { note }),
  ticketReply: (id: number, text: string, clientRef: string) => api.post(`/support/tickets/${id}/reply`, { text, client_ref: clientRef }),

  kb: () => api.get<KbArticle[]>('/support/kb'),
  saveKb: (id: number | null, a: Partial<KbArticle>) => (id ? api.put<KbArticle>(`/support/kb/${id}`, a) : api.post<KbArticle>('/support/kb', a)),
  settings: () => api.get<SupportSettings>('/support/settings'),
  saveSettings: (s: Partial<SupportSettings>) => api.put<SupportSettings>('/support/settings', s),
  analytics: (days = 30) => api.get<SupportAnalytics>(`/support/analytics${qs({ days })}`),
  health: (live = false) => api.get<SupportHealth>(`/support/health${qs({ live: live ? 1 : undefined })}`),

  sandboxIncoming: (b: { phone: string; name?: string; text?: string }) => api.post<{ conversationId: number }>('/support/sandbox/incoming', b),

  /** Media needs the auth header, so it is fetched and shown through an object URL. */
  async mediaUrl(mediaId: number): Promise<string> {
    const token = useAuthStore.getState().token
    const res = await fetch(`${env.apiUrl}/support/media/${mediaId}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    if (!res.ok) throw new Error(res.status === 410 ? 'انتهت مدة الاحتفاظ بالملف' : 'تعذر تحميل الملف')
    return URL.createObjectURL(await res.blob())
  },
}

export const SUPPORT_EVENTS = ['support:message', 'support:message_status', 'support:conversation', 'support:ticket', 'support:media'] as const
