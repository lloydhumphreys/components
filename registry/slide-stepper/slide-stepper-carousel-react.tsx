'use client'

// slide-stepper-carousel-react — the zero-wiring React carousel.
//
// Not a mount of the vanilla createSlideStepperCarousel: that takes HTMLElement slides, and
// React content is ReactNode. Instead this is the same composition rebuilt React-side —
// useSlideStepper for the engine, <SlideStepper engine> for the pill, JSX for the
// grid-stacked crossfade viewport — while the gesture and auto-pause modules and the CSS
// class names are imported from the vanilla files, so both carousels look and behave
// identically.

import { useEffect, useId, useRef } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import {
  attachAutoPause,
  attachSwipeNav,
  injectCarouselStyles,
  type PauseReason,
  type SlideStepperLabels,
  type StepChangeReason,
} from './slide-stepper-carousel'
import { SlideStepper, useSlideStepper } from './slide-stepper-react'

interface SlideStepperCarouselProps {
  /** The slides: an array of nodes, or a factory for lazy content — the factory is rendered
   *  only for slides that have come within one step of being shown (then kept mounted, so an
   *  outgoing slide never blanks mid-crossfade). */
  slides: ReactNode[] | ((index: number) => ReactNode)
  /** Required when `slides` is a factory; ignored (the array length wins) otherwise. */
  count?: number
  duration?: number
  durations?: number[] | Record<number, number>
  loop?: boolean
  startPaused?: boolean
  /** Initial slide — an uncontrolled starting point, not a controlled value; drive jumps
   *  through the engine's goTo instead. */
  index?: number
  onChange?: (index: number, prevIndex: number, reason: StepChangeReason) => void
  onComplete?: (index: number) => void
  onPauseChange?: (paused: boolean, reasons: PauseReason[]) => void
  orientation?: 'horizontal' | 'vertical'
  clip?: number
  showPause?: boolean
  size?: 'sm' | 'md' | 'lg'
  labels?: SlideStepperLabels
  /** Crossfade duration in ms. Default 300 (also settable via --stepper-crossfade-ms). */
  transitionMs?: number
  /** Where the pill sits. Default 'bottom' for a horizontal pill, 'right' for vertical. */
  pillPosition?: 'top' | 'bottom' | 'left' | 'right'
  /** Swipe on the slide area for prev/next. Default true. */
  swipe?: boolean
  pauseOnHover?: boolean
  pauseWhenHidden?: boolean
  pauseWhenOffscreen?: boolean
  offscreenThreshold?: number
  /** Hold a 'focus' pause while focus is inside the carousel (WCAG 2.2.2). Default true. */
  pauseOnFocusWithin?: boolean
  className?: string
}

