import { api, ApiError } from '../utils/apiClient';
import { useAuthStore } from '../hooks/useAuthStore';
import { env } from '../utils/env';
import { unifiedService } from './unifiedService';

/** Backend src/services/mydhl/trackingStatus.ts — never compared to raw DHL codes here. */
export type NormalizedStatus =
  | 'PRE_TRANSIT' | 'PICKED_UP' | 'IN_TRANSIT' | 'CUSTOMS' | 'ON_HOLD' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'EXCEPTION' | 'UNKNOWN';

// Keep in sync with Backend src/validators/shipmentTracking.validator.ts
export type TrackingStatusFilter =
  | 'all' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'not_delivered' | 'problem' | 'exception' | 'on_hold' | 'customs' | 'pre_transit' | 'not_synced' | 'unknown'
  /** «بانتظار المزامنة»: the actionable queue (never the verified «no DHL data» rows). */
  | 'pending_sync'
  /** «لا تتوفر بيانات تتبع من DHL»: DHL proved (asked alone) it has no data; not re-checked before its date. */
  | 'dhl_no_data';
export type TrackingSyncFilter = 'all' | 'recent_1h' | 'recent_24h' | 'never' | 'stale' | 'failed';
/**
 * active (default): every undelivered shipment whatever its age + deliveries of the last 12 months;
 * archived: «المسلّمة القديمة» (delivered more than 12 months ago — hidden, never deleted); all: both.
 */
export type TrackingView = 'active' | 'archived' | 'all';

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
  /** First time SHIPPEC saw this AWB. */
  discovered_at?: string | null;
  dhl_shipment_id?: number | null;
  shippec_reference?: string | null;
  receiver_name?: string | null;
  sources?: Array<'shippec_created' | 'invoice_awb' | 'manual_lookup' | 'dhl_billing' | 'reference_query'>;
  /** DHL's actual collection (earliest PU checkpoint). */
  pickup_at?: string | null;
  pickup_local?: string | null;
  pickup_gmt_offset?: string | null;
  pickup_location?: string | null;
  /** pending | unknown | stale | current (Backend trackingFreshness). */
  freshness?: 'pending' | 'unknown' | 'stale' | 'current';
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
  /** A stored AWB / waybill document SHIPPEC can hand out (never fetched from DHL by the page). */
  awb_document?: { available: boolean; type: 'waybill' | 'shipping_label' | null; content_type: string | null };
}

/** Every status count is over the ACTIVE dataset; the archive is counted apart. */
export interface TrackingCounts {
  /** Active dataset (= `active`). */
  total: number;
  active?: number;
  /** Delivered within the last 12 months (= `delivered`). */
  delivered_recent?: number;
  /** «بانتظار المزامنة»: the actionable queue (= pending_sync). */
  waiting_sync?: number;
  pending_sync?: number;
  /** «لا تتوفر بيانات تتبع من DHL» (verified, in cooldown). */
  dhl_no_data?: number;
  /** «المسلّمة القديمة»: delivered more than 12 months ago. */
  archived_delivered?: number;
  /** Active + archived. */
  all_total?: number;
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
  integration: {
    enabled: boolean; env: 'test' | 'production' | null; usable: boolean; syncEnabled: boolean; syncIntervalMinutes: number;
    features?: { tracking?: boolean; trackingLookup?: boolean };
  };
}

