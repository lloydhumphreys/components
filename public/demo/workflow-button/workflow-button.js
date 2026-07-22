var WorkflowButton = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // registry/workflow-button/workflow-button.ts
  var workflow_button_exports = {};
  __export(workflow_button_exports, {
    createWorkflowButton: () => createWorkflowButton,
    defaultCanMoveTo: () => defaultCanMoveTo,
    defaultNext: () => defaultNext,
    forwardOnly: () => forwardOnly,
    injectWorkflowStyles: () => injectWorkflowStyles,
    nextInOrder: () => nextInOrder,
    normalizeVariant: () => normalizeVariant,
    workflowStyles: () => workflowStyles
  });
  function normalizeVariant(v) {
    return v === "primary" ? "default" : v;
  }
  var nextInOrder = (current, steps) => {
    const i = steps.findIndex((s) => s.id === current.id);
    return i >= 0 && i < steps.length - 1 ? steps[i + 1].id : null;
  };
  var defaultNext = (current, steps, context) => {
    if (current.to) return current.to[0] ?? null;
    return nextInOrder(current, steps, context);
  };
  var defaultCanMoveTo = (to, from) => {
    if (to.disabled) return false;
    if (from.to) return from.to.includes(to.id);
    return true;
  };
  var forwardOnly = (to, from, steps) => {
    if (to.disabled) return false;
    const fromI = steps.findIndex((s) => s.id === from.id);
    const toI = steps.findIndex((s) => s.id === to.id);
    return toI > fromI;
  };
  function createWorkflowButton(opts) {
    if (opts.injectStyles !== false) injectWorkflowStyles();
    const next = opts.next ?? defaultNext;
    const canMoveTo = opts.canMoveTo ?? defaultCanMoveTo;
    const manageState = opts.manageState ?? true;
    const size = opts.size ?? "default";
    const baseVariant = opts.variant ?? "default";
    let steps = opts.steps;
    let current = opts.current;
    let context = opts.context;
    const stepById = (id) => steps.find((s) => s.id === id);
    const resolveVariant = (target, cur) => {
      if (target) {
        return normalizeVariant(
          opts.variantFor?.(target, cur, context) ?? target.advanceVariant ?? baseVariant
        );
      }
      const base = normalizeVariant(baseVariant);
      return base === "outline" || base === "ghost" ? base : "secondary";
    };
    const root = document.createElement("div");
    const baseClass = `workflow-button wf-size-${size}` + (opts.className ? ` ${opts.className}` : "");
    const applyRootState = (variant, terminal) => {
      root.className = `${baseClass} wf-variant-${variant}` + (terminal ? " is-terminal" : "") + (open ? " is-open" : "");
    };
    root.setAttribute("role", "group");
    const primary = document.createElement("button");
    primary.type = "button";
    primary.className = "wf-primary";
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "wf-trigger";
    trigger.setAttribute("aria-haspopup", "menu");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-label", opts.menuLabel ?? "Choose stage");
    trigger.innerHTML = caretSvg();
    const menu = document.createElement("div");
    menu.className = "wf-menu";
    menu.setAttribute("role", "menu");
    menu.hidden = true;
    root.appendChild(primary);
    root.appendChild(trigger);
    root.appendChild(menu);
    let items = [];
    let open = false;
    const advanceTargetId = () => {
      const cur = stepById(current);
      if (!cur) return null;
      const targetId = next(cur, steps, context);
      if (!targetId) return null;
      const target = stepById(targetId);
      if (!target || !canMoveTo(target, cur, steps, context)) return null;
      return targetId;
    };
    const anyReachable = () => {
      const cur = stepById(current);
      if (!cur) return false;
      return steps.some((s) => s.id !== current && canMoveTo(s, cur, steps, context));
    };
    const renderPrimary = () => {
      const cur = stepById(current);
      if (!cur) return;
      const targetId = advanceTargetId();
      const target = targetId ? stepById(targetId) : null;
      primary.disabled = !target;
      applyRootState(resolveVariant(target ?? null, cur), !target);
      primary.replaceChildren();
      const custom = opts.renderPrimary?.({ target: target ?? null, current: cur }) ?? null;
      if (custom !== null) {
        appendContent(primary, custom);
        primary.removeAttribute("aria-label");
        return;
      }
      const shown = target ?? cur;
      const aff = affordanceFor(shown);
      if (aff) primary.appendChild(aff);
      const labelEl = document.createElement("span");
      labelEl.className = "wf-primary-label";
      if (target) {
        const label = opts.advanceLabelFor?.(target, cur, context) ?? target.advanceLabel ?? target.label;
        labelEl.textContent = label;
        primary.setAttribute("aria-label", `${label} (advance from ${cur.label})`);
      } else {
        labelEl.textContent = cur.label;
        primary.removeAttribute("aria-label");
      }
      primary.appendChild(labelEl);
    };
    const renderMenu = () => {
      const solo = !anyReachable();
      trigger.hidden = solo;
      root.classList.toggle("is-solo", solo);
      if (solo && open) closeMenu(false);
      menu.replaceChildren();
      items = steps.map((step) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "wf-item";
        item.setAttribute("role", "menuitem");
        item.dataset.id = step.id;
        const isCurrent = step.id === current;
        const reachable = isCurrent || canMoveTo(step, stepById(current) ?? step, steps, context);
        item.disabled = !reachable && !isCurrent;
        item.tabIndex = -1;
        if (isCurrent) item.setAttribute("aria-current", "true");
        const mark = document.createElement("span");
        mark.className = "wf-check";
        mark.setAttribute("aria-hidden", "true");
        if (isCurrent) mark.innerHTML = checkSvg();
        const custom = opts.renderItem?.(step, { isCurrent, reachable: reachable && !isCurrent }) ?? null;
        if (custom !== null) {
          appendContent(item, custom);
          item.appendChild(mark);
        } else {
          const aff = affordanceFor(step);
          const text = document.createElement("span");
          text.className = "wf-item-text";
          const lbl = document.createElement("span");
          lbl.className = "wf-item-label";
          lbl.textContent = step.label;
          text.appendChild(lbl);
          const sub = step.meta ?? step.description;
          if (sub) {
            const desc = document.createElement("span");
            desc.className = "wf-item-desc";
            desc.textContent = sub;
            text.appendChild(desc);
          }
          if (aff) item.appendChild(aff);
          item.appendChild(text);
          item.appendChild(mark);
        }
        item.addEventListener("click", () => {
          if (step.id === current) {
            closeMenu();
            return;
          }
          if (item.disabled) return;
          commitMove(step.id);
          closeMenu();
        });
        menu.appendChild(item);
        return item;
      });
    };
    const render = () => {
      renderPrimary();
      renderMenu();
    };
    const commitMove = (toId) => {
      const fromId = current;
      if (toId === fromId) return;
      const to = stepById(toId);
      const from = stepById(fromId);
      if (!to || !from || !canMoveTo(to, from, steps, context)) return;
      const veto = opts.onMove(toId, fromId);
      if (manageState && veto !== false) {
        current = toId;
        render();
      }
    };
    const advance = () => {
      const targetId = advanceTargetId();
      if (targetId) commitMove(targetId);
    };
    const focusItem = (i) => {
      const el = items[i];
      if (el) el.focus();
    };
    const firstEnabled = (dir, from) => {
      for (let i = from; i >= 0 && i < items.length; i += dir) {
        if (!items[i].disabled) return i;
      }
      return -1;
    };
    const openMenu = () => {
      if (open) return;
      open = true;
      menu.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
      root.classList.add("is-open");
      const curIdx = steps.findIndex((s) => s.id === current);
      const start = items[curIdx] && !items[curIdx].disabled ? curIdx : firstEnabled(1, 0);
      if (start >= 0) focusItem(start);
      document.addEventListener("pointerdown", onDocPointer, true);
    };
    const closeMenu = (refocus = true) => {
      if (!open) return;
      open = false;
      menu.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
      root.classList.remove("is-open");
      document.removeEventListener("pointerdown", onDocPointer, true);
      if (refocus) trigger.focus();
    };
    const onDocPointer = (e) => {
      if (!root.contains(e.target)) closeMenu(false);
    };
    const onTriggerClick = () => open ? closeMenu() : openMenu();
    const onTriggerKey = (e) => {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openMenu();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        openMenu();
        const last = firstEnabled(-1, items.length - 1);
        if (last >= 0) focusItem(last);
      }
    };
    const onMenuKey = (e) => {
      const idx = items.indexOf(document.activeElement);
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const n = firstEnabled(1, idx + 1);
        if (n >= 0) focusItem(n);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const p = firstEnabled(-1, idx - 1);
        if (p >= 0) focusItem(p);
      } else if (e.key === "Home") {
        e.preventDefault();
        const f = firstEnabled(1, 0);
        if (f >= 0) focusItem(f);
      } else if (e.key === "End") {
        e.preventDefault();
        const l = firstEnabled(-1, items.length - 1);
        if (l >= 0) focusItem(l);
      } else if (e.key === "Escape") {
        e.preventDefault();
        closeMenu();
      } else if (e.key === "Tab") {
        closeMenu(false);
      }
    };
    primary.addEventListener("click", advance);
    trigger.addEventListener("click", onTriggerClick);
    trigger.addEventListener("keydown", onTriggerKey);
    menu.addEventListener("keydown", onMenuKey);
    render();
    return {
      element: root,
      getCurrent: () => current,
      getAdvanceTarget: advanceTargetId,
      setState(patch) {
        if (patch.steps) steps = patch.steps;
        if (patch.current != null) current = patch.current;
        if ("context" in patch) context = patch.context;
        render();
      },
      advance,
      moveTo: (id) => commitMove(id),
      destroy() {
        closeMenu(false);
        primary.removeEventListener("click", advance);
        trigger.removeEventListener("click", onTriggerClick);
        trigger.removeEventListener("keydown", onTriggerKey);
        menu.removeEventListener("keydown", onMenuKey);
        document.removeEventListener("pointerdown", onDocPointer, true);
      }
    };
  }
  function affordanceFor(step) {
    if (step.icon) {
      const span = document.createElement("span");
      span.className = "wf-icon";
      span.setAttribute("aria-hidden", "true");
      span.appendChild(step.icon());
      return span;
    }
    if (step.color) {
      const dot = document.createElement("span");
      dot.className = "wf-dot";
      dot.setAttribute("aria-hidden", "true");
      dot.style.setProperty("--dot", step.color);
      return dot;
    }
    return null;
  }
  function appendContent(host, content) {
    host.appendChild(
      typeof content === "string" ? document.createTextNode(content) : content
    );
  }
  function caretSvg() {
    return `<svg class="wf-caret" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>`;
  }
  function checkSvg() {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;
  }
  var stylesInjected = false;
  function injectWorkflowStyles() {
    if (stylesInjected || typeof document === "undefined") return;
    if (document.getElementById("workflow-button-styles")) {
      stylesInjected = true;
      return;
    }
    const style = document.createElement("style");
    style.id = "workflow-button-styles";
    style.textContent = workflowStyles();
    document.head.appendChild(style);
    stylesInjected = true;
  }
  function workflowStyles() {
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
  --_destructive: var(--destructive, light-dark(#dc2626, #b91c1c));
  --_ring: var(--wf-ring, var(--ring, light-dark(#a1a1aa, #71717a)));
  --_radius: var(--wf-radius, var(--radius, 0.625rem));
  /* shadcn's rounded-md \u2014 what <Button> actually uses. */
  --_radius-md: calc(var(--_radius) - 2px);
  position: relative;
  display: inline-flex;
  align-items: stretch;
  isolation: isolate;
  /* shadcn button typography: text-sm font-medium. */
  font-family: inherit; font-size: 14px; line-height: 1.4; font-weight: 500;
  color: inherit;
}
/* Base is layout-only \u2014 backgrounds/colors belong to the variant rules below, which are
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

/* Shared split geometry. */
.wf-primary { border-radius: var(--_radius-md) 0 0 var(--_radius-md); }
.wf-trigger { border-radius: 0 var(--_radius-md) var(--_radius-md) 0; }
.workflow-button.is-terminal .wf-primary { cursor: default; }
/* Solo mode: nowhere to go at all \u2014 the caret hides and the primary owns both corners.
   The display rule must be explicit: our button base sets display:inline-flex, and any
   author display beats the UA's [hidden] \u2192 none, so the hidden attribute alone is not
   enough to remove the trigger. */
.workflow-button.is-solo .wf-primary { border-radius: var(--_radius-md); }
.workflow-button.is-solo .wf-trigger,
.workflow-button .wf-trigger[hidden] { display: none; }

/* \u2500\u2500 default: filled primary, hairline divider (no borders \u2192 no doubling). */
.wf-variant-default .wf-primary,
.wf-variant-default .wf-trigger { background: var(--_primary); color: var(--_primary-fg); }
.wf-variant-default .wf-trigger {
  border-left: 1px solid color-mix(in srgb, var(--_primary-fg) 20%, transparent);
}
/* shadcn hover:bg-primary/90. */
.wf-variant-default .wf-primary:hover:not(:disabled),
.wf-variant-default .wf-trigger:hover {
  background: color-mix(in srgb, var(--_primary) 90%, transparent);
}

/* \u2500\u2500 secondary: also the terminal readout (a state, not a broken button). */
.wf-variant-secondary .wf-primary,
.wf-variant-secondary .wf-trigger { background: var(--_secondary); color: var(--_secondary-fg); }
.wf-variant-secondary .wf-trigger {
  border-left: 1px solid color-mix(in srgb, var(--_secondary-fg) 15%, transparent);
}
.wf-variant-secondary .wf-primary:hover:not(:disabled),
.wf-variant-secondary .wf-trigger:hover {
  background: color-mix(in srgb, var(--_secondary) 80%, var(--_secondary-fg) 6%);
}

/* \u2500\u2500 destructive: for high-consequence advances (irreversible publishes, rejections). */
.wf-variant-destructive .wf-primary,
.wf-variant-destructive .wf-trigger {
  background: var(--_destructive); color: #fff;
}
.wf-variant-destructive .wf-trigger {
  border-left: 1px solid color-mix(in srgb, #fff 25%, transparent);
}
.wf-variant-destructive .wf-primary:hover:not(:disabled),
.wf-variant-destructive .wf-trigger:hover {
  background: color-mix(in srgb, var(--_destructive) 90%, transparent);
}

/* \u2500\u2500 ghost: no chrome at rest; hover reveals the accent wash (per shadcn). */
.wf-variant-ghost .wf-primary,
.wf-variant-ghost .wf-trigger { background: transparent; color: inherit; }
.wf-variant-ghost .wf-primary:hover:not(:disabled),
.wf-variant-ghost .wf-trigger:hover { background: var(--_accent); color: var(--_accent-fg); }
.wf-variant-ghost.is-terminal .wf-primary { color: var(--_muted-fg); }

/* \u2500\u2500 outline: bordered like shadcn outline; edges overlap (-1px) \u2192 one border. */
.wf-variant-outline .wf-primary,
.wf-variant-outline .wf-trigger {
  border: 1px solid var(--_border);
  background: var(--_background); color: inherit;
}
.wf-variant-outline .wf-trigger { margin-left: -1px; border-radius: 0 var(--_radius-md) var(--_radius-md) 0; }
.wf-variant-outline .wf-primary:hover:not(:disabled),
.wf-variant-outline .wf-trigger:hover { background: var(--_accent); color: var(--_accent-fg); }
.wf-variant-outline.is-terminal .wf-primary { color: var(--_muted-fg); }
/* Keep the shared edge crisp when the overlapped buttons are hovered/focused. */
.wf-variant-outline button:hover { z-index: 1; }

/* \u2500\u2500 sizes (shadcn h-8 / h-9 / h-10; trigger is the matching square icon button). */
.wf-primary { height: 36px; padding: 0 16px; }
.wf-trigger { height: 36px; width: 36px; padding: 0; flex: none; }
.wf-size-sm .wf-primary { height: 32px; padding: 0 12px; font-size: 13px; }
.wf-size-sm .wf-trigger { height: 32px; width: 32px; }
.wf-size-lg .wf-primary { height: 40px; padding: 0 24px; }
.wf-size-lg .wf-trigger { height: 40px; width: 40px; }

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

/* \u2500\u2500 menu: shadcn DropdownMenuContent/Item. */
.wf-menu {
  position: absolute; top: calc(100% + 4px); right: 0; z-index: 50;
  min-width: max(100%, 220px); max-height: 320px; overflow-y: auto;
  padding: 4px; box-sizing: border-box;
  background: var(--_popover); color: var(--_popover-fg);
  border: 1px solid var(--_border);
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
`;
  }
  return __toCommonJS(workflow_button_exports);
})();
