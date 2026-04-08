import { Search } from 'lucide-react'

interface SearchInputProps {
  value: string
  onChange: (value: string) => void
}

export default function SearchInput({ value, onChange }: SearchInputProps): React.JSX.Element {
  return (
    <div className="relative px-3 pt-3">
      <Search className="absolute left-5 top-1/2 mt-1.5 -translate-y-1/2 text-text-tertiary" size={14} />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search conversations..."
        data-search-input
        className="w-full bg-transparent border border-border-mist-10 rounded-default text-sm text-text-primary pl-8 pr-3 py-2 placeholder:text-text-tertiary outline-none focus:border-signal-blue transition-colors"
      />
    </div>
  )
}
