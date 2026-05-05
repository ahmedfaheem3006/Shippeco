import { env } from '../utils/env';
import { api } from '../utils/apiClient';
import type { PaymobLink, PaymobStats } from '../utils/models';

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
  description: string;
  integration_type?: string;
};

export type CreatePaymentResponse = {
  payment_url?: string;
  payment_url_full?: string;
  order_id?: string | number;
  client_secret?: string;
  shortened?: boolean;
  error?: string;
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
  payload: CreatePaymentRequest,
  signal?: AbortSignal
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
    // Try Worker first
    const result = await workerFetch<CreatePaymentResponse>(
      `${env.workerUrl}?action=create-payment`,
      {
        method: 'POST',
        body: JSON.stringify(normalizedPayload),
        signal,
      }
    );

      if (result.error) {
        throw new Error(result.error);
      }

      if (!result.payment_url && !result.payment_url_full) {
        // Check if it's a phone/validation issue
        const errorMsg = result.client_secret 
          ? 'لم يتم إرجاع رابط الدفع'
          : 'Paymob رفضت الطلب — تأكد من صحة البيانات (الرقم يجب أن يكون سعودي)';
        throw new Error(errorMsg);
      }

    // NEW: Save to Backend DB so it shows in history immediately
    try {
      await api.post('/paymob/links', {
        ...normalizedPayload,
        payment_url: result.payment_url || result.payment_url_full,
        payment_url_full: result.payment_url_full || result.payment_url,
        paymob_order_id: String(result.order_id || ''),
        client_secret: result.client_secret || '',
      });
    } catch (saveErr) {
      console.warn('[Paymob] Silent save to DB failed:', saveErr);
    }

    return result;
  } catch (workerError: any) {
    console.warn('[Paymob] Worker failed, trying Backend...', workerError);
    
    // Fallback: try Backend
    try {
      const backendResult = await api.post<any>('/paymob/create-link', normalizedPayload);
      const d = backendResult?.data || backendResult;
      
      if (!d?.payment_url) {
        throw new Error(d?.error || 'فشل إنشاء الرابط');
      }

      return {
        payment_url: d.payment_url,
        payment_url_full: d.payment_url_full,
        order_id: d.order_id || d.paymob_order_id,
        client_secret: d.client_secret,
      };
    } catch (backendError: any) {
      // Both failed — show the backend error as it's more relevant now
      const msg = backendError?.message || workerError?.message || 'فشل إنشاء رابط الدفع';
      throw new Error(msg);
    }
  }
}

export async function checkPayment(
  orderId: string | number,
  signal?: AbortSignal
): Promise<CheckPaymentResponse> {
  try {
    const q = new URLSearchParams({ action: 'check-payment', order_id: String(orderId) });
    return await workerFetch<CheckPaymentResponse>(
      `${env.workerUrl}?${q.toString()}`,
      { signal }
    );
  } catch {
    // Fallback to backend
    try {
      const result = await api.get<any>(`/paymob/check/${orderId}`);
      return result?.data || result;
    } catch {
      return { paid: false, error: 'فشل التحقق' };
    }
  }
}

/* ═══════════════════════════════════════
   Backend-based calls (DB operations)
   ═══════════════════════════════════════ */

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

  ping: async (): Promise<{ status: string }> => {
    try {
      const result = await api.get<any>('/paymob/ping');
      return result?.data || result || { status: 'error' };
    } catch {
      return { status: 'error' };
    }
  },
};