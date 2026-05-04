import { unifiedService } from './unifiedService';
import type { Invoice } from '../utils/models';

export const invoiceService = {

  async getInvoices(params: any = {}): Promise<Invoice[]> {
    const allInvoices: Invoice[] = [];
    let page = 1;
    const limit = 100;
    const MAX_PAGES = 200;

    while (page <= MAX_PAGES) {
      const qp = new URLSearchParams();
      qp.set('page', String(page));
      qp.set('limit', String(limit));
      if (params.status) qp.set('payment_status', params.status);
      if (params.search) qp.set('search', params.search);

      const { api } = await import('../utils/apiClient');

      let result: any;
      try {
        result = await api.get(`/invoices?${qp.toString()}`);
      } catch (err: any) {
        if (err.message?.includes('Too many') || err.message?.includes('429')) {
          console.warn(`[getInvoices] Rate limited at page ${page}, waiting 3s...`);
          await new Promise(r => setTimeout(r, 3000));
          try {
            result = await api.get(`/invoices?${qp.toString()}`);
          } catch {
            console.error(`[getInvoices] Retry failed at page ${page}, stopping.`);
            break;
          }
        } else {
          console.error(`[getInvoices] Error at page ${page}:`, err);
          break;
        }
      }

      let list: any[] = [];
      let totalPages = 1;

      if (result?.success && Array.isArray(result.data)) {
        list = result.data;
        const meta = result.pagination || result.meta;
        totalPages = meta?.totalPages || meta?.pages || 1;
      } else if (Array.isArray(result)) {
        list = result;
        totalPages = 1;
      } else if (result?.data && Array.isArray(result.data)) {
        list = result.data;
        const meta = result.pagination || result.meta;
        totalPages = meta?.totalPages || meta?.pages || 1;
      }

      if (list.length > 0) {
        allInvoices.push(...list.map((item: any) => mapRailwayToCloudflare(item)));
      }

      console.log(`[getInvoices] Page ${page}/${totalPages} — got ${list.length}, total: ${allInvoices.length}`);

      if (page >= totalPages || list.length === 0 || list.length < limit) {
        break;
      }

      await new Promise(r => setTimeout(r, 100));
      page++;
    }

    console.log(`[getInvoices] ✅ Done — Total: ${allInvoices.length} invoices`);
    return allInvoices;
  },

  async getInvoice(id: string): Promise<Invoice> {
    const result = await unifiedService.get<any>(`/invoices/${id}`);
    const raw = result?.data !== undefined && result?.success ? result.data : result;
    return mapRailwayToCloudflare(raw);
  },

  async getInvoicesLight(params: any = {}): Promise<{
    invoices: Invoice[];
    pagination: { page: number; limit: number; total: number; pages: number };
  }> {
    const qp = new URLSearchParams();
    if (params.page) qp.set('page', String(params.page));
    if (params.limit) qp.set('limit', String(params.limit));
    else qp.set('limit', '50');
    if (params.status && params.status !== 'all')
      qp.set('status', params.status);
    if (params.search) qp.set('search', params.search);
    if (params.date_from) qp.set('date_from', params.date_from);
    if (params.date_to) qp.set('date_to', params.date_to);
    if (params.sort_by) qp.set('sort_by', params.sort_by);
    if (params.sort_dir) qp.set('sort_dir', params.sort_dir);

    const result = await unifiedService.get<any>(
      `/invoices/light?${qp.toString()}`
    );

    const invoices = (result.invoices || result.data || []).map(
      (inv: any) => mapRailwayToCloudflare(inv)
    );

    return {
      invoices,
      pagination: result.pagination || { page: 1, limit: 50, total: 0, pages: 1 },
    };
  },

  async getMonthlySummary(month?: string): Promise<any> {
    const qp = month ? `?month=${encodeURIComponent(month)}` : '';
    const result: any = await unifiedService.get(`/invoices/summary${qp}`);
    return result;
  },

  async getAllTimeSummary(): Promise<any> {
    const result: any = await unifiedService.get('/invoices/summary/all');
    return result;
  },

  async getInvoiceByDaftraId(daftraId: string): Promise<Invoice> {
    const result = await unifiedService.get<any>(
      `/invoices/by-daftra/${daftraId}`
    );
    const raw = result?.data !== undefined && result?.success ? result.data : result;
    return mapRailwayToCloudflare(raw);
  },

  async createInvoice(invoice: Partial<Invoice>): Promise<Invoice> {
    const railwayPayload = mapToRailway(invoice);
    const result: any = await unifiedService.post<Invoice>(
      '/invoices',
      railwayPayload
    );
    return mapRailwayToCloudflare(result);
  },

  async updateInvoice(id: string, invoice: Partial<Invoice>): Promise<Invoice> {
    const railwayPayload = mapToRailway(invoice);
    const result: any = await unifiedService.put<Invoice>(
      `/invoices/${id}`,
      railwayPayload
    );
    return mapRailwayToCloudflare(result);
  },

  async deleteInvoice(id: string): Promise<any> {
    return unifiedService.delete<any>(`/invoices/${id}`);
  },

  async syncRecent(): Promise<any> {
    const result: any = await unifiedService.get('/sync/recent');
    return result;
  },

  async syncAll(pages?: number): Promise<any> {
    const result: any = await unifiedService.post('/sync/from-daftra', {
      pages,
      status: '',
    });
    return result;
  },

  async getSyncStatus(): Promise<any> {
    const result: any = await unifiedService.get('/sync/status');
    return result;
  },

  async enrichMissing(limit?: number): Promise<any> {
    const result: any = await unifiedService.post('/sync/enrich', { limit });
    return result;
  },

  async addItem(invoiceId: string, item: {
    description: string;
    quantity: number;
    unit_price: number;
    total: number;
  }): Promise<any> {
    const result = await unifiedService.post<any>(
      `/invoices/${invoiceId}/items`,
      item
    );
    return result;
  },

  async getDashboardData(period?: 'today' | 'week' | 'month' | 'year' | 'all'): Promise<any> {
    const qp = period && period !== 'all' ? `?period=${period}` : '';
    const result: any = await unifiedService.get(`/invoices/dashboard-data${qp}`);
    if (result?.success && result?.data) return result.data;
    if (result?.data) return result.data;
    return result;
  },
  
  async assignInvoice(id: string, employeeId: number | null): Promise<any> {
    const { api } = await import('../utils/apiClient');
    const result = await api.post(`/invoices/${id}/assign`, { employeeId });
    return result;
  },
};

