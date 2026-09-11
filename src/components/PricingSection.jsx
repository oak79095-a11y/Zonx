export default function PricingSection({ onPostAd }) {
  const plans = [
    {
      name: 'إعلان عادي',
      desc: 'مجاني للأفراد',
      price: 0,
      free: true,
      features: [
        'نشر إعلان واحد مجاناً',
        'ظهور ضمن التصنيف والمدينة الصحيحين',
        'مدة العرض 30 يوم',
        'إرفاق صورة ورقم تواصل',
      ],
      cta: 'انشر إعلانك مجاناً',
      featured: false,
    },
    {
      name: 'إعلان مميز',
      desc: 'ظهور أعلى القوائم',
      price: 75000,
      free: false,
      features: [
        'كل مزايا الإعلان العادي',
        'وسام "مميز" برتقالي بارز',
        'تصدّر نتائج البحث في تصنيفك',
        'نسبة مشاهدة أعلى حتى 5 أضعاف',
        'الدفع عند الاستلام أو عبر مكتب صرافة',
      ],
      cta: 'ميّز إعلانك',
      featured: true,
    },
    {
      name: 'اشتراك الأعمال',
      desc: 'للمحلات والتجار شهرياً',
      price: 250000,
      free: false,
      features: [
        'نشر إعلانات غير محدودة',
        'تصنيف خاص باسم محلّك',
        'إعلاناتك تظهر دائماً ضمن الأعلى',
        'إحصائيات المشاهدات الشهرية',
        'أولوية في خدمة العملاء',
      ],
      cta: 'اشترك الآن',
      featured: false,
    },
  ]

  return (
    <section className="section">
      <div className="container">
        <div className="section-head">
          <div>
            <h2 className="section-title">خطط الإعلان</h2>
            <p className="section-sub">
              ابدأ مجاناً، وميّز إعلانك بسعر رمزي بالليرة السورية
            </p>
          </div>
        </div>

        <div className="plans-grid">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`plan-card ${plan.featured ? 'featured' : ''}`}
            >
              <h3 className="plan-name">{plan.name}</h3>
              <p className="plan-desc">{plan.desc}</p>
              <div className={`plan-price ${plan.free ? 'free' : ''}`}>
                {plan.free ? (
                  <span className="free-note">مجاناً</span>
                ) : (
                  <>
                    {plan.price.toLocaleString('en-US')}{' '}
                    <span className="currency">ل.س / شهرياً</span>
                  </>
                )}
              </div>
              <ul className="plan-features">
                {plan.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              <button type="button" className="btn btn-primary" onClick={onPostAd}>
                {plan.cta}
              </button>
            </div>
          ))}
        </div>

        <div className="payment-strip">
          <div className="payment-item">
            <span className="pay-icon" aria-hidden="true">💵</span>
            الدفع عند الاستلام
          </div>
          <div className="payment-item">
            <span className="pay-icon" aria-hidden="true">🏦</span>
            تحويل عبر مكاتب الصرف المحلية
          </div>
          <div className="payment-item">
            <span className="pay-icon" aria-hidden="true">🛡️</span>
            بدون بوابات دفع إلكترونية — الثقة وجهةً لوجهة
          </div>
        </div>
      </div>
    </section>
  )
}