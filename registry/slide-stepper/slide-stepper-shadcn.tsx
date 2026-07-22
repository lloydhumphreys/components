// slide-stepper-shadcn — the auto-advancing slide stepper composed shadcn-natively.
//
// Same model as the vanilla `slide-stepper` (a headless engine with composable
// pause-reasons; a pill of dots whose active dot stretches into a filling bar; a
// crossfading carousel on top), but built from your app's actual pieces: Tailwind theme
// tokens for every color, `cn` for classes, shadcn's <Button> as the pause circle, lucide
// icons. Inside a shadcn app it matches your theme untouched.
//
//   const stepper = useSlideStepper({ count: 10 })   headless — bring your own content
//   <SlideStepper engine={stepper.engine} clip={5} />
//   <SlideStepperCarousel slides={[...]} />          zero wiring
//
// Self-contained on purpose: the engine is inlined rather than imported from the vanilla
// core, so this file installs alone (plus shadcn's button, pulled in as a
// registryDependency). See slide-stepper.ts for the annotated reference implementation —
// the timer semantics here are identical: JS setTimeout is the authoritative clock, CSS
// transitions only display progress, and pausing is a set of reasons so a user pause
// survives a hover-out.
//
// State ownership: `index` is an uncontrolled starting point, not a controlled prop — the
// engine owns navigation, since timing/progress is ephemeral UI state that a controlled
// value would fight on every render. Drive jumps through the returned engine instead.

