// workflow-button — a zero-dependency split button that drives a flow through stages.
//
// One control, two jobs. The primary button performs the *default advance* — one click
// moves the entity to the next stage (Draft → In review → Approved → Published). The
// attached caret opens a menu of *every* stage, so you can jump anywhere the flow allows,
// not just forward. Which stages are reachable is a predicate you supply, so "in DAG mode
// you can't go back" is one line (see `forwardOnly`).
//
// The primary re-labels itself as you move: at Draft it reads "Submit for review", at
// Approved "Publish", and at the end it settles into a disabled readout of the final stage.
//
// Framework-agnostic vanilla DOM — no dependencies, no build step. A thin React wrapper
// (<WorkflowButton> + useWorkflow) lives in workflow-button-react.tsx.
//
// ── Theming ────────────────────────────────────────────────────────────────────────────
// Styles consume the shadcn theme tokens when present (`--primary`, `--popover`,
// `--accent`, `--border`, `--input`, `--ring`, `--radius`, …) so inside a shadcn app the
// control matches <Button>/<DropdownMenu> with zero configuration. Every token has a
// `light-dark()` fallback mirroring shadcn's zinc defaults, so it also reads correctly
// standalone. To override independently of the app theme, set the `--wf-*` variables on
// the host (or an ancestor) — each wins over its shadcn counterpart:
//   --wf-radius         corner radius                (--radius, 0.625rem)
//   --wf-primary-bg     primary button background    (--primary)
//   --wf-primary-fg     primary button text          (--primary-foreground)
//   --wf-border         outline/menu border color    (--input / --border)
//   --wf-hover          hover wash                   (--accent)
//   --wf-menu-bg        menu background              (--popover)
//   --wf-menu-fg        menu text                    (--popover-foreground)
//   --wf-muted          secondary text / disabled    (--muted-foreground)
//   --wf-ring           focus ring color             (--ring)
//
// React apps that want *literal* shadcn parts (real <Button> + <DropdownMenu>, ReactNode
// icons/children) should install `workflow-button-shadcn` instead — same flow semantics,
// composed from shadcn primitives.

