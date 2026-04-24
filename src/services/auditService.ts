import { api } from '../utils/apiClient';

export const auditService = {
  async getLogs(params: any = {}) {
    const qp = new URLSearchParams(params).toString();
    return api.get(`/audit-log?${qp}`);
  },

  async logAction(action: string, entity: string, entityId?: number, meta?: any) {
    return api.post('/audit-log', { action, entity_type: entity, entity_id: entityId, meta });
  }
};
