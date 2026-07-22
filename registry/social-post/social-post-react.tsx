// social-post-react — a thin React wrapper over the framework-agnostic social-post core.
//
// EXPERIMENTAL — the API is still settling and will change in breaking ways; pin what you
// install.
//
//   <SocialPost name="Ada" handle="ada" content="…" link="https://…" />
//
// The wrapper mounts the vanilla card once and syncs every prop into the running control
// via setState — the core only rebuilds the avatar <img> / media grid when those values
// actually change, so re-renders are cheap. There's no engine to share (the card is
// purely presentational), which is why this file is so much smaller than steps-react.

'use client'

import { useEffect, useRef } from 'react'
import {
  createSocialPost,
  splitContentEntities,
  type SocialPost as VanillaSocialPost,
  type SocialPostData,
  type SocialPostEntityKind,
  type SocialPostLabels,
  type SocialPostOptions,
  type SocialPostSegment,
} from './social-post'

interface SocialPostProps extends Omit<SocialPostOptions, 'injectStyles'> {}

/**
 * The card. The returned wrapper is `display: contents`, so it adds no layout box of its
 * own — size the card with `className` (or a parent) instead.
 */
function SocialPost({
  name,
  handle,
  content,
  avatarUrl,
  images,
  link,
  date,
  verified,
  variant,
  labels,
  className,
}: SocialPostProps) {
  const hostRef = useRef<HTMLSpanElement>(null)
  const controlRef = useRef<VanillaSocialPost | null>(null)
  // Initial-only options, captured at creation like a useState initializer.
  const initial = useRef({ name, handle, content, avatarUrl, images, link, date, verified, variant, labels, className })
  initial.current = { name, handle, content, avatarUrl, images, link, date, verified, variant, labels, className }

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const control = createSocialPost(initial.current)
    host.appendChild(control.element)
    controlRef.current = control
    return () => {
      control.destroy()
      control.element.remove()
      controlRef.current = null
    }
  }, [])

  // Every prop each sync, so a removed optional prop genuinely clears its field ('key in
  // patch' semantics in the core).
  useEffect(() => {
    controlRef.current?.setState({ name, handle, content, avatarUrl, images, link, date, verified, variant, labels, className })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, handle, content, avatarUrl, images, link, date, verified, variant, labels, className])

  return <span ref={hostRef} style={{ display: 'contents' }} />
}

export {
  splitContentEntities,
  type SocialPostData,
  type SocialPostEntityKind,
  type SocialPostLabels,
  type SocialPostOptions,
  type SocialPostSegment,
  type SocialPostProps,
  SocialPost,
}