export interface TrackingListParams {
  q?: string;
  status?: TrackingStatusFilter;
  sync?: TrackingSyncFilter;
  view?: TrackingView;
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

/** GET /shipment-tracking/lookup/:awb — local record, a DHL lookup (staff), or why there is none. */
export interface LookupResult {
  result: 'local' | 'remote' | 'not_found' | 'remote_lookup_required';
  awb: string;
  record: TrackingDetails | null;
  remote_lookup_available?: boolean;
}

export interface RefreshResult {
  outcome: 'updated' | 'not_found';
  changed?: boolean;
  record: TrackingDetails;
}

export interface VerifyAwbResult {
  input: string;
  awb: string | null;
  result: 'success' | 'not_found' | 'temporary_error' | 'rejected' | 'skipped';
  registered: boolean;
  normalized_status: NormalizedStatus | null;
  error_code: string | null;
  detail: string | null;
  /** Registered by this verification (SHIPPEC did not track it yet; source manual_lookup). */
  registered_now?: boolean;
  /** The stored record after the verification (null when SHIPPEC does not track the AWB). */
  record?: VerifiedRecord | null;
}

/** «تحقق البوليصة»: what SHIPPEC stored — never raw DHL JSON. */
export interface VerifiedRecord {
  normalized_status: NormalizedStatus | null;
  sync_status: 'pending' | 'ok' | 'not_found' | 'error';
  current_description: string | null;
  current_location: string | null;
  last_event_local: string | null;
  last_event_gmt_offset: string | null;
  last_synced_at: string | null;
  last_attempt_at: string | null;
}

/** Why the DHL synchronization cannot progress right now (null = it can). */
export type SyncBlockedReason = 'not_configured' | 'tracking_disabled' | 'sync_disabled' | 'paused' | 'rate_limited' | 'circuit_open' | 'auth_stopped';

/** GET /shipment-tracking/admin/pending-sync — «مزامنة الفواتير», business terms only (PostgreSQL, never DHL). */
export interface PendingSyncStatus {
  /** AWBs a new run would queue now (the «بانتظار المزامنة» queue). */
  eligible: number;
  run: {
    id: number;
    status: 'running' | 'paused' | 'completed' | 'cancelled';
    total: number;
    processed: number;
    found: number;
    no_data: number;
    temporary: number;
    skipped: number;
    started_at: string | null;
    finished_at: string | null;
  } | null;
  blocked: SyncBlockedReason | null;
}

export interface StartPendingSyncResult {
  started: boolean;
  already_running: boolean;
  nothing_to_sync: boolean;
  run_id: number | null;
  queued: number;
  status: PendingSyncStatus;
}

const BASE = '/shipment-tracking';

// Reads straight from the API (no cache: the page re-reads on realtime
// signals); the refresh goes through unifiedService so caches are dropped.
export const shipmentTrackingService = {
  async list(params: TrackingListParams = {}, signal?: AbortSignal): Promise<TrackingListResponse> {
    const qp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      // 'all' is the Backend default for every filter except the view (whose default is 'active').
      if (v === undefined || v === null || v === '' || (v === 'all' && k !== 'view')) continue;
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

  /** Direct AWB search: local first; for staff the Backend may ask DHL once and register the AWB. */
  async lookup(awb: string): Promise<LookupResult> {
    return api.get<LookupResult>(`${BASE}/lookup/${encodeURIComponent(awb)}`);
  },

  /** Backend asks MyDHL (the browser never calls DHL). */
  async refresh(awb: string): Promise<RefreshResult> {
    return unifiedService.post<RefreshResult>(`${BASE}/${encodeURIComponent(awb)}/refresh`, {});
  },

  // ── Admin page actions (the Backend's worker makes the DHL calls; the browser never calls DHL) ──

  /** «تحقق البوليصة»: ≤ 5 AWBs per call, one DHL request each (the page sends longer lists in chunks). */
  async verifyAwbs(awbs: string[]): Promise<{ api_calls: number; stopped_by: string | null; results: VerifyAwbResult[] }> {
    return api.post(`${BASE}/admin/backfill/verify`, { awbs });
  },
  /** «مزامنة الفواتير»: eligible count + the latest run's progress. */
  async pendingSyncStatus(signal?: AbortSignal): Promise<PendingSyncStatus> {
    return api.get<PendingSyncStatus>(`${BASE}/admin/pending-sync`, { signal });
  },
  /** «مزامنة الفواتير»: the Backend queues the current «بانتظار المزامنة» AWBs itself (no ids sent). */
  async startPendingSync(): Promise<StartPendingSyncResult> {
    return api.post<StartPendingSyncResult>(`${BASE}/admin/pending-sync`, {});
  },
  /** After a 401/403 stop (credentials fixed on the server): background tracking resumes. Sends nothing to DHL. */
  async resumeSync(): Promise<unknown> {
    return api.post(`${BASE}/admin/sync/resume`, {});
  },

  /**
   * The stored AWB / waybill PDF, through the authenticated SHIPPEC Backend
   * (GET /shipment-tracking/:awb/waybill). The browser never calls DHL; the
   * Backend never asks DHL either (stored document only).
   */
  async downloadAwbDocument(awb: string): Promise<{ blob: Blob; filename: string }> {
    const token = useAuthStore.getState().token;
    const res = await fetch(`${env.apiUrl}${BASE}/${encodeURIComponent(awb)}/waybill`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) {
      const json = await res.json().catch(() => null);
      throw new ApiError(json?.error?.message || 'تعذر تنزيل البوليصة', res.status, json?.error?.code);
    }
    const cd = res.headers.get('content-disposition') ?? '';
    const filename = /filename="([^"]+)"/.exec(cd)?.[1] ?? `DHL-AWB-${awb}.pdf`;
    return { blob: await res.blob(), filename };
  },
};
