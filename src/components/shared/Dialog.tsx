import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DialogLayerContext, getScrollParent, prefersReducedMotion } from './dialogUtils';

/**
 * Viewport-anchored modal dialog.
 *
 * Rendered through a portal on <body>, so no page wrapper can capture it: an
 * ancestor with transform/filter/animation (e.g. the `.animate-in` page
 * fade) turns `position: fixed` into "fixed to that ancestor", which is what
 * pushed the task windows off-screen, into the middle of a long page.
 *
 * - The page's scroll container (AppLayout's <main>) is not an ancestor of the
 *   dialog, so wheel/touch/keyboard scrolling inside it can never move the
 *   list behind; nothing needs `overflow: hidden` on the list, so the
 *   scrollbar never disappears and the layout never shifts.
 * - On close the element that opened it is put back exactly where it was on
 *   screen (anchor-based, so it also holds when rows above it changed) and
 *   gets focus back with `preventScroll`.
 * - Escape / backdrop / close button all go through `onRequestClose`, so the
 *   owner decides whether unsaved input must be confirmed first.
 */

type CloseReason = 'escape' | 'backdrop';

type DialogProps = {
  open: boolean;
  onRequestClose: (reason: CloseReason) => void;
  /** Called after the exit transition, once the content has unmounted. */
  onExited?: () => void;
  labelledBy: string;
  describedBy?: string;
  /** Receives focus on open (defaults to the panel itself). */
  initialFocusRef?: React.RefObject<HTMLElement>;
  /** Where focus goes on close (defaults to the element focused at open). */
  returnFocus?: () => HTMLElement | null;
  panelClassName?: string;
  children: React.ReactNode;
};

const TABBABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',');

let lockCount = 0;
let savedHtmlOverflow = '';
let savedHtmlPadding = '';
function lockDocumentScroll() {
  if (lockCount++ > 0) return;
  const html = document.documentElement;
  const gap = window.innerWidth - html.clientWidth; // only non-zero if the document itself scrolls
  savedHtmlOverflow = html.style.overflow;
  savedHtmlPadding = html.style.paddingRight;
  html.style.overflow = 'hidden';
  if (gap > 0) html.style.paddingRight = `${gap}px`;
}
function unlockDocumentScroll() {
  if (--lockCount > 0) return;
  lockCount = 0;
  const html = document.documentElement;
  html.style.overflow = savedHtmlOverflow;
  html.style.paddingRight = savedHtmlPadding;
}

type ScrollSnapshot = { container: HTMLElement; anchor: HTMLElement; offset: number };

function offsetIn(container: HTMLElement, el: HTMLElement): number {
  const top = container === document.scrollingElement ? 0 : container.getBoundingClientRect().top;
  return el.getBoundingClientRect().top - top;
}

