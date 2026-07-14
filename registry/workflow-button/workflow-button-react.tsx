// workflow-button-react — a thin React wrapper over the framework-agnostic core.
//
//   <WorkflowButton steps={steps} current={id} onMove={...} />   renders the split button
//   useWorkflow({ steps, current, ... })                          headless: the flow math
//
// The component is controlled: you own `current`, handle `onMove`, and pass the new id back
// as a prop. Internally it runs the vanilla core with `manageState: false` and syncs on
// prop changes — so the DOM view and your React state never fight over who's current.

import { useEffect, useMemo, useRef } from 'react'
import {
  createWorkflowButton,
  defaultCanMoveTo,
  defaultNext,
  type MovePredicate,
  type NextResolver,
  type WorkflowButton as VanillaWorkflowButton,
  type WorkflowStep,
  type WorkflowVariant,
} from './workflow-button'

export type {
  WorkflowStep,
  WorkflowVariant,
  NextResolver,
  MovePredicate,
} from './workflow-button'
export {
  defaultCanMoveTo,
  defaultNext,
  forwardOnly,
  nextInOrder,
  normalizeVariant,
} from './workflow-button'

export interface WorkflowButtonProps<TCtx = unknown> {
  steps: WorkflowStep[]
  /** Id of the current stage (controlled). */
  current: string
  /** Fired on advance or a menu pick, with the target and previous ids. */
  onMove: (toId: string, fromId: string) => void
  /** App data (viewer role, permissions, assignee…) threaded into every resolver.
   *  Changing it re-renders reachability and emphasis. */
  context?: TCtx
  next?: NextResolver<TCtx>
  /** Reachability predicate — also your role-aware disabling hook.
   *  Pass `forwardOnly` for array-order DAG flows; `to` lists need nothing. */
  canMoveTo?: MovePredicate<TCtx>
  advanceLabelFor?: (
    target: WorkflowStep,
    from: WorkflowStep,
    context: TCtx | undefined,
  ) => string
  /** Fully own the primary's content (a DOM node or string — this wrapper drives the
   *  vanilla core; return null to use the default content). For ReactNode children/icons,
   *  use `workflow-button-shadcn` instead. */
  renderPrimary?: (ctx: {
    target: WorkflowStep | null
    current: WorkflowStep
  }) => Node | string | null
  /** Own a menu item's row (DOM node; null = default). ReactNode → use the shadcn version. */
  renderItem?: (
    step: WorkflowStep,
    state: { isCurrent: boolean; reachable: boolean },
  ) => Node | null
  size?: 'sm' | 'default' | 'lg'
  /** Base presentation; per-step `advanceVariant` / `variantFor` win over it. */
  variant?: WorkflowVariant
  /** Dynamic emphasis resolver (role-aware prominence). Null falls through. */
  variantFor?: (
    target: WorkflowStep,
    from: WorkflowStep,
    context: TCtx | undefined,
  ) => WorkflowVariant | null | undefined
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
export function WorkflowButton<TCtx = unknown>({
  steps,
  current,
  onMove,
  context,
  next,
  canMoveTo,
  advanceLabelFor,
  renderPrimary,
  renderItem,
  size,
  variant,
  variantFor,
  menuLabel,
  className,
}: WorkflowButtonProps<TCtx>) {
  const hostRef = useRef<HTMLSpanElement>(null)
  const btnRef = useRef<VanillaWorkflowButton<TCtx> | null>(null)

  // Keep the callbacks/predicates fresh without re-creating the DOM control each render.
  const cbs = useRef({
    onMove,
    next,
    canMoveTo,
    advanceLabelFor,
    renderPrimary,
    renderItem,
    variantFor,
  })
  cbs.current = {
    onMove,
    next,
    canMoveTo,
    advanceLabelFor,
    renderPrimary,
    renderItem,
    variantFor,
  }

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const btn = createWorkflowButton<TCtx>({
      steps,
      current,
      context,
      manageState: false, // React owns `current`; we sync via setState below.
      size,
      variant,
      menuLabel,
      className,
      next: (c, s, x) => (cbs.current.next ?? defaultNext)(c, s, x),
      canMoveTo: (t, f, s, x) => (cbs.current.canMoveTo ?? defaultCanMoveTo)(t, f, s, x),
      advanceLabelFor: (t, f, x) =>
        cbs.current.advanceLabelFor?.(t, f, x) ?? t.advanceLabel ?? t.label,
      renderPrimary: (ctx) => cbs.current.renderPrimary?.(ctx) ?? null,
      renderItem: (step, state) => cbs.current.renderItem?.(step, state) ?? null,
      variantFor: (t, f, x) => cbs.current.variantFor?.(t, f, x) ?? null,
      onMove: (toId, fromId) => cbs.current.onMove(toId, fromId),
    })
    host.appendChild(btn.element)
    btnRef.current = btn
    return () => {
      btn.destroy()
      btn.element.remove()
      btnRef.current = null
    }
    // Re-create only on presentational changes; steps/current/context sync below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, variant, menuLabel, className])

  // Sync the controlled state into the live control.
  useEffect(() => {
    btnRef.current?.setState({ steps, current, context })
  }, [steps, current, context])

  return <span ref={hostRef} style={{ display: 'contents' }} />
}

export interface UseWorkflowOptions<TCtx = unknown> {
  steps: WorkflowStep[]
  current: string
  context?: TCtx
  next?: NextResolver<TCtx>
  canMoveTo?: MovePredicate<TCtx>
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
  /** Is there anywhere to go at all? (false → hide your picker UI) */
  anyReachable: boolean
}

/**
 * Headless flow math — the same resolution the button uses, without any DOM. Build your own
 * control (a stepper, a command palette entry, a keyboard shortcut) on top.
 */
export function useWorkflow<TCtx = unknown>({
  steps,
  current,
  context,
  next,
  canMoveTo,
}: UseWorkflowOptions<TCtx>): WorkflowState {
  return useMemo(() => {
    const resolveNext = next ?? (defaultNext as NextResolver<TCtx>)
    const reachable = canMoveTo ?? (defaultCanMoveTo as MovePredicate<TCtx>)
    const cur = steps.find((s) => s.id === current)
    const byId = (id: string) => steps.find((s) => s.id === id)

    let advanceTarget: string | null = null
    if (cur) {
      const targetId = resolveNext(cur, steps, context)
      const target = targetId ? byId(targetId) : null
      if (target && reachable(target, cur, steps, context)) advanceTarget = targetId
    }

    return {
      currentStep: cur,
      advanceTarget,
      canAdvance: advanceTarget !== null,
      canMoveTo: (id) => {
        const to = byId(id)
        return !!(to && cur && id !== current && reachable(to, cur, steps, context))
      },
      anyReachable:
        !!cur && steps.some((s) => s.id !== current && reachable(s, cur, steps, context)),
    }
  }, [steps, current, context, next, canMoveTo])
}
