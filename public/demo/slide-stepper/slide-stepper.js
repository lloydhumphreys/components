var SlideStepper = (() => {
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

  // registry/slide-stepper/slide-stepper-carousel.ts
  var slide_stepper_carousel_exports = {};
  __export(slide_stepper_carousel_exports, {
    attachAutoPause: () => attachAutoPause,
    attachSwipeNav: () => attachSwipeNav,
    carouselStyles: () => carouselStyles,
    createSlideStepper: () => createSlideStepper,
    createSlideStepperCarousel: () => createSlideStepperCarousel,
    createStepperEngine: () => createStepperEngine,
    injectCarouselStyles: () => injectCarouselStyles,
    injectStepperStyles: () => injectStepperStyles,
    stepperStyles: () => stepperStyles
  });

  // registry/slide-stepper/slide-stepper.ts
  var clampIndex = (i, count) => Math.min(Math.max(Math.floor(i), 0), count - 1);
  function createStepperEngine(opts) {
    let count = Math.max(1, Math.floor(opts.count));
    let duration = opts.duration ?? 5e3;
    let durations = opts.durations;
    let loop = opts.loop ?? true;
    let index = clampIndex(opts.index ?? 0, count);
    let done = false;
    let elapsed = 0;
    let runStart = null;
    let timer;
    const reasons = /* @__PURE__ */ new Set();
    if (opts.startPaused) reasons.add("user");
    const subs = /* @__PURE__ */ new Set();
    const now = () => typeof performance !== "undefined" ? performance.now() : Date.now();
    const durationFor = (i) => {
      const v = durations ? durations[i] : void 0;
      return typeof v === "number" && v > 0 ? v : duration;
    };
    const getProgress = () => {
      if (done) return 1;
      const live = runStart != null ? now() - runStart : 0;
      return Math.min(1, (elapsed + live) / durationFor(index));
    };
    const getState = () => ({
      index,
      count,
      progress: getProgress(),
      paused: reasons.size > 0,
      pauseReasons: [...reasons],
      done
    });
    const notify = () => {
      const s = getState();
      subs.forEach((fn) => fn(s));
    };
    const clearTimer = () => {
      if (timer !== void 0) {
        clearTimeout(timer);
        timer = void 0;
      }
    };
    const armTimer = () => {
      clearTimer();
      if (reasons.size > 0 || done) {
        runStart = null;
        return;
      }
      runStart = now();
      timer = setTimeout(complete, Math.max(0, durationFor(index) - elapsed));
    };
    const complete = () => {
      opts.onComplete?.(index);
      if (index < count - 1) jump(index + 1, "advance");
      else if (loop) jump(0, "loop");
      else {
        done = true;
        elapsed = durationFor(index);
        clearTimer();
        runStart = null;
        notify();
      }
    };
    const jump = (to, reason) => {
      const prev = index;
      index = clampIndex(to, count);
      done = false;
      elapsed = 0;
      runStart = null;
      if (index !== prev) opts.onChange?.(index, prev, reason);
      armTimer();
      notify();
    };
    const pause = (reason = "user") => {
      if (reasons.has(reason)) return;
      const wasRunning = reasons.size === 0 && !done;
      if (wasRunning && runStart != null) {
        elapsed += now() - runStart;
        runStart = null;
      }
      reasons.add(reason);
      clearTimer();
      if (wasRunning) opts.onPauseChange?.(true, [...reasons]);
      notify();
    };
    const resume = (reason = "user") => {
      if (!reasons.delete(reason)) return;
      if (reasons.size === 0) {
        armTimer();
        opts.onPauseChange?.(false, []);
      }
      notify();
    };
    return {
      getState,
      durationFor,
      subscribe(fn) {
        subs.add(fn);
        if (runStart == null) armTimer();
        return () => subs.delete(fn);
      },
      next() {
        if (index < count - 1) jump(index + 1, "next");
        else if (loop) jump(0, "next");
      },
      prev() {
        if (index > 0) jump(index - 1, "prev");
        else if (loop) jump(count - 1, "prev");
      },
      goTo(i, o) {
        if (o?.restart === false && clampIndex(i, count) === index) return;
        jump(i, "goto");
      },
      pause,
      resume,
      toggleUserPause() {
        if (done) {
          reasons.delete("user");
          jump(0, "goto");
        } else if (reasons.has("user")) resume("user");
        else pause("user");
      },
      isPausedBy: (reason) => reasons.has(reason),
      setOptions(patch) {
        if (runStart != null) {
          elapsed += now() - runStart;
          runStart = null;
        }
        if ("count" in patch && patch.count != null) {
          count = Math.max(1, Math.floor(patch.count));
          const prev = index;
          index = clampIndex(index, count);
          if (index !== prev) {
            elapsed = 0;
            done = false;
            opts.onChange?.(index, prev, "goto");
          } else if (done && index < count - 1) {
            done = false;
            elapsed = 0;
          }
        }
        if ("duration" in patch) duration = patch.duration ?? 5e3;
        if ("durations" in patch) durations = patch.durations;
        if ("loop" in patch) loop = patch.loop ?? true;
        armTimer();
        notify();
      },
      destroy() {
        clearTimer();
        runStart = null;
        subs.clear();
      }
    };
  }
  function attachAutoPause(el, engine, opts = {}) {
    const detach = [];
    if (opts.hidden !== false && typeof document !== "undefined") {
      const onVis = () => document.hidden ? engine.pause("hidden") : engine.resume("hidden");
      document.addEventListener("visibilitychange", onVis);
      if (document.hidden) engine.pause("hidden");
      detach.push(() => {
        document.removeEventListener("visibilitychange", onVis);
        engine.resume("hidden");
      });
    }
    if (opts.hover !== false && typeof matchMedia !== "undefined" && matchMedia("(hover: hover) and (pointer: fine)").matches) {
      const enter = () => engine.pause("hover");
      const leave = () => engine.resume("hover");
      el.addEventListener("pointerenter", enter);
      el.addEventListener("pointerleave", leave);
      detach.push(() => {
        el.removeEventListener("pointerenter", enter);
        el.removeEventListener("pointerleave", leave);
        engine.resume("hover");
      });
    }
    if (opts.offscreen !== false && typeof IntersectionObserver !== "undefined") {
      const io = new IntersectionObserver(
        (entries) => {
          const entry = entries[entries.length - 1];
          if (entry) entry.isIntersecting ? engine.resume("offscreen") : engine.pause("offscreen");
        },
        { threshold: opts.offscreenThreshold ?? 0 }
      );
      io.observe(el);
      detach.push(() => {
        io.disconnect();
        engine.resume("offscreen");
      });
    }
    return () => detach.forEach((fn) => fn());
  }
  function attachSwipeNav(el, opts) {
    const threshold = opts.threshold ?? 24;
    let pointerId = null;
    let startX = 0;
    let startY = 0;
    let swiping = false;
    let swallowUntil = 0;
    const finish = () => {
      unbindWindow();
      pointerId = null;
      swiping = false;
      opts.onGestureEnd?.();
    };
    const onDown = (e) => {
      if (!e.isPrimary || pointerId != null) return;
      pointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      swiping = false;
      bindWindow();
      opts.onGestureStart?.();
    };
    const onMove = (e) => {
      if (e.pointerId !== pointerId || swiping) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const main = opts.axis === "x" ? dx : dy;
      const cross = opts.axis === "x" ? dy : dx;
      if (Math.abs(main) > threshold && Math.abs(main) > Math.abs(cross)) swiping = true;
    };
    const onUp = (e) => {
      if (e.pointerId !== pointerId) return;
      if (swiping) {
        const main = opts.axis === "x" ? e.clientX - startX : e.clientY - startY;
        swallowUntil = Date.now() + 350;
        opts.onSwipe(main < 0 ? 1 : -1);
      }
      finish();
    };
    const onCancel = (e) => {
      if (e.pointerId === pointerId) finish();
    };
    const onClick = (e) => {
      if (Date.now() >= swallowUntil) return;
      swallowUntil = 0;
      e.preventDefault();
      e.stopPropagation();
    };
    const bindWindow = () => {
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onCancel);
    };
    const unbindWindow = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("click", onClick, true);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("click", onClick, true);
      if (pointerId != null) finish();
    };
  }
  function createSlideStepper(opts) {
    if (opts.injectStyles !== false) injectStepperStyles();
    const engine = opts.engine ?? createStepperEngine(opts);
    const ownsEngine = !opts.engine;
    let orientation = opts.orientation ?? "horizontal";
    let clip = opts.clip;
    let size = opts.size ?? "md";
    let showPause = opts.showPause !== false;
    let labels = opts.labels;
    let slideIds = opts.slideIds;
    let className = opts.className;
    let count = engine.getState().count;
    const root = document.createElement("div");
    const pill = document.createElement("div");
    pill.className = "slide-stepper-pill";
    const win = document.createElement("div");
    win.className = "slide-stepper-window";
    const strip = document.createElement("div");
    strip.className = "slide-stepper-strip";
    strip.setAttribute("role", "tablist");
    const pauseBtn = document.createElement("button");
    pauseBtn.type = "button";
    pauseBtn.className = "slide-stepper-pause";
    win.appendChild(strip);
    pill.appendChild(win);
    root.appendChild(pill);
    root.appendChild(pauseBtn);
    let dots = [];
    let fills = [];
    const applyLayout = () => {
      root.className = `slide-stepper slide-stepper--${orientation} slide-stepper--${size}${className ? ` ${className}` : ""}`;
      root.dataset.orientation = orientation;
      strip.setAttribute("aria-orientation", orientation);
      strip.setAttribute("aria-label", labels?.root ?? "Slide progress");
      pauseBtn.style.display = showPause ? "" : "none";
      win.style.setProperty("--_count", String(count));
      win.style.setProperty("--_clip", String(Math.max(1, Math.min(clip ?? count, count))));
    };
    const buildDots = () => {
      strip.replaceChildren();
      dots = [];
      fills = [];
      for (let i = 0; i < count; i++) {
        const dot = document.createElement("button");
        dot.type = "button";
        dot.className = "slide-stepper-dot";
        dot.setAttribute("role", "tab");
        dot.setAttribute("aria-label", labels?.slide?.(i, count) ?? `Slide ${i + 1} of ${count}`);
        const controls = slideIds?.[i];
        if (controls) dot.setAttribute("aria-controls", controls);
        const track = document.createElement("span");
        track.className = "slide-stepper-dot-track";
        const fill = document.createElement("span");
        fill.className = "slide-stepper-dot-fill";
        track.appendChild(fill);
        dot.appendChild(track);
        dot.addEventListener("click", () => engine.goTo(i));
        strip.appendChild(dot);
        dots.push(dot);
        fills.push(fill);
      }
    };
    const dim = () => orientation === "horizontal" ? "width" : "height";
    const paintFill = (i, s) => {
      const fill = fills[i];
      if (!fill) return;
      fill.style.transition = "none";
      const d = dim();
      if (i !== s.index) {
        fill.style[d] = i < s.index ? "100%" : "0%";
        return;
      }
      fill.style[d] = `calc(var(--_dot) + ${s.progress} * (100% - var(--_dot)))`;
      if (!s.paused && !s.done) {
        void fill.offsetHeight;
        const remaining = engine.durationFor(i) * (1 - s.progress);
        fill.style.transition = `${d} ${Math.max(0, remaining)}ms linear`;
        fill.style[d] = "100%";
      }
    };
    const visibleRange = (active) => {
      const effClip = Math.max(1, Math.min(clip ?? count, count));
      const shift = Math.max(0, Math.min(count - effClip, active - (effClip - 1) / 2));
      return [Math.floor(shift), Math.min(count - 1, Math.ceil(shift) + effClip - 1)];
    };
    const pauseIcon = (kind) => {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("aria-hidden", "true");
      if (kind === "pause") {
        svg.setAttribute("fill", "currentColor");
        svg.innerHTML = '<rect x="6.5" y="5" width="4" height="14" rx="1.4"/><rect x="13.5" y="5" width="4" height="14" rx="1.4"/>';
      } else if (kind === "play") {
        svg.setAttribute("fill", "currentColor");
        svg.innerHTML = '<path d="M8 5.5a1 1 0 0 1 1.52-.86l10 6.5a1 1 0 0 1 0 1.72l-10 6.5A1 1 0 0 1 8 18.5Z"/>';
      } else {
        svg.setAttribute("fill", "none");
        svg.setAttribute("stroke", "currentColor");
        svg.setAttribute("stroke-width", "2.4");
        svg.setAttribute("stroke-linecap", "round");
        svg.setAttribute("stroke-linejoin", "round");
        svg.innerHTML = '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v4h4"/>';
      }
      return svg;
    };
    const render = (s) => {
      if (s.count !== count) {
        count = s.count;
        applyLayout();
        buildDots();
      }
      win.style.setProperty("--_index", String(s.index));
      const [first, last] = visibleRange(s.index);
      dots.forEach((dot, i) => {
        dot.classList.toggle("is-active", i === s.index);
        dot.classList.toggle("is-done", i < s.index);
        dot.setAttribute("aria-selected", i === s.index ? "true" : "false");
        const offWindow = i < first || i > last;
        dot.tabIndex = i === s.index ? 0 : -1;
        if (offWindow) dot.setAttribute("aria-hidden", "true");
        else dot.removeAttribute("aria-hidden");
        paintFill(i, s);
      });
      const kind = s.done ? "replay" : engine.isPausedBy("user") ? "play" : "pause";
      const label = kind === "replay" ? labels?.replay ?? "Replay" : kind === "play" ? labels?.play ?? "Play" : labels?.pause ?? "Pause";
      pauseBtn.setAttribute("aria-label", label);
      pauseBtn.replaceChildren(pauseIcon(kind));
    };
    pauseBtn.addEventListener("click", () => engine.toggleUserPause());
    const onKeyDown = (e) => {
      let handled = true;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") engine.next();
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") engine.prev();
      else if (e.key === "Home") engine.goTo(0);
      else if (e.key === "End") engine.goTo(count - 1);
      else handled = false;
      if (handled) {
        e.preventDefault();
        dots[engine.getState().index]?.focus();
      }
    };
    strip.addEventListener("keydown", onKeyDown);
    const onPillClick = (e) => {
      if (e.target?.closest(".slide-stepper-dot, .slide-stepper-pause")) return;
      const horizontal = orientation === "horizontal";
      const at = horizontal ? e.clientX : e.clientY;
      let best = -1;
      let bestDist = Infinity;
      dots.forEach((dot, i) => {
        if (dot.getAttribute("aria-hidden") === "true") return;
        const r = dot.getBoundingClientRect();
        const c = horizontal ? r.left + r.width / 2 : r.top + r.height / 2;
        const d2 = Math.abs(at - c);
        if (d2 < bestDist) {
          bestDist = d2;
          best = i;
        }
      });
      if (best >= 0) engine.goTo(best);
    };
    pill.addEventListener("click", onPillClick);
    const attachSwipe = () => attachSwipeNav(pill, {
      axis: orientation === "horizontal" ? "x" : "y",
      onSwipe: (d) => d > 0 ? engine.next() : engine.prev(),
      onGestureStart: () => engine.pause("gesture"),
      onGestureEnd: () => engine.resume("gesture")
    });
    let detachSwipe = attachSwipe();
    const detachAutoPause = attachAutoPause(root, engine, {
      hover: opts.pauseOnHover,
      hidden: opts.pauseWhenHidden,
      offscreen: opts.pauseWhenOffscreen,
      offscreenThreshold: opts.offscreenThreshold
    });
    applyLayout();
    buildDots();
    render(engine.getState());
    const unsubscribe = engine.subscribe(render);
    return {
      element: root,
      engine,
      getState: () => engine.getState(),
      next: () => engine.next(),
      prev: () => engine.prev(),
      goTo: (i) => engine.goTo(i),
      pause: () => engine.pause("user"),
      resume: () => engine.resume("user"),
      toggle: () => engine.toggleUserPause(),
      setState(patch) {
        if (ownsEngine && ("count" in patch || "duration" in patch || "durations" in patch || "loop" in patch)) {
          engine.setOptions(patch);
        }
        if ("orientation" in patch) {
          const next = patch.orientation ?? "horizontal";
          if (next !== orientation) {
            orientation = next;
            fills.forEach((f) => f.removeAttribute("style"));
            detachSwipe();
            detachSwipe = attachSwipe();
          }
        }
        if ("clip" in patch) clip = patch.clip;
        if ("size" in patch) size = patch.size ?? "md";
        if ("showPause" in patch) showPause = patch.showPause !== false;
        const rebuild = "labels" in patch && patch.labels !== labels || "slideIds" in patch && patch.slideIds !== slideIds;
        if ("labels" in patch) labels = patch.labels;
        if ("slideIds" in patch) slideIds = patch.slideIds;
        if ("className" in patch) className = patch.className;
        if (rebuild) buildDots();
        applyLayout();
        render(engine.getState());
      },
      destroy() {
        unsubscribe();
        detachSwipe();
        detachAutoPause();
        pill.removeEventListener("click", onPillClick);
        strip.removeEventListener("keydown", onKeyDown);
        if (ownsEngine) engine.destroy();
      }
    };
  }
  var stylesInjected = false;
  function injectStepperStyles() {
    if (stylesInjected || typeof document === "undefined") return;
    if (document.getElementById("slide-stepper-styles")) {
      stylesInjected = true;
      return;
    }
    const style = document.createElement("style");
    style.id = "slide-stepper-styles";
    style.textContent = stepperStyles();
    document.head.appendChild(style);
    stylesInjected = true;
  }
  function stepperStyles() {
    return `
.slide-stepper {
  display: inline-flex; align-items: center;
  gap: var(--stepper-pause-gap, 8px);
  /* Size presets re-reference the same override variable with different fallbacks (never
     reassign it), so one consumer-set --stepper-* wins across every size uniformly. */
  --_dot: var(--stepper-dot-size, 6px);
  --_gap: var(--stepper-gap, 6px);
  --_bar: var(--stepper-bar-size, 28px);
  --_hit: var(--stepper-hit-size, 36px);
  --_pad: 14px;
}
.slide-stepper--sm {
  --_dot: var(--stepper-dot-size, 5px); --_gap: var(--stepper-gap, 5px);
  --_bar: var(--stepper-bar-size, 22px); --_hit: var(--stepper-hit-size, 30px); --_pad: 11px;
}
.slide-stepper--lg {
  --_dot: var(--stepper-dot-size, 8px); --_gap: var(--stepper-gap, 7px);
  --_bar: var(--stepper-bar-size, 36px); --_hit: var(--stepper-hit-size, 44px); --_pad: 17px;
}
.slide-stepper--vertical { flex-direction: column; }
.slide-stepper-pill {
  display: flex; align-items: center;
  height: var(--_hit); padding: 0 var(--_pad);
  border-radius: var(--stepper-radius, 999px);
  background: var(--stepper-pill-bg, var(--muted, light-dark(#ececee, #26262b)));
  /* The pill owns horizontal drags (swipe = prev/next); vertical stays with the page. */
  touch-action: pan-y;
}
.slide-stepper--vertical .slide-stepper-pill {
  flex-direction: column;
  height: auto; width: var(--_hit); padding: var(--_pad) 0;
  touch-action: pan-x;
}
/* \u2500\u2500 Tape-counter window \u2500\u2500
   JS feeds three integers (--_index, --_clip, --_count); everything else derives here.
   Keep in sync with visibleRange() in slide-stepper.ts. Each dot slot is dot+gap wide and
   the active slot is bar+gap, so:
     window = (clip-1) slots + active slot        strip = (count-1) slots + active slot
     ideal  = (index - (clip-1)/2) slots          (active bar dead-center)
     shift  = clamp(0, ideal, strip - window)     (pinned at the deck's ends) */
.slide-stepper-window {
  --_slot: calc(var(--_dot) + var(--_gap));
  --_win: calc((var(--_clip) - 1) * var(--_slot) + var(--_bar) + var(--_gap));
  --_ideal: calc((var(--_index) - (var(--_clip) - 1) / 2) * var(--_slot));
  --_shift: clamp(0px, var(--_ideal), calc((var(--_count) - var(--_clip)) * var(--_slot)));
  overflow: hidden;
  width: var(--_win);
}
.slide-stepper--vertical .slide-stepper-window { width: auto; height: var(--_win); }
.slide-stepper-strip {
  display: flex; width: max-content;
  transform: translateX(calc(-1 * var(--_shift)));
  transition: transform var(--stepper-strip-ms, 320ms) cubic-bezier(0.22, 1, 0.36, 1);
}
/* Deliberately physical (translateX, not logical/inline): the strip is elapsed time, not
   reading order \u2014 stories UIs don't mirror it under RTL, and neither do we. */
.slide-stepper--vertical .slide-stepper-strip {
  flex-direction: column; width: auto; height: max-content;
  transform: translateY(calc(-1 * var(--_shift)));
}
.slide-stepper-dot {
  appearance: none; -webkit-appearance: none; border: 0; margin: 0; padding: 0;
  background: transparent; cursor: pointer; color: inherit;
  display: grid; place-items: center;
  /* The slot is the tap target: full pill height, dot+gap wide. The active slot widening to
     bar+gap is what glides the neighbors apart. */
  width: calc(var(--_dot) + var(--_gap)); height: var(--_hit);
  transition: width 0.25s cubic-bezier(0.22, 1, 0.36, 1), height 0.25s cubic-bezier(0.22, 1, 0.36, 1);
}
.slide-stepper-dot.is-active { width: calc(var(--_bar) + var(--_gap)); }
.slide-stepper--vertical .slide-stepper-dot { width: var(--_hit); height: calc(var(--_dot) + var(--_gap)); }
.slide-stepper--vertical .slide-stepper-dot.is-active { height: calc(var(--_bar) + var(--_gap)); }
.slide-stepper-dot-track {
  position: relative; overflow: hidden; display: block;
  width: var(--_dot); height: var(--_dot);
  border-radius: var(--stepper-radius, 999px);
  background: var(--stepper-dot, var(--muted-foreground, light-dark(#8a8a93, #8b8b95)));
  opacity: 0.55;
  transition: width 0.25s cubic-bezier(0.22, 1, 0.36, 1), height 0.25s cubic-bezier(0.22, 1, 0.36, 1),
    background-color 0.2s ease, opacity 0.2s ease;
}
.slide-stepper-dot.is-done .slide-stepper-dot-track { opacity: 0.8; }
.slide-stepper-dot.is-active .slide-stepper-dot-track {
  width: var(--_bar); opacity: 1;
  background: var(--stepper-bar-bg, var(--border, light-dark(#dcdce1, #3a3a42)));
}
.slide-stepper--vertical .slide-stepper-dot.is-active .slide-stepper-dot-track { width: var(--_dot); height: var(--_bar); }
.slide-stepper-dot-fill {
  position: absolute; inset: 0 auto 0 0; width: 0%;
  border-radius: inherit;
  background: var(--stepper-fill, var(--primary, light-dark(#2f2f33, #e4e4e7)));
  /* The sweep is painted only while its dot is the active bar (JS remaps it to run from
     one-dot to full, so it's never smaller than an idle dot); it fades with the collapse. */
  opacity: 0;
}
.slide-stepper--vertical .slide-stepper-dot-fill { inset: 0 0 auto 0; width: 100%; height: 0%; }
.slide-stepper-dot.is-active .slide-stepper-dot-fill { opacity: 1; }
.slide-stepper-dot:focus-visible { outline: none; }
.slide-stepper-dot:focus-visible .slide-stepper-dot-track {
  outline: 2px solid var(--stepper-ring, var(--ring, light-dark(#a1a1aa, #71717a)));
  outline-offset: 2px;
}
.slide-stepper-pause {
  appearance: none; -webkit-appearance: none; border: 0; margin: 0; padding: 0;
  cursor: pointer; display: grid; place-items: center;
  width: var(--_hit); height: var(--_hit);
  border-radius: var(--stepper-radius, 999px);
  background: var(--stepper-pill-bg, var(--muted, light-dark(#ececee, #26262b)));
  color: var(--stepper-pause-fg, var(--foreground, light-dark(#3f3f46, #d4d4d8)));
  transition: filter 0.15s ease;
}
.slide-stepper-pause:hover { filter: brightness(0.96); }
.slide-stepper-pause:focus-visible {
  outline: 2px solid var(--stepper-ring, var(--ring, light-dark(#a1a1aa, #71717a)));
  outline-offset: 2px;
}
.slide-stepper-pause svg { width: 45%; height: 45%; }
@media (prefers-reduced-motion: reduce) {
  /* Decorative motion stops; the fill sweep stays (its inline transition wins) \u2014 it *is*
     the progress information, and slide timing never depends on CSS either way. */
  .slide-stepper-strip, .slide-stepper-dot, .slide-stepper-dot-track { transition: none !important; }
}
`;
  }

  // registry/slide-stepper/slide-stepper-carousel.ts
  var carouselUid = 0;
  function createSlideStepperCarousel(opts) {
    const lazy = typeof opts.slides === "function";
    const count = lazy ? Math.max(1, Math.floor(opts.count ?? 0)) : opts.slides.length;
    if (lazy && !opts.count) throw new Error("slide-stepper-carousel: `count` is required when `slides` is a function");
    if (opts.injectStyles !== false) injectCarouselStyles();
    const engine = createStepperEngine({
      count,
      duration: opts.duration,
      durations: opts.durations,
      loop: opts.loop,
      startPaused: opts.startPaused,
      index: opts.index,
      onChange: opts.onChange,
      onComplete: opts.onComplete,
      onPauseChange: opts.onPauseChange
    });
    const orientation = opts.orientation ?? "horizontal";
    const pillPosition = opts.pillPosition ?? (orientation === "vertical" ? "right" : "bottom");
    const uid = ++carouselUid;
    const root = document.createElement("div");
    root.className = `slide-stepper-carousel slide-stepper-carousel--pill-${pillPosition}${orientation === "vertical" ? " slide-stepper-carousel--swipe-y" : ""}${opts.className ? ` ${opts.className}` : ""}`;
    root.setAttribute("role", "region");
    root.setAttribute("aria-roledescription", "carousel");
    root.setAttribute("aria-label", opts.labels?.root ?? "Slides");
    if (opts.transitionMs !== void 0) root.style.setProperty("--stepper-crossfade-ms", `${opts.transitionMs}ms`);
    const viewport = document.createElement("div");
    viewport.className = "slide-stepper-carousel-viewport";
    const wrappers = [];
    const materialized = /* @__PURE__ */ new Set();
    const slideIds = [];
    for (let i = 0; i < count; i++) {
      const wrap = document.createElement("div");
      wrap.className = "slide-stepper-carousel-slide";
      wrap.id = `slide-stepper-${uid}-slide-${i + 1}`;
      wrap.setAttribute("role", "group");
      wrap.setAttribute("aria-roledescription", "slide");
      wrap.setAttribute("aria-label", opts.labels?.slide?.(i, count) ?? `Slide ${i + 1} of ${count}`);
      slideIds.push(wrap.id);
      if (!lazy) {
        wrap.appendChild(opts.slides[i]);
        materialized.add(i);
      }
      viewport.appendChild(wrap);
      wrappers.push(wrap);
    }
    const materialize = (i) => {
      if (i < 0 || i >= count || materialized.has(i)) return;
      materialized.add(i);
      wrappers[i].appendChild(opts.slides(i));
    };
    const loop = opts.loop ?? true;
    const render = (s) => {
      if (lazy) {
        materialize(s.index);
        materialize(s.index + 1 < count ? s.index + 1 : loop ? 0 : -1);
        materialize(s.index - 1 >= 0 ? s.index - 1 : loop ? count - 1 : -1);
      }
      wrappers.forEach((wrap, i) => {
        const active = i === s.index;
        wrap.classList.toggle("is-active", active);
        if (active) {
          wrap.removeAttribute("inert");
          wrap.removeAttribute("aria-hidden");
        } else {
          wrap.setAttribute("inert", "");
          wrap.setAttribute("aria-hidden", "true");
        }
      });
    };
    const stepper = createSlideStepper({
      engine,
      count,
      orientation,
      clip: opts.clip,
      showPause: opts.showPause,
      size: opts.size,
      labels: opts.labels,
      slideIds,
      pauseOnHover: false,
      pauseWhenHidden: false,
      pauseWhenOffscreen: false,
      injectStyles: opts.injectStyles
    });
    root.appendChild(viewport);
    root.appendChild(stepper.element);
    const detachAutoPause = attachAutoPause(root, engine, {
      hover: opts.pauseOnHover,
      hidden: opts.pauseWhenHidden,
      offscreen: opts.pauseWhenOffscreen,
      offscreenThreshold: opts.offscreenThreshold
    });
    const detachSwipe = opts.swipe !== false ? attachSwipeNav(viewport, {
      axis: orientation === "vertical" ? "y" : "x",
      onSwipe: (d) => d > 0 ? engine.next() : engine.prev(),
      onGestureStart: () => engine.pause("gesture"),
      onGestureEnd: () => engine.resume("gesture")
    }) : null;
    const onFocusIn = () => engine.pause("focus");
    const onFocusOut = (e) => {
      if (!root.contains(e.relatedTarget)) engine.resume("focus");
    };
    if (opts.pauseOnFocusWithin !== false) {
      root.addEventListener("focusin", onFocusIn);
      root.addEventListener("focusout", onFocusOut);
    }
    render(engine.getState());
    const unsubscribe = engine.subscribe(render);
    return {
      element: root,
      stepper,
      engine,
      destroy() {
        unsubscribe();
        detachSwipe?.();
        detachAutoPause();
        root.removeEventListener("focusin", onFocusIn);
        root.removeEventListener("focusout", onFocusOut);
        stepper.destroy();
        engine.destroy();
      }
    };
  }
  var carouselStylesInjected = false;
  function injectCarouselStyles() {
    if (carouselStylesInjected || typeof document === "undefined") return;
    if (document.getElementById("slide-stepper-carousel-styles")) {
      carouselStylesInjected = true;
      return;
    }
    const style = document.createElement("style");
    style.id = "slide-stepper-carousel-styles";
    style.textContent = carouselStyles();
    document.head.appendChild(style);
    carouselStylesInjected = true;
  }
  function carouselStyles() {
    return `
.slide-stepper-carousel { display: flex; flex-direction: column; align-items: center; gap: 16px; }
.slide-stepper-carousel--pill-top { flex-direction: column-reverse; }
.slide-stepper-carousel--pill-right { flex-direction: row; }
.slide-stepper-carousel--pill-left { flex-direction: row-reverse; }
.slide-stepper-carousel-viewport {
  display: grid;
  /* Horizontal drags are the swipe; vertical scrolling stays with the page (flipped for a
     vertical deck). */
  touch-action: pan-y;
}
.slide-stepper-carousel--swipe-y .slide-stepper-carousel-viewport { touch-action: pan-x; }
.slide-stepper-carousel-slide {
  /* Every slide occupies the same grid cell: the viewport sizes to the largest slide and a
     crossfade needs no positioning at all. */
  grid-area: 1 / 1;
  opacity: 0;
  transform: scale(var(--stepper-crossfade-scale, 0.98));
  pointer-events: none;
  transition: opacity var(--stepper-crossfade-ms, 300ms) ease, transform var(--stepper-crossfade-ms, 300ms) ease;
}
.slide-stepper-carousel-slide.is-active { opacity: 1; transform: none; pointer-events: auto; }
@media (prefers-reduced-motion: reduce) {
  .slide-stepper-carousel-slide { transition: none !important; }
}
`;
  }
  return __toCommonJS(slide_stepper_carousel_exports);
})();
