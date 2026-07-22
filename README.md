# @lloydhumphreys/components

A [shadcn](https://ui.shadcn.com/docs/registry)-compatible component registry. Components
are installed with the shadcn CLI straight from this repo — no npm package.

**▶ [Live demo](https://lloydhumphreys.github.io/components/demo/)**

## Components

| Name | Description | |
|------|-------------|--|
| `scroll-rail` | A dependency-free scroll-position navigation rail (vanilla core + React wrapper). | [Demo](https://lloydhumphreys.github.io/components/demo/scroll-rail/) · [Example](registry/scroll-rail/scroll-rail-demo.tsx) |
| `workflow-button` ⚠️ | **Experimental.** A split button that drives a flow through stages — primary advances one step, caret menu jumps anywhere the flow allows (vanilla core + React wrapper; styled on shadcn theme tokens). | [Demo](https://lloydhumphreys.github.io/components/demo/workflow-button/) · [Example](registry/workflow-button/workflow-button-demo.tsx) |
| `workflow-button-shadcn` ⚠️ | **Experimental.** The same control composed from your app's actual shadcn `<Button>` + `<DropdownMenu>` — icon components, ReactNode menu rows/children, identical theming. Installs `button` + `dropdown-menu` as registry deps. | [Example](registry/workflow-button/workflow-button-shadcn-demo.tsx) |
| `slide-stepper` | An auto-advancing slide progress pill, stories-style — active dot stretches into a filling bar, tape-counter clipping, pause/replay circle, optional crossfade carousel (headless engine + vanilla pill + React wrappers). | [Demo](https://lloydhumphreys.github.io/components/demo/slide-stepper/) · [Example](registry/slide-stepper/slide-stepper-demo.tsx) |
| `slide-stepper-shadcn` | The same stepper composed shadcn-natively — Tailwind tokens, shadcn `<Button>` pause circle, lucide icons; hook + pill + carousel in one self-contained file. Installs `button` as a registry dep. | [Example](registry/slide-stepper/slide-stepper-shadcn-demo.tsx) |
| `steps` ⚠️ | **Experimental.** A 1-2-3-4 wizard step indicator — earned forward progress with jump-back to reached steps, completed/error/disabled states, per-step icons, horizontal/vertical, container-query collapse to a centered title + description summary (headless engine + vanilla indicator + React wrapper with a `useSteps` hook). | [Demo](https://lloydhumphreys.github.io/components/demo/steps/) · [Example](registry/steps/steps-demo.tsx) |
| `steps-shadcn` ⚠️ | **Experimental.** The same indicator composed shadcn-natively — Tailwind tokens, lucide status icons, per-step icon components, Tailwind v4 container queries for the collapse; hook + indicator in one self-contained file. | [Example](registry/steps/steps-shadcn-demo.tsx) |
| `social-post` ⚠️ | **Experimental.** A themeable, platform-neutral social post embed card — no brand chrome, @mention/#hashtag/URL tinting as inert spans, a 1–4 image grid in one fixed 16:9 frame, silhouette fallback for missing/dead avatars, outline and filled-gray variants, and a single "Source" link (vanilla core + React wrapper; styled on shadcn theme tokens). | [Demo](https://lloydhumphreys.github.io/components/demo/social-post/) · [Example](registry/social-post/social-post-demo.tsx) |
| `social-post-shadcn` ⚠️ | **Experimental.** The same card composed shadcn-natively — your app's actual `<Avatar>`, lucide icons, Tailwind tokens; compound `SocialPost`/`SocialPostHeader`/`SocialPostContent`/`SocialPostMedia`/`SocialPostFooter` parts, self-contained in one file. Installs `avatar` as a registry dep. | [Example](registry/social-post/social-post-shadcn-demo.tsx) |

> ⚠️ **Experimental:** `workflow-button`, `workflow-button-shadcn`, `steps`,
> `steps-shadcn`, `social-post`, and `social-post-shadcn` are still settling — expect
> breaking API changes between versions. Pin what you install and read the diff before
> updating.

Every item also ships a canonical `<name>-demo` registry item — a minimal example file
installable next to the component (e.g. `@lloydhumphreys/steps-shadcn-demo`).

### Changing Steps at runtime

`useSteps` accepts a changing `steps` array. Give every step a unique, stable `id` when
you insert, remove, or reorder steps: the engine uses those ids to keep the active step,
reached frontier, and per-step errors attached to the same logical steps.

```tsx
'use client'

import { useState } from 'react'
import {
  Steps,
  useSteps,
  type StepItem,
} from '@/components/steps/steps-react'

const initialSteps: StepItem[] = [
  { id: 'account', title: 'Account' },
  { id: 'payment', title: 'Payment' },
  { id: 'confirm', title: 'Confirm' },
]

export function CheckoutSteps() {
  const [steps, setSteps] = useState(initialSteps)
  const wizard = useSteps({ steps })

  function requireApproval() {
    setSteps((current) => {
      if (current.some((step) => step.id === 'approval')) return current
      const confirm = current.findIndex((step) => step.id === 'confirm')
      return [
        ...current.slice(0, confirm),
        { id: 'approval', title: 'Approval' },
        ...current.slice(confirm),
      ]
    })
  }

  function removeApproval() {
    setSteps((current) => current.filter((step) => step.id !== 'approval'))
  }

  return (
    <>
      <Steps engine={wizard.engine} />
      <button type="button" onClick={requireApproval}>Require approval</button>
      <button type="button" onClick={removeApproval}>Remove approval</button>
    </>
  )
}
```

Steps inserted at or behind the reached frontier become reached; steps inserted after it
remain upcoming. If the active step is removed, the engine selects the nearest enabled
step and calls `onChange` with reason `goto`.

## Install a component

Point the shadcn CLI at the item's JSON URL:

```bash
npx shadcn@latest add https://raw.githubusercontent.com/lloydhumphreys/components/main/public/r/scroll-rail.json
```

### Nicer: a namespaced registry

Add this registry to the consuming project's `components.json` once…

```jsonc
{
  "registries": {
    "@lloydhumphreys": "https://raw.githubusercontent.com/lloydhumphreys/components/main/public/r/{name}.json"
  }
}
```

…then install by short name:

```bash
npx shadcn@latest add @lloydhumphreys/scroll-rail
```

## Demo

**Live: <https://lloydhumphreys.github.io/components/demo/>**

Each component has its own standalone demo page under `public/demo/<name>/`, listed from
`public/demo/index.html`. Every page loads the vanilla core compiled to an IIFE bundle
alongside it:

```bash
npm run demo:build       # esbuild → public/demo/<name>/<name>.js (all components)
open public/demo/         # or serve public/ and visit /demo/
```

Re-run `demo:build` (and commit the regenerated `public/demo/<name>/<name>.js`) after
editing a component. Bump the `?v=` on the demo page's `<script>` so GitHub Pages
(10-minute cache) picks up the new bundle.

## How this repo works

- `registry.json` — the registry index: one entry per component, listing its source files.
- `registry/<name>/` — the actual source, edited normally.
- `public/r/<name>.json` — the **built, installable** item (source inlined). Generated by
  `shadcn build`; committed so the raw GitHub URLs above resolve without a server.
- `public/demo/` — the demo page plus its built bundle (`npm run demo:build`).

### Build after editing

```bash
npm install
npm run registry:build   # runs `shadcn build` → regenerates public/r/*.json
npm run verify:generated # rebuilds registry + demos and fails if committed output is stale
```

Commit the regenerated `public/r/` along with your source changes.

### Add another component

1. Drop its files under `registry/<name>/`.
2. Add an entry to `registry.json` (`name`, `type`, `title`, `description`, `files[]` with a
   `target` for each file).
3. `npm run registry:build` and commit.

## Hosting

`public/` is deployed to GitHub Pages on every push to `main`
(`.github/workflows/pages.yml`), so everything is also served from
<https://lloydhumphreys.github.io/components/>:

- `…/components/` — landing page listing the components.
- `…/components/demo/` — the scroll-rail demo.
- `…/components/r/scroll-rail.json` — the installable registry item; works as the
  registry URL in `components.json` too:
  `"@lloydhumphreys": "https://lloydhumphreys.github.io/components/r/{name}.json"`.

The GitHub raw URLs above keep working regardless.
