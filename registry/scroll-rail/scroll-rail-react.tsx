// scroll-rail-react — a thin React wrapper over the framework-agnostic scroll-rail core.
//
//   <ScrollRail scrollRef={ref} items={items} />   renders the rail
//   useActiveStop({ scrollRef, items })            headless: just the active id
//
// Both take `items` whose `target` is either an element or an element id (string) resolved
// inside the scroll container — so you can drive it from server-rendered ids without refs.

import { useEffect, useRef, useState, type RefObject } from 'react'
import {
  createScrollRail,
  observeActive,
  type ScrollRail as VanillaScrollRail,
  type ScrollRailItem,
} from './scroll-rail'

export type { ScrollRailItem } from './scroll-rail'

/** Like ScrollRailItem, but `target` may be an element id resolved inside the container. */
export interface ReactScrollRailItem extends Omit<ScrollRailItem, 'target'> {
  target: HTMLElement | string
}

function resolveItems(items: ReactScrollRailItem[], scope: HTMLElement): ScrollRailItem[] {
  const out: ScrollRailItem[] = []
  for (const it of items) {
    const target =
      typeof it.target === 'string'
        ? scope.querySelector<HTMLElement>(`#${cssEscape(it.target)}`)
        : it.target
    if (target) out.push({ ...it, target })
  }
  return out
}

function cssEscape(id: string): string {
  const c = (globalThis as { CSS?: { escape?(s: string): string } }).CSS
  return c?.escape ? c.escape(id) : id.replace(/[^a-zA-Z0-9_-]/g, '\\$&')
}

export interface ScrollRailProps {
  /** Ref to the scrolling element the stops live inside. */
  scrollRef: RefObject<HTMLElement | null>
  items: ReactScrollRailItem[]
  position?: 'left' | 'right'
  activationOffset?: number
  onActiveChange?: (id: string | null) => void
  className?: string
}

/**
 * Renders the scroll rail. Mount it inside the same `position: relative` box that holds
 * your scroll container — the rail pins itself to that box's edge.
 *
 * The returned wrapper is `display: contents`, so it adds no layout box of its own; the
 * rail (absolutely positioned) resolves against your relative ancestor.
 */
export function ScrollRail({
  scrollRef, items, position, activationOffset, onActiveChange, className,
}: ScrollRailProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const railRef = useRef<VanillaScrollRail | null>(null)
  // Keep the latest onActiveChange without re-creating the rail each render.
  const activeCb = useRef(onActiveChange)
  activeCb.current = onActiveChange

  useEffect(() => {
    const scroll = scrollRef.current
    const host = hostRef.current
    if (!scroll || !host) return
    const rail = createScrollRail({
      scrollContainer: scroll,
      items: resolveItems(items, scroll),
      position,
      activationOffset,
      className,
      onActiveChange: (id) => activeCb.current?.(id),
    })
    host.appendChild(rail.element)
    railRef.current = rail
    return () => {
      rail.destroy()
      rail.element.remove()
      railRef.current = null
    }
    // Re-create only on structural option changes; item updates are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollRef, position, activationOffset, className])

  // Re-sync stops when the items change, without tearing down the rail.
  useEffect(() => {
    const scroll = scrollRef.current
    if (railRef.current && scroll) railRef.current.setItems(resolveItems(items, scroll))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items])

  return <div ref={hostRef} style={{ display: 'contents' }} />
}

export interface UseActiveStopOptions {
  scrollRef: RefObject<HTMLElement | null>
  items: ReactScrollRailItem[]
  activationOffset?: number
}

/**
 * Headless: track which stop is active as the container scrolls, returning its id (or null).
 * The shadcn `useMessageScrollerVisibility` parallel — bring your own UI.
 */
export function useActiveStop({ scrollRef, items, activationOffset }: UseActiveStopOptions): string | null {
  const [activeId, setActiveId] = useState<string | null>(null)
  useEffect(() => {
    const scroll = scrollRef.current
    if (!scroll) return
    const obs = observeActive({
      scrollContainer: scroll,
      items: resolveItems(items, scroll),
      activationOffset,
      onActiveChange: setActiveId,
    })
    return () => obs.destroy()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollRef, items, activationOffset])
  return activeId
}
