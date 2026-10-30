import { api } from '../utils/apiClient';
import { unifiedService } from './unifiedService';

/** Backend src/services/mydhl/trackingStatus.ts — never compared to raw DHL codes here. */
export type NormalizedStatus =
  | 'PRE_TRANSIT' | 'PICKED_UP' | 'IN_TRANSIT' | 'CUSTOMS' | 'ON_HOLD' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'EXCEPTION' | 'UNKNOWN';

// Keep in sync with Backend src/validators/shipmentTracking.validator.ts
export type TrackingStatusFilter =
  | 'all' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'problem' | 'exception' | 'on_hold' | 'customs' | 'pre_transit' | 'not_synced' | 'unknown';
export type TrackingSyncFilter = 'all' | 'recent_1h' | 'recent_24h' | 'never' | 'stale' | 'failed';

/** One tracked AWB (GET /shipment-tracking). Business fields come from the invoice. */
export interface TrackingItem {
  id: number;
  awb: string;
  carrier: string;
  invoice_id: number | null;
  invoice_number: string | null;
  client_id: number | null;
  customer_name: string | null;
  /** Invoice date, YYYY-MM-DD (calendar date — shown as-is). */
  booking_date: string | null;
  invoice_destination: string | null;
  raw_status: string | null;
  /** null = never synced with DHL. */
  normalized_status: NormalizedStatus | null;
  requires_action: boolean;
  current_description: string | null;
  current_location: string | null;
  current_city: string | null;
  current_country_code: string | null;
  origin: string | null;
  origin_city: string | null;
  origin_country_code: string | null;
  destination: string | null;
  destination_city: string | null;
  destination_country_code: string | null;
  product_code: string | null;
  number_of_pieces: number | null;
  /** As DHL sends it (destination local time, no offset). */
  estimated_delivery: string | null;
  delivered_at: string | null;
  delivered_local: string | null;
  delivered_gmt_offset: string | null;
  delivered_location: string | null;
  delivered_signed_by: string | null;
  last_event_at: string | null;
  /** "YYYY-MM-DD HH:MM:SS" at the checkpoint, as DHL shows it. */
  last_event_local: string | null;
  last_event_gmt_offset: string | null;
  sync_status: 'pending' | 'ok' | 'not_found' | 'error';
  last_synced_at: string | null;
  last_attempt_at: string | null;
  next_sync_at: string | null;
  consecutive_failures: number;
  last_error_code: string | null;
  last_error_message: string | null;
}

export interface TrackingEvent {
  id: number;
  raw_status: string | null;
  normalized_status: NormalizedStatus | null;
  description: string | null;
  remark: string | null;
  next_steps: string | null;
  location: string | null;
  location_code: string | null;
  city: string | null;
  country_code: string | null;
  event_date: string | null;
  event_time: string | null;
  gmt_offset: string | null;
  event_at: string | null;
  signed_by: string | null;
  sequence: number;
}

export interface TrackingPiece {
  number: number | null;
  trackingNumber: string | null;
  typeCode: string | null;
  description: string | null;
  weight: number | null;
  actualWeight: number | null;
  dimensions: { length?: number; width?: number; height?: number } | null;
  eventCount: number;
  lastEvent: { typeCode: string; description: string | null; date: string | null; time: string | null; location: string | null } | null;
}

export interface TrackingDetails extends TrackingItem {
  shipment_description: string | null;
  total_weight: number | null;
  weight_unit: string | null;
  shipment_timestamp: string | null;
  pieces: TrackingPiece[];
  /** Newest first. */
  events: TrackingEvent[];
  refresh_cooldown_seconds: number;
}

export interface TrackingCounts {
  total: number;
  in_transit: number;
  out_for_delivery: number;
  delivered: number;
  problem: number;
  exception: number;
  on_hold: number;
  customs: number;
  pre_transit: number;
  not_synced: number;
  unknown: number;
  stale: number;
  failed: number;
  last_synced_at: string | null;
}

export interface TrackingSummary {
  counts: TrackingCounts;
  countries: { origin: { code: string; count: number }[]; destination: { code: string; count: number }[] };
  /** Never contains credentials — only whether DHL is usable. */
  integration: { enabled: boolean; env: 'test' | 'production' | null; usable: boolean; syncEnabled: boolean; syncIntervalMinutes: number };
}

export interface TrackingListParams {
  q?: string;
  status?: TrackingStatusFilter;
  sync?: TrackingSyncFilter;
  from?: string;
  to?: string;
  origin?: string;
  destination?: string;
  client_id?: number | '';
  sort?: 'booking' | 'last_event';
  page?: number;
  limit?: number;
}

export interface TrackingListResponse {
  items: TrackingItem[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface RefreshResult {
  outcome: 'updated' | 'not_found';
  changed?: boolean;
  record: TrackingDetails;
}

const BASE = '/shipment-tracking';

// Reads straight from the API (no cache: the page re-reads on realtime
// signals); the refresh goes through unifiedService so caches are dropped.
export const shipmentTrackingService = {
  async list(params: TrackingListParams = {}, signal?: AbortSignal): Promise<TrackingListResponse> {
    const qp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null || v === '' || v === 'all') continue;
      qp.set(k, String(v));
    }
    return api.get<TrackingListResponse>(`${BASE}?${qp.toString()}`, { signal });
  },

  async summary(signal?: AbortSignal): Promise<TrackingSummary> {
    return api.get<TrackingSummary>(`${BASE}/summary`, { signal });
  },

  async details(awb: string, signal?: AbortSignal): Promise<TrackingDetails> {
    return api.get<TrackingDetails>(`${BASE}/${encodeURIComponent(awb)}`, { signal });
  },

  /** Backend asks MyDHL (the browser never calls DHL). */
  async refresh(awb: string): Promise<RefreshResult> {
    return unifiedService.post<RefreshResult>(`${BASE}/${encodeURIComponent(awb)}/refresh`, {});
  },
};
