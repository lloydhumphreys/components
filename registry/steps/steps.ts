// steps — a zero-dependency 1-2-3-4 step indicator for wizards and multi-step flows.
//
// EXPERIMENTAL — the API is still settling and will change in breaking ways; pin what you
// install.
//
// A row (or column) of numbered circular markers joined by connector lines, one per step;
// each step has a title, an optional description (revealed only while that step is active),
// and an optional icon that replaces its number. Forward progress is earned through next();
// any step you've already reached stays clickable to jump back, and forward jumps beyond
// the furthest-reached step are blocked. In a narrow container the horizontal variant
// collapses: markers stay as a compact row and the active step's title + description take
// over from the per-step titles, centered beneath the markers (pure CSS container query —
// no JS resize observing). No "Step 2 of 4" counter there: the marker row above already
// visualizes exactly that.
//
// Two layers, so you choose how much it owns:
//   createStepsEngine()   headless index + furthest-reached frontier + per-step status — no DOM
//   createSteps()         the indicator, driving or sharing an engine
//
// The engine is the single source of truth and this component is deliberately *only* the
// indicator: subscribe() (or the React useSteps hook in steps-react.tsx) is how the rest of
// the app renders its panels, gates its own Continue button, and reacts to jumps. Status is
// derived, never stored: disabled → error (explicit flag) → active → completed (reached but
// not current) → upcoming. Only next() grows the frontier — browsing back to review a step
// never un-completes anything.
//
// Framework-agnostic vanilla DOM — no dependencies, no build step. A React wrapper
// (<Steps> + useSteps) lives in steps-react.tsx; a shadcn-native rebuild lives in
// steps-shadcn.tsx.
//
// Not mirrored for RTL in this version: the connector math is physical (left/width), not
// logical.
//
// ── State ownership ───────────────────────────────────────────────────────────────────
// The engine and its earned-progress frontier — not a prop — are the single source of
// truth for navigation. `index` is only an uncontrolled starting seed; there's no
// controlled-index mode, because accepting an arbitrary index every render could silently
// break the frontier invariant. Drive jumps through goTo()/next()/prev() instead.
//
// ── Theming ────────────────────────────────────────────────────────────────────────────
// Styles consume shadcn theme tokens when present, with light-dark() fallbacks so the
// control reads correctly standalone in both themes. Override independently of the app
// theme via the --steps-* escape hatches (set on the root or any ancestor):
//   --steps-marker-bg / --steps-marker-fg          upcoming marker      (default: --muted / --muted-foreground)
//   --steps-marker-active-bg / --steps-marker-active-fg
//                                                  active marker        (default: --primary / --primary-foreground)
//   --steps-marker-done-bg / --steps-marker-done-fg
//                                                  completed marker     (default: the active pair)
//   --steps-error / --steps-error-fg               error marker + title (default: --destructive)
//   --steps-connector                              unfilled connector   (default: --border)
//   --steps-connector-fill                         reached connector    (default: --primary)
//   --steps-title / --steps-title-active           title text           (default: --foreground)
//   --steps-description                            description text     (default: --muted-foreground)
//   --steps-ring                                   focus ring           (default: --ring)
//   --steps-radius                                 marker radius        (default: 999px)
//   --steps-marker-size / --steps-gap / --steps-connector-size
//                                                  geometry. Defaults scale with size
//                                                  sm/md/lg; setting one overrides every
//                                                  size preset uniformly.
// The horizontal collapse breakpoint (560px container width) is a literal in the
// stylesheet — container query conditions can't read custom properties. To change it, ship
// the CSS yourself: injectStyles: false + your own edited copy of stepsStyles().

// ── Engine ─────────────────────────────────────────────────────────────────────────────

/** Derived per-step status, in resolution order: `disabled` (the step's own flag) beats
 *  `error` (an explicit setStepError flag) beats `active` beats `completed` (reached — at
 *  or behind the furthest frontier — but not current) beats `upcoming`. */
export type StepStatus = 'upcoming' | 'active' | 'completed' | 'error' | 'disabled'

/** How an active-step change happened: a Continue/Back call ('next' / 'prev'), a direct
 *  jump to a reached step ('goto' — marker click or steps-array reconciliation), or
 *  reset(). */
