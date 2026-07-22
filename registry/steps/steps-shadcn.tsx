// steps-shadcn — the 1-2-3-4 wizard step indicator composed shadcn-natively.
//
// EXPERIMENTAL — the API is still settling and will change in breaking ways; pin what you
// install.
//
// Same model as the vanilla `steps` (a headless engine tracking the active index and the
// furthest-reached frontier; a row or column of markers + titles where only the active
// step reveals its description), but built from your app's actual pieces: Tailwind theme
// tokens for every color, `cn` for classes, lucide icons for the built-in completed /
// error / locked markers. Inside a shadcn app it matches your theme untouched.
//
//   const wizard = useSteps({ steps })   headless — gate your own Continue on wizard.canNext
//   <Steps engine={wizard.engine} />     the indicator, sharing that engine
//   <Steps steps={steps} />              or self-managed, if you only need the indicator
//
// Navigation rules live in the engine: next() is the only call that grows the frontier,
// reached steps stay clickable to jump back, forward jumps beyond the frontier are
// blocked, disabled steps are skipped. Status is derived, never stored: disabled → error →
// active → completed → upcoming.
//
// The horizontal variant is its own Tailwind v4 container (@container/steps): under 560px
// of available width the per-step titles hide and the active step's title + description
// take over, centered beneath the markers (which stay as a compact row). No "Step 2 of 4"
// counter there: the marker row above already visualizes exactly that.
//
// Self-contained on purpose: the engine is inlined rather than imported from the vanilla
// core, so this file installs alone. See steps.ts for the annotated reference
// implementation — the navigation semantics here are identical.
//
// State ownership: the engine and its frontier own navigation, not React state. `index` is
// only an uncontrolled starting seed — there's deliberately no controlled-index prop, since
// an arbitrary index on every render could silently break the earned-progress invariant.

'use client'

