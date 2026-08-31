'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { getFirebaseAnalytics, logAnalyticsEvent } from '@/lib/firebase/analytics';

/**
 * Initialises Firebase Analytics once and logs a `page_view` on every client side
 * navigation. The App Router does not fire a fresh page load per route, so Firebase's own
 * automatic `page_view` (sent once at SDK init) would never see later navigations.
 */
export function FirebaseAnalytics() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    getFirebaseAnalytics();
  }, []);

  useEffect(() => {
    const query = searchParams.toString();
    void logAnalyticsEvent('page_view', {
      page_path: query ? `${pathname}?${query}` : pathname,
      page_title: document.title,
      page_location: window.location.href,
    });
  }, [pathname, searchParams]);

  return null;
}