'use client'

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, ReactNode, RefObject } from 'react'
import { PauseIcon, PlayIcon, RotateCcwIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// ── Engine ─────────────────────────────────────────────────────────────────────────────

type PauseReason = 'user' | 'hover' | 'hidden' | 'offscreen' | 'gesture' | 'focus'
type StepChangeReason = 'advance' | 'next' | 'prev' | 'goto' | 'loop'

interface StepperEngineOptions {
  /** How many slides. Required; clamped to >= 1. */
  count: number
  /** Default per-slide duration in ms. Default 5000. */
  duration?: number
  /** Sparse per-slide overrides by index (array with holes, or a record like `{ 2: 8000 }`). */
  durations?: number[] | Record<number, number>
  /** Wrap after the last slide. Default true; with loop off the deck stops (`done`) and the
   *  pause button becomes Replay. */
  loop?: boolean
  /** Start with a 'user' pause already applied. */
  startPaused?: boolean
  index?: number
  onChange?: (index: number, prevIndex: number, reason: StepChangeReason) => void
  onComplete?: (index: number) => void
  onPauseChange?: (paused: boolean, reasons: PauseReason[]) => void
}

interface StepperEngineState {
  index: number
  count: number
  /** 0..1 through the current slide, computed on demand — never ticked. */
  progress: number
  paused: boolean
  pauseReasons: PauseReason[]
  done: boolean
}

interface StepperEngine {
  getState(): StepperEngineState
  durationFor(index: number): number
  /** Start auto-advance. Idempotent; safe to call from every mounted consumer. */
  start(): void
  subscribe(fn: (state: StepperEngineState) => void): () => void
  next(): void
  prev(): void
  /** Jump to a slide. Restarts that slide's progress unless `restart: false`. */
  goTo(index: number, opts?: { restart?: boolean }): void
  pause(reason?: PauseReason): void
  resume(reason?: PauseReason): void
  toggleUserPause(): void
  isPausedBy(reason: PauseReason): boolean
  setOptions(patch: Partial<Pick<StepperEngineOptions, 'count' | 'duration' | 'durations' | 'loop'>>): void
  destroy(): void
}

const clampIndex = (i: number, count: number) => Math.min(Math.max(Math.floor(i), 0), count - 1)

function createEngine(opts: StepperEngineOptions): StepperEngine {
  let count = Math.max(1, Math.floor(opts.count))
  let duration = opts.duration ?? 5000
  let durations = opts.durations
  let loop = opts.loop ?? true
  let index = clampIndex(opts.index ?? 0, count)
  let done = false
  let elapsed = 0
  let runStart: number | null = null
  let started = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const reasons = new Set<PauseReason>()
  if (opts.startPaused) reasons.add('user')
  const subs = new Set<(s: StepperEngineState) => void>()

  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())
  const durationFor = (i: number): number => {
    const v = durations ? (durations as Record<number, number>)[i] : undefined
    return typeof v === 'number' && v > 0 ? v : duration
  }
  const getProgress = () => {
    if (done) return 1
    const live = runStart != null ? now() - runStart : 0
    return Math.min(1, (elapsed + live) / durationFor(index))
  }
  const getState = (): StepperEngineState => ({
    index, count, progress: getProgress(), paused: reasons.size > 0, pauseReasons: [...reasons], done,
  })
  const notify = () => {
    const s = getState()
    subs.forEach((fn) => fn(s))
  }
  const clearTimer = () => {
    if (timer !== undefined) {
      clearTimeout(timer)
      timer = undefined
    }
  }
  const armTimer = () => {
    clearTimer()
    if (!started || reasons.size > 0 || done) {
      runStart = null
      return
    }
    runStart = now()
    timer = setTimeout(complete, Math.max(0, durationFor(index) - elapsed))
  }
  const complete = () => {
    opts.onComplete?.(index)
    if (index < count - 1) jump(index + 1, 'advance')
    else if (loop) jump(0, 'loop')
    else {
      done = true
      elapsed = durationFor(index)
      clearTimer()
      runStart = null
      notify()
    }
  }
  const jump = (to: number, reason: StepChangeReason) => {
    const prev = index
    index = clampIndex(to, count)
    done = false
    elapsed = 0
    runStart = null
    if (index !== prev) opts.onChange?.(index, prev, reason)
    armTimer()
    notify()
  }
  const pause = (reason: PauseReason = 'user') => {
    if (reasons.has(reason)) return
    const wasRunning = started && reasons.size === 0 && !done
    if (wasRunning && runStart != null) {
      elapsed += now() - runStart
      runStart = null
    }
    reasons.add(reason)
    clearTimer()
    if (wasRunning) opts.onPauseChange?.(true, [...reasons])
    notify()
  }
  const resume = (reason: PauseReason = 'user') => {
    if (!reasons.delete(reason)) return
    if (reasons.size === 0) {
      armTimer()
      if (started) opts.onPauseChange?.(false, [])
    }
    notify()
  }

  return {
    getState,
    durationFor,
    start() {
      if (started) return
      started = true
      armTimer()
    },
    subscribe(fn) {
      subs.add(fn)
      return () => subs.delete(fn)
    },
    next() {
      if (index < count - 1) jump(index + 1, 'next')
      else if (loop) jump(0, 'next')
    },
    prev() {
      if (index > 0) jump(index - 1, 'prev')
      else if (loop) jump(count - 1, 'prev')
    },
    goTo(i, o) {
      if (o?.restart === false && clampIndex(i, count) === index) return
      jump(i, 'goto')
    },
    pause,
    resume,
    toggleUserPause() {
      if (done) {
        reasons.delete('user')
        jump(0, 'goto')
      } else if (reasons.has('user')) resume('user')
      else pause('user')
    },
    isPausedBy: (reason) => reasons.has(reason),
    // Keys present in the patch are applied — `undefined` resets to the default (`count`,
    // having none, is kept) — absent keys are untouched. The components pass every prop
    // each sync, so a removed prop genuinely resets.
    setOptions(patch) {
      if (runStart != null) {
        elapsed += now() - runStart
        runStart = null
      }
      if ('count' in patch && patch.count != null) {
        count = Math.max(1, Math.floor(patch.count))
        const prev = index
        index = clampIndex(index, count)
        if (index !== prev) {
          // The clamp moved us to a different slide — a jump, not a silent renumber.
          elapsed = 0
          done = false
          opts.onChange?.(index, prev, 'goto')
        } else if (done && index < count - 1) {
          // A finished deck grew: its last slide isn't last anymore, so it resumes.
          done = false
          elapsed = 0
        }
      }
      if ('duration' in patch) duration = patch.duration ?? 5000
      if ('durations' in patch) durations = patch.durations
      if ('loop' in patch) loop = patch.loop ?? true
      armTimer()
      notify()
    },
    destroy() {
      clearTimer()
      runStart = null
      started = false
      subs.clear()
    },
  }
}

// ── Hook ───────────────────────────────────────────────────────────────────────────────

interface UseSlideStepperOptions extends StepperEngineOptions {}

