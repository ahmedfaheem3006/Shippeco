import { createContext, useContext } from 'react';

export const DialogLayerContext = createContext<HTMLElement | null>(null);

/** The open dialog's layer element, for popovers (listboxes) that must float
 *  above the panel without being clipped by its scroll areas. */
export const useDialogLayer = () => useContext(DialogLayerContext);

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** Nearest ancestor that actually scrolls (AppLayout's <main> in the app). */
export function getScrollParent(el: Element | null): HTMLElement | null {
  for (let node = el?.parentElement ?? null; node; node = node.parentElement) {
    const oy = getComputedStyle(node).overflowY;
    if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && node.scrollHeight > node.clientHeight) return node;
  }
  return (document.scrollingElement as HTMLElement | null) ?? null;
}
