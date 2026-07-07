var ScrollRail = (() => {
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

  // registry/scroll-rail/scroll-rail.ts
  var scroll_rail_exports = {};
  __export(scroll_rail_exports, {
    createScrollRail: () => createScrollRail,
    headingItems: () => headingItems,
    injectRailStyles: () => injectRailStyles,
    itemsFromHeadings: () => itemsFromHeadings,
    observeActive: () => observeActive,
    railStyles: () => railStyles
  });
  function observeActive(opts) {
    const activationOffset = opts.activationOffset ?? 96;
    let items = opts.items;
    let activeId = null;
    const compute = () => {
      if (!items.length) return null;
      const top = opts.scrollContainer.getBoundingClientRect().top;
      let idx = 0;
      items.forEach((it, i) => {
        if (it.target.getBoundingClientRect().top - top <= activationOffset) idx = i;
      });
      return items[idx]?.id ?? null;
    };
    const refresh = () => {
      const next = compute();
      if (next !== activeId) {
        activeId = next;
        opts.onActiveChange(activeId);
      }
    };
    const onScroll = () => refresh();
    opts.scrollContainer.addEventListener("scroll", onScroll, { passive: true });
    refresh();
    const raf = typeof requestAnimationFrame !== "undefined" ? requestAnimationFrame(refresh) : 0;
    return {
      refresh,
      setItems(next) {
        items = next;
        refresh();
      },
      getActiveId: () => activeId,
      destroy() {
        opts.scrollContainer.removeEventListener("scroll", onScroll);
        if (raf && typeof cancelAnimationFrame !== "undefined") cancelAnimationFrame(raf);
      }
    };
  }
  function createScrollRail(opts) {
    const position = opts.position ?? "right";
    if (opts.injectStyles !== false) injectRailStyles();
    const nav = document.createElement("nav");
    nav.className = `scroll-rail scroll-rail--${position}${opts.className ? ` ${opts.className}` : ""}`;
    nav.setAttribute("aria-label", "Scroll navigation");
    const track = document.createElement("div");
    track.className = "scroll-rail-track";
    const card = document.createElement("div");
    card.className = "scroll-rail-card";
    const cardTitle = document.createElement("div");
    cardTitle.className = "scroll-rail-card-title";
    const cardBody = document.createElement("div");
    cardBody.className = "scroll-rail-card-preview";
    card.appendChild(cardTitle);
    card.appendChild(cardBody);
    nav.appendChild(track);
    nav.appendChild(card);
    let items = [];
    let ticks = [];
    const showCard = (i) => {
      const it = items[i];
      if (!it) return;
      cardTitle.textContent = it.label;
      cardBody.replaceChildren();
      if (it.preview instanceof Node) {
        cardBody.appendChild(it.preview.cloneNode(true));
        cardBody.style.display = "";
      } else if (it.preview) {
        cardBody.textContent = it.preview;
        cardBody.style.display = "";
      } else {
        cardBody.style.display = "none";
      }
      const navTop = nav.getBoundingClientRect().top;
      const r = ticks[i].getBoundingClientRect();
      const top = `${r.top + r.height / 2 - navTop}px`;
      if (card.classList.contains("is-visible")) {
        card.style.top = top;
      } else {
        card.style.transition = "none";
        card.style.top = top;
        void card.offsetHeight;
        card.style.transition = "";
        card.classList.add("is-visible");
      }
    };
    const hideCard = () => card.classList.remove("is-visible");
    let hoveredIndex = -1;
    let lastPointer = null;
    const setHovered = (i) => {
      if (i === hoveredIndex) return;
      if (hoveredIndex >= 0) ticks[hoveredIndex]?.classList.remove("is-hovered");
      hoveredIndex = i;
      nav.classList.toggle("is-hover", i >= 0);
      if (i >= 0) {
        ticks[i]?.classList.add("is-hovered");
        showCard(i);
      } else {
        hideCard();
      }
    };
    const nearestTick = (clientY) => {
      let best = -1;
      let bestDist = Infinity;
      for (let i = 0; i < ticks.length; i++) {
        const r = ticks[i].getBoundingClientRect();
        const d = Math.abs(clientY - (r.top + r.height / 2));
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      }
      return best;
    };
    const onPointerMove = (e) => {
      lastPointer = { x: e.clientX, y: e.clientY };
      if (ticks.length) setHovered(nearestTick(e.clientY));
    };
    const onPointerLeave = () => {
      lastPointer = null;
      setHovered(-1);
    };
    const revalidateHover = () => {
      if (!lastPointer) return;
      const r = nav.getBoundingClientRect();
      const inside = lastPointer.x >= r.left && lastPointer.x <= r.right && lastPointer.y >= r.top && lastPointer.y <= r.bottom;
      if (!inside) {
        lastPointer = null;
        setHovered(-1);
      } else if (ticks.length) setHovered(nearestTick(lastPointer.y));
    };
    const onFocusOut = (e) => {
      if (!nav.contains(e.relatedTarget)) setHovered(-1);
    };
    const go = (i) => {
      const it = items[i];
      if (!it) return;
      const c = opts.scrollContainer;
      const margin = parseFloat(getComputedStyle(it.target).scrollMarginTop) || 0;
      const top = it.target.getBoundingClientRect().top - c.getBoundingClientRect().top + c.scrollTop - margin;
      c.scrollTo({ top, behavior: "smooth" });
    };
    const onClick = (e) => {
      if (e.target?.closest(".scroll-rail-tick")) return;
      const i = nearestTick(e.clientY);
      if (i >= 0) go(i);
    };
    nav.addEventListener("pointermove", onPointerMove);
    nav.addEventListener("pointerleave", onPointerLeave);
    nav.addEventListener("focusout", onFocusOut);
    nav.addEventListener("click", onClick);
    const paintActive = (id) => {
      ticks.forEach((t, i) => t.classList.toggle("is-active", items[i]?.id === id));
    };
    const observer = observeActive({
      scrollContainer: opts.scrollContainer,
      items: opts.items,
      activationOffset: opts.activationOffset,
      onActiveChange: (id) => {
        paintActive(id);
        opts.onActiveChange?.(id);
      }
    });
    document.addEventListener("scroll", revalidateHover, { capture: true, passive: true });
    const buildTicks = () => {
      track.replaceChildren();
      ticks = items.map((it, i) => {
        const tick = document.createElement("button");
        tick.type = "button";
        tick.className = "scroll-rail-tick";
        tick.dataset.level = String(Math.min(Math.max(it.level ?? 1, 1), 4));
        tick.setAttribute("aria-label", it.label);
        if (it.color) tick.style.setProperty("--tick", it.color);
        tick.addEventListener("click", () => go(i));
        tick.addEventListener("focus", () => setHovered(i));
        track.appendChild(tick);
        return tick;
      });
    };
    const setItems = (next) => {
      items = next;
      hoveredIndex = -1;
      hideCard();
      buildTicks();
      observer.setItems(next);
      paintActive(observer.getActiveId());
    };
    setItems(opts.items);
    return {
      element: nav,
      getActiveId: () => observer.getActiveId(),
      setItems,
      refresh: () => {
        observer.refresh();
        paintActive(observer.getActiveId());
      },
      destroy() {
        observer.destroy();
        document.removeEventListener("scroll", revalidateHover, { capture: true });
        nav.removeEventListener("pointermove", onPointerMove);
        nav.removeEventListener("pointerleave", onPointerLeave);
        nav.removeEventListener("focusout", onFocusOut);
        nav.removeEventListener("click", onClick);
      }
    };
  }
  function headingItems(container, opts = {}) {
    const selector = opts.selector ?? "h1, h2, h3";
    const all = [...container.querySelectorAll(selector)];
    const heads = opts.exclude ? all.filter((h) => !h.matches(opts.exclude)) : all;
    return itemsFromHeadings(heads, opts);
  }
  function itemsFromHeadings(headings, opts = {}) {
    const previewChars = opts.previewChars ?? 150;
    const assignIds = opts.assignIds ?? true;
    const used = /* @__PURE__ */ new Set();
    headings.forEach((h) => {
      if (h.id) used.add(h.id);
    });
    return headings.map((h) => {
      if (assignIds && !h.id) {
        const base = slugify(h.textContent ?? "");
        let id = base;
        let n = 2;
        while (used.has(id)) {
          id = `${base}-${n}`;
          n += 1;
        }
        used.add(id);
        h.id = id;
      }
      const level = Number(h.tagName.slice(1)) || 1;
      return { id: h.id, target: h, label: h.textContent ?? "", level, preview: sectionPreview(h, previewChars) };
    });
  }
  function slugify(text) {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "section";
  }
  function sectionPreview(heading, max) {
    const parts = [];
    let node = heading.nextElementSibling;
    while (node && !/^H[1-6]$/.test(node.tagName)) {
      const t = node.textContent?.trim();
      if (t) parts.push(t);
      if (parts.join(" ").length >= max + 10) break;
      node = node.nextElementSibling;
    }
    const text = parts.join(" ").replace(/\s+/g, " ").trim();
    return text.length > max ? `${text.slice(0, max).trimEnd()}\u2026` : text;
  }
  var stylesInjected = false;
  function injectRailStyles() {
    if (stylesInjected || typeof document === "undefined") return;
    if (document.getElementById("scroll-rail-styles")) {
      stylesInjected = true;
      return;
    }
    const style = document.createElement("style");
    style.id = "scroll-rail-styles";
    style.textContent = railStyles();
    document.head.appendChild(style);
    stylesInjected = true;
  }
  function railStyles() {
    return `
.scroll-rail {
  position: absolute; top: 0; bottom: 0; z-index: 5;
  display: flex; align-items: center;
  color: var(--rail-tick, currentColor);
  opacity: 0.5; transition: opacity 0.25s ease;
  /* The whole strip is interactive (pointer picks the nearest tick), so the hand cursor
     and navigation apply across it \u2014 not just on the 2px ticks. */
  cursor: pointer;
}
/* Brightening is driven by the .is-hover class (set from pointer events + revalidated on
   scroll) rather than :hover \u2014 Safari leaves :hover stuck when the page scrolls the rail
   out from under a stationary cursor. */
.scroll-rail.is-hover { opacity: 1; }
.scroll-rail--right { right: 0; }
.scroll-rail--left { left: 0; }
.scroll-rail-track {
  display: flex; flex-direction: column; justify-content: center;
  gap: 4px; max-height: 100%; padding: 12px 10px;
}
.scroll-rail--right .scroll-rail-track { align-items: flex-end; }
.scroll-rail--left .scroll-rail-track { align-items: flex-start; }
.scroll-rail-tick {
  appearance: none; -webkit-appearance: none; border: 0; margin: 0; padding: 0;
  cursor: pointer; height: 2px; width: 12px;
  /* Buttons don't inherit color by default, so inherit it explicitly \u2014 that's what makes
     currentColor (and thus --rail-tick) actually reach the ticks. */
  color: inherit;
  /* --tick is an optional per-node color (set inline); falls back to the shared tick color. */
  background: var(--tick, currentColor); opacity: 0.55;
  transition: width 0.22s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.22s ease, background-color 0.22s ease;
}
.scroll-rail-tick[data-level="2"] { width: 9px; }
.scroll-rail-tick[data-level="3"] { width: 6px; }
.scroll-rail-tick[data-level="4"] { width: 4px; }
/* .is-hovered is set (via pointermove) on the tick nearest the cursor anywhere in the rail,
   so hover doesn't drop out in the gaps between ticks. Tick :hover is deliberately unused \u2014
   .is-hovered covers it and, unlike :hover, can't strand on scroll-under-cursor. */
.scroll-rail-tick:focus-visible, .scroll-rail-tick.is-hovered {
  width: 16px; opacity: 1; outline: none;
}
/* A colored node keeps its own color when active; uncolored ones use the accent. */
.scroll-rail-tick.is-active { width: 16px; opacity: 1; background: var(--tick, var(--rail-accent, #3b82f6)); }
.scroll-rail-card {
  position: absolute; z-index: 10; box-sizing: border-box;
  width: var(--rail-card-width, 234px); max-width: var(--rail-card-width, 234px);
  background: var(--rail-card-bg, Canvas); color: var(--rail-card-fg, CanvasText);
  border: 1px solid var(--rail-card-border, color-mix(in srgb, currentColor 20%, transparent));
  border-radius: 10px; padding: 9px 12px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.22);
  opacity: 0; pointer-events: none;
  /* top transitions so the card glides between ticks as the nearest one changes. */
  transition: opacity 0.16s ease, transform 0.16s ease, top 0.22s cubic-bezier(0.22, 1, 0.36, 1);
}
.scroll-rail--right .scroll-rail-card { right: calc(100% + 8px); transform: translateY(-50%) translateX(4px); }
.scroll-rail--left .scroll-rail-card { left: calc(100% + 8px); transform: translateY(-50%) translateX(-4px); }
.scroll-rail-card.is-visible { opacity: 1; transform: translateY(-50%) translateX(0); }
.scroll-rail-card-title { font-weight: 600; font-size: 13px; line-height: 1.4; }
.scroll-rail-card-preview {
  margin-top: 3px; font-size: 12px; line-height: 1.5; opacity: 0.7;
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
}
`;
  }
  return __toCommonJS(scroll_rail_exports);
})();
