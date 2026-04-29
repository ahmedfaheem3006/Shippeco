import { useCallback, useEffect, useState, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { clientService } from "../services/clientService";
import {
  type ClientsSummaryResponse,
  type ClientProfileResponse,
  type ClientsStatsResponse,
} from "../services/dbService";
import { downloadBlob } from "../utils/download";
import { rowsToCsv } from "../utils/reports";

export type SortField =
  | "revenue"
  | "invoices"
  | "name"
  | "remaining"
  | "recent"
  | "paid"
  | "collection";
export type SortOrder = "asc" | "desc";
export type ExportFormat = "csv" | "xlsx";

async function exportXlsx(rows: Record<string, string>[], filename: string) {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Clients");
  const out = XLSX.write(wb, {
    bookType: "xlsx",
    type: "array",
  }) as ArrayBuffer;
  downloadBlob(
    filename,
    new Blob([out], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  );
}

export const SEGMENT_LABELS: Record<string, string> = {
  vip: "VIP",
  active: "نشط",
  regular: "عادي",
  dormant: "خامل",
  defaulter: "متعثر",
  new: "جديد",
  no_invoices: "بدون فواتير",
};

export const SEGMENT_COLORS: Record<string, string> = {
  vip: "text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800/30",
  active:
    "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/30",
  regular:
    "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800/30",
  dormant:
    "text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800/30 border-gray-200 dark:border-gray-700",
  defaulter:
    "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/30",
  new: "text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800/30",
  no_invoices:
    "text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/30 border-slate-200 dark:border-slate-700",
};

export function useClientsPage() {
  // ═══ Loading States ═══
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // ═══ Data ═══
  const [clientsData, setClientsData] = useState<ClientsStatsResponse | null>(
    null,
  );
  const [summary, setSummary] = useState<ClientsSummaryResponse | null>(null);
  const [profile, setProfile] = useState<ClientProfileResponse | null>(null);
  const [cities, setCities] = useState<Array<{ city: string; count: number }>>(
    [],
  );
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [showProfile, setShowProfile] = useState(false);

  // ═══ Filters ═══
  const [search, setSearch] = useState("");
  const [segment, setSegment] = useState("all");
  const [city, setCity] = useState("all");
  const [sort, setSort] = useState<SortField>("invoices");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [page, setPage] = useState(1);
  const [limit] = useState(30);

  // ═══ Debounce search ═══
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 400);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [search]);

  // ═══ Fetch Clients ═══
  const fetchClients = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, summaryRes] = await Promise.all([
        clientService.getClients({
          page,
          limit,
          search: debouncedSearch || undefined,
          segment: segment !== "all" ? segment : undefined,
          city: city !== "all" ? city : undefined,
          sort,
          order: sortOrder,
        }),
        summary ? Promise.resolve(summary) : clientService.getClientSummary(),
      ]);
      setClientsData(statsRes);
      if (!summary) setSummary(summaryRes);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل تحميل بيانات العملاء");
    } finally {
      setLoading(false);
    }
  }, [page, limit, debouncedSearch, segment, city, sort, sortOrder, summary, clientService]);

  // ═══ Refresh all ═══
  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const summary = await clientService.getClientSummary()
      setSummary(summary)
      
      const stats = await clientService.getClients({ page: 1, limit, sort, order: sortOrder, search: debouncedSearch })
      setClientsData(stats)
      setPage(1)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل تحميل العملاء')
    } finally {
      setLoading(false)
    }
  }, [limit, sort, sortOrder, debouncedSearch])


  // ═══ Auto-fetch on filter change ═══
  useEffect(() => {
    void fetchClients();
  }, [fetchClients]);

  // ═══ Load cities once ═══
  useEffect(() => {
    clientService.getCities()
      .then(setCities)
      .catch(() => {});
  }, [clientService]);

  // ═══ Sync from Daftra (Refactored for Railway) ═══
  const syncClients = useCallback(async () => {
    setSyncing(true);
    setSyncMessage(null);
    setError(null);
    try {
      setSyncMessage("جاري المزامنة من دفترة...");
      const res = await clientService.sync(20); // Sync last 20 pages
      
      setSyncMessage(`✅ تمت المزامنة بنجاح: ${res.synced || res.saved || 'تم التحديث'}`);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل المزامنة");
    } finally {
      setSyncing(false);
    }
  }, [refresh, clientService]);

  // ═══ Client Profile ═══
  const openProfile = useCallback(
    async (clientId: string, clientName?: string) => {
      setSelectedClientId(clientId || clientName || null);
      setShowProfile(true);
      setProfileLoading(true);
      setProfile(null);
      try {
        // Use id if available, otherwise fall back to name lookup
        const lookupId = clientId || clientName || '';
        const data = await clientService.getClientProfile(lookupId);
        setProfile(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "فشل تحميل بيانات العميل");
      } finally {
        setProfileLoading(false);
      }
    },
    [clientService],
  );

  const closeProfile = useCallback(() => {
    setShowProfile(false);
    setSelectedClientId(null);
    setProfile(null);
  }, []);

  // ═══ Initialize auto-open profile from URL ═══
  useEffect(() => {
    const profileParam = searchParams.get('profile')
    if (profileParam) {
      // Clear the param so it doesn't reopen if they close it
      setSearchParams(prev => {
        prev.delete('profile')
        return prev
      }, { replace: true })
      
      setSelectedClientId(profileParam)
      setShowProfile(true)
      setProfileLoading(true)
      setProfile(null)
      clientService.getClientProfile(profileParam).then(data => {
        setProfile(data)
      }).catch(() => {
        setProfile(null)
      }).finally(() => {
        setProfileLoading(false)
      })
    }
  }, [searchParams, setSearchParams])

  // ═══ Update Client ═══
  const updateClient = useCallback(
    async (
      id: string,
      data: {
        notes?: string;
        category?: string;
        city?: string;
        phone?: string;
        email?: string;
      },
    ) => {
      try {
        await clientService.updateClient(id, data);
        if (selectedClientId) {
          const updated = await clientService.getClientProfile(selectedClientId);
          setProfile(updated);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "فشل التحديث");
      }
    },
    [selectedClientId, clientService],
  );

  // ═══ Export ═══
  const exportClients = useCallback(
    async (format: ExportFormat) => {
      if (!clientsData?.clients.length) return;
      const rows = clientsData.clients.map((c) => ({
        الاسم: c.name,
        الجوال: c.phone,
        البريد: c.email || "",
        المدينة: c.city || "",
        "عدد الفواتير": String(c.total_invoices),
        "إجمالي الإيرادات": (c.total_revenue || 0).toFixed(2),
        المدفوع: (c.total_paid || 0).toFixed(2),
        المتبقي: (c.total_remaining || 0).toFixed(2),
        "نسبة التحصيل": (c.collection_rate || 0).toFixed(1) + "%",
        التصنيف: SEGMENT_LABELS[c.segment] || c.segment,
        "آخر فاتورة": c.last_invoice_date || "",
        "تاريخ التسجيل": (c.created_at || "").slice(0, 10),
      }));

      const stamp = new Date().toISOString().slice(0, 10);
      if (format === "csv") {
        const csv = rowsToCsv(rows);
        downloadBlob(
          `عملاء-${stamp}.csv`,
          new Blob([csv], { type: "text/csv;charset=utf-8" }),
        );
      } else {
        await exportXlsx(rows, `عملاء-${stamp}.xlsx`);
      }
    },
    [clientsData],
  );

  // ═══ Sorting ═══
  const toggleSort = useCallback(
    (field: SortField) => {
      if (sort === field) {
        setSortOrder((prev) => (prev === "desc" ? "asc" : "desc"));
      } else {
        setSort(field);
        setSortOrder("desc");
      }
      setPage(1);
    },
    [sort],
  );

  // ═══ Computed ═══
  const clients = clientsData?.clients ?? [];
  const pagination = clientsData?.pagination ?? {
    page: 1,
    limit: 30,
    total: 0,
    pages: 0,
  };
  const totals = summary?.totals ?? {
    clients: 0,
    invoices: 0,
    revenue: 0,
    paid: 0,
    remaining: 0,
    collection_rate: 0,
  };
  const segments = summary?.segments ?? [];
  const topClients = summary?.top_clients ?? [];
  const recentClients = summary?.recent_clients ?? [];

  // ═══ Clear sync message after 8 seconds ═══
  useEffect(() => {
    if (!syncMessage) return;
    const timer = setTimeout(() => setSyncMessage(null), 8000);
    return () => clearTimeout(timer);
  }, [syncMessage]);

  return {
    // State
    loading,
    syncing,
    profileLoading,
    error,
    syncMessage,

    // Data
    clients,
    pagination,
    totals,
    segments,
    cities,
    topClients,
    recentClients,
    profile,
    showProfile,
    selectedClientId,

    // Filters
    search,
    setSearch,
    segment,
    setSegment,
    city,
    setCity,
    sort,
    sortOrder,
    toggleSort,
    page,
    setPage,

    // Actions
    refresh,
    syncClients,
    openProfile,
    closeProfile,
    updateClient,
    exportClients,

    // Helpers
    SEGMENT_LABELS,
    SEGMENT_COLORS,
  };
}