export function Dialog({
  open,
  onRequestClose,
  onExited,
  labelledBy,
  describedBy,
  initialFocusRef,
  returnFocus,
  panelClassName = '',
  children,
}: DialogProps) {
  const [mounted, setMounted] = useState(open);
  // Mount as soon as we're asked to open (state derived during render).
  if (open && !mounted) setMounted(true);
  const [layer, setLayer] = useState<HTMLDivElement | null>(null);
  const layerRef = useRef<HTMLDivElement | null>(null);
  const setLayerNode = useCallback((node: HTMLDivElement | null) => {
    layerRef.current = node;
    setLayer(node);
  }, []);
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const snapshotRef = useRef<ScrollSnapshot | null>(null);
  const wasOpenRef = useRef(false);
  // Latest callbacks, readable from effects/listeners without re-subscribing.
  const onExitedRef = useRef(onExited);
  const returnFocusRef = useRef(returnFocus);
  const onRequestCloseRef = useRef(onRequestClose);
  useLayoutEffect(() => {
    onExitedRef.current = onExited;
    returnFocusRef.current = returnFocus;
    onRequestCloseRef.current = onRequestClose;
  });

  const finishExit = useCallback(() => {
    setMounted(false);
    onExitedRef.current?.();
  }, []);

  useLayoutEffect(() => {
    if (open && !wasOpenRef.current) {
      wasOpenRef.current = true;
      // Remember what opened us and where it sat on screen — before focus moves.
      const opener = document.activeElement instanceof HTMLElement && document.activeElement !== document.body
        ? document.activeElement
        : null;
      openerRef.current = opener;
      // Anchor on the opener's row/card when it marks one (a button inside a
      // card moves if the card's own content changes while we're open).
      const anchor = opener?.closest<HTMLElement>('[data-scroll-anchor]') ?? opener;
      const container = anchor ? getScrollParent(anchor) : null;
      snapshotRef.current = anchor && container ? { container, anchor, offset: offsetIn(container, anchor) } : null;
    } else if (!open && wasOpenRef.current) {
      wasOpenRef.current = false;
      // Put the list back where the user left it (no-op when nothing moved).
      const snap = snapshotRef.current;
      if (snap && snap.anchor.isConnected) {
        const delta = offsetIn(snap.container, snap.anchor) - snap.offset;
        if (Math.abs(delta) >= 1) snap.container.scrollBy({ top: delta, behavior: 'instant' as ScrollBehavior });
      }
      snapshotRef.current = null;
      const target = returnFocusRef.current?.() ?? openerRef.current;
      if (target && target.isConnected) target.focus({ preventScroll: true });
    }
  }, [open]);

  // Exit transition end → unmount. The timer only covers a browser that never
  // fires animationend (hidden tab); it does not affect scrolling.
  useEffect(() => {
    if (open || !mounted) return;
    // Reduced motion: no exit animation, unmount right away.
    const t = window.setTimeout(finishExit, prefersReducedMotion() ? 0 : 400);
    return () => window.clearTimeout(t);
  }, [open, mounted, finishExit]);

  useEffect(() => {
    if (!mounted) return;
    lockDocumentScroll();
    return unlockDocumentScroll;
  }, [mounted]);

  // Initial focus, without letting the browser scroll anything to reveal it.
  useLayoutEffect(() => {
    if (!open || !mounted) return;
    const target = initialFocusRef?.current ?? panelRef.current;
    target?.focus({ preventScroll: true });
    // Only on open; later re-renders must not steal focus back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mounted]);

  // Keep the layer sized to the *visual* viewport, so on phones the panel sits
  // above the on-screen keyboard instead of behind it.
  useEffect(() => {
    const vv = window.visualViewport;
    const node = layerRef.current;
    if (!mounted || !node || !vv) return;
    const sync = () => {
      node.style.height = `${vv.height}px`;
      node.style.top = `${vv.offsetTop}px`;
    };
    sync();
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    return () => {
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
    };
  }, [mounted, layer]);

  // Safety net: if focus ever ends up outside the dialog (e.g. the focused
  // control unmounted and focus fell back to <body>), Escape still closes and
  // Tab/focus are pulled back into the panel instead of reaching the page.
  useEffect(() => {
    if (!open || !layer) return;
    const onDocKey = (e: KeyboardEvent) => {
      if (!wasOpenRef.current || layer.contains(e.target as Node)) return; // handled by onKeyDown below
      if (e.key === 'Escape') {
        e.preventDefault();
        onRequestCloseRef.current('escape');
      } else if (e.key === 'Tab') {
        e.preventDefault();
        panelRef.current?.focus({ preventScroll: true });
      }
    };
    const onFocusIn = (e: FocusEvent) => {
      // Closing hands focus back to the page — don't fight that.
      if (wasOpenRef.current && !layer.contains(e.target as Node)) panelRef.current?.focus({ preventScroll: true });
    };
    document.addEventListener('keydown', onDocKey);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      document.removeEventListener('keydown', onDocKey);
      document.removeEventListener('focusin', onFocusIn);
    };
  }, [open, layer]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      if (e.defaultPrevented) return; // a popover inside handled it
      e.stopPropagation();
      e.preventDefault();
      onRequestClose('escape');
      return;
    }
    if (e.key !== 'Tab' || !layer) return;
    const items = Array.from(layer.querySelectorAll<HTMLElement>(TABBABLE)).filter(
      (el) => el.getClientRects().length > 0 || el === document.activeElement,
    );
    if (!items.length) {
      e.preventDefault();
      panelRef.current?.focus({ preventScroll: true });
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === panelRef.current)) {
      e.preventDefault();
      last.focus({ preventScroll: true });
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus({ preventScroll: true });
    }
  };

  if (!mounted) return null;
  const state = open ? 'open' : 'closed';

  return createPortal(
    <div
      ref={setLayerNode}
      className="shp-dialog-layer fixed inset-x-0 top-0 h-[100dvh] z-[70] flex items-end sm:items-center justify-center sm:p-4"
      data-state={state}
      onKeyDown={onKeyDown}
      dir="rtl"
    >
      <div
        className="shp-dialog-overlay absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
        data-state={state}
        aria-hidden="true"
        onMouseDown={(e) => {
          // With a picker list open, an outside click only closes that list.
          if (e.target === e.currentTarget && !layer?.querySelector('[data-shp-popover]')) onRequestClose('backdrop');
        }}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        tabIndex={-1}
        data-state={state}
        onAnimationEnd={(e) => {
          if (e.target === e.currentTarget && !open) finishExit();
        }}
        className={`shp-dialog-panel relative flex flex-col w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xl outline-none overflow-hidden rounded-t-3xl sm:rounded-3xl font-cairo ${panelClassName}`}
      >
        <DialogLayerContext.Provider value={layer}>{children}</DialogLayerContext.Provider>
      </div>
    </div>,
    document.body,
  );
}
