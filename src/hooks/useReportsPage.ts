// Frontend/src/hooks/useReportsPage.ts
import { useCallback, useMemo, useRef, useState } from 'react';
import { unifiedService } from '../services/unifiedService';
import { downloadBlob } from '../utils/download';
import {
  computeRange,
  formatSar,
  formatNum,
  formatPct,
  rowsToCsv,
  type ReportsPeriod,
  type ReportsStatus,
  type DateRange,
} from '../utils/reports';

// ═══════════════════════════════════════════════════════════
//  Types
// ═══════════════════════════════════════════════════════════
export type ReportsSummary = {
  totalCount: number;
  totalAmount: number;
  paidCount: number;
  paidAmount: number;
  unpaidCount: number;
  unpaidAmount: number;
  partialCount: number;
  partialAmount: number;
  returnedCount: number;
  returnedAmount: number;
  collectedAmount: number;
  remainingAmount: number;
  profitTotal: number;
  profitCount: number;
  losingCount: number;
  avgInvoice: number;
  collectionRate: number;
};

export type StatusBar = {
  key: string;
  label: string;
  color: string;
  count: number;
  amount: number;
  pct: number;
};

export type CarrierAgg = {
  carrier: string;
  count: number;
  amount: number;
  percentage: number;
};

export type ClientAgg = {
  name: string;
  count: number;
  amount: number;
  remaining: number;
};

export type DailyPoint = {
  date: string;
  amount: number;
  count: number;
};

export type TableRow = {
  id: string;
  daftra_id: string;
  invoice_number: string;
  date: string;
  client: string;
  phone: string;
  carrier: string;
  awb: string;
  status: string;
  statusLabel: string;
  price: number;
  paid: number;
  remaining: number;
  collectionPct: number;
  dhl_cost: number;
  totalText: string;
  paidText: string;
  remainingText: string;
};

export type SyncInfo = {
  total_invoices: number;
  last_full_sync: string | null;
  last_recent_sync: string | null;
  awb_stats: { with_awb: number; without_awb: number } | null;
  by_status: Array<{ status: string; count: number; total: number; paid: number }>;
};

type TablePagination = {
  page: number;
  limit: number;
  total: number;
  pages: number;
};

// ═══════════════════════════════════════════════════════════
//  Defaults
// ═══════════════════════════════════════════════════════════
const EMPTY_SUMMARY: ReportsSummary = {
  totalCount: 0,
  totalAmount: 0,
  paidCount: 0,
  paidAmount: 0,
  unpaidCount: 0,
  unpaidAmount: 0,
  partialCount: 0,
  partialAmount: 0,
  returnedCount: 0,
  returnedAmount: 0,
  collectedAmount: 0,
  remainingAmount: 0,
  profitTotal: 0,
  profitCount: 0,
  losingCount: 0,
  avgInvoice: 0,
  collectionRate: 0,
};

const EMPTY_PAGINATION: TablePagination = {
  page: 1,
  limit: 200,
  total: 0,
  pages: 1,
};

const STATUS_BAR_META: Record<string, { label: string; color: string }> = {
  paid: { label: 'مدفوعة', color: '#10B981' },
  partial: { label: 'جزئية', color: '#F59E0B' },
  unpaid: { label: 'غير مدفوعة', color: '#EF4444' },
  returned: { label: 'مرتجعة', color: '#8B5CF6' },
};

