/**
 * «إنشاء شحنة» — the SHIPPEC Backend's DHL shipment API (/api/dhl/...).
 * The browser never talks to DHL: every DHL step (products, rates,
 * validateDataOnly, creation, pickups, service points) goes
 * Frontend → SHIPPEC Backend → DHL. No credential or DHL account number is
 * ever sent to, or received by, the browser.
 */
import { api, ApiError } from '../utils/apiClient';
import { useAuthStore } from '../hooks/useAuthStore';
import { env } from '../utils/env';

export type PartyType = 'business' | 'private';
export interface Party {
  company: string | null;
  contact: string | null;
  phone: string | null;
  email: string | null;
  address_line1: string | null;
  address_line2: string | null;
  address_line3: string | null;
  city: string | null;
  postal_code: string | null;
  province: string | null;
  country_code: string | null;
  type: PartyType;
}

export interface PackageInput {
  weight_kg: number | string;
  length_cm: number | string | null;
  width_cm: number | string | null;
  height_cm: number | string | null;
  quantity?: number;
  customer_reference?: string | null;
}

export interface ItemInput {
  description: string;
  quantity: number | string;
  unit: string;
  unit_value: number | string;
  currency?: string | null;
  country_of_origin: string | null;
  outbound_hs_code: string | null;
  inbound_hs_code: string | null;
  unit_net_weight_kg: number | string | null;
  unit_gross_weight_kg?: number | string | null;
  line_gross_weight_kg?: number | string | null;
  export_reason_type?: string | null;
}

export type ShipmentPurpose = 'commercial' | 'gift' | 'personal_not_for_resale' | 'sample' | 'return_for_repair' | 'return_after_repair';
export type TransportPayer = 'shipper' | 'receiver' | 'third_party';
export type DutiesPayer = 'receiver' | 'shipper' | 'third_party';
export type PickupOption = 'none' | 'schedule' | 'drop_off';

/** The draft content the Backend stores (shipmentContent.ts). */
export interface DraftContent {
  client_id: number | null;
  customer_reference: string | null;
  product_code: string | null;
  local_product_code: string | null;
  service_codes: string[];
  customs_required: boolean;
  paperless_trade: boolean;
  content_description: string | null;
  incoterm: string | null;
  currency: string | null;
  declared_value: number | string | null;
  export_reason_type: string | null;
  shipment_type: string | null;
  customs_invoice_number: string | null;
  customs_invoice_date: string | null;
  dhl_invoice_type: 'commercial' | 'proforma' | null;
  shipment_date: string | null;
  origin_gmt_offset: string | null;
  shipment_purpose: ShipmentPurpose | null;
  transport_payer: TransportPayer;
  transport_payer_account: string | null;
  duties_payer: DutiesPayer;
  duties_payer_account: string | null;
  pickup_option: PickupOption;
  pickup_earliest_time: string | null;
  pickup_latest_time: string | null;
  pickup_location: string | null;
  pickup_location_type: 'business' | 'residence' | null;
  pickup_instructions: string | null;
  pickup_address: Party | null;
  service_point_id: string | null;
  service_point_name: string | null;
  shipper: Party & { national_address?: unknown };
  receiver: Party & { national_address?: unknown };
  /** Parties-screen extras stored with the draft (never sent to DHL). */
  party_details?: { shipper: PartyDetailsContent | null; receiver: PartyDetailsContent | null } | null;
  packages: PackageInput[];
  items: ItemInput[];
}

export type PhoneType = 'mobile' | 'office' | 'fax';
export interface PhoneEntry { type: PhoneType; code: string; number: string; extension: string; sms: boolean }
/** Backend partyDetailsSchema (shipper_details / receiver_details). */
export interface PartyDetailsContent {
  business_contact: boolean;
  residential: boolean;
  country_name: string | null;
  short_address: string | null;
  suburb: string | null;
  phones: Array<{ type: PhoneType; code: string | null; number: string | null; extension: string | null; sms: boolean }>;
  vat_tax_id: string | null;
  eori: string | null;
  notes: string | null;
  saved_contact_id: number | null;
}

export type CreationStatus = 'draft' | 'validating' | 'validated' | 'ready' | 'creating' | 'created' | 'uncertain' | 'failed' | 'cancelled';
export interface Issue { field: string; message: string }

