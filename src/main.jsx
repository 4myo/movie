import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import AppErrorBoundary from './components/AppErrorBoundary.jsx'

const installPassiveScrollListenerDefaults = () => {
  const scrollBlockingEvents = new Set(['touchstart', 'touchmove', 'wheel', 'mousewheel'])
  const originalAddEventListener = EventTarget.prototype.addEventListener

  EventTarget.prototype.addEventListener = function addEventListenerWithPassiveDefault(type, listener, options) {
    if (!scrollBlockingEvents.has(type)) {
      return originalAddEventListener.call(this, type, listener, options)
    }

    if (options === undefined) {
      return originalAddEventListener.call(this, type, listener, { passive: true })
    }

    if (typeof options === 'boolean') {
      return originalAddEventListener.call(this, type, listener, { capture: options, passive: true })
    }

    return originalAddEventListener.call(this, type, listener, options)
  }
}

const hidePassiveListenerViolationWarnings = () => {
  const originalConsoleWarn = window.console.warn.bind(window.console)

  window.console.warn = (...args) => {
    const message = String(args[0] || '')
    const isPassiveListenerViolation =
      message.includes('[Violation]') &&
      message.includes('Added non-passive event listener') &&
      message.includes('scroll-blocking')

    if (isPassiveListenerViolation) return

    originalConsoleWarn(...args)
  }
}

installPassiveScrollListenerDefaults()
hidePassiveListenerViolationWarnings()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </AppErrorBoundary>
  </StrictMode>
)
