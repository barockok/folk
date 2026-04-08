import { Component, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Folk Error Boundary:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-screen bg-void-black text-text-primary p-8">
          <AlertTriangle size={48} className="text-warning mb-4" />
          <h1 className="text-xl font-medium mb-2">Something went wrong</h1>
          <p className="text-sm text-text-secondary mb-4 max-w-md text-center">
            Folk encountered an unexpected error. Your conversations are safe.
          </p>
          {this.state.error && (
            <pre className="text-xs font-mono text-text-muted bg-pure-black border border-border-mist-08 rounded-default p-4 mb-6 max-w-lg overflow-x-auto">
              {this.state.error.message}
            </pre>
          )}
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null })
              window.location.reload()
            }}
            className="flex items-center gap-2 px-4 py-2 bg-white text-black text-sm font-medium rounded-default hover:bg-white/90 transition-colors"
          >
            <RefreshCw size={14} />
            Reload Folk
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