export interface PickupCapabilities {
  nextBusinessDay: boolean | null;
  localCutoffDateAndTime: string | null;
  pickupEarliest: string | null;
  pickupLatest: string | null;
  pickupCutoffSameDayOutboundProcessing: string | null;
  pickupAdditionalDays: number | null;
  originServiceAreaCode: string | null;
}
export interface DeliveryCapabilities {
  deliveryTypeCode: string | null;
  estimatedDeliveryDateAndTime: string | null;
  totalTransitDays: number | null;
  deliveryAdditionalDays: number | null;
  destinationServiceAreaCode: string | null;
}
export interface ProductOption {
  productCode: string;
  localProductCode: string | null;
  productName: string | null;
  isCustomerAgreement: boolean | null;
  valueAddedServices?: Array<{ serviceCode: string; name: string | null; isCustomerAgreement: boolean | null }>;
  pickupCapabilities?: PickupCapabilities | null;
  deliveryCapabilities?: DeliveryCapabilities | null;
}
export type ChargeCategory = 'transportation' | 'fuel_surcharge' | 'demand_surcharge' | 'premium' | 'gogreen' | 'other';
export interface RateLine {
  name: string | null;
  serviceCode: string | null;
  typeCode: string | null;
  amount: number | null;
  currency: string | null;
  category: ChargeCategory;
  tax: number | null;
  isCustomerAgreement: boolean | null;
}
export interface RateQuote {
  productCode: string;
  localProductCode: string | null;
  productName: string | null;
  isCustomerAgreement: boolean | null;
  amount: number | null;
  currency: string | null;
  currencyType: string | null;
  taxTotal: number | null;
  estimatedDelivery: string | null;
  totalTransitDays: number | null;
  breakdown: RateLine[];
  weight: { volumetric: number | null; provided: number | null; unit: string | null } | null;
  optionalServices: Array<{ serviceCode: string; name: string | null; serviceTypeCode: string | null; isCustomerAgreement: boolean | null }>;
  pickupCapabilities: PickupCapabilities | null;
  deliveryCapabilities: DeliveryCapabilities | null;
}

export interface ShipmentDocument { id: number; document_type: string; content_type: string; size_bytes: number; sha256: string; origin?: string; created_at?: string }

/** GET /dhl/shipments/:id (dhl_shipments row + derived fields). Only the fields the UI reads are typed. */
export interface DhlShipment {
  id: number;
  dhl_env: string;
  status: string;
  creation_status: CreationStatus;
  shippec_reference: string;
  idempotency_key: string;
  awb: string | null;
  client_id: number | null;
  customer_reference: string | null;
  product_code: string | null;
  local_product_code: string | null;
  product_name: string | null;
  service_codes: string[];
  customs_required: boolean;
  paperless_trade: boolean;
  content_description: string | null;
  incoterm: string | null;
  currency: string | null;
  declared_value: string | null;
  export_reason_type: string | null;
  shipment_type: string | null;
  customs_invoice_number: string | null;
  customs_invoice_date: string | null;
  dhl_invoice_type: 'commercial' | 'proforma' | null;
  shipment_date: string | null;
  origin_gmt_offset: string | null;
  shipment_purpose: ShipmentPurpose | null;
  transport_payer: TransportPayer;
  transport_payer_account: string | null;
  duties_payer: DutiesPayer;
  duties_payer_account: string | null;
  pickup_option: PickupOption;
  pickup_earliest_time: string | null;
  pickup_latest_time: string | null;
  pickup_location: string | null;
  pickup_location_type: 'business' | 'residence' | null;
  pickup_instructions: string | null;
  pickup_address: Party | null;
  service_point_id: string | null;
  service_point_name: string | null;
  package_count: number;
  total_gross_weight: string | null;
  validation_issues: Issue[];
  validation_warnings: Issue[];
  dhl_validation_status: 'not_run' | 'passed' | 'failed' | 'error' | 'unavailable';
  available_products: ProductOption[] | null;
  rate_quotes: RateQuote[] | null;
  dhl_cost: string | null;
  dhl_cost_source: 'dhl_quote' | 'manual' | 'unknown' | null;
  selling_price: string | null;
  price_currency: string | null;
  invoice_id: number | null;
  invoice_link_status: string;
  invoice_link_error: string | null;
  creation_error_code: string | null;
  creation_error_message: string | null;
  message_reference: string | null;
  uncertain_since: string | null;
  pickup_id: number | null;
  plt_status: string;
  tracking_id: number | null;
  is_domestic: boolean | null;
  content_type: 'documents' | 'non_documents';
  created_at: string;
  updated_at: string;
  packages: Array<{ sequence: number; weight_kg: string; length_cm: string | null; width_cm: string | null; height_cm: string | null; customer_reference: string | null; dhl_piece_id: string | null }>;
  items: Array<Record<string, any>>;
  documents: ShipmentDocument[];
  [k: string]: unknown;
}

