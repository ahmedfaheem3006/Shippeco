import { unifiedService } from './unifiedService';

export interface Task {
  id: number;
  title: string;
  description: string;
  assigned_to: number;
  assigned_by: number;
  status: 'open' | 'closed';
  created_at: string;
  updated_at: string;
  assigned_to_name?: string;
  assigned_by_name?: string;
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

export const tasksService = {
  async getTasks(params: { status?: string } = {}): Promise<Task[]> {
    const qp = new URLSearchParams();
    if (params.status) qp.set('status', params.status);
    const result = await unifiedService.get<any>(`/tasks?${qp.toString()}`);
    return result.success ? result.data : result;
  },

  async getTask(id: number): Promise<Task> {
    const result = await unifiedService.get<any>(`/tasks/${id}`);
    return result.success ? result.data : result;
  },

  async createTask(data: { title: string; description?: string; assigned_to: number }): Promise<Task> {
    const result = await unifiedService.post<any>('/tasks', data);
    return result.success ? result.data : result;
  },

  async updateStatus(id: number, status: 'open' | 'closed'): Promise<Task> {
    const result = await unifiedService.patch<any>(`/tasks/${id}/status`, { status });
    return result.success ? result.data : result;
  },

  async addMessage(taskId: number, message: string): Promise<TaskMessage> {
    const result = await unifiedService.post<any>(`/tasks/${taskId}/messages`, { message });
    return result.success ? result.data : result;
  }
};