interface UseSlideStepperReturn extends StepperEngineState {
  engine: StepperEngine
  next: () => void
  prev: () => void
  goTo: (index: number) => void
  pause: () => void
  resume: () => void
  toggle: () => void
}

/** Headless: an engine plus its live state. Share `engine` with <SlideStepper> and key your
 *  own content off `index` — one timer, one source of truth. */
function useSlideStepper(opts: UseSlideStepperOptions): UseSlideStepperReturn {
  const cb = useRef({ onChange: opts.onChange, onComplete: opts.onComplete, onPauseChange: opts.onPauseChange })
  cb.current = { onChange: opts.onChange, onComplete: opts.onComplete, onPauseChange: opts.onPauseChange }

  const [engine] = useState(() =>
    createEngine({
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
    // Construction is side-effect-free; start only after mount, and re-arm after the
    // StrictMode cleanup below. Shared consumers may also call this; start is idempotent.
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

// ── Shared attachments ─────────────────────────────────────────────────────────────────

function useAutoPause(
  ref: RefObject<HTMLElement | null>,
  engine: StepperEngine,
  opts: { hover?: boolean; hidden?: boolean; offscreen?: boolean; offscreenThreshold?: number },
) {
  const { hover, hidden, offscreen, offscreenThreshold } = opts
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const detach: Array<() => void> = []
    if (hidden !== false) {
      const onVis = () => (document.hidden ? engine.pause('hidden') : engine.resume('hidden'))
      document.addEventListener('visibilitychange', onVis)
      if (document.hidden) engine.pause('hidden')
      detach.push(() => {
        document.removeEventListener('visibilitychange', onVis)
        engine.resume('hidden')
      })
    }
    // Only on actually-hovering fine pointers: on touch, pointerenter fires on tap and never
    // leaves, which would strand the pause.
    if (hover !== false && typeof matchMedia !== 'undefined' && matchMedia('(hover: hover) and (pointer: fine)').matches) {
      const enter = () => engine.pause('hover')
      const leave = () => engine.resume('hover')
      el.addEventListener('pointerenter', enter)
      el.addEventListener('pointerleave', leave)
      detach.push(() => {
        el.removeEventListener('pointerenter', enter)
        el.removeEventListener('pointerleave', leave)
        engine.resume('hover')
      })
    }
    if (offscreen !== false && typeof IntersectionObserver !== 'undefined') {
      const io = new IntersectionObserver(
        (entries) => {
          const entry = entries[entries.length - 1]
          if (entry) (entry.isIntersecting ? engine.resume('offscreen') : engine.pause('offscreen'))
        },
        { threshold: offscreenThreshold ?? 0 },
      )
      io.observe(el)
      detach.push(() => {
        io.disconnect()
        engine.resume('offscreen')
      })
    }
    return () => detach.forEach((fn) => fn())
  }, [ref, engine, hover, hidden, offscreen, offscreenThreshold])
}

function useSwipeNav(
  ref: RefObject<HTMLElement | null>,
  engine: StepperEngine,
  axis: 'x' | 'y',
  enabled: boolean,
) {
  useEffect(() => {
    const el = ref.current
    if (!el || !enabled) return
    const threshold = 24
    let pointerId: number | null = null
    let startX = 0
    let startY = 0
    let swiping = false
    // Time-bounded: a touch swipe fires no click, so a sticky flag would eat the next tap.
    let swallowUntil = 0
    // Once a pointer is down, the rest of the gesture is tracked on window — a press that
    // drifts off the element and releases outside still ends, so the 'gesture' pause can
    // never stick.
    const finish = () => {
      unbindWindow()
      pointerId = null
      swiping = false
      engine.resume('gesture')
    }
    const onDown = (e: PointerEvent) => {
      if (!e.isPrimary || pointerId != null) return
      pointerId = e.pointerId
      startX = e.clientX
      startY = e.clientY
      swiping = false
      bindWindow()
      engine.pause('gesture')
    }
    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== pointerId || swiping) return
      const dx = e.clientX - startX
      const dy = e.clientY - startY
      const main = axis === 'x' ? dx : dy
      const cross = axis === 'x' ? dy : dx
      if (Math.abs(main) > threshold && Math.abs(main) > Math.abs(cross)) swiping = true
    }
    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return
      if (swiping) {
        const main = axis === 'x' ? e.clientX - startX : e.clientY - startY
        swallowUntil = Date.now() + 350
        if (main < 0) engine.next()
        else engine.prev()
      }
      finish()
    }
    const onCancel = (e: PointerEvent) => {
      if (e.pointerId === pointerId) finish()
    }
    // A swipe that started on a dot must not also click it.
    const onClick = (e: MouseEvent) => {
      if (Date.now() >= swallowUntil) return
      swallowUntil = 0
      e.preventDefault()
      e.stopPropagation()
    }
    const bindWindow = () => {
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onCancel)
    }
    const unbindWindow = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
    }
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('click', onClick, true)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('click', onClick, true)
      if (pointerId != null) finish()
    }
  }, [ref, engine, axis, enabled])
}

