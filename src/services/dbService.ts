import type { Invoice } from '../utils/models';
import { env } from '../utils/env';
import { requestJson } from './http';

// ═══════════════════════════════════════════════════════════
//  Helper: unwrap Railway API responses
// ═══════════════════════════════════════════════════════════
async function fetchRailway<T>(endpoint: string, options?: any): Promise<T> {
  const url = `${env.apiUrl}${endpoint}`;
  const res = await requestJson<{
    success: boolean;
    data: T;
    meta?: any;
    error?: any;
  }>(url, options);
  if (!res.success) throw new Error(res.error?.message || 'API Error');
  return res.data;
}

async function fetchRailwayWithMeta<T>(
  endpoint: string,
  options?: any
): Promise<{ data: T; meta?: any }> {
  const url = `${env.apiUrl}${endpoint}`;
  const res = await requestJson<{
    success: boolean;
    data: T;
    meta?: any;
    error?: any;
  }>(url, options);
  if (!res.success) throw new Error(res.error?.message || 'API Error');
  return { data: res.data, meta: res.meta };
}

// ═══════════════════════════════════════════════════════════
//  Settings
// ═══════════════════════════════════════════════════════════
export async function fetchDbSettings(signal?: AbortSignal) {
  return fetchRailway<any[]>('/settings', { signal });
}

export async function saveDbSettings(
  key: string,
  value: string,
  signal?: AbortSignal
) {
  return fetchRailway<any>('/settings', {
    method: 'PUT',
    body: { settings: [{ key, value }] },
    signal,
  });
}

// ═══════════════════════════════════════════════════════════
//  Invoices
// ═══════════════════════════════════════════════════════════
export async function fetchDbInvoices(signal?: AbortSignal) {
  const allInvoices: Invoice[] = [];
  let page = 1;
  const limit = 200;

  while (true) {
    const res = await fetchRailwayWithMeta<Invoice[]>(
      `/invoices?page=${page}&limit=${limit}`,
      { signal }
    );
    if (res.data && res.data.length > 0) {
      allInvoices.push(...res.data);
    }
    if (!res.meta || page >= res.meta.totalPages || !res.data?.length) {
      break;
    }
    page++;
  }
  return allInvoices;
}

export async function fetchDbInvoicesLight(
  params: {
    page?: number;
    limit?: number;
    status?: string;
    search?: string;
  } = {},
  signal?: AbortSignal
) {
  const qp = new URLSearchParams();
  if (params.page) qp.set('page', String(params.page));
  if (params.limit) qp.set('limit', String(params.limit));
  if (params.status && params.status !== 'all')
    qp.set('status', params.status);
  if (params.search) qp.set('search', params.search);

  const url = `${env.apiUrl}/invoices/light?${qp.toString()}`;
  const res = await requestJson<any>(url, { signal });

  return {
    invoices: (res.invoices || res.data || []) as Invoice[],
    pagination: res.pagination || {
      page: 1,
      limit: 50,
      total: 0,
      pages: 1,
    },
  };
}

export async function fetchDbInvoiceFull(
  id: string,
  signal?: AbortSignal
) {
  return fetchRailway<Invoice & { needs_enrichment?: boolean }>(
    `/invoices/${encodeURIComponent(id)}`,
    { signal }
  );
}

export async function enrichSingleInvoice(
  daftraId: string,
  signal?: AbortSignal
) {
  return fetchRailway<any>(
    `/sync/enrich-single/${encodeURIComponent(daftraId)}`,
    { signal }
  );
}

export async function saveDbInvoice(
  invoice: Invoice,
  signal?: AbortSignal
) {
  return fetchRailway<any>('/invoices', {
    method: 'POST',
    body: invoice,
    signal,
  });
}

export async function deleteDbInvoice(
  id: string,
  signal?: AbortSignal
) {
  return fetchRailway<any>(
    `/invoices/${encodeURIComponent(id)}`,
    { method: 'DELETE', signal }
  );
}

export async function bulkSaveDbInvoices(
  invoices: Invoice[],
  signal?: AbortSignal
) {
  let saved = 0;
  for (const inv of invoices) {
    try {
      await saveDbInvoice(inv, signal);
      saved++;
    } catch (e) {
      console.error('Failed to save invoice', inv, e);
    }
  }
  return { saved };
}

// ═══════════════════════════════════════════════════════════
//  Summary
// ═══════════════════════════════════════════════════════════
export type DaftraSummaryStatus = {
  count: number;
  total: number;
  paid_amount?: number;
};

