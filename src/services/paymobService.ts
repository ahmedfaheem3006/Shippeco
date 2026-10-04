import { env } from '../utils/env';
import { api } from '../utils/apiClient';
import type { PaymobLink, PaymobLinkDetails, PaymobStats } from '../utils/models';

/* ═══════════════════════════════════════
   Types
   ═══════════════════════════════════════ */
export type PaymobPingResponse = { status?: string; message?: string; time?: string };

export type CreatePaymentRequest = {
  invoice_id?: string | number;
  invoice_ids?: number[];
  amount: number;
  client_name: string;
  client_phone: string;
  client_email?: string;
  description: string;
  integration_type?: string;
};

export type CreatePaymentResponse = {
  payment_url?: string;
  payment_link?: string;
  payment_url_full?: string;
  order_id?: string | number;
  paymob_order_id?: string | number;
  client_secret?: string;
  shortened?: boolean;
  error?: string;
  already_exists?: boolean;
  message?: string;
};

export type CheckPaymentResponse = {
  paid?: boolean;
  paid_amount?: number;
  total_amount?: number;
  status?: string;
  order_id?: string;
  error?: string;
};

/* ═══════════════════════════════════════
   Phone Normalization (Saudi format)
   ═══════════════════════════════════════ */
function normalizeSaudiPhone(phone: string): string {
  const n = (phone || '').replace(/\D/g, '');
  
  // Already Saudi format
  if (n.startsWith('966') && n.length >= 12) return n;
  
  // Saudi mobile: 05XXXXXXXX
  if (n.startsWith('05') && n.length === 10) return '966' + n.slice(1);
  if (n.startsWith('5') && n.length === 9) return '966' + n;
  
  // International number — just use a valid Saudi placeholder
  // Paymob KSA requires Saudi phone format
  // We keep the real number for display but send a valid one to Paymob
  if (n.length < 9 || n.length > 15) return '966500000000';
  
  // Try to extract last 9 digits as Saudi
  const last9 = n.slice(-9);
  if (last9.startsWith('5')) return '966' + last9;
  
  // Non-Saudi number — use placeholder (Paymob only needs it for billing_data)
  return '966500000000';
}

/* ═══════════════════════════════════════
   Raw fetch helper (for Worker calls)
   ═══════════════════════════════════════ */
async function workerFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
  });

  const text = await res.text();
  
  if (!res.ok) {
    let errorMsg = `HTTP ${res.status}`;
    try {
      const parsed = JSON.parse(text);
      errorMsg = parsed.error || parsed.message || errorMsg;
    } catch {
      errorMsg = text.slice(0, 200) || errorMsg;
    }
    throw new Error(errorMsg);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error('Invalid JSON response from Worker');
  }
}

/* ═══════════════════════════════════════
   Worker calls (Paymob KSA)
   ═══════════════════════════════════════ */

export async function pingPaymobWorker(signal?: AbortSignal): Promise<PaymobPingResponse> {
  try {
    return await workerFetch<PaymobPingResponse>(
      `${env.workerUrl}?action=ping`,
      { signal }
    );
  } catch {
    return { status: 'error', message: 'Worker غير متصل' };
  }
}

export async function createPaymentLink(
  payload: CreatePaymentRequest
): Promise<CreatePaymentResponse> {
  // Normalize phone to Saudi format BEFORE sending to Worker
  const normalizedPayload = {
    ...payload,
    client_phone: normalizeSaudiPhone(payload.client_phone),
    // Ensure amount is a number
    amount: Number(payload.amount),
    // Clean description (remove very long text)
    description: (payload.description || 'خدمة شحن').slice(0, 200),
    // Ensure client_name is not empty
    client_name: (payload.client_name || 'عميل').trim() || 'عميل',
  };

  console.log('[Paymob] Creating payment:', {
    amount: normalizedPayload.amount,
    phone: normalizedPayload.client_phone,
    name: normalizedPayload.client_name,
  });

  try {
    // We intentionally bypass the Worker to ensure the new Backend logic
    // for forcing the Contact Information on Paymob checkout is used.
    const backendResult = await api.post<any>('/paymob/create-link', normalizedPayload);
    const d = backendResult?.data || backendResult;
      
    if (!d?.payment_url && !d?.payment_link) {
      throw new Error(d?.error || 'فشل إنشاء الرابط');
    }

    return {
      payment_url: d.payment_url,
      payment_link: d.payment_link,
      payment_url_full: d.payment_url_full,
      order_id: d.order_id || d.paymob_order_id,
      paymob_order_id: d.paymob_order_id || d.order_id,
      client_secret: d.client_secret,
      already_exists: d.already_exists,
      message: d.message,
    };
  } catch (backendError: any) {
    const msg = backendError?.response?.data?.error?.message || backendError?.message || 'فشل إنشاء رابط الدفع';
    throw new Error(msg);
  }
}

