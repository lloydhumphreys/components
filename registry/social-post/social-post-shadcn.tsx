// social-post-shadcn — the platform-neutral social post embed card, composed
// shadcn-natively.
//
// EXPERIMENTAL — the API is still settling and will change in breaking ways; pin what you
// install.
//
// Same model as the vanilla `social-post` (an embedded-tweet-shaped quotation card with
// no platform branding: every field passed in as data, nothing fetched), but built from
// your app's actual pieces: your `<Avatar>` (installed as a registry dependency) for the
// avatar-with-fallback, Tailwind theme tokens for every color, lucide icons for the
// verified badge / footer arrow / avatar silhouette. Inside a shadcn app it matches your
// theme untouched.
//
//   <SocialPost name="Ada" handle="ada" content="…" link="https://…" />
//
// `SocialPost` is both the root part and the data-driven entry point — it composes
// SocialPostHeader / SocialPostContent / SocialPostMedia / SocialPostFooter internally.
// Those parts are exported too: to rearrange the anatomy, compose them yourself inside
// your own <article>.
//
// The footer link is deliberately the only interactive element — the card is a
// quotation, not a button, so its text stays selectable. @mentions, #hashtags, and URLs
// in the content are tinted as inert spans, never anchors. The verified badge keeps
// --foreground color on purpose: the shape says "verified", the neutral color keeps it
// from reading as any platform's brand check.
//
// Self-contained on purpose: the entity detection is inlined rather than imported from
// the vanilla core, so this file installs alone. See social-post.ts for the annotated
// reference implementation — the segmentation semantics here are identical.

'use client'

import { useMemo } from 'react'
import type { ComponentProps } from 'react'
import { ArrowUpRightIcon, BadgeCheckIcon, UserRoundIcon } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

// ── Entities ───────────────────────────────────────────────────────────────────────────

type SocialPostEntityKind = 'mention' | 'hashtag' | 'url'

interface SocialPostSegment {
  /** null for plain text between entities. */
  kind: SocialPostEntityKind | null
  text: string
}

