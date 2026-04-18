import React, { useMemo, useState } from 'react'

const initialFormState = {
  name: '',
  email: '',
  password: ''
}

const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

const AuthForm = ({
  mode = 'login',
  onModeChange,
  onSubmit,
  isSubmitting = false,
  errorMessage = ''
}) => {
  const [formState, setFormState] = useState(initialFormState)
  const [validationMessage, setValidationMessage] = useState('')

  const title = useMemo(
    () => (mode === 'signup' ? 'Create your account' : 'Welcome back'),
    [mode]
  )

  const copy = useMemo(
    () => (mode === 'signup'
      ? 'Create an account to sync favorites and recently watched titles across visits while guest browsing stays open to everyone.'
      : 'Log in to restore your favorites and recently watched titles. You can still browse the catalog without an account.'),
    [mode]
  )

  const handleChange = (event) => {
    const { name, value } = event.target
    setFormState((current) => ({
      ...current,
      [name]: value
    }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    const payload = {
      name: formState.name.trim(),
      email: formState.email.trim(),
      password: formState.password
    }

    if (mode === 'signup' && (payload.name.length < 2 || payload.name.length > 80)) {
      setValidationMessage('Name must be between 2 and 80 characters')
      return
    }

    if (!isValidEmail(payload.email)) {
      setValidationMessage('Enter a valid email address')
      return
    }

    if (payload.password.length < 8 || payload.password.length > 128) {
      setValidationMessage('Password must be between 8 and 128 characters')
      return
    }

    if (!/[A-Za-z]/.test(payload.password) || !/\d/.test(payload.password)) {
      setValidationMessage('Password must include at least one letter and one number')
      return
    }

    setValidationMessage('')

    const isSuccessful = await onSubmit?.(payload)

    if (isSuccessful) {
      setFormState(initialFormState)
    }
  }

  const switchMode = (nextMode) => {
    setFormState(initialFormState)
    setValidationMessage('')
    onModeChange?.(nextMode)
  }

  return (
    <>
      <div className="auth-modal-header">
        <div>
          <p className="auth-modal-kicker">Account access</p>
          <h2 className="auth-modal-title">{title}</h2>
          <p className="auth-modal-copy">{copy}</p>
        </div>
      </div>

      <div className="auth-modal-tabs">
        <button
          type="button"
          className={`auth-modal-tab ${mode === 'login' ? 'is-active' : ''}`}
          onClick={() => switchMode('login')}
        >
          Log in
        </button>
        <button
          type="button"
          className={`auth-modal-tab ${mode === 'signup' ? 'is-active' : ''}`}
          onClick={() => switchMode('signup')}
        >
          Sign up
        </button>
      </div>

      <form className="auth-modal-form" onSubmit={handleSubmit}>
        {mode === 'signup' && (
          <label className="auth-modal-field">
            <span>Name</span>
            <input
              type="text"
              name="name"
              value={formState.name}
              onChange={handleChange}
              placeholder="Your display name"
              autoComplete="name"
            />
          </label>
        )}

        <label className="auth-modal-field">
          <span>Email</span>
          <input
            type="email"
            name="email"
            value={formState.email}
            onChange={handleChange}
            placeholder="you@example.com"
            autoComplete="email"
            required
          />
        </label>

        <label className="auth-modal-field">
          <span>Password</span>
          <input
            type="password"
            name="password"
            value={formState.password}
            onChange={handleChange}
            placeholder="Minimum 8 characters"
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            minLength={8}
            required
          />
        </label>

        {(validationMessage || errorMessage) && <p className="auth-modal-error">{validationMessage || errorMessage}</p>}

        <button type="submit" className="auth-modal-submit" disabled={isSubmitting}>
          {isSubmitting ? 'Please wait...' : mode === 'signup' ? 'Create account' : 'Log in'}
        </button>
      </form>
    </>
  )
}

export const AuthPage = ({
  mode = 'login',
  onModeChange,
  onSubmit,
  isSubmitting = false,
  errorMessage = ''
}) => (
  <div className="auth-page-shell">
    <div className="auth-page-grid">
      <section className="auth-page-panel auth-page-copy-panel">
        <p className="auth-page-kicker">Personal memory only</p>
        <h1 className="auth-page-title">Keep favorites and watch history synced without blocking guest browsing.</h1>
        <p className="auth-page-copy">
          Browse movies and TV shows freely without an account. Sign in only if you want your favorites and recently watched titles to persist across sessions and devices.
        </p>
        <div className="auth-page-benefits">
          <p>Save favorites and watchlist picks.</p>
          <p>Continue recently watched titles later.</p>
          <p>Leave the main catalog fully open to guests.</p>
        </div>
      </section>

      <section className="auth-page-panel auth-page-form-panel">
        <AuthForm
          mode={mode}
          onModeChange={onModeChange}
          onSubmit={onSubmit}
          isSubmitting={isSubmitting}
          errorMessage={errorMessage}
        />
      </section>
    </div>
  </div>
)
