// workflow-button-shadcn — the workflow split button composed from shadcn primitives.
//
// Same flow semantics as the vanilla `workflow-button` (primary advances the happy path
// and re-labels itself; the caret menu jumps anywhere the flow allows), but built from
// your app's actual <Button> and <DropdownMenu> — so it *is* a shadcn button: identical
// variants, sizes, theming, focus rings, dark mode. Icons, menu rows, and custom primary
// content are plain ReactNode.
//
// The flow is data: steps with optional `to` transition lists (the state-machine model —
// `to[0]` is the happy path, `to: []` is terminal), an app `context` (viewer role,
// permissions) threaded into every resolver for role-aware disabling and prominence, and
// per-step `advanceVariant` for emphasis. When nothing is reachable (terminal and not
// restartable, or role-locked), the caret hides and the control reads as a status.
//
// Self-contained on purpose: the flow math is inlined rather than imported from the
// vanilla core, so this file installs alone (plus shadcn's button + dropdown-menu, pulled
// in as registryDependencies).

'use client'

import { CheckIcon, ChevronDownIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

/** shadcn Button variants usable by the split control, plus 'primary' as an alias for
 *  'default'. ('link' is deliberately unsupported — a link-styled split button isn't a
 *  coherent control.) */
export type WorkflowVariant =
  | 'default'
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'destructive'

type CanonicalVariant = Exclude<WorkflowVariant, 'primary'>

const canonical = (v: WorkflowVariant): CanonicalVariant =>
  v === 'primary' ? 'default' : v

/** One stage in the flow. */
export interface WorkflowStep {
  /** Stable identity — what `current` points at and `onMove` reports. */
  id: string
  /** Menu label, and the primary's label when this step is the advance target
   *  (unless `advanceLabel` overrides it). */
  label: string
  /** Primary-button label when advancing *to* this step, e.g. "Submit for review". */
  advanceLabel?: string
  /** Prominence when this step is the advance target — emphasis lives on the destination.
   *  Idiom: quiet base (`variant="outline"`), `advanceVariant: 'primary'` at the stages
   *  that demand action, `'destructive'` for high-consequence moves. */
  advanceVariant?: WorkflowVariant
  /** Optional secondary line under the label in the menu. */
  description?: string
  /** Instance annotation — who did this step, when ("Astrid · 2d"). When present it
   *  REPLACES `description` as the line under the label. Richer → `renderItem`. */
  meta?: string
  /** Optional leading icon (menu item + primary when targeted). Any ReactNode. */
  icon?: ReactNode
  /** Optional status color — a dot shown when no `icon` is given. */
  color?: string
  /** Hard-disable jumping to this step, regardless of `canMoveTo`. */
  disabled?: boolean
  /**
   * Explicit transitions out of this step — the workflow definition as data:
   * `to[0]` is the happy path (the primary's target), the menu enables exactly these
   * ids, and `to: []` marks an explicitly terminal stage. Absent → array order.
   */
  to?: string[]
}

/** Resolve the advance target from a step. Return null for a terminal stage. */
export type NextResolver<TCtx = unknown> = (
  current: WorkflowStep,
  steps: WorkflowStep[],
  context: TCtx | undefined,
) => string | null

/** May we move `from` → `to`? Governs the primary's enablement and each menu item. */
export type MovePredicate<TCtx = unknown> = (
  to: WorkflowStep,
  from: WorkflowStep,
  steps: WorkflowStep[],
  context: TCtx | undefined,
) => boolean

/** Advance target by array order: the next step, or null at the end. */
export const nextInOrder: NextResolver = (current, steps) => {
  const i = steps.findIndex((s) => s.id === current.id)
  return i >= 0 && i < steps.length - 1 ? steps[i + 1].id : null
}

/** The built-in `next`: the step's `to[0]` (happy path) when declared, else array order. */
export const defaultNext: NextResolver = (current, steps, context) => {
  if (current.to) return current.to[0] ?? null
  return nextInOrder(current, steps, context)
}

/** The built-in `canMoveTo`: `to`-membership when declared, else any non-disabled step. */
export const defaultCanMoveTo: MovePredicate = (to, from) => {
  if (to.disabled) return false
  if (from.to) return from.to.includes(to.id)
  return true
}

/** Array-order DAG flows: only steps after the current one are reachable — never back. */
export const forwardOnly: MovePredicate = (to, from, steps) => {
  if (to.disabled) return false
  const fromI = steps.findIndex((s) => s.id === from.id)
  const toI = steps.findIndex((s) => s.id === to.id)
  return toI > fromI
}

const TRIGGER_SIZE = { sm: 'icon-sm', default: 'icon', lg: 'icon-lg' } as const

/* The trigger's divider against the primary, per resolved variant. Outline shares its
   border via the wrapper's -space-x-px instead; ghost gets a plain border divider. */
const DIVIDER: Record<CanonicalVariant, string> = {
  default: 'border-l border-primary-foreground/20',
  secondary: 'border-l border-secondary-foreground/15',
  destructive: 'border-l border-white/25',
  outline: '',
  ghost: 'border-l border-border',
}

export interface WorkflowButtonProps<TCtx = unknown> {
  steps: WorkflowStep[]
  /** Id of the current stage (controlled — reflect `onMove` back into this prop). */
  current: string
  /** Fired on advance (primary) or a menu pick, with the target and previous ids. */
  onMove: (toId: string, fromId: string) => void
  /** App data (viewer role, permissions, assignee…) threaded into every resolver —
   *  role-aware disabling via `canMoveTo`, role-aware prominence via `variantFor`. */
  context?: TCtx
  next?: NextResolver<TCtx>
  canMoveTo?: MovePredicate<TCtx>
  /** Override the primary label. Falls back to `target.advanceLabel ?? target.label`. */
  advanceLabelFor?: (
    target: WorkflowStep,
    from: WorkflowStep,
    context: TCtx | undefined,
  ) => string
  /** Fully own the primary's content. `target` is null at a terminal stage. */
  renderPrimary?: (ctx: {
    target: WorkflowStep | null
    current: WorkflowStep
  }) => ReactNode
  /** Own a menu item's row (left of the current-step check). Default rendering shows
   *  icon/dot, label, description, and the muted `meta` annotation. */
  renderItem?: (
    step: WorkflowStep,
    state: { isCurrent: boolean; reachable: boolean },
  ) => ReactNode
  size?: 'sm' | 'default' | 'lg'
  /** Base presentation; per-step `advanceVariant` / `variantFor` win over it. */
  variant?: WorkflowVariant
  /** Dynamic emphasis resolver. Wins over `advanceVariant`; null falls through. */
  variantFor?: (
    target: WorkflowStep,
    from: WorkflowStep,
    context: TCtx | undefined,
  ) => WorkflowVariant | null | undefined
  /** Accessible name for the menu trigger. Default "Choose stage". */
  menuLabel?: string
  className?: string
}

/**
 * The workflow split button, in shadcn parts. Primary = <Button> advancing the happy
 * path; caret = <DropdownMenu> of every stage, disabled per `canMoveTo`, hidden entirely
 * when nothing is reachable. Fully controlled.
 */
export function WorkflowButton<TCtx = unknown>({
  steps,
  current,
  onMove,
  context,
  next = defaultNext,
  canMoveTo = defaultCanMoveTo,
  advanceLabelFor,
  renderPrimary,
  renderItem,
  size = 'default',
  variant = 'default',
  variantFor,
  menuLabel = 'Choose stage',
  className,
}: WorkflowButtonProps<TCtx>) {
  const cur = steps.find((s) => s.id === current)
  if (!cur) return null

  const targetId = next(cur, steps, context)
  const target = (targetId && steps.find((s) => s.id === targetId)) || null
  const advance = target && canMoveTo(target, cur, steps, context) ? target : null
  const anyReachable = steps.some(
    (s) => s.id !== current && canMoveTo(s, cur, steps, context),
  )

  // Emphasis resolves per advance target: variantFor → the destination's advanceVariant →
  // the base. Terminal/blocked reads as a quiet secondary readout (outline/ghost stay put).
  const base = canonical(variant)
  const resolved: CanonicalVariant = advance
    ? canonical(variantFor?.(advance, cur, context) ?? advance.advanceVariant ?? variant)
    : base === 'outline' || base === 'ghost'
      ? base
      : 'secondary'

  const primaryLabel = advance
    ? (advanceLabelFor?.(advance, cur, context) ??
      advance.advanceLabel ??
      advance.label)
    : cur.label
  const shown = advance ?? cur

  return (
    <div
      role="group"
      className={cn(
        'inline-flex rounded-md',
        resolved !== 'ghost' && 'shadow-xs',
        resolved === 'outline' && '-space-x-px',
        className,
      )}
    >
      <Button
        type="button"
        variant={resolved}
        size={size}
        disabled={!advance}
        onClick={() => advance && onMove(advance.id, cur.id)}
        aria-label={advance ? `${primaryLabel} (advance from ${cur.label})` : undefined}
        className={cn(
          'shadow-none focus-visible:z-10',
          anyReachable ? 'rounded-r-none' : undefined,
          // A terminal stage is a readout, not a broken button — keep it legible.
          !advance && 'disabled:opacity-100 text-muted-foreground',
        )}
      >
        {renderPrimary ? (
          renderPrimary({ target: advance, current: cur })
        ) : (
          <>
            <StepAffordance step={shown} />
            {primaryLabel}
          </>
        )}
      </Button>
      {anyReachable ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant={resolved}
              size={TRIGGER_SIZE[size]}
              aria-label={menuLabel}
              className={cn(
                'rounded-l-none shadow-none focus-visible:z-10',
                'data-[state=open]:[&_svg]:rotate-180',
                DIVIDER[resolved],
              )}
            >
              <ChevronDownIcon className="transition-transform duration-200" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-56">
            {steps.map((step) => {
              const isCurrent = step.id === current
              const reachable = canMoveTo(step, cur, steps, context)
              return (
                <DropdownMenuItem
                  key={step.id}
                  disabled={!reachable && !isCurrent}
                  aria-current={isCurrent || undefined}
                  onSelect={() => {
                    if (!isCurrent && reachable) onMove(step.id, cur.id)
                  }}
                >
                  {renderItem ? (
                    renderItem(step, { isCurrent, reachable: reachable && !isCurrent })
                  ) : (
                    <>
                      <StepAffordance step={step} />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className={cn(isCurrent && 'font-medium')}>
                          {step.label}
                        </span>
                        {/* Attribution (what happened) beats the static hint. */}
                        {(step.meta ?? step.description) ? (
                          <span className="text-muted-foreground text-xs">
                            {step.meta ?? step.description}
                          </span>
                        ) : null}
                      </span>
                    </>
                  )}
                  {isCurrent ? <CheckIcon className="ml-2" /> : null}
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  )
}

/** A step's leading visual: its icon, else a status-color dot, else nothing. */
function StepAffordance({ step }: { step: WorkflowStep }) {
  if (step.icon) return <span aria-hidden="true">{step.icon}</span>
  if (!step.color) return null
  return (
    <span
      aria-hidden="true"
      className="size-2 shrink-0 rounded-full"
      style={{
        backgroundColor: step.color,
        boxShadow: `0 0 0 2px color-mix(in srgb, ${step.color} 25%, transparent)`,
      }}
    />
  )
}

export interface UseWorkflowOptions<TCtx = unknown> {
  steps: WorkflowStep[]
  current: string
  context?: TCtx
  next?: NextResolver<TCtx>
  canMoveTo?: MovePredicate<TCtx>
}

/** Headless flow math — build your own control (stepper, command entry, shortcut) on top. */
export function useWorkflow<TCtx = unknown>({
  steps,
  current,
  context,
  next = defaultNext as NextResolver<TCtx>,
  canMoveTo = defaultCanMoveTo as MovePredicate<TCtx>,
}: UseWorkflowOptions<TCtx>) {
  const cur = steps.find((s) => s.id === current)
  const byId = (id: string) => steps.find((s) => s.id === id)

  let advanceTarget: string | null = null
  if (cur) {
    const targetId = next(cur, steps, context)
    const target = targetId ? byId(targetId) : null
    if (target && canMoveTo(target, cur, steps, context)) advanceTarget = targetId
  }

  return {
    currentStep: cur,
    advanceTarget,
    canAdvance: advanceTarget !== null,
    canMoveTo: (id: string) => {
      const to = byId(id)
      return !!(to && cur && id !== current && canMoveTo(to, cur, steps, context))
    },
    anyReachable:
      !!cur && steps.some((s) => s.id !== current && canMoveTo(s, cur, steps, context)),
  }
}
