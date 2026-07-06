// scroll-rail — a zero-dependency scroll-position navigation rail.
//
// A compact column of ticks pinned to one edge of a scroll container, one tick per "stop".
// The tick for the stop you're at is highlighted; hovering/focusing a tick reveals a
// preview card; clicking a tick smooth-scrolls to it. Modeled on the navigation rail long
// editor/chat threads use for a long document you can't fit an outline beside.
//
// Framework-agnostic vanilla DOM — no dependencies, no build step, works anywhere. A thin
// React wrapper (<ScrollRail> + useActiveStop) lives in scroll-rail-react.tsx.
//
// ── Theming ────────────────────────────────────────────────────────────────────────────
// Styles reference CSS custom properties with sensible fallbacks, so it reads correctly in
// light and dark out of the box: ticks inherit the surrounding text color, and the preview
// card uses the `Canvas`/`CanvasText` system colors. Override any of these on the rail host
// (or any ancestor):
//   --rail-tick          tick color                 (default: currentColor)
//   --rail-accent        active-tick color          (default: #3b82f6)
//   --rail-card-bg       preview card background     (default: Canvas)
//   --rail-card-fg       preview card text          (default: CanvasText)
//   --rail-card-border   preview card border color  (default: 20% of text color)
//   --rail-card-width    preview card width         (default: 234px)
//
// ── Positioning ────────────────────────────────────────────────────────────────────────
// The rail element is `position: absolute`, pinned to the chosen edge and spanning the
// height of its nearest positioned ancestor. Give the element you append it into (usually
// the box wrapping your scroll container) `position: relative`.

/** One stop on the rail. */
export interface ScrollRailItem {
  /** Stable identity — reported by onActiveChange. */
  id: string
  /** The element this stop tracks (for active state) and scrolls to on click. */
  target: HTMLElement
  /** Accessible label + preview-card title. */
  label: string
  /** 1-based depth (1–4); controls tick length. Default 1. */
  level?: number
  /** Optional preview-card body. A string, or your own node (cloned on show). */
  preview?: string | Node
  /** Optional per-node color (any CSS color) — color-code individual ticks by category,
   *  status, persona, etc. Overrides `--rail-tick`; a colored tick keeps its color when
   *  active (instead of falling back to `--rail-accent`). */
  color?: string
}

/** Shared options for the active-stop tracker. */
export interface ObserveActiveOptions {
  /** The scrolling element the stops live inside. */
  scrollContainer: HTMLElement
  items: ScrollRailItem[]
  /** A stop is active once its top is within this many px of the container top. Default 96. */
  activationOffset?: number
  onActiveChange: (id: string | null) => void
}

export interface ActiveObserver {
  /** Recompute now (e.g. after a layout change you know about). */
  refresh(): void
  setItems(items: ScrollRailItem[]): void
  getActiveId(): string | null
  destroy(): void
}

/**
 * Headless active-stop tracker (no DOM of its own). The active stop is the last one whose
 * top has scrolled to within `activationOffset` px of the container top; before the first
 * crosses, the first stop is active. This is the engine behind both the vanilla rail and
 * the React `useActiveStop` hook.
 */