export type StepsChangeReason = 'next' | 'prev' | 'goto' | 'reset'

export interface StepItem {
  /** Stable identity for goTo/setStepError-by-id. Defaults to String(index) if omitted —
   *  supply real ids if you'll ever splice the steps array. */
  id?: string
  title: string
  /** Shown only while this step is active (and in the collapsed summary line). */
  description?: string
  /** Optional icon replacing the number in the marker — a factory returning a fresh node,
   *  called on every render. Takes precedence over the built-in status icons. */
  icon?: () => Node
  /** Hard-disable: never reachable; next()/prev() skip over it, goTo() refuses it. */
  disabled?: boolean
}

export interface StepsEngineOptions {
  steps: StepItem[]
  /** Initial active index. Default 0; clamped into range, then nudged to the nearest
   *  non-disabled step. This is an uncontrolled starting point — drive jumps through
   *  next()/prev()/goTo() instead. */
  index?: number
  /** Seed the furthest-reached frontier ahead of `index`, for resuming a wizard whose
   *  earlier steps are already known-complete. Clamped to >= the resolved index. Default:
   *  the resolved index (nothing pre-completed). */
  initialFurthest?: number
  /** Fired whenever the active step changes. When a steps patch replaces the active id at
   *  the same array position, `index` and `prevIndex` can be equal. */
  onChange?: (index: number, prevIndex: number, reason: StepsChangeReason) => void
}

export interface StepsEngineState {
  index: number
  /** steps[index].id, or String(index) when the step has no id. */
  id: string
  count: number
  /** Highest index ever reached via next(). Only next() grows this — prev()/goTo() never
   *  shrink it, so completed markers survive browsing backward. */
  furthest: number
  /** The engine's current steps array (the same reference you passed in). */
  steps: StepItem[]
  /** One derived entry per step. */
  status: StepStatus[]
  isFirst: boolean
  isLast: boolean
  /** A non-disabled step exists after the active one. */
  canNext: boolean
  /** A non-disabled step exists before the active one. */
  canPrev: boolean
}

export interface StepsEngine {
  getState(): StepsEngineState
  /** Subscribe to state changes; returns unsubscribe. Fires on index/error/steps changes. */
  subscribe(fn: (state: StepsEngineState) => void): () => void
  /** Advance to the next non-disabled step (skipping consecutive disabled ones); no-op if
   *  none. The only call that grows `furthest`. */
  next(): void
  /** Back to the previous non-disabled step; no-op if none. Never touches `furthest`. */
  prev(): void
  /** Jump to a reached step (by index or id): not disabled, and at or behind `furthest`.
   *  No-op otherwise, and a silent no-op (no onChange, no notify) when `target` is already
   *  the active step. */
  goTo(target: number | string): void
  /** Whether goTo(target) would be honored. True for the active step itself. */
  canGoTo(target: number | string): boolean
  /** Index of the step with this id (explicit or the String(index) default), or -1. */
  indexOf(id: string): number
  /** Flag or clear an explicit error on a step, independent of navigation. A steps patch
   *  keeps flags attached by stable step id. */
  setStepError(target: number | string, error: boolean): void
  /** Back to the constructed initial index and frontier; clears every error flag. */
  reset(): void
  /** Patch `steps` live. Keys present in the patch are applied and absent keys are
   *  untouched (`steps: undefined` is kept — it has no default), so the React wrapper can
   *  pass every prop each sync. Active/reached/error state follows stable ids; if the
   *  active id disappears or becomes disabled, the engine moves to the nearest enabled
   *  step ('goto'). */
  setOptions(patch: Partial<Pick<StepsEngineOptions, 'steps'>>): void
  /** Drop subscribers. */
  destroy(): void
}

const clampIndex = (i: number, count: number) => Math.min(Math.max(Math.floor(i), 0), count - 1)

/**
 * Headless index + frontier + per-step status — the single source of truth behind the
 * indicator and the React useSteps hook. Construction is side-effect-free (no DOM, no
 * timers), so it's safe in a useState initializer and on the server.
 */
