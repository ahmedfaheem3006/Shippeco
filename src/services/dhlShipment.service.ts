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

export type ShipmentPurpose = 'commercial' | 'gift' | 'personal_not_for_resale' | 'sample' | 'return_for_repair' | 'return_after_repair' | 'claim' | 'return_to_seller';
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
  /** exportDeclarations[].remarks (≤ 3 × 45). */
  invoice_remarks: string[];
  /** Declaration statement ids (exportDeclarations[].declarationNotes). */
  declaration_statements: string[];
  /** exportDeclarations[].customsDocuments (DHL type code + document ID). */
  customs_documents: CustomsDocument[];
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
  /** Shipment Details extras stored with the draft (never sent to DHL). */
  details_extra?: DetailsExtraContent | null;
  packages: PackageInput[];
  items: ItemInput[];
}

/** Backend detailsExtraSchema (shipment_details_extra). */
export interface DetailsExtraContent {
  references: Array<{ type: string | null; value: string | null }>;
  document_protection: boolean;
  insurance: boolean;
  estimated_duties: boolean;
  precalculated_duties: boolean;
  item_entry: 'describe' | 'upload';
  charges: Array<{ type: 'freight' | 'insurance' | 'other'; description: string | null; amount: number | null }>;
  items: Array<{ manufacturer_id: string | null; line_reference: string | null }>;
  /** Customs Invoice: DHL creates it (create) or the shipper's own (own); null on older drafts. */
  customs_invoice_mode?: CustomsInvoiceMode | null;
}
export type CustomsInvoiceMode = 'create' | 'own';
export interface CustomsDocument { type_code: string; value: string }

export type PhoneType = 'mobile' | 'office' | 'fax';
export interface PhoneEntry { type: PhoneType; code: string; number: string; extension: string; sms: boolean }
/** Backend partyDetailsSchema (shipper_details / receiver_details). */
export interface PartyDetailsContent {
  business_contact: boolean;
  residential: boolean;
  country_name: string | null;
  short_address: string | null;
  suburb: string | null;
  /** The State's display name ("Oregon"); the party's province holds DHL's code ("OR"). */
  province_name?: string | null;
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
  /** The line before tax as DHL states it (TAX basePrice), when given. */
  net?: number | null;
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
  optionalServices: Array<{ serviceCode: string; name: string | null; serviceTypeCode: string | null; isCustomerAgreement: boolean | null; isMarketedService?: boolean | null }>;
  pickupCapabilities: PickupCapabilities | null;
  deliveryCapabilities: DeliveryCapabilities | null;
  pricingDate?: string | null;
}

export interface ShipmentDocument {
  id: number; document_type: string; content_type: string; size_bytes: number; sha256: string; origin?: string; created_at?: string;
  /** DHL's order in the create answer; pages of the PDF (migration 048) */
  sequence?: number | null; page_count?: number | null;
}

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
  invoice_remarks?: string[] | null;
  declaration_statements?: string[] | null;
  customs_documents?: CustomsDocument[] | null;
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

/** What SHIPPEC offers for one shipment now (GET /:id/details → management). MyDHL REST cannot edit / delete an AWB. */
export interface ShipmentManagement {
  edit_policy: 'draft_edit' | 'replacement_only' | 'none';
  can_copy: boolean;
  can_replace: boolean;
  replace_blocked: string | null;
  replacement_draft_id: number | null;
  can_cancel: boolean;
  cancel_blocked: string | null;
  in_dhl_network: boolean;
  tracking_status: string | null;
  remote_operations: Array<{ code: 'pickup_update' | 'pickup_cancel' | 'paperless_upload'; available: boolean }>;
  pickup: { id: number; status: string; dispatch_confirmation_number: string | null; cancel_state: string; cancellable: boolean } | null;
  documents_bundle: { available: boolean; documents: number; pages: number | null };
}

export interface LinkedShipment { id: number; awb: string | null; shippec_reference: string; creation_status: CreationStatus; status: string }