export async function checkPayment(
  orderId: string | number,
  signal?: AbortSignal
): Promise<CheckPaymentResponse> {
  // IMPORTANT: Always call Backend first — it both checks Paymob AND updates the invoice in DB.
  // The Worker only checks status without updating anything.
  try {
    const res = await api.get<{ data: any }>(`/paymob/check/${orderId}`);
    const d = res?.data || res;
    return d;
  } catch (backendErr) {
    console.warn('[Paymob] Backend check failed, trying Worker...', backendErr);
    // Fallback to Worker (read-only check — won't update DB)
    try {
      const q = new URLSearchParams({ action: 'check-payment', order_id: String(orderId) });
      return await workerFetch<CheckPaymentResponse>(
        `${env.workerUrl}?${q.toString()}`,
        { signal }
      );
    } catch {
      return { paid: false, error: 'فشل التحقق' };
    }
  }
}

/* ═══════════════════════════════════════
   Backend-based calls (DB operations)
   ═══════════════════════════════════════ */

export type ReconcileSummary = { webhooksRetried: number; attemptsChecked: number; applied: number; errors: number; skipped?: boolean };

/** GET /paymob/health — which settings exist (never their values) and whether payments are being picked up. */
export type PaymobHealth = {
  config: {
    secret_key: boolean; public_key: boolean; api_key: boolean; hmac_secret: boolean;
    notification_url: string | null; integration_ids: number[]; missing: string[];
  };
  api_auth: { ok: boolean; error?: string };
  webhooks_7d: { status: string; hmac_valid: boolean | null; count: number }[];
  last_webhook: { created_at: string; status: string; hmac_valid: boolean | null; error: string | null } | null;
  reconciler: {
    enabled: boolean; interval_seconds: number; running_here: boolean;
    last_run_at: string | null; last_summary: ReconcileSummary | null; last_error: string | null;
    open_attempts: number; due_now: number; last_checked_at: string | null;
    recent_errors: { error: string; at: string; count: number }[];
  };
  needs_review: number;
};

export const paymobBackend = {
  getLinks: async (params?: { limit?: number; offset?: number; status?: string }): Promise<{ links: PaymobLink[]; total: number }> => {
    try {
      const q = new URLSearchParams();
      if (params?.limit) q.set('limit', String(params.limit));
      if (params?.offset) q.set('offset', String(params.offset));
      if (params?.status && params.status !== 'all') q.set('status', params.status);
      const result = await api.get<any>(`/paymob/links?${q.toString()}`);
      const d = result?.data || result;
      return { links: d?.links || [], total: d?.total || 0 };
    } catch {
      return { links: [], total: 0 };
    }
  },

  getStats: async (): Promise<PaymobStats> => {
    try {
      const result = await api.get<any>('/paymob/stats');
      return result?.data || result || { total: 0, paid_count: 0, pending_count: 0, paid_total: 0, pending_total: 0 };
    } catch {
      return { total: 0, paid_count: 0, pending_count: 0, paid_total: 0, pending_total: 0 };
    }
  },

  createLink: async (data: any): Promise<any> => {
    try {
      const result = await api.post<any>('/paymob/create-link', data);
      return result?.data || result;
    } catch (e) {
      console.warn('[Paymob] Failed to save link to DB:', e);
      return null;
    }
  },

  deleteLink: async (id: number): Promise<void> => {
    await api.delete(`/paymob/links/${id}`);
  },

  /** One link with its invoices, checkout attempts and gateway transactions. Throws ApiError (404/403). */
  getLinkDetails: async (id: number | string): Promise<PaymobLinkDetails> => {
    const result = await api.get<{ data?: PaymobLinkDetails } & Partial<PaymobLinkDetails>>(`/paymob/links/${encodeURIComponent(String(id))}`);
    return (result?.data ?? result) as PaymobLinkDetails;
  },

  /** Ask the server to retry stored callbacks and re-check open payments now. */
  reconcileNow: async (): Promise<ReconcileSummary> => {
    const result = await api.post<{ data?: ReconcileSummary } & Partial<ReconcileSummary>>('/paymob/reconcile', {});
    return (result?.data ?? result) as ReconcileSummary;
  },

  /** Admin/accountant only — throws ApiError (403) for other roles. */
  health: async (): Promise<PaymobHealth> => {
    const result = await api.get<{ data?: PaymobHealth } & Partial<PaymobHealth>>('/paymob/health');
    return (result?.data ?? result) as PaymobHealth;
  },

  ping: async (): Promise<{ status: string }> => {
    try {
      const result = await api.get<any>('/paymob/ping');
      return result?.data || result || { status: 'error' };
    } catch {
      return { status: 'error' };
    }
  },

  /** `returned`: the transaction/order Paymob put on the return URL — the server confirms it with Paymob. */
  getPublicLink: async (id: string | number, returned?: { tx: string; order: string }): Promise<any> => {
    const q = returned ? `?${new URLSearchParams({ tx: returned.tx, order: returned.order }).toString()}` : '';
    const result = await api.get<any>(`/paymob/public-link/${id}${q}`);
    return result?.data || result;
  },

  payPublicLink: async (id: string | number, email: string, phone: string): Promise<any> => {
    const result = await api.post<any>(`/paymob/public-link/${id}/pay`, { email, phone });
    return result?.data || result;
  },
};