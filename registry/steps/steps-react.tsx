// steps-react — a thin React wrapper over the framework-agnostic steps core.
//
// EXPERIMENTAL — the API is still settling and will change in breaking ways; pin what you
// install.
//
//   useSteps({ steps })                  headless: engine + live state, no DOM
//   <Steps engine={wizard.engine} />     the indicator, driven by that engine
//   <Steps steps={steps} />              or self-managed, if you only need the indicator
//
// The hook owns the engine (one frontier, one source of truth); the indicator mounts the
// vanilla control and shares it. Key your own panels off the hook's `index`/`id` — and gate
// your own Continue button on its state — and everything stays in sync by construction.
//
// State ownership: the engine and its frontier own navigation, not React state. `index` is
// only an uncontrolled starting seed — there's deliberately no controlled-index prop, since
// an arbitrary index on every render could silently break the earned-progress invariant.

'use client'

import { useEffect, useRef, useState } from 'react'
import {
  createSteps,
  createStepsEngine,
  type StepItem,
  type StepsChangeReason,
  type StepsEngine,
  type StepsEngineOptions,
  type StepsEngineState,
  type StepsLabels,
  type StepStatus,
  type Steps as VanillaSteps,
} from './steps'

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

/**
 * Headless: an engine plus its live state as React state. Callbacks are read through a ref,
 * so inline closures are fine; `steps` patches into the running engine (keep the array
 * referentially stable — memoize it — or the indicator rebuilds every render).
 */
function useSteps(opts: UseStepsOptions): UseStepsReturn {
  const cb = useRef({ onChange: opts.onChange })
  cb.current.onChange = opts.onChange

  const [engine] = useState(() =>
    createStepsEngine({
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

interface StepsProps {
  /** Share the engine from useSteps. When set, the engine props below (steps, index,
   *  initialFurthest, onChange) are ignored — the hook owns them. */
  engine?: StepsEngine
  /** Engine options, for the self-managed case (no `engine` prop). */
  steps?: StepItem[]
  /** Initial step (self-managed only) — an uncontrolled starting point, not a controlled
   *  value; drive jumps through the hook/engine instead. */
  index?: number
  initialFurthest?: number
  onChange?: (index: number, prevIndex: number, reason: StepsChangeReason) => void
  /** Presentation — see StepsOptions in steps.ts for details. */
  orientation?: 'horizontal' | 'vertical'
  size?: 'sm' | 'md' | 'lg'
  labels?: StepsLabels
  className?: string
}

/**
 * The indicator. The returned wrapper is `display: contents`, so it adds no layout box of
 * its own. Re-created only when the engine identity changes; every other prop syncs into
 * the running control.
 */
function Steps({
  engine,
  steps,
  index,
  initialFurthest,
  onChange,
  orientation,
  size,
  labels,
  className,
}: StepsProps) {
  const hostRef = useRef<HTMLSpanElement>(null)
  const controlRef = useRef<VanillaSteps | null>(null)
  // Keep the latest callback without re-creating the control each render.
  const cb = useRef({ onChange })
  cb.current = { onChange }
  // Initial-only engine options, captured at creation like useState initializers.
  const initial = useRef({ steps, index, initialFurthest, orientation, size, labels, className })
  initial.current = { steps, index, initialFurthest, orientation, size, labels, className }

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const init = initial.current
    const control = createSteps({
      engine,
      steps: init.steps ?? engine?.getState().steps ?? [],
      index: init.index,
      initialFurthest: init.initialFurthest,
      onChange: (i, p, r) => cb.current.onChange?.(i, p, r),
      orientation: init.orientation,
      size: init.size,
      labels: init.labels,
      className: init.className,
    })
    host.appendChild(control.element)
    controlRef.current = control
    return () => {
      control.destroy()
      control.element.remove()
      controlRef.current = null
    }
  }, [engine])

  // Sync presentational (and, when self-managed, engine) options into the live control.
  useEffect(() => {
    controlRef.current?.setState({ steps, orientation, size, labels, className })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps, orientation, size, labels, className])

  return <span ref={hostRef} style={{ display: 'contents' }} />
}

export {
  type StepItem,
  type StepsChangeReason,
  type StepsEngine,
  type StepsEngineOptions,
  type StepsEngineState,
  type StepsLabels,
  type StepStatus,
  type UseStepsOptions,
  type UseStepsReturn,
  useSteps,
  type StepsProps,
  Steps,
}
