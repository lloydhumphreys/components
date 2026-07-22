// slide-stepper — a zero-dependency auto-advancing slide progress indicator.
//
// A rounded pill of dots, one per slide; the active dot stretches into a wide bar that
// fills over the slide's duration, then the stepper advances (Apple/Instagram-stories
// style). A detached circular pause button sits beside the pill and becomes Replay when a
// non-looping deck finishes. With more slides than `clip`, the dot strip becomes a tape
// counter: it translates inside a fixed window so the active bar sits centered, pinned at
// the deck's start and end so the pill always looks full.
//
// Three layers, so you choose how much it owns:
//   createStepperEngine()   headless timer + index + composable pause-reasons — no DOM
//   createSlideStepper()    the pill (dots, bar, pause circle), driving or sharing an engine
//   createSlideStepperCarousel()   (slide-stepper-carousel.ts) crossfade viewport, zero wiring
//
// The engine is the single source of truth. Pausing is a *set of reasons* ('user',
// 'hover', 'hidden', 'offscreen', 'gesture', 'focus'): the timer runs only while the set
// is empty, so auto-pauses compose — a user pause survives hover-out, a hover pause during
// a swipe doesn't double-count elapsed time. The JS timer is the authoritative clock; CSS
// transitions only *display* progress and are never listened to (no animationend), so
// aggressive reduced-motion resets can't corrupt timing.
//
// Framework-agnostic vanilla DOM — no dependencies, no build step. A React wrapper
// (<SlideStepper> + useSlideStepper) lives in slide-stepper-react.tsx; a shadcn-native
// rebuild lives in slide-stepper-shadcn.tsx.
//
// State ownership: the engine, not the caller, owns `index` — it's an uncontrolled starting
// point, and jumps go through the engine's goTo/next/prev. Timing/progress is ephemeral UI
// state driven by a live timer; a controlled index would fight that timer on every render.
//
// ── Theming ────────────────────────────────────────────────────────────────────────────
// Styles consume shadcn theme tokens when present, with light-dark() fallbacks so the
// control reads correctly standalone in both themes. Override independently of the app
// theme via the --stepper-* escape hatches (set on the root or any ancestor):
//   --stepper-pill-bg     pill + pause-circle background  (default: --muted)
//   --stepper-dot         inactive dot color              (default: --muted-foreground)
//   --stepper-bar-bg      active bar's unfilled frame     (default: --border)
//   --stepper-fill        active bar's progress fill      (default: --primary)
//   --stepper-pause-fg    pause icon color                (default: --foreground)
//   --stepper-ring        focus ring color                (default: --ring)
//   --stepper-radius      corner radius everywhere        (default: 999px)
//   --stepper-pause-gap   pill ↔ pause circle spacing     (default: 8px)
//   --stepper-strip-ms    clip-window glide duration      (default: 320ms)
//   --stepper-dot-size / --stepper-bar-size / --stepper-gap / --stepper-hit-size
//                         geometry: dot diameter, bar length, dot spacing, pill height
//                         (also the tap-target size). Defaults scale with size sm/md/lg;
//                         setting one of these overrides every size preset uniformly.

// ── Engine ─────────────────────────────────────────────────────────────────────────────

/** Why the timer is (or isn't) running. Pausing composes: each source adds/removes its own
 *  reason and the timer runs only while the set is empty — so a user pause survives a
 *  hover-out, and a swipe-in-progress doesn't cancel a tab-hidden pause. */
export type PauseReason = 'user' | 'hover' | 'hidden' | 'offscreen' | 'gesture' | 'focus'

/** How an index change happened: the timer ('advance', or 'loop' when wrapping), a swipe or
 *  arrow key ('next' / 'prev'), or a direct jump ('goto' — dot tap, Home/End, replay). */
export type StepChangeReason = 'advance' | 'next' | 'prev' | 'goto' | 'loop'

export interface StepperEngineOptions {
  /** How many slides. Required; clamped to >= 1. */
  count: number
  /** Default per-slide duration in ms. Default 5000. */
  duration?: number
  /** Sparse per-slide overrides, by index — an array with holes or a record; missing/invalid
   *  entries fall back to `duration`. E.g. `{ 2: 8000 }` gives slide 3 eight seconds. */
  durations?: number[] | Record<number, number>
  /** Wrap to the first slide after the last finishes. Default true. With loop off the deck
   *  stops on the last slide (`done`) and the pill's pause button becomes Replay. */
  loop?: boolean
  /** Start with a 'user' pause already applied (the pause button shows Play). */
  startPaused?: boolean
  /** Initial slide index. Default 0. */
  index?: number
  /** Fired whenever the index changes (not on a same-slide restart). */
  onChange?: (index: number, prevIndex: number, reason: StepChangeReason) => void
  /** Fired when a slide's timer completes, just before advancing off it. */
  onComplete?: (index: number) => void
  /** Fired when the timer stops or starts — i.e. when the reason set becomes non-empty or
   *  empty — not on every reason change. */
  onPauseChange?: (paused: boolean, reasons: PauseReason[]) => void
}