// Alternation order matters: at any position the URL branch wins, so a URL's own
// #fragment or ?q=@x is consumed whole and never re-matched as a hashtag/mention. The
// lookbehinds require a non-word boundary, which is what keeps bob@x.com from tagging @x.
// Only explicit http(s):// URLs are detected (no bare domains); mentions accept fediverse
// form (@user@instance.tld); unicode hashtags work. Single bounded scan per alternative —
// no backtracking blow-up.
const ENTITY_RE =
  /(https?:\/\/[^\s<>"']+)|(?<![\w@])(@[A-Za-z0-9_]{1,30}(?:@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*)?)|(?<![\w#])(#[\p{L}\p{N}_]+)/gu

/** Strip sentence punctuation a URL match swept in, plus a closing paren with no opening
 *  partner inside the match. */
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

/** Split post text into plain runs and mention/hashtag/URL entities, in order. */
function splitContentEntities(content: string): SocialPostSegment[] {
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
    // next plain segment naturally.
    last = start + text.length
  }
  if (last < content.length) segments.push({ kind: null, text: content.slice(last) })
  return segments
}

// ── Card ───────────────────────────────────────────────────────────────────────────────

interface SocialPostLabels {
  /** Accessible name of the card. Default `Post by ${name} (@${handle})`. */
  root?: string
  /** Footer link text. Default 'Source'. */
  source?: string
  /** Accessible label of the verified badge. Default 'Verified'. */
  verified?: string
}

const stripAt = (handle: string) => handle.replace(/^@/, '')

function normalizeImages(images: string[] | undefined): string[] {
  if (!images) return []
  if (images.length <= 4) return images
  console.warn('social-post: more than 4 images — rendering the first 4.')
  return images.slice(0, 4)
}

interface SocialPostProps extends Omit<ComponentProps<'article'>, 'content' | 'children'> {
  /** Display name, e.g. 'Ada Lovelace'. */
  name: string
  /** Bare handle without the leading '@' — the card prepends it. */
  handle: string
  /** The post text. Line breaks are preserved; entities are tinted as inert spans. */
  content: string
  /** Avatar image URL. Omitted or dead, the silhouette fallback shows instead. */
  avatarUrl?: string
  /** 0–4 image URLs for the media grid; more than 4 are truncated with a console.warn. */
  images?: string[]
  /** Href of the original post — the footer's "View original ↗", the card's only link. */
  link: string
  /** Preformatted display string — rendered verbatim, never parsed. */
  date?: string
  /** Show the neutral-colored check badge after the name. */
  verified?: boolean
  /** 'outline' (default): a bordered card on bg-card. 'filled': the same geometry on a
   *  borderless bg-muted fill — the border stays transparent rather than removed, so
   *  nothing shifts by a pixel when variants mix. */
  variant?: 'outline' | 'filled'
  labels?: SocialPostLabels
}

/** The card: header, tinted content, media grid, footer — all from the data props. Also
 *  the root part for manual composition (or roll your own <article> from the parts). */
function SocialPost({
  name,
  handle,
  content,
  avatarUrl,
  images,
  link,
  date,
  verified = false,
  variant = 'outline',
  labels,
  className,
  ...props
}: SocialPostProps) {
  return (
    <article
      data-slot="social-post"
      data-variant={variant}
      aria-label={labels?.root ?? `Post by ${name} (@${stripAt(handle)})`}
      className={cn(
        'group/social-post flex w-full flex-col gap-3 rounded-xl border p-4 text-card-foreground',
        variant === 'filled' ? 'border-transparent bg-muted' : 'bg-card',
        className,
      )}
      {...props}
    >
      <SocialPostHeader
        name={name}
        handle={handle}
        avatarUrl={avatarUrl}
        verified={verified}
        verifiedLabel={labels?.verified}
      />
      <SocialPostContent content={content} />
      <SocialPostMedia images={images} />
      <SocialPostFooter date={date} link={link} sourceLabel={labels?.source} />
    </article>
  )
}

interface SocialPostHeaderProps extends Omit<ComponentProps<'header'>, 'children'> {
  name: string
  handle: string
  avatarUrl?: string
  verified?: boolean
  verifiedLabel?: string
}

function SocialPostHeader({
  name,
  handle,
  avatarUrl,
  verified = false,
  verifiedLabel,
  className,
  ...props
}: SocialPostHeaderProps) {
  return (
    <header data-slot="social-post-header" className={cn('flex min-w-0 items-center gap-2.5', className)} {...props}>
      {/* Decorative — the name and handle beside it carry the identity as text. Radix's
          load-status state machine is exactly the "missing or dead URL → fallback"
          behavior the vanilla core hand-rolls. */}
      <Avatar aria-hidden="true" className="size-10">
        {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
        <AvatarFallback className="bg-muted text-muted-foreground">
          <UserRoundIcon className="size-5" />
        </AvatarFallback>
      </Avatar>
      <span data-slot="social-post-identity" className="flex min-w-0 flex-col">
        <span data-slot="social-post-name-row" className="flex min-w-0 items-center gap-1">
          <span data-slot="social-post-name" title={name} className="truncate text-sm font-semibold text-foreground">
            {name}
          </span>
          {verified ? (
            <span data-slot="social-post-verified" className="inline-flex flex-none items-center text-foreground">
              <BadgeCheckIcon aria-hidden="true" className="size-4" />
              <span className="sr-only">{verifiedLabel ?? 'Verified'}</span>
            </span>
          ) : null}
        </span>
        <span data-slot="social-post-handle" className="truncate text-[13px] leading-snug text-muted-foreground">
          @{stripAt(handle)}
        </span>
      </span>
    </header>
  )
}

interface SocialPostContentProps extends Omit<ComponentProps<'p'>, 'content' | 'children'> {
  content: string
}

function SocialPostContent({ content, className, ...props }: SocialPostContentProps) {
  const segments = useMemo(() => splitContentEntities(content), [content])
  return (
    <p
      data-slot="social-post-content"
      className={cn('whitespace-pre-wrap break-words text-[15px] leading-normal', className)}
      {...props}
    >
      {segments.map((seg, i) =>
        seg.kind ? (
          // Tint plus a slight weight bump: in themes where --primary sits near
          // --foreground (default zinc), color alone wouldn't read. Inert on purpose —
          // no underline, no cursor, never an anchor.
          <span key={i} data-slot="social-post-entity" data-entity={seg.kind} className="font-medium text-primary">
            {seg.text}
          </span>
        ) : (
          seg.text
        ),
      )}
    </p>
  )
}

interface SocialPostMediaProps extends Omit<ComponentProps<'div'>, 'children'> {
  /** 0–4 image URLs; more than 4 are truncated with a console.warn. Renders nothing
   *  when empty. */
  images?: string[]
}

/** One fixed 16:9 frame regardless of image count — only the internal grid template
 *  varies (1 full, 2 columns, 3 tall + stacked, 4 in a 2×2), so every card with media
 *  keeps identical proportions. The container's bg-border paints the seams. */
function SocialPostMedia({ images, className, ...props }: SocialPostMediaProps) {
  const shown = normalizeImages(images)
  if (shown.length === 0) return null
  return (
    <div
      data-slot="social-post-media"
      data-count={shown.length}
      className={cn(
        'grid aspect-video gap-0.5 overflow-hidden rounded-lg bg-border',
        shown.length >= 2 && 'grid-cols-2',
        shown.length >= 3 && 'grid-rows-2',
        className,
      )}
      {...props}
    >
      {shown.map((src, i) => (
        <img
          key={i}
          data-slot="social-post-media-item"
          src={src}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className={cn('size-full min-h-0 object-cover', shown.length === 3 && i === 0 && 'row-span-2')}
        />
      ))}
    </div>
  )
}

interface SocialPostFooterProps extends Omit<ComponentProps<'footer'>, 'children'> {
  /** Preformatted display string — rendered verbatim, never parsed. */
  date?: string
  link: string
  sourceLabel?: string
}

function SocialPostFooter({ date, link, sourceLabel, className, ...props }: SocialPostFooterProps) {
  return (
    <footer
      data-slot="social-post-footer"
      // -mx-4/-mb-4 mirror the card's p-4: the hairline runs full-bleed, and the footer
      // swallows the card's bottom padding so its text sits vertically centered (py-2.5
      // off the hairline and off the bottom edge alike). On the filled card there's no
      // visible border to echo, so the hairline takes the token at full strength.
      className={cn(
        '-mx-4 -mb-4 flex items-center gap-2.5 border-t border-border/60 px-4 py-2.5 text-[13px] text-muted-foreground',
        'group-data-[variant=filled]/social-post:border-border',
        className,
      )}
      {...props}
    >
      {date ? (
        <span data-slot="social-post-date" className="truncate">
          {date}
        </span>
      ) : null}
      <a
        data-slot="social-post-link"
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          'ms-auto inline-flex flex-none items-center gap-1 rounded-sm font-medium outline-none',
          'transition-colors hover:text-foreground motion-reduce:transition-none',
          'focus-visible:ring-[3px] focus-visible:ring-ring/50',
        )}
      >
        {sourceLabel ?? 'Source'}
        <ArrowUpRightIcon aria-hidden="true" className="size-3.5" />
      </a>
    </footer>
  )
}

export {
  type SocialPostEntityKind,
  type SocialPostSegment,
  splitContentEntities,
  type SocialPostLabels,
  type SocialPostProps,
  SocialPost,
  type SocialPostHeaderProps,
  SocialPostHeader,
  type SocialPostContentProps,
  SocialPostContent,
  type SocialPostMediaProps,
  SocialPostMedia,
  type SocialPostFooterProps,
  SocialPostFooter,
}
