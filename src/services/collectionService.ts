import { api } from '../utils/apiClient';

export type CollectionCategory = 'A' | 'B' | 'C' | 'D';

export interface CollectionSummaryData {
  clientsCount: Record<CollectionCategory, number>;
  invoicesCount: Record<CollectionCategory, number>;
  unpaidTotal: Record<CollectionCategory, number>;
}

/** Money fields are exact NUMERIC strings from the API. */
export interface CollectionInvoiceItem {
  id: number;
  invoice_number: string;
  daftra_id: number | null;
  client_id: number | null;
  client_name: string;
  phone: string;
  awb: string | null;
  total: string;
  paid_amount: string;
  remaining: string;
  status: string;
  payment_status: number; // 0 unpaid · 1 partial · 2 paid · 3 returned
  payment_method: string | null;
  collection_category: CollectionCategory | null;
  invoice_date: string | null; // YYYY-MM-DD
  due_date: string | null;
  created_at: string;
}

export interface CollectionFilters {
  search?: string;
  category?: string;
  paymentStatus?: string;
  paymentMethod?: string;
  dateFrom?: string;
  dateTo?: string;
}

/** Totals over every invoice matching the filters (not just the page). */
export interface CollectionTotals {
  count: number;
  total: string;
  paid: string;
  remaining: string;
}

export const collectionService = {
  async getSummary(): Promise<CollectionSummaryData> {
    const res = await api.get('/collection/summary');
    return res.data ?? res;
  },

  async getInvoices(
    params: CollectionFilters & { page: number; limit: number },
    signal?: AbortSignal
  ): Promise<{ invoices: CollectionInvoiceItem[]; total: number; totals: CollectionTotals }> {
    const qp = new URLSearchParams();
    qp.set('limit', String(params.limit));
    qp.set('offset', String((params.page - 1) * params.limit));
    for (const key of ['search', 'category', 'paymentStatus', 'paymentMethod', 'dateFrom', 'dateTo'] as const) {
      const v = params[key];
      if (v && v !== 'ALL') qp.set(key, v);
    }
    const res = await api.get(`/collection/invoices?${qp.toString()}`, { signal });
    return {
      invoices: res.data || [],
      total: res.meta?.total || 0,
      totals: res.meta?.totals || { count: 0, total: '0', paid: '0', remaining: '0' },
    };
  },

  /** expected = the category the user saw (server answers 409 if it changed meanwhile). */
  async updateCategory(invoiceId: number, category: CollectionCategory | null, expected: CollectionCategory | null) {
    const res = await api.put(`/collection/invoices/${invoiceId}/category`, { category, expected_category: expected });
    return res.data ?? res;
  },

  async triggerNotificationsCheck() {
    const res = await api.post('/collection/check-notifications', {});
    return res.data ?? res;
  },
};