export interface StepperEngineState {
  index: number
  count: number
  /** 0..1 through the current slide, computed from performance.now() on demand — the engine
   *  never ticks or polls. */
  progress: number
  /** True while any pause reason is held. */
  paused: boolean
  pauseReasons: PauseReason[]
  /** True when a non-looping deck has finished its last slide. */
  done: boolean
}

export interface StepperEngine {
  getState(): StepperEngineState
  /** The effective duration for a slide (per-slide override or the default). */
  durationFor(index: number): number
  /** Start auto-advance. Idempotent; safe to call from every mounted consumer. */
  start(): void
  /** Subscribe to state changes; returns unsubscribe. Subscription is side-effect-free and
   *  does not start the clock. Fires on index/pause/done changes — not continuously during
   *  a slide (progress is computed, not ticked). */
  subscribe(fn: (state: StepperEngineState) => void): () => void
  /** Advance one slide (wraps only when looping; no-op past the end otherwise). */
  next(): void
  /** Back one slide (wraps only when looping). */
  prev(): void
  /** Jump to a slide. Restarts that slide's progress unless `restart: false`. Clears `done`. */
  goTo(index: number, opts?: { restart?: boolean }): void
  /** Add a pause reason. Default 'user'. */
  pause(reason?: PauseReason): void
  /** Remove a pause reason; the timer re-arms (from the frozen fraction, not from zero)
   *  once the set empties. Default 'user'. */
  resume(reason?: PauseReason): void
  /** The pause button's behavior: toggles the 'user' reason — or, when `done`, replays
   *  from the first slide. */
  toggleUserPause(): void
  isPausedBy(reason: PauseReason): boolean
  /** Patch count/duration/durations/loop live; in-flight elapsed time is preserved. Keys
   *  present in the patch are applied — `undefined` resets that option to its default
   *  (except `count`, which has none and is kept) — and absent keys are untouched, so the
   *  React wrappers can pass every prop each sync and removed props genuinely reset. */
  setOptions(patch: Partial<Pick<StepperEngineOptions, 'count' | 'duration' | 'durations' | 'loop'>>): void
  /** Stop the timer and drop subscribers. */
  destroy(): void
}

const clampIndex = (i: number, count: number) => Math.min(Math.max(Math.floor(i), 0), count - 1)

/**
 * Headless timer + index + pause-reasons — the single source of truth behind the pill, the
 * carousel, and the React useSlideStepper hook. Bookkeeping is elapsed-time based: pausing
 * folds the current run segment into `elapsed`, resuming arms setTimeout for what remains,
 * so progress freezes and continues at the exact same fraction.
 *
 * Construction is deliberately side-effect-free (the React hooks build engines inside a
 * useState initializer, where a live timer would leak under StrictMode). Call `start()` once
 * the consumer is mounted; it is idempotent, so composed consumers can all call it safely.
 */
