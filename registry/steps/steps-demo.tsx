'use client'

import { Steps, useSteps } from './steps-react'

const STEPS = [{ title: 'Cart' }, { title: 'Shipping' }, { title: 'Payment' }, { title: 'Confirm' }]

function StepsDemo() {
  const wizard = useSteps({ steps: STEPS })

  return (
    <div className="flex flex-col gap-4">
      <Steps engine={wizard.engine} />
      <button
        type="button"
        onClick={wizard.next}
        disabled={!wizard.canNext}
        className="self-start rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:pointer-events-none disabled:opacity-50"
      >
        {wizard.isLast ? 'Done' : 'Continue'}
      </button>
    </div>
  )
}

export { StepsDemo }
