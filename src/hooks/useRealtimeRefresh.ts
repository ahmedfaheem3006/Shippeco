import { useEffect, useLayoutEffect, useRef } from 'react'
import { useSocket } from '../contexts/SocketContext'
import { unifiedService } from '../services/unifiedService'

/** Server → client events that mean "payment/invoice data changed". */
export const PAYMENT_EVENTS = ['PAYMENT_SUCCESS', 'INVOICE_UPDATED', 'PAYMENT_LINK_UPDATED'] as const

export type RealtimeEvent = { event: string; payload?: unknown }

type PaymentPayload = { id?: unknown; link_id?: unknown; invoice_ids?: unknown }

/**
 * Subscribe to socket events for the lifetime of the calling component, and
 * also run the handler with `[{ event: 'resync' }]` after a reconnect (events
 * emitted while offline are lost, so re-fetch from the API).
 *
 * Events arriving within `debounceMs` are delivered as ONE batch — one
 * payment fans out to several events, which should cause a single refresh.
 * The handler is read through a ref, so re-renders never stack duplicate
 * listeners; unmounting removes exactly this component's listeners.
 */
export function useRealtimeRefresh(
  events: readonly string[],
  onEvents: (batch: RealtimeEvent[]) => void,
  debounceMs = 250,
): void {
  const { socket, resyncVersion } = useSocket()
  const handlerRef = useRef(onEvents)
  useLayoutEffect(() => {
    handlerRef.current = onEvents
  })
  const key = events.join('|')

  useEffect(() => {
    if (!socket) return
    let pending: RealtimeEvent[] = []
    let timer: ReturnType<typeof setTimeout> | null = null
    const flush = () => {
      timer = null
      const batch = pending
      pending = []
      if (batch.length) handlerRef.current(batch)
    }
    const listeners = key.split('|').filter(Boolean).map((name) => {
      const fn = (payload?: unknown) => {
        // Data changed on the server: drop cached GETs before re-fetching.
        if (name !== 'notification:new') unifiedService.invalidateCache()
        pending.push({ event: name, payload })
        if (!timer) timer = setTimeout(flush, debounceMs)
      }
      socket.on(name, fn)
      return [name, fn] as const
    })
    return () => {
      if (timer) clearTimeout(timer)
      for (const [name, fn] of listeners) socket.off(name, fn)
    }
  }, [socket, key, debounceMs])

  useEffect(() => {
    if (resyncVersion > 0) {
      unifiedService.invalidateCache()
      handlerRef.current([{ event: 'resync' }])
    }
  }, [resyncVersion])
}

/** True when a realtime batch concerns this invoice (or we must resync). */
export function batchTouchesInvoice(batch: RealtimeEvent[], invoiceId: string | number | null | undefined): boolean {
  if (invoiceId === null || invoiceId === undefined) return false
  const id = Number(invoiceId)
  return batch.some(({ event, payload }) => {
    const p = (payload ?? {}) as PaymentPayload
    return event === 'resync' ||
      (event === 'INVOICE_UPDATED' && Number(p.id) === id) ||
      (event === 'PAYMENT_SUCCESS' && Array.isArray(p.invoice_ids) && p.invoice_ids.map(Number).includes(id))
  })
}

/** True when a realtime batch concerns this payment link (or we must resync). */
export function batchTouchesLink(batch: RealtimeEvent[], linkId: number | null, invoiceIds: number[] = []): boolean {
  if (!linkId) return false
  return batch.some(({ event, payload }) => {
    const p = (payload ?? {}) as PaymentPayload
    return event === 'resync' ||
      (event === 'PAYMENT_LINK_UPDATED' && Number(p.id) === linkId) ||
      (event === 'PAYMENT_SUCCESS' && Number(p.link_id) === linkId) ||
      (event === 'INVOICE_UPDATED' && invoiceIds.includes(Number(p.id)))
  })
}
