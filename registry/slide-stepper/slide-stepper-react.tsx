// slide-stepper-react — a thin React wrapper over the framework-agnostic slide-stepper core.
//
//   useSlideStepper({ count: 10 })            headless: engine + live state, no DOM
//   <SlideStepper engine={stepper.engine} />  the pill, driven by that engine
//   <SlideStepper count={10} />               or self-managed, if you only need the pill
//
// The hook owns the engine (one timer, one source of truth); the pill mounts the vanilla
// control and shares it. Key your own slide content off the hook's `index` and both stay in
// sync by construction. The zero-wiring <SlideStepperCarousel> lives in
// slide-stepper-carousel-react.tsx.
//
// State ownership: `index` is an uncontrolled starting point, not a controlled prop — the
// engine owns navigation, since timing/progress is ephemeral UI state that a controlled
// value would fight on every render. Drive jumps through the returned engine instead.

'use client'

import { useEffect, useRef, useState } from 'react'
import {
  createSlideStepper,
  createStepperEngine,
  type PauseReason,
  type SlideStepper as VanillaSlideStepper,
  type SlideStepperLabels,
  type StepChangeReason,
  type StepperEngine,
  type StepperEngineOptions,
  type StepperEngineState,
} from './slide-stepper'

interface UseSlideStepperOptions extends StepperEngineOptions {}

interface UseSlideStepperReturn extends StepperEngineState {
  /** Hand this to <SlideStepper engine={…}> (and anything else) to share the one timer. */
  engine: StepperEngine
  next: () => void
  prev: () => void
  goTo: (index: number) => void
  /** User pause/resume — the 'user' reason, the same one the pill's button toggles. */
  pause: () => void
  resume: () => void
  toggle: () => void
}

/**
 * Headless: an engine plus its live state as React state. Callbacks are read through a ref,
 * so inline closures are fine; count/duration/durations/loop patch into the running engine
 * without restarting the current slide (keep `durations` referentially stable — memoize it).
 */
function useSlideStepper(opts: UseSlideStepperOptions): UseSlideStepperReturn {
  const cb = useRef({ onChange: opts.onChange, onComplete: opts.onComplete, onPauseChange: opts.onPauseChange })
  cb.current.onChange = opts.onChange
  cb.current.onComplete = opts.onComplete
  cb.current.onPauseChange = opts.onPauseChange

  const [engine] = useState(() =>
    createStepperEngine({
      count: opts.count,
      duration: opts.duration,
      durations: opts.durations,
      loop: opts.loop,
      startPaused: opts.startPaused,
      index: opts.index,
      onChange: (i, p, r) => cb.current.onChange?.(i, p, r),
      onComplete: (i) => cb.current.onComplete?.(i),
      onPauseChange: (p, r) => cb.current.onPauseChange?.(p, r),
    }),
  )
  const [state, setState] = useState<StepperEngineState>(() => engine.getState())

  useEffect(() => {
    const unsubscribe = engine.subscribe(setState)
    // Construction is side-effect-free; start only after mount. Idempotence lets a shared
    // pill call start too, and re-arms after the StrictMode cleanup below.
    engine.start()
    return () => {
      unsubscribe()
      engine.destroy()
    }
  }, [engine])

  useEffect(() => {
    engine.setOptions({ count: opts.count, duration: opts.duration, durations: opts.durations, loop: opts.loop })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, opts.count, opts.duration, opts.durations, opts.loop])

  return {
    engine,
    ...state,
    next: engine.next,
    prev: engine.prev,
    goTo: (i) => engine.goTo(i),
    pause: () => engine.pause('user'),
    resume: () => engine.resume('user'),
    toggle: engine.toggleUserPause,
  }
}

