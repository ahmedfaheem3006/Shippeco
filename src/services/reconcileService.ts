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
};