// Lets a service card (in a different section of the page) hand a chosen
// service to the shipping journey without a shared React context: the
// card dispatches, the journey listens. SSR-safe (no-ops without window).
const EVENT = 'shp:service-requested'

export type ServiceRequest = { serviceName: string; path: 'waybill' | 'contact' }

export function requestService(detail: ServiceRequest) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<ServiceRequest>(EVENT, { detail }))
  document.getElementById('quote')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

export function onServiceRequested(handler: (detail: ServiceRequest) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<ServiceRequest>).detail)
  window.addEventListener(EVENT, listener)
  return () => window.removeEventListener(EVENT, listener)
}