export interface DraftListRow {
  id: number;
  creation_status: CreationStatus;
  shippec_reference: string;
  awb: string | null;
  product_name: string | null;
  receiver_company: string | null;
  receiver_contact: string | null;
  receiver_country_code: string | null;
  receiver_city: string | null;
  client_name: string | null;
  shipment_date: string | null;
  updated_at: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: Issue[];
  warnings: Issue[];
  dhl_validation: { status: string; message: string | null };
  shipment: DhlShipment;
}

export interface CostSummary {
  product: { code: string; name: string | null } | null;
  dhl: {
    total: number | null; currency: string | null; currency_type: string | null; tax_total: number | null; is_customer_agreement: boolean | null;
    charges: Array<{ category: ChargeCategory; code: string | null; name: string | null; amount: number | null; currency: string | null; tax_included: number | null }>;
    weights: { physical_total_kg: number | null; dhl_volumetric_kg: number | null; dhl_provided_kg: number | null; chargeable_kg: null };
    delivery: { estimated: string; date: string; time: string | null; by_end_of_day: boolean; type_code: string | null; transit_days: number | null } | null;
    pickup_capabilities: PickupCapabilities | null;
    quoted_at: string | null;
    stale: boolean;
  } | null;
  shippec: { selling_price: number | null; currency: string | null; dhl_cost: number | null; dhl_cost_source: string | null; expected_profit: number | null; approved_at: string | null };
  is_domestic: boolean | null;
}

export interface PickupRecord {
  id: number;
  status: 'requesting' | 'booked' | 'uncertain' | 'failed' | 'cancelled';
  origin: 'with_shipment' | 'standalone';
  dispatch_confirmation_number: string | null;
  pickup_date: string;
  earliest_time: string;
  close_time: string;
  location: string | null;
  ready_by_time: string | null;
  error_code: string | null;
  error_message: string | null;
}

export interface CreateResult {
  outcome: 'created' | 'uncertain' | 'failed';
  replayed: boolean;
  message: string;
  awb: string | null;
  shippec_reference: string;
  message_reference: string | null;
  creation_error: { code: string | null; message: string | null } | null;
  invoice: { id: number | null; number: string | null; link_status: string; error: string | null };
  documents: ShipmentDocument[];
  documents_failed: number;
  tracking_id: number | null;
  pickup: PickupRecord | null;
  paperless_trade: { status: string; due_at: string | null; error: string | null };
  shipment: DhlShipment;
}

export interface ServicePoint {
  id: string | null;
  name: string | null;
  localName: string | null;
  type: string | null;
  address: { line1: string | null; line2: string | null; line3: string | null; city: string | null; postalCode: string | null; country: string | null };
  distance: string | null;
  distanceKm: number | null;
  shippingCutoff: string | null;
  openingHours: Array<{ day: string; open: string | null; close: string | null }>;
  capabilities: { dropOff: boolean | null; collection: boolean | null; labelPrinting: boolean | null; international: boolean | null; domestic: boolean | null; payCash: boolean | null; payCard: boolean | null };
  limits: { maxPieces: number | null; maxShipmentWeightKg: number | null; maxPieceWeightKg: number | null; pieceSizeCm: number[] };
}

export interface ShipmentOptions {
  purposes: Array<{ value: ShipmentPurpose; label: string; dhl_export_reason_type: string | null; dhl_shipment_type: string | null }>;
  transport_payers: TransportPayer[];
  duties_payers: DutiesPayer[];
  pickup_options: PickupOption[];
  document_refetch_types: string[];
}

const BASE = '/dhl/shipments';

