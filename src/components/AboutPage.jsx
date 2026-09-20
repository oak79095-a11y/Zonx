import { ArrowBackIcon } from './icons.jsx'

export default function AboutPage({ onBack }) {
  return (
    <section className="about-page">
      <div className="about-orbit about-orbit-one" />
      <div className="about-orbit about-orbit-two" />
      <div className="about-inner">
        <button type="button" className="about-back" onClick={onBack} aria-label="رجوع" title="رجوع">
          <ArrowBackIcon size={19} />
        </button>
        <div className="about-mark-wrap">
          <span className="zonx-icon" aria-hidden="true"><span className="zonx-icon-x">✕</span></span>
          <span className="zonx-wordmark">ZON<span className="zonx-x">X</span></span>
        </div>
        <div className="about-divider" />
        <div className="about-tiles" aria-hidden="true">
          <span>✦</span><span>⌁</span><span>◌</span>
        </div>
        <span className="about-version">الإصدار 1.0</span>
      </div>
    </section>
  )
}
