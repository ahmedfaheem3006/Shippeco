import { useCallback, useMemo, useRef, useState } from 'react';
import { settingsService } from '../services/settingsService';
import { pingPaymobWorker } from '../services/paymobService';
import { usersService, type User } from '../services/usersService';
import type { PlatformSettings, UserRecord } from '../utils/models';
import { useSettingsStore } from './useSettingsStore';
import { api } from '../utils/apiClient';

const DEFAULT_SETTINGS: PlatformSettings = {
  currency: 'PL',
  invoiceNote: '',
  storeWA: '',
};

function safeJsonParse<T>(raw: string): T | null {
  try { return JSON.parse(raw) as T; } catch { return null; }
}

function normalizeSettings(input: unknown): PlatformSettings {
  const obj = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  return {
    currency: typeof obj.currency === 'string' ? obj.currency : DEFAULT_SETTINGS.currency,
    invoiceNote: typeof obj.invoiceNote === 'string' ? obj.invoiceNote : DEFAULT_SETTINGS.invoiceNote,
    storeWA: typeof obj.storeWA === 'string' ? obj.storeWA : DEFAULT_SETTINGS.storeWA,
  };
}

export type SyncInfo = {
  last_recent_sync: string | null;
  total_invoices: number;
  cron_enabled: boolean;
};

