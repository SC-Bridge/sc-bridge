import React from 'react'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info?.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children

    const isChunkError =
      this.state.error?.name === 'ChunkLoadError' ||
      this.state.error?.message?.includes('Failed to fetch dynamically imported module') ||
      this.state.error?.message?.includes('Loading chunk')

    return (
      <div className="min-h-screen flex items-center justify-center bg-sc-dark text-gray-400">
        <div className="text-center p-8 space-y-4 max-w-sm">
          {isChunkError ? (
            <>
              <p className="text-white font-display tracking-wide">App Updated</p>
              <p className="text-sm">A new version is available. Reload to continue.</p>
            </>
          ) : (
            <>
              <p className="text-sc-danger font-display tracking-wide">Something went wrong</p>
              <p className="text-sm font-mono">{this.state.error?.message}</p>
            </>
          )}
          <button
            onClick={() => window.location.reload()}
            className="btn-primary mt-2"
          >
            Reload
          </button>
        </div>
      </div>
    )
  }
}
