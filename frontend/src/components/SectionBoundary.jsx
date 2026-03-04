import React from 'react'
import { AlertTriangle } from 'lucide-react'

export default class SectionBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[SectionBoundary]', this.props.label || 'unknown', error, info?.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="panel p-6 text-center space-y-2">
        <AlertTriangle className="w-6 h-6 text-sc-warn mx-auto" />
        <p className="text-sm text-gray-400">
          {this.props.label || 'This section'} failed to render
        </p>
        <button
          onClick={() => this.setState({ error: null })}
          className="text-xs text-sc-accent hover:underline"
        >
          Try again
        </button>
      </div>
    )
  }
}