// ═══════════════════════════════════════════════════════════
//  Hook
// ═══════════════════════════════════════════════════════════
export function useReportsPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncInfo, setSyncInfo] = useState<SyncInfo | null>(null);

  // ── Server data ──
  const [summary, setSummary] = useState<ReportsSummary>(EMPTY_SUMMARY);
  const [serverStatusBars, setServerStatusBars] = useState<any[]>([]);
  const [carrierBreakdown, setCarrierBreakdown] = useState<CarrierAgg[]>([]);
  const [topClients, setTopClients] = useState<ClientAgg[]>([]);
  const [dailySeries, setDailySeries] = useState<DailyPoint[]>([]);
  const [serverTableRows, setServerTableRows] = useState<any[]>([]);
  const [tablePagination, setTablePagination] = useState<TablePagination>(EMPTY_PAGINATION);

  // ── Filters ──
  const [query, setQueryState] = useState('');
  const [period, setPeriodState] = useState<ReportsPeriod>('all');
  const [navOffset, setNavOffset] = useState(0);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [status, setStatusState] = useState<ReportsStatus>('all');
  const [tablePage, setTablePage] = useState(1);

  // For debounce
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Computed range ──
  const range: DateRange = useMemo(
    () => computeRange(period, navOffset, { from: customFrom, to: customTo }),
    [period, navOffset, customFrom, customTo]
  );

  // ── Spark chart data ──
  const sparkData = useMemo(() => {
    const last14 = dailySeries.slice(-14);
    if (!last14.length) return { points: [] as number[], max: 1, labels: [] as string[] };
    const max = Math.max(...last14.map((d) => d.amount), 1);
    return {
      points: last14.map((d) => d.amount),
      max,
      labels: last14.map((d) => d.date.slice(5)),
    };
  }, [dailySeries]);

  // ── Format table rows ──
  const tableRows: TableRow[] = useMemo(
    () =>
      serverTableRows.map((r: any) => ({
        id: String(r.id || ''),
        daftra_id: String(r.daftra_id || ''),
        invoice_number: r.invoice_number || '',
        date: r.date || '—',
        client: r.client || '—',
        phone: r.phone || '',
        carrier: r.carrier || '—',
        awb: r.awb || '',
        status: r.status || 'unpaid',
        statusLabel: r.statusLabel || 'غير مدفوعة',
        price: Number(r.price) || 0,
        paid: Number(r.paid) || 0,
        remaining: Number(r.remaining) || 0,
        collectionPct: Number(r.collectionPct) || 0,
        dhl_cost: Number(r.dhl_cost) || 0,
        totalText: formatSar(r.price),
        paidText: formatSar(r.paid),
        remainingText: formatSar(r.remaining),
      })),
    [serverTableRows]
  );

  // ── Summary cards ──
  const summaryCards = useMemo(
    () => [
      {
        key: 'total',
        icon: '📦',
        label: 'إجمالي الفواتير',
        value: formatNum(summary.totalCount),
        detail: formatSar(summary.totalAmount),
        tone: 'blue',
      },
      {
        key: 'collected',
        icon: '💰',
        label: 'المحصّل',
        value: formatSar(summary.collectedAmount),
        detail: `نسبة التحصيل ${formatPct(summary.collectionRate)}`,
        tone: 'green',
      },
      {
        key: 'remaining',
        icon: '⏳',
        label: 'المتبقي',
        value: formatSar(summary.remainingAmount),
        detail: `${formatNum(summary.unpaidCount + summary.partialCount)} فاتورة معلّقة`,
        tone: 'red',
      },
      {
        key: 'avg',
        icon: '📊',
        label: 'متوسط الفاتورة',
        value: formatSar(summary.avgInvoice),
        detail: `من ${formatNum(summary.totalCount)} فاتورة`,
        tone: 'amber',
      },
      {
        key: 'profit',
        icon: '📈',
        label: 'صافي الربح',
        value: summary.profitCount > 0 ? formatSar(summary.profitTotal) : '—',
        detail: summary.profitCount > 0
          ? `من ${formatNum(summary.profitCount)} فاتورة بتكلفة`
          : 'لا توجد بيانات تكلفة',
        tone: 'purple',
      },
      {
        key: 'returned',
        icon: '↩️',
        label: 'المرتجعات',
        value: formatNum(summary.returnedCount),
        detail: formatSar(summary.returnedAmount),
        tone: 'gray',
      },
    ],
    [summary]
  );

  // ── Status bars (ensure all 4 always present) ──
  const statusBars: StatusBar[] = useMemo(() => {
    const allKeys = ['paid', 'partial', 'unpaid', 'returned'];
    return allKeys.map((key) => {
      const bar = serverStatusBars.find((b: any) => b.key === key);
      const meta = STATUS_BAR_META[key] || { label: key, color: '#999' };
      return {
        key,
        label: meta.label,
        color: meta.color,
        count: Number(bar?.count) || 0,
        amount: Number(bar?.amount) || 0,
        pct: Number(bar?.pct) || 0,
      };
    });
  }, [serverStatusBars]);

  // ═══════════════════════════════════════════════════════════
  //  FETCH DATA FROM SERVER
  // ═══════════════════════════════════════════════════════════
  const fetchData = useCallback(
    async (overrides?: {
      range?: DateRange;
      status?: ReportsStatus;
      search?: string;
      page?: number;
      period?: ReportsPeriod;
    }) => {
      setLoading(true);
      setError(null);

      const r = overrides?.range || range;
      const s = overrides?.status ?? status;
      const q = overrides?.search ?? query;
      const p = overrides?.page ?? tablePage;
      const per = overrides?.period ?? period;

      try {
        const qp = new URLSearchParams({
          period: per,
          date_from: r.from,
          date_to: r.to,
          status: s,
          search: q,
          page: String(p),
          limit: '200',
        });

        const result: any = await unifiedService.get(`/reports/data?${qp.toString()}`);

        // unifiedService returns unwrapped data (apiClient extracts .data when no meta)
        // But reports/data returns { success, data: { summary, ... } }
        // apiClient: if success + data + no meta → returns data
        // So result should be the reports object directly
        const data = result || {};

        setSummary(data.summary || EMPTY_SUMMARY);
        setServerStatusBars(data.statusBars || []);
        setCarrierBreakdown(data.carrierBreakdown || []);
        setTopClients(data.topClients || []);
        setDailySeries(data.dailySeries || []);
        setServerTableRows(data.tableRows || []);
        setTablePagination(data.tablePagination || EMPTY_PAGINATION);
      } catch (e: any) {
        console.error('[Reports] Error:', e);
        setError(e?.message || 'فشل تحميل بيانات التقرير');
      } finally {
        setLoading(false);
      }
    },
    [range, status, query, tablePage, period]
  );

  // ── Refresh (initial load) ──
  const refresh = useCallback(async () => {
    // Load sync info (non-blocking)
    unifiedService.get('/sync/status').then((res: any) => {
      if (res) setSyncInfo(res as SyncInfo);
    }).catch(() => { /* ignore */ });

    // Check for stored status filter
    try {
      const v = sessionStorage.getItem('shippec_reports_status');
      if (v) {
        sessionStorage.removeItem('shippec_reports_status');
        setStatusState(v as ReportsStatus);
      }
    } catch { /* */ }

    await fetchData();
  }, [fetchData]);

  // ── Navigation ──
  const navigate = useCallback(
    (dir: -1 | 1) => {
      const newOffset = navOffset + dir;
      setNavOffset(newOffset);
      const newRange = computeRange(period, newOffset, { from: customFrom, to: customTo });
      setTablePage(1);
      void fetchData({ range: newRange, page: 1 });
    },
    [navOffset, period, customFrom, customTo, fetchData]
  );

  // ── Set period ──
  const setPeriod = useCallback(
    (p: ReportsPeriod) => {
      setPeriodState(p);
      setNavOffset(0);
      setTablePage(1);
      const newRange = computeRange(p, 0, { from: customFrom, to: customTo });
      void fetchData({ range: newRange, page: 1, period: p });
    },
    [customFrom, customTo, fetchData]
  );

  // ── Set status ──
  const setStatus = useCallback(
    (s: ReportsStatus) => {
      setStatusState(s);
      setTablePage(1);
      void fetchData({ status: s, page: 1 });
    },
    [fetchData]
  );

  // ── Set query with debounce ──
  const setQuery = useCallback(
    (q: string) => {
      setQueryState(q);
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      searchTimerRef.current = setTimeout(() => {
        setTablePage(1);
        void fetchData({ search: q, page: 1 });
      }, 500);
    },
    [fetchData]
  );

  // ── Set table page ──
  const onSetTablePage = useCallback(
    (p: number) => {
      setTablePage(p);
      void fetchData({ page: p });
    },
    [fetchData]
  );

  // ── Export ──
  const exportReport = useCallback(
    async (format: 'csv' | 'xlsx') => {
      const exportRows = tableRows.map((r) => ({
        'رقم الفاتورة': r.invoice_number || r.id,
        'رقم دفترة': r.daftra_id,
        'التاريخ': r.date,
        'العميل': r.client,
        'الجوال': r.phone,
        'الناقل': r.carrier,
        'الحالة': r.statusLabel,
        'المبلغ (SAR)': r.price.toFixed(2),
        'المدفوع (SAR)': r.paid.toFixed(2),
        'المتبقي (SAR)': r.remaining.toFixed(2),
        'نسبة التحصيل': r.collectionPct.toFixed(1) + '%',
      }));

      const stamp = range.label.replace(/[^\w\u0600-\u06FF-]+/g, '-');

      if (format === 'csv') {
        const csv = rowsToCsv(exportRows);
        downloadBlob(
          `تقرير-${stamp}.csv`,
          new Blob([csv], { type: 'text/csv;charset=utf-8' })
        );
        return;
      }

      // XLSX
      try {
        const XLSX = await import('xlsx');
        const ws = XLSX.utils.json_to_sheet(exportRows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'تقرير');
        const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
        downloadBlob(
          `تقرير-${stamp}.xlsx`,
          new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
        );
      } catch (e) {
        console.error('[Reports] Export error:', e);
      }
    },
    [tableRows, range.label]
  );

  return {
    loading,
    error,
    refresh,
    query,
    setQuery,
    period,
    setPeriod,
    navOffset,
    navigate,
    range,
    customFrom,
    setCustomFrom,
    customTo,
    setCustomTo,
    status,
    setStatus,
    summary,
    summaryCards,
    statusBars,
    carrierBreakdown,
    topClients,
    dailySeries,
    sparkData,
    tableRows,
    tablePagination,
    tablePage,
    setTablePage: onSetTablePage,
    exportReport,
    syncInfo,
  };
}