import {
  LEGAL_DOCUMENT_VERSION,
  legalDisclaimer,
  privacySections,
  termsSections
} from '../utils/legal.js'

const documents = {
  terms: {
    eyebrow: 'Legal',
    title: 'Terms of Service',
    intro: 'These terms explain the rules for using Movieslo as a movie discovery demo.',
    sections: termsSections
  },
  privacy: {
    eyebrow: 'Privacy',
    title: 'Privacy Policy',
    intro: 'This policy explains how Movieslo may collect, use, and store information.',
    sections: privacySections
  }
}

const LegalPage = ({ type = 'terms', onBackHome }) => {
  const document = documents[type] || documents.terms

  return (
    <section className="legal-page" aria-labelledby="legal-page-title">
      <div className="legal-page-inner">
        <div className="legal-page-header">
          <p>{document.eyebrow}</p>
          <h1 id="legal-page-title">{document.title}</h1>
          <span>Version {LEGAL_DOCUMENT_VERSION}</span>
        </div>

        <div className="legal-disclaimer" role="note">
          {legalDisclaimer}
        </div>

        <p className="legal-intro">{document.intro}</p>

        <div className="legal-section-list">
          {document.sections.map((section, index) => (
            <article key={section.title} className="legal-section">
              <h2>{index + 1}. {section.title}</h2>
              <p>{section.body}</p>
            </article>
          ))}
        </div>

        <div className="legal-actions">
          <a href="/terms">Terms</a>
          <a href="/privacy">Privacy</a>
          <button type="button" onClick={onBackHome}>Back home</button>
        </div>
      </div>
    </section>
  )
}

export default LegalPage