/** Live `prefers-reduced-motion`. The pill's decorative transitions are inline styles
 *  (their durations are computed), which Tailwind's motion-reduce variant can't turn off —
 *  so they're gated in JS instead. The fill sweep is deliberately not gated: it *is* the
 *  progress information (matching the vanilla stylesheet's exemption). */
function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return reduced
}

// ── Pill ───────────────────────────────────────────────────────────────────────────────

interface SlideStepperLabels {
  root?: string
  slide?: (index: number, count: number) => string
  pause?: string
  play?: string
  replay?: string
}

/** Geometry presets (px): dot diameter, dot spacing, bar length, pill height / tap target,
 *  pill inline padding. Every color comes from theme tokens instead. */
const SIZES = {
  sm: { dot: 5, gap: 5, bar: 22, hit: 30, pad: 11 },
  md: { dot: 6, gap: 6, bar: 28, hit: 36, pad: 14 },
  lg: { dot: 8, gap: 7, bar: 36, hit: 44, pad: 17 },
} as const

const GLIDE = 'cubic-bezier(0.22,1,0.36,1)'

interface SlideStepperProps {
  /** Share the engine from useSlideStepper; omit to let the pill run its own. Ownership is
   *  fixed at mount — supply it from the first render. */
  engine?: StepperEngine
  count?: number
  duration?: number
  durations?: number[] | Record<number, number>
  loop?: boolean
  startPaused?: boolean
  /** Initial slide (self-managed only) — an uncontrolled starting point, not a controlled
   *  value; drive jumps through the engine instead. */
  index?: number
  onChange?: (index: number, prevIndex: number, reason: StepChangeReason) => void
  onComplete?: (index: number) => void
  onPauseChange?: (paused: boolean, reasons: PauseReason[]) => void
  orientation?: 'horizontal' | 'vertical'
  /** Max dots visible at once; more slides turn the strip into a clamped tape counter. */
  clip?: number
  showPause?: boolean
  pauseOnHover?: boolean
  pauseWhenHidden?: boolean
  pauseWhenOffscreen?: boolean
  offscreenThreshold?: number
  size?: 'sm' | 'md' | 'lg'
  /** Ids of your own slide elements, wired to each dot's aria-controls. */
  slideIds?: (string | undefined)[]
  labels?: SlideStepperLabels
  className?: string
}

