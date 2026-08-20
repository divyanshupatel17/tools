'use client';

import { useCallback } from 'react';

/** Notification permission + firing, best effort: silently no-ops where unsupported or denied. */
export function useWatchNotification() {
  const requestPermission = useCallback(() => {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'default') {
      void Notification.requestPermission();
    }
  }, []);

  const notify = useCallback((title: string, body: string) => {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    new Notification(title, { body });
  }, []);

  return { requestPermission, notify };
}
