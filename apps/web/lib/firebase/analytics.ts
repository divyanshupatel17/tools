import type { Analytics } from 'firebase/analytics';

let analyticsPromise: Promise<Analytics | null> | null = null;

/**
 * Lazily initialises Firebase Analytics. Firebase's SDK and `isSupported()` check both
 * require browser globals, so this must never run during SSR or a build, and the import
 * itself stays dynamic to keep Firebase out of the initial bundle.
 */
export function getFirebaseAnalytics(): Promise<Analytics | null> {
  if (typeof window === 'undefined') {
    return Promise.resolve(null);
  }

  if (!analyticsPromise) {
    analyticsPromise = initAnalytics();
  }

  return analyticsPromise;
}

async function initAnalytics(): Promise<Analytics | null> {
  const { isFirebaseConfigured, firebaseConfig } = await import('./config');
  if (!isFirebaseConfigured) {
    return null;
  }

  const [{ initializeApp, getApps }, { getAnalytics, isSupported }] = await Promise.all([
    import('firebase/app'),
    import('firebase/analytics'),
  ]);

  const supported = await isSupported();
  if (!supported) {
    return null;
  }

  const app = getApps()[0] ?? initializeApp(firebaseConfig);
  return getAnalytics(app);
}

export async function logAnalyticsEvent(
  eventName: string,
  eventParams?: Record<string, unknown>,
): Promise<void> {
  const analytics = await getFirebaseAnalytics();
  if (!analytics) {
    return;
  }
  const { logEvent } = await import('firebase/analytics');
  logEvent(analytics, eventName, eventParams);
}