export function observeActive(opts: ObserveActiveOptions): ActiveObserver {
  const activationOffset = opts.activationOffset ?? 96
  let items = opts.items
  let activeId: string | null = null

  const compute = (): string | null => {
    if (!items.length) return null
    const top = opts.scrollContainer.getBoundingClientRect().top
    let idx = 0
    items.forEach((it, i) => {
      if (it.target.getBoundingClientRect().top - top <= activationOffset) idx = i
    })
    return items[idx]?.id ?? null
  }

  const refresh = () => {
    const next = compute()
    if (next !== activeId) {
      activeId = next
      opts.onActiveChange(activeId)
    }
  }

  const onScroll = () => refresh()
  opts.scrollContainer.addEventListener('scroll', onScroll, { passive: true })
  refresh()
  // Run once more after layout: the first synchronous pass can happen while the targets are
  // still detached / unlaid-out (every rect reads 0, which would otherwise pin the *last*
  // stop active until the first scroll).
  const raf = typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame(refresh) : 0

  return {
    refresh,
    setItems(next) { items = next; refresh() },
    getActiveId: () => activeId,
    destroy() {
      opts.scrollContainer.removeEventListener('scroll', onScroll)
      if (raf && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(raf)
    },
  }
}

export interface ScrollRailOptions extends Omit<ObserveActiveOptions, 'onActiveChange'> {
  /** Which edge to pin to. Default 'right'. */
  position?: 'left' | 'right'
  /** Called whenever the active stop changes — e.g. to sync a separate table-of-contents. */
  onActiveChange?: (id: string | null) => void
  /** Inject the component stylesheet on first use. Default true; set false to ship the CSS
   *  yourself (see `railStyles()`). */
  injectStyles?: boolean
  /** Extra class(es) added to the rail root, for your own overrides. */
  className?: string
}

export interface ScrollRail {
  /** The rail root. Append it into a `position: relative` box (usually the one wrapping
   *  your scroll container). */
  readonly element: HTMLElement
  getActiveId(): string | null
  /** Replace the stops (e.g. after the content changes). */
  setItems(items: ScrollRailItem[]): void
  refresh(): void
  /** Detach listeners. Call before dropping the element; then `element.remove()`. */
  destroy(): void
}

/** Build a scroll-position rail. Append `.element` into a positioned box near your scroller. */
export function createScrollRail(opts: ScrollRailOptions): ScrollRail {
  const position = opts.position ?? 'right'
  if (opts.injectStyles !== false) injectRailStyles()

  const nav = document.createElement('nav')
  nav.className = `scroll-rail scroll-rail--${position}${opts.className ? ` ${opts.className}` : ''}`
  nav.setAttribute('aria-label', 'Scroll navigation')

  const track = document.createElement('div')
  track.className = 'scroll-rail-track'

  const card = document.createElement('div')
  card.className = 'scroll-rail-card'
  const cardTitle = document.createElement('div')
  cardTitle.className = 'scroll-rail-card-title'
  const cardBody = document.createElement('div')
  cardBody.className = 'scroll-rail-card-preview'
  // appendChild (Node), not append: some setups (e.g. Cloudflare Worker types) shadow the
  // ParentNode.append overload — appendChild is universal and avoids that.
  card.appendChild(cardTitle)
  card.appendChild(cardBody)

  nav.appendChild(track)
  nav.appendChild(card)

  let items: ScrollRailItem[] = []
  let ticks: HTMLButtonElement[] = []

  let emphTimer: ReturnType<typeof setTimeout> | undefined
  const emphasize = () => {
    nav.classList.add('is-emphasised')
    if (emphTimer) clearTimeout(emphTimer)
    emphTimer = setTimeout(() => nav.classList.remove('is-emphasised'), 1400)
  }
  // Drop the emphasis right away (rather than letting the 1400ms timer run out) — used when
  // the pointer leaves the rail, so it dims as soon as you stop hovering.
  const calm = () => {
    if (emphTimer) clearTimeout(emphTimer)
    nav.classList.remove('is-emphasised')
  }

  const showCard = (i: number) => {
    const it = items[i]
    if (!it) return
    cardTitle.textContent = it.label
    cardBody.replaceChildren()
    if (it.preview instanceof Node) {
      cardBody.appendChild(it.preview.cloneNode(true))
      cardBody.style.display = ''
    } else if (it.preview) {
      cardBody.textContent = it.preview
      cardBody.style.display = ''
    } else {
      cardBody.style.display = 'none'
    }
    const navTop = nav.getBoundingClientRect().top
    const r = ticks[i].getBoundingClientRect()
    const top = `${r.top + r.height / 2 - navTop}px`
    if (card.classList.contains('is-visible')) {
      // Already showing: let `top` transition so the card glides to the new tick.
      card.style.top = top
    } else {
      // Fresh appearance: jump to position (fade in), don't slide from the last spot.
      card.style.transition = 'none'
      card.style.top = top
      void card.offsetHeight // flush the jump before re-enabling transitions
      card.style.transition = ''
      card.classList.add('is-visible')
    }
    emphasize()
  }
  const hideCard = () => card.classList.remove('is-visible')

  // Hover is driven by the whole rail strip, not the individual 2px ticks: pointing
  // anywhere in the rail engages the *nearest* tick (so the gaps between ticks no longer
  // drop the hover), and the preview card glides between ticks instead of blinking off and
  // on. `hoveredIndex` is the currently engaged tick (-1 for none).
  let hoveredIndex = -1
  let lastPointer: { x: number; y: number } | null = null
  const setHovered = (i: number) => {
    if (i === hoveredIndex) return
    if (hoveredIndex >= 0) ticks[hoveredIndex]?.classList.remove('is-hovered')
    hoveredIndex = i
    nav.classList.toggle('is-hover', i >= 0)
    if (i >= 0) {
      ticks[i]?.classList.add('is-hovered')
      showCard(i)
    } else {
      hideCard()
      calm()
    }
  }
  const nearestTick = (clientY: number): number => {
    let best = -1
    let bestDist = Infinity
    for (let i = 0; i < ticks.length; i++) {
      const r = ticks[i].getBoundingClientRect()
      const d = Math.abs(clientY - (r.top + r.height / 2))
      if (d < bestDist) { bestDist = d; best = i }
    }
    return best
  }
  const onPointerMove = (e: PointerEvent) => {
    lastPointer = { x: e.clientX, y: e.clientY }
    if (ticks.length) setHovered(nearestTick(e.clientY))
  }
  const onPointerLeave = () => { lastPointer = null; setHovered(-1) }
  // A scroll can move the rail out from under a stationary cursor (the page scrolling while
  // the pointer rests on the rail). No pointer event fires for that, so hover state would
  // strand until the next real mouse move — re-check the last known pointer position against
  // the rail's current rect whenever anything scrolls.
  const revalidateHover = () => {
    if (!lastPointer) return
    const r = nav.getBoundingClientRect()
    const inside = lastPointer.x >= r.left && lastPointer.x <= r.right
      && lastPointer.y >= r.top && lastPointer.y <= r.bottom
    if (!inside) { lastPointer = null; setHovered(-1) }
    else if (ticks.length) setHovered(nearestTick(lastPointer.y))
  }
  // Keyboard: focusing a tick engages it; clear only when focus leaves the rail entirely
  // (so Tabbing between ticks doesn't flicker the card).
  const onFocusOut = (e: FocusEvent) => {
    if (!nav.contains(e.relatedTarget as Node | null)) setHovered(-1)
  }
  // Navigate to a stop. Scrolls only the configured container — scrollIntoView would also
  // scroll every other scrollable ancestor (the page itself lurches, and the rail slides out
  // from under the cursor). Respects the target's scroll-margin-top like scrollIntoView does.
  const go = (i: number) => {
    const it = items[i]
    if (!it) return
    const c = opts.scrollContainer
    const margin = parseFloat(getComputedStyle(it.target).scrollMarginTop) || 0
    const top = it.target.getBoundingClientRect().top - c.getBoundingClientRect().top + c.scrollTop - margin
    c.scrollTo({ top, behavior: 'smooth' })
    emphasize()
  }
  // A click anywhere in the rail navigates to the nearest tick — clicking the gaps works
  // like clicking the ticks. Clicks that land on a tick are left to its own handler (which
  // also covers keyboard activation, where there's no meaningful cursor position).
  const onClick = (e: MouseEvent) => {
    if ((e.target as Element | null)?.closest('.scroll-rail-tick')) return
    const i = nearestTick(e.clientY)
    if (i >= 0) go(i)
  }
  nav.addEventListener('pointermove', onPointerMove)
  nav.addEventListener('pointerleave', onPointerLeave)
  nav.addEventListener('focusout', onFocusOut)
  nav.addEventListener('click', onClick)

  const paintActive = (id: string | null) => {
    ticks.forEach((t, i) => t.classList.toggle('is-active', items[i]?.id === id))
  }

  const observer = observeActive({
    scrollContainer: opts.scrollContainer,
    items: opts.items,
    activationOffset: opts.activationOffset,
    onActiveChange: (id) => { paintActive(id); opts.onActiveChange?.(id); emphasize() },
  })

  // Brighten the rail on scroll too (then fade) — a subtle "wake on scroll" cue.
  const onScroll = () => emphasize()
  opts.scrollContainer.addEventListener('scroll', onScroll, { passive: true })
  // Capture-phase so it fires for any scroller (the page, the container, anything between).
  document.addEventListener('scroll', revalidateHover, { capture: true, passive: true })

  const buildTicks = () => {
    track.replaceChildren()
    ticks = items.map((it, i) => {
      const tick = document.createElement('button')
      tick.type = 'button'
      tick.className = 'scroll-rail-tick'
      tick.dataset.level = String(Math.min(Math.max(it.level ?? 1, 1), 4))
      tick.setAttribute('aria-label', it.label)
      if (it.color) tick.style.setProperty('--tick', it.color)
      tick.addEventListener('click', () => go(i))
      // Mouse hover is handled at the rail level (pointermove → nearest tick); focus is the
      // keyboard path.
      tick.addEventListener('focus', () => setHovered(i))
      track.appendChild(tick)
      return tick
    })
  }

  const setItems = (next: ScrollRailItem[]) => {
    items = next
    hoveredIndex = -1
    hideCard()
    buildTicks()
    observer.setItems(next)
    paintActive(observer.getActiveId())
  }
  setItems(opts.items)

  return {
    element: nav,
    getActiveId: () => observer.getActiveId(),
    setItems,
    refresh: () => { observer.refresh(); paintActive(observer.getActiveId()) },
    destroy() {
      observer.destroy()
      opts.scrollContainer.removeEventListener('scroll', onScroll)
      document.removeEventListener('scroll', revalidateHover, { capture: true })
      nav.removeEventListener('pointermove', onPointerMove)
      nav.removeEventListener('pointerleave', onPointerLeave)
      nav.removeEventListener('focusout', onFocusOut)
      nav.removeEventListener('click', onClick)
      if (emphTimer) clearTimeout(emphTimer)
    },
  }
}

// ── Heading adapter ──────────────────────────────────────────────────────────────────
// The common case: turn the headings inside a container into rail stops. `headingItems`
// queries + assigns slug ids; `itemsFromHeadings` maps an array you already have.

export interface HeadingItemsOptions {
  /** Which headings to include. Default 'h1, h2, h3'. */
  selector?: string
  /** A selector to skip (e.g. a doc-title heading). */
  exclude?: string
  /** Max characters of preview text pulled from each section. Default 150. */
  previewChars?: number
  /** Assign a slug id to headings missing one (needed for scroll targets + #links). Default true. */
  assignIds?: boolean
}

/** Rail stops from the headings currently inside `container`. */
export function headingItems(container: HTMLElement, opts: HeadingItemsOptions = {}): ScrollRailItem[] {
  const selector = opts.selector ?? 'h1, h2, h3'
  const all = [...container.querySelectorAll<HTMLElement>(selector)]
  const heads = opts.exclude ? all.filter((h) => !h.matches(opts.exclude!)) : all
  return itemsFromHeadings(heads, opts)
}

/** Rail stops from an array of heading elements you already hold. */
export function itemsFromHeadings(headings: HTMLElement[], opts: HeadingItemsOptions = {}): ScrollRailItem[] {
  const previewChars = opts.previewChars ?? 150
  const assignIds = opts.assignIds ?? true
  const used = new Set<string>()
  headings.forEach((h) => { if (h.id) used.add(h.id) })
  return headings.map((h) => {
    if (assignIds && !h.id) {
      const base = slugify(h.textContent ?? '')
      let id = base
      let n = 2
      while (used.has(id)) { id = `${base}-${n}`; n += 1 }
      used.add(id)
      h.id = id
    }
    const level = Number(h.tagName.slice(1)) || 1
    return { id: h.id, target: h, label: h.textContent ?? '', level, preview: sectionPreview(h, previewChars) }
  })
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'section'
}

/** A short plain-text snippet of the prose following a heading, up to the next heading. */
function sectionPreview(heading: HTMLElement, max: number): string {
  const parts: string[] = []
  let node = heading.nextElementSibling
  while (node && !/^H[1-6]$/.test(node.tagName)) {
    const t = node.textContent?.trim()
    if (t) parts.push(t)
    if (parts.join(' ').length >= max + 10) break
    node = node.nextElementSibling
  }
  const text = parts.join(' ').replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text
}

// ── Styles ───────────────────────────────────────────────────────────────────────────

let stylesInjected = false
/** Inject the rail stylesheet once. Called automatically unless `injectStyles: false`. */
export function injectRailStyles(): void {
  if (stylesInjected || typeof document === 'undefined') return
  if (document.getElementById('scroll-rail-styles')) { stylesInjected = true; return }
  const style = document.createElement('style')
  style.id = 'scroll-rail-styles'
  style.textContent = railStyles()
  document.head.appendChild(style)
  stylesInjected = true
}

/** The component's CSS as a string (for callers who inject styles themselves / SSR). */
export function railStyles(): string {
  return `
.scroll-rail {
  position: absolute; top: 0; bottom: 0; z-index: 5;
  display: flex; align-items: center;
  color: var(--rail-tick, currentColor);
  opacity: 0.5; transition: opacity 0.25s ease;
  /* The whole strip is interactive (pointer picks the nearest tick), so the hand cursor
     and navigation apply across it — not just on the 2px ticks. */
  cursor: pointer;
}
/* Brightening is driven by the .is-hover class (set from pointer events + revalidated on
   scroll) rather than :hover — Safari leaves :hover stuck when the page scrolls the rail
   out from under a stationary cursor. */
.scroll-rail.is-hover, .scroll-rail.is-emphasised { opacity: 1; }
.scroll-rail--right { right: 0; }
.scroll-rail--left { left: 0; }
.scroll-rail-track {
  display: flex; flex-direction: column; justify-content: center;
  gap: 7px; max-height: 100%; padding: 12px 10px;
}
.scroll-rail--right .scroll-rail-track { align-items: flex-end; }
.scroll-rail--left .scroll-rail-track { align-items: flex-start; }
.scroll-rail-tick {
  appearance: none; -webkit-appearance: none; border: 0; margin: 0; padding: 0;
  cursor: pointer; height: 2px; width: 18px; border-radius: 2px;
  /* Buttons don't inherit color by default, so inherit it explicitly — that's what makes
     currentColor (and thus --rail-tick) actually reach the ticks. */
  color: inherit;
  /* --tick is an optional per-node color (set inline); falls back to the shared tick color. */
  background: var(--tick, currentColor); opacity: 0.55;
  transition: width 0.22s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.22s ease, background-color 0.22s ease;
}
.scroll-rail-tick[data-level="2"] { width: 12px; }
.scroll-rail-tick[data-level="3"] { width: 8px; }
.scroll-rail-tick[data-level="4"] { width: 6px; }
/* .is-hovered is set (via pointermove) on the tick nearest the cursor anywhere in the rail,
   so hover doesn't drop out in the gaps between ticks. Tick :hover is deliberately unused —
   .is-hovered covers it and, unlike :hover, can't strand on scroll-under-cursor. */
.scroll-rail-tick:focus-visible, .scroll-rail-tick.is-hovered {
  width: 24px; opacity: 1; outline: none;
}
/* A colored node keeps its own color when active; uncolored ones use the accent. */
.scroll-rail-tick.is-active { width: 24px; opacity: 1; background: var(--tick, var(--rail-accent, #3b82f6)); }
.scroll-rail-card {
  position: absolute; z-index: 10; box-sizing: border-box;
  width: var(--rail-card-width, 234px); max-width: var(--rail-card-width, 234px);
  background: var(--rail-card-bg, Canvas); color: var(--rail-card-fg, CanvasText);
  border: 1px solid var(--rail-card-border, color-mix(in srgb, currentColor 20%, transparent));
  border-radius: 10px; padding: 9px 12px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.22);
  opacity: 0; pointer-events: none;
  /* top transitions so the card glides between ticks as the nearest one changes. */
  transition: opacity 0.16s ease, transform 0.16s ease, top 0.22s cubic-bezier(0.22, 1, 0.36, 1);
}
.scroll-rail--right .scroll-rail-card { right: calc(100% + 8px); transform: translateY(-50%) translateX(4px); }
.scroll-rail--left .scroll-rail-card { left: calc(100% + 8px); transform: translateY(-50%) translateX(-4px); }
.scroll-rail-card.is-visible { opacity: 1; transform: translateY(-50%) translateX(0); }
.scroll-rail-card-title { font-weight: 600; font-size: 13px; line-height: 1.4; }
.scroll-rail-card-preview {
  margin-top: 3px; font-size: 12px; line-height: 1.5; opacity: 0.7;
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
}
`
}
