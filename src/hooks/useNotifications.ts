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

  const markAsRead = useCallback(async (id: number) => {
    try {
      await notificationsService.markAsRead(id);
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n
        )
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (e) {
      console.error('[Notifications] markAsRead failed:', e);
    }
  }, []);

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

  return {
    notifications,
    unreadCount,
    loading,
    refresh,
    markAsRead,
    markAllAsRead,
  };
}