export function useSettingsPage() {
  const setStoreSettings = useSettingsStore((s) => s.setSettings);

  const [loading, setLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const [settings, setSettingsRaw] = useState<PlatformSettings>(DEFAULT_SETTINGS);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [rawUsers, setRawUsers] = useState<User[]>([]);
  const [usersLoadedOnce, setUsersLoadedOnce] = useState(false);

  // Per-user in-flight actions — lets the UI disable/spin only the row being
  // mutated instead of freezing the entire list, and blocks a second click
  // on the same user while the first request is still pending.
  //
  // The membership check below has to be against a plain ref mutated
  // synchronously and immediately, NOT a value derived from React state:
  // two clicks fired in the same tick (fast double-click, or two calls
  // before React has re-rendered) would otherwise both read the same
  // not-yet-updated state snapshot and both slip through. `pendingVersion`
  // exists only to make components re-render when membership changes.
  const pendingRef = useRef<Set<number>>(new Set());
  const [, setPendingVersion] = useState(0);

  // Not memoized on purpose: it must always read the live ref, and the
  // membership check itself is cheap enough that wrapping it in
  // useCallback would only add a stale-closure risk for no benefit.
  const isUserPending = (id: number) => pendingRef.current.has(id);

  const withUserPending = useCallback(async (id: number, action: () => Promise<void>) => {
    if (pendingRef.current.has(id)) return; // duplicate submission guard
    pendingRef.current.add(id);
    setPendingVersion((v) => v + 1);
    try {
      await action();
    } finally {
      pendingRef.current.delete(id);
      setPendingVersion((v) => v + 1);
    }
  }, []);

  const [connPaymob, setConnPaymob] = useState<{ ok: boolean; text: string } | null>(null);
  const [connDaftra, setConnDaftra] = useState<{ ok: boolean; text: string } | null>(null);
  const [syncInfo, setSyncInfo] = useState<SyncInfo | null>(null);

  /* ── setSettings wrapper: accepts object or updater function ── */
  const setSettings = useCallback(
    (valueOrUpdater: PlatformSettings | Partial<PlatformSettings> | ((prev: PlatformSettings) => PlatformSettings)) => {
      if (typeof valueOrUpdater === 'function') {
        setSettingsRaw(valueOrUpdater);
      } else {
        setSettingsRaw((prev) => ({ ...prev, ...valueOrUpdater }));
      }
    },
    []
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    setStatus(null);
    try {
      const [settingsResult, usersResult, syncResult] = await Promise.allSettled([
        settingsService.getSettings(),
        usersService.getUsers(),
        api.get<any>('/sync/status').catch(() => null),
      ]);

      // ── Process settings ──
      if (settingsResult.status === 'fulfilled') {
        const rows = settingsResult.value;
        console.log('[Settings] Raw settings:', rows);
        
        let settingsMap = new Map<string, string>();

        // Handle different response formats
        if (Array.isArray(rows)) {
          for (const r of rows) {
            if (r?.key && r.value !== undefined) {
              settingsMap.set(r.key, typeof r.value === 'string' ? r.value : JSON.stringify(r.value));
            }
          }
        } else if (rows && typeof rows === 'object' && !Array.isArray(rows)) {
          for (const [k, v] of Object.entries(rows as Record<string, unknown>)) {
            settingsMap.set(k, typeof v === 'string' ? v : JSON.stringify(v));
          }
        }

        const rawSettings = settingsMap.get('shippec_settings');
        if (rawSettings) {
          const parsed = safeJsonParse<unknown>(rawSettings);
          const nextSettings = normalizeSettings(parsed);
          setSettingsRaw(nextSettings);
          setStoreSettings(nextSettings);
        } else {
          const nextSettings: PlatformSettings = {
            currency: settingsMap.get('currency') || DEFAULT_SETTINGS.currency,
            invoiceNote: settingsMap.get('invoiceNote') || settingsMap.get('invoice_note') || DEFAULT_SETTINGS.invoiceNote,
            storeWA: settingsMap.get('storeWA') || settingsMap.get('store_wa') || DEFAULT_SETTINGS.storeWA,
          };
          setSettingsRaw(nextSettings);
          setStoreSettings(nextSettings);
        }
      }

      // ── Process users ──
      // Keep the last-known list on failure instead of wiping it to an
      // empty array — an empty list must only ever mean "there really are
      // no users", never "the request failed".
      if (usersResult.status === 'fulfilled') {
        const fetchedUsers: User[] = usersResult.value || [];
        setRawUsers(fetchedUsers);
        const formattedUsers: UserRecord[] = fetchedUsers.map((u) => ({
          name: u.full_name || u.email || '',
          username: u.email || '',
          password: '',
          role: u.role || 'employee',
          id: u.id,
          status: u.status || 'approved',
          is_active: u.is_active,
          phone: u.phone,
          last_login: u.last_login,
          created_at: u.created_at,
        } as UserRecord & { is_active?: boolean; phone?: string; last_login?: string; created_at?: string }));
        setUsers(formattedUsers);
        setUsersError(null);
      } else {
        console.error('[Settings] Failed to load users:', usersResult.reason);
        setUsersError(
          usersResult.reason instanceof Error ? usersResult.reason.message : 'تعذر تحميل قائمة المستخدمين'
        );
      }
      setUsersLoadedOnce(true);

      // ── Process sync info (Only if not already set, to keep it stable) ──
      if (!syncInfo && syncResult.status === 'fulfilled' && syncResult.value) {
        const d = syncResult.value?.data || syncResult.value;
        console.log('[Settings] Sync status:', d);
        setSyncInfo({
          last_recent_sync: d?.last_recent_sync || d?.last_sync || null,
          total_invoices: d?.total_invoices || d?.total || 0,
          cron_enabled: true,
        });
      }
    } catch (e) {
      console.error('[Settings] Refresh error:', e);
      setError(e instanceof Error ? e.message : 'فشل تحميل الإعدادات');
    } finally {
      setLoading(false);
    }
  }, [setStoreSettings]);

  /* ── Save Platform Settings ── */
  const savePlatformSettings = useCallback(async () => {
    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      const payload = JSON.stringify(settings);
      console.log('[Settings] Saving:', payload);

      await api.post('/settings', {
        key: 'shippec_settings',
        value: payload,
      });

      setStoreSettings(settings);
      setStatus('✅ تم حفظ الإعدادات');
      setTimeout(() => setStatus(null), 3000);
    } catch (e) {
      console.error('[Settings] Save error:', e);
      const msg = e instanceof Error ? e.message : 'تعذّر حفظ الإعدادات';
      setError(msg);
    } finally {
      setSaving(false);
    }
  }, [setStoreSettings, settings]);

  /* ── User actions ──
     Each is guarded by withUserPending(id, ...): a per-row pending flag
     (not the global `saving`) so mutating one user doesn't freeze the rest
     of the list, and a second click on the same row while a request is
     still in flight is simply ignored instead of firing a duplicate call. */
  const handleApprove = useCallback((id: number) => withUserPending(id, async () => {
    setError(null); setStatus(null);
    try {
      await usersService.approveUser(id);
      await refresh();
      setStatus('✅ تم قبول المستخدم بنجاح');
      setTimeout(() => setStatus(null), 3000);
    } catch (e) { setError(e instanceof Error ? e.message : 'فشل قبول المستخدم'); }
  }), [refresh, withUserPending]);

  const handleReject = useCallback((id: number, reason = 'تعذر القبول') => withUserPending(id, async () => {
    setError(null); setStatus(null);
    try {
      await usersService.rejectUser(id, reason);
      await refresh();
      setStatus('تم رفض المستخدم');
      setTimeout(() => setStatus(null), 3000);
    } catch (e) { setError(e instanceof Error ? e.message : 'فشل رفض المستخدم'); }
  }), [refresh, withUserPending]);

  const handleDelete = useCallback((id: number) => withUserPending(id, async () => {
    setError(null); setStatus(null);
    try {
      await usersService.deleteUser(id);
      // Only drop the row from local state after the server confirms the
      // deletion succeeded — refresh() re-fetches the authoritative list.
      await refresh();
      setStatus('✅ تم حذف المستخدم نهائياً');
      setTimeout(() => setStatus(null), 3000);
    } catch (e) { setError(e instanceof Error ? e.message : 'فشل حذف المستخدم'); }
  }), [refresh, withUserPending]);

  const handleChangeRole = useCallback((id: number, role: string) => withUserPending(id, async () => {
    setError(null); setStatus(null);
    try {
      await usersService.changeRole(id, role);
      await refresh();
      const roleNames: Record<string, string> = {
        admin: 'مدير النظام',
        manager: 'مدير فرعي',
        accountant: 'محاسب',
        employee: 'موظف مبيعات',
        viewer: 'مشاهد فقط',
      };
      setStatus(`✅ تم تغيير الدور إلى ${roleNames[role] || role}`);
      setTimeout(() => setStatus(null), 3000);
    } catch (e) { setError(e instanceof Error ? e.message : 'فشل تغيير الدور'); }
  }), [refresh, withUserPending]);

  const handleToggleActive = useCallback((id: number, currentlyActive: boolean) => withUserPending(id, async () => {
    setError(null); setStatus(null);
    try {
      if (currentlyActive) {
        await usersService.deactivateUser(id);
      } else {
        await usersService.activateUser(id);
      }
      // IMPORTANT: refresh() resets `status` to null at its start, so the
      // success message must be set AFTER it resolves — setting it before
      // (as this used to) meant it was cleared before ever being shown.
      await refresh();
      setStatus(currentlyActive ? 'تم تعطيل الحساب' : '✅ تم تفعيل الحساب');
      setTimeout(() => setStatus(null), 3000);
    } catch (e) { setError(e instanceof Error ? e.message : 'فشل تحديث الحالة'); }
  }), [refresh, withUserPending]);

  const handleUpdateUser = useCallback((id: number, data: { full_name?: string; email?: string; phone?: string }) => withUserPending(id, async () => {
    setError(null); setStatus(null);
    try {
      await usersService.updateUser(id, data);
      await refresh();
      setStatus('✅ تم تحديث البيانات');
      setTimeout(() => setStatus(null), 3000);
    } catch (e) { setError(e instanceof Error ? e.message : 'فشل تحديث البيانات'); }
  }), [refresh, withUserPending]);

  /* ── Manual sync ── */
  const triggerManualSync = useCallback(async () => {
    setSaving(true); setError(null); setStatus(null);
    try {
      const result = await api.get<any>('/sync/recent');
      const d = result?.data || result;
      const synced = d?.synced || 0;
      const total = d?.total || d?.total_invoices || syncInfo?.total_invoices || 0;
      
      setStatus(`✅ تم المزامنة — ${synced} فاتورة`);
      
      // Update sync info locally to reflect today's date and updated count
      setSyncInfo(prev => ({
        last_recent_sync: new Date().toISOString(),
        total_invoices: total,
        cron_enabled: prev?.cron_enabled ?? true
      }));

      setTimeout(() => { 
        setStatus(null); 
        refresh(); // Refresh everything else
      }, 3000);
    } catch (e) { setError(e instanceof Error ? e.message : 'فشل تشغيل المزامنة'); }
    finally { setSaving(false); }
  }, [refresh]);

  /* ── Sort users ── */
  const sortedUsers = useMemo(() => {
    const rank: Record<string, number> = { admin: 0, manager: 1, accountant: 2, employee: 3, viewer: 4 };
    const statusRank: Record<string, number> = { pending: 0, approved: 1, rejected: 2 };
    return [...users].sort((a, b) => {
      const s = (statusRank[a.status || 'approved'] ?? 99) - (statusRank[b.status || 'approved'] ?? 99);
      if (s !== 0) return s;
      return (rank[a.role] ?? 99) - (rank[b.role] ?? 99);
    });
  }, [users]);

  /* ── Test Paymob ── */
  const testPaymob = useCallback(async () => {
    setConnPaymob(null);
    try {
      const res = await pingPaymobWorker();
      const ok = String(res?.status || '').toLowerCase() === 'ok';
      setConnPaymob({ ok, text: ok ? 'Worker متصل ✅' : (res?.message || 'Worker غير متصل') });
    } catch (e) {
      setConnPaymob({ ok: false, text: e instanceof Error ? e.message : 'غير متصل' });
    }
  }, []);

  /* ── Test Daftra ── */
  const testDaftra = useCallback(async () => {
    setConnDaftra(null);
    try {
      const res = await api.get<any>('/invoices/light?limit=1');
      const d = res?.data || res;
      const total = d?.pagination?.total || d?.total || 0;
      
      if (total > 0) {
        setConnDaftra({ ok: true, text: `متصل — ${total.toLocaleString()} فاتورة في قاعدة البيانات` });
        setSyncInfo(prev => ({
          last_recent_sync: new Date().toISOString(),
          total_invoices: total,
          cron_enabled: prev?.cron_enabled ?? true
        }));
      } else {
        setConnDaftra({ ok: false, text: 'لا توجد فواتير في قاعدة البيانات' });
      }
    } catch (e) {
      setConnDaftra({ ok: false, text: e instanceof Error ? e.message : 'غير متصل' });
    }
  }, []);

  return {
    loading, saving, error, status,
    settings, setSettings,
    refresh, savePlatformSettings,
    users: sortedUsers, rawUsers,
    usersError, usersLoadedOnce, isUserPending,
    handleApprove, handleReject, handleDelete,
    handleChangeRole, handleToggleActive, handleUpdateUser,
    triggerManualSync, syncInfo,
    connPaymob, testPaymob,
    connDaftra, testDaftra,
  };
}