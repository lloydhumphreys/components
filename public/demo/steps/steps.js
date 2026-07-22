var Steps = (() => {
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

  // registry/steps/steps.ts
  var steps_exports = {};
  __export(steps_exports, {
    createSteps: () => createSteps,
    createStepsEngine: () => createStepsEngine,
    injectStepsStyles: () => injectStepsStyles,
    stepsStyles: () => stepsStyles
  });
  var clampIndex = (i, count) => Math.min(Math.max(Math.floor(i), 0), count - 1);
  function createStepsEngine(opts) {
    let steps = normalizeSteps(opts.steps);
    let count = steps.length;
    const errors = /* @__PURE__ */ new Set();
    const subs = /* @__PURE__ */ new Set();
    const stepId = (step, i) => step.id ?? String(i);
    const nearestEnabled = (i) => {
      if (!steps[i]?.disabled) return i;
      for (let d = 1; d < count; d++) {
        if (i + d < count && !steps[i + d].disabled) return i + d;
        if (i - d >= 0 && !steps[i - d].disabled) return i - d;
      }
      return i;
    };
    let index = nearestEnabled(clampIndex(opts.index ?? 0, count));
    let furthest = Math.max(index, clampIndex(opts.initialFurthest ?? index, count));
    const initialIndex = index;
    const initialId = stepId(steps[index], index);
    const initialReachedIds = new Set(
      steps.slice(0, furthest + 1).map((step, i) => stepId(step, i))
    );
    const statusFor = (i) => {
      if (steps[i].disabled) return "disabled";
      if (errors.has(i)) return "error";
      if (i === index) return "active";
      if (i <= furthest) return "completed";
      return "upcoming";
    };
    const nextEnabled = (from) => {
      for (let j = from + 1; j < count; j++) if (!steps[j].disabled) return j;
      return -1;
    };
    const prevEnabled = (from) => {
      for (let j = from - 1; j >= 0; j--) if (!steps[j].disabled) return j;
      return -1;
    };
    const getState = () => {
      const canNext = nextEnabled(index) !== -1;
      const canPrev = prevEnabled(index) !== -1;
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
        canPrev
      };
    };
    const notify = () => {
      const s = getState();
      subs.forEach((fn) => fn(s));
    };
    const jump = (to, reason) => {
      const prev = index;
      index = to;
      if (index !== prev) opts.onChange?.(index, prev, reason);
      notify();
    };
    const resolve = (target) => {
      if (typeof target === "number") {
        const i = Math.floor(target);
        return i >= 0 && i < count ? i : -1;
      }
      return steps.findIndex((s, i) => stepId(s, i) === target);
    };
    const canGoTo = (target) => {
      const i = resolve(target);
      return i !== -1 && !steps[i].disabled && i <= furthest;
    };
    return {
      getState,
      subscribe(fn) {
        subs.add(fn);
        return () => subs.delete(fn);
      },
      next() {
        const j = nextEnabled(index);
        if (j === -1) return;
        furthest = Math.max(furthest, j);
        jump(j, "next");
      },
      prev() {
        const j = prevEnabled(index);
        if (j === -1) return;
        jump(j, "prev");
      },
      goTo(target) {
        const i = resolve(target);
        if (i === -1 || i === index || !canGoTo(i)) return;
        jump(i, "goto");
      },
      canGoTo,
      indexOf: (id) => steps.findIndex((s, i) => stepId(s, i) === id),
      setStepError(target, error) {
        const i = resolve(target);
        if (i === -1) return;
        const changed = error ? errors.has(i) ? false : (errors.add(i), true) : errors.delete(i);
        if (changed) notify();
      },
      reset() {
        errors.clear();
        const initialMatch = steps.findIndex((step, i) => stepId(step, i) === initialId);
        const to = nearestEnabled(
          initialMatch === -1 ? clampIndex(initialIndex, count) : initialMatch
        );
        furthest = to;
        steps.forEach((step, i) => {
          if (initialReachedIds.has(stepId(step, i))) furthest = Math.max(furthest, i);
        });
        jump(to, "reset");
      },
      setOptions(patch) {
        if ("steps" in patch && patch.steps != null) {
          const prev = index;
          const previousId = stepId(steps[index], index);
          const reachedIds = new Set(
            steps.slice(0, furthest + 1).map((step, i) => stepId(step, i))
          );
          const errorIds = new Set(
            [...errors].map((i) => stepId(steps[i], i))
          );
          steps = normalizeSteps(patch.steps);
          count = steps.length;
          errors.clear();
          steps.forEach((step, i) => {
            if (errorIds.has(stepId(step, i))) errors.add(i);
          });
          const currentMatch = steps.findIndex((step, i) => stepId(step, i) === previousId);
          index = nearestEnabled(
            currentMatch === -1 ? clampIndex(prev, count) : currentMatch
          );
          furthest = index;
          steps.forEach((step, i) => {
            if (reachedIds.has(stepId(step, i))) furthest = Math.max(furthest, i);
          });
          if (stepId(steps[index], index) !== previousId) {
            opts.onChange?.(index, prev, "goto");
          }
        }
        notify();
      },
      destroy() {
        subs.clear();
      }
    };
  }
  function normalizeSteps(steps) {
    if (steps.length > 0) return steps;
    console.warn("steps: `steps` is empty \u2014 substituting a single disabled placeholder step.");
    return [{ title: "Step", disabled: true }];
  }
  function createSteps(opts) {
    if (opts.injectStyles !== false) injectStepsStyles();
    const engine = opts.engine ?? createStepsEngine(opts);
    const ownsEngine = !opts.engine;
    let orientation = opts.orientation ?? "horizontal";
    let size = opts.size ?? "md";
    let labels = opts.labels;
    let className = opts.className;
    let steps = engine.getState().steps;
    const root = document.createElement("nav");
    const list = document.createElement("ol");
    list.className = "steps-list";
    list.setAttribute("role", "list");
    const summary = document.createElement("div");
    summary.className = "steps-summary";
    const summaryTitle = document.createElement("span");
    summaryTitle.className = "steps-summary-title";
    const summaryDesc = document.createElement("p");
    summaryDesc.className = "steps-summary-desc";
    summary.append(summaryTitle, summaryDesc);
    root.append(list, summary);
    let items = [];
    let buttons = [];
    let markers = [];
    const applyLayout = () => {
      root.className = `steps steps--${orientation} steps--${size}${className ? ` ${className}` : ""}`;
      root.setAttribute("aria-label", labels?.root ?? "Progress");
    };
    const buildList = () => {
      list.replaceChildren();
      items = [];
      buttons = [];
      markers = [];
      steps.forEach((step, i) => {
        const li = document.createElement("li");
        li.className = "step";
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "step-hit";
        const marker = document.createElement("span");
        marker.className = "step-marker";
        const text = document.createElement("span");
        text.className = "step-text";
        const title = document.createElement("span");
        title.className = "step-title";
        title.textContent = step.title;
        title.title = step.title;
        const descWrap = document.createElement("span");
        descWrap.className = "step-description-wrap";
        const desc = document.createElement("p");
        desc.className = "step-description";
        desc.textContent = step.description ?? "";
        descWrap.appendChild(desc);
        text.append(title, descWrap);
        btn.append(marker, text);
        btn.addEventListener("click", () => engine.goTo(i));
        li.appendChild(btn);
        list.appendChild(li);
        items.push(li);
        buttons.push(btn);
        markers.push(marker);
      });
    };
    const stepLabel = (i, s) => {
      const step = steps[i];
      const status = s.status[i];
      const custom = labels?.step?.(i, s.count, step, status);
      if (custom != null) return custom;
      let label = `Step ${i + 1} of ${s.count}: ${step.title}`;
      if (i === s.index && step.description) label += ` \u2014 ${step.description}`;
      if (status === "completed") label += ", completed";
      else if (status === "error") label += ", has an error";
      else if (status === "disabled") label += ", unavailable";
      return label;
    };
    const statusIcon = (status) => {
      if (status !== "completed" && status !== "error" && status !== "disabled") return null;
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("aria-hidden", "true");
      svg.setAttribute("fill", "none");
      svg.setAttribute("stroke", "currentColor");
      svg.setAttribute("stroke-width", "2.6");
      svg.setAttribute("stroke-linecap", "round");
      svg.setAttribute("stroke-linejoin", "round");
      if (status === "completed") svg.innerHTML = '<path d="m5 12.5 4.5 4.5L19 7.5"/>';
      else if (status === "error") svg.innerHTML = '<path d="M12 9v4.5"/><path d="M12 17.2v.05"/><path d="M10.3 4.1 2.9 17a2 2 0 0 0 1.7 3h14.8a2 2 0 0 0 1.7-3L13.7 4.1a2 2 0 0 0-3.4 0Z"/>';
      else svg.innerHTML = '<rect x="5.5" y="10.5" width="13" height="9.5" rx="2"/><path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3"/>';
      return svg;
    };
    const render = (s) => {
      if (s.steps !== steps) {
        steps = s.steps;
        buildList();
      }
      items.forEach((li, i) => {
        const status = s.status[i];
        li.dataset.status = status;
        if (i <= s.furthest) li.dataset.filled = "true";
        else delete li.dataset.filled;
        if (i === s.index) li.setAttribute("aria-current", "step");
        else li.removeAttribute("aria-current");
        const btn = buttons[i];
        btn.disabled = !engine.canGoTo(i);
        btn.setAttribute("aria-label", stepLabel(i, s));
        markers[i].replaceChildren(steps[i].icon?.() ?? statusIcon(status) ?? document.createTextNode(String(i + 1)));
      });
      summaryTitle.textContent = steps[s.index].title;
      summaryDesc.textContent = steps[s.index].description ?? "";
      summaryDesc.style.display = steps[s.index].description ? "" : "none";
    };
    const onKeyDown = (e) => {
      const hit = e.target?.closest(".step-hit");
      if (!hit) return;
      const from = buttons.indexOf(hit);
      if (from === -1) return;
      const enabled = buttons.map((b, i) => !b.disabled ? i : -1).filter((i) => i !== -1);
      let to = -1;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") to = enabled.find((i) => i > from) ?? -1;
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") to = [...enabled].reverse().find((i) => i < from) ?? -1;
      else if (e.key === "Home") to = enabled[0] ?? -1;
      else if (e.key === "End") to = enabled[enabled.length - 1] ?? -1;
      else return;
      e.preventDefault();
      if (to !== -1 && to !== from) buttons[to].focus();
    };
    list.addEventListener("keydown", onKeyDown);
    applyLayout();
    buildList();
    render(engine.getState());
    const unsubscribe = engine.subscribe(render);
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
        if (ownsEngine && "steps" in patch) engine.setOptions({ steps: patch.steps });
        if ("orientation" in patch) orientation = patch.orientation ?? "horizontal";
        if ("size" in patch) size = patch.size ?? "md";
        if ("labels" in patch) labels = patch.labels;
        if ("className" in patch) className = patch.className;
        applyLayout();
        render(engine.getState());
      },
      destroy() {
        unsubscribe();
        list.removeEventListener("keydown", onKeyDown);
        if (ownsEngine) engine.destroy();
      }
    };
  }
  var stylesInjected = false;
  function injectStepsStyles() {
    if (stylesInjected || typeof document === "undefined") return;
    if (document.getElementById("steps-styles")) {
      stylesInjected = true;
      return;
    }
    const style = document.createElement("style");
    style.id = "steps-styles";
    style.textContent = stepsStyles();
    document.head.appendChild(style);
    stylesInjected = true;
  }
  function stepsStyles() {
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
   actually gets \u2014 no wrapper element or viewport breakpoint involved. */
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
/* \u2500\u2500 Connectors \u2500\u2500
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
   row \u2014 it stretches with the active step's revealed description automatically. Filled when
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
/* "Current step" visuals key off aria-current, not data-status \u2014 an errored active step
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
/* \u2500\u2500 Collapsed summary (horizontal only) \u2500\u2500
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
`;
  }
  return __toCommonJS(steps_exports);
})();
