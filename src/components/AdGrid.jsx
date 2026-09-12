import { categories, cities, cityName, categoryName } from '../data/catalog.js'
import AdCard from './AdCard.jsx'

function SkeletonCard() {
  return (
    <div className="skel-card">
      <div className="skel-media" />
      <div className="skel-body">
        <div className="skel-line w60" />
        <div className="skel-line w80" />
        <div className="skel-line w40" />
      </div>
    </div>
  )
}

export default function AdGrid({ ads, category, city, activeCategory, loading, onCategoryChange, onCityChange, onOpen, onResetFilters, onAvatar, userId, hasMore, onLoadMore }) {
  const hasFilters = activeCategory !== null || city !== 'all'
  return (
    <section className="section">
      <div className="container">
        <div className="section-head" style={{textAlign:'center'}}>
          <h2 className="section-title">{activeCategory ? categoryName(activeCategory) : 'احدث الاعلانات'}</h2>
          <div className="red-line small" style={{margin:'8px auto 0'}}></div>
          <p className="section-sub">{city !== 'all' ? `في ${cityName(city)}` : 'كل المدن'} - {ads.length} اعلان</p>
        </div>

        <div className="filter-bar" style={{justifyContent:'center'}}>
          <span className="filter-label">فلتر:</span>
          <button type="button" className={`chip ${category === null ? 'active' : ''}`} onClick={() => onCategoryChange(null)}>الكل</button>
          {categories.map((c) => (
            <button key={c.id} type="button" className={`chip ${category === c.id ? 'active' : ''}`} onClick={() => onCategoryChange(c.id)}>{c.name}</button>
          ))}
          <select className="city-select" value={city} onChange={(e) => onCityChange(e.target.value)} aria-label="المدينة">
            <option value="all">كل المدن</option>
            {cities.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
          </select>
        </div>

        {loading ? (
          <div className="feed">
            {[0, 1, 2].map(i => <SkeletonCard key={i} />)}
          </div>
        ) : ads.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon" aria-hidden="true">🔍</span>
            <h3>لا توجد اعلانات</h3>
            <p>جرب تغيير الفلاتر او اعد الضبط لعرض كل الاعلانات.</p>
            {hasFilters && (
              <button type="button" className="btn btn-outline" onClick={onResetFilters}>اعادة ضبط الفلاتر</button>
            )}
          </div>
        ) : (
          <>
            <div className="feed">
              {ads.map((ad) => (<AdCard key={ad.id} ad={ad} userId={userId} onClick={onOpen} onAvatar={onAvatar} />))}
            </div>
            {hasMore && (
              <div style={{textAlign:'center', marginTop:'20px'}}>
                <button type="button" className="btn btn-outline" onClick={onLoadMore} disabled={loading}>
                  {loading ? 'جاري التحميل...' : 'عرض المزيد'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}