interface SlideStepperProps {
  /** Share the engine from useSlideStepper. When set, the engine props below (count,
   *  duration(s), loop, startPaused, index, callbacks) are ignored — the hook owns them. */
  engine?: StepperEngine
  /** Engine options, for the self-managed case (no `engine` prop). */
  count?: number
  duration?: number
  durations?: number[] | Record<number, number>
  loop?: boolean
  startPaused?: boolean
  /** Initial slide (self-managed only) — this is an uncontrolled starting point, not a
   *  controlled value; drive jumps through the hook/engine instead. */
  index?: number
  onChange?: (index: number, prevIndex: number, reason: StepChangeReason) => void
  onComplete?: (index: number) => void
  onPauseChange?: (paused: boolean, reasons: PauseReason[]) => void
  /** Presentation — see SlideStepperOptions in slide-stepper.ts for details. */
  orientation?: 'horizontal' | 'vertical'
  clip?: number
  showPause?: boolean
  pauseOnHover?: boolean
  pauseWhenHidden?: boolean
  pauseWhenOffscreen?: boolean
  offscreenThreshold?: number
  size?: 'sm' | 'md' | 'lg'
  slideIds?: (string | undefined)[]
  labels?: SlideStepperLabels
  className?: string
}

/**
 * The pill. The returned wrapper is `display: contents`, so it adds no layout box of its
 * own. Re-created only when the engine identity or the auto-pause wiring changes; every
 * other prop syncs into the running control.
 */
function SlideStepper({
  engine,
  count,
  duration,
  durations,
  loop,
  startPaused,
  index,
  onChange,
  onComplete,
  onPauseChange,
  orientation,
  clip,
  showPause,
  pauseOnHover,
  pauseWhenHidden,
  pauseWhenOffscreen,
  offscreenThreshold,
  size,
  slideIds,
  labels,
  className,
}: SlideStepperProps) {
  const hostRef = useRef<HTMLSpanElement>(null)
  const stepperRef = useRef<VanillaSlideStepper | null>(null)
  // Keep the latest callbacks without re-creating the control each render.
  const cb = useRef({ onChange, onComplete, onPauseChange })
  cb.current = { onChange, onComplete, onPauseChange }
  // Initial-only engine options, captured at creation like useState initializers.
  const initial = useRef({ count, duration, durations, loop, startPaused, index, orientation, clip, showPause, size, slideIds, labels, className })
  initial.current = { count, duration, durations, loop, startPaused, index, orientation, clip, showPause, size, slideIds, labels, className }

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const init = initial.current
    const stepper = createSlideStepper({
      engine,
      count: init.count ?? engine?.getState().count ?? 1,
      duration: init.duration,
      durations: init.durations,
      loop: init.loop,
      startPaused: init.startPaused,
      index: init.index,
      onChange: (i, p, r) => cb.current.onChange?.(i, p, r),
      onComplete: (i) => cb.current.onComplete?.(i),
      onPauseChange: (p, r) => cb.current.onPauseChange?.(p, r),
      orientation: init.orientation,
      clip: init.clip,
      showPause: init.showPause,
      pauseOnHover,
      pauseWhenHidden,
      pauseWhenOffscreen,
      offscreenThreshold,
      size: init.size,
      slideIds: init.slideIds,
      labels: init.labels,
      className: init.className,
    })
    host.appendChild(stepper.element)
    stepperRef.current = stepper
    return () => {
      stepper.destroy()
      stepper.element.remove()
      stepperRef.current = null
    }
  }, [engine, pauseOnHover, pauseWhenHidden, pauseWhenOffscreen, offscreenThreshold])

  // Sync presentational (and, when self-managed, engine) options into the live control.
  useEffect(() => {
    stepperRef.current?.setState({ count, duration, durations, loop, orientation, clip, showPause, size, slideIds, labels, className })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, duration, durations, loop, orientation, clip, showPause, size, slideIds, labels, className])

  return <span ref={hostRef} style={{ display: 'contents' }} />
}

export {
  useSlideStepper,
  SlideStepper,
  type UseSlideStepperOptions,
  type UseSlideStepperReturn,
  type SlideStepperProps,
  type PauseReason,
  type SlideStepperLabels,
  type StepChangeReason,
  type StepperEngine,
  type StepperEngineOptions,
  type StepperEngineState,
}
