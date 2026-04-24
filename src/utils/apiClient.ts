import { useAuthStore } from '../hooks/useAuthStore';
import { env } from './env';

const API_BASE_URL = env.apiUrl;

class ApiClient {
  private getHeaders() {
    const token = useAuthStore.getState().token;
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  async get<T = any>(endpoint: string): Promise<T> {
    const res = await fetch(`${API_BASE_URL}${endpoint}`, { headers: this.getHeaders() });
    return this.handleResponse(res);
  }

  async post<T = any>(endpoint: string, body: any): Promise<T> {
    const res = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });
    return this.handleResponse(res);
  }

  async put<T = any>(endpoint: string, body: any): Promise<T> {
    const res = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });
    return this.handleResponse(res);
  }

  async delete<T = any>(endpoint: string): Promise<T> {
    const res = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    return this.handleResponse(res);
  }

  private async handleResponse(res: Response) {
    const json = await res.json().catch(() => null);
    
    if (res.status === 401) {
      if (!res.url.includes('/auth/login')) {
        useAuthStore.getState().logout();
        throw new Error('جلسة العمل منتهية. الرجاء تسجيل الدخول مجدداً.');
      }
      return json;
    }

    if (!res.ok) {
      throw new Error(json?.error?.message || json?.message || 'Internal server error');
    }
    
    // ════════════════════════════════════════════════════════
    // KEY FIX: Return full response when meta/pagination exists
    // so that callers can access pagination info
    // ════════════════════════════════════════════════════════
    if (json?.success && json?.data !== undefined) {
      // If there's meta/pagination, return the whole object
      // so callers can do result.data + result.meta
      if (json.meta || json.pagination) {
        return json;
      }
      // Simple response — unwrap data
      return json.data;
    }
    
    return json;
  }
}

export const api = new ApiClient();