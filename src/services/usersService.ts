import { api } from '../utils/apiClient';

export interface User {
  id: number;
  email: string;
  full_name: string;
  phone?: string;
  role: 'admin' | 'employee' | 'accountant' | 'viewer';
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason?: string;
  created_at: string;
  last_login?: string;
  is_active: boolean;
}

export const usersService = {
  getUsers: async (): Promise<User[]> => {
    try {
      const result = await api.get<any>('/users');
      if (Array.isArray(result)) return result;
      if (result && Array.isArray(result.data)) return result.data;
      return [];
    } catch {
      console.warn('[Users] Failed to fetch users');
      return [];
    }
  },

  getPendingUsers: async (): Promise<User[]> => {
    try {
      const result = await api.get<any>('/users/pending');
      if (Array.isArray(result)) return result;
      if (result && Array.isArray(result.data)) return result.data;
      return [];
    } catch {
      return [];
    }
  },

  approveUser: async (id: number): Promise<User> => {
    return api.put<User>(`/users/${id}/approve`, {});
  },

  rejectUser: async (id: number, reason: string): Promise<User> => {
    return api.put<User>(`/users/${id}/reject`, { reason });
  },

  changeRole: async (id: number, role: string): Promise<User> => {
    return api.put<User>(`/users/${id}/role`, { role });
  },

  updateUser: async (id: number, data: { full_name?: string; email?: string; phone?: string }): Promise<User> => {
    return api.put<User>(`/users/${id}`, data);
  },

  activateUser: async (id: number): Promise<User> => {
    return api.put<User>(`/users/${id}/activate`, {});
  },

  deactivateUser: async (id: number): Promise<User> => {
    return api.put<User>(`/users/${id}/deactivate`, {});
  },

  deleteUser: async (id: number): Promise<void> => {
    return api.delete(`/users/${id}`);
  },
};