/** One stage in the flow. */
export interface WorkflowStep {
  /** Stable identity — what `current` points at and `onMove` reports. */
  id: string
  /** Menu label, and the primary's label when this step is the advance target
   *  (unless `advanceLabel` overrides it). */
  label: string
  /** Primary-button label when advancing *to* this step, e.g. "Submit for review".
   *  Use a verb here; `label` (the noun) is the fallback. */
  advanceLabel?: string
  /** Optional secondary line under the label in the menu. */
  description?: string
  /** Optional status color (any CSS color) — a dot beside the label, in the menu and on the
   *  primary when this step is the target. Ignored when `icon` is set. */
  color?: string
  /** Optional icon factory — returns a node (e.g. an SVG) shown instead of the color dot,
   *  in the menu and on the primary. Called per render; return a fresh node each time. */
  icon?: () => Node
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

/**
 * A `canMoveTo` predicate for DAG / one-way flows: only steps *after* the current one (by
 * array order) are reachable — you can advance or skip ahead, never go back. Compose it
 * yourself for looser rules (e.g. allow one step back).
 */
export const forwardOnly: MovePredicate = (to, from, steps) => {
  if (to.disabled) return false
  const fromI = steps.findIndex((s) => s.id === from.id)
  const toI = steps.findIndex((s) => s.id === to.id)
  return toI > fromI
}

/** Default predicate: any step that isn't hard-disabled is reachable. */
const anyEnabled: MovePredicate = (to) => !to.disabled

export interface WorkflowButtonOptions {
  steps: WorkflowStep[]
  /** Id of the current stage. */
  current: string
  /** Advance target resolver. Default `nextInOrder`. */
  next?: NextResolver
  /** Reachability predicate. Default: any non-disabled step. Pass `forwardOnly` for DAG mode. */
  canMoveTo?: MovePredicate
  /**
   * Fired on advance (primary) or a menu pick, with the target and previous ids. Return
   * `false` to veto the built-in state update — do that when the parent owns `current` (async
   * saves, React props); then reflect the new stage via `setState({ current })`.
   */
  onMove: (toId: string, fromId: string) => void | boolean
  /** Advance the control's own `current` on a move (default true). Set false when a parent
   *  owns the state and drives it through `setState`. */
  manageState?: boolean
  /** Override the primary label. Falls back to `target.advanceLabel ?? target.label`. */
  advanceLabelFor?: (target: WorkflowStep, from: WorkflowStep) => string
  /**
   * Fully own the primary button's content: return a node (or string) and it replaces the
   * built-in icon/dot + label; return null to fall back to the default content for this
   * render. `target` is null at a terminal stage.
   */
  renderPrimary?: (ctx: {
    target: WorkflowStep | null
    current: WorkflowStep
  }) => Node | string | null
  /** shadcn Button sizes: h-8 / h-9 / h-10. Default 'default'. */
  size?: 'sm' | 'default' | 'lg'
  /** shadcn Button variants: 'default' = filled primary; 'outline' = bordered. */
  variant?: 'default' | 'outline'
  /** Accessible name for the menu trigger. Default "Choose stage". */
  menuLabel?: string
  /** Inject the stylesheet on first use (default true). */
  injectStyles?: boolean
  /** Extra class(es) on the root, for your own overrides. */
  className?: string
}

export interface WorkflowButton {
  /** The control root (a `role="group"`). Append it wherever you like. */
  readonly element: HTMLElement
  getCurrent(): string
  /** The id the primary would advance to right now, or null if terminal/blocked. */
  getAdvanceTarget(): string | null
  /** Patch options in place (current, steps, disabled flags…) and re-render. */
  setState(patch: Partial<Pick<WorkflowButtonOptions, 'steps' | 'current'>>): void
  /** Programmatically advance (same as clicking the primary). No-op if terminal/blocked. */
  advance(): void
  /** Programmatically move to a step, if reachable. */
  moveTo(id: string): void
  /** Detach listeners. Call before dropping `element`; then `element.remove()`. */
  destroy(): void
}

/** Build a workflow split button. */
export function createWorkflowButton(opts: WorkflowButtonOptions): WorkflowButton {
  if (opts.injectStyles !== false) injectWorkflowStyles()

  const next = opts.next ?? nextInOrder
  const canMoveTo = opts.canMoveTo ?? anyEnabled
  const manageState = opts.manageState ?? true
  const size = opts.size ?? 'default'
  const variant = opts.variant ?? 'default'

  let steps = opts.steps
  let current = opts.current

  const stepById = (id: string) => steps.find((s) => s.id === id)

  const root = document.createElement('div')
  root.className =
    `workflow-button workflow-button--${size} workflow-button--${variant}` +
    (opts.className ? ` ${opts.className}` : '')
  root.setAttribute('role', 'group')

  // ── Primary ────────────────────────────────────────────────────────────────
  const primary = document.createElement('button')
  primary.type = 'button'
  primary.className = 'wf-primary'

  // ── Caret trigger ──────────────────────────────────────────────────────────
  const trigger = document.createElement('button')
  trigger.type = 'button'
  trigger.className = 'wf-trigger'
  trigger.setAttribute('aria-haspopup', 'menu')
  trigger.setAttribute('aria-expanded', 'false')
  trigger.setAttribute('aria-label', opts.menuLabel ?? 'Choose stage')
  trigger.innerHTML = caretSvg()

  // ── Menu ───────────────────────────────────────────────────────────────────
  const menu = document.createElement('div')
  menu.className = 'wf-menu'
  menu.setAttribute('role', 'menu')
  menu.hidden = true

  root.appendChild(primary)
  root.appendChild(trigger)
  root.appendChild(menu)

  let items: HTMLButtonElement[] = []
  let open = false

  const advanceTargetId = (): string | null => {
    const cur = stepById(current)
    if (!cur) return null
    const targetId = next(cur, steps)
    if (!targetId) return null
    const target = stepById(targetId)
    if (!target || !canMoveTo(target, cur, steps)) return null
    return targetId
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  const renderPrimary = () => {
    const cur = stepById(current)
    if (!cur) return
    const targetId = advanceTargetId()
    const target = targetId ? stepById(targetId) : null

    primary.disabled = !target
    // Terminal (or blocked): the primary becomes a quiet readout of the current stage,
    // styled like shadcn's `secondary` variant rather than a half-faded disabled button.
    primary.classList.toggle('wf-primary--terminal', !target)

    primary.replaceChildren()
    const custom = opts.renderPrimary?.({ target: target ?? null, current: cur }) ?? null
    if (custom !== null) {
      appendContent(primary, custom)
      primary.removeAttribute('aria-label')
      return
    }
    const shown = target ?? cur
    const aff = affordanceFor(shown)
    if (aff) primary.appendChild(aff)
    const labelEl = document.createElement('span')
    labelEl.className = 'wf-primary-label'
    if (target) {
      const label =
        opts.advanceLabelFor?.(target, cur) ?? target.advanceLabel ?? target.label
      labelEl.textContent = label
      primary.setAttribute('aria-label', `${label} (advance from ${cur.label})`)
    } else {
      labelEl.textContent = cur.label
      primary.removeAttribute('aria-label')
    }
    primary.appendChild(labelEl)
  }

  const renderMenu = () => {
    menu.replaceChildren()
    items = steps.map((step) => {
      const item = document.createElement('button')
      item.type = 'button'
      item.className = 'wf-item'
      item.setAttribute('role', 'menuitem')
      item.dataset.id = step.id
      const isCurrent = step.id === current
      const reachable =
        isCurrent || canMoveTo(step, stepById(current) ?? step, steps)
      item.disabled = !reachable && !isCurrent
      item.tabIndex = -1
      if (isCurrent) item.setAttribute('aria-current', 'true')

      const aff = affordanceFor(step)

      const text = document.createElement('span')
      text.className = 'wf-item-text'
      const lbl = document.createElement('span')
      lbl.className = 'wf-item-label'
      lbl.textContent = step.label
      text.appendChild(lbl)
      if (step.description) {
        const desc = document.createElement('span')
        desc.className = 'wf-item-desc'
        desc.textContent = step.description
        text.appendChild(desc)
      }

      const mark = document.createElement('span')
      mark.className = 'wf-check'
      mark.setAttribute('aria-hidden', 'true')
      if (isCurrent) mark.innerHTML = checkSvg()

      if (aff) item.appendChild(aff)
      item.appendChild(text)
      item.appendChild(mark)

      item.addEventListener('click', () => {
        if (step.id === current) {
          closeMenu()
          return
        }
        if (item.disabled) return
        commitMove(step.id)
        closeMenu()
      })
      menu.appendChild(item)
      return item
    })
  }

  const render = () => {
    renderPrimary()
    renderMenu()
  }

  // ── Moves ────────────────────────────────────────────────────────────────────
  const commitMove = (toId: string) => {
    const fromId = current
    if (toId === fromId) return
    const to = stepById(toId)
    const from = stepById(fromId)
    if (!to || !from || !canMoveTo(to, from, steps)) return
    const veto = opts.onMove(toId, fromId)
    if (manageState && veto !== false) {
      current = toId
      render()
    }
  }

  const advance = () => {
    const targetId = advanceTargetId()
    if (targetId) commitMove(targetId)
  }

  // ── Menu open/close + keyboard ───────────────────────────────────────────────
  const focusItem = (i: number) => {
    const el = items[i]
    if (el) el.focus()
  }
  const firstEnabled = (dir: 1 | -1, from: number): number => {
    for (let i = from; i >= 0 && i < items.length; i += dir) {
      if (!items[i].disabled) return i
    }
    return -1
  }

  const openMenu = () => {
    if (open) return
    open = true
    menu.hidden = false
    trigger.setAttribute('aria-expanded', 'true')
    root.classList.add('is-open')
    // Focus the current item if reachable to interact with, else the first enabled one.
    const curIdx = steps.findIndex((s) => s.id === current)
    const start = items[curIdx] && !items[curIdx].disabled ? curIdx : firstEnabled(1, 0)
    if (start >= 0) focusItem(start)
    document.addEventListener('pointerdown', onDocPointer, true)
  }

  const closeMenu = (refocus = true) => {
    if (!open) return
    open = false
    menu.hidden = true
    trigger.setAttribute('aria-expanded', 'false')
    root.classList.remove('is-open')
    document.removeEventListener('pointerdown', onDocPointer, true)
    if (refocus) trigger.focus()
  }

  const onDocPointer = (e: PointerEvent) => {
    if (!root.contains(e.target as Node)) closeMenu(false)
  }

  const onTriggerClick = () => (open ? closeMenu() : openMenu())

  const onTriggerKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      openMenu()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      openMenu()
      const last = firstEnabled(-1, items.length - 1)
      if (last >= 0) focusItem(last)
    }
  }

