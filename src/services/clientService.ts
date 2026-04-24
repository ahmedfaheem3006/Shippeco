import { unifiedService } from './unifiedService';

export const clientService = {

  async getClients(params: any = {}): Promise<any> {
    const cleanParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== 'undefined' && value !== '') {
        cleanParams.set(key, String(value));
      }
    }
    const queryStr = cleanParams.toString();
    const endpoint = `/clients${queryStr ? '?' + queryStr : ''}`;

    const result: any = await unifiedService.get(endpoint);

    // ═══ Handle ALL possible response shapes ═══

    // Shape 1: apiClient returned full object { success, data, meta }
    if (result && result.success && result.data !== undefined) {
      const clients = Array.isArray(result.data) ? result.data : [];
      const meta = result.meta || {};
      return {
        clients,
        pagination: {
          page: meta.page || meta.currentPage || 1,
          limit: meta.limit || meta.perPage || 30,
          total: meta.total || meta.totalItems || clients.length,
          pages: meta.totalPages || meta.pages || Math.ceil((meta.total || clients.length) / (meta.limit || 30)),
        },
      };
    }

    // Shape 2: apiClient unwrapped — result is { clients, pagination }
    if (result && result.clients && result.pagination) {
      return {
        clients: result.clients,
        pagination: {
          page: result.pagination.page || 1,
          limit: result.pagination.limit || 30,
          total: result.pagination.total || 0,
          pages: result.pagination.pages || result.pagination.totalPages || 0,
        },
      };
    }

    // Shape 3: apiClient unwrapped — result is array (no meta)
    if (Array.isArray(result)) {
      return {
        clients: result,
        pagination: { page: 1, limit: 30, total: result.length, pages: 1 },
      };
    }

    // Shape 4: result is { data: [...], meta: {...} } (from apiClient when meta exists)
    if (result && result.data && Array.isArray(result.data)) {
      const meta = result.meta || result.pagination || {};
      const clients = result.data;
      return {
        clients,
        pagination: {
          page: meta.page || 1,
          limit: meta.limit || 30,
          total: meta.total || clients.length,
          pages: meta.totalPages || meta.pages || Math.ceil((meta.total || clients.length) / (meta.limit || 30)),
        },
      };
    }

    // Fallback
    return {
      clients: [],
      pagination: { page: 1, limit: 30, total: 0, pages: 0 },
    };
  },

  async getClientSummary(): Promise<any> {
    const result: any = await unifiedService.get('/clients/summary');
    // Handle wrapped vs unwrapped
    if (result && result.success && result.data) return result.data;
    return result;
  },

  async getClientProfile(id: string): Promise<any> {
    const result: any = await unifiedService.get(`/clients/${id}`);
    // Handle wrapped
    if (result && result.success && result.data) {
      const data = result.data;
      if (data.client) return data;
      return { client: data, invoices: data.invoices || [], monthly: data.monthly || [] };
    }
    if (result?.client) return result;
    return { client: result, invoices: result?.invoices || [], monthly: result?.monthly || [] };
  },

  async updateClient(id: string, data: any): Promise<any> {
    const result = await unifiedService.put(`/clients/${id}`, data);
    return result;
  },

  async getCities(): Promise<any> {
    const result: any = await unifiedService.get('/clients/cities');
    if (result && result.success && result.data) return result.data;
    return Array.isArray(result) ? result : [];
  },

  async getSegments(): Promise<any> {
    const result: any = await unifiedService.get('/clients/segments');
    if (result && result.success && result.data) return result.data;
    return Array.isArray(result) ? result : [];
  },

  async getPartialClients(): Promise<any> {
    const result: any = await unifiedService.get('/clients/partial');
    if (result && result.success && result.data) return result.data;
    return Array.isArray(result) ? result : [];
  },

  async recalculateStats(): Promise<any> {
    const result = await unifiedService.post('/clients/recalculate', {});
    return result;
  },

  async sync(pages = 50): Promise<any> {
    const result = await unifiedService.post('/sync/clients-from-daftra', { pages });
    return result;
  },
};