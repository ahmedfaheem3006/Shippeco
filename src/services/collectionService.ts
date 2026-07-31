import { api } from '../utils/apiClient';

export interface CollectionSummaryData {
  clientsCount: { A: number; B: number; C: number; D: number };
  invoicesCount: { A: number; B: number; C: number; D: number };
  unpaidTotal: { A: number; B: number; C: number; D: number };
}

export interface CollectionInvoiceItem {
  id: number;
  invoice_number: string;
  client_id: number | null;
  client_name: string;
  phone: string;
  total: number;
  paid_amount: number;
  remaining: number;
  status: string;
  payment_status: number;
  collection_category: 'A' | 'B' | 'C' | 'D' | null;
  invoice_date: string;
  due_date: string | null;
  created_at: string;
}

export const collectionService = {
  async getSummary(): Promise<CollectionSummaryData> {
    const res = await api.get('/collection/summary');
    return res.data ?? res;
  },

  async getInvoices(params: {
    page?: number;
    limit?: number;
    search?: string;
    category?: string;
    paymentStatus?: string;
  }): Promise<{ invoices: CollectionInvoiceItem[]; total: number }> {
    const limit = params.limit || 30;
    const page = params.page || 1;
    const offset = (page - 1) * limit;

    const queryParams = new URLSearchParams();
    queryParams.set('limit', limit.toString());
    queryParams.set('offset', offset.toString());
    if (params.search) queryParams.set('search', params.search);
    if (params.category) queryParams.set('category', params.category);
    if (params.paymentStatus) queryParams.set('paymentStatus', params.paymentStatus);

    const res = await api.get(`/collection/invoices?${queryParams.toString()}`);
    return {
      invoices: res.data || [],
      total: res.meta?.total || 0,
    };
  },

  async updateCategory(invoiceId: number, category: string | null) {
    const res = await api.put(`/collection/invoices/${invoiceId}/category`, { category });
    return res.data ?? res;
  },

  async triggerNotificationsCheck() {
    const res = await api.post('/collection/check-notifications', {});
    return res.data ?? res;
  },
};
