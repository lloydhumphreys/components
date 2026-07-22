'use client'

import { useRef } from 'react'
import { ScrollRail } from './scroll-rail-react'

const SECTIONS = [
  { id: 'intro', label: 'Introduction' },
  { id: 'usage', label: 'Usage' },
  { id: 'theming', label: 'Theming' },
  { id: 'api', label: 'API' },
]

function ScrollRailDemo() {
  const scrollRef = useRef<HTMLDivElement>(null)

  return (
    <div className="relative h-72 w-full overflow-hidden rounded-lg border">
      <div ref={scrollRef} className="h-full overflow-y-auto p-6 pr-16">
        {SECTIONS.map((s) => (
          <section key={s.id} id={s.id} className="mb-24 last:mb-6">
            <h3 className="text-lg font-semibold">{s.label}</h3>
            <p className="mt-2 text-sm opacity-70">Scroll to see the rail track this section.</p>
          </section>
        ))}
      </div>
      <ScrollRail
        scrollRef={scrollRef}
        items={SECTIONS.map((s) => ({ id: s.id, target: s.id, label: s.label }))}
      />
    </div>
  )
}

export { ScrollRailDemo }
