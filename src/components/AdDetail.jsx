import { useState, useEffect } from 'react'
import { categoryName, cityName } from '../data/catalog.js'
import { formatPrice, formatDate } from '../data/format.js'
import { ArrowBackIcon } from './icons.jsx'

export default function AdDetail({ ad, onBack }) {
  const [active, setActive] = useState(0)

  useEffect(() => { setActive(0) }, [ad && ad.id])

  const isVideoExt = (p) => /\.(mp4|webm|mov|m4v)$/i.test(p)
  const allMedia = ad ? ((ad.images && ad.images.length ? ad.images : (ad.image ? [ad.image] : [])).filter(Boolean)) : []
  const videoUrl = ad ? (ad.video || allMedia.find(isVideoExt) || null) : null
  const imgs = allMedia.filter((p) => !isVideoExt(p))
  const slides = [
    ...(videoUrl ? [{ type: 'video', src: videoUrl }] : []),
    ...imgs.map((src) => ({ type: 'image', src })),
  ]
  const hasGallery = slides.length > 1
  const current = slides[active] || null

  useEffect(() => {
    if (!hasGallery) return
    const onKey = (e) => {
      if (e.key === 'ArrowLeft') setActive(i => (i + 1) % slides.length)
      if (e.key === 'ArrowRight') setActive(i => (i - 1 + slides.length) % slides.length)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!ad) return null

  return (
    <section className="section">
      <div className="container">
        <button type="button" className="back-btn" onClick={onBack} aria-label="رجوع" title="رجوع"><ArrowBackIcon size={20} /></button>
        <div className="detail-card fade-in">
          <div className="detail-layout">
            <div className="detail-gallery">
              {slides.length > 0 ? (
                <>
                  <div className="detail-main-img">
                    {current.type === 'video' ? (
                      <video key={current.src} src={current.src} controls preload="metadata" />
                    ) : (
                      <img key={current.src} src={current.src} alt={ad.title} />
                    )}
                    {hasGallery && <span className="gallery-counter">{active + 1} / {slides.length}</span>}
                  </div>
                  {hasGallery && (
                    <div className="detail-thumbs">
                      {slides.map((s, i) => (
                        <button
                          key={i}
                          type="button"
                          className={'detail-thumb' + (i === active ? ' active' : '')}
                          onClick={() => setActive(i)}
                          aria-label={s.type === 'video' ? 'فيديو' : `صورة ${i + 1}`}
                        >
                          {s.type === 'video' ? (
                            <span style={{ display: 'grid', placeItems: 'center', width: '100%', height: '100%', fontSize: '22px' }}>▶</span>
                          ) : (
                            <img src={s.src} alt="" loading="lazy" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="detail-main-img">
                  <div className="placeholder large" aria-hidden="true"><span className="placeholder-text">لا صورة</span></div>
                </div>
              )}
            </div>
            <div className="detail-info">
              {ad.featured && <span className="featured-badge" style={{position:'static', display:'inline-block', marginBottom:'8px'}}>مميز</span>}
              <h2>{ad.title}</h2>
              <div className="red-line small" style={{margin:'10px 0'}}></div>
              <div className="detail-meta">
                <span>{cityName(ad.city)}</span>
                <span className="dot" />
                <span>{categoryName(ad.category)}</span>
                <span className="dot" />
                <span>{formatDate(ad.date)}</span>
              </div>
              <div className="detail-price">{formatPrice(ad.price)} <span className="sep">ل.س</span></div>
              <p className="detail-desc">{ad.description}</p>
              {ad.phone ? (
                <div className="detail-contact">
                  <a className="btn btn-primary" href={`tel:${ad.phone}`}>اتصال: {ad.phone}</a>
                  <button type="button" className="btn btn-green" onClick={() => window.open(`https://wa.me/${ad.phone.replace(/^0/, '963')}`, '_blank', 'noopener,noreferrer')}>واتساب</button>
                </div>
              ) : <p className="section-sub">لا يوجد رقم تواصل لهذا الإعلان</p>}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