export function createStepsEngine(opts: StepsEngineOptions): StepsEngine {
  let steps = normalizeSteps(opts.steps)
  let count = steps.length
  const errors = new Set<number>()
  const subs = new Set<(s: StepsEngineState) => void>()
  const stepId = (step: StepItem, i: number) => step.id ?? String(i)

  /** Nearest non-disabled step to `i`, preferring forward; `i` itself if every step is
   *  disabled (nothing is reachable then anyway). */
  const nearestEnabled = (i: number): number => {
    if (!steps[i]?.disabled) return i
    for (let d = 1; d < count; d++) {
      if (i + d < count && !steps[i + d].disabled) return i + d
      if (i - d >= 0 && !steps[i - d].disabled) return i - d
    }
    return i
  }

  let index = nearestEnabled(clampIndex(opts.index ?? 0, count))
  let furthest = Math.max(index, clampIndex(opts.initialFurthest ?? index, count))
  const initialIndex = index
  const initialId = stepId(steps[index], index)
  const initialReachedIds = new Set(
    steps.slice(0, furthest + 1).map((step, i) => stepId(step, i)),
  )

  const statusFor = (i: number): StepStatus => {
    if (steps[i].disabled) return 'disabled'
    if (errors.has(i)) return 'error'
    if (i === index) return 'active'
    if (i <= furthest) return 'completed'
    return 'upcoming'
  }

  const nextEnabled = (from: number): number => {
    for (let j = from + 1; j < count; j++) if (!steps[j].disabled) return j
    return -1
  }
  const prevEnabled = (from: number): number => {
    for (let j = from - 1; j >= 0; j--) if (!steps[j].disabled) return j
    return -1
  }

  const getState = (): StepsEngineState => {
    const canNext = nextEnabled(index) !== -1
    const canPrev = prevEnabled(index) !== -1
    return {
      index,
      id: stepId(steps[index], index),
      count,
      furthest,
      steps,
      status: steps.map((_, i) => statusFor(i)),
      isFirst: !canPrev,
      isLast: !canNext,
      canNext,
      canPrev,
    }
  }

  const notify = () => {
    const s = getState()
    subs.forEach((fn) => fn(s))
  }

  const jump = (to: number, reason: StepsChangeReason) => {
    const prev = index
    index = to
    if (index !== prev) opts.onChange?.(index, prev, reason)
    notify()
  }

  const resolve = (target: number | string): number => {
    if (typeof target === 'number') {
      const i = Math.floor(target)
      return i >= 0 && i < count ? i : -1
    }
    return steps.findIndex((s, i) => stepId(s, i) === target)
  }

  const canGoTo = (target: number | string): boolean => {
    const i = resolve(target)
    return i !== -1 && !steps[i].disabled && i <= furthest
  }

  return {
    getState,
    subscribe(fn) {
      subs.add(fn)
      return () => subs.delete(fn)
    },
    next() {
      const j = nextEnabled(index)
      if (j === -1) return
      furthest = Math.max(furthest, j)
      jump(j, 'next')
    },
    prev() {
      const j = prevEnabled(index)
      if (j === -1) return
      jump(j, 'prev')
    },
    goTo(target) {
      const i = resolve(target)
      if (i === -1 || i === index || !canGoTo(i)) return
      jump(i, 'goto')
    },
    canGoTo,
    indexOf: (id) => steps.findIndex((s, i) => stepId(s, i) === id),
    setStepError(target, error) {
      const i = resolve(target)
      if (i === -1) return
      const changed = error ? (errors.has(i) ? false : (errors.add(i), true)) : errors.delete(i)
      if (changed) notify()
    },
    reset() {
      errors.clear()
      const initialMatch = steps.findIndex((step, i) => stepId(step, i) === initialId)
      const to = nearestEnabled(
        initialMatch === -1 ? clampIndex(initialIndex, count) : initialMatch,
      )
      furthest = to
      steps.forEach((step, i) => {
        if (initialReachedIds.has(stepId(step, i))) furthest = Math.max(furthest, i)
      })
      jump(to, 'reset')
    },
    setOptions(patch) {
      if ('steps' in patch && patch.steps != null) {
        const prev = index
        const previousId = stepId(steps[index], index)
        const reachedIds = new Set(
          steps.slice(0, furthest + 1).map((step, i) => stepId(step, i)),
        )
        const errorIds = new Set(
          [...errors].map((i) => stepId(steps[i], i)),
        )

        steps = normalizeSteps(patch.steps)
        count = steps.length
        errors.clear()
        steps.forEach((step, i) => {
          if (errorIds.has(stepId(step, i))) errors.add(i)
        })

        const currentMatch = steps.findIndex((step, i) => stepId(step, i) === previousId)
        index = nearestEnabled(
          currentMatch === -1 ? clampIndex(prev, count) : currentMatch,
        )
        furthest = index
        steps.forEach((step, i) => {
          if (reachedIds.has(stepId(step, i))) furthest = Math.max(furthest, i)
        })
        if (stepId(steps[index], index) !== previousId) {
          opts.onChange?.(index, prev, 'goto')
        }
      }
      notify()
    },
    destroy() {
      subs.clear()
    },
  }
}

