// workflow-button-react — a thin React wrapper over the framework-agnostic core.
//
//   <WorkflowButton steps={steps} current={id} onMove={...} />   renders the split button
//   useWorkflow({ steps, current, ... })                          headless: the flow math
//
// The component is controlled: you own `current`, handle `onMove`, and pass the new id back
// as a prop. Internally it runs the vanilla core with `manageState: false` and syncs on
// prop changes — so the DOM view and your React state never fight over who's current.

import { useEffect, useMemo, useRef, type RefObject } from 'react'
import {
  createWorkflowButton,
  forwardOnly,
  nextInOrder,
  type MovePredicate,
  type NextResolver,
  type WorkflowButton as VanillaWorkflowButton,
  type WorkflowStep,
} from './workflow-button'

export type {
  WorkflowStep,
  NextResolver,
  MovePredicate,
} from './workflow-button'
export { forwardOnly, nextInOrder } from './workflow-button'

export interface WorkflowButtonProps {
  steps: WorkflowStep[]
  /** Id of the current stage (controlled). */
  current: string
  /** Fired on advance or a menu pick, with the target and previous ids. */
  onMove: (toId: string, fromId: string) => void
  next?: NextResolver
  /** Reachability predicate. Pass `forwardOnly` for a one-way / DAG flow. */
  canMoveTo?: MovePredicate
  advanceLabelFor?: (target: WorkflowStep, from: WorkflowStep) => string
  /** Fully own the primary's content (a DOM node or string — this wrapper drives the
   *  vanilla core; return null to use the default content). For ReactNode children/icons,
   *  use `workflow-button-shadcn` instead. */
  renderPrimary?: (ctx: {
    target: WorkflowStep | null
    current: WorkflowStep
  }) => Node | string | null
  size?: 'sm' | 'default' | 'lg'
  variant?: 'default' | 'outline'
  menuLabel?: string
  className?: string
}

/**
 * Renders the workflow split button. Fully controlled — `onMove` reports the intended move;
 * reflect it by updating the `current` you pass back in.
 *
 * The wrapper host is `display: contents`, so it adds no layout box; the button (an inline
 * group) lays out as if it were your own child.
 */
export function WorkflowButton({
  steps,
  current,
  onMove,
  next,
  canMoveTo,
  advanceLabelFor,
  renderPrimary,
  size,
  variant,
  menuLabel,
  className,
}: WorkflowButtonProps) {
  const hostRef = useRef<HTMLSpanElement>(null)
  const btnRef = useRef<VanillaWorkflowButton | null>(null)

  // Keep the callbacks/predicates fresh without re-creating the DOM control each render.
  const cbs = useRef({ onMove, next, canMoveTo, advanceLabelFor, renderPrimary })
  cbs.current = { onMove, next, canMoveTo, advanceLabelFor, renderPrimary }

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const btn = createWorkflowButton({
      steps,
      current,
      manageState: false, // React owns `current`; we sync via setState below.
      size,
      variant,
      menuLabel,
      className,
      next: (c, s) => (cbs.current.next ?? nextInOrder)(c, s),
      canMoveTo: (t, f, s) => (cbs.current.canMoveTo ?? defaultReachable)(t, f, s),
      advanceLabelFor: (t, f) => cbs.current.advanceLabelFor?.(t, f) ?? t.advanceLabel ?? t.label,
      renderPrimary: (ctx) => cbs.current.renderPrimary?.(ctx) ?? null,
      onMove: (toId, fromId) => cbs.current.onMove(toId, fromId),
    })
    host.appendChild(btn.element)
    btnRef.current = btn
    return () => {
      btn.destroy()
      btn.element.remove()
      btnRef.current = null
    }
    // Re-create only on presentational changes; steps/current sync below without teardown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, variant, menuLabel, className])

  // Sync the controlled state into the live control.
  useEffect(() => {
    btnRef.current?.setState({ steps, current })
  }, [steps, current])

  return <span ref={hostRef} style={{ display: 'contents' }} />
}

/** Default reachability: any step that isn't hard-disabled. */
const defaultReachable: MovePredicate = (to) => !to.disabled

export interface UseWorkflowOptions {
  steps: WorkflowStep[]
  current: string
  next?: NextResolver
  canMoveTo?: MovePredicate
}

export interface WorkflowState {
  /** The current step object. */
  currentStep: WorkflowStep | undefined
  /** The id the primary would advance to, or null if terminal/blocked. */
  advanceTarget: string | null
  /** Whether the primary can advance right now. */
  canAdvance: boolean
  /** Is this step reachable from the current one? */
  canMoveTo: (id: string) => boolean
}

/**
 * Headless flow math — the same resolution the button uses, without any DOM. Build your own
 * control (a stepper, a command palette entry, a keyboard shortcut) on top.
 */
export function useWorkflow({ steps, current, next, canMoveTo }: UseWorkflowOptions): WorkflowState {
  return useMemo(() => {
    const resolveNext = next ?? nextInOrder
    const reachable = canMoveTo ?? defaultReachable
    const cur = steps.find((s) => s.id === current)
    const byId = (id: string) => steps.find((s) => s.id === id)

    let advanceTarget: string | null = null
    if (cur) {
      const targetId = resolveNext(cur, steps)
      const target = targetId ? byId(targetId) : null
      if (target && reachable(target, cur, steps)) advanceTarget = targetId
    }

    return {
      currentStep: cur,
      advanceTarget,
      canAdvance: advanceTarget !== null,
      canMoveTo: (id) => {
        const to = byId(id)
        return !!(to && cur && id !== current && reachable(to, cur, steps))
      },
    }
  }, [steps, current, next, canMoveTo])
}

// Re-exported for consumers who want a ref type for the host span.
export type WorkflowButtonHostRef = RefObject<HTMLSpanElement | null>