import { useEffect, useRef, useState } from 'react'
import type { ComponentProps, ComponentType, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import { CheckIcon, LockIcon, TriangleAlertIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Engine ─────────────────────────────────────────────────────────────────────────────

type StepStatus = 'upcoming' | 'active' | 'completed' | 'error' | 'disabled'
type StepsChangeReason = 'next' | 'prev' | 'goto' | 'reset'

interface StepItem {
  /** Stable identity for goTo/setStepError-by-id. Defaults to String(index) if omitted —
   *  supply real ids if you'll ever splice or reorder the steps array. */
  id?: string
  title: string
  /** Shown only while this step is active (and in the collapsed summary line). */
  description?: string
  /** Optional icon replacing the number in the marker. Takes precedence over the built-in
   *  status icons. The component instantiates and sizes it — pass the component itself,
   *  not an element. */
  icon?: ComponentType<{ className?: string }>
  /** Hard-disable: never reachable; next()/prev() skip over it, goTo() refuses it. */
  disabled?: boolean
}

interface StepsEngineOptions {
  steps: StepItem[]
  /** Initial active index — an uncontrolled starting point, not a controlled value. */
  index?: number
  /** Seed the furthest-reached frontier ahead of `index` (resuming a wizard). */
  initialFurthest?: number
  onChange?: (index: number, prevIndex: number, reason: StepsChangeReason) => void
}

interface StepsEngineState {
  index: number
  id: string
  count: number
  /** Highest index ever reached via next(). Only next() grows this. */
  furthest: number
  steps: StepItem[]
  status: StepStatus[]
  isFirst: boolean
  isLast: boolean
  canNext: boolean
  canPrev: boolean
}

interface StepsEngine {
  getState(): StepsEngineState
  subscribe(fn: (state: StepsEngineState) => void): () => void
  next(): void
  prev(): void
  goTo(target: number | string): void
  canGoTo(target: number | string): boolean
  indexOf(id: string): number
  setStepError(target: number | string, error: boolean): void
  reset(): void
  setOptions(patch: Partial<Pick<StepsEngineOptions, 'steps'>>): void
  destroy(): void
}

const clampIndex = (i: number, count: number) => Math.min(Math.max(Math.floor(i), 0), count - 1)

function normalizeSteps(steps: StepItem[]): StepItem[] {
  if (steps.length > 0) return steps
  console.warn('steps: `steps` is empty — substituting a single disabled placeholder step.')
  return [{ title: 'Step', disabled: true }]
}

function createEngine(opts: StepsEngineOptions): StepsEngine {
  let steps = normalizeSteps(opts.steps)
  let count = steps.length
  const errors = new Set<number>()
  const subs = new Set<(s: StepsEngineState) => void>()
  const stepId = (step: StepItem, i: number) => step.id ?? String(i)

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
    // Keys present in the patch are applied (`steps: undefined` is kept — it has no
    // default); absent keys are untouched, so the component passes every prop each sync.
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

// ── Hook ───────────────────────────────────────────────────────────────────────────────

interface UseStepsOptions extends StepsEngineOptions {}

interface UseStepsReturn extends StepsEngineState {
  /** Hand this to <Steps engine={…}> (and anything else) to share the one source of truth. */
  engine: StepsEngine
  next: () => void
  prev: () => void
  goTo: (target: number | string) => void
  setStepError: (target: number | string, error: boolean) => void
  reset: () => void
}

/** Headless: an engine plus its live state. Share `engine` with <Steps>, key your panels
 *  off `index`/`id`, and gate your own Continue button on `canNext`/`isLast`. */
function useSteps(opts: UseStepsOptions): UseStepsReturn {
  const cb = useRef({ onChange: opts.onChange })
  cb.current = { onChange: opts.onChange }

  const [engine] = useState(() =>
    createEngine({
      steps: opts.steps,
      index: opts.index,
      initialFurthest: opts.initialFurthest,
      onChange: (i, p, r) => cb.current.onChange?.(i, p, r),
    }),
  )
  const [state, setState] = useState<StepsEngineState>(() => engine.getState())

  useEffect(() => {
    const unsubscribe = engine.subscribe(setState)
    return () => {
      unsubscribe()
      engine.destroy()
    }
  }, [engine])

  useEffect(() => {
    engine.setOptions({ steps: opts.steps })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, opts.steps])

  return {
    engine,
    ...state,
    next: engine.next,
    prev: engine.prev,
    goTo: (t) => engine.goTo(t),
    setStepError: (t, error) => engine.setStepError(t, error),
    reset: engine.reset,
  }
}

// ── Indicator ──────────────────────────────────────────────────────────────────────────

interface StepsLabels {
  /** Accessible name of the indicator. Default 'Progress'. */
  root?: string
  /** Accessible name per step button. Default composes `Step ${i + 1} of ${count}: ${title}`
   *  plus the description while active and a status suffix. */
  step?: (index: number, count: number, step: StepItem, status: StepStatus) => string
}

/** Geometry presets (px): marker diameter, marker↔text gap, title/description font sizes,
 *  connector thickness. Every color comes from theme tokens instead. */
const SIZES = {
  sm: { marker: 22, gap: 8, title: 12.5, desc: 12, conn: 2 },
  md: { marker: 28, gap: 10, title: 13.5, desc: 13, conn: 2 },
  lg: { marker: 34, gap: 12, title: 15, desc: 14, conn: 2.5 },
} as const

const GLIDE = 'cubic-bezier(0.22,1,0.36,1)'
/** Breathing gap between a connector's end and the marker it meets, px. */
const CGAP = 3
/** Step button padding, px — part of the connector offset math. */
const PAD = 4

interface StepsProps extends Omit<ComponentProps<'nav'>, 'onChange'> {
  /** Share the engine from useSteps. Ownership is fixed at mount — supply it from the
   *  first render. When set, the engine props below are ignored; the hook owns them. */
  engine?: StepsEngine
  /** Engine options, for the self-managed case (no `engine` prop). */
  steps?: StepItem[]
  index?: number
  initialFurthest?: number
  onChange?: (index: number, prevIndex: number, reason: StepsChangeReason) => void
  /** Layout direction. Default 'horizontal'. Only horizontal collapses in narrow
   *  containers; vertical is already compact. */
  orientation?: 'horizontal' | 'vertical'
  size?: 'sm' | 'md' | 'lg'
  labels?: StepsLabels
}

/** The indicator: markers, connectors, titles, the active step's description, and the
 *  collapsed summary line. Indicator only — render your own panels off the hook's state. */
function Steps({
  engine: engineProp,
  steps: stepsProp,
  index: initialIndex,
  initialFurthest,
  onChange,
  orientation = 'horizontal',
  size = 'md',
  labels,
  className,
  ...props
}: StepsProps) {
  // Engine ownership is frozen at mount: with an external engine, none is created here.
  const ownsEngine = useRef(engineProp == null).current
  const cb = useRef({ onChange })
  cb.current = { onChange }
  const [own] = useState(() =>
    ownsEngine
      ? createEngine({
          steps: stepsProp ?? [],
          index: initialIndex,
          initialFurthest,
          onChange: (i, p, r) => cb.current.onChange?.(i, p, r),
        })
      : null,
  )
  const engine = (engineProp ?? own) as StepsEngine
  const [state, setState] = useState<StepsEngineState>(() => engine.getState())
  useEffect(() => {
    setState(engine.getState())
    const unsubscribe = engine.subscribe(setState)
    return () => {
      unsubscribe()
      if (ownsEngine) engine.destroy()
    }
  }, [engine, ownsEngine])
  useEffect(() => {
    if (ownsEngine && stepsProp) engine.setOptions({ steps: stepsProp })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, ownsEngine, stepsProp])

  const horizontal = orientation !== 'vertical'
  const g = SIZES[size]
  const { steps, status, index, furthest, count } = state
  const active = steps[index]

  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([])

  const stepLabel = (i: number): string => {
    const custom = labels?.step?.(i, count, steps[i], status[i])
    if (custom != null) return custom
    let label = `Step ${i + 1} of ${count}: ${steps[i].title}`
    if (i === index && steps[i].description) label += ` — ${steps[i].description}`
    if (status[i] === 'completed') label += ', completed'
    else if (status[i] === 'error') label += ', has an error'
    else if (status[i] === 'disabled') label += ', unavailable'
    return label
  }

  const statusIcon = (s: StepStatus): ReactNode => {
    if (s === 'completed') return <CheckIcon strokeWidth={2.6} aria-hidden="true" />
    if (s === 'error') return <TriangleAlertIcon strokeWidth={2.4} aria-hidden="true" />
    if (s === 'disabled') return <LockIcon strokeWidth={2.4} aria-hidden="true" />
    return null
  }

  // Arrow/Home/End move focus between reachable steps as a convenience on top of the
  // standard Tab order (no roving tabindex — this is not a composite widget). Only this
  // handler ever calls focus(); app-driven next()/goTo() can't yank focus in here.
  const onKeyDown = (e: ReactKeyboardEvent) => {
    const hit = (e.target as Element | null)?.closest('button')
    if (!hit) return
    const from = buttonRefs.current.indexOf(hit as HTMLButtonElement)
    if (from === -1) return
    const enabled = buttonRefs.current.map((b, i) => (b && !b.disabled ? i : -1)).filter((i) => i !== -1)
    let to = -1
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') to = enabled.find((i) => i > from) ?? -1
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') to = [...enabled].reverse().find((i) => i < from) ?? -1
    else if (e.key === 'Home') to = enabled[0] ?? -1
    else if (e.key === 'End') to = enabled[enabled.length - 1] ?? -1
    else return
    e.preventDefault()
    if (to !== -1 && to !== from) buttonRefs.current[to]?.focus()
  }

  return (
    <nav
      data-slot="steps"
      data-orientation={horizontal ? 'horizontal' : 'vertical'}
      data-size={size}
      aria-label={labels?.root ?? 'Progress'}
      className={cn('block', horizontal && '@container/steps', className)}
      {...props}
    >
      <ol
        data-slot="steps-list"
        role="list"
        className={cn('m-0 flex list-none p-0', !horizontal && 'flex-col')}
        onKeyDown={onKeyDown}
      >
        {steps.map((step, i) => {
          const s = status[i]
          const isActive = i === index
          const reachable = engine.canGoTo(i)
          const Icon = step.icon
          return (
            <li
              data-slot="steps-item"
              key={step.id ?? i}
              data-status={s}
              data-filled={i <= furthest ? 'true' : undefined}
              aria-current={isActive ? 'step' : undefined}
              className={cn(
                'group/item relative',
                horizontal ? 'min-w-0 flex-1' : 'flex-none',
                !horizontal && i < count - 1 && 'pb-3.5',
              )}
            >
              {/* Incoming connector (horizontal): previous marker's edge to this one's. */}
              {horizontal && i > 0 && (
                <span
                  data-slot="steps-connector"
                  aria-hidden="true"
                  className={cn(
                    'absolute rounded-full transition-colors motion-reduce:transition-none',
                    i <= furthest ? 'bg-primary' : 'bg-border',
                  )}
                  style={{
                    top: PAD + g.marker / 2 - g.conn / 2,
                    left: `calc(-50% + ${g.marker / 2 + CGAP}px)`,
                    width: `calc(100% - ${g.marker + 2 * CGAP}px)`,
                    height: g.conn,
                  }}
                />
              )}
              {/* Outgoing tail (vertical): below the marker, alongside the text, down to the
                  next row — it stretches with the revealed description automatically. */}
              {!horizontal && i < count - 1 && (
                <span
                  data-slot="steps-connector"
                  aria-hidden="true"
                  className={cn(
                    'absolute rounded-full transition-colors motion-reduce:transition-none',
                    i + 1 <= furthest ? 'bg-primary' : 'bg-border',
                  )}
                  style={{
                    left: PAD + g.marker / 2 - g.conn / 2,
                    top: PAD + g.marker + CGAP,
                    bottom: CGAP,
                    width: g.conn,
                  }}
                />
              )}
              <button
                data-slot="steps-trigger"
                ref={(el) => {
                  buttonRefs.current[i] = el
                }}
                type="button"
                // Native disabled gives click-blocking and unfocusability for free on
                // unreached and disabled steps; the active step stays enabled (its goTo is
                // a harmless no-op).
                disabled={!reachable}
                aria-label={stepLabel(i)}
                onClick={() => engine.goTo(i)}
                className={cn(
                  'group flex w-full cursor-pointer border-0 bg-transparent p-0 disabled:cursor-default',
                  'focus-visible:outline-none',
                  horizontal ? 'flex-col items-center gap-1.5 text-center' : 'flex-row items-start text-start',
                )}
                style={{ padding: horizontal ? `${PAD}px ${g.gap}px` : PAD, gap: g.gap }}
              >
                <span
                  data-slot="steps-marker"
                  className={cn(
                    'relative z-[1] grid flex-none place-items-center rounded-full font-semibold tabular-nums',
                    'transition-colors motion-reduce:transition-none',
                    // C12 (deliberate exception): a soft 3px box-shadow ring reads smeared on
                    // a circle this small — a crisp hard-edged offset outline stays legible.
                    'group-focus-visible:outline group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-ring',
                    reachable && 'group-hover:brightness-[0.96]',
                    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[55%]",
                    // C14 (deliberate exception, same logic as workflow-button's terminal
                    // stage): a locked/upcoming step reads as "not yet" via status color
                    // rather than the canonical disabled:opacity-50 — keyed off the item's
                    // data-status through the named group, not a JS lookup.
                    'group-data-[status=upcoming]/item:bg-muted group-data-[status=upcoming]/item:text-muted-foreground',
                    'group-data-[status=active]/item:bg-primary group-data-[status=active]/item:text-primary-foreground',
                    'group-data-[status=completed]/item:bg-primary group-data-[status=completed]/item:text-primary-foreground',
                    'group-data-[status=error]/item:bg-destructive group-data-[status=error]/item:text-destructive-foreground',
                    'group-data-[status=disabled]/item:bg-muted group-data-[status=disabled]/item:text-muted-foreground group-data-[status=disabled]/item:opacity-45',
                  )}
                  style={{ width: g.marker, height: g.marker, fontSize: g.marker * 0.42 }}
                >
                  {Icon ? <Icon /> : (statusIcon(s) ?? i + 1)}
                </span>
                <span
                  data-slot="steps-text"
                  className={cn(
                    'flex min-w-0 max-w-full flex-col',
                    horizontal ? 'items-center @max-[560px]/steps:hidden' : 'flex-1 items-start',
                  )}
                  style={!horizontal ? { paddingTop: Math.max(0, (g.marker - g.title * 1.4) / 2) } : undefined}
                >
                  <span
                    data-slot="steps-title"
                    title={step.title}
                    className={cn(
                      'leading-[1.4] text-foreground transition-[color,opacity] motion-reduce:transition-none',
                      isActive ? 'font-semibold' : 'font-medium',
                      // C14 (see the marker above): status-driven dimming via data-status.
                      'group-data-[status=upcoming]/item:opacity-55 group-data-[status=disabled]/item:opacity-55',
                      'group-data-[status=error]/item:text-destructive',
                      // Inactive titles hold one ellipsized line; the active one may wrap.
                      horizontal && !isActive && 'max-w-full truncate',
                    )}
                    style={{ fontSize: g.title }}
                  >
                    {step.title}
                  </span>
                  {/* grid-rows 0fr -> 1fr animates height-to-auto with no measuring. */}
                  <span
                    data-slot="steps-description-wrap"
                    className={cn(
                      'grid transition-[grid-template-rows] duration-[220ms] motion-reduce:transition-none',
                      isActive ? '[grid-template-rows:1fr]' : '[grid-template-rows:0fr]',
                    )}
                    style={{ transitionTimingFunction: GLIDE }}
                  >
                    <span
                      data-slot="steps-description"
                      className={cn(
                        'min-h-0 overflow-hidden pt-[3px] leading-[1.45] text-muted-foreground',
                        'transition-opacity delay-[60ms] motion-reduce:transition-none',
                        isActive ? 'opacity-100' : 'opacity-0',
                      )}
                      style={{ fontSize: g.desc }}
                    >
                      {step.description}
                    </span>
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ol>
      {/* Collapsed summary (horizontal only): the active title + description take over
          from the per-step titles when the container is narrow, centered. Markers stay
          visible and interactive above it — they already visualize the position, so
          there's no counter here. */}
      {horizontal && (
        <div data-slot="steps-summary" className="mt-2.5 hidden text-center @max-[560px]/steps:block">
          <span data-slot="steps-summary-title" className="font-semibold text-foreground" style={{ fontSize: g.title }}>
            {active.title}
          </span>
          {active.description ? (
            <p
              data-slot="steps-summary-description"
              className="mt-[3px] leading-[1.45] text-muted-foreground"
              style={{ fontSize: g.desc }}
            >
              {active.description}
            </p>
          ) : null}
        </div>
      )}
    </nav>
  )
}

export {
  type StepStatus,
  type StepsChangeReason,
  type StepItem,
  type StepsEngineOptions,
  type StepsEngineState,
  type StepsEngine,
  type UseStepsOptions,
  type UseStepsReturn,
  useSteps,
  type StepsLabels,
  type StepsProps,
  Steps,
}
