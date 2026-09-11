import { categories } from '../data/catalog.js'

export default function CategoryCards({ onSelect, ads = [] }) {
  return (
    <section className="section">
      <div className="container">
        <div className="section-head" style={{textAlign:'center', marginTop:'16px', marginBottom:'18px'}}>
          <h2 className="section-title">التصنيفات</h2>
          <div className="red-line small" style={{margin:'8px auto 0'}}></div>
          <p className="section-sub">اختر تصنيفا</p>
        </div>
        <div className="category-grid">
          {categories.map((cat) => {
            const count = ads.filter((a) => a.category === cat.id).length
            return (
              <button key={cat.id} type="button" className="category-card w-full text-start" onClick={() => onSelect(cat.id)}>
                <span className="cat-icon" aria-hidden="true">{cat.icon}</span>
                <h3>{cat.name}</h3>
                <p>{cat.description}</p>
                <span className="cat-count">{count} اعلان</span>
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}