/** GET /dhl/shipments/:id/details — the confirmation / management view of one shipment. */
export interface ShipmentDetails extends DhlShipment {
  pickup: (PickupRecord & { location_type?: string | null; instructions?: string | null; cancel_state?: string; cancel_error?: string | null }) | null;
  tracking: { normalized_status: string | null; current_description: string | null; estimated_delivery: string | null; last_synced_at: string | null; pickup_at: string | null } | null;
  invoice: { id: number; invoice_number: string | null; status: string | null; payment_status: number | null } | null;
  created_by_name: string | null;
  dhl_created_at: string | null;
  supersedes: LinkedShipment | null;
  replaced_by: LinkedShipment | null;
  copied_from: LinkedShipment | null;
  cancellation_reason: string | null;
  cancelled_at: string | null;
  invoice_reversal_status: 'none' | 'reversed' | 'needs_review';
  management: ShipmentManagement;
}

export type ListBucket = 'ready_to_ship' | 'pre_transit' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'exception' | 'cancelled' | 'uncertain';
export type DateFilter = 'all' | 'today' | 'past_7' | 'past_30' | 'past_60' | 'past_90' | 'upcoming' | 'range';

/** One row of «All Shipments» (GET /dhl/shipments/managed). */
export interface ManagedShipmentRow {
  id: number; dhl_env: string; awb: string | null; shippec_reference: string; status: string; creation_status: CreationStatus; list_status: ListBucket;
  tracking_status: string | null; tracking_description: string | null; estimated_delivery: string | null; delivered_at: string | null;
  shipment_date: string | null; product_code: string | null; product_name: string | null; content_description: string | null; customs_required: boolean;
  shipper_company: string | null; shipper_contact: string | null; shipper_city: string | null; shipper_country_code: string | null;
  receiver_company: string | null; receiver_contact: string | null; receiver_city: string | null; receiver_country_code: string | null;
  package_count: number; total_gross_weight: string | null; client_id: number | null; client_name: string | null; created_by_name: string | null;
  pickup_option: PickupOption; dispatch_confirmation_number: string | null; pickup_status: string | null;
  invoice_id: number | null; invoice_number: string | null; supersedes_shipment_id: number | null; replaced_by_shipment_id: number | null;
  replaced_by_awb: string | null; supersedes_awb: string | null; document_count: number;
  dhl_created_at: string | null; created_at: string; updated_at: string; cancelled_at: string | null; cancellation_reason: string | null;
}

export interface ManagedListQuery {
  q?: string; date?: DateFilter; from?: string; to?: string; status?: ListBucket | ''; content?: 'documents' | 'packages' | '';
  product?: string; pickup?: 'scheduled' | 'none' | 'drop_off' | ''; client_id?: number | ''; page?: number; limit?: number;
}

export interface ShipmentFacets { products: Array<{ code: string; name: string | null; n: number }>; customers: Array<{ id: number; name: string; n: number }> }

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

/** Information from DHL's own answers shown with a validation (never a warning, never blocking). */
export interface DhlNotice { field: string; code: string; message: string }

export interface ValidationResult {
  ok: boolean;
  issues: Issue[];
  warnings: Issue[];
  notices?: DhlNotice[];
  dhl_validation: { status: string; message: string | null };
  shipment: DhlShipment;
}

