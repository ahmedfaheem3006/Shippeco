import { unifiedService } from './unifiedService';
import { api } from '../utils/apiClient';

export interface Task {
  id: number;
  title: string;
  description: string | null;
  assigned_to: number;
  assigned_by: number;
  status: 'open' | 'closed';
  created_at: string;
  updated_at: string;
  assigned_to_name?: string;
  assigned_by_name?: string;
  invoice_id?: number;
  /** invoices.id of the linked invoice (invoice_id may hold a Daftra id). */
  invoice_ref_id?: number | null;
  invoice_number?: string;
  invoice_awb?: string;
  invoice_total?: number;
  invoice_payment_status?: number;
  messages?: TaskMessage[];
}

export interface TaskMessage {
  id: number;
  task_id: number;
  user_id: number;
  message: string;
  created_at: string;
  user_name?: string;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  assigned_to: number;
  invoice_id?: number | null;
}

const unwrap = <T,>(result: unknown): T =>
  (result && typeof result === 'object' && (result as { success?: boolean }).success
    ? (result as { data: T }).data
    : result) as T;

// Reads go straight to the API client, not through unifiedService.get: its
// 30s response cache made the task window's live refresh show stale replies
// and the list miss a just-created task. Writes still go through
// unifiedService so its cache is invalidated for other pages.
export const tasksService = {
  async getTasks(params: { status?: string; scope?: string; view?: string } = {}, signal?: AbortSignal): Promise<Task[]> {
    const qp = new URLSearchParams();
    if (params.status) qp.set('status', params.status);
    if (params.scope) qp.set('scope', params.scope);
    if (params.view) qp.set('view', params.view);
    return unwrap<Task[]>(await api.get(`/tasks?${qp.toString()}`, { signal }));
  },

  async getTask(id: number, signal?: AbortSignal): Promise<Task> {
    return unwrap<Task>(await api.get(`/tasks/${id}`, { signal }));
  },

  async createTask(data: CreateTaskInput): Promise<Task> {
    return unwrap<Task>(await unifiedService.post<unknown>('/tasks', data));
  },

  async updateStatus(id: number, status: 'open' | 'closed'): Promise<Task> {
    return unwrap<Task>(await unifiedService.patch<unknown>(`/tasks/${id}/status`, { status }));
  },

  async addMessage(taskId: number, message: string): Promise<TaskMessage> {
    return unwrap<TaskMessage>(await unifiedService.post<unknown>(`/tasks/${taskId}/messages`, { message }));
  },
};