export type DaftraSummary = {
  month: string;
  date_from: string;
  date_to: string;
  paid: DaftraSummaryStatus;
  unpaid: DaftraSummaryStatus;
  partial: DaftraSummaryStatus & { paid_amount: number };
  returned: DaftraSummaryStatus;
  total: DaftraSummaryStatus;
  collected: number;
  uncollected: number;
};

export async function fetchDaftraSummary(
  month?: string,
  signal?: AbortSignal
): Promise<DaftraSummary> {
  const qp = month ? `?month=${encodeURIComponent(month)}` : '';
  return fetchRailway<DaftraSummary>(
    `/invoices/summary${qp}`,
    { signal }
  );
}

export async function fetchAllTimeSummary(
  signal?: AbortSignal
): Promise<any> {
  return fetchRailway<any>('/invoices/summary/all', { signal });
}

// ═══════════════════════════════════════════════════════════
//  Sync
// ═══════════════════════════════════════════════════════════
export async function syncRecentFromDaftra(signal?: AbortSignal) {
  return fetchRailway<any>('/sync/recent', { signal });
}

export async function syncAllFromDaftra(
  pages?: number,
  signal?: AbortSignal
) {
  return requestJson<{ success: boolean; data: any }>(
    `${env.apiUrl}/sync/from-daftra`,
    { method: 'POST', body: { pages }, signal }
  ).then((res) => res.data);
}

export async function fetchSyncStatus(signal?: AbortSignal) {
  return fetchRailway<any>('/sync/status', { signal });
}

// ═══════════════════════════════════════════════════════════
//  Debug / Detail endpoints
// ═══════════════════════════════════════════════════════════
export async function fetchDaftraInvoiceDetail(
  daftraId: string,
  signal?: AbortSignal
) {
  return fetchRailway<any>(
    `/invoices/by-daftra/${encodeURIComponent(daftraId)}`,
    { signal }
  );
}

export async function fetchDbInvoiceDetail(
  id: string,
  signal?: AbortSignal
) {
  return fetchRailway<Invoice>(
    `/invoices/${encodeURIComponent(id)}`,
    { signal }
  );
}

export async function fetchExtractedData(
  daftraId: string,
  signal?: AbortSignal
) {
  return fetchRailway<any>(
    `/sync/enrich-single/${encodeURIComponent(daftraId)}`,
    { signal }
  ).then((res: any) => res.extracted);
}

// ═══════════════════════════════════════════════════════════
//  Partial clients
// ═══════════════════════════════════════════════════════════
export async function fetchPartialClients(signal?: AbortSignal) {
  return fetchRailway<any>('/clients/partial', { signal });
}

// ═══════════════════════════════════════════════════════════
//  Enrich missing invoices
// ═══════════════════════════════════════════════════════════
export async function enrichMissingInvoices(
  limit = 30,
  signal?: AbortSignal
) {
  return requestJson<{ success: boolean; data: any }>(
    `${env.apiUrl}/sync/enrich?limit=${limit}`,
    { method: 'POST', signal }
  ).then((res) => res.data);
}

// ═══════════════════════════════════════════════════════════
//  Clients Module
// ═══════════════════════════════════════════════════════════
export type ClientSegment =
  | 'vip'
  | 'active'
  | 'regular'
  | 'dormant'
  | 'defaulter'
  | 'new';

export type ClientRecord = {
  id: string;
  daftra_id: string;
  name: string;
  phone: string;
  email: string;
  city: string;
  state: string;
  country_code: string;
  address: string;
  category: string;
  notes: string;
  created_at: string;
  total_invoices: number;
  total_revenue: number;
  total_paid: number;
  total_remaining: number;
  paid_count: number;
  unpaid_count: number;
  partial_count: number;
  returned_count: number;
  last_invoice_date: string;
  last_invoice_id: string;
  first_invoice_date: string;
  avg_invoice: number;
  max_invoice: number;
  segment: ClientSegment;
  collection_rate: number;
  updated_at: string;
};

