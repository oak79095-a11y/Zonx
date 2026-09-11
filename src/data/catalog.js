export const categories = [
  { id: 'cars', name: 'سيارات ومركبات', icon: '🚗', description: 'سيارات، دراجات، شاحنات وقطع غيار', group: 'مركبات وعقارات' },
  { id: 'realestate', name: 'عقارات', icon: '🏢', description: 'شقق فلل أراضي ومحلات تجارية', group: 'مركبات وعقارات' },
  { id: 'mobiles', name: 'موبايلات وتابلت', icon: '📱', description: 'هواتف ذكية تابلت واكسسوارات', group: 'تقنية' },
  { id: 'electronics', name: 'إلكترونيات', icon: '💻', description: 'لابتوبات شاشات سماعات وأجهزة', group: 'تقنية' },
  { id: 'appliances', name: 'أجهزة كهربائية', icon: '🔌', description: 'ثلاجات غسالات تكييف وادوات', group: 'تقنية' },
  { id: 'men', name: 'موضة رجالية', icon: '👔', description: 'ملابس احذية وساعات رجالية', group: 'موضة وجمال' },
  { id: 'women', name: 'موضة نسائية', icon: '👗', description: 'ملابس حقائب ومستحضرات تجميل', group: 'موضة وجمال' },
  { id: 'beauty', name: 'جمال وعناية', icon: '💄', description: 'عطور عناية بالبشرة والشعر', group: 'موضة وجمال' },
  { id: 'kids', name: 'مستلزمات الاطفال', icon: '🧸', description: 'ملابس العاب ومستلزمات الامهات', group: 'عائلة' },
  { id: 'furniture', name: 'اثاث ومفروشات', icon: '🛋️', description: 'اغراض مطابخ مفروشات وديكور', group: 'منزل وحديقة' },
  { id: 'home', name: 'عام / منزل', icon: '🏠', description: 'اثاث عقارات خدمات واجهزة', group: 'منزل وحديقة' },
  { id: 'garden', name: 'حدائق ونباتات', icon: '🌱', description: 'نباتات ادوات زراعة وتزيين', group: 'منزل وحديقة' },
  { id: 'jobs', name: 'وظائف', icon: '💼', description: 'فرص عمل بدوام كامل او جزئي', group: 'خدمات ووظائف' },
  { id: 'services', name: 'خدمات', icon: '🛠️', description: 'صيانة تعليم نقل وخدمات اخرى', group: 'خدمات ووظائف' },
  { id: 'courses', name: 'دورات وتعليم', icon: '📚', description: 'دروس خصوصية ودورات تدريبية', group: 'خدمات ووظائف' },
  { id: 'sports', name: 'رياضة ولياقة', icon: '⚽', description: 'ادوات رياضية دراجات ومشي', group: 'ترفيه وهوايات' },
  { id: 'games', name: 'ألعاب وهوايات', icon: '🎮', description: 'العاب فيديو هوايات ومقتنيات', group: 'ترفيه وهوايات' },
  { id: 'animals', name: 'حيوانات وطيور', icon: '🐾', description: 'قطط كلاب طيور ومستلزماتها', group: 'ترفيه وهوايات' },
  { id: 'food', name: 'طعام ومنتجات', icon: '🍎', description: 'مواد غذائية منزلية ومنتجات محلية', group: 'أخرى' },
  { id: 'handmade', name: 'صناعات يدوية', icon: '🎨', description: 'منتجات حرفية وأعمال فنية', group: 'أخرى' },
]

export const categoryGroups = [...new Set(categories.map(c => c.group))]

export const cities = [
  { id: 'damascus', name: 'دمشق' },
  { id: 'aleppo', name: 'حلب' },
  { id: 'homs', name: 'حمص' },
  { id: 'latakia', name: 'اللاذقية' },
  { id: 'hama', name: 'حماة' },
  { id: 'tartus', name: 'طرطوس' },
  { id: 'daraa', name: 'درعا' },
]

export const cityName = (id) => cities.find((c) => c.id === id)?.name ?? id

export const categoryName = (id) =>
  categories.find((c) => c.id === id)?.name ?? id

export const categoryIcon = (id) => categories.find((c) => c.id === id)?.icon ?? ''
