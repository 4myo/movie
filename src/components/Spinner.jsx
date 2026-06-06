import React from 'react'

const Spinner = ({ label = 'Loading' }) => {
  return (
    <div className="stream-spinner" role="status" aria-live="polite">
      <span className="stream-spinner-mark" aria-hidden="true">
        <span />
      </span>
      <span className="stream-spinner-label">{label}</span>
    </div>
  )
}

export default Spinner
