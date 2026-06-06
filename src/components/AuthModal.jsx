import React, { useMemo, useRef, useState } from 'react'
import { VideoCameraIcon } from './Icons.jsx'
import {
  LEGAL_DOCUMENT_VERSION,
  privacySections,
  termsSections
} from '../utils/legal.js'

const initialFormState = {
  name: '',
  email: '',
  password: '',
  company: '',
  legalAccepted: false,
  trustDevice: true
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
  const [isLegalModalOpen, setIsLegalModalOpen] = useState(false)
  const [hasScrolledLegal, setHasScrolledLegal] = useState(false)
  const legalScrollRef = useRef(null)
  const legalBottomRef = useRef(null)

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
      legalVersion: LEGAL_DOCUMENT_VERSION,
      trustDevice: formState.trustDevice
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
    setIsLegalModalOpen(false)
    setHasScrolledLegal(false)
    onModeChange?.(nextMode)
  }

  const openLegalModal = () => {
    setHasScrolledLegal(false)
    setIsLegalModalOpen(true)
    window.setTimeout(() => {
      if (legalScrollRef.current) {
        legalScrollRef.current.scrollTop = 0
        legalScrollRef.current.focus({ preventScroll: true })
      }
    }, 0)
  }

  const closeLegalModal = () => {
    setIsLegalModalOpen(false)
  }

  const handleLegalScroll = (event) => {
    const target = event.currentTarget
    const bottomMarker = legalBottomRef.current
    const isAtBottom = bottomMarker
      ? bottomMarker.getBoundingClientRect().bottom <= target.getBoundingClientRect().bottom + 24
      : target.scrollTop + target.clientHeight >= target.scrollHeight - 120

    if (isAtBottom) {
      setHasScrolledLegal(true)
    }
  }

  const acceptLegalTerms = () => {
    if (!hasScrolledLegal) return

    setFormState((current) => ({
      ...current,
      legalAccepted: true
    }))
    setValidationMessage('')
    setIsLegalModalOpen(false)
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

        <label className="auth-trust-device">
          <input
            type="checkbox"
            name="trustDevice"
            checked={formState.trustDevice}
            onChange={handleChange}
          />
          <span>Trust this device for 30 days</span>
        </label>

        {isSignup && (
          <label className="auth-legal-consent">
            <input
              type="checkbox"
              name="legalAccepted"
              checked={formState.legalAccepted}
              onChange={(event) => {
                if (!event.target.checked) {
                  handleChange(event)
                  return
                }

                openLegalModal()
              }}
              required
            />
            <span>
              {formState.legalAccepted ? 'Terms and Privacy accepted.' : 'Review and accept the Terms of Service and Privacy Policy.'}
              {' '}
              <button type="button" onClick={openLegalModal}>
                {formState.legalAccepted ? 'Review again' : 'Open terms'}
              </button>
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

      {isSignup && isLegalModalOpen && (
        <div className="auth-legal-modal-backdrop" role="presentation">
          <section className="auth-legal-modal" role="dialog" aria-modal="true" aria-labelledby="auth-legal-title">
            <div className="auth-legal-modal-header">
              <div>
                <p>Required review</p>
                <h3 id="auth-legal-title">Terms & Privacy</h3>
              </div>
              <button type="button" onClick={closeLegalModal} aria-label="Close legal review">
                ×
              </button>
            </div>

            <div
              className="auth-legal-modal-scroll custom-scrollbar"
              ref={legalScrollRef}
              onScroll={handleLegalScroll}
              tabIndex={0}
            >
              <h4>Terms of Service</h4>
              {termsSections.map((section, index) => (
                <article key={`terms-${section.title}`}>
                  <h5>{index + 1}. {section.title}</h5>
                  <p>{section.body}</p>
                </article>
              ))}

              <h4>Privacy Policy</h4>
              {privacySections.map((section, index) => (
                <article key={`privacy-${section.title}`}>
                  <h5>{index + 1}. {section.title}</h5>
                  <p>{section.body}</p>
                </article>
              ))}
              <div className="auth-legal-modal-bottom" ref={legalBottomRef}>
                End of Terms and Privacy Policy
              </div>
            </div>

            <div className="auth-legal-modal-actions">
              <span>{hasScrolledLegal ? 'Ready to accept' : 'Scroll to the bottom to enable acceptance'}</span>
              <button type="button" onClick={acceptLegalTerms} disabled={!hasScrolledLegal}>
                Accept and continue
              </button>
            </div>
          </section>
        </div>
      )}

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
    <div className="auth-shape auth-shape-one" aria-hidden="true" />
    <div className="auth-shape auth-shape-two" aria-hidden="true" />

    <div className="auth-layout">
      <section className="auth-welcome-panel" aria-label="Movieslo welcome">
        <div className="auth-brand-mark">
          <VideoCameraIcon className="auth-brand-icon" />
        </div>
        <p className="auth-brand-kicker">Movieslo</p>
        <h1>Find your next favorite watch.</h1>
        <p className="auth-brand-copy">
          Browse movies and shows, keep your favorites close, and return to titles you were already watching.
        </p>
        <div className="auth-brand-points" aria-label="Movieslo highlights">
          <span>Movie discovery</span>
          <span>Saved favorites</span>
          <span>Watch history</span>
        </div>
      </section>

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