export const dhlShipmentService = {
  listDrafts(params: { creation_status?: CreationStatus; q?: string; limit?: number } = {}) {
    const qp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') qp.set(k, String(v));
    return api.get<{ data: DraftListRow[]; pagination: { total: number } }>(`${BASE}?${qp.toString()}`);
  },
  get: (id: number) => api.get<DhlShipment>(`${BASE}/${id}`),
  createDraft: (content: Partial<DraftContent> & { idempotency_key?: string }) => api.post<DhlShipment & { replayed: boolean }>(BASE, content),
  updateDraft: (id: number, content: Partial<DraftContent>) => api.patch<DhlShipment>(`${BASE}/${id}`, content),
  cancel: (id: number, reason?: string) => api.delete<DhlShipment>(`${BASE}/${id}`, reason ? { reason } : {}),
  checkProducts: (id: number) => api.post<{ products: ProductOption[] }>(`${BASE}/${id}/products`, {}),
  selectProduct: (id: number, product_code: string) => api.post<DhlShipment>(`${BASE}/${id}/product`, { product_code }),
  validate: (id: number) => api.post<ValidationResult>(`${BASE}/${id}/validate`, {}),
  checkRates: (id: number) => api.post<{ quotes: RateQuote[] }>(`${BASE}/${id}/rates`, {}),
  setPricing: (id: number, p: { selling_price: number; price_currency: string; dhl_cost_source: 'dhl_quote' | 'manual' | 'unknown'; dhl_cost?: number | null }) =>
    api.post<{ shipment: DhlShipment; warnings: string[] }>(`${BASE}/${id}/pricing`, p),
  confirm: (id: number) => api.post<DhlShipment & { replayed: boolean }>(`${BASE}/${id}/confirm`, {}),
  unconfirm: (id: number) => api.post<DhlShipment>(`${BASE}/${id}/unconfirm`, {}),
  costSummary: (id: number) => api.get<CostSummary>(`${BASE}/${id}/cost-summary`),
  /**
   * POST /:id/create — ONE request to DHL. A definite DHL refusal answers 422
   * with the result in the body; it is returned as a normal result here.
   */
  async create(id: number): Promise<CreateResult> {
    try {
      return await api.post<CreateResult>(`${BASE}/${id}/create`, {});
    } catch (err) {
      const body = err instanceof ApiError ? (err.body as { data?: CreateResult } | undefined) : undefined;
      if (err instanceof ApiError && err.status === 422 && body?.data?.outcome === 'failed') return body.data;
      throw err;
    }
  },
  resolve: (id: number, r: { outcome: 'created'; awb: string; evidence: string } | { outcome: 'not_created'; evidence: string }) =>
    api.post<{ shipment: DhlShipment; invoice_error: string | null }>(`${BASE}/${id}/resolve`, r),
  retryInvoice: (id: number) => api.post<{ invoice_id: number; created: boolean }>(`${BASE}/${id}/invoice`, {}),
  options: () => api.get<ShipmentOptions>('/dhl/options'),
  incoterms: () => api.get<{ source: 'dhl' | 'spec'; items: Array<{ code: string; name: string | null; description: string | null }> }>('/dhl/incoterms'),
  servicePoints: (address: string, countryCode: string, limit = 8) =>
    api.get<{ points: ServicePoint[] }>(`/dhl/service-points?${new URLSearchParams({ address, countryCode, limit: String(limit) }).toString()}`),
  defaultShipper: () => api.get<Party | null>('/dhl/default-shipper'),
  setDefaultShipper: (p: Party) => api.put<Party>('/dhl/default-shipper', p),
  getPickup: (pickupId: number) => api.get<PickupRecord>(`/dhl/pickups/${pickupId}`),

  /** The bytes through the SHIPPEC Backend (authenticated); never a storage path. */
  async downloadDocument(shipmentId: number, documentId: number): Promise<{ blob: Blob; filename: string }> {
    const token = useAuthStore.getState().token;
    const res = await fetch(`${env.apiUrl}${BASE}/${shipmentId}/documents/${documentId}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) {
      const json = await res.json().catch(() => null);
      throw new ApiError(json?.error?.message || 'تعذر تنزيل المستند', res.status, json?.error?.code);
    }
    const cd = res.headers.get('content-disposition') ?? '';
    const filename = /filename="([^"]+)"/.exec(cd)?.[1] ?? `shipment_${shipmentId}_${documentId}.pdf`;
    return { blob: await res.blob(), filename };
  },
};

/** Clients for the «العميل» picker (GET /clients?search=…, with ids). */
export async function searchClients(q: string): Promise<Array<{ id: number; name: string; phone: string | null; email: string | null; city: string | null; country: string | null }>> {
  const res = await api.get<any>(`/clients?search=${encodeURIComponent(q)}&limit=8`);
  const rows: any[] = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
  return rows.map((r) => ({ id: Number(r.id), name: String(r.name ?? ''), phone: r.phone ?? null, email: r.email ?? null, city: r.city ?? null, country: r.country ?? r.country_code ?? null }));
}
