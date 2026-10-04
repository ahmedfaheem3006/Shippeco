import { api } from '../utils/apiClient';

export type ExpenseCategory = 'salaries' | 'assets' | 'waste' | 'operational' | 'other';
export type ExpensePaymentMethod = 'cash' | 'bank_transfer' | 'card';
export type ExpenseStatusFilter = 'active' | 'cancelled' | 'all';

/** Money is an exact NUMERIC string, dates are YYYY-MM-DD. */
export interface ExpenseItem {
  id: number;
  title: string;
  category: ExpenseCategory;
  amount: string;
  expense_date: string;
  payment_method: ExpensePaymentMethod | string;
  recipient: string | null;
  notes: string | null;
  attachment_url: string | null;
  status: 'active' | 'cancelled';
  cancelled_at: string | null;
  cancel_reason: string | null;
  cancelled_by_name: string | null;
  created_by: number | null;
  creator_name?: string;
  created_at: string;
  /** Version token for edits (optimistic concurrency). */
  updated_at: string;
}

export interface ExpenseSummaryData {
  totalThisMonth: string;
  countThisMonth: number;
  largestExpense: Pick<ExpenseItem, 'id' | 'title' | 'amount' | 'category' | 'expense_date'> | null;
}

export interface ExpenseFilters {
  search?: string;
  category?: string;
  startDate?: string;
  endDate?: string;
  status?: ExpenseStatusFilter;
}

export interface ExpenseInput {
  title: string;
  category: ExpenseCategory;
  amount: string;
  expense_date: string;
  payment_method: ExpensePaymentMethod;
  recipient: string | null;
  notes: string | null;
}

export const expenseService = {
  async getSummary(): Promise<ExpenseSummaryData> {
    const res = await api.get('/expenses/summary');
    return res.data ?? res;
  },

  async getExpenses(
    params: ExpenseFilters & { page: number; limit: number },
    signal?: AbortSignal
  ): Promise<{ expenses: ExpenseItem[]; total: number; totalAmount: string; categoryTotals: Record<string, { sum: string; count: number }> }> {
    const qp = new URLSearchParams();
    qp.set('limit', String(params.limit));
    qp.set('offset', String((params.page - 1) * params.limit));
    if (params.category && params.category !== 'ALL') qp.set('category', params.category);
    if (params.search) qp.set('search', params.search);
    if (params.startDate) qp.set('startDate', params.startDate);
    if (params.endDate) qp.set('endDate', params.endDate);
    if (params.status) qp.set('status', params.status);
    const res = await api.get(`/expenses?${qp.toString()}`, { signal });
    return {
      expenses: res.data || [],
      total: res.meta?.total || 0,
      totalAmount: res.meta?.totalAmount ?? '0',
      categoryTotals: res.meta?.categoryTotals || {},
    };
  },

  async getExpense(id: number): Promise<ExpenseItem> {
    const res = await api.get(`/expenses/${id}`);
    return res.data ?? res;
  },

  /** requestId: one per form — a retried submit returns the first result. */
  async createExpense(data: ExpenseInput, requestId: string): Promise<ExpenseItem & { duplicate?: boolean }> {
    const res = await api.post('/expenses', { ...data, client_request_id: requestId });
    return res.data ?? res;
  },

  /** expectedUpdatedAt: the version the form was opened with (409 if changed since). */
  async updateExpense(id: number, data: ExpenseInput, expectedUpdatedAt: string): Promise<ExpenseItem> {
    const res = await api.put(`/expenses/${id}`, { ...data, expected_updated_at: expectedUpdatedAt });
    return res.data ?? res;
  },

  /** Cancels (the record is kept and leaves every total). */
  async cancelExpense(id: number, reason: string | null): Promise<ExpenseItem> {
    const res = await api.delete(`/expenses/${id}`, { reason });
    return res.data ?? res;
  },
};
