'use client'

import { SocialPost } from './social-post-react'

function SocialPostDemo() {
  return (
    <div className="max-w-md">
      <SocialPost
        name="Ada Lovelace"
        handle="adalovelace"
        verified
        avatarUrl="https://i.pravatar.cc/96?u=adalovelace"
        content={
          'Notes on the Analytical Engine are finally up — enormous thanks to @babbage and everyone following along with #computing. https://example.com/notes'
        }
        images={[
          'https://picsum.photos/seed/engine-1/800/450',
          'https://picsum.photos/seed/engine-2/800/450',
        ]}
        date="Mar 3, 2026"
        link="https://example.com/adalovelace/status/1"
      />
    </div>
  )
}

export { SocialPostDemo }