export type ClientsStatsResponse = {
  clients: ClientRecord[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
};

export type ClientsSummaryResponse = {
  totals: {
    clients: number;
    invoices: number;
    revenue: number;
    paid: number;
    remaining: number;
    collection_rate: number;
  };
  segments: Array<{ segment: string; count: number }>;
  cities: Array<{ city: string; count: number }>;
  top_clients: ClientRecord[];
  recent_clients: ClientRecord[];
};

export type ClientProfileInvoice = {
  id: string;
  daftra_id: string;
  client: string;
  phone: string;
  awb: string;
  carrier: string;
  price: number;
  date: string;
  status: string;
  partial_paid: number;
  dhl_cost: number;
  details: string;
  sender: string;
  receiver: string;
  receiver_country: string;
  final_weight: string;
};

export type ClientProfileMonthly = {
  month: string;
  count: number;
  revenue: number;
  paid: number;
  paid_count: number;
  unpaid_count: number;
  partial_count: number;
};

export type ClientProfileStatusBreakdown = {
  status: string;
  count: number;
  total: number;
  paid: number;
};

export type ClientProfileResponse = {
  client: ClientRecord;
  invoices: ClientProfileInvoice[];
  monthly: ClientProfileMonthly[];
  status_breakdown: ClientProfileStatusBreakdown[];
  invoice_count: number;
};

export type ClientSegmentStats = {
  segment: string;
  count: number;
  revenue: number;
  remaining: number;
  avg_collection: number;
};

export async function initClientsTable(
  _signal?: AbortSignal
) {
  return { ok: true, message: 'Managed by backend migrations now' };
}

export async function syncClientsFromDaftra(
  pages = 50,
  signal?: AbortSignal
) {
  return requestJson<any>(
    `${env.apiUrl}/sync/clients-from-daftra`,
    { method: 'POST', body: { pages }, signal }
  ).then((res: any) => res.data);
}

export async function fetchClientStats(
  params: {
    page?: number;
    limit?: number;
    search?: string;
    segment?: string;
    city?: string;
    sort?: string;
    order?: string;
  } = {},
  signal?: AbortSignal
): Promise<ClientsStatsResponse> {
  const qp = new URLSearchParams();
  if (params.page) qp.set('page', String(params.page));
  if (params.limit) qp.set('limit', String(params.limit));
  if (params.search) qp.set('search', params.search);
  if (params.segment && params.segment !== 'all')
    qp.set('segment', params.segment);
  if (params.city && params.city !== 'all') qp.set('city', params.city);
  if (params.sort) qp.set('sort', params.sort);
  if (params.order) qp.set('order', params.order);

  const res = await fetchRailwayWithMeta<ClientRecord[]>(
    `/clients?${qp.toString()}`,
    { signal }
  );

  return {
    clients: res.data,
    pagination: {
      page: res.meta?.page || 1,
      limit: res.meta?.limit || 50,
      total: res.meta?.total || 0,
      pages: res.meta?.totalPages || 1,
    },
  };
}

export async function fetchClientsSummary(
  signal?: AbortSignal
): Promise<ClientsSummaryResponse> {
  return fetchRailway<ClientsSummaryResponse>('/clients/summary', {
    signal,
  });
}

export async function fetchClientProfile(
  idOrName: string,
  _byId = false,
  signal?: AbortSignal
): Promise<ClientProfileResponse> {
  const res = await fetchRailway<any>(
    `/clients/${encodeURIComponent(idOrName)}`,
    { signal }
  );

  // Backend returns { client, invoices, monthly, status_breakdown, invoice_count }
  if (res.client) {
    return res as ClientProfileResponse;
  }

  // Fallback: old format
  return {
    client: res,
    invoices: res.invoices || [],
    monthly: res.monthly || [],
    status_breakdown: res.status_breakdown || [],
    invoice_count: res.invoice_count || 0,
  };
}

export async function updateClientInfo(
  data: {
    id: string;
    notes?: string;
    category?: string;
    city?: string;
    phone?: string;
    email?: string;
  },
  signal?: AbortSignal
) {
  return fetchRailway<any>(
    `/clients/${encodeURIComponent(data.id)}`,
    { method: 'PUT', body: data, signal }
  ).then(() => ({ ok: true }));
}

export async function fetchClientCities(signal?: AbortSignal) {
  return fetchRailway<any[]>('/clients/cities', { signal });
}

export async function fetchClientSegments(signal?: AbortSignal) {
  return fetchRailway<any[]>('/clients/segments', { signal });
}

export async function recalculateClientStats(signal?: AbortSignal) {
  return requestJson<any>(`${env.apiUrl}/clients/recalculate`, {
    method: 'POST',
    signal,
  });
}
//  Delete Client
// ═══════════════════════════════════════════════════════════
export async function deleteClient(
  id: string,
  signal?: AbortSignal
) {
  return fetchRailway<any>(`/clients/${id}`, { method: 'DELETE', signal });
}

//  Merge Clients
// ═══════════════════════════════════════════════════════════
export async function mergeClients(
  masterId: string,
  idsToMerge: string[],
  signal?: AbortSignal
) {
  return fetchRailway<any>(`/clients/merge`, {
    method: 'POST',
    body: { master_id: masterId, ids_to_merge: idsToMerge },
    signal,
  });
}