'use client';

// Module-level singleton rather than React context: trigger and overlay live in disconnected parts of the tree, so a provider would just wrap the whole layout for no benefit.
type Listener = () => void;

let isOpen = false;
const listeners = new Set<Listener>();

function notify() {
  for (const listener of listeners) listener();
}

export function openSearchOverlay() {
  isOpen = true;
  notify();
}

export function closeSearchOverlay() {
  isOpen = false;
  notify();
}

export function subscribeSearchOverlay(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSearchOverlayOpen() {
  return isOpen;
}

export function getSearchOverlaySnapshot() {
  return false;
}