  const onMenuKey = (e: KeyboardEvent) => {
    const idx = items.indexOf(document.activeElement as HTMLButtonElement)
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const n = firstEnabled(1, idx + 1)
      if (n >= 0) focusItem(n)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const p = firstEnabled(-1, idx - 1)
      if (p >= 0) focusItem(p)
    } else if (e.key === 'Home') {
      e.preventDefault()
      const f = firstEnabled(1, 0)
      if (f >= 0) focusItem(f)
    } else if (e.key === 'End') {
      e.preventDefault()
      const l = firstEnabled(-1, items.length - 1)
      if (l >= 0) focusItem(l)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      closeMenu()
    } else if (e.key === 'Tab') {
      // Tabbing out of the menu closes it (and lets focus move on naturally).
      closeMenu(false)
    }
  }

  primary.addEventListener('click', advance)
  trigger.addEventListener('click', onTriggerClick)
  trigger.addEventListener('keydown', onTriggerKey)
  menu.addEventListener('keydown', onMenuKey)

  render()

  return {
    element: root,
    getCurrent: () => current,
    getAdvanceTarget: advanceTargetId,
    setState(patch) {
      if (patch.steps) steps = patch.steps
      if (patch.current != null) current = patch.current
      render()
    },
    advance,
    moveTo: (id) => commitMove(id),
    destroy() {
      closeMenu(false)
      primary.removeEventListener('click', advance)
      trigger.removeEventListener('click', onTriggerClick)
      trigger.removeEventListener('keydown', onTriggerKey)
      menu.removeEventListener('keydown', onMenuKey)
      document.removeEventListener('pointerdown', onDocPointer, true)
    },
  }
}

