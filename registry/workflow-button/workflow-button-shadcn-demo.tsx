'use client'

import { useState } from 'react'
import { WorkflowButton, type WorkflowStep } from './workflow-button-shadcn'

const STEPS: WorkflowStep[] = [
  { id: 'draft', label: 'Draft' },
  { id: 'review', label: 'In review', advanceLabel: 'Submit for review' },
  { id: 'published', label: 'Published', advanceLabel: 'Publish' },
]

function WorkflowButtonShadcnDemo() {
  const [current, setCurrent] = useState('draft')

  return (
    <WorkflowButton
      steps={STEPS}
      current={current}
      onMove={(toId) => setCurrent(toId)}
    />
  )
}

export { WorkflowButtonShadcnDemo }
