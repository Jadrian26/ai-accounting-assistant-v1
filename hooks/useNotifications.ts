
import { useState, useCallback, useRef } from 'react';
import { NotificationType, NotificationContent } from '../types';

const LS_NOTIFICATIONS_ACTIVE_KEY = 'aiLedgerApp_activeNotification'; // Though notifications are typically not persisted like this

export const useNotifications = () => {
  const [activeNotification, setActiveNotification] = useState<NotificationContent | null>(() => {
    // Typically, notifications are transient and not loaded from localStorage.
    // If you did want to persist, you'd load here. For now, start fresh.
    return null;
  });
  const notificationTimerRef = useRef<number | null>(null);

  const dismissNotification = useCallback(() => {
    if (notificationTimerRef.current) {
      clearTimeout(notificationTimerRef.current);
    }
    setActiveNotification(null);
    // localStorage.removeItem(LS_NOTIFICATIONS_ACTIVE_KEY); // If persisting
  }, []);

  const showNotification = useCallback(
    (type: NotificationType, message: string, title?: string, duration: number = 5000) => {
      dismissNotification(); // Clear any existing notification and its timer
      const newNotification = { type, message, title };
      setActiveNotification(newNotification);
      // localStorage.setItem(LS_NOTIFICATIONS_ACTIVE_KEY, JSON.stringify(newNotification)); // If persisting

      if (duration > 0) { // Allow duration 0 for persistent notifications until manually dismissed
        notificationTimerRef.current = window.setTimeout(dismissNotification, duration);
      }
    },
    [dismissNotification]
  );

  return {
    activeNotification,
    showNotification,
    dismissNotification,
  };
};
