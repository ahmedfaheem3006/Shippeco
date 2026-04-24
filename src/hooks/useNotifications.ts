import { useState, useEffect, useCallback, useRef } from 'react';
import { notificationsService } from '../services/notificationsService';
import type { Notification } from '../services/notificationsService';

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const failCountRef = useRef(0);
  const isFirstLoadRef = useRef(true);
  const MAX_CONSECUTIVE_FAILURES = 3;
  const POLL_INTERVAL = 60_000; // 60 seconds instead of 10

  const fetchNotifications = useCallback(async () => {
    // Stop polling after too many failures
    if (failCountRef.current >= MAX_CONSECUTIVE_FAILURES) {
      return;
    }

    // Don't show loading spinner for background polls
    if (isFirstLoadRef.current) {
      setLoading(true);
    }

    try {
      // Fetch both in parallel but handle failures gracefully
      const [notifRes, countRes] = await Promise.allSettled([
        notificationsService.getNotifications(1, 10),
        notificationsService.getUnreadCount(),
      ]);

      if (notifRes.status === 'fulfilled') {
        setNotifications(notifRes.value?.notifications || []);
      }
      if (countRes.status === 'fulfilled') {
        setUnreadCount(countRes.value?.count || 0);
      }

      // At least one succeeded = reset failure counter
      if (notifRes.status === 'fulfilled' || countRes.status === 'fulfilled') {
        failCountRef.current = 0;
      } else {
        failCountRef.current++;
      }
    } catch (error) {
      failCountRef.current++;
      if (failCountRef.current >= MAX_CONSECUTIVE_FAILURES) {
        console.warn(
          '[Notifications] Stopped polling after',
          MAX_CONSECUTIVE_FAILURES,
          'consecutive failures. Will retry on manual refresh.'
        );
      }
    } finally {
      setLoading(false);
      isFirstLoadRef.current = false;
    }
  }, []);

  useEffect(() => {
    // Initial fetch
    fetchNotifications();

    // Poll at a reasonable interval (60s instead of 10s)
    const timer = setInterval(() => {
      if (failCountRef.current < MAX_CONSECUTIVE_FAILURES) {
        fetchNotifications();
      }
    }, POLL_INTERVAL);

    return () => clearInterval(timer);
  }, [fetchNotifications]);

  const markAsRead = useCallback(async (id: number) => {
    try {
      await notificationsService.markAsRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (e) {
      console.error('[Notifications] markAsRead failed:', e);
    }
  }, []);

  const refresh = useCallback(() => {
    failCountRef.current = 0; // Reset failures on manual refresh
    return fetchNotifications();
  }, [fetchNotifications]);

  return {
    notifications,
    unreadCount,
    loading,
    refresh,
    markAsRead,
  };
}