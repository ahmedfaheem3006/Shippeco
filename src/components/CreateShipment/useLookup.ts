/**
 * Debounced lookup with stale-result protection (saved contacts, address
 * autocomplete, Saudi short address): one request per pause in typing, the
 * previous request aborted, and an older answer can never replace a newer one
 * (sequence check). `key` null = nothing to look up.
 */
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../../utils/apiClient';

export type LookupStatus = 'idle' | 'loading' | 'done' | 'error' | 'unavailable';
export interface LookupState<T> { status: LookupStatus; items: T[]; key: string | null }
const IDLE: LookupState<never> = { status: 'idle', items: [], key: null };

/** The provider is not configured / not allowed for this role: say so, never invent results. */
export const isUnavailable = (err: unknown) =>
  err instanceof ApiError && (err.code === 'ADDRESS_PROVIDER_NOT_CONFIGURED' || err.status === 403);

export function useLookup<T>(key: string | null, fetcher: (q: string, signal: AbortSignal) => Promise<T[]>, delayMs: number): LookupState<T> {
  const [state, setState] = useState<LookupState<T>>(IDLE);
  const seq = useRef(0);
  useEffect(() => {
    const n = ++seq.current;
    if (!key) return undefined;
    const ctrl = new AbortController();
    const h = window.setTimeout(() => {
      setState({ status: 'loading', items: [], key });
      fetcher(key, ctrl.signal).then(
        (items) => { if (n === seq.current) setState({ status: 'done', items: Array.isArray(items) ? items : [], key }); },
        (err) => {
          if (n !== seq.current || ctrl.signal.aborted) return;
          setState({ status: isUnavailable(err) ? 'unavailable' : 'error', items: [], key });
        },
      );
    }, delayMs);
    return () => { window.clearTimeout(h); ctrl.abort(); };
  }, [key, fetcher, delayMs]);
  return state.key === key ? state : (IDLE as LookupState<T>);
}

/** Closes a dropdown on a click / tap outside `ref`. */
export function useOutside(ref: React.RefObject<HTMLElement>, onOutside: () => void) {
  const cb = useRef(onOutside);
  useEffect(() => { cb.current = onOutside; }, [onOutside]);
  useEffect(() => {
    const h = (e: MouseEvent | TouchEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) cb.current(); };
    document.addEventListener('mousedown', h);
    document.addEventListener('touchstart', h);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('touchstart', h); };
  }, [ref]);
}

/** Arrow keys / Enter / Escape over a suggestion list. */
export function listKeyHandler(opts: {
  open: boolean; count: number; active: number; setActive: (i: number) => void; onPick: (i: number) => void; onClose: () => void;
}) {
  return (e: React.KeyboardEvent) => {
    if (!opts.open || !opts.count) { if (e.key === 'Escape') opts.onClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); opts.setActive((opts.active + 1) % opts.count); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); opts.setActive((opts.active - 1 + opts.count) % opts.count); }
    else if (e.key === 'Enter' && opts.active >= 0) { e.preventDefault(); opts.onPick(opts.active); }
    else if (e.key === 'Escape') { e.preventDefault(); opts.onClose(); }
  };
}
