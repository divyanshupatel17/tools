'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

interface DocumentPictureInPictureApi {
  requestWindow: (options?: { width?: number; height?: number }) => Promise<Window>;
  window: Window | null;
}

declare global {
  interface Window {
    documentPictureInPicture?: DocumentPictureInPictureApi;
  }
}

function subscribeNever(): () => void {
  return () => {};
}

function getPipSupport(): boolean {
  return 'documentPictureInPicture' in window;
}

function getServerPipSupport(): boolean {
  return false;
}

/**
 * Wraps the real `documentPictureInPicture` API (Chromium only today). The caller portals its
 * content into `pipWindow.document.body` once it's set; there is no synthetic fallback window
 * for unsupported browsers, just `supported: false`.
 */
export function usePictureInPicture() {
  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  // Matches false on the server and the first client render, then a subsequent client-only
  // read flips it — the sanctioned way to read a browser-only API without a hydration mismatch.
  const supported = useSyncExternalStore(subscribeNever, getPipSupport, getServerPipSupport);

  const open = useCallback(async () => {
    if (!supported || !window.documentPictureInPicture) return;
    const win = await window.documentPictureInPicture.requestWindow({ width: 340, height: 220 });

    for (const sheet of Array.from(document.styleSheets)) {
      try {
        const ownerNode = sheet.ownerNode;
        if (ownerNode instanceof HTMLLinkElement) {
          const link = win.document.createElement('link');
          link.rel = 'stylesheet';
          link.href = ownerNode.href;
          win.document.head.appendChild(link);
        } else if (ownerNode instanceof HTMLStyleElement) {
          const style = win.document.createElement('style');
          style.textContent = ownerNode.textContent;
          win.document.head.appendChild(style);
        }
      } catch {
        // A cross-origin stylesheet can throw on read; nothing to copy in that case.
      }
    }
    win.document.documentElement.dataset.theme = document.documentElement.dataset.theme;
    win.document.body.style.margin = '0';

    win.addEventListener('pagehide', () => setPipWindow(null), { once: true });
    setPipWindow(win);
  }, [supported]);

  const close = useCallback(() => {
    pipWindow?.close();
    setPipWindow(null);
  }, [pipWindow]);

  useEffect(() => () => pipWindow?.close(), [pipWindow]);

  return { supported, pipWindow, isOpen: pipWindow !== null, open, close };
}
