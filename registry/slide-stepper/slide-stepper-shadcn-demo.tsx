'use client'

import { SlideStepperCarousel } from './slide-stepper-shadcn'

const SLIDES = ['First slide.', 'Second slide.', 'Third slide.']

function SlideStepperShadcnDemo() {
  return (
    <SlideStepperCarousel
      slides={SLIDES.map((text) => (
        <div key={text} className="grid h-40 place-items-center text-lg">
          {text}
        </div>
      ))}
      duration={4000}
    />
  )
}

export { SlideStepperShadcnDemo }
