import { api } from '../utils/apiClient';

export interface Notification {
  id: number;
  user_id: number | null;
  type: string;
  title: string;
  message: string;
  data: any;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

export interface NotificationsResponse {
  notifications: Notification[];
  total: number;
}

export const notificationsService = {
  getNotifications: async (
    page = 1,
    limit = 20
  ): Promise<NotificationsResponse> => {
    try {
      const offset = (page - 1) * limit;
      const result = await api.get<any>(
        `/notifications?limit=${limit}&offset=${offset}`
      );

      // Handle different response shapes
      if (result && Array.isArray(result)) {
        return { notifications: result, total: result.length };
      }
      if (result && result.notifications) {
        return result;
      }
      if (result && Array.isArray(result.data)) {
        return {
          notifications: result.data,
          total: result.pagination?.total || result.total || result.data.length,
        };
      }
      return { notifications: [], total: 0 };
    } catch {
      return { notifications: [], total: 0 };
    }
  },

  getUnreadCount: async (): Promise<{ count: number }> => {
    try {
      const result = await api.get<any>('/notifications/count');
      if (typeof result === 'number') return { count: result };
      if (result && typeof result.count === 'number') return result;
      if (result && result.data && typeof result.data.count === 'number')
        return { count: result.data.count };
      if (result && typeof result.data === 'number')
        return { count: result.data };
      return { count: 0 };
    } catch {
      return { count: 0 };
    }
  },

  markAsRead: async (id: number): Promise<void> => {
    await api.put(`/notifications/${id}/read`, {});
  },

  markAllAsRead: async (): Promise<void> => {
    await api.put('/notifications/read-all', {});
  },
};