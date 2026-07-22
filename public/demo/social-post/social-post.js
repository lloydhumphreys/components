var SocialPost = (() => {
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

  // registry/social-post/social-post.ts
  var social_post_exports = {};
  __export(social_post_exports, {
    createSocialPost: () => createSocialPost,
    injectSocialPostStyles: () => injectSocialPostStyles,
    socialPostStyles: () => socialPostStyles,
    splitContentEntities: () => splitContentEntities
  });
  var ENTITY_RE = /(https?:\/\/[^\s<>"']+)|(?<![\w@])(@[A-Za-z0-9_]{1,30}(?:@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*)?)|(?<![\w#])(#[\p{L}\p{N}_]+)/gu;
  function trimTrailingPunctuation(url) {
    for (; ; ) {
      if (/[.,!?;:'"…]$/.test(url)) {
        url = url.slice(0, -1);
        continue;
      }
      if (url.endsWith(")")) {
        const opens = (url.match(/\(/g) ?? []).length;
        const closes = (url.match(/\)/g) ?? []).length;
        if (closes > opens) {
          url = url.slice(0, -1);
          continue;
        }
      }
      return url;
    }
  }
  function splitContentEntities(content) {
    const segments = [];
    let last = 0;
    for (const m of content.matchAll(ENTITY_RE)) {
      const start = m.index;
      let text = m[0];
      const kind = m[1] ? "url" : m[2] ? "mention" : "hashtag";
      if (kind === "url") text = trimTrailingPunctuation(text);
      if (start > last) segments.push({ kind: null, text: content.slice(last, start) });
      segments.push({ kind, text });
      last = start + text.length;
    }
    if (last < content.length) segments.push({ kind: null, text: content.slice(last) });
    return segments;
  }
  var SVG_NS = "http://www.w3.org/2000/svg";
  function svgIcon(viewBox, strokeWidth, inner) {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", viewBox);
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", strokeWidth);
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.innerHTML = inner;
    return svg;
  }
  function silhouetteSvg() {
    const svg = svgIcon("0 0 40 40", "2.4", '<circle cx="20" cy="16" r="6.5"/><path d="M7.5 36.5a12.5 12.5 0 0 1 25 0"/>');
    svg.setAttribute("aria-hidden", "true");
    return svg;
  }
  function verifiedSvg(label) {
    const svg = svgIcon(
      "0 0 24 24",
      "2",
      '<path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"/><path d="m9 12 2 2 4-4"/>'
    );
    svg.setAttribute("class", "social-post-verified");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", label);
    return svg;
  }
  function normalizeImages(images) {
    if (!images) return [];
    if (images.length <= 4) return [...images];
    console.warn("social-post: more than 4 images \u2014 rendering the first 4.");
    return images.slice(0, 4);
  }
  var stripAt = (handle) => handle.replace(/^@/, "");
  function createSocialPost(opts) {
    if (opts.injectStyles !== false) injectSocialPostStyles();
    let name = opts.name;
    let handle = opts.handle;
    let content = opts.content;
    let avatarUrl = opts.avatarUrl;
    let images = normalizeImages(opts.images);
    let link = opts.link;
    let date = opts.date;
    let verified = opts.verified ?? false;
    let variant = opts.variant ?? "outline";
    let labels = opts.labels;
    let className = opts.className;
    const root = document.createElement("article");
    const header = document.createElement("header");
    header.className = "social-post-header";
    const avatar = document.createElement("span");
    avatar.className = "social-post-avatar";
    avatar.setAttribute("aria-hidden", "true");
    avatar.appendChild(silhouetteSvg());
    let avatarImg = null;
    const identity = document.createElement("span");
    identity.className = "social-post-identity";
    const nameRow = document.createElement("span");
    nameRow.className = "social-post-name-row";
    const nameEl = document.createElement("span");
    nameEl.className = "social-post-name";
    let verifiedEl = null;
    const handleEl = document.createElement("span");
    handleEl.className = "social-post-handle";
    nameRow.appendChild(nameEl);
    identity.append(nameRow, handleEl);
    header.append(avatar, identity);
    const contentEl = document.createElement("p");
    contentEl.className = "social-post-content";
    let mediaEl = null;
    let mediaKey = null;
    const footer = document.createElement("footer");
    footer.className = "social-post-footer";
    const dateEl = document.createElement("span");
    dateEl.className = "social-post-date";
    const linkEl = document.createElement("a");
    linkEl.className = "social-post-link";
    linkEl.target = "_blank";
    linkEl.rel = "noopener noreferrer";
    const linkText = document.createElement("span");
    const linkArrow = document.createElement("span");
    linkArrow.className = "social-post-link-arrow";
    linkArrow.setAttribute("aria-hidden", "true");
    linkArrow.textContent = "\u2197";
    linkEl.append(linkText, linkArrow);
    footer.append(dateEl, linkEl);
    root.append(header, contentEl, footer);
    const setAvatar = (url) => {
      avatarImg?.remove();
      avatarImg = null;
      avatar.classList.remove("has-image");
      if (!url) return;
      const img = document.createElement("img");
      img.className = "social-post-avatar-img";
      img.alt = "";
      img.referrerPolicy = "no-referrer";
      img.addEventListener("load", () => {
        if (img === avatarImg) avatar.classList.add("has-image");
      }, { once: true });
      img.addEventListener("error", () => {
        if (img === avatarImg) {
          img.remove();
          avatarImg = null;
        }
      }, { once: true });
      img.src = url;
      avatar.appendChild(img);
      avatarImg = img;
    };
    const buildMedia = () => {
      mediaEl?.remove();
      mediaEl = null;
      if (images.length === 0) return;
      const grid = document.createElement("div");
      grid.className = "social-post-media";
      grid.dataset.count = String(images.length);
      for (const src of images) {
        const cell = document.createElement("img");
        cell.className = "social-post-media-item";
        cell.alt = "";
        cell.loading = "lazy";
        cell.referrerPolicy = "no-referrer";
        cell.src = src;
        grid.appendChild(cell);
      }
      root.insertBefore(grid, footer);
      mediaEl = grid;
    };
    const render = () => {
      root.className = `social-post social-post--${variant}${className ? ` ${className}` : ""}`;
      root.setAttribute("aria-label", labels?.root ?? `Post by ${name} (@${stripAt(handle)})`);
      nameEl.textContent = name;
      nameEl.title = name;
      verifiedEl?.remove();
      verifiedEl = null;
      if (verified) {
        verifiedEl = verifiedSvg(labels?.verified ?? "Verified");
        nameRow.appendChild(verifiedEl);
      }
      handleEl.textContent = `@${stripAt(handle)}`;
      contentEl.replaceChildren(
        ...splitContentEntities(content).map((seg) => {
          if (!seg.kind) return document.createTextNode(seg.text);
          const span = document.createElement("span");
          span.className = "social-post-entity";
          span.dataset.entity = seg.kind;
          span.textContent = seg.text;
          return span;
        })
      );
      dateEl.textContent = date ?? "";
      dateEl.style.display = date ? "" : "none";
      linkText.textContent = labels?.source ?? "Source";
      linkEl.href = link;
    };
    setAvatar(avatarUrl);
    mediaKey = images.join("\n");
    buildMedia();
    render();
    return {
      element: root,
      getState: () => ({ name, handle, content, avatarUrl, images: [...images], link, date, verified }),
      setState(patch) {
        if (patch.name != null) name = patch.name;
        if (patch.handle != null) handle = patch.handle;
        if (patch.content != null) content = patch.content;
        if (patch.link != null) link = patch.link;
        if ("date" in patch) date = patch.date;
        if ("verified" in patch) verified = patch.verified ?? false;
        if ("variant" in patch) variant = patch.variant ?? "outline";
        if ("labels" in patch) labels = patch.labels;
        if ("className" in patch) className = patch.className;
        if ("avatarUrl" in patch && patch.avatarUrl !== avatarUrl) {
          avatarUrl = patch.avatarUrl;
          setAvatar(avatarUrl);
        }
        if ("images" in patch) {
          const next = normalizeImages(patch.images);
          const key = next.join("\n");
          if (key !== mediaKey) {
            images = next;
            mediaKey = key;
            buildMedia();
          }
        }
        render();
      },
      destroy() {
      }
    };
  }
  var stylesInjected = false;
  function injectSocialPostStyles() {
    if (stylesInjected || typeof document === "undefined") return;
    if (document.getElementById("social-post-styles")) {
      stylesInjected = true;
      return;
    }
    const style = document.createElement("style");
    style.id = "social-post-styles";
    style.textContent = socialPostStyles();
    document.head.appendChild(style);
    stylesInjected = true;
  }
  function socialPostStyles() {
    return `
.social-post {
  /* The footer pulls itself back out past this padding for its full-bleed rule. */
  --_pad: 16px;
  display: flex; flex-direction: column; gap: 12px;
  padding: var(--_pad);
  border: 1px solid var(--social-post-border, var(--border, light-dark(#e4e4e7, #303036)));
  border-radius: var(--social-post-radius, var(--radius, 0.75rem));
  background: var(--social-post-bg, var(--card, light-dark(#ffffff, #18181b)));
  color: var(--social-post-fg, var(--card-foreground, light-dark(#09090b, #fafafa)));
  font-size: 15px; line-height: 1.5;
  text-align: start;
}
/* Filled: same geometry on a muted fill; the border goes transparent, not away, so
   nothing shifts by a pixel when variants mix. */
.social-post--filled {
  border-color: transparent;
  background: var(--social-post-bg, var(--muted, light-dark(#f4f4f5, #26262b)));
}
.social-post-header { display: flex; align-items: center; gap: 10px; min-width: 0; }
.social-post-avatar {
  position: relative; flex: none;
  width: 40px; height: 40px;
  border-radius: 999px; overflow: hidden;
  background: var(--social-post-avatar-bg, var(--muted, light-dark(#ececee, #26262b)));
  color: var(--social-post-avatar-fg, var(--muted-foreground, light-dark(#8a8a93, #8b8b95)));
}
.social-post-avatar svg { position: absolute; inset: 0; width: 100%; height: 100%; }
.social-post-avatar-img {
  position: absolute; inset: 0; width: 100%; height: 100%;
  object-fit: cover; display: none;
}
.social-post-avatar.has-image .social-post-avatar-img { display: block; }
.social-post-identity { display: flex; flex-direction: column; min-width: 0; }
.social-post-name-row { display: flex; align-items: center; gap: 4px; min-width: 0; }
.social-post-name {
  font-size: 14.5px; font-weight: 600; line-height: 1.35;
  color: var(--social-post-name, var(--foreground, light-dark(#18181b, #fafafa)));
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.social-post-verified {
  flex: none; width: 15px; height: 15px;
  color: var(--social-post-verified, var(--foreground, light-dark(#3f3f46, #d4d4d8)));
}
.social-post-handle {
  font-size: 13px; line-height: 1.35;
  color: var(--social-post-handle, var(--muted-foreground, light-dark(#71717a, #a1a1aa)));
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.social-post-content { margin: 0; white-space: pre-wrap; overflow-wrap: break-word; }
/* Tint plus a slight weight bump: in themes where --primary sits near --foreground (the
   default zinc theme), color alone wouldn't read. No underline, no cursor \u2014 these spans
   are inert on purpose and must not pose as links. */
.social-post-entity {
  color: var(--social-post-accent, var(--primary, light-dark(#2563eb, #60a5fa)));
  font-weight: 500;
}
/* One fixed 16:9 frame regardless of image count \u2014 only the internal grid template
   varies, so every card with media keeps identical proportions. The container's own
   background paints through the gaps as thin seams. */
.social-post-media {
  display: grid; gap: var(--social-post-media-gap, 2px);
  aspect-ratio: 16 / 9;
  border-radius: var(--social-post-media-radius, calc(var(--social-post-radius, var(--radius, 0.75rem)) - 2px));
  overflow: hidden;
  background: var(--social-post-border, var(--border, light-dark(#e4e4e7, #303036)));
}
.social-post-media[data-count="2"] { grid-template-columns: 1fr 1fr; }
.social-post-media[data-count="3"] {
  grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr;
  grid-template-areas: 'a b' 'a c';
}
.social-post-media[data-count="3"] .social-post-media-item:nth-child(1) { grid-area: a; }
.social-post-media[data-count="3"] .social-post-media-item:nth-child(2) { grid-area: b; }
.social-post-media[data-count="3"] .social-post-media-item:nth-child(3) { grid-area: c; }
.social-post-media[data-count="4"] { grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; }
.social-post-media-item { width: 100%; height: 100%; object-fit: cover; display: block; min-height: 0; }
.social-post-footer {
  display: flex; align-items: center; gap: 10px;
  /* Full-bleed hairline: pull past the card padding so the rule runs edge to edge. The
     footer also swallows the card's bottom padding and caps the card itself, so its text
     sits vertically centered \u2014 10px off the hairline, 10px off the bottom edge. */
  margin: 0 calc(-1 * var(--_pad)) calc(-1 * var(--_pad));
  padding: 10px var(--_pad);
  border-top: 1px solid color-mix(in srgb, var(--social-post-border, var(--border, light-dark(#e4e4e7, #303036))) 60%, transparent);
  font-size: 13px;
}
/* The filled card has no visible border to echo \u2014 use the token at full strength so the
   hairline still reads against the muted fill. */
.social-post--filled .social-post-footer {
  border-top-color: var(--social-post-border, var(--border, light-dark(#e4e4e7, #303036)));
}
.social-post-date {
  color: var(--social-post-date, var(--muted-foreground, light-dark(#71717a, #a1a1aa)));
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.social-post-link {
  margin-inline-start: auto; flex: none;
  display: inline-flex; align-items: center; gap: 3px;
  color: var(--social-post-link, var(--muted-foreground, light-dark(#71717a, #a1a1aa)));
  font-weight: 500; text-decoration: none;
  border-radius: 6px;
  transition: color 0.15s ease;
}
.social-post-link:hover {
  color: var(--social-post-link-hover, var(--foreground, light-dark(#18181b, #fafafa)));
}
.social-post-link:focus-visible {
  outline: 2px solid var(--social-post-ring, var(--ring, light-dark(#a1a1aa, #71717a)));
  outline-offset: 3px;
}
.social-post-link-arrow { font-size: 12px; line-height: 1; }
@media (prefers-reduced-motion: reduce) {
  .social-post-link { transition: none !important; }
}
`;
  }
  return __toCommonJS(social_post_exports);
})();
