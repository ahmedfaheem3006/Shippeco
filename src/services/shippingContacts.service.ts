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
  /** SHIPPEC alias (search / display only — never sent to DHL). */
  saved_name: string;
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
  /** The DHL State value (US / CA / AU: the short code). */
  province: string | null;
  /** The full state / province / region name (display only). */
  province_name?: string | null;
  postal_code: string | null;
  country_code: string;
}
/** One locality for a postal code (Backend PostalLocality). */
export interface PostalLocality { postal_code: string; city: string | null; province: string | null; province_name: string | null; country_code: string; provider: 'google' }
export interface AddressSuggestion {
  id: string | null;
  main: string;
  secondary: string;
  short_address: string | null;
  address: LookupAddress | null;
  provider: 'spl' | 'google';
}

/** A save the Backend refused because the alias is taken (409 CONTACT_NAME_EXISTS): the contact holding it. */
export function duplicatesOf(err: unknown): SavedContact[] | null {
  if (!(err instanceof ApiError) || err.code !== 'CONTACT_NAME_EXISTS') return null;
  const body = err.body as { data?: { duplicates?: SavedContact[] } } | undefined;
  return body?.data?.duplicates ?? [];
}

export const shippingContactsService = {
  async search(q: string, role: 'sender' | 'receiver', signal?: AbortSignal): Promise<SavedContact[]> {
    const qp = new URLSearchParams({ q, role, limit: '8' });
    return api.get<SavedContact[]>(`/shipping-contacts?${qp}`, { signal });
  },
  async create(role: 'sender' | 'receiver', savedName: string, contact: ContactFields): Promise<SavedContact> {
    return api.post<SavedContact>('/shipping-contacts', { role, saved_name: savedName, contact });
  },
  async update(id: number, role: 'sender' | 'receiver', savedName: string, contact: ContactFields): Promise<SavedContact> {
    return api.put<SavedContact>(`/shipping-contacts/${id}`, { role, saved_name: savedName, contact });
  },
};

export const addressLookupService = {
  async autocomplete(q: string, country: string, session: string, signal?: AbortSignal): Promise<AddressSuggestion[]> {
    const qp = new URLSearchParams({ q, country, session });
    return api.get<AddressSuggestion[]>(`/address-lookup/autocomplete?${qp}`, { signal });
  },
  /** City field: cities only, inside the country (Google Places behind the Backend). */
  async cities(q: string, country: string, session: string, signal?: AbortSignal): Promise<AddressSuggestion[]> {
    const qp = new URLSearchParams({ q, country, session });
    return api.get<AddressSuggestion[]>(`/address-lookup/cities?${qp}`, { signal });
  },
  async details(id: string, country: string, session: string): Promise<LookupAddress> {
    const qp = new URLSearchParams({ id, country, session });
    return api.get<LookupAddress>(`/address-lookup/details?${qp}`);
  },
  async postalCode(code: string, country: string, signal?: AbortSignal): Promise<PostalLocality[]> {
    const qp = new URLSearchParams({ code, country });
    return api.get<PostalLocality[]>(`/address-lookup/postal-code?${qp}`, { signal });
  },
  async shortAddress(code: string, signal?: AbortSignal): Promise<AddressSuggestion[]> {
    return api.get<AddressSuggestion[]>(`/address-lookup/short-address/${encodeURIComponent(code)}`, { signal });
  },
};