export interface CostSummary {
  product: { code: string; name: string | null } | null;
  dhl: {
    total: number | null; currency: string | null; currency_type: string | null; tax_total: number | null; is_customer_agreement: boolean | null;
    charges: Array<{ category: ChargeCategory; code: string | null; name: string | null; amount: number | null; net?: number | null; currency: string | null; tax_included: number | null }>;
    optional_services?: Array<{ code: string; priced: number | null }>;
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
  /** What may be offered right now (Paperless upload follows DHL_PROD_PAPERLESS_UPLOAD_ENABLED in Production). */
  features?: { paperless_upload: boolean; pickup_booking?: boolean };
  declaration_statements?: Array<{ id: string; supported: boolean }>;
  customs_document_types?: string[];
  /** SHIPPEC's own DHL account, masked (last 4 digits) — never in full. */
  payment?: { shipper_account_masked: string | null };
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
  /** READ-ONLY: the first shipment date after `after` for which DHL lists a product (the draft is not changed). */
  nextAvailableDate: (id: number, after: string) =>
    api.post<{ date: string | null; checked: Array<{ date: string; available: boolean }> }>(`${BASE}/${id}/next-available-date`, { after }),
  selectProduct: (id: number, product_code: string) => api.post<DhlShipment>(`${BASE}/${id}/product`, { product_code }),
  validate: (id: number) => api.post<ValidationResult>(`${BASE}/${id}/validate`, {}),
  /** quoted_at: when SHIPPEC received the quote from DHL ("DHL rate estimate as of"). */
  checkRates: (id: number) => api.post<{ quotes: RateQuote[]; quoted_at?: string | null }>(`${BASE}/${id}/rates`, {}),
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

  // ── Created shipments (All Shipments, confirmation, copy, replacement, cancellation) ──
  details: (id: number) => api.get<ShipmentDetails>(`${BASE}/${id}/details`),
  listShipments(q: ManagedListQuery = {}) {
    const qp = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null && v !== '' && !(k === 'date' && v === 'all')) qp.set(k, String(v));
    return api.get<{ data: ManagedShipmentRow[]; pagination: { page: number; limit: number; total: number } }>(`${BASE}/managed?${qp.toString()}`);
  },
  facets: () => api.get<ShipmentFacets>(`${BASE}/managed/facets`),
  /** A NEW draft from the business input (never DHL's output). */
  copy: (id: number) => api.post<DhlShipment & { replayed: boolean }>(`${BASE}/${id}/copy`, {}),
  /** «Create corrected replacement» — a NEW draft linked to this AWB (an existing one is reopened). */
  replacement: (id: number) => api.post<DhlShipment & { replayed: boolean }>(`${BASE}/${id}/replacement`, {}),
  /** Cancel a CREATED shipment in SHIPPEC (its DHL courier pickup first). The AWB is never deleted at DHL. */
  cancelShipment: (id: number, reason: string) =>
    api.post<{ pickup_cancelled: boolean; invoice_reversal: 'none' | 'reversed' | 'needs_review'; shipment: ShipmentDetails }>(`${BASE}/${id}/cancel-shipment`, { reason }),
  /** ONE PDF with every DHL document of the shipment (DHL's originals, merged by the Backend). */
  downloadBundle: (shipmentId: number) => fetchFile(`${BASE}/${shipmentId}/documents/bundle`, `shipment_${shipmentId}_documents.pdf`),

  /** The bytes through the SHIPPEC Backend (authenticated); never a storage path. */
  downloadDocument: (shipmentId: number, documentId: number) => fetchFile(`${BASE}/${shipmentId}/documents/${documentId}`, `shipment_${shipmentId}_${documentId}.pdf`),
};

/** An authenticated file from the SHIPPEC Backend (never a public / storage URL, never base64 in the browser's storage). */
export async function fetchFile(path: string, fallbackName: string): Promise<{ blob: Blob; filename: string; pages: number | null }> {
  const token = useAuthStore.getState().token;
  const res = await fetch(`${env.apiUrl}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) {
    const json = await res.json().catch(() => null);
    throw new ApiError(json?.error?.message || 'تعذر تنزيل المستند', res.status, json?.error?.code);
  }
  const cd = res.headers.get('content-disposition') ?? '';
  const filename = /filename="([^"]+)"/.exec(cd)?.[1] ?? fallbackName;
  const pages = Number(res.headers.get('x-page-count'));
  return { blob: await res.blob(), filename, pages: Number.isFinite(pages) && pages > 0 ? pages : null };
}

/** Clients for the «العميل» picker (GET /clients?search=…, with ids). */
export async function searchClients(q: string): Promise<Array<{ id: number; name: string; phone: string | null; email: string | null; city: string | null; country: string | null }>> {
  const res = await api.get<any>(`/clients?search=${encodeURIComponent(q)}&limit=8`);
  const rows: any[] = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
  return rows.map((r) => ({ id: Number(r.id), name: String(r.name ?? ''), phone: r.phone ?? null, email: r.email ?? null, city: r.city ?? null, country: r.country ?? r.country_code ?? null }));
}
