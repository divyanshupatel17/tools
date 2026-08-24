'use client';

/**
 * Module-level singleton rather than React context: the trigger (header button, hero bar) and
 * the overlay itself live in different, disconnected parts of the tree (header vs. hero, or
 * header vs. any other page), so a context provider would have to wrap the whole layout for no
 * benefit over a plain subscribable store.
 */
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
