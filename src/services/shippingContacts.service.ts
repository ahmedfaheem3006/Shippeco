/**
 * «إنشاء شحنة» → Parties: SHIPPEC's saved senders / receivers and the address
 * lookup. Browser → SHIPPEC Backend only (the address provider keys stay on
 * the server; DHL is never called from here).
 */
import { api, ApiError } from '../utils/apiClient';
import type { PhoneType } from './dhlShipment.service';

export type ContactRole = 'sender' | 'receiver' | 'both';
export interface SavedPhone { type: PhoneType; code: string | null; number: string | null; extension: string | null; sms: boolean }
export interface ContactFields {
  name: string;
  business_contact: boolean;
  company: string | null;
  country_code: string;
  country_name: string | null;
  address_line1: string | null;
  address_line2: string | null;
  short_address: string | null;
  building_number: string | null;
  street: string | null;
  additional_number: string | null;
  suburb: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  residential: boolean;
  email: string | null;
  phones: SavedPhone[];
  vat_tax_id: string | null;
  eori: string | null;
  notes: string | null;
}
export interface SavedContact extends ContactFields {
  id: number;
  role: ContactRole;
  phone_normalized: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

/** Structured address from the provider (Backend StructuredAddress). */
export interface LookupAddress {
  address_line1: string | null;
  address_line2: string | null;
  short_address: string | null;
  building_number: string | null;
  street: string | null;
  additional_number: string | null;
  district: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  country_code: string;
}
export interface AddressSuggestion {
  id: string | null;
  main: string;
  secondary: string;
  short_address: string | null;
  address: LookupAddress | null;
  provider: 'spl' | 'google';
}

/** A save the Backend refused as a likely duplicate (409 CONTACT_DUPLICATE). */
export function duplicatesOf(err: unknown): SavedContact[] | null {
  if (!(err instanceof ApiError) || err.code !== 'CONTACT_DUPLICATE') return null;
  const body = err.body as { data?: { duplicates?: SavedContact[] } } | undefined;
  return body?.data?.duplicates ?? [];
}

export const shippingContactsService = {
  async search(q: string, role: 'sender' | 'receiver', signal?: AbortSignal): Promise<SavedContact[]> {
    const qp = new URLSearchParams({ q, role, limit: '8' });
    return api.get<SavedContact[]>(`/shipping-contacts?${qp}`, { signal });
  },
  async create(role: 'sender' | 'receiver', contact: ContactFields): Promise<SavedContact> {
    return api.post<SavedContact>('/shipping-contacts', { role, contact });
  },
  async update(id: number, role: 'sender' | 'receiver', contact: ContactFields): Promise<SavedContact> {
    return api.put<SavedContact>(`/shipping-contacts/${id}`, { role, contact });
  },
};

export const addressLookupService = {
  async autocomplete(q: string, country: string, session: string, signal?: AbortSignal): Promise<AddressSuggestion[]> {
    const qp = new URLSearchParams({ q, country, session });
    return api.get<AddressSuggestion[]>(`/address-lookup/autocomplete?${qp}`, { signal });
  },
  async details(id: string, country: string, session: string): Promise<LookupAddress> {
    const qp = new URLSearchParams({ id, country, session });
    return api.get<LookupAddress>(`/address-lookup/details?${qp}`);
  },
  async shortAddress(code: string, signal?: AbortSignal): Promise<AddressSuggestion[]> {
    return api.get<AddressSuggestion[]>(`/address-lookup/short-address/${encodeURIComponent(code)}`, { signal });
  },
};
