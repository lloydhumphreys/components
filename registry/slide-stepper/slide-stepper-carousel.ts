// slide-stepper-carousel — the zero-wiring companion to slide-stepper.
//
// A crossfading slide viewport with the pill already wired: one call gives you slides that
// auto-advance, a tape-counter pill, swipe navigation on the slides, and the full
// auto-pause set (hover, tab hidden, offscreen, focus-within) applied across the whole
// carousel rather than just the pill. If you'd rather own the content yourself, skip this
// file: create an engine + pill from slide-stepper.ts and key your UI off engine.subscribe.
//
// Slides stack in a CSS grid (every slide occupies the same cell), so the viewport sizes
// itself to the largest slide and a crossfade is just an opacity/scale class toggle on the
// outgoing and incoming slide in the same tick. Inactive slides stay mounted but inert.
//
// This file re-exports everything from slide-stepper.ts, so it's the one import (and the
// demo bundle's single entry point).

export * from './slide-stepper'

import {
  attachAutoPause,
  attachSwipeNav,
  createSlideStepper,
  createStepperEngine,
  type SlideStepper,
  type SlideStepperOptions,
  type StepperEngine,
  type StepperEngineState,
} from './slide-stepper'

export interface SlideStepperCarouselOptions extends Omit<SlideStepperOptions, 'count' | 'engine' | 'slideIds'> {
  /** The slides: elements you already have, or a factory for lazy content — the factory is
   *  called once per index the first time that slide (or its neighbor, so the crossfade
   *  target is warm) is needed, and cached. */
  slides: HTMLElement[] | ((index: number) => HTMLElement)
  /** Required when `slides` is a factory; ignored (the array length wins) otherwise. */
  count?: number
  /** Crossfade duration in ms. Default 300 (also settable via --stepper-crossfade-ms). */
  transitionMs?: number
  /** Where the pill sits relative to the viewport. Default 'bottom' for a horizontal pill,
   *  'right' for a vertical one. */
  pillPosition?: 'top' | 'bottom' | 'left' | 'right'
  /** Swipe on the slide area for prev/next (axis follows `orientation`). Default true. */
  swipe?: boolean
  /** Hold a 'focus' pause while keyboard focus is anywhere inside the carousel — the
   *  can't-hover equivalent of pause-on-hover (WCAG 2.2.2). Default true. */
  pauseOnFocusWithin?: boolean
}

export interface SlideStepperCarousel {
  /** The carousel root (viewport + pill). Append it anywhere. */
  readonly element: HTMLElement
  /** The pill instance, for presentational setState patches. */
  readonly stepper: SlideStepper
  /** The engine — subscribe to sync anything else you render. */
  readonly engine: StepperEngine
  destroy(): void
}

let carouselUid = 0

