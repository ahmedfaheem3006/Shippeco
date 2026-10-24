import { api } from '../utils/apiClient';
import { unifiedService } from './unifiedService';

/** pending = لم يتم اتخاذ إجراء · done = تم (linked to an invoice) · cancelled = ملغاة */
export type UnregisteredState = 'pending' | 'done' | 'cancelled';
export type UnregisteredStateFilter = 'all' | UnregisteredState;

/** One "فاتورة غير مسجلة" record (Backend services/unregisteredInvoices.service.ts). */
export interface UnregisteredInvoice {
  id: number;
  awb: string;
  /** YYYY-MM-DD — a calendar date, shown as-is (no timezone shift). */
  awb_date: string;
  created_at: string;
  state: UnregisteredState;
  action_taken: boolean;
  note: string | null;
  assigned_to: number | null;
  assigned_to_name: string | null;
  assigned_by: number | null;
  assigned_by_name: string | null;
  /** invoices.id — what the link opens; null once that invoice is deleted. */
  linked_invoice_id: number | null;
  linked_invoice_number: string | null;
  linked_invoice_missing: boolean;
  completed_by: number | null;
  completed_by_name: string | null;
  completed_at: string | null;
}

export interface UnregisteredCounts {
  pending: number;
  done: number;
  cancelled: number;
  all: number;
}

export interface UnregisteredListResponse {
  items: UnregisteredInvoice[];
  counts: UnregisteredCounts;
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface UnregisteredListParams {
  state?: UnregisteredStateFilter;
  q?: string;
  mine?: boolean;
  id?: number;
  page?: number;
  limit?: number;
}

export interface CreateUnregisteredInput {
  awb: string;
  awb_date: string;
  assigned_to: number;
  note?: string | null;
}

/** Only the fields that changed (the invoice link is never edited here). */
export interface UpdateUnregisteredInput {
  awb?: string;
  awb_date?: string;
  assigned_to?: number;
  note?: string | null;
}

export interface UpdateResult {
  record: UnregisteredInvoice;
  /** false when nothing actually changed. */
  changed: boolean;
}

export interface LinkResult {
  record: UnregisteredInvoice;
  /** true when the same request had already been applied (double click / retry). */
  idempotent: boolean;
}

/** Minimal invoice row used by the link dialog (from GET /invoices?search=). */
export interface InvoiceCandidate {
  id: number;
  invoice_number: string | null;
  awb: string | null;
  client_name: string | null;
  invoice_date: string | null;
}

const BASE = '/tasks/unregistered-invoices';

// Reads go straight to the API client (no 30s cache, like tasks.service);
// writes go through unifiedService so other pages' caches are invalidated.
export const unregisteredInvoicesService = {
  async list(params: UnregisteredListParams = {}, signal?: AbortSignal): Promise<UnregisteredListResponse> {
    const qp = new URLSearchParams();
    if (params.state && params.state !== 'all') qp.set('state', params.state);
    if (params.q?.trim()) qp.set('q', params.q.trim());
    if (params.mine) qp.set('mine', '1');
    if (params.id) qp.set('id', String(params.id));
    if (params.page) qp.set('page', String(params.page));
    if (params.limit) qp.set('limit', String(params.limit));
    return api.get<UnregisteredListResponse>(`${BASE}?${qp.toString()}`, { signal });
  },

  async get(id: number, signal?: AbortSignal): Promise<UnregisteredInvoice> {
    return api.get<UnregisteredInvoice>(`${BASE}/${id}`, { signal });
  },

  /** Edit a pending record (409 TASK_COMPLETED once it is done or cancelled). */
  async update(id: number, patch: UpdateUnregisteredInput): Promise<UpdateResult> {
    return unifiedService.patch<UpdateResult>(`${BASE}/${id}`, patch);
  },

  async create(input: CreateUnregisteredInput): Promise<UnregisteredInvoice> {
    return unifiedService.post<UnregisteredInvoice>(BASE, input);
  },

  async complete(id: number, invoiceId: number): Promise<LinkResult> {
    return unifiedService.patch<LinkResult>(`${BASE}/${id}/complete`, { invoiceId });
  },

  async relink(id: number, invoiceId: number): Promise<LinkResult> {
    return unifiedService.patch<LinkResult>(`${BASE}/${id}/link`, { invoiceId });
  },

  async cancel(id: number): Promise<LinkResult> {
    return unifiedService.patch<LinkResult>(`${BASE}/${id}/cancel`, {});
  },

  /** Real SHIPPEC invoices by number, AWB or customer name (server-side, paged). */
  async searchInvoices(q: string, signal?: AbortSignal): Promise<InvoiceCandidate[]> {
    const qp = new URLSearchParams({ limit: '10' });
    if (q.trim()) qp.set('search', q.trim());
    type Row = { id: number | string; invoice_number?: string | null; awb?: string | null; client_name?: string | null; invoice_date?: string | null };
    const res = await api.get<Row[] | { data?: Row[] }>(`/invoices?${qp}`, { signal });
    const rows: Row[] = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
    return rows.map((r) => ({
      id: Number(r.id),
      invoice_number: r.invoice_number ?? null,
      awb: r.awb ?? null,
      client_name: r.client_name ?? null,
      invoice_date: r.invoice_date ?? null,
    }));
  },
};