// ── helpers ───────────────────────────────────────────────────────────────────

/** The step's leading visual: its icon if provided, else a status-color dot, else nothing. */
function affordanceFor(step: WorkflowStep): Node | null {
  if (step.icon) {
    const span = document.createElement('span')
    span.className = 'wf-icon'
    span.setAttribute('aria-hidden', 'true')
    span.appendChild(step.icon())
    return span
  }
  if (step.color) {
    const dot = document.createElement('span')
    dot.className = 'wf-dot'
    dot.setAttribute('aria-hidden', 'true')
    dot.style.setProperty('--dot', step.color)
    return dot
  }
  return null
}

function appendContent(host: HTMLElement, content: Node | string) {
  host.appendChild(
    typeof content === 'string' ? document.createTextNode(content) : content,
  )
}

function caretSvg(): string {
  return `<svg class="wf-caret" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>`
}

function checkSvg(): string {
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`
}

// ── Styles ───────────────────────────────────────────────────────────────────

let stylesInjected = false
/** Inject the stylesheet once. Called automatically unless `injectStyles: false`. */
export function injectWorkflowStyles(): void {
  if (stylesInjected || typeof document === 'undefined') return
  if (document.getElementById('workflow-button-styles')) {
    stylesInjected = true
    return
  }
  const style = document.createElement('style')
  style.id = 'workflow-button-styles'
  style.textContent = workflowStyles()
  document.head.appendChild(style)
  stylesInjected = true
}

/** The component's CSS as a string (for callers who inject styles themselves / SSR). */
export function workflowStyles(): string {
  return `
.workflow-button {
  /* shadcn theme tokens when present; zinc-flavored light-dark() fallbacks otherwise. */
  --_primary: var(--wf-primary-bg, var(--primary, light-dark(#18181b, #e4e4e7)));
  --_primary-fg: var(--wf-primary-fg, var(--primary-foreground, light-dark(#fafafa, #18181b)));
  --_secondary: var(--secondary, light-dark(#f4f4f5, #27272a));
  --_secondary-fg: var(--secondary-foreground, light-dark(#18181b, #fafafa));
  --_background: var(--background, light-dark(#ffffff, #09090b));
  --_accent: var(--wf-hover, var(--accent, light-dark(#f4f4f5, #27272a)));
  --_accent-fg: var(--accent-foreground, light-dark(#18181b, #fafafa));
  --_border: var(--wf-border, var(--input, var(--border, light-dark(#e4e4e7, #303036))));
  --_popover: var(--wf-menu-bg, var(--popover, light-dark(#ffffff, #18181b)));
  --_popover-fg: var(--wf-menu-fg, var(--popover-foreground, light-dark(#09090b, #fafafa)));
  --_muted-fg: var(--wf-muted, var(--muted-foreground, light-dark(#71717a, #a1a1aa)));
  --_ring: var(--wf-ring, var(--ring, light-dark(#a1a1aa, #71717a)));
  --_radius: var(--wf-radius, var(--radius, 0.625rem));
  /* shadcn's rounded-md — what <Button> actually uses. */
  --_radius-md: calc(var(--_radius) - 2px);
  position: relative;
  display: inline-flex;
  align-items: stretch;
  isolation: isolate;
  /* shadcn button typography: text-sm font-medium. */
  font-family: inherit; font-size: 14px; line-height: 1.4; font-weight: 500;
  color: inherit;
}
/* Base is layout-only — backgrounds/colors belong to the variant rules below, which are
   lower-specificity than this compound selector and must not lose to it. */
.workflow-button button {
  appearance: none; -webkit-appearance: none;
  font: inherit; margin: 0; border: 0; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  white-space: nowrap;
  transition: background-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease;
}
/* shadcn focus: 3px ring at 50% + ring-colored edge. */
.workflow-button button:focus-visible {
  outline: none; z-index: 1;
  box-shadow: 0 0 0 1px var(--_ring),
              0 0 0 4px color-mix(in srgb, var(--_ring) 50%, transparent);
}

/* ── default variant: filled primary, hairline divider (no borders → no doubling). */
.wf-primary {
  border-radius: var(--_radius-md) 0 0 var(--_radius-md);
  background: var(--_primary); color: var(--_primary-fg);
}
.wf-trigger {
  border-radius: 0 var(--_radius-md) var(--_radius-md) 0;
  background: var(--_primary); color: var(--_primary-fg);
  border-left: 1px solid color-mix(in srgb, var(--_primary-fg) 20%, transparent);
}
/* shadcn hover:bg-primary/90. */
.wf-primary:hover:not(:disabled),
.wf-trigger:hover { background: color-mix(in srgb, var(--_primary) 90%, transparent); }

/* Terminal readout: shadcn 'secondary', full opacity — a state, not a broken button. */
.wf-primary--terminal, .wf-primary--terminal:hover {
  background: var(--_secondary); color: var(--_secondary-fg); cursor: default;
}
.workflow-button--default:has(.wf-primary--terminal) .wf-trigger {
  background: var(--_secondary); color: var(--_secondary-fg);
  border-left-color: color-mix(in srgb, var(--_secondary-fg) 15%, transparent);
}
.workflow-button--default:has(.wf-primary--terminal) .wf-trigger:hover {
  background: color-mix(in srgb, var(--_secondary) 80%, var(--_secondary-fg) 6%);
}

/* ── outline variant: bordered like shadcn outline; edges overlap (-1px) → one border. */
.workflow-button--outline .wf-primary,
.workflow-button--outline .wf-trigger {
  border: 1px solid var(--_border);
  background: var(--_background); color: inherit;
}
.workflow-button--outline .wf-trigger { margin-left: -1px; border-radius: 0 var(--_radius-md) var(--_radius-md) 0; }
.workflow-button--outline .wf-primary { border-radius: var(--_radius-md) 0 0 var(--_radius-md); }
.workflow-button--outline .wf-primary:hover:not(:disabled),
.workflow-button--outline .wf-trigger:hover { background: var(--_accent); color: var(--_accent-fg); }
.workflow-button--outline .wf-primary--terminal,
.workflow-button--outline .wf-primary--terminal:hover {
  background: var(--_background); color: var(--_muted-fg); cursor: default;
}
/* Keep the shared edge crisp when the overlapped buttons are hovered/focused. */
.workflow-button--outline button:hover { z-index: 1; }

/* ── sizes (shadcn h-8 / h-9 / h-10; trigger is the matching square icon button). */
.wf-primary { height: 36px; padding: 0 16px; }
.wf-trigger { height: 36px; width: 36px; padding: 0; flex: none; }
.workflow-button--sm .wf-primary { height: 32px; padding: 0 12px; font-size: 13px; }
.workflow-button--sm .wf-trigger { height: 32px; width: 32px; }
.workflow-button--lg .wf-primary { height: 40px; padding: 0 24px; }
.workflow-button--lg .wf-trigger { height: 40px; width: 40px; }

.wf-caret { transition: transform 0.18s ease; }
.workflow-button.is-open .wf-caret { transform: rotate(180deg); }

/* Step affordances: icon slot (16px, like shadcn's size-4 svgs) or status dot. */
.wf-icon { flex: none; display: inline-flex; pointer-events: none; }
.wf-icon svg, .wf-icon img { width: 16px; height: 16px; display: block; }
.wf-dot {
  flex: none; width: 8px; height: 8px; border-radius: 50%;
  background: var(--dot, currentColor);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--dot, currentColor) 22%, transparent);
}

/* ── menu: shadcn DropdownMenuContent/Item. */
.wf-menu {
  position: absolute; top: calc(100% + 4px); right: 0; z-index: 50;
  min-width: max(100%, 220px); max-height: 320px; overflow-y: auto;
  padding: 4px; box-sizing: border-box;
  background: var(--_popover); color: var(--_popover-fg);
  border: 1px solid var(--border, light-dark(#e4e4e7, #27272a));
  border-radius: var(--_radius-md);
  box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
}
.wf-item {
  width: 100%; text-align: left;
  background: transparent; color: inherit;
  border-radius: calc(var(--_radius) - 4px);
  padding: 6px 8px; gap: 8px;
  font-weight: 400;
}
.wf-item:hover:not(:disabled), .wf-item:focus-visible {
  background: var(--_accent); color: var(--_accent-fg);
  outline: none; box-shadow: none;
}
.wf-item:disabled { opacity: 0.5; cursor: default; }
.wf-item[aria-current="true"] .wf-item-label { font-weight: 500; }
.wf-item-text { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.wf-item-label { line-height: 1.4; }
.wf-item-desc { font-size: 12px; line-height: 1.4; color: var(--_muted-fg); }
.wf-item:hover:not(:disabled) .wf-item-desc,
.wf-item:focus-visible .wf-item-desc { color: color-mix(in srgb, var(--_accent-fg) 70%, transparent); }
.wf-check { flex: none; display: inline-flex; width: 16px; }
`
}