// ══════════════════════════════════════════════
// MAPPERS
// ══════════════════════════════════════════════

function mapToRailway(inv: Partial<Invoice>): any {
  const i = inv as any;
  return {
    client_name: i.client || i.client_name,
    client_id: i.daftra_client_id || i.client_id,
    phone: i.phone,
    awb: i.awb,
    carrier: i.carrier,
    total: i.price || i.total,
    dhl_cost: i.dhl_cost || i.dhlCost || 0,
    status: i.status,
    paid_amount: Number(i.partialPaid || i.partial_paid || i.paid_amount || 0),
    invoice_date: normalizeDate(i.date || i.invoice_date),
    items: Array.isArray(i.items) ? i.items : undefined,
    notes: i.notes,
    details: i.details,
    shipping_type: i.shippingType || i.shipping_type,
    dimensions: i.dimensions,
    weight: i.weight || i.final_weight,
    code_type: i.codeType || i.code_type,
  };
}

/**
 * Normalize any date input to yyyy-mm-dd format.
 * Strips time and timezone to prevent day-shift issues.
 */
function normalizeDate(raw: any): string {
  if (!raw) return '';
  const s = String(raw).trim();
  if (!s) return '';

  // Already yyyy-mm-dd
  const dateOnly = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (dateOnly) return dateOnly[1];

  // Try parsing as Date
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;

  // Extract date parts in LOCAL timezone (not UTC) to prevent day shift
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function mapRailwayToCloudflare(result: any): Invoice {
  if (!result) return {} as Invoice;

  const paymentStatus = result.payment_status !== undefined ? Number(result.payment_status) : undefined;
  const status = mapPaymentStatusToString(paymentStatus, result.status);

  const price = parseFloat(result.total || result.price || 0) || 0;
  const paidAmount = parseFloat(result.paid_amount || result.partial_paid || 0) || 0;
  const remaining = parseFloat(result.remaining || 0) || Math.max(0, price - paidAmount);

  // Normalize date — always store as yyyy-mm-dd to prevent timezone issues
  const rawDate = result.invoice_date || result.date || '';
  const normalizedDate = normalizeDate(rawDate);

  return {
    ...result,
    id: String(result.id),
    daftra_id: result.daftra_id ? String(result.daftra_id) : undefined,
    price,
    client: result.client_name || result.client || '',
    phone: result.phone || result.client_phone || '',
    date: normalizedDate,
    awb: result.awb || '',
    carrier: result.carrier || '',
    details: result.details || '',
    invoice_number: result.invoice_number || '',
    dhlCost: parseFloat(result.dhl_cost || result.dhlCost || 0) || 0,
    dhl_cost: parseFloat(result.dhl_cost || result.dhlCost || 0) || 0,
    partial_paid: paidAmount,
    partialPaid: paidAmount,
    remaining,
    sender: result.sender || '',
    receiver: result.receiver || '',
    sender_phone: result.sender_phone || '',
    receiver_phone: result.receiver_phone || '',
    sender_address: result.sender_address || '',
    receiver_address: result.receiver_address || '',
    receiver_country: result.receiver_country || '',
    weight: result.weight || result.final_weight || '',
    dimensions: result.dimensions || '',
    status,
    isDraft: false,
    assigned_to: result.assigned_to,
    assigned_employee_name: result.assigned_employee_name,
  } as Invoice;
}

function mapPaymentStatusToString(
  paymentStatus: number | undefined,
  fallbackStatus?: string
): string {
  if (paymentStatus !== undefined && paymentStatus !== null) {
    switch (paymentStatus) {
      case 0: return 'unpaid';
      case 1: return 'partial';
      case 2: return 'paid';
      case 3: return 'returned';
    }
  }
  if (
    fallbackStatus &&
    typeof fallbackStatus === 'string' &&
    ['paid', 'unpaid', 'partial', 'returned'].includes(fallbackStatus)
  ) {
    return fallbackStatus;
  }
  return 'unpaid';
}