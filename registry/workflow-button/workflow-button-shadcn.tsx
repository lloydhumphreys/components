// workflow-button-shadcn — the workflow split button composed from shadcn primitives.
//
// Same flow semantics as the vanilla `workflow-button` (primary advances one stage and
// re-labels itself; the caret menu jumps anywhere `canMoveTo` allows; `forwardOnly` = DAG
// mode), but built from your app's actual <Button> and <DropdownMenu> — so it *is* a shadcn
// button: identical variants, sizes, theming, focus rings, dark mode. Icons and custom
// primary content are plain ReactNode.
//
// Self-contained on purpose: the flow math is inlined rather than imported from the vanilla
// core, so this file installs alone (plus shadcn's button + dropdown-menu, pulled in as
// registryDependencies).

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

/** One stage in the flow. */
export interface WorkflowStep {
  /** Stable identity — what `current` points at and `onMove` reports. */
  id: string
  /** Menu label, and the primary's label when this step is the advance target
   *  (unless `advanceLabel` overrides it). */
  label: string
  /** Primary-button label when advancing *to* this step, e.g. "Submit for review". */
  advanceLabel?: string
  /** Optional secondary line under the label in the menu. */
  description?: string
  /** Optional leading icon (menu item + primary when targeted). Any ReactNode. */
  icon?: ReactNode
  /** Optional status color — a dot shown when no `icon` is given. */
  color?: string
  /** Hard-disable jumping to this step, regardless of `canMoveTo`. */
  disabled?: boolean
}

/** Resolve the advance target from a step. Return null for a terminal stage. */
export type NextResolver = (
  current: WorkflowStep,
  steps: WorkflowStep[],
) => string | null

/** May we move `from` → `to`? Governs the primary's enablement and each menu item. */
export type MovePredicate = (
  to: WorkflowStep,
  from: WorkflowStep,
  steps: WorkflowStep[],
) => boolean

/** Default advance target: the next step in array order, or null at the end. */
export const nextInOrder: NextResolver = (current, steps) => {
  const i = steps.findIndex((s) => s.id === current.id)
  return i >= 0 && i < steps.length - 1 ? steps[i + 1].id : null
}

/** DAG / one-way flows: only steps after the current one are reachable — never back. */
export const forwardOnly: MovePredicate = (to, from, steps) => {
  if (to.disabled) return false
  const fromI = steps.findIndex((s) => s.id === from.id)
  const toI = steps.findIndex((s) => s.id === to.id)
  return toI > fromI
}

const anyEnabled: MovePredicate = (to) => !to.disabled

const TRIGGER_SIZE = { sm: 'icon-sm', default: 'icon', lg: 'icon-lg' } as const

export interface WorkflowButtonProps {
  steps: WorkflowStep[]
  /** Id of the current stage (controlled — reflect `onMove` back into this prop). */
  current: string
  /** Fired on advance (primary) or a menu pick, with the target and previous ids. */
  onMove: (toId: string, fromId: string) => void
  next?: NextResolver
  /** Reachability predicate. Pass `forwardOnly` for a one-way / DAG flow. */
  canMoveTo?: MovePredicate
  /** Override the primary label. Falls back to `target.advanceLabel ?? target.label`. */
  advanceLabelFor?: (target: WorkflowStep, from: WorkflowStep) => string
  /** Fully own the primary's content. `target` is null at a terminal stage. */
  renderPrimary?: (ctx: {
    target: WorkflowStep | null
    current: WorkflowStep
  }) => ReactNode
  size?: 'sm' | 'default' | 'lg'
  variant?: 'default' | 'outline'
  /** Accessible name for the menu trigger. Default "Choose stage". */
  menuLabel?: string
  className?: string
}

/**
 * The workflow split button, in shadcn parts. Primary = <Button> advancing one stage;
 * caret = <DropdownMenu> of every stage, disabled per `canMoveTo`. Fully controlled.
 */
export function WorkflowButton({
  steps,
  current,
  onMove,
  next = nextInOrder,
  canMoveTo = anyEnabled,
  advanceLabelFor,
  renderPrimary,
  size = 'default',
  variant = 'default',
  menuLabel = 'Choose stage',
  className,
}: WorkflowButtonProps) {
  const cur = steps.find((s) => s.id === current)
  if (!cur) return null

  const targetId = next(cur, steps)
  const target =
    (targetId && steps.find((s) => s.id === targetId)) || null
  const advance = target && canMoveTo(target, cur, steps) ? target : null

  const primaryLabel = advance
    ? (advanceLabelFor?.(advance, cur) ?? advance.advanceLabel ?? advance.label)
    : cur.label
  const shown = advance ?? cur

  return (
    <div
      role="group"
      className={cn(
        'inline-flex rounded-md shadow-xs',
        variant === 'outline' && '-space-x-px',
        className,
      )}
    >
      <Button
        type="button"
        variant={advance ? variant : variant === 'outline' ? 'outline' : 'secondary'}
        size={size}
        disabled={!advance}
        onClick={() => advance && onMove(advance.id, cur.id)}
        aria-label={advance ? `${primaryLabel} (advance from ${cur.label})` : undefined}
        className={cn(
          'rounded-r-none shadow-none focus-visible:z-10',
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
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant={advance ? variant : variant === 'outline' ? 'outline' : 'secondary'}
            size={TRIGGER_SIZE[size]}
            aria-label={menuLabel}
            className={cn(
              'rounded-l-none shadow-none focus-visible:z-10',
              variant === 'default' &&
                'border-l border-primary-foreground/20 data-[state=open]:[&_svg]:rotate-180',
              variant === 'outline' && 'data-[state=open]:[&_svg]:rotate-180',
              !advance && variant === 'default' && 'border-secondary-foreground/15',
            )}
          >
            <ChevronDownIcon className="transition-transform duration-200" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          {steps.map((step) => {
            const isCurrent = step.id === current
            const reachable = isCurrent || canMoveTo(step, cur, steps)
            return (
              <DropdownMenuItem
                key={step.id}
                disabled={!reachable && !isCurrent}
                aria-current={isCurrent || undefined}
                onSelect={() => {
                  if (!isCurrent) onMove(step.id, cur.id)
                }}
              >
                <StepAffordance step={step} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className={cn(isCurrent && 'font-medium')}>{step.label}</span>
                  {step.description ? (
                    <span className="text-muted-foreground text-xs">
                      {step.description}
                    </span>
                  ) : null}
                </span>
                {isCurrent ? <CheckIcon className="ml-2" /> : null}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>
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

export interface UseWorkflowOptions {
  steps: WorkflowStep[]
  current: string
  next?: NextResolver
  canMoveTo?: MovePredicate
}

/** Headless flow math — build your own control (stepper, command entry, shortcut) on top. */
export function useWorkflow({
  steps,
  current,
  next = nextInOrder,
  canMoveTo = anyEnabled,
}: UseWorkflowOptions) {
  const cur = steps.find((s) => s.id === current)
  const byId = (id: string) => steps.find((s) => s.id === id)

  let advanceTarget: string | null = null
  if (cur) {
    const targetId = next(cur, steps)
    const target = targetId ? byId(targetId) : null
    if (target && canMoveTo(target, cur, steps)) advanceTarget = targetId
  }

  return {
    currentStep: cur,
    advanceTarget,
    canAdvance: advanceTarget !== null,
    canMoveTo: (id: string) => {
      const to = byId(id)
      return !!(to && cur && id !== current && canMoveTo(to, cur, steps))
    },
  }
}