function normalizeSteps(steps: StepItem[]): StepItem[] {
  if (steps.length > 0) return steps
  console.warn('steps: `steps` is empty — substituting a single disabled placeholder step.')
  return [{ title: 'Step', disabled: true }]
}

// ── Indicator ──────────────────────────────────────────────────────────────────────────

export interface StepsLabels {
  /** Accessible name of the indicator. Default 'Progress'. */
  root?: string
  /** Accessible name per step button. Default composes `Step ${i + 1} of ${count}: ${title}`
   *  plus the description while active and a status suffix (completed / error / disabled). */
  step?: (index: number, count: number, step: StepItem, status: StepStatus) => string
}

export interface StepsOptions extends StepsEngineOptions {
  /** Drive an engine you already own (e.g. shared with your own panels, or from the React
   *  hook) instead of creating one. When set, every engine option on this object (steps,
   *  index, initialFurthest, onChange) is ignored — the engine owns those — and only the
   *  presentational options below apply. */
  engine?: StepsEngine
  /** Layout direction. Default 'horizontal'. Only the horizontal variant collapses in
   *  narrow containers; vertical is already compact. */
  orientation?: 'horizontal' | 'vertical'
  /** Geometry preset. Default 'md'. (Every dimension is also a --steps-* variable.) */
  size?: 'sm' | 'md' | 'lg'
  labels?: StepsLabels
  /** Inject the component stylesheet on first use. Default true; set false to ship the CSS
   *  yourself (see `stepsStyles()`). */
  injectStyles?: boolean
  /** Extra class(es) added to the root, for your own overrides. */
  className?: string
}

export interface Steps {
  /** The control root. Append it anywhere. */
  readonly element: HTMLElement
  /** The engine driving this indicator (own or shared) — subscribe to sync your panels. */
  readonly engine: StepsEngine
  getState(): StepsEngineState
  next(): void
  prev(): void
  goTo(target: number | string): void
  setStepError(target: number | string, error: boolean): void
  reset(): void
  /** Patch presentational options (orientation, size, labels, className) and — when the
   *  indicator owns its engine — steps. Keys present in the patch are applied, with
   *  `undefined` resetting that option to its default; absent keys are untouched. (The
   *  React wrapper passes every prop each sync, so a removed prop genuinely resets.) */
  setState(patch: Partial<StepsOptions>): void
  /** Detach listeners; destroys the engine only if the indicator created it. */
  destroy(): void
}

/** Build the indicator. Append `.element` anywhere; the horizontal variant is its own CSS
 *  container and collapses itself under 560px of available width. */
