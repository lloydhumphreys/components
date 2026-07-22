// social-post — a zero-dependency, platform-neutral social post embed card.
//
// EXPERIMENTAL — the API is still settling and will change in breaking ways; pin what you
// install.
//
// An embedded-tweet-shaped quotation card with no platform branding: avatar (with a
// silhouette fallback), name, handle, an optional neutral verified badge, the post text,
// an optional 1–4 image grid, and a "Source ↗" link in the footer, sitting under a
// full-bleed hairline. Because every field is passed in as data — nothing is fetched, no
// oEmbed, no brand chrome — quotes grabbed from X, Bluesky, Mastodon, LinkedIn, or a blog
// all render uniformly and pick up the host theme.
//
// Two variants: 'outline' (default — a bordered card on the card surface) and 'filled'
// (the same geometry on a borderless muted-gray fill, for quote-walls and dense lists
// where borders get noisy). Either way --social-post-bg overrides the fill directly.
//
// The footer link is deliberately the only interactive element. The card is not a
// stretched link: it's a quotation, so its text stays selectable and nothing intercepts
// clicks. @mentions, #hashtags, and URLs inside the content are detected and tinted, but
// rendered as inert spans — never anchors — so the card holds exactly one real link.
//
// Media: 1 image fills the frame, 2 sit side by side, 3 render one tall + two stacked,
// 4 make a 2×2 grid. The grid's overall frame is always 16:9 regardless of count
// (cover-cropped cells), so cards with media keep identical proportions.
//
// Framework-agnostic vanilla DOM — no dependencies, no build step. A React wrapper lives
// in social-post-react.tsx; a shadcn-native rebuild lives in social-post-shadcn.tsx.
//
// ── State ownership ────────────────────────────────────────────────────────────────────
// Unlike steps/workflow-button there is no engine layer here: the card has no navigation
// or timing state to be a source of truth for, only display data. getState()/setState()
// keep the house control surface without inventing subscribe() machinery nothing would
// listen to.
//
// ── Entity detection limits ────────────────────────────────────────────────────────────
// Only explicit http(s):// URLs are detected (no bare domains / www.). Mentions accept
// fediverse form (@user@instance.tld). Unicode hashtags work (#café, #日本語). Sentence
// punctuation trailing a URL is trimmed, including an unbalanced closing paren — but
// entities glued to a previous entity without whitespace (e.g. `@jane#tag`) stay merged.
// The regex is a single bounded scan per alternative — no nested quantifiers, no
// backtracking blow-up.
//
// ── Theming ────────────────────────────────────────────────────────────────────────────
// Styles consume shadcn theme tokens when present, with light-dark() fallbacks so the
// card reads correctly standalone in both themes. Override independently of the app theme
// via the --social-post-* escape hatches (set on the root or any ancestor):
//   --social-post-bg / --social-post-fg          card surface + body text (default: --card / --card-foreground;
//                                                the filled variant's bg defaults to --muted instead)
//   --social-post-border                         card border + media seams (default: --border)
//   --social-post-radius                         card corners             (default: --radius, 0.75rem)
//   --social-post-name                           display name             (default: --foreground)
//   --social-post-handle                         @handle                  (default: --muted-foreground)
//   --social-post-verified                       verified badge — neutral on purpose
//                                                                         (default: --foreground)
//   --social-post-avatar-bg / --social-post-avatar-fg
//                                                silhouette fallback      (default: --muted / --muted-foreground)
//   --social-post-accent                         mention/hashtag/URL tint (default: --primary)
//   --social-post-media-radius                   media frame corners      (default: radius − 2px)
//   --social-post-media-gap                      seam width               (default: 2px)
//   --social-post-date                           date text                (default: --muted-foreground)
//   --social-post-link / --social-post-link-hover
//                                                footer link              (default: --muted-foreground / --foreground)
//   --social-post-ring                           footer link focus ring   (default: --ring)

// ── Entities ───────────────────────────────────────────────────────────────────────────

export type SocialPostEntityKind = 'mention' | 'hashtag' | 'url'

export interface SocialPostSegment {
  /** null for plain text between entities. */
  kind: SocialPostEntityKind | null
  text: string
}