/** The pill: dots, stretching progress bar, tape-counter clipping, pause circle. */
function SlideStepper({
  engine: engineProp,
  count = 1,
  duration,
  durations,
  loop,
  startPaused,
  index,
  onChange,
  onComplete,
  onPauseChange,
  orientation = 'horizontal',
  clip,
  showPause = true,
  pauseOnHover,
  pauseWhenHidden,
  pauseWhenOffscreen,
  offscreenThreshold,
  size = 'md',
  slideIds,
  labels,
  className,
}: SlideStepperProps) {
  // Engine ownership is frozen at mount: with an external engine, none is created here at
  // all — no decoy timer just to satisfy the unconditional-hooks rule.
  const ownsEngine = useRef(engineProp == null).current
  const cb = useRef({ onChange, onComplete, onPauseChange })
  cb.current = { onChange, onComplete, onPauseChange }
  const [own] = useState(() =>
    ownsEngine
      ? createEngine({
          count,
          duration,
          durations,
          loop,
          startPaused,
          index,
          onChange: (i, p, r) => cb.current.onChange?.(i, p, r),
          onComplete: (i) => cb.current.onComplete?.(i),
          onPauseChange: (p, r) => cb.current.onPauseChange?.(p, r),
        })
      : null,
  )
  const engine = (engineProp ?? own) as StepperEngine
  const [state, setState] = useState<StepperEngineState>(() => engine.getState())
  useEffect(() => {
    setState(engine.getState())
    const unsubscribe = engine.subscribe(setState)
    engine.start()
    return () => {
      unsubscribe()
      if (ownsEngine) engine.destroy()
    }
  }, [engine, ownsEngine])
  useEffect(() => {
    if (ownsEngine) engine.setOptions({ count, duration, durations, loop })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, ownsEngine, count, duration, durations, loop])

  const rootRef = useRef<HTMLDivElement>(null)
  const pillRef = useRef<HTMLDivElement>(null)
  const dotRefs = useRef<(HTMLButtonElement | null)[]>([])
  const fillRefs = useRef<(HTMLSpanElement | null)[]>([])

  useAutoPause(rootRef, engine, {
    hover: pauseOnHover,
    hidden: pauseWhenHidden,
    offscreen: pauseWhenOffscreen,
    offscreenThreshold,
  })
  useSwipeNav(pillRef, engine, orientation === 'vertical' ? 'y' : 'x', true)

  const horizontal = orientation !== 'vertical'
  const reduced = useReducedMotion()
  const g = SIZES[size]
  const slot = g.dot + g.gap
  const barSlot = g.bar + g.gap
  const n = state.count
  // The tape-counter window: active bar centered, clamped at the deck's ends — same math as
  // the vanilla core's clip-window calc()/clamp(), just computed in JS.
  const effClip = Math.max(1, Math.min(clip ?? n, n))
  const win = (effClip - 1) * slot + barSlot
  const ideal = (state.index - (effClip - 1) / 2) * slot
  const shift = Math.max(0, Math.min((n - effClip) * slot, ideal))
  // The unfloored shift mirrored into slot units, floor/ceil'd outward so a half-visible
  // edge dot (even clip values) is treated as visible on both edges.
  const slotShift = shift / slot
  const first = Math.floor(slotShift)
  const last = Math.min(n - 1, Math.ceil(slotShift) + effClip - 1)

  // The fill sweep: paint the engine's numbers, flush, then glide to 100% over what remains.
  // One branch covers mount, advance, jump-mid-fill, pause-freeze, resume-from-fraction.
  useLayoutEffect(() => {
    const dim = horizontal ? 'width' : 'height'
    fillRefs.current.forEach((fill, i) => {
      if (!fill) return
      fill.style.transition = 'none'
      if (i !== state.index) {
        fill.style[dim] = i < state.index ? '100%' : '0%'
        return
      }
      // Remapped to run from one dot to full, so a freshly active bar starts dot-sized
      // and is visibly growing from the first frame.
      fill.style[dim] = `${g.dot + state.progress * (g.bar - g.dot)}px`
      if (!state.paused && !state.done) {
        void fill.offsetHeight
        fill.style.transition = `${dim} ${Math.max(0, engine.durationFor(i) * (1 - state.progress))}ms linear`
        fill.style[dim] = '100%'
      }
    })
  })

  // Taps in the pill's padding land on the nearest dot — the dots are small, the pill is
  // the target. React's bubble-phase onClick never fires for a swallowed post-swipe click
  // (the swipe recognizer stops those in capture phase).
  const onPillClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    if ((e.target as Element).closest('button')) return
    const at = horizontal ? e.clientX : e.clientY
    let best = -1
    let bestDist = Infinity
    dotRefs.current.forEach((el, i) => {
      if (!el || el.getAttribute('aria-hidden') === 'true') return
      const r = el.getBoundingClientRect()
      const c = horizontal ? r.left + r.width / 2 : r.top + r.height / 2
      const dist = Math.abs(at - c)
      if (dist < bestDist) {
        bestDist = dist
        best = i
      }
    })
    if (best >= 0) engine.goTo(best)
  }

  const onKeyDown = (e: ReactKeyboardEvent) => {
    let handled = true
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') engine.next()
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') engine.prev()
    else if (e.key === 'Home') engine.goTo(0)
    else if (e.key === 'End') engine.goTo(n - 1)
    else handled = false
    if (handled) {
      e.preventDefault()
      dotRefs.current[engine.getState().index]?.focus()
    }
  }

  const kind = state.done ? 'replay' : engine.isPausedBy('user') ? 'play' : 'pause'
  const pauseLabel =
    kind === 'replay' ? (labels?.replay ?? 'Replay') : kind === 'play' ? (labels?.play ?? 'Play') : (labels?.pause ?? 'Pause')

  return (
    <div
      data-slot="slide-stepper"
      data-orientation={orientation}
      ref={rootRef}
      className={cn('inline-flex items-center gap-2', !horizontal && 'flex-col', className)}
    >
      <div
        data-slot="slide-stepper-pill"
        ref={pillRef}
        onClick={onPillClick}
        className={cn('flex items-center rounded-full bg-muted', !horizontal && 'flex-col')}
        style={
          horizontal
            ? { height: g.hit, padding: `0 ${g.pad}px`, touchAction: 'pan-y' }
            : { width: g.hit, padding: `${g.pad}px 0`, touchAction: 'pan-x' }
        }
      >
        <div data-slot="slide-stepper-window" className="overflow-hidden" style={horizontal ? { width: win } : { height: win }}>
          <div
            data-slot="slide-stepper-strip"
            role="tablist"
            aria-orientation={orientation}
            aria-label={labels?.root ?? 'Slide progress'}
            onKeyDown={onKeyDown}
            className={cn('flex w-max', !horizontal && 'w-auto h-max flex-col')}
            style={{
              transform: horizontal ? `translateX(${-shift}px)` : `translateY(${-shift}px)`,
              transition: reduced ? undefined : `transform 320ms ${GLIDE}`,
            }}
          >
            {Array.from({ length: n }, (_, i) => {
              const active = i === state.index
              const offWindow = i < first || i > last
              return (
                <button
                  key={i}
                  data-slot="slide-stepper-dot"
                  data-active={active || undefined}
                  data-done={i < state.index || undefined}
                  ref={(el) => {
                    dotRefs.current[i] = el
                  }}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-label={labels?.slide?.(i, n) ?? `Slide ${i + 1} of ${n}`}
                  aria-controls={slideIds?.[i]}
                  aria-hidden={offWindow || undefined}
                  tabIndex={active ? 0 : -1}
                  onClick={() => engine.goTo(i)}
                  className="group grid cursor-pointer place-items-center rounded-full border-0 bg-transparent p-0 focus-visible:outline-none"
                  style={{
                    width: horizontal ? (active ? barSlot : slot) : g.hit,
                    height: horizontal ? g.hit : active ? barSlot : slot,
                    transition: reduced ? undefined : `width 250ms ${GLIDE}, height 250ms ${GLIDE}`,
                  }}
                >
                  {/* A soft ring reads smeared on a target this small, so this hugs the
                      visible track with a crisp outline instead of the canonical
                      focus-visible ring (same deviation as the vanilla tier's dot track). */}
                  <span
                    data-slot="slide-stepper-dot-track"
                    className={cn(
                      'relative block overflow-hidden rounded-full group-focus-visible:outline group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-ring',
                      active ? 'bg-border opacity-100' : i < state.index ? 'bg-muted-foreground opacity-80' : 'bg-muted-foreground opacity-55',
                    )}
                    style={{
                      width: horizontal && active ? g.bar : g.dot,
                      height: !horizontal && active ? g.bar : g.dot,
                      transition: reduced ? undefined : `width 250ms ${GLIDE}, height 250ms ${GLIDE}, background-color 200ms ease, opacity 200ms ease`,
                    }}
                  >
                    <span
                      data-slot="slide-stepper-dot-fill"
                      ref={(el) => {
                        fillRefs.current[i] = el
                      }}
                      aria-hidden="true"
                      className={cn(
                        'absolute rounded-[inherit] bg-primary',
                        horizontal ? 'inset-y-0 left-0' : 'inset-x-0 top-0',
                        active ? 'opacity-100' : 'opacity-0',
                      )}
                      style={horizontal ? { width: 0 } : { height: 0 }}
                    />
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
      {showPause ? (
        <Button
          data-slot="slide-stepper-pause"
          data-kind={kind}
          type="button"
          variant="ghost"
          size="icon"
          aria-label={pauseLabel}
          onClick={() => engine.toggleUserPause()}
          // ghost + explicit bg-muted so the circle tracks the same token as the pill
          // (variant="secondary" would tie it to --secondary instead).
          className="rounded-full bg-muted hover:bg-muted/80"
          style={{ width: g.hit, height: g.hit }}
        >
          {kind === 'replay' ? <RotateCcwIcon /> : kind === 'play' ? <PlayIcon /> : <PauseIcon />}
        </Button>
      ) : null}
    </div>
  )
}

// ── Carousel ───────────────────────────────────────────────────────────────────────────

interface SlideStepperCarouselProps
  extends Omit<SlideStepperProps, 'engine' | 'slideIds'> {
  /** The slides: an array of nodes, or a factory for lazy content (rendered once a slide
   *  comes within one step of showing, then kept mounted). */
  slides: ReactNode[] | ((index: number) => ReactNode)
  /** Crossfade duration in ms. Default 300. */
  transitionMs?: number
  /** Where the pill sits. Default 'bottom' for a horizontal pill, 'right' for vertical. */
  pillPosition?: 'top' | 'bottom' | 'left' | 'right'
  /** Swipe on the slide area for prev/next. Default true. */
  swipe?: boolean
  /** Hold a 'focus' pause while focus is inside the carousel (WCAG 2.2.2). Default true. */
  pauseOnFocusWithin?: boolean
}

/** The full carousel: crossfading viewport + pill sharing one engine, zero wiring. */
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
  swipe = true,
  pauseOnHover,
  pauseWhenHidden,
  pauseWhenOffscreen,
  offscreenThreshold,
  pauseOnFocusWithin = true,
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

  useAutoPause(rootRef, engine, {
    hover: pauseOnHover,
    hidden: pauseWhenHidden,
    offscreen: pauseWhenOffscreen,
    offscreenThreshold,
  })
  useSwipeNav(viewportRef, engine, orientation === 'vertical' ? 'y' : 'x', swipe)

  // Keyboard/AT users can't hover-pause; holding focus anywhere inside pauses instead.
  useEffect(() => {
    const root = rootRef.current
    if (!root || !pauseOnFocusWithin) return
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

  // Lazy slides mount once they've come within one step of showing, then stay — a far jump
  // must not blank the outgoing slide mid-crossfade.
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
      data-slot="slide-stepper-carousel"
      ref={rootRef}
      role="region"
      aria-roledescription="carousel"
      aria-label={labels?.root ?? 'Slides'}
      className={cn(
        'flex flex-col items-center gap-4',
        position === 'top' && 'flex-col-reverse',
        position === 'right' && 'flex-row',
        position === 'left' && 'flex-row-reverse',
        className,
      )}
    >
      <div
        data-slot="slide-stepper-carousel-viewport"
        ref={viewportRef}
        className="grid"
        style={{ touchAction: orientation === 'vertical' ? 'pan-x' : 'pan-y' }}
      >
        {Array.from({ length: count }, (_, i) => (
          <div
            key={i}
            data-slot="slide-stepper-carousel-slide"
            data-active={i === index || undefined}
            id={ids[i]}
            ref={(el) => {
              slideRefs.current[i] = el
            }}
            role="group"
            aria-roledescription="slide"
            aria-label={labels?.slide?.(i, count) ?? `Slide ${i + 1} of ${count}`}
            aria-hidden={i === index ? undefined : true}
            className={cn(
              'col-start-1 row-start-1 transition-[opacity,transform] motion-reduce:transition-none',
              i === index ? 'scale-100 opacity-100' : 'pointer-events-none scale-[0.98] opacity-0',
            )}
            style={{ transitionDuration: `${transitionMs ?? 300}ms` } as CSSProperties}
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

export {
  useSlideStepper,
  SlideStepper,
  SlideStepperCarousel,
  type PauseReason,
  type StepChangeReason,
  type StepperEngineOptions,
  type StepperEngineState,
  type StepperEngine,
  type UseSlideStepperOptions,
  type UseSlideStepperReturn,
  type SlideStepperLabels,
  type SlideStepperProps,
  type SlideStepperCarouselProps,
}