export function createSteps(opts: StepsOptions): Steps {
  if (opts.injectStyles !== false) injectStepsStyles()

  const engine = opts.engine ?? createStepsEngine(opts)
  const ownsEngine = !opts.engine
  let orientation = opts.orientation ?? 'horizontal'
  let size = opts.size ?? 'md'
  let labels = opts.labels
  let className = opts.className
  let steps = engine.getState().steps

  const root = document.createElement('nav')
  const list = document.createElement('ol')
  list.className = 'steps-list'
  // list-style: none strips the implicit list semantics in Safari/VoiceOver — restore them.
  list.setAttribute('role', 'list')
  const summary = document.createElement('div')
  summary.className = 'steps-summary'
  const summaryTitle = document.createElement('span')
  summaryTitle.className = 'steps-summary-title'
  const summaryDesc = document.createElement('p')
  summaryDesc.className = 'steps-summary-desc'
  summary.append(summaryTitle, summaryDesc)
  root.append(list, summary)

  let items: HTMLLIElement[] = []
  let buttons: HTMLButtonElement[] = []
  let markers: HTMLSpanElement[] = []

  const applyLayout = () => {
    root.className = `steps steps--${orientation} steps--${size}${className ? ` ${className}` : ''}`
    root.setAttribute('aria-label', labels?.root ?? 'Progress')
  }

  const buildList = () => {
    list.replaceChildren()
    items = []
    buttons = []
    markers = []
    steps.forEach((step, i) => {
      const li = document.createElement('li')
      li.className = 'step'
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'step-hit'
      const marker = document.createElement('span')
      marker.className = 'step-marker'
      const text = document.createElement('span')
      text.className = 'step-text'
      const title = document.createElement('span')
      title.className = 'step-title'
      title.textContent = step.title
      title.title = step.title // ellipsized inactive titles keep a native tooltip
      const descWrap = document.createElement('span')
      descWrap.className = 'step-description-wrap'
      const desc = document.createElement('p')
      desc.className = 'step-description'
      desc.textContent = step.description ?? ''
      descWrap.appendChild(desc)
      text.append(title, descWrap)
      btn.append(marker, text)
      btn.addEventListener('click', () => engine.goTo(i))
      li.appendChild(btn)
      list.appendChild(li)
      items.push(li)
      buttons.push(btn)
      markers.push(marker)
    })
  }

  const stepLabel = (i: number, s: StepsEngineState): string => {
    const step = steps[i]
    const status = s.status[i]
    const custom = labels?.step?.(i, s.count, step, status)
    if (custom != null) return custom
    let label = `Step ${i + 1} of ${s.count}: ${step.title}`
    if (i === s.index && step.description) label += ` — ${step.description}`
    if (status === 'completed') label += ', completed'
    else if (status === 'error') label += ', has an error'
    else if (status === 'disabled') label += ', unavailable'
    return label
  }

  /** Built-in status icons — only these trusted strings ever go through innerHTML; user
   *  text is always textContent. */
  const statusIcon = (status: StepStatus): SVGSVGElement | null => {
    if (status !== 'completed' && status !== 'error' && status !== 'disabled') return null
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', '0 0 24 24')
    svg.setAttribute('aria-hidden', 'true')
    svg.setAttribute('fill', 'none')
    svg.setAttribute('stroke', 'currentColor')
    svg.setAttribute('stroke-width', '2.6')
    svg.setAttribute('stroke-linecap', 'round')
    svg.setAttribute('stroke-linejoin', 'round')
    if (status === 'completed') svg.innerHTML = '<path d="m5 12.5 4.5 4.5L19 7.5"/>'
    else if (status === 'error') svg.innerHTML = '<path d="M12 9v4.5"/><path d="M12 17.2v.05"/><path d="M10.3 4.1 2.9 17a2 2 0 0 0 1.7 3h14.8a2 2 0 0 0 1.7-3L13.7 4.1a2 2 0 0 0-3.4 0Z"/>'
    else svg.innerHTML = '<rect x="5.5" y="10.5" width="13" height="9.5" rx="2"/><path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3"/>'
    return svg
  }

  const render = (s: StepsEngineState) => {
    // A shared engine can change steps out from under us (its owner's setOptions) — this
    // subscription is the only channel that reaches the indicator, so rebuild here.
    if (s.steps !== steps) {
      steps = s.steps
      buildList()
    }
    items.forEach((li, i) => {
      const status = s.status[i]
      li.dataset.status = status
      if (i <= s.furthest) li.dataset.filled = 'true'
      else delete li.dataset.filled
      if (i === s.index) li.setAttribute('aria-current', 'step')
      else li.removeAttribute('aria-current')
      const btn = buttons[i]
      // Native disabled gives click-blocking and unfocusability for free on unreached and
      // disabled steps; the active step stays enabled (its goTo is a harmless no-op).
      btn.disabled = !engine.canGoTo(i)
      btn.setAttribute('aria-label', stepLabel(i, s))
      markers[i].replaceChildren(steps[i].icon?.() ?? statusIcon(status) ?? document.createTextNode(String(i + 1)))
    })
    summaryTitle.textContent = steps[s.index].title
    summaryDesc.textContent = steps[s.index].description ?? ''
    summaryDesc.style.display = steps[s.index].description ? '' : 'none'
  }

  // Arrow/Home/End move focus between reachable steps as a convenience on top of the
  // standard Tab order (this is not a composite widget — no roving tabindex). Only this
  // handler ever calls focus(); the render loop never does, so app-driven next()/goTo()
  // can't yank focus into the indicator.
  const onKeyDown = (e: KeyboardEvent) => {
    const hit = (e.target as Element | null)?.closest('.step-hit')
    if (!hit) return
    const from = buttons.indexOf(hit as HTMLButtonElement)
    if (from === -1) return
    const enabled = buttons.map((b, i) => (!b.disabled ? i : -1)).filter((i) => i !== -1)
    let to = -1
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') to = enabled.find((i) => i > from) ?? -1
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') to = [...enabled].reverse().find((i) => i < from) ?? -1
    else if (e.key === 'Home') to = enabled[0] ?? -1
    else if (e.key === 'End') to = enabled[enabled.length - 1] ?? -1
    else return
    e.preventDefault()
    if (to !== -1 && to !== from) buttons[to].focus()
  }
  list.addEventListener('keydown', onKeyDown)

  applyLayout()
  buildList()
  render(engine.getState())
  const unsubscribe = engine.subscribe(render)

  return {
    element: root,
    engine,
    getState: () => engine.getState(),
    next: () => engine.next(),
    prev: () => engine.prev(),
    goTo: (t) => engine.goTo(t),
    setStepError: (t, error) => engine.setStepError(t, error),
    reset: () => engine.reset(),
    setState(patch) {
      if (ownsEngine && 'steps' in patch) engine.setOptions({ steps: patch.steps })
      if ('orientation' in patch) orientation = patch.orientation ?? 'horizontal'
      if ('size' in patch) size = patch.size ?? 'md'
      if ('labels' in patch) labels = patch.labels
      if ('className' in patch) className = patch.className
      applyLayout()
      render(engine.getState())
    },
    destroy() {
      unsubscribe()
      list.removeEventListener('keydown', onKeyDown)
      if (ownsEngine) engine.destroy()
    },
  }
}

