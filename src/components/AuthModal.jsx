import React, { useMemo, useState } from 'react'
import {
  LEGAL_DOCUMENT_VERSION,
  PRIVACY_PATH,
  TERMS_PATH
} from '../utils/legal.js'

const initialFormState = {
  name: '',
  email: '',
  password: '',
  company: '',
  legalAccepted: false
}

const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
const normalizeEmail = (value) => value.trim().toLowerCase()
const normalizeName = (value) => value.trim().replace(/\s+/g, ' ')

const getPasswordChecks = (password) => ({
  length: password.length >= 10 && password.length <= 128,
  letter: /[A-Za-z]/.test(password),
  number: /\d/.test(password),
  symbol: /[^A-Za-z0-9]/.test(password)
})

const AuthForm = ({
  mode = 'login',
  onModeChange,
  onSubmit,
  isSubmitting = false,
  errorMessage = ''
}) => {
  const [formState, setFormState] = useState(initialFormState)
  const [validationMessage, setValidationMessage] = useState('')
  const [isPasswordVisible, setIsPasswordVisible] = useState(false)

  const isSignup = mode === 'signup'
  const passwordChecks = useMemo(() => getPasswordChecks(formState.password), [formState.password])
  const passedPasswordChecks = Object.values(passwordChecks).filter(Boolean).length
  const title = isSignup ? 'Sign up' : 'Log in'

  const handleChange = (event) => {
    const { checked, name, type, value } = event.target
    setFormState((current) => ({
      ...current,
      [name]: type === 'checkbox' ? checked : value
    }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (formState.company.trim()) {
      setValidationMessage('Unable to submit this request.')
      return
    }

    const payload = {
      name: normalizeName(formState.name),
      email: normalizeEmail(formState.email),
      password: formState.password,
      legalAccepted: formState.legalAccepted,
      legalVersion: LEGAL_DOCUMENT_VERSION
    }

    if (isSignup && (payload.name.length < 2 || payload.name.length > 80)) {
      setValidationMessage('Name must be between 2 and 80 characters.')
      return
    }

    if (!isValidEmail(payload.email)) {
      setValidationMessage('Enter a valid email address.')
      return
    }

    if (payload.password.length < 8 || payload.password.length > 128) {
      setValidationMessage('Password must be between 8 and 128 characters.')
      return
    }

    if (isSignup && passedPasswordChecks < 3) {
      setValidationMessage('Use a stronger password before creating the account.')
      return
    }

    if (isSignup && !payload.legalAccepted) {
      setValidationMessage('Accept the Terms of Service and Privacy Policy before creating the account.')
      return
    }

    setValidationMessage('')

    const isSuccessful = await onSubmit?.(payload)

    if (isSuccessful) {
      setFormState(initialFormState)
      setIsPasswordVisible(false)
    }
  }

  const switchMode = (nextMode) => {
    setFormState(initialFormState)
    setValidationMessage('')
    setIsPasswordVisible(false)
    onModeChange?.(nextMode)
  }

  return (
    <section className="auth-card" aria-labelledby="auth-title">
      <div className="auth-card-header">
        <h2 id="auth-title">{title}</h2>
      </div>

      <div className="auth-mode-switch" aria-label="Choose account mode">
        <button
          type="button"
          className={mode === 'login' ? 'is-active' : ''}
          onClick={() => switchMode('login')}
        >
          Log in
        </button>
        <button
          type="button"
          className={mode === 'signup' ? 'is-active' : ''}
          onClick={() => switchMode('signup')}
        >
          Sign up
        </button>
      </div>

      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <input
          className="auth-honeypot"
          type="text"
          name="company"
          value={formState.company}
          onChange={handleChange}
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
        />

        {isSignup && (
          <label className="auth-field">
            <span>Name</span>
            <input
              type="text"
              name="name"
              value={formState.name}
              onChange={handleChange}
              placeholder="Display name"
              autoComplete="name"
              maxLength={80}
              required
            />
          </label>
        )}

        <label className="auth-field">
          <span>Email</span>
          <input
            type="email"
            name="email"
            value={formState.email}
            onChange={handleChange}
            placeholder="you@example.com"
            autoComplete="email"
            inputMode="email"
            required
          />
        </label>

        <label className="auth-field">
          <span>Password</span>
          <div className="auth-password-shell">
            <input
              type={isPasswordVisible ? 'text' : 'password'}
              name="password"
              value={formState.password}
              onChange={handleChange}
              placeholder={isSignup ? '10+ characters' : 'Your password'}
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              minLength={8}
              maxLength={128}
              required
            />
            <button
              type="button"
              onClick={() => setIsPasswordVisible((visible) => !visible)}
              aria-label={isPasswordVisible ? 'Hide password' : 'Show password'}
            >
              {isPasswordVisible ? 'Hide' : 'Show'}
            </button>
          </div>
        </label>

        {isSignup && (
          <div className="auth-password-meter" aria-label={`${passedPasswordChecks} of 4 password checks passed`}>
            <div className="auth-password-bars" aria-hidden="true">
              {Object.entries(passwordChecks).map(([key, isPassed]) => (
                <span key={key} className={isPassed ? 'is-passed' : ''} />
              ))}
            </div>
          </div>
        )}

        {isSignup && (
          <label className="auth-legal-consent">
            <input
              type="checkbox"
              name="legalAccepted"
              checked={formState.legalAccepted}
              onChange={handleChange}
              required
            />
            <span>
              I agree to the <a href={TERMS_PATH}>Terms of Service</a> and <a href={PRIVACY_PATH}>Privacy Policy</a>.
            </span>
          </label>
        )}

        {(validationMessage || errorMessage) && (
          <p className="auth-error" role="alert">
            {validationMessage || errorMessage}
          </p>
        )}

        <button type="submit" className="auth-submit" disabled={isSubmitting}>
          {isSubmitting ? 'Checking...' : isSignup ? 'Create account' : 'Log in'}
        </button>
      </form>

    </section>
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
    <div className="auth-ambient" aria-hidden="true" />

    <div className="auth-layout">
      <AuthForm
        mode={mode}
        onModeChange={onModeChange}
        onSubmit={onSubmit}
        isSubmitting={isSubmitting}
        errorMessage={errorMessage}
      />
    </div>
  </div>
)