/** Build the full carousel: viewport + pill sharing one engine. */
export function createSlideStepperCarousel(opts: SlideStepperCarouselOptions): SlideStepperCarousel {
  const lazy = typeof opts.slides === 'function'
  const count = lazy ? Math.max(1, Math.floor(opts.count ?? 0)) : (opts.slides as HTMLElement[]).length
  if (lazy && !opts.count) throw new Error('slide-stepper-carousel: `count` is required when `slides` is a function')
  if (!lazy && count === 0) throw new Error('slide-stepper-carousel: `slides` must contain at least one slide')
  if (opts.injectStyles !== false) injectCarouselStyles()

  const engine = createStepperEngine({
    count,
    duration: opts.duration,
    durations: opts.durations,
    loop: opts.loop,
    startPaused: opts.startPaused,
    index: opts.index,
    onChange: opts.onChange,
    onComplete: opts.onComplete,
    onPauseChange: opts.onPauseChange,
  })

  const orientation = opts.orientation ?? 'horizontal'
  const pillPosition = opts.pillPosition ?? (orientation === 'vertical' ? 'right' : 'bottom')
  const uid = ++carouselUid

  const root = document.createElement('div')
  root.className = `slide-stepper-carousel slide-stepper-carousel--pill-${pillPosition}${
    orientation === 'vertical' ? ' slide-stepper-carousel--swipe-y' : ''
  }${opts.className ? ` ${opts.className}` : ''}`
  root.setAttribute('role', 'region')
  root.setAttribute('aria-roledescription', 'carousel')
  root.setAttribute('aria-label', opts.labels?.root ?? 'Slides')
  if (opts.transitionMs !== undefined) root.style.setProperty('--stepper-crossfade-ms', `${opts.transitionMs}ms`)

  const viewport = document.createElement('div')
  viewport.className = 'slide-stepper-carousel-viewport'

  const wrappers: HTMLDivElement[] = []
  const materialized = new Set<number>()
  const slideIds: string[] = []
  for (let i = 0; i < count; i++) {
    const wrap = document.createElement('div')
    wrap.className = 'slide-stepper-carousel-slide'
    wrap.id = `slide-stepper-${uid}-slide-${i + 1}`
    wrap.setAttribute('role', 'group')
    wrap.setAttribute('aria-roledescription', 'slide')
    wrap.setAttribute('aria-label', opts.labels?.slide?.(i, count) ?? `Slide ${i + 1} of ${count}`)
    slideIds.push(wrap.id)
    if (!lazy) {
      wrap.appendChild((opts.slides as HTMLElement[])[i])
      materialized.add(i)
    }
    viewport.appendChild(wrap)
    wrappers.push(wrap)
  }

  const materialize = (i: number) => {
    if (i < 0 || i >= count || materialized.has(i)) return
    materialized.add(i)
    wrappers[i].appendChild((opts.slides as (index: number) => HTMLElement)(i))
  }

  const loop = opts.loop ?? true
  const render = (s: StepperEngineState) => {
    if (lazy) {
      // Active slide plus both neighbors (wrapping when looping) — the next crossfade's
      // target is always already in the DOM.
      materialize(s.index)
      materialize(s.index + 1 < count ? s.index + 1 : loop ? 0 : -1)
      materialize(s.index - 1 >= 0 ? s.index - 1 : loop ? count - 1 : -1)
    }
    wrappers.forEach((wrap, i) => {
      const active = i === s.index
      wrap.classList.toggle('is-active', active)
      // Off-slides are invisible but mounted: take them fully out of the interaction and
      // a11y tree. (`inert` also blocks focus into them, where supported.)
      if (active) {
        wrap.removeAttribute('inert')
        wrap.removeAttribute('aria-hidden')
      } else {
        wrap.setAttribute('inert', '')
        wrap.setAttribute('aria-hidden', 'true')
      }
    })
  }

  // The pill shares the engine, and its own auto-pause wiring is disabled — hover, offscreen
  // and hidden are attached to the carousel root below, so they cover the slides too (a pill
  // hover-out while still over the slides must not resume).
  const stepper = createSlideStepper({
    engine,
    count,
    orientation,
    clip: opts.clip,
    showPause: opts.showPause,
    size: opts.size,
    labels: opts.labels,
    slideIds,
    pauseOnHover: false,
    pauseWhenHidden: false,
    pauseWhenOffscreen: false,
    injectStyles: opts.injectStyles,
  })

  root.appendChild(viewport)
  root.appendChild(stepper.element)

  const detachAutoPause = attachAutoPause(root, engine, {
    hover: opts.pauseOnHover,
    hidden: opts.pauseWhenHidden,
    offscreen: opts.pauseWhenOffscreen,
    offscreenThreshold: opts.offscreenThreshold,
  })

  const detachSwipe =
    opts.swipe !== false
      ? attachSwipeNav(viewport, {
          axis: orientation === 'vertical' ? 'y' : 'x',
          onSwipe: (d) => (d > 0 ? engine.next() : engine.prev()),
          onGestureStart: () => engine.pause('gesture'),
          onGestureEnd: () => engine.resume('gesture'),
        })
      : null

  // Keyboard/AT users can't hover-pause; holding focus anywhere inside pauses instead.
  const onFocusIn = () => engine.pause('focus')
  const onFocusOut = (e: FocusEvent) => {
    if (!root.contains(e.relatedTarget as Node | null)) engine.resume('focus')
  }
  if (opts.pauseOnFocusWithin !== false) {
    root.addEventListener('focusin', onFocusIn)
    root.addEventListener('focusout', onFocusOut)
  }

  render(engine.getState())
  const unsubscribe = engine.subscribe(render)

  return {
    element: root,
    stepper,
    engine,
    destroy() {
      unsubscribe()
      detachSwipe?.()
      detachAutoPause()
      root.removeEventListener('focusin', onFocusIn)
      root.removeEventListener('focusout', onFocusOut)
      stepper.destroy()
      engine.destroy()
    },
  }
}

// ── Styles ─────────────────────────────────────────────────────────────────────────────

let carouselStylesInjected = false
/** Inject the carousel stylesheet once. Called automatically unless `injectStyles: false`. */
export function injectCarouselStyles(): void {
  if (carouselStylesInjected || typeof document === 'undefined') return
  if (document.getElementById('slide-stepper-carousel-styles')) {
    carouselStylesInjected = true
    return
  }
  const style = document.createElement('style')
  style.id = 'slide-stepper-carousel-styles'
  style.textContent = carouselStyles()
  document.head.appendChild(style)
  carouselStylesInjected = true
}

/** The carousel's CSS as a string (for callers who inject styles themselves / SSR). */
export function carouselStyles(): string {
  return `
.slide-stepper-carousel { display: flex; flex-direction: column; align-items: center; gap: 16px; }
.slide-stepper-carousel--pill-top { flex-direction: column-reverse; }
.slide-stepper-carousel--pill-right { flex-direction: row; }
.slide-stepper-carousel--pill-left { flex-direction: row-reverse; }
.slide-stepper-carousel-viewport {
  display: grid;
  /* Horizontal drags are the swipe; vertical scrolling stays with the page (flipped for a
     vertical deck). */
  touch-action: pan-y;
}
.slide-stepper-carousel--swipe-y .slide-stepper-carousel-viewport { touch-action: pan-x; }
.slide-stepper-carousel-slide {
  /* Every slide occupies the same grid cell: the viewport sizes to the largest slide and a
     crossfade needs no positioning at all. */
  grid-area: 1 / 1;
  opacity: 0;
  transform: scale(var(--stepper-crossfade-scale, 0.98));
  pointer-events: none;
  transition: opacity var(--stepper-crossfade-ms, 300ms) ease, transform var(--stepper-crossfade-ms, 300ms) ease;
}
.slide-stepper-carousel-slide.is-active { opacity: 1; transform: none; pointer-events: auto; }
@media (prefers-reduced-motion: reduce) {
  .slide-stepper-carousel-slide { transition: none !important; }
}
`
}
