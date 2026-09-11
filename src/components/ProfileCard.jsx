import TiltCard from './TiltCard.jsx'

export default function ProfileCard({ name, role, bio, avatar, stats, socials }) {
  const defaultAvatar = 'ب'
  const defaultStats = [
    { label: 'إعلانات', value: '2,847' },
    { label: 'متابعين', value: '12.4K' },
    { label: 'تقييم', value: '4.9 ⭐' },
  ]
  const displayStats = stats || defaultStats

  const defaultSocials = [
    { label: 'واتساب', icon: '💬', href: '#' },
    { label: 'إعلانات', icon: '📢', href: '#' },
    { label: 'تقييمات', icon: '⭐', href: '#' },
  ]
  const displaySocials = socials || defaultSocials

  return (
    <TiltCard
      tiltMax={12}
      scale={1.02}
      perspective={1200}
      className="w-full max-w-sm mx-auto"
    >
      <div className="glass-dark rounded-2xl overflow-hidden shadow-2xl glow-hover">
        <div className="relative h-28 bg-gradient-to-br from-orange-700 via-orange-500 to-orange-400 overflow-hidden">
          <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'url("data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjYwIiBoZWlnaHQ9IjYwIiBmaWxsPSJub25lIi8+PHBhdGggZD0iTTAgMGw2MCA2ME0wIDIwTjYwIDAiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS13aWR0aD0iMSIgb3ZlcmZsb3d0cmFuc2Zvcm09InJvdGF0ZSg0NSkiIHN0cm9rZS1saW5lY2FwPSJyc3MiIHN0cm9rZS1ib3VuZGluZz0icmVzdHJhIiBmbGF0Z2xlY2FwPSJyc3MiLz48cGF0aCBkPSJNMCAzMG02MCAweiIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLXdpZHRoPSIxIiBmbGF0Z2xlY2FwPSJyc3MiIHN0cm9rZS1ib3VuZGluZz0icmVzdHJhIiBmbGF0Z2xlY2FwPSJyc3MiLz4iIGZpbGw9InJlZiIvPjwvc3ZnPg==")' }} />
          <div className="absolute -top-4 -right-4 w-24 h-24 bg-white/10 rounded-full blur-xl" />
          <div className="absolute -bottom-4 -left-4 w-32 h-32 bg-white/5 rounded-full blur-xl" />
        </div>

        <div className="relative flex justify-center -mt-12 mb-4">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white text-3xl font-head font-extrabold shadow-lg border-4 border-gray-900/20 card-hover-3d">
            {avatar || defaultAvatar}
          </div>
          <div className="absolute bottom-1 right-12 w-5 h-5 bg-green-500 rounded-full border-2 border-gray-900/20" />
        </div>

        <div className="text-center px-4 mb-4">
          <h3 className="text-xl font-head font-extrabold text-gray-900">{name}</h3>
          <p className="text-orange-600 text-sm font-semibold mt-0.5">{role}</p>
          <p className="text-gray-500 text-xs mt-2 leading-relaxed">{bio}</p>
        </div>

        <div className="grid grid-cols-3 gap-2 px-4 mb-4">
          {displayStats.map((stat, i) => (
            <TiltCard key={i} tiltMax={5} perspective={800} className="text-center">
              <div className="bg-orange-50/50 rounded-xl py-2 px-1 glass-subtle">
                <div className="text-lg font-head font-extrabold text-gray-900">
                  {stat.value}
                </div>
                <div className="text-[10px] text-gray-500 font-semibold">
                  {stat.label}
                </div>
              </div>
            </TiltCard>
          ))}
        </div>

        <div className="flex justify-center gap-3 px-4 pb-4">
          {displaySocials.map((social, i) => (
            <TiltCard key={i} tiltMax={8} perspective={600} className="interactive-scale">
              <a
                href={social.href}
                className="w-10 h-10 rounded-full bg-gray-900/5 hover:bg-orange-500 flex items-center justify-center text-lg transition-all duration-300 hover:scale-110 glass-subtle"
              >
                {social.icon}
              </a>
            </TiltCard>
          ))}
        </div>
      </div>
    </TiltCard>
  )
}
