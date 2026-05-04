export type UserRole = 'admin' | 'accountant' | 'employee' | 'viewer'

export type SessionUser = {
  id: number
  username: string
  name?: string
  role: UserRole
  status?: 'pending' | 'approved' | 'rejected'
}

export type UserRecord = {
  id?: number
  username: string
  name: string
  password?: string
  role: UserRole
  status?: 'pending' | 'approved' | 'rejected'
}

export type InvoiceStatus = 'paid' | 'unpaid' | 'partial' | 'returned'

export type InvoiceItem = {
  type: string
  details?: string
  price: number
}

export type Invoice = {
  id: string
  client: string
  invoice_number?: string
  phone?: string
  awb?: string
  carrier?: string
  weight?: string | number
  date: string
  status: InvoiceStatus
  payment?: string
  price: number
  total?: number
  paid_amount?: number
  remaining?: number
  partialPaid?: number
  partial_paid?: number
  dhlCost?: number
  dhl_cost?: number
  items?: InvoiceItem[] | string
  itemType?: string
  details?: string

  // ═══ بيانات المرسل (Shipper) ═══
  shipperName?: string
  shipperPhone?: string
  shipperAddress?: string
  sender?: string
  sender_phone?: string
  sender_address?: string

  // ═══ بيانات المستلم (Receiver) ═══
  receiverName?: string
  receiverPhone?: string
  receiverAddress?: string
  receiverCountry?: string
  receiver?: string
  receiver_phone?: string
  receiver_address?: string
  receiver_country?: string

  // ═══ بيانات الشحنة المستخرجة من دفترة ═══
  dimensions?: string
  final_weight?: string
  shipperSameAsClient?: boolean

  // ═══ ربط دفترة ═══
  daftra_id?: string
  daftra_client_id?: string

  // ═══ بيانات الإنشاء ═══
  created_by?: string
  created_at?: string

  // ═══ الباركود ═══
  codeType?: 'barcode' | 'qrcode'
  code_type?: 'barcode' | 'qrcode'

  // ═══ Paymob ═══
  paymentUrl?: string | null
  paymentRef?: string | null
  paymobOrderId?: string | number | null

  // ═══ WhatsApp Log ═══
  waLog?: Array<{ type: string; at: string; preview?: string }>

  // ═══ Timeline ═══
  timeline?: Array<{ type: string; at: string; meta?: Record<string, unknown> }>

  // ═══ حالة المسودة ═══
  isDraft?: boolean

  // ═══ تعيين الموظف ═══
  assigned_to?: number
  assigned_employee_name?: string
}

export type PlatformSettings = {
  currency: 'PL' | 'APAY' | 'WEB' | 'APAY2' | string
  invoiceNote: string
  storeWA: string
}

export interface InvoiceTemplate {
  companyAr: string
  companyEn: string
  vat: string
  cr: string
  phone: string
  email: string
  address: string
  note: string
  logoDataUrl?: string
  templateStyle?: string
}

export type AuditEntryType =
  | 'login'
  | 'create'
  | 'update'
  | 'delete'
  | 'import'
  | 'export'
  | 'payment_link'
  | 'paid'
  | 'sync'

export type AuditEntry = {
  id: string
  type: AuditEntryType
  at: string
  user?: string
  note?: string
  meta?: Record<string, unknown>
}

export type PaymobLinkHistoryItem = {
  name: string
  phone: string
  amount: string
  description: string
  url: string
  order_id?: string | number
  date: string
}

// ═══ Sync Status Types ═══
export type SyncStatusResponse = {
  last_full_sync: string | null
  last_recent_sync: string | null
  last_cron_sync: { synced: number; details_fetched: number; at: string } | null
  total_invoices: number
  awb_stats: { with_awb: number; without_awb: number } | null
  by_status: Array<{ status: string; count: number; total: number; paid: number }>
}

// ═══ Daftra Extracted Data ═══
export type DaftraExtractedData = {
  daftra_id: string
  invoice_no: string
  client: string
  phone: string
  awb: string
  sender: string
  receiver: string
  weight: string
  final_weight: string
  dimensions: string
  carrier: string
  items: InvoiceItem[]
}

// ═══ Partial Client ═══
export type PartialClient = {
  client: string
  count: number
  total_amount: number
  paid_amount: number
  remaining_amount: number
}

// ═══ Paymob Link (from DB) ═══
export type PaymobLink = {
  id: number
  invoice_id?: number | null
  client_name: string
  client_phone: string
  amount: number | string
  description?: string
  payment_url: string
  payment_url_full?: string
  client_secret?: string
  paymob_order_id?: string
  integration_type?: string
  status: 'pending' | 'paid' | 'expired'
  paid_at?: string | null
  created_by?: number
  created_at: string
}

export type PaymobStats = {
  total: number
  paid_count: number
  pending_count: number
  paid_total: number | string
  pending_total: number | string
}