/** The full carousel: viewport + pill sharing one engine, no wiring required. */
function SlideStepperCarousel({
  slides,
  count: countProp,
  duration,
  durations,
  loop,
  startPaused,
  index: initialIndex,
  onChange,
  onComplete,
  onPauseChange,
  orientation = 'horizontal',
  clip,
  showPause,
  size,
  labels,
  transitionMs,
  pillPosition,
  swipe,
  pauseOnHover,
  pauseWhenHidden,
  pauseWhenOffscreen,
  offscreenThreshold,
  pauseOnFocusWithin,
  className,
}: SlideStepperCarouselProps) {
  const lazy = typeof slides === 'function'
  const count = lazy ? Math.max(1, Math.floor(countProp ?? 1)) : slides.length
  if (!lazy && count === 0) {
    throw new Error('SlideStepperCarousel: `slides` must contain at least one slide')
  }
  const stepper = useSlideStepper({ count, duration, durations, loop, startPaused, index: initialIndex, onChange, onComplete, onPauseChange })
  const { engine, index } = stepper

  const rootRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const slideRefs = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    injectCarouselStyles()
  }, [])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport || swipe === false) return
    return attachSwipeNav(viewport, {
      axis: orientation === 'vertical' ? 'y' : 'x',
      onSwipe: (d) => (d > 0 ? engine.next() : engine.prev()),
      onGestureStart: () => engine.pause('gesture'),
      onGestureEnd: () => engine.resume('gesture'),
    })
  }, [engine, orientation, swipe])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    return attachAutoPause(root, engine, {
      hover: pauseOnHover,
      hidden: pauseWhenHidden,
      offscreen: pauseWhenOffscreen,
      offscreenThreshold,
    })
  }, [engine, pauseOnHover, pauseWhenHidden, pauseWhenOffscreen, offscreenThreshold])

  // Keyboard/AT users can't hover-pause; holding focus anywhere inside pauses instead.
  useEffect(() => {
    const root = rootRef.current
    if (!root || pauseOnFocusWithin === false) return
    const onIn = () => engine.pause('focus')
    const onOut = (e: FocusEvent) => {
      if (!root.contains(e.relatedTarget as Node | null)) engine.resume('focus')
    }
    root.addEventListener('focusin', onIn)
    root.addEventListener('focusout', onOut)
    return () => {
      root.removeEventListener('focusin', onIn)
      root.removeEventListener('focusout', onOut)
      engine.resume('focus')
    }
  }, [engine, pauseOnFocusWithin])

  // `inert` via attribute (the React prop needs React 19); blocks focus/AT into off-slides.
  useEffect(() => {
    slideRefs.current.forEach((el, i) => el?.toggleAttribute('inert', i !== index))
  }, [index, count])

  // Lazy slides render once they've come within one step of showing, then stay mounted —
  // jumping far away must not blank the *outgoing* slide mid-crossfade.
  const seen = useRef(new Set<number>())
  if (lazy) {
    const wraps = loop ?? true
    seen.current.add(index)
    seen.current.add(index + 1 < count ? index + 1 : wraps ? 0 : index)
    seen.current.add(index - 1 >= 0 ? index - 1 : wraps ? count - 1 : index)
  }

  const uid = useId()
  const ids = Array.from({ length: count }, (_, i) => `slide-stepper-${uid}-slide-${i + 1}`)
  const position = pillPosition ?? (orientation === 'vertical' ? 'right' : 'bottom')

  return (
    <div
      ref={rootRef}
      role="region"
      aria-roledescription="carousel"
      aria-label={labels?.root ?? 'Slides'}
      className={`slide-stepper-carousel slide-stepper-carousel--pill-${position}${
        orientation === 'vertical' ? ' slide-stepper-carousel--swipe-y' : ''
      }${className ? ` ${className}` : ''}`}
      style={transitionMs !== undefined ? ({ '--stepper-crossfade-ms': `${transitionMs}ms` } as CSSProperties) : undefined}
    >
      <div ref={viewportRef} className="slide-stepper-carousel-viewport">
        {Array.from({ length: count }, (_, i) => (
          <div
            key={i}
            id={ids[i]}
            ref={(el) => {
              slideRefs.current[i] = el
            }}
            role="group"
            aria-roledescription="slide"
            aria-label={labels?.slide?.(i, count) ?? `Slide ${i + 1} of ${count}`}
            aria-hidden={i === index ? undefined : true}
            className={`slide-stepper-carousel-slide${i === index ? ' is-active' : ''}`}
          >
            {lazy ? (seen.current.has(i) ? (slides as (index: number) => ReactNode)(i) : null) : (slides as ReactNode[])[i]}
          </div>
        ))}
      </div>
      <SlideStepper
        engine={engine}
        orientation={orientation}
        clip={clip}
        showPause={showPause}
        size={size}
        labels={labels}
        slideIds={ids}
        pauseOnHover={false}
        pauseWhenHidden={false}
        pauseWhenOffscreen={false}
      />
    </div>
  )
}

export { SlideStepperCarousel, type SlideStepperCarouselProps }