export function createStepperEngine(opts: StepperEngineOptions): StepperEngine {
  let count = Math.max(1, Math.floor(opts.count))
  let duration = opts.duration ?? 5000
  let durations = opts.durations
  let loop = opts.loop ?? true
  let index = clampIndex(opts.index ?? 0, count)
  let done = false
  /** ms of the current slide already consumed (excluding the in-flight run segment). */
  let elapsed = 0
  /** performance.now() when the current run segment started; null while not running. */
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

  const getProgress = (): number => {
    if (done) return 1
    const live = runStart != null ? now() - runStart : 0
    return Math.min(1, (elapsed + live) / durationFor(index))
  }

  const getState = (): StepperEngineState => ({
    index,
    count,
    progress: getProgress(),
    paused: reasons.size > 0,
    pauseReasons: [...reasons],
    done,
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

  /** (Re)start the clock for the current slide's remaining time — only when nothing holds a
   *  pause and the deck isn't done. */
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
      // Non-looping deck finished: freeze at full. `done` is what flips the pause button to
      // Replay; any jump clears it.
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
    // Fold the in-flight segment into elapsed exactly once — later reasons stack for free.
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
    setOptions(patch) {
      // Preserve the in-flight segment before re-arming against new durations/count.
      if (runStart != null) {
        elapsed += now() - runStart
        runStart = null
      }
      if ('count' in patch && patch.count != null) {
        count = Math.max(1, Math.floor(patch.count))
        const prev = index
        index = clampIndex(index, count)
        if (index !== prev) {
          // The clamp moved us to a different slide — a jump, not a silent renumber: the
          // old slide's elapsed time doesn't carry over, and onChange fires.
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

// ── Shared attachments ─────────────────────────────────────────────────────────────────
// Used by both the pill and the carousel (which wires them on its own root instead, so
// hovering anywhere over the slides pauses — the pill's copies are disabled there).

export interface AutoPauseOptions {
  /** Pause while the pointer is over `el`. Only wired on hover-capable fine pointers.
   *  Default true. */
  hover?: boolean
  /** Pause while the tab is hidden (visibilitychange). Default true. */
  hidden?: boolean
  /** Pause while `el` is scrolled out of the viewport (IntersectionObserver). Default true. */
  offscreen?: boolean
  /** IntersectionObserver threshold for `offscreen`. Default 0. */
  offscreenThreshold?: number
}

/** Wire the automatic pause sources onto an element. Returns a detach function that also
 *  releases any reasons it holds (so tearing down never strands a shared engine paused). */
export function attachAutoPause(el: HTMLElement, engine: StepperEngine, opts: AutoPauseOptions = {}): () => void {
  const detach: Array<() => void> = []
  if (opts.hidden !== false && typeof document !== 'undefined') {
    const onVis = () => (document.hidden ? engine.pause('hidden') : engine.resume('hidden'))
    document.addEventListener('visibilitychange', onVis)
    if (document.hidden) engine.pause('hidden')
    detach.push(() => {
      document.removeEventListener('visibilitychange', onVis)
      engine.resume('hidden')
    })
  }
  // Gate hover on an actually-hovering fine pointer: on touch, pointerenter fires on tap and
  // never leaves, which would strand the pause.
  if (
    opts.hover !== false &&
    typeof matchMedia !== 'undefined' &&
    matchMedia('(hover: hover) and (pointer: fine)').matches
  ) {
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
  if (opts.offscreen !== false && typeof IntersectionObserver !== 'undefined') {
    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1]
        if (entry) (entry.isIntersecting ? engine.resume('offscreen') : engine.pause('offscreen'))
      },
      { threshold: opts.offscreenThreshold ?? 0 },
    )
    io.observe(el)
    detach.push(() => {
      io.disconnect()
      engine.resume('offscreen')
    })
  }
  return () => detach.forEach((fn) => fn())
}

export interface SwipeNavOptions {
  /** The gesture's main axis ('x' for a horizontal pill/deck, 'y' for vertical). */
  axis: 'x' | 'y'
  /** Main-axis px before a drag counts as a swipe. Default 24. */
  threshold?: number
  /** -1 = prev, 1 = next (swiping left/up means "next", like flicking a card away). */
  onSwipe: (dir: -1 | 1) => void
  /** Pointer went down / interaction ended — pair these with pause('gesture')/resume. */
  onGestureStart?: () => void
  onGestureEnd?: () => void
}

/**
 * Threshold-based swipe recognizer on pointer events. Cross-axis-dominant drags are left to
 * the browser (pair with `touch-action: pan-y` / `pan-x` so page scroll isn't hijacked).
 * Once a pointer goes down, the rest of the gesture is tracked on `window` — a press that
 * drifts off the element and releases outside still delivers its up/cancel, so a paired
 * pause('gesture') can never stick. After a recognized swipe the next click is swallowed in
 * capture phase, so a swipe that started on a button doesn't also activate it. Returns a
 * detach function.
 */
export function attachSwipeNav(el: HTMLElement, opts: SwipeNavOptions): () => void {
  const threshold = opts.threshold ?? 24
  let pointerId: number | null = null
  let startX = 0
  let startY = 0
  let swiping = false
  // Time-bounded, not a sticky flag: a mouse's post-swipe click arrives within a few ms,
  // but a touch swipe fires no click at all — a flag would strand armed and eat the next
  // genuine tap.
  let swallowUntil = 0

  const finish = () => {
    unbindWindow()
    pointerId = null
    swiping = false
    opts.onGestureEnd?.()
  }
  const onDown = (e: PointerEvent) => {
    if (!e.isPrimary || pointerId != null) return
    pointerId = e.pointerId
    startX = e.clientX
    startY = e.clientY
    swiping = false
    bindWindow()
    opts.onGestureStart?.()
  }
  const onMove = (e: PointerEvent) => {
    if (e.pointerId !== pointerId || swiping) return
    const dx = e.clientX - startX
    const dy = e.clientY - startY
    const main = opts.axis === 'x' ? dx : dy
    const cross = opts.axis === 'x' ? dy : dx
    if (Math.abs(main) > threshold && Math.abs(main) > Math.abs(cross)) swiping = true
  }
  const onUp = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return
    if (swiping) {
      const main = opts.axis === 'x' ? e.clientX - startX : e.clientY - startY
      swallowUntil = Date.now() + 350
      opts.onSwipe(main < 0 ? 1 : -1)
    }
    finish()
  }
  const onCancel = (e: PointerEvent) => {
    if (e.pointerId === pointerId) finish()
  }
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
}

// ── Pill ───────────────────────────────────────────────────────────────────────────────

export interface SlideStepperLabels {
  /** Accessible name of the dot strip. Default 'Slide progress'. */
  root?: string
  /** Accessible name per dot. Default `Slide ${i + 1} of ${count}`. */
  slide?: (index: number, count: number) => string
  /** Pause-button names per state. Defaults 'Pause' / 'Play' / 'Replay'. */
  pause?: string
  play?: string
  replay?: string
}

export interface SlideStepperOptions extends StepperEngineOptions {
  /** Drive an engine you already own (e.g. shared with your own content, or from the React
   *  hook) instead of creating one. When set, every engine option on this object (count,
   *  duration(s), loop, index, startPaused, callbacks) is ignored — the engine owns those —
   *  and only the presentational options below apply. */
  engine?: StepperEngine
  /** Pill direction. Vertical stacks the dots and puts the pause circle below. Default
   *  'horizontal'. */
  orientation?: 'horizontal' | 'vertical'
  /** Show at most this many dots; with more slides the strip becomes a tape counter (active
   *  bar centered, clamped at the ends). Undefined or >= count shows every dot. */
  clip?: number
  /** Render the detached pause/play/replay circle. Default true. */
  showPause?: boolean
  /** Pause while hovering the pill (fine pointers only). Default true. */
  pauseOnHover?: boolean
  /** Pause while the tab is hidden. Default true. */
  pauseWhenHidden?: boolean
  /** Pause while the pill is scrolled offscreen. Default true. */
  pauseWhenOffscreen?: boolean
  /** IntersectionObserver threshold for pauseWhenOffscreen. Default 0. */
  offscreenThreshold?: number
  /** Geometry preset. Default 'md'. (Every dimension is also a --stepper-* variable.) */
  size?: 'sm' | 'md' | 'lg'
  /** Optional DOM ids of the slides you render yourself, wired to each dot's aria-controls
   *  (hook + pill usage, where the pill can't otherwise know your content). */
  slideIds?: (string | undefined)[]
  labels?: SlideStepperLabels
  /** Inject the component stylesheet on first use. Default true; set false to ship the CSS
   *  yourself (see `stepperStyles()`). */
  injectStyles?: boolean
  /** Extra class(es) added to the root, for your own overrides. */
  className?: string
}

export interface SlideStepper {
  /** The control root. Append it anywhere. */
  readonly element: HTMLElement
  /** The engine driving this pill (own or shared) — subscribe to sync your own content. */
  readonly engine: StepperEngine
  getState(): StepperEngineState
  next(): void
  prev(): void
  goTo(index: number): void
  /** User pause/resume (the 'user' reason — what the pause button toggles). */
  pause(): void
  resume(): void
  toggle(): void
  /** Patch presentational options (orientation, clip, size, showPause, labels, slideIds,
   *  className) and — when the pill owns its engine — count/duration/durations/loop. Keys
   *  present in the patch are applied, with `undefined` resetting that option to its
   *  default; absent keys are untouched. (The React wrapper passes every prop each sync,
   *  so a removed prop genuinely resets.) */
  setState(patch: Partial<SlideStepperOptions>): void
  /** Detach listeners and observers; destroys the engine only if the pill created it. */
  destroy(): void
}

/** Build the pill. Append `.element` anywhere; it sizes itself from `clip` and `size`. */
export function createSlideStepper(opts: SlideStepperOptions): SlideStepper {
  if (opts.injectStyles !== false) injectStepperStyles()

  const engine = opts.engine ?? createStepperEngine(opts)
  const ownsEngine = !opts.engine
  let orientation = opts.orientation ?? 'horizontal'
  let clip = opts.clip
  let size = opts.size ?? 'md'
  let showPause = opts.showPause !== false
  let labels = opts.labels
  let slideIds = opts.slideIds
  let className = opts.className
  let count = engine.getState().count

  const root = document.createElement('div')
  const pill = document.createElement('div')
  pill.className = 'slide-stepper-pill'
  const win = document.createElement('div')
  win.className = 'slide-stepper-window'
  const strip = document.createElement('div')
  strip.className = 'slide-stepper-strip'
  strip.setAttribute('role', 'tablist')
  const pauseBtn = document.createElement('button')
  pauseBtn.type = 'button'
  pauseBtn.className = 'slide-stepper-pause'

  win.appendChild(strip)
  pill.appendChild(win)
  root.appendChild(pill)
  root.appendChild(pauseBtn)

  let dots: HTMLButtonElement[] = []
  let fills: HTMLSpanElement[] = []

  const applyLayout = () => {
    root.className = `slide-stepper slide-stepper--${orientation} slide-stepper--${size}${className ? ` ${className}` : ''}`
    root.dataset.orientation = orientation
    strip.setAttribute('aria-orientation', orientation)
    strip.setAttribute('aria-label', labels?.root ?? 'Slide progress')
    pauseBtn.style.display = showPause ? '' : 'none'
    // The window's tape-counter math lives entirely in CSS; JS only feeds it integers.
    // (--_index is kept current in render().)
    win.style.setProperty('--_count', String(count))
    win.style.setProperty('--_clip', String(Math.max(1, Math.min(clip ?? count, count))))
  }

  const buildDots = () => {
    strip.replaceChildren()
    dots = []
    fills = []
    for (let i = 0; i < count; i++) {
      const dot = document.createElement('button')
      dot.type = 'button'
      dot.className = 'slide-stepper-dot'
      dot.setAttribute('role', 'tab')
      dot.setAttribute('aria-label', labels?.slide?.(i, count) ?? `Slide ${i + 1} of ${count}`)
      const controls = slideIds?.[i]
      if (controls) dot.setAttribute('aria-controls', controls)
      const track = document.createElement('span')
      track.className = 'slide-stepper-dot-track'
      const fill = document.createElement('span')
      fill.className = 'slide-stepper-dot-fill'
      track.appendChild(fill)
      dot.appendChild(track)
      dot.addEventListener('click', () => engine.goTo(i))
      strip.appendChild(dot)
      dots.push(dot)
      fills.push(fill)
    }
  }

  // The fill's inline transition is the only animation JS touches — and only ever as a
  // *display* of the engine's numbers, never as a clock. One branch covers mount, advance,
  // jump-mid-fill, pause-freeze, and resume-from-fraction.
  const dim = () => (orientation === 'horizontal' ? 'width' : 'height')
  const paintFill = (i: number, s: StepperEngineState) => {
    const fill = fills[i]
    if (!fill) return
    fill.style.transition = 'none'
    const d = dim()
    if (i !== s.index) {
      fill.style[d] = i < s.index ? '100%' : '0%'
      return
    }
    // The sweep is remapped to run from one dot to full — not 0% to 100% — so a freshly
    // active bar starts exactly dot-sized (never smaller than its idle neighbors) and is
    // visibly growing from the first frame rather than dwelling behind a clamp.
    fill.style[d] = `calc(var(--_dot) + ${s.progress} * (100% - var(--_dot)))`
    if (!s.paused && !s.done) {
      void fill.offsetHeight // flush the snap before re-enabling the glide (scroll-rail trick)
      const remaining = engine.durationFor(i) * (1 - s.progress)
      fill.style.transition = `${d} ${Math.max(0, remaining)}ms linear`
      fill.style[d] = '100%'
    }
  }

  // Which dot indices the window shows — mirror of the clip-window calc()/clamp() in
  // stepperStyles(); keep in sync. Used only for aria/tab reachability of clipped dots
  // (the active dot is always in-window by construction, so it's never hidden). The shift
  // stays unfloored like the CSS's, then floor/ceils outward, so a half-visible edge dot
  // (even clip values) is treated as visible on both edges.
  const visibleRange = (active: number): [number, number] => {
    const effClip = Math.max(1, Math.min(clip ?? count, count))
    const shift = Math.max(0, Math.min(count - effClip, active - (effClip - 1) / 2))
    return [Math.floor(shift), Math.min(count - 1, Math.ceil(shift) + effClip - 1)]
  }

  const pauseIcon = (kind: 'pause' | 'play' | 'replay') => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', '0 0 24 24')
    svg.setAttribute('aria-hidden', 'true')
    if (kind === 'pause') {
      svg.setAttribute('fill', 'currentColor')
      svg.innerHTML = '<rect x="6.5" y="5" width="4" height="14" rx="1.4"/><rect x="13.5" y="5" width="4" height="14" rx="1.4"/>'
    } else if (kind === 'play') {
      svg.setAttribute('fill', 'currentColor')
      svg.innerHTML = '<path d="M8 5.5a1 1 0 0 1 1.52-.86l10 6.5a1 1 0 0 1 0 1.72l-10 6.5A1 1 0 0 1 8 18.5Z"/>'
    } else {
      svg.setAttribute('fill', 'none')
      svg.setAttribute('stroke', 'currentColor')
      svg.setAttribute('stroke-width', '2.4')
      svg.setAttribute('stroke-linecap', 'round')
      svg.setAttribute('stroke-linejoin', 'round')
      svg.innerHTML = '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v4h4"/>'
    }
    return svg
  }

  const render = (s: StepperEngineState) => {
    // A shared engine can change count out from under us (its owner's setOptions) — this
    // subscription is the only channel that reaches the pill, so rebuild the strip here.
    if (s.count !== count) {
      count = s.count
      applyLayout()
      buildDots()
    }
    win.style.setProperty('--_index', String(s.index))
    const [first, last] = visibleRange(s.index)
    dots.forEach((dot, i) => {
      dot.classList.toggle('is-active', i === s.index)
      dot.classList.toggle('is-done', i < s.index)
      dot.setAttribute('aria-selected', i === s.index ? 'true' : 'false')
      const offWindow = i < first || i > last
      // Clipped dots are visually gone; take them out of the a11y tree too. The roving
      // tabindex keeps exactly one stop (the active dot) in the Tab order.
      dot.tabIndex = i === s.index ? 0 : -1
      if (offWindow) dot.setAttribute('aria-hidden', 'true')
      else dot.removeAttribute('aria-hidden')
      paintFill(i, s)
    })
    // The button shows what clicking will do: Replay when finished, Play while user-paused,
    // else Pause. Auto-pauses (hover/hidden/offscreen/gesture) deliberately don't flip it —
    // hovering the control shouldn't make it flicker.
    const kind = s.done ? 'replay' : engine.isPausedBy('user') ? 'play' : 'pause'
    const label = kind === 'replay' ? (labels?.replay ?? 'Replay') : kind === 'play' ? (labels?.play ?? 'Play') : (labels?.pause ?? 'Pause')
    pauseBtn.setAttribute('aria-label', label)
    pauseBtn.replaceChildren(pauseIcon(kind))
  }

  // ── Interactions ──
  pauseBtn.addEventListener('click', () => engine.toggleUserPause())

  // Keyboard on the tablist: arrows move + select together (automatic activation — matching
  // "tap restarts the slide"), Home/End jump to the ends. Focus follows the active dot.
  const onKeyDown = (e: KeyboardEvent) => {
    let handled = true
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') engine.next()
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') engine.prev()
    else if (e.key === 'Home') engine.goTo(0)
    else if (e.key === 'End') engine.goTo(count - 1)
    else handled = false
    if (handled) {
      e.preventDefault()
      dots[engine.getState().index]?.focus()
    }
  }
  strip.addEventListener('keydown', onKeyDown)

  // Taps in the pill's padding land on the nearest dot — the dots are small, the pill is
  // the target. Clicks on a dot are left to its own handler (which also covers keyboard).
  const onPillClick = (e: MouseEvent) => {
    if ((e.target as Element | null)?.closest('.slide-stepper-dot, .slide-stepper-pause')) return
    const horizontal = orientation === 'horizontal'
    const at = horizontal ? e.clientX : e.clientY
    let best = -1
    let bestDist = Infinity
    dots.forEach((dot, i) => {
      if (dot.getAttribute('aria-hidden') === 'true') return
      const r = dot.getBoundingClientRect()
      const c = horizontal ? r.left + r.width / 2 : r.top + r.height / 2
      const d2 = Math.abs(at - c)
      if (d2 < bestDist) {
        bestDist = d2
        best = i
      }
    })
    if (best >= 0) engine.goTo(best)
  }
  pill.addEventListener('click', onPillClick)

  const attachSwipe = () =>
    attachSwipeNav(pill, {
      axis: orientation === 'horizontal' ? 'x' : 'y',
      onSwipe: (d) => (d > 0 ? engine.next() : engine.prev()),
      onGestureStart: () => engine.pause('gesture'),
      onGestureEnd: () => engine.resume('gesture'),
    })
  let detachSwipe = attachSwipe()

  const detachAutoPause = attachAutoPause(root, engine, {
    hover: opts.pauseOnHover,
    hidden: opts.pauseWhenHidden,
    offscreen: opts.pauseWhenOffscreen,
    offscreenThreshold: opts.offscreenThreshold,
  })

  applyLayout()
  buildDots()
  render(engine.getState())
  const unsubscribe = engine.subscribe(render)
  engine.start()

  return {
    element: root,
    engine,
    getState: () => engine.getState(),
    next: () => engine.next(),
    prev: () => engine.prev(),
    goTo: (i) => engine.goTo(i),
    pause: () => engine.pause('user'),
    resume: () => engine.resume('user'),
    toggle: () => engine.toggleUserPause(),
    setState(patch) {
      if (ownsEngine && ('count' in patch || 'duration' in patch || 'durations' in patch || 'loop' in patch)) {
        engine.setOptions(patch)
      }
      if ('orientation' in patch) {
        const next = patch.orientation ?? 'horizontal'
        if (next !== orientation) {
          orientation = next
          // The fill's inline width/height belongs to the old axis — wipe and repaint fresh.
          fills.forEach((f) => f.removeAttribute('style'))
          // The swipe recognizer's axis is fixed at attach time — re-attach on the new one.
          detachSwipe()
          detachSwipe = attachSwipe()
        }
      }
      if ('clip' in patch) clip = patch.clip
      if ('size' in patch) size = patch.size ?? 'md'
      if ('showPause' in patch) showPause = patch.showPause !== false
      // Rebuild only on a value change, not key presence — the React wrapper sends every
      // key each sync, and rebuilding would drop focus from a focused dot.
      const rebuild =
        ('labels' in patch && patch.labels !== labels) || ('slideIds' in patch && patch.slideIds !== slideIds)
      if ('labels' in patch) labels = patch.labels
      if ('slideIds' in patch) slideIds = patch.slideIds
      if ('className' in patch) className = patch.className
      if (rebuild) buildDots()
      applyLayout()
      render(engine.getState())
    },
    destroy() {
      unsubscribe()
      detachSwipe()
      detachAutoPause()
      pill.removeEventListener('click', onPillClick)
      strip.removeEventListener('keydown', onKeyDown)
      if (ownsEngine) engine.destroy()
    },
  }
}

// ── Styles ─────────────────────────────────────────────────────────────────────────────

let stylesInjected = false
/** Inject the pill stylesheet once. Called automatically unless `injectStyles: false`. */
export function injectStepperStyles(): void {
  if (stylesInjected || typeof document === 'undefined') return
  if (document.getElementById('slide-stepper-styles')) {
    stylesInjected = true
    return
  }
  const style = document.createElement('style')
  style.id = 'slide-stepper-styles'
  style.textContent = stepperStyles()
  document.head.appendChild(style)
  stylesInjected = true
}

/** The pill's CSS as a string (for callers who inject styles themselves / SSR). */
export function stepperStyles(): string {
  return `
.slide-stepper {
  display: inline-flex; align-items: center;
  gap: var(--stepper-pause-gap, 8px);
  /* Size presets re-reference the same override variable with different fallbacks (never
     reassign it), so one consumer-set --stepper-* wins across every size uniformly. */
  --_dot: var(--stepper-dot-size, 6px);
  --_gap: var(--stepper-gap, 6px);
  --_bar: var(--stepper-bar-size, 28px);
  --_hit: var(--stepper-hit-size, 36px);
  --_pad: 14px;
}
.slide-stepper--sm {
  --_dot: var(--stepper-dot-size, 5px); --_gap: var(--stepper-gap, 5px);
  --_bar: var(--stepper-bar-size, 22px); --_hit: var(--stepper-hit-size, 30px); --_pad: 11px;
}
.slide-stepper--lg {
  --_dot: var(--stepper-dot-size, 8px); --_gap: var(--stepper-gap, 7px);
  --_bar: var(--stepper-bar-size, 36px); --_hit: var(--stepper-hit-size, 44px); --_pad: 17px;
}
.slide-stepper--vertical { flex-direction: column; }
.slide-stepper-pill {
  display: flex; align-items: center;
  height: var(--_hit); padding: 0 var(--_pad);
  border-radius: var(--stepper-radius, 999px);
  background: var(--stepper-pill-bg, var(--muted, light-dark(#ececee, #26262b)));
  /* The pill owns horizontal drags (swipe = prev/next); vertical stays with the page. */
  touch-action: pan-y;
}
.slide-stepper--vertical .slide-stepper-pill {
  flex-direction: column;
  height: auto; width: var(--_hit); padding: var(--_pad) 0;
  touch-action: pan-x;
}
/* ── Tape-counter window ──
   JS feeds three integers (--_index, --_clip, --_count); everything else derives here.
   Keep in sync with visibleRange() in slide-stepper.ts. Each dot slot is dot+gap wide and
   the active slot is bar+gap, so:
     window = (clip-1) slots + active slot        strip = (count-1) slots + active slot
     ideal  = (index - (clip-1)/2) slots          (active bar dead-center)
     shift  = clamp(0, ideal, strip - window)     (pinned at the deck's ends) */
.slide-stepper-window {
  --_slot: calc(var(--_dot) + var(--_gap));
  --_win: calc((var(--_clip) - 1) * var(--_slot) + var(--_bar) + var(--_gap));
  --_ideal: calc((var(--_index) - (var(--_clip) - 1) / 2) * var(--_slot));
  --_shift: clamp(0px, var(--_ideal), calc((var(--_count) - var(--_clip)) * var(--_slot)));
  overflow: hidden;
  width: var(--_win);
}
.slide-stepper--vertical .slide-stepper-window { width: auto; height: var(--_win); }
.slide-stepper-strip {
  display: flex; width: max-content;
  transform: translateX(calc(-1 * var(--_shift)));
  transition: transform var(--stepper-strip-ms, 320ms) cubic-bezier(0.22, 1, 0.36, 1);
}
/* Deliberately physical (translateX, not logical/inline): the strip is elapsed time, not
   reading order — stories UIs don't mirror it under RTL, and neither do we. */
.slide-stepper--vertical .slide-stepper-strip {
  flex-direction: column; width: auto; height: max-content;
  transform: translateY(calc(-1 * var(--_shift)));
}
.slide-stepper-dot {
  appearance: none; -webkit-appearance: none; border: 0; margin: 0; padding: 0;
  background: transparent; cursor: pointer; color: inherit;
  display: grid; place-items: center;
  /* The slot is the tap target: full pill height, dot+gap wide. The active slot widening to
     bar+gap is what glides the neighbors apart. */
  width: calc(var(--_dot) + var(--_gap)); height: var(--_hit);
  transition: width 0.25s cubic-bezier(0.22, 1, 0.36, 1), height 0.25s cubic-bezier(0.22, 1, 0.36, 1);
}
.slide-stepper-dot.is-active { width: calc(var(--_bar) + var(--_gap)); }
.slide-stepper--vertical .slide-stepper-dot { width: var(--_hit); height: calc(var(--_dot) + var(--_gap)); }
.slide-stepper--vertical .slide-stepper-dot.is-active { height: calc(var(--_bar) + var(--_gap)); }
.slide-stepper-dot-track {
  position: relative; overflow: hidden; display: block;
  width: var(--_dot); height: var(--_dot);
  border-radius: var(--stepper-radius, 999px);
  background: var(--stepper-dot, var(--muted-foreground, light-dark(#8a8a93, #8b8b95)));
  opacity: 0.55;
  transition: width 0.25s cubic-bezier(0.22, 1, 0.36, 1), height 0.25s cubic-bezier(0.22, 1, 0.36, 1),
    background-color 0.2s ease, opacity 0.2s ease;
}
.slide-stepper-dot.is-done .slide-stepper-dot-track { opacity: 0.8; }
.slide-stepper-dot.is-active .slide-stepper-dot-track {
  width: var(--_bar); opacity: 1;
  background: var(--stepper-bar-bg, var(--border, light-dark(#dcdce1, #3a3a42)));
}
.slide-stepper--vertical .slide-stepper-dot.is-active .slide-stepper-dot-track { width: var(--_dot); height: var(--_bar); }
.slide-stepper-dot-fill {
  position: absolute; inset: 0 auto 0 0; width: 0%;
  border-radius: inherit;
  background: var(--stepper-fill, var(--primary, light-dark(#2f2f33, #e4e4e7)));
  /* The sweep is painted only while its dot is the active bar (JS remaps it to run from
     one-dot to full, so it's never smaller than an idle dot); it fades with the collapse. */
  opacity: 0;
}
.slide-stepper--vertical .slide-stepper-dot-fill { inset: 0 0 auto 0; width: 100%; height: 0%; }
.slide-stepper-dot.is-active .slide-stepper-dot-fill { opacity: 1; }
.slide-stepper-dot:focus-visible { outline: none; }
.slide-stepper-dot:focus-visible .slide-stepper-dot-track {
  outline: 2px solid var(--stepper-ring, var(--ring, light-dark(#a1a1aa, #71717a)));
  outline-offset: 2px;
}
.slide-stepper-pause {
  appearance: none; -webkit-appearance: none; border: 0; margin: 0; padding: 0;
  cursor: pointer; display: grid; place-items: center;
  width: var(--_hit); height: var(--_hit);
  border-radius: var(--stepper-radius, 999px);
  background: var(--stepper-pill-bg, var(--muted, light-dark(#ececee, #26262b)));
  color: var(--stepper-pause-fg, var(--foreground, light-dark(#3f3f46, #d4d4d8)));
  transition: filter 0.15s ease;
}
.slide-stepper-pause:hover { filter: brightness(0.96); }
.slide-stepper-pause:focus-visible {
  outline: 2px solid var(--stepper-ring, var(--ring, light-dark(#a1a1aa, #71717a)));
  outline-offset: 2px;
}
.slide-stepper-pause svg { width: 45%; height: 45%; }
@media (prefers-reduced-motion: reduce) {
  /* Decorative motion stops; the fill sweep stays (its inline transition wins) — it *is*
     the progress information, and slide timing never depends on CSS either way. */
  .slide-stepper-strip, .slide-stepper-dot, .slide-stepper-dot-track { transition: none !important; }
}
`
}
