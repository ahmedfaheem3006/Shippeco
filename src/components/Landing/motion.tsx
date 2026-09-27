// One shared motion vocabulary for the landing page's interactive parts
// (framer-motion, already a project dependency) — instead of ad-hoc
// durations/easings per element. Simple one-shot section reveals stay in
// plain CSS (landing.css) so they never depend on JS to become visible.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { m, useReducedMotion, type Transition } from 'framer-motion'

export const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1]

export const DURATION = {
  fast: 0.16,
  base: 0.26,
  slow: 0.38,
} as const

export function useMotionTransition(duration: number = DURATION.base): Transition {
  const reduce = useReducedMotion()
  return reduce ? { duration: 0 } : { duration, ease: EASE_OUT }
}

/** Stage-to-stage swap: short fade + slide (transform/opacity only). */
export const stageMotion = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
}

/** Progressive reveal / removal of a block (e.g. shipment-type cards
 *  appearing, a package row being added or removed). */
export const collapseMotion = {
  initial: { opacity: 0, height: 0 },
  animate: { opacity: 1, height: 'auto' },
  exit: { opacity: 0, height: 0 },
}

/** Animates its height to fit its content whenever the content changes
 *  size (e.g. between journey stages). Clips overflow ONLY while the height
 *  is actually animating — at rest it's overflow:visible, so absolutely
 *  positioned dropdowns inside (country / dial-code pickers) are never cut
 *  off. Server-rendered as plain height:auto, so nothing is hidden pre-JS. */
export function AutoHeight({ children }: { children: ReactNode }) {
  const innerRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState<number | 'auto'>('auto')
  const [animating, setAnimating] = useState(false)
  const transition = useMotionTransition(DURATION.slow)

  useEffect(() => {
    const el = innerRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => setHeight(entry.contentRect.height))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <m.div
      initial={false}
      animate={{ height }}
      transition={transition}
      onAnimationStart={() => setAnimating(true)}
      onAnimationComplete={() => setAnimating(false)}
      style={{ overflow: animating ? 'hidden' : 'visible' }}
    >
      <div ref={innerRef}>{children}</div>
    </m.div>
  )
}
