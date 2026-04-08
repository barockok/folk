export default function TitleBar(): React.JSX.Element {
  return (
    <div
      className="h-10 bg-pure-black border-b border-border-mist-06 flex items-center justify-center relative"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* macOS traffic light spacer */}
      <div className="absolute left-0 w-[80px]" />
      <span className="text-sm font-medium text-text-secondary tracking-wide">Folk</span>
    </div>
  )
}