// ── Styles ─────────────────────────────────────────────────────────────────────────────

let stylesInjected = false
/** Inject the indicator stylesheet once. Called automatically unless `injectStyles: false`. */
export function injectStepsStyles(): void {
  if (stylesInjected || typeof document === 'undefined') return
  if (document.getElementById('steps-styles')) {
    stylesInjected = true
    return
  }
  const style = document.createElement('style')
  style.id = 'steps-styles'
  style.textContent = stepsStyles()
  document.head.appendChild(style)
  stylesInjected = true
}

/** The indicator's CSS as a string (for callers who inject styles themselves / SSR). */
export function stepsStyles(): string {
  return `
.steps {
  display: block;
  /* Size presets re-reference the same override variable with different fallbacks (never
     reassign it), so one consumer-set --steps-* wins across every size uniformly. */
  --_marker: var(--steps-marker-size, 28px);
  --_gap: var(--steps-gap, 10px);
  --_conn: var(--steps-connector-size, 2px);
  --_cgap: 3px;
  --_pad: 4px;
  --_title-size: 13.5px;
  --_desc-size: 13px;
}
.steps--sm { --_marker: var(--steps-marker-size, 22px); --_gap: var(--steps-gap, 8px); --_title-size: 12.5px; --_desc-size: 12px; }
.steps--lg { --_marker: var(--steps-marker-size, 34px); --_gap: var(--steps-gap, 12px); --_conn: var(--steps-connector-size, 2.5px); --_title-size: 15px; --_desc-size: 14px; }
/* The root is its own query container, so the collapse reacts to the space the indicator
   actually gets — no wrapper element or viewport breakpoint involved. */
.steps--horizontal { container-type: inline-size; container-name: steps; }
.steps-list {
  list-style: none; margin: 0; padding: 0;
  display: flex;
}
.steps--vertical .steps-list { flex-direction: column; }
.step { position: relative; flex: 1 1 0; min-width: 0; }
.steps--vertical .step { flex: none; }
.steps--vertical .step:not(:last-child) { padding-bottom: 14px; }
.step-hit {
  appearance: none; -webkit-appearance: none; border: 0; margin: 0;
  background: transparent; cursor: pointer; color: inherit; font: inherit;
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  width: 100%; padding: var(--_pad) var(--_gap);
  text-align: center;
}
.step-hit:disabled { cursor: default; }
.steps--vertical .step-hit {
  flex-direction: row; align-items: flex-start; gap: var(--_gap);
  text-align: start; padding: var(--_pad);
}
.step-marker {
  position: relative; z-index: 1;
  display: grid; place-items: center; flex: none;
  width: var(--_marker); height: var(--_marker);
  border-radius: var(--steps-radius, 999px);
  background: var(--steps-marker-bg, var(--muted, light-dark(#ececee, #26262b)));
  color: var(--steps-marker-fg, var(--muted-foreground, light-dark(#8a8a93, #8b8b95)));
  font-size: calc(var(--_marker) * 0.42); font-weight: 600;
  font-variant-numeric: tabular-nums;
  transition: background-color 0.2s ease, color 0.2s ease;
}
.step-marker svg { width: 55%; height: 55%; }
.step-hit:not(:disabled):hover .step-marker { filter: brightness(0.96); }
.step[data-status="active"] .step-marker {
  background: var(--steps-marker-active-bg, var(--primary, light-dark(#2f2f33, #e4e4e7)));
  color: var(--steps-marker-active-fg, var(--primary-foreground, light-dark(#fafafa, #18181b)));
}
.step[data-status="completed"] .step-marker {
  background: var(--steps-marker-done-bg, var(--steps-marker-active-bg, var(--primary, light-dark(#2f2f33, #e4e4e7))));
  color: var(--steps-marker-done-fg, var(--steps-marker-active-fg, var(--primary-foreground, light-dark(#fafafa, #18181b))));
}
.step[data-status="error"] .step-marker {
  background: var(--steps-error, var(--destructive, light-dark(#dc2626, #ef4444)));
  color: var(--steps-error-fg, light-dark(#fafafa, #fafafa));
}
.step[data-status="disabled"] .step-marker { opacity: 0.45; }
/* ── Connectors ──
   Horizontal: each column is flex: 1 1 0, so the boundary between neighbors is exact and
   the incoming line for step i runs from the previous marker's edge to its own. */
.steps--horizontal .step:not(:first-child)::before {
  content: ''; position: absolute;
  top: calc(var(--_pad) + var(--_marker) / 2 - var(--_conn) / 2);
  left: calc(-50% + var(--_marker) / 2 + var(--_cgap));
  width: calc(100% - var(--_marker) - 2 * var(--_cgap));
  height: var(--_conn); border-radius: 999px;
  background: var(--steps-connector, var(--border, light-dark(#dcdce1, #3a3a42)));
  transition: background-color 0.2s ease;
}
.steps--horizontal .step[data-filled]:not(:first-child)::before {
  background: var(--steps-connector-fill, var(--primary, light-dark(#2f2f33, #e4e4e7)));
}
/* Vertical: an outgoing tail below each marker, running alongside the text down to the next
   row — it stretches with the active step's revealed description automatically. Filled when
   the *next* step has been reached (the same segment the horizontal ::before paints). */
.steps--vertical .step:not(:last-child)::after {
  content: ''; position: absolute;
  left: calc(var(--_pad) + var(--_marker) / 2 - var(--_conn) / 2);
  top: calc(var(--_pad) + var(--_marker) + var(--_cgap));
  bottom: var(--_cgap);
  width: var(--_conn); border-radius: 999px;
  background: var(--steps-connector, var(--border, light-dark(#dcdce1, #3a3a42)));
  transition: background-color 0.2s ease;
}
.steps--vertical .step:has(+ .step[data-filled])::after {
  background: var(--steps-connector-fill, var(--primary, light-dark(#2f2f33, #e4e4e7)));
}
.step-text { display: flex; flex-direction: column; align-items: center; min-width: 0; max-width: 100%; }
.steps--vertical .step-text { align-items: flex-start; flex: 1 1 auto; padding-top: calc((var(--_marker) - var(--_title-size) * 1.4) / 2); }
.step-title {
  font-size: var(--_title-size); font-weight: 500; line-height: 1.4;
  color: var(--steps-title, var(--foreground, light-dark(#3f3f46, #d4d4d8)));
  transition: color 0.2s ease, opacity 0.2s ease;
}
.step[data-status="upcoming"] .step-title, .step[data-status="disabled"] .step-title { opacity: 0.55; }
/* "Current step" visuals key off aria-current, not data-status — an errored active step
   keeps its error marker/title color yet still reads as the step you're on. */
.step[aria-current="step"] .step-title {
  font-weight: 600;
  color: var(--steps-title-active, var(--foreground, light-dark(#18181b, #fafafa)));
}
.step[data-status="error"] .step-title { color: var(--steps-error, var(--destructive, light-dark(#dc2626, #ef4444))); }
/* Inactive titles hold one ellipsized line so columns stay tidy; the active title (with the
   most visual room) is allowed to wrap. */
.steps--horizontal .step:not([aria-current="step"]) .step-title { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
/* Description reveal: grid-rows 0fr -> 1fr animates height-to-auto with no JS measuring.
   Every step owns an (empty when inactive) wrap, so the reveal happens in place. */
.step-description-wrap {
  display: grid; grid-template-rows: 0fr;
  transition: grid-template-rows 220ms cubic-bezier(0.22, 1, 0.36, 1);
}
.step-description-wrap > .step-description { overflow: hidden; min-height: 0; }
.step[aria-current="step"] .step-description-wrap { grid-template-rows: 1fr; }
.step-description {
  margin: 0; padding-top: 3px;
  font-size: var(--_desc-size); line-height: 1.45;
  color: var(--steps-description, var(--muted-foreground, light-dark(#8a8a93, #8b8b95)));
  opacity: 0;
  transition: opacity 0.2s ease 60ms;
}
.step[aria-current="step"] .step-description { opacity: 1; }
.step-hit:focus-visible { outline: none; }
.step-hit:focus-visible .step-marker {
  outline: 2px solid var(--steps-ring, var(--ring, light-dark(#a1a1aa, #71717a)));
  outline-offset: 2px;
}
/* ── Collapsed summary (horizontal only) ──
   Under 560px of container width the per-step titles hide, markers tighten into a compact
   row, and the active title + description take over, centered. No "Step 2 of 4" counter:
   the marker row above already visualizes the position. The breakpoint is a literal:
   container query conditions can't read custom properties. */
.steps-summary { display: none; text-align: center; }
.steps-summary-title {
  font-size: var(--_title-size); font-weight: 600;
  color: var(--steps-title-active, var(--foreground, light-dark(#18181b, #fafafa)));
}
.steps-summary-desc {
  margin: 3px 0 0;
  font-size: var(--_desc-size); line-height: 1.45;
  color: var(--steps-description, var(--muted-foreground, light-dark(#8a8a93, #8b8b95)));
}
@container steps (max-width: 560px) {
  /* A container query can't style its own container, so the overrides land on .steps-list
     (and the summary), which every marker/connector reads through inheritance. */
  .steps--horizontal .steps-list { --_marker: var(--steps-marker-size, 22px); --_gap: var(--steps-gap, 4px); }
  .steps--horizontal .step-text { display: none; }
  .steps--horizontal .steps-summary { display: block; margin-top: 10px; }
}
@media (prefers-reduced-motion: reduce) {
  .step::before, .step::after, .step-marker, .step-title, .step-description-wrap, .step-description { transition: none !important; }
}
`
}
