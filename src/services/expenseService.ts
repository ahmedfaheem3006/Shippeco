import { api } from '../utils/apiClient';

export interface ExpenseItem {
  id: number;
  title: string;
  category: 'salaries' | 'assets' | 'waste' | 'operational' | 'other';
  amount: number;
  expense_date: string;
  payment_method: string;
  recipient: string | null;
  notes: string | null;
  attachment_url: string | null;
  created_by: number | null;
  creator_name?: string;
  created_at: string;
}

export interface ExpenseSummaryData {
  totalThisMonth: number;
  categoryBreakdown: Record<string, { sum: number; count: number }>;
  largestExpense: ExpenseItem | null;
}

export const expenseService = {
  async getSummary(): Promise<ExpenseSummaryData> {
    const res = await api.get('/expenses/summary');
    return res.data ?? res;
  },

  async getExpenses(params: {
    page?: number;
    limit?: number;
    category?: string;
    search?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<{ expenses: ExpenseItem[]; total: number; totalAmount: number }> {
    const limit = params.limit || 30;
    const page = params.page || 1;
    const offset = (page - 1) * limit;

    const queryParams = new URLSearchParams();
    queryParams.set('limit', limit.toString());
    queryParams.set('offset', offset.toString());
    if (params.category) queryParams.set('category', params.category);
    if (params.search) queryParams.set('search', params.search);
    if (params.startDate) queryParams.set('startDate', params.startDate);
    if (params.endDate) queryParams.set('endDate', params.endDate);

    const res = await api.get(`/expenses?${queryParams.toString()}`);
    return {
      expenses: res.data || [],
      total: res.meta?.total || 0,
      totalAmount: res.meta?.totalAmount || 0,
    };
  },

  async createExpense(data: Omit<ExpenseItem, 'id' | 'created_at' | 'created_by'>): Promise<ExpenseItem> {
    const res = await api.post('/expenses', data);
    return res.data ?? res;
  },

  async updateExpense(id: number, data: Partial<ExpenseItem>): Promise<ExpenseItem> {
    const res = await api.put(`/expenses/${id}`, data);
    return res.data ?? res;
  },

  async deleteExpense(id: number): Promise<void> {
    await api.delete(`/expenses/${id}`);
  },
};
