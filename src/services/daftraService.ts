import { fetchDbInvoices } from './dbService';

/**
 * Daftra Service — Legacy compatibility layer
 * All data now comes from Railway backend (PostgreSQL)
 * No direct Daftra API calls from frontend
 */

export async function fetchDaftraPage(
  endpoint: string,
  _params: Record<string, string | number> = {},
  signal?: AbortSignal
) {
  if (endpoint === 'invoices') {
    const invoices = await fetchDbInvoices(signal);
    return {
      items: invoices,
      pagination: { next: null, page_count: 1 },
    };
  }
  return { items: [], pagination: {} };
}

export async function fetchAllDaftraPages(
  endpoint: string,
  _params: Record<string, string | number> = {},
  signal?: AbortSignal
) {
  if (endpoint === 'invoices') {
    return await fetchDbInvoices(signal);
  }
  return [];
}

export async function fetchAllDaftraInvoices(signal?: AbortSignal) {
  return await fetchDbInvoices(signal);
}