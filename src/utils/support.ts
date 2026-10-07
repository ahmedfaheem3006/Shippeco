/** Labels, colours and permission helpers for the customer service center. */
import type { ConversationStatus, TicketPriority, TicketStatus } from '../services/supportService'

/** Mirrors Backend src/services/support/supportPermissions.ts (the server enforces it). */
const ROLE_PERMS: Record<string, string[]> = {
  admin: ['support.view', 'support.reply', 'support.assign', 'support.resolve', 'support.manage', 'support.view_financial', 'support.manage_knowledge_base'],
  manager: ['support.view', 'support.reply', 'support.assign', 'support.resolve', 'support.manage', 'support.view_financial', 'support.manage_knowledge_base'],
  employee: ['support.view', 'support.reply', 'support.resolve'],
  accountant: ['support.view', 'support.view_financial'],
}
export const canSupport = (role: string | undefined | null, p: string) => (ROLE_PERMS[String(role ?? '')] ?? []).includes(p)

export const CONVERSATION_STATUS: Record<ConversationStatus, { label: string; cls: string }> = {
  AI_ACTIVE: { label: 'المساعد يتعامل', cls: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300' },
  AI_COLLECTING_DATA: { label: 'المساعد يجمع البيانات', cls: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300' },
  WAITING_FOR_AGENT: { label: 'بانتظار موظف', cls: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  HUMAN_ACTIVE: { label: 'مع موظف', cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
  RESOLVED: { label: 'تم الحل', cls: 'bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-300' },
  CLOSED: { label: 'مغلقة', cls: 'bg-gray-100 text-gray-500 dark:bg-slate-800 dark:text-slate-400' },
}

export const TICKET_STATUS: Record<TicketStatus, string> = {
  OPEN: 'مفتوحة', WAITING_FOR_AGENT: 'بانتظار موظف', IN_PROGRESS: 'قيد المعالجة', WAITING_FOR_CUSTOMER: 'بانتظار العميل', RESOLVED: 'تم الحل', CLOSED: 'مغلقة',
}

export const PRIORITY: Record<TicketPriority, { label: string; cls: string }> = {
  URGENT: { label: 'عاجلة', cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
  HIGH: { label: 'عالية', cls: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' },
  NORMAL: { label: 'عادية', cls: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  LOW: { label: 'منخفضة', cls: 'bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-300' },
}

export const CATEGORY: Record<string, string> = {
  SHIPMENT_DELAY: 'تأخر شحنة', SHIPMENT_LOST: 'شحنة مفقودة', SHIPMENT_DAMAGED: 'شحنة تالفة', WRONG_STATUS: 'حالة غير صحيحة',
  PAYMENT_PROBLEM: 'مشكلة دفع', INVOICE_PROBLEM: 'مشكلة فاتورة', PRICE_PROBLEM: 'مشكلة سعر', DELIVERY_PROBLEM: 'مشكلة توصيل',
  PICKUP_PROBLEM: 'مشكلة استلام', CUSTOMER_SERVICE: 'خدمة العملاء', SHIPMENT_REQUEST: 'طلب شحن', GENERAL_INQUIRY: 'استفسار', OTHER: 'أخرى',
}

export const INTENT: Record<string, string> = {
  GREETING: 'تحية', CREATE_SHIPMENT_REQUEST: 'طلب شحن', TRACK_SHIPMENT: 'تتبع شحنة', INVOICE_QUERY: 'استفسار فاتورة', PAYMENT_QUERY: 'استفسار دفع',
  COMPLAINT: 'شكوى', SUPPORT_REQUEST: 'طلب دعم', HUMAN_REQUEST: 'طلب موظف', TICKET_STATUS: 'حالة تذكرة', OTHER: 'أخرى',
}

export const CONVERSATION_FILTERS: Array<{ key: string; label: string }> = [
  { key: 'all', label: 'الكل' },
  { key: 'unread', label: 'غير مقروءة' },
  { key: 'ai', label: 'المساعد يتعامل' },
  { key: 'waiting', label: 'بانتظار موظف' },
  { key: 'human', label: 'مع موظف' },
  { key: 'mine', label: 'محادثاتي' },
  { key: 'complaints', label: 'شكاوى' },
  { key: 'urgent', label: 'عاجلة' },
  { key: 'open_tickets', label: 'تذاكر مفتوحة' },
  { key: 'closed', label: 'مغلقة' },
]

export const PAYMENT_STATUS: Record<number, string> = { 0: 'غير مدفوعة', 1: 'جزئية', 2: 'مدفوعة', 3: 'مرتجعة' }

/** "منذ 5 د" style relative time (Arabic). */
export function ago(iso: string | null | undefined): string {
  if (!iso) return ''
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'الآن'
  if (s < 3600) return `منذ ${Math.floor(s / 60)} د`
  if (s < 86400) return `منذ ${Math.floor(s / 3600)} س`
  return new Date(iso).toLocaleDateString('en-GB', { timeZone: 'Asia/Riyadh' })
}

export function clock(iso: string | null | undefined): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Riyadh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
}

/** Remaining time in the WhatsApp 24h customer-service window. */
export function windowState(expires: string | null | undefined): { open: boolean; label: string } {
  if (!expires) return { open: false, label: 'لا توجد نافذة خدمة مفتوحة' }
  const ms = new Date(expires).getTime() - Date.now()
  if (ms <= 0) return { open: false, label: 'انتهت نافذة الـ24 ساعة — يلزم قالب معتمد' }
  const h = Math.floor(ms / 3600_000)
  const m = Math.floor((ms % 3600_000) / 60_000)
  return { open: true, label: `نافذة الرد المفتوحة: ${h} س ${m} د` }
}

export const fmtSeconds = (s: number | null | undefined) => {
  if (s === null || s === undefined) return '—'
  if (s < 60) return `${s} ث`
  if (s < 3600) return `${Math.round(s / 60)} د`
  if (s < 86400) return `${(s / 3600).toFixed(1)} س`
  return `${(s / 86400).toFixed(1)} يوم`
}

/** Message of an unknown thrown value (API errors carry the server's Arabic text). */
export const errorText = (e: unknown, fallback = 'تعذر تنفيذ العملية'): string =>
  e instanceof Error && e.message ? e.message : fallback