// Alternation order matters: at any position the URL branch wins, so a URL's own
// #fragment or ?q=@x is consumed whole and never re-matched as a hashtag/mention. The
// lookbehinds require a non-word boundary, which is what keeps bob@x.com from tagging @x
// and ##x from double-matching.
const ENTITY_RE =
  /(https?:\/\/[^\s<>"']+)|(?<![\w@])(@[A-Za-z0-9_]{1,30}(?:@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*)?)|(?<![\w#])(#[\p{L}\p{N}_]+)/gu

/** Strip sentence punctuation a URL match swept in, plus a closing paren with no opening
 *  partner inside the match (so wiki_(disambiguation) keeps its paren while a prose
 *  `(see https://x.com)` drops it). */
function trimTrailingPunctuation(url: string): string {
  for (;;) {
    if (/[.,!?;:'"…]$/.test(url)) {
      url = url.slice(0, -1)
      continue
    }
    if (url.endsWith(')')) {
      const opens = (url.match(/\(/g) ?? []).length
      const closes = (url.match(/\)/g) ?? []).length
      if (closes > opens) {
        url = url.slice(0, -1)
        continue
      }
    }
    return url
  }
}

/** Split post text into plain runs and mention/hashtag/URL entities, in order. Purely
 *  lexical — no platform lookups, no validation beyond the shapes above. */
export function splitContentEntities(content: string): SocialPostSegment[] {
  const segments: SocialPostSegment[] = []
  let last = 0
  for (const m of content.matchAll(ENTITY_RE)) {
    const start = m.index
    let text = m[0]
    const kind: SocialPostEntityKind = m[1] ? 'url' : m[2] ? 'mention' : 'hashtag'
    if (kind === 'url') text = trimTrailingPunctuation(text)
    if (start > last) segments.push({ kind: null, text: content.slice(last, start) })
    segments.push({ kind, text })
    // The scan resumes after the *untrimmed* match, so a trimmed URL tail lands in the
    // next plain segment naturally — no lastIndex bookkeeping.
    last = start + text.length
  }
  if (last < content.length) segments.push({ kind: null, text: content.slice(last) })
  return segments
}

// ── Card ───────────────────────────────────────────────────────────────────────────────

export interface SocialPostData {
  /** Display name, e.g. 'Ada Lovelace'. */
  name: string
  /** Bare handle without the leading '@' — the card prepends it (a passed '@' is
   *  forgiven and stripped). */
  handle: string
  /** The post text. Line breaks are preserved; @mentions, #hashtags, and http(s) URLs
   *  are tinted as inert spans. Always rendered as text — never markup. */
  content: string
  /** Avatar image URL. Omitted — or dead (a load error) — the neutral silhouette
   *  fallback shows instead; the image is only revealed once it actually loads. */
  avatarUrl?: string
  /** 0–4 image URLs for the media grid; more than 4 are truncated with a console.warn. */
  images?: string[]
  /** Href of the original post — the footer's "View original ↗", the card's only link. */
  link: string
  /** Preformatted display string ('4:20 PM · Mar 3, 2026', 'Mar 2026'…). Rendered
   *  verbatim — never parsed, which is also why it's a plain span, not <time datetime>. */
  date?: string
  /** Show the neutral-colored check badge after the name. Neutral on purpose: shape says
   *  "verified", color stays --foreground so it reads as no platform's brand check. */
  verified?: boolean
}

export interface SocialPostLabels {
  /** Accessible name of the card. Default `Post by ${name} (@${handle})`. */
  root?: string
  /** Footer link text. Default 'Source'. */
  source?: string
  /** Accessible label of the verified badge. Default 'Verified'. */
  verified?: string
}

export interface SocialPostOptions extends SocialPostData {
  /** 'outline' (default): a bordered card on the card surface. 'filled': the same
   *  geometry on a borderless muted-gray fill — the border stays transparent rather than
   *  removed, so nothing shifts by a pixel when variants mix. */
  variant?: 'outline' | 'filled'
  labels?: SocialPostLabels
  /** Inject the component stylesheet on first use. Default true; set false to ship the
   *  CSS yourself (see `socialPostStyles()`). */
  injectStyles?: boolean
  /** Extra class(es) added to the root, for your own overrides. */
  className?: string
}

export interface SocialPost {
  /** The card root (<article>). Append it anywhere. */
  readonly element: HTMLElement
  getState(): SocialPostData
  /** Patch and re-render. Keys present in the patch are applied; `key: undefined` clears
   *  an optional field (drops the avatar, empties the grid, removes the date). Absent
   *  keys are untouched. Required fields ignore null/undefined — they have no default to
   *  reset to. The avatar <img> and the media grid are only rebuilt when their values
   *  actually changed, so toggling `verified` never re-fetches images. */
  setState(patch: Partial<SocialPostOptions>): void
  /** Nothing global to detach — every listener lives on the card's own children. Kept
   *  for parity with the other controls (and callers' cleanup habits). */
  destroy(): void
}

const SVG_NS = 'http://www.w3.org/2000/svg'

/** Only these trusted literal strings ever go through innerHTML; user text is always
 *  textContent. */
function svgIcon(viewBox: string, strokeWidth: string, inner: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', viewBox)
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', strokeWidth)
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.innerHTML = inner
  return svg
}

/** Head + shoulders, sized so the shoulders crop at the avatar circle's lower edge. */
function silhouetteSvg(): SVGSVGElement {
  const svg = svgIcon('0 0 40 40', '2.4', '<circle cx="20" cy="16" r="6.5"/><path d="M7.5 36.5a12.5 12.5 0 0 1 25 0"/>')
  svg.setAttribute('aria-hidden', 'true')
  return svg
}

function verifiedSvg(label: string): SVGSVGElement {
  const svg = svgIcon(
    '0 0 24 24',
    '2',
    '<path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"/><path d="m9 12 2 2 4-4"/>',
  )
  svg.setAttribute('class', 'social-post-verified')
  svg.setAttribute('role', 'img')
  svg.setAttribute('aria-label', label)
  return svg
}

function normalizeImages(images: string[] | undefined): string[] {
  if (!images) return []
  if (images.length <= 4) return [...images]
  console.warn('social-post: more than 4 images — rendering the first 4.')
  return images.slice(0, 4)
}

const stripAt = (handle: string) => handle.replace(/^@/, '')

/** Build the card. Append `.element` anywhere; it fills its container's width, so size it
 *  from outside (e.g. max-width on a wrapper). */
export function createSocialPost(opts: SocialPostOptions): SocialPost {
  if (opts.injectStyles !== false) injectSocialPostStyles()

  let name = opts.name
  let handle = opts.handle
  let content = opts.content
  let avatarUrl = opts.avatarUrl
  let images = normalizeImages(opts.images)
  let link = opts.link
  let date = opts.date
  let verified = opts.verified ?? false
  let variant = opts.variant ?? 'outline'
  let labels = opts.labels
  let className = opts.className

  const root = document.createElement('article')

  const header = document.createElement('header')
  header.className = 'social-post-header'
  // The whole avatar block is decorative — the name and handle beside it carry the
  // identity as text.
  const avatar = document.createElement('span')
  avatar.className = 'social-post-avatar'
  avatar.setAttribute('aria-hidden', 'true')
  avatar.appendChild(silhouetteSvg())
  let avatarImg: HTMLImageElement | null = null

  const identity = document.createElement('span')
  identity.className = 'social-post-identity'
  const nameRow = document.createElement('span')
  nameRow.className = 'social-post-name-row'
  const nameEl = document.createElement('span')
  nameEl.className = 'social-post-name'
  let verifiedEl: SVGSVGElement | null = null
  const handleEl = document.createElement('span')
  handleEl.className = 'social-post-handle'
  nameRow.appendChild(nameEl)
  identity.append(nameRow, handleEl)
  header.append(avatar, identity)

  const contentEl = document.createElement('p')
  contentEl.className = 'social-post-content'

  let mediaEl: HTMLDivElement | null = null
  let mediaKey: string | null = null

  const footer = document.createElement('footer')
  footer.className = 'social-post-footer'
  const dateEl = document.createElement('span')
  dateEl.className = 'social-post-date'
  const linkEl = document.createElement('a')
  linkEl.className = 'social-post-link'
  linkEl.target = '_blank'
  linkEl.rel = 'noopener noreferrer'
  const linkText = document.createElement('span')
  const linkArrow = document.createElement('span')
  linkArrow.className = 'social-post-link-arrow'
  linkArrow.setAttribute('aria-hidden', 'true')
  linkArrow.textContent = '↗'
  linkEl.append(linkText, linkArrow)
  footer.append(dateEl, linkEl)

  root.append(header, contentEl, footer)

  const setAvatar = (url: string | undefined) => {
    avatarImg?.remove()
    avatarImg = null
    avatar.classList.remove('has-image')
    if (!url) return
    const img = document.createElement('img')
    img.className = 'social-post-avatar-img'
    img.alt = ''
    // Deliberately NOT loading="lazy": the img is display:none until it loads, and a
    // lazy image with no box never intersects the viewport — it would deadlock hidden.
    img.referrerPolicy = 'no-referrer'
    // Revealed only on a real load: an error (or a request that never finishes) leaves
    // the silhouette in place, so a dead URL can't paint a broken-image glyph.
    img.addEventListener('load', () => {
      if (img === avatarImg) avatar.classList.add('has-image')
    }, { once: true })
    img.addEventListener('error', () => {
      if (img === avatarImg) {
        img.remove()
        avatarImg = null
      }
    }, { once: true })
    img.src = url
    avatar.appendChild(img)
    avatarImg = img
  }

  const buildMedia = () => {
    mediaEl?.remove()
    mediaEl = null
    if (images.length === 0) return
    const grid = document.createElement('div')
    grid.className = 'social-post-media'
    grid.dataset.count = String(images.length)
    for (const src of images) {
      const cell = document.createElement('img')
      cell.className = 'social-post-media-item'
      cell.alt = ''
      cell.loading = 'lazy'
      cell.referrerPolicy = 'no-referrer'
      cell.src = src
      grid.appendChild(cell)
    }
    root.insertBefore(grid, footer)
    mediaEl = grid
  }

  const render = () => {
    root.className = `social-post social-post--${variant}${className ? ` ${className}` : ''}`
    root.setAttribute('aria-label', labels?.root ?? `Post by ${name} (@${stripAt(handle)})`)
    nameEl.textContent = name
    nameEl.title = name // ellipsized names keep a native tooltip
    verifiedEl?.remove()
    verifiedEl = null
    if (verified) {
      verifiedEl = verifiedSvg(labels?.verified ?? 'Verified')
      nameRow.appendChild(verifiedEl)
    }
    handleEl.textContent = `@${stripAt(handle)}`
    contentEl.replaceChildren(
      ...splitContentEntities(content).map((seg) => {
        if (!seg.kind) return document.createTextNode(seg.text)
        const span = document.createElement('span')
        span.className = 'social-post-entity'
        span.dataset.entity = seg.kind
        span.textContent = seg.text
        return span
      }),
    )
    dateEl.textContent = date ?? ''
    dateEl.style.display = date ? '' : 'none'
    linkText.textContent = labels?.source ?? 'Source'
    linkEl.href = link
  }

  setAvatar(avatarUrl)
  mediaKey = images.join('\n')
  buildMedia()
  render()

  return {
    element: root,
    getState: () => ({ name, handle, content, avatarUrl, images: [...images], link, date, verified }),
    setState(patch) {
      if (patch.name != null) name = patch.name
      if (patch.handle != null) handle = patch.handle
      if (patch.content != null) content = patch.content
      if (patch.link != null) link = patch.link
      if ('date' in patch) date = patch.date
      if ('verified' in patch) verified = patch.verified ?? false
      if ('variant' in patch) variant = patch.variant ?? 'outline'
      if ('labels' in patch) labels = patch.labels
      if ('className' in patch) className = patch.className
      if ('avatarUrl' in patch && patch.avatarUrl !== avatarUrl) {
        avatarUrl = patch.avatarUrl
        setAvatar(avatarUrl)
      }
      if ('images' in patch) {
        const next = normalizeImages(patch.images)
        const key = next.join('\n')
        if (key !== mediaKey) {
          images = next
          mediaKey = key
          buildMedia()
        }
      }
      render()
    },
    destroy() {},
  }
}

// ── Styles ─────────────────────────────────────────────────────────────────────────────

let stylesInjected = false
/** Inject the card stylesheet once. Called automatically unless `injectStyles: false`. */
export function injectSocialPostStyles(): void {
  if (stylesInjected || typeof document === 'undefined') return
  if (document.getElementById('social-post-styles')) {
    stylesInjected = true
    return
  }
  const style = document.createElement('style')
  style.id = 'social-post-styles'
  style.textContent = socialPostStyles()
  document.head.appendChild(style)
  stylesInjected = true
}

/** The card's CSS as a string (for callers who inject styles themselves / SSR). */
export function socialPostStyles(): string {
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
   default zinc theme), color alone wouldn't read. No underline, no cursor — these spans
   are inert on purpose and must not pose as links. */
.social-post-entity {
  color: var(--social-post-accent, var(--primary, light-dark(#2563eb, #60a5fa)));
  font-weight: 500;
}
/* One fixed 16:9 frame regardless of image count — only the internal grid template
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
     sits vertically centered — 10px off the hairline, 10px off the bottom edge. */
  margin: 0 calc(-1 * var(--_pad)) calc(-1 * var(--_pad));
  padding: 10px var(--_pad);
  border-top: 1px solid color-mix(in srgb, var(--social-post-border, var(--border, light-dark(#e4e4e7, #303036))) 60%, transparent);
  font-size: 13px;
}
/* The filled card has no visible border to echo — use the token at full strength so the
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
`
}
