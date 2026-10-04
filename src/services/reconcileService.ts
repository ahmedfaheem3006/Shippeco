import { useAuthStore } from '../hooks/useAuthStore';
import { env } from '../utils/env';
import { api, ApiError } from '../utils/apiClient';
import type { SheetShipment } from '../utils/reconcileSheet';

export type DuplicateRef = { id: number; file_name: string; upload_date: string };
export type ManualEdit = { client?: string | null; weight?: number | null; daftraTotal?: number | null };

const unwrap = (r: any) => (r && typeof r === 'object' && 'success' in r && 'data' in r ? r.data : r);

const API = env.apiUrl;

function getHeaders(json = true) {
  const token = useAuthStore.getState().token;
  const h: Record<string, string> = {};
  if (token) h['Authorization'] = `Bearer ${token}`;
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

export const reconcileApiService = {

  /**
   * Submit a DHL invoice (PDF/Excel). Answers { job_id } — or { duplicate_of }
   * when exactly the same file was reconciled before (send force=true to
   * re-analyse it into that same record).
   */
  async submitDhlInvoice(file: File, force = false): Promise<{ job_id?: string; duplicate_of?: DuplicateRef }> {
    const formData = new FormData();
    formData.append('file', file);
    if (force) formData.append('force', '1');
    return unwrap(await api.postFormData('/reconcile/dhl-invoice', formData));
  },

  /** Excel/CSV tab: rows read in the browser, matched by the server. */
  async matchSheet(payload: { filename: string; file_hash: string | null; force?: boolean; shipments: SheetShipment[] }): Promise<any> {
    return unwrap(await api.post('/reconcile/match', payload));
  },

  /** A stored report (history record). */
  async getResult(id: number): Promise<any> {
    return unwrap(await api.get(`/reconcile/results/${id}`));
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

  /** Excel export of a stored report, limited to the on-screen filter. */
  async exportExcel(historyId: number, filter: string): Promise<Blob> {
    const res = await fetch(`${API}/reconcile/dhl-invoice/export`, {
      method: 'POST',
      headers: getHeaders(true),
      body: JSON.stringify({ history_id: historyId, filter }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => null);
      throw new ApiError(json?.error?.message || 'Export failed', res.status, json?.error?.code, json?.error?.details);
    }
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

  /**
   * Save (edits) or clear (null) a manual correction for one shipment of a
   * stored report. The server recalculates and returns the whole report;
   * 409 when the report changed since `expectedUpdatedAt`.
   */
  async updateHistory(id: number, awb: string, edits: ManualEdit | null, expectedUpdatedAt: string): Promise<any> {
    return unwrap(await api.post(`/reconcile/history/${id}/update`, { awb, edits, expected_updated_at: expectedUpdatedAt }));
  },
};
