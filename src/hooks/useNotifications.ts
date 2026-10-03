import { useState, useEffect, useCallback, useLayoutEffect, useRef } from 'react';
import { notificationsService } from '../services/notificationsService';
import type { Notification } from '../services/notificationsService';
import { useRealtimeRefresh } from './useRealtimeRefresh';

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const notificationsRef = useRef<Notification[]>([]);
  useLayoutEffect(() => {
    notificationsRef.current = notifications;
  });
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const failCountRef = useRef(0);
  const isFirstLoadRef = useRef(true);
  const MAX_CONSECUTIVE_FAILURES = 3;
  const POLL_INTERVAL = 30_000; // 30 seconds

  const fetchNotifications = useCallback(async () => {
    if (failCountRef.current >= MAX_CONSECUTIVE_FAILURES) {
      return;
    }

    if (isFirstLoadRef.current) {
      setLoading(true);
    }

    try {
      const [notifRes, countRes] = await Promise.allSettled([
        notificationsService.getNotifications(1, 20),
        notificationsService.getUnreadCount(),
      ]);

      if (notifRes.status === 'fulfilled') {
        setNotifications(notifRes.value?.notifications || []);
      }
      if (countRes.status === 'fulfilled') {
        setUnreadCount(countRes.value?.count || 0);
      }

      if (notifRes.status === 'fulfilled' || countRes.status === 'fulfilled') {
        failCountRef.current = 0;
      } else {
        failCountRef.current++;
      }
    } catch {
      failCountRef.current++;
      if (failCountRef.current >= MAX_CONSECUTIVE_FAILURES) {
        console.warn('[Notifications] Stopped polling after consecutive failures.');
      }
    } finally {
      setLoading(false);
      isFirstLoadRef.current = false;
    }
  }, []);

  useEffect(() => {
    fetchNotifications();

    const timer = setInterval(() => {
      if (failCountRef.current < MAX_CONSECUTIVE_FAILURES) {
        fetchNotifications();
      }
    }, POLL_INTERVAL);

    return () => clearInterval(timer);
  }, [fetchNotifications]);

  /**
   * Optimistic and non-blocking: the UI (dot + counter) updates immediately
   * and callers never await the network — opening the item must not depend
   * on this request. If it fails, the real state is re-fetched.
   */
  const markAsRead = useCallback((id: number) => {
    const wasUnread = notificationsRef.current.some((n) => n.id === id && !n.is_read);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id && !n.is_read ? { ...n, is_read: true, read_at: new Date().toISOString() } : n))
    );
    if (wasUnread) setUnreadCount((prev) => Math.max(0, prev - 1));
    notificationsService.markAsRead(id).catch((e) => {
      console.error('[Notifications] markAsRead failed:', e);
      failCountRef.current = 0;
      void fetchNotifications();
    });
  }, [fetchNotifications]);

  const markAllAsRead = useCallback(async () => {
    try {
      await notificationsService.markAllAsRead();
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, is_read: true, read_at: new Date().toISOString() }))
      );
      setUnreadCount(0);
    } catch (e) {
      console.error('[Notifications] markAllAsRead failed:', e);
    }
  }, []);

  const refresh = useCallback(() => {
    failCountRef.current = 0;
    return fetchNotifications();
  }, [fetchNotifications]);

  // New notifications are pushed by the server; after a reconnect, re-fetch
  // to catch anything emitted while offline. Polling stays as a fallback.
  useRealtimeRefresh(['notification:new'], () => {
    void refresh();
  });

  return {
    notifications,
    unreadCount,
    loading,
    refresh,
    markAsRead,
    markAllAsRead,
  };
}