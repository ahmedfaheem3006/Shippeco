import { useEffect } from 'react'

/** Reveal-once-on-scroll for `.shp-reveal` elements, as progressive
 *  enhancement: only elements that are BELOW the viewport when JS runs get
 *  hidden (`.shp-pending`) and then revealed as they scroll in. Anything
 *  already visible is never touched (no flash), and with no JS at all —
 *  crawlers, the prerendered HTML — nothing is hidden. */
export function useScrollReveal() {
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

    const elements = Array.from(document.querySelectorAll<HTMLElement>('.shp-reveal'))
    const viewportHeight = window.innerHeight
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.remove('shp-pending')
            observer.unobserve(entry.target)
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }
    )

    for (const el of elements) {
      if (el.getBoundingClientRect().top > viewportHeight) {
        el.classList.add('shp-pending')
        observer.observe(el)
      }
    }

    return () => {
      observer.disconnect()
      elements.forEach((el) => el.classList.remove('shp-pending'))
    }
  }, [])
}
