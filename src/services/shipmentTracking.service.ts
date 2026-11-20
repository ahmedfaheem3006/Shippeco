import { api, ApiError } from '../utils/apiClient';
import { useAuthStore } from '../hooks/useAuthStore';
import { env } from '../utils/env';
import { unifiedService } from './unifiedService';

/** Backend src/services/mydhl/trackingStatus.ts — never compared to raw DHL codes here. */
export type NormalizedStatus =
  | 'PRE_TRANSIT' | 'PICKED_UP' | 'IN_TRANSIT' | 'CUSTOMS' | 'ON_HOLD' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'EXCEPTION' | 'UNKNOWN';

// Keep in sync with Backend src/validators/shipmentTracking.validator.ts
export type TrackingStatusFilter =
  | 'all' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'not_delivered' | 'problem' | 'exception' | 'on_hold' | 'customs' | 'pre_transit' | 'not_synced' | 'unknown';
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
  integration: {
    enabled: boolean; env: 'test' | 'production' | null; usable: boolean; syncEnabled: boolean; syncIntervalMinutes: number;
    features?: { tracking?: boolean; trackingLookup?: boolean };
  };
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

/** GET /shipment-tracking/admin/backfill/status — admin only, PostgreSQL only (never calls DHL). */
export interface BackfillRun {
  id: number;
  status: 'running' | 'paused' | 'completed' | 'cancelled';
  scope: 'unsynced' | 'active';
  batch_size: number;
  discovered: number;
  queued: number;
  processed: number;
  successful: number;
  not_found: number;
  failed: number;
  temporary_errors: number;
  permanent_errors: number;
  skipped: number;
  remaining: number;
  batches_completed: number;
  api_calls: number;
  started_at: string;
  last_activity_at: string | null;
  paused_at: string | null;
  finished_at: string | null;
  last_error_code: string | null;
  last_error_at: string | null;
  // A refused multi-AWB request is ONE batch_rejected — never N "not found" AWBs.
  awb_attempted?: number;
  awb_successful?: number;
  /** Proven by a request carrying that AWB alone. */
  individually_verified_not_found?: number;
  /** not_found from a multi-AWB batch (before the fix) — to repair. */
  unverified_not_found?: number;
  batch_rejected?: number;
  temporary_failed?: number;
  permanent_failed?: number;
  awaiting_single_check?: number;
  /** AWBs per DHL request the run actually uses (halves on a batch-level refusal). */
  effective_batch_size?: number;
  pause_reason?: 'admin' | 'budget_exhausted' | 'repair' | null;
  repaired_total?: number;
}

export interface TrackingSyncStatus {
  env: 'test' | 'production' | null;
  /** Why the worker cannot make progress now (null = it can). */
  blocked_by: 'not_configured' | 'tracking_disabled' | 'sync_disabled' | 'paused' | null;
  bulk_batch_size: number;
  calls_per_cycle: number;
  daily_call_limit: number;
  /** The backfill stops here; the rest of the day is kept for refreshes / lookups. */
  backfill_daily_call_limit?: number;
  verify_max_awbs?: number;
  run: BackfillRun | null;
  registration: {
    /** Distinct DHL AWBs on SHIPPEC invoices. */
    invoice_awbs: number;
    registered_from_invoices: number;
    tracked: number;
    synced: number;
    waiting_first_sync: number;
    not_found: number;
    errors: number;
    polling: number;
    last_synced_at: string | null;
  };
  today: { api_calls: number; errors: number; awbs_requested: number; awbs_found: number; awbs_not_found: number; awbs_failed: number } | null;
  last_successful_sync_at: string | null;
}

export interface InvoiceDiscoveryStats {
  invoices_scanned: number;
  invoices_with_awb: number;
  invoices_other_carrier: number;
  invoices_with_valid_awb: number;
  invoices_invalid_awb: number;
  valid_awbs: number;
  duplicate_awbs: number;
  tracking_rows_created: number;
  existing_rows_reused: number;
  duration_ms: number;
}

export interface RepairFalseNotFoundResult {
  examined: number;
  repaired: number;
  skipped_success: number;
  skipped_individual_not_found: number;
  remaining_pending: number;
  tracking_rows_reset: number;
  runs: Array<{ id: number; repaired: number; status: string }>;
}

export interface VerifyAwbResult {
  input: string;
  awb: string | null;
  result: 'success' | 'not_found' | 'temporary_error' | 'rejected' | 'skipped';
  registered: boolean;
  normalized_status: NormalizedStatus | null;
  error_code: string | null;
  detail: string | null;
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

  /** Direct AWB search: local first; for staff the Backend may ask DHL once and register the AWB. */
  async lookup(awb: string): Promise<LookupResult> {
    return api.get<LookupResult>(`${BASE}/lookup/${encodeURIComponent(awb)}`);
  },

  /** Backend asks MyDHL (the browser never calls DHL). */
  async refresh(awb: string): Promise<RefreshResult> {
    return unifiedService.post<RefreshResult>(`${BASE}/${encodeURIComponent(awb)}/refresh`, {});
  },

  // ── Admin: invoice discovery + initial DHL sync (the Backend's worker does the DHL calls) ──
  async syncStatus(signal?: AbortSignal): Promise<TrackingSyncStatus> {
    return api.get<TrackingSyncStatus>(`${BASE}/admin/backfill/status`, { signal });
  },
  async discoverInvoices(): Promise<InvoiceDiscoveryStats> {
    return api.post<InvoiceDiscoveryStats>(`${BASE}/admin/discover-invoices`, {});
  },
  /** batchSize: AWBs per DHL request for this run (a small one after a verification). */
  async startBackfill(batchSize?: number): Promise<{ run_id: number; created: boolean; resumed: boolean; status: TrackingSyncStatus }> {
    return api.post(`${BASE}/admin/backfill`, batchSize ? { batch_size: batchSize } : {});
  },
  /** DB only: false "not found" from a batch-level DHL 404 → pending again. */
  async repairFalseNotFound(): Promise<RepairFalseNotFoundResult> {
    return api.post<RepairFalseNotFoundResult>(`${BASE}/admin/backfill/repair-false-not-found`, {});
  },
  /** ≤ 5 AWBs, one DHL request each (asked by the Backend). */
  async verifyAwbs(awbs: string[]): Promise<{ api_calls: number; stopped_by: string | null; results: VerifyAwbResult[] }> {
    return api.post(`${BASE}/admin/backfill/verify`, { awbs });
  },
  async pauseBackfill(): Promise<TrackingSyncStatus> {
    return api.post<TrackingSyncStatus>(`${BASE}/admin/backfill/pause`, {});
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
