import React from 'react'

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, errorInfo) {
    console.error('App render failed:', error, errorInfo)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <main className="app-error-shell">
        <section className="app-error-card">
          <p>Playback route recovered</p>
          <h1>Something failed while opening this page.</h1>
          <button type="button" onClick={() => window.location.replace('/')}>
            Back home
          </button>
        </section>
      </main>
    )
  }
}

export default AppErrorBoundary
