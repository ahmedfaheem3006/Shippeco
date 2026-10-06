import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { clientService } from "../services/clientService";
import {
  type ClientsSummaryResponse,
  type ClientProfileResponse,
  type ClientsStatsResponse,
} from "../services/dbService";
import {
  CLIENT_PRESETS,
  EMPTY_CLIENT_FILTERS,
  activeClientFilterChips,
  clientFilterParams,
  validateClientFilters,
  type ClientFilterState,
  type ClientPreset,
} from "../utils/clientFilters";

export type SortField =
  | "revenue"
  | "invoices"
  | "name"
  | "remaining"
  | "recent"
  | "paid"
  | "collection";
export type SortOrder = "asc" | "desc";

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

  // ═══ Advanced filters (server-side, combined with AND) ═══
  const [filters, setFiltersState] = useState<ClientFilterState>(EMPTY_CLIENT_FILTERS);
  const [debouncedFilters, setDebouncedFilters] = useState<ClientFilterState>(EMPTY_CLIENT_FILTERS);
  useEffect(() => {
    if (filters === debouncedFilters) return;
    const t = setTimeout(() => {
      setDebouncedFilters(filters);
      setPage(1);
    }, 450);
    return () => clearTimeout(t);
  }, [filters, debouncedFilters]);

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

  // ═══ One parameter set for the list AND the export ═══
  const filterError = validateClientFilters(debouncedFilters);
  const listParams = useMemo(
    () => ({
      search: debouncedSearch || undefined,
      segment: segment !== "all" ? segment : undefined,
      city: city !== "all" ? city : undefined,
      sort,
      order: sortOrder,
      ...clientFilterParams(debouncedFilters),
    }),
    [debouncedSearch, segment, city, sort, sortOrder, debouncedFilters],
  );

  // ═══ Fetch Clients ═══
  const fetchClients = useCallback(async () => {
    if (filterError) {
      setError(filterError);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [statsRes, summaryRes] = await Promise.all([
        clientService.getClients({ page, limit, ...listParams }),
        summary ? Promise.resolve(summary) : clientService.getClientSummary(),
      ]);
      setClientsData(statsRes);
      if (!summary) setSummary(summaryRes);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل تحميل بيانات العملاء");
    } finally {
      setLoading(false);
    }
  }, [page, limit, listParams, filterError, summary, clientService]);

  // ═══ Refresh all ═══
  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const summary = await clientService.getClientSummary()
      setSummary(summary)
      
      const stats = await clientService.getClients({ page: 1, limit, ...listParams })
      setClientsData(stats)
      setPage(1)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل تحميل العملاء')
    } finally {
      setLoading(false)
    }
  }, [limit, listParams])


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

  // ═══ Create Client ═══
  const createClient = useCallback(
    async (data: {
      name: string;
      phone?: string;
      email?: string;
      company?: string;
      address?: string;
      city?: string;
      tax_number?: string;
    }) => {
      setLoading(true);
      setError(null);
      try {
        await clientService.createClient(data);
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "فشل إضافة العميل");
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [refresh]
  );

  // ═══ Filter actions ═══
  const setFilter = useCallback(<K extends keyof ClientFilterState>(key: K, value: ClientFilterState[K]) => {
    setFiltersState((prev) => ({ ...prev, [key]: value }));
  }, []);

  const patchFilters = useCallback((patch: Partial<ClientFilterState>) => {
    setFiltersState((prev) => ({ ...prev, ...patch }));
  }, []);

  /** Presets ADD their rule to the current filters (they never wipe the others). */
  const applyPreset = useCallback((preset: ClientPreset) => {
    if (preset.patch) setFiltersState((prev) => ({ ...prev, ...preset.patch }));
    if (preset.sort) {
      setSort(preset.sort.field);
      setSortOrder(preset.sort.order);
    }
    setPage(1);
  }, []);

  const clearAllFilters = useCallback(() => {
    setFiltersState(EMPTY_CLIENT_FILTERS);
    setDebouncedFilters(EMPTY_CLIENT_FILTERS);
    setSegment("all");
    setCity("all");
    setSearch("");
    setDebouncedSearch("");
    setSort("invoices");
    setSortOrder("desc");
    setPage(1);
  }, []);

  const filterChips = useMemo(() => activeClientFilterChips(filters), [filters]);
  const exportFilterLabels = useMemo(() => {
    const out = activeClientFilterChips(debouncedFilters).map((c) => c.label);
    if (segment !== "all") out.unshift(`التصنيف: ${SEGMENT_LABELS[segment] || segment}`);
    if (city !== "all") out.unshift(`المدينة: ${city}`);
    if (debouncedSearch) out.unshift(`بحث: ${debouncedSearch}`);
    return out;
  }, [debouncedFilters, segment, city, debouncedSearch]);
  const hasAnyFilter = filterChips.length > 0 || segment !== "all" || city !== "all" || Boolean(search);

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
    filters,
    setFilter,
    patchFilters,
    applyPreset,
    clearAllFilters,
    filterChips,
    hasAnyFilter,
    presets: CLIENT_PRESETS,
    exportParams: listParams,
    exportFilterLabels,

    // Actions
    refresh,
    syncClients,
    openProfile,
    closeProfile,
    updateClient,
    createClient,
    deleteClient: async (id: string) => {
      try {
        await clientService.deleteClient(id);
        closeProfile();
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "فشل حذف العميل");
        throw e;
      }
    },

    // Helpers
    SEGMENT_LABELS,
    SEGMENT_COLORS,
  };
}
