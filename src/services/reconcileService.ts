import { useAuthStore } from '../hooks/useAuthStore';
import { env } from '../utils/env';

const API = env.apiUrl;

function getHeaders(json = true) {
  const token = useAuthStore.getState().token;
  const h: Record<string, string> = {};
  if (token) h['Authorization'] = `Bearer ${token}`;
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

export const reconcileApiService = {

  /** Submit DHL invoice PDF/Excel for AI-powered reconciliation */
  async submitDhlInvoice(file: File): Promise<{ job_id: string }> {
    const formData = new FormData();
    formData.append('file', file);

    const token = useAuthStore.getState().token;
    const res = await fetch(`${API}/reconcile/dhl-invoice`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json?.error?.message || json?.detail || 'Upload failed');
    return json?.data ?? json;
  },

  /** Poll job status */
  async getJobStatus(jobId: string): Promise<{
    status: 'processing' | 'done' | 'error';
    step?: string;
    progress?: number;
    result?: any;
    error?: string;
  }> {
    const res = await fetch(`${API}/reconcile/dhl-invoice/status/${jobId}`, {
      headers: getHeaders(false),
    });

    const json = await res.json();
    if (!res.ok && json?.status !== 'error') {
      throw new Error(json?.error?.message || 'Status check failed');
    }
    return json?.data ?? json;
  },

  /** Export reconciliation report to Excel */
  async exportExcel(reportData: any): Promise<Blob> {
    const res = await fetch(`${API}/reconcile/dhl-invoice/export`, {
      method: 'POST',
      headers: getHeaders(true),
      body: JSON.stringify(reportData),
    });

    if (!res.ok) throw new Error('Export failed');
    return res.blob();
  },

  /** Start AWB backfill job (Admin only) */
  async startBackfill(): Promise<{ job_id: string }> {
    const res = await fetch(`${API}/sync/backfill-fast`, {
      method: 'POST',
      headers: getHeaders(true),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.message || 'Backfill failed');
    return json?.data ?? json;
  },

  /** Get backfill job status */
  async getBackfillStatus(jobId: string): Promise<any> {
    const res = await fetch(`${API}/sync/backfill-status/${jobId}`, {
      headers: getHeaders(false),
    });
    const json = await res.json();
    return json?.data ?? json;
  },

  /** Get Reconciliation History */
  async getHistory(limit = 50, offset = 0): Promise<any[]> {
    const res = await fetch(`${API}/reconcile/history?limit=${limit}&offset=${offset}`, {
      headers: getHeaders(false),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error?.message || 'Failed to fetch history');
    return json?.data ?? json;
  },

  /** Assign Client to History Record */
  async assignClient(id: number, clientId: number | null): Promise<any> {
    const res = await fetch(`${API}/reconcile/history/${id}/assign`, {
      method: 'POST',
      headers: getHeaders(true),
      body: JSON.stringify({ clientId }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error?.message || 'Failed to assign client');
    return json?.data ?? json;
  },
};