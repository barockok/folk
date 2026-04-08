interface WelcomeStepProps {
  onNext: () => void
}

export default function WelcomeStep({ onNext }: WelcomeStepProps): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center flex-1 px-6">
      <h1 className="text-5xl font-semibold text-text-primary" style={{ lineHeight: 0.87 }}>
        Folk
      </h1>
      <p className="text-lg text-text-secondary mt-4 mb-8">
        Your AI assistant. Entirely local.
      </p>
      <button
        onClick={onNext}
        className="bg-white text-black px-8 py-3 rounded-default font-medium hover:bg-white/90 transition-colors cursor-pointer"
      >
        Get Started
      </button>
    </div>
  )
}
