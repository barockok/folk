import { useState } from 'react'
import WelcomeStep from './WelcomeStep'
import ModelDownloadStep from './ModelDownloadStep'
import WorkspaceStep from './WorkspaceStep'

interface OnboardingWizardProps {
  onComplete: () => void
}

export default function OnboardingWizard({ onComplete }: OnboardingWizardProps): React.JSX.Element {
  const [step, setStep] = useState(0)

  return (
    <div className="fixed inset-0 z-50 bg-void-black flex flex-col">
      {/* Geometric background */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute inset-0"
          style={{
            background: [
              'radial-gradient(ellipse at 30% 20%, rgba(0, 255, 255, 0.03), transparent 50%)',
              'radial-gradient(ellipse at 70% 80%, rgba(0, 7, 205, 0.05), transparent 50%)'
            ].join(', ')
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: [
              'linear-gradient(rgba(255, 255, 255, 0.04) 1px, transparent 1px)',
              'linear-gradient(90deg, rgba(255, 255, 255, 0.04) 1px, transparent 1px)'
            ].join(', '),
            backgroundSize: '80px 80px',
            mask: 'radial-gradient(ellipse at center, black 30%, transparent 70%)'
          }}
        />
      </div>

      {/* Step indicator */}
      <div className="relative z-10 flex justify-center gap-2 pt-12">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={`w-8 h-1 rounded-full transition-colors ${
              i === step ? 'bg-electric-cyan' : 'bg-border-mist-10'
            }`}
          />
        ))}
      </div>

      {/* Step content */}
      <div className="relative z-10 flex flex-col flex-1 min-h-0">
        {step === 0 && <WelcomeStep onNext={() => setStep(1)} />}
        {step === 1 && <ModelDownloadStep onNext={() => setStep(2)} />}
        {step === 2 && <WorkspaceStep onComplete={onComplete} />}
      </div>
    </div>
  )
}
