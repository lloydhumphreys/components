'use client'

import { useState } from 'react'
import { WorkflowButton, type WorkflowStep } from './workflow-button-react'

const STEPS: WorkflowStep[] = [
  { id: 'draft', label: 'Draft' },
  { id: 'review', label: 'In review', advanceLabel: 'Submit for review' },
  { id: 'published', label: 'Published', advanceLabel: 'Publish' },
]

function WorkflowButtonDemo() {
  const [current, setCurrent] = useState('draft')

  return (
    <WorkflowButton
      steps={STEPS}
      current={current}
      onMove={(toId) => setCurrent(toId)}
    />
  )
}

export { WorkflowButtonDemo }
