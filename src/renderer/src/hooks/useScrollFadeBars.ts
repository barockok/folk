import { useEffect } from 'react'

// Track which elements are actively scrolling and toggle a class on them so
// CSS can show the scrollbar only during motion (and on hover for grab).
// One global capture-phase listener — far cheaper than per-component
// instrumentation, and works for any future scrollable surface.
const SCROLL_IDLE_MS = 700

export function useScrollFadeBars(): void {
  useEffect(() => {
    const timers = new WeakMap<Element, number>()

    const onScroll = (e: Event) => {
      const t = e.target
      // The window/document fires scroll on document, not an element.
      const el = t instanceof Element ? t : document.documentElement
      el.classList.add('is-scrolling')
      const prev = timers.get(el)
      if (prev) window.clearTimeout(prev)
      const id = window.setTimeout(() => {
        el.classList.remove('is-scrolling')
        timers.delete(el)
      }, SCROLL_IDLE_MS)
      timers.set(el, id)
    }

    // Capture phase so we catch scrolls anywhere in the tree.
    document.addEventListener('scroll', onScroll, { capture: true, passive: true })
    return () => {
      document.removeEventListener('scroll', onScroll, { capture: true })
    }
  }, [])
}
