'use client'

import { Button } from '@/components/ui/button'
import { Steps, useSteps } from './steps-shadcn'

const STEPS = [{ title: 'Cart' }, { title: 'Shipping' }, { title: 'Payment' }, { title: 'Confirm' }]

function StepsShadcnDemo() {
  const wizard = useSteps({ steps: STEPS })

  return (
    <div className="flex flex-col gap-4">
      <Steps engine={wizard.engine} />
      <Button className="self-start" onClick={wizard.next} disabled={!wizard.canNext}>
        {wizard.isLast ? 'Done' : 'Continue'}
      </Button>
    </div>
  )
}

export { StepsShadcnDemo }
