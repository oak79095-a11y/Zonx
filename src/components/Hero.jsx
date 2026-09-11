export default function Hero({ searchQuery, onSearchChange, onSearch }) {
  return (
    <section className="hero hero-slim">
      <div className="container">
        <div className="search-bar">
          <input className="search-input" type="search" placeholder="ابحث: سيارة، هاتف، شقة..." value={searchQuery} onChange={e=>onSearchChange(e.target.value)} onKeyDown={e=>e.key==='Enter'&&onSearch()} />
          <button type="button" className="search-btn" onClick={onSearch}>بحث</button>
        </div>
      </div>
    </section>
  )
}
