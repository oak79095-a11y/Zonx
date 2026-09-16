import { useMemo, useState, useEffect, useRef } from 'react'
import Header from './components/Header.jsx'
import Footer from './components/Footer.jsx'
import AdGrid from './components/AdGrid.jsx'
import AdCard from './components/AdCard.jsx'
import AdDetail from './components/AdDetail.jsx'
import Sidebar from './components/Sidebar.jsx'
import AuthModal from './components/AuthModal.jsx'
import StoriesBar from './components/StoriesBar.jsx'
import SellerProfile from './components/SellerProfile.jsx'
import Messages from './components/Messages.jsx'
import AdminLogin from './components/AdminLogin.jsx'
import AdminDashboard from './components/AdminDashboard.jsx'
import NotificationCenter from './components/NotificationCenter.jsx'
import SocialFeed from './components/SocialFeed.jsx'
import Hero from './components/Hero.jsx'
import BottomBar from './components/BottomBar.jsx'
import Toasts, { toast } from './components/Toast.jsx'
import { ArrowBackIcon } from './components/icons.jsx'
import { ads as initialAds } from './data/ads.js'
import { categories, categoryIcon } from './data/catalog.js'
import { apiFetch, mediaUrl } from './config.js'
import { useGlobalWs } from './hooks/useGlobalWs.js'

const PAGE_SIZE = 24
const SYNC_INTERVAL = 30000
const APP_BASE = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')
const appPath = (path = '/') => `${APP_BASE}${path}` || '/'

function BackToTop() {
  const [show, setShow] = useState(false)
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 500)
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return (
    <button
      type="button"
      className={'back-to-top' + (show ? ' show' : '')}
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="العودة إلى الأعلى"
    >↑</button>
  )
}

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

function EntrySplash() {
  return (
    <div className="entry-splash" role="presentation">
      <div className="entry-splash-glow" />
      <div className="entry-splash-brand">
        <span className="zonx-icon" aria-hidden="true"><span className="zonx-icon-x">✕</span></span>
        <span className="zonx-wordmark">ZON<span className="zonx-x">X</span></span>
      </div>
    </div>
  )
}

function AppContent() {
  const isAdminPath = typeof window !== 'undefined' && window.location.pathname.startsWith(appPath('/admin'))
  const [view, setView] = useState(isAdminPath ? 'admin-login' : 'home')
  const [adminUser, setAdminUser] = useState(null)
  const [activeCategory, setActiveCategory] = useState(null)
  const [city, setCity] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedAd, setSelectedAd] = useState(null)
  const [profileSeller, setProfileSeller] = useState(null)
  const [msgPeer, setMsgPeer] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [postOpen, setPostOpen] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const [entrySplashVisible, setEntrySplashVisible] = useState(!isAdminPath)
  const authActionRef = useRef(null)
  const [user, setUser] = useState(null)
  const [ads, setAds] = useState(initialAds)
  const [serverOffline, setServerOffline] = useState(false)
  const [loading, setLoading] = useState(true)

  const likedStorageKey = `bazaar-liked-ads:${user?.id || 'guest'}`
  const [likedCount, setLikedCount] = useState(0)
  const [unreadNotifications, setUnreadNotifications] = useState(0)

  // Browse state (server-side pagination/filtering/search)
  const [browseAds, setBrowseAds] = useState([])
  const [browseHasMore, setBrowseHasMore] = useState(false)
  const [browseLoading, setBrowseLoading] = useState(false)
  const [browseRefresh, setBrowseRefresh] = useState(0)
  const browseOffsetRef = useRef(0)
  const listingsSyncRef = useRef(false)
  const [searchDebounced, setSearchDebounced] = useState('')

  // Favorites (server-side fetch by ids)
  const [favAds, setFavAds] = useState([])

  // Global WS for badges (replaces 8s polling)
  useGlobalWs(user?.id)

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(searchQuery.trim()), 300)
    return () => clearTimeout(t)
  }, [searchQuery])

  // Fetch browse page when view/filters change
  useEffect(() => {
    if (view !== 'browse') return
    const params = new URLSearchParams()
    params.set('limit', String(PAGE_SIZE))
    params.set('offset', '0')
    if (activeCategory) params.set('category', activeCategory)
    if (city !== 'all') params.set('city', city)
    if (searchDebounced) params.set('q', searchDebounced)
    setBrowseLoading(true)
    apiFetch(`/api/listings?${params.toString()}`)
      .then(r => r.ok ? r.json() : [])
      .then(rows => {
        const list = Array.isArray(rows) ? rows.map(mapApiAd) : []
        setBrowseAds(list)
        browseOffsetRef.current = list.length
        setBrowseHasMore(list.length === PAGE_SIZE)
      })
      .catch(() => { setBrowseAds([]); setBrowseHasMore(false) })
      .finally(() => setBrowseLoading(false))
  }, [view, activeCategory, city, searchDebounced, browseRefresh])

  const loadMore = () => {
    if (browseLoading || !browseHasMore) return
    const params = new URLSearchParams()
    params.set('limit', String(PAGE_SIZE))
    params.set('offset', String(browseOffsetRef.current))
    if (activeCategory) params.set('category', activeCategory)
    if (city !== 'all') params.set('city', city)
    if (searchDebounced) params.set('q', searchDebounced)
    setBrowseLoading(true)
    apiFetch(`/api/listings?${params.toString()}`)
      .then(r => r.ok ? r.json() : [])
      .then(rows => {
        const list = Array.isArray(rows) ? rows.map(mapApiAd) : []
        setBrowseAds(prev => {
          const seen = new Set(prev.map(a => a.id))
          return [...prev, ...list.filter(a => !seen.has(a.id))]
        })
        browseOffsetRef.current += list.length
        setBrowseHasMore(list.length === PAGE_SIZE)
      })
      .catch(() => {})
      .finally(() => setBrowseLoading(false))
  }

  // Favorites: fetch liked ads from server (not just loaded page)
  useEffect(() => {
    if (view !== 'favorites') return
    let alive = true
    const load = () => {
      let ids = []
      try { ids = JSON.parse(localStorage.getItem(likedStorageKey) || '[]') } catch {}
      if (!ids.length) { setFavAds([]); return }
       apiFetch(`/api/listings?ids=${ids.slice(0, 60).join(',')}`)
        .then(r => r.ok ? r.json() : [])
        .then(rows => { if (alive) setFavAds(Array.isArray(rows) ? rows.map(mapApiAd) : []) })
        .catch(() => { if (alive) setFavAds([]) })
    }
    load()
    window.addEventListener('bazaar-liked-changed', load)
    return () => { alive = false; window.removeEventListener('bazaar-liked-changed', load) }
  }, [view, likedStorageKey])

  // Notification badge via WS (fallback: slow poll below)
  useEffect(() => {
    const onNotify = (e) => setUnreadNotifications(Number(e.detail?.unread) || 0)
    window.addEventListener('ws-notification', onNotify)
    return () => window.removeEventListener('ws-notification', onNotify)
  }, [])

  useEffect(() => {
    if (isAdminPath) {
       apiFetch('/api/auth/me', { credentials: 'include' }).then(r=>r.json()).then(u=>{
        if (u.role === 'admin') { setAdminUser(u); setView('admin') }
        else setView('admin-login')
      }).catch(()=>setView('admin-login'))
    } else {
       apiFetch('/api/auth/me', { credentials: 'include' }).then(r => r.ok ? r.json() : null).then(u => {
        if (u && u.id) setUser(u)
      }).catch(() => {})
    }
  }, [])

  useEffect(() => {
    let firstLoad = true
    const refreshListings = () => {
      if (document.visibilityState !== 'visible' || listingsSyncRef.current) return
      listingsSyncRef.current = true
      apiFetch('/api/listings?limit=60')
      .then(r => {
        if (!r.ok) throw new Error('offline')
        return r.json()
      })
      .then(rows => {
        if (Array.isArray(rows)) setAds(rows.map(mapApiAd))
        setServerOffline(false)
      })
      .catch(() => setServerOffline(true))
      .finally(() => {
        listingsSyncRef.current = false
        if (firstLoad) {
          firstLoad = false
          setLoading(false)
        }
      })
    }

    refreshListings()
    const timer = setInterval(() => {
      refreshListings()
      if (view === 'browse') setBrowseRefresh((value) => value + 1)
    }, SYNC_INTERVAL)
    return () => clearInterval(timer)
  }, [view])

  const featuredAds = useMemo(() => ads.filter((a) => a.featured), [ads])
  const latestAds = useMemo(() => ads.slice(0, 8), [ads])

  const goBrowse = (category) => {
    setActiveCategory(category)
    setView('browse')
    window.scrollTo({ top: 0, behavior: 'auto' })
  }

  const goHome = () => {
    setActiveCategory(null)
    setSearchQuery('')
    setView('home')
    setSelectedAd(null)
    window.history.pushState(null, '', appPath('/'))
    window.scrollTo({ top: 0, behavior: 'auto' })
  }

  const openAd = (ad) => {
    setSelectedAd(ad)
    setView('detail')
    window.scrollTo({ top: 0, behavior: 'auto' })
    // Fetch the detail endpoint so the server records a view and returns fresh data.
    apiFetch(`/api/listings/${encodeURIComponent(ad.id)}`)
      .then((r) => r.ok ? r.json() : null)
      .then((fresh) => { if (fresh) setSelectedAd(mapApiAd(fresh)) })
      .catch(() => {})
  }

  const openSellerProfile = (ad) => {
    setProfileSeller({ id: ad.seller_id || null, name: ad.seller_name, avatar: ad.seller_avatar, verified: ad.seller_verified })
    setView('profile')
    window.scrollTo({ top: 0, behavior: 'auto' })
  }

  const openOwnProfile = (account) => {
    setProfileSeller({ id: account.id, name: account.name, avatar: account.avatar, verified: account.verified })
    setView('profile')
    setSidebarOpen(false)
    window.scrollTo({ top: 0, behavior: 'auto' })
  }

  const openMessages = (peer) => {
    if (!user) {
      authActionRef.current = () => {
        setMsgPeer(peer ? { id: peer.id, name: peer.name, avatar: peer.avatar } : null)
        setView('messages')
        window.scrollTo({ top: 0, behavior: 'auto' })
      }
      setAuthOpen(true)
      toast('سجل الدخول اولاً لاستخدام المراسلات', 'info')
      return
    }
    setMsgPeer(peer ? { id: peer.id, name: peer.name, avatar: peer.avatar } : null)
    setView('messages')
    window.scrollTo({ top: 0, behavior: 'auto' })
  }

  const openFavorites = () => {
    setView('favorites')
    window.scrollTo({ top: 0, behavior: 'auto' })
  }

  useEffect(() => {
    const refresh = () => {
      let ids = []
      try { ids = JSON.parse(localStorage.getItem(likedStorageKey) || '[]') } catch {}
      setLikedCount(ads.filter((a) => ids.includes(a.id)).length)
    }
    refresh()
    window.addEventListener('bazaar-liked-changed', refresh)
    return () => window.removeEventListener('bazaar-liked-changed', refresh)
  }, [ads, likedStorageKey])

  useEffect(() => {
    if (!user) { setUnreadNotifications(0); return }
    let alive = true
    const loadUnread = () => {
       apiFetch('/api/notifications', { credentials: 'include' })
        .then((r) => r.ok ? r.json() : null)
        .then((data) => { if (alive) setUnreadNotifications(Number(data?.unread) || 0) })
        .catch(() => {})
    }
    loadUnread()
    const timer = setInterval(loadUnread, SYNC_INTERVAL)
    const clear = () => setUnreadNotifications(0)
    window.addEventListener('notifications-read', clear)
    return () => { alive = false; clearInterval(timer); window.removeEventListener('notifications-read', clear) }
  }, [user])

  const handleSearch = () => {
    setView('browse')
    window.scrollTo({ top: 0, behavior: 'auto' })
  }

  const openNotifications = () => {
    if (!user) {
      setAuthOpen(true)
      toast('سجل الدخول لرؤية الإشعارات', 'info')
      return
    }
    setView('notifications')
    window.scrollTo({ top: 0, behavior: 'auto' })
  }

  const handleCreateAd = () => {
    apiFetch('/api/listings').then(r => r.ok ? r.json() : []).then(rows => {
      if (Array.isArray(rows)) setAds(rows.map(mapApiAd))
      setBrowseRefresh((value) => value + 1)
    }).catch(() => {})
    setActiveCategory(null)
    setView('browse')
    window.scrollTo({ top: 0, behavior: 'auto' })
    toast('تم نشر اعلانك بنجاح ✓', 'success')
  }

  const openSocialComposer = () => {
    setView('home')
    window.scrollTo({ top: 0, behavior: 'smooth' })
    if (!user) {
      setAuthOpen(true)
      toast('سجل الدخول لنشر منشور', 'info')
      return
    }
    window.dispatchEvent(new Event('focus-social-composer'))
  }

  const handleAuthSuccess = (nextUser) => {
    // Keep the user's saved likes across sessions; merge any guest likes into the account.
    try {
      if (nextUser?.id) {
        const userKey = `bazaar-liked-ads:${nextUser.id}`
        const guestIds = JSON.parse(localStorage.getItem('bazaar-liked-ads:guest') || '[]')
        const userIds = JSON.parse(localStorage.getItem(userKey) || '[]')
        const merged = [...new Set([...userIds, ...guestIds])]
        localStorage.setItem(userKey, JSON.stringify(merged))
      }
      localStorage.removeItem('bazaar-liked-ads:guest')
    } catch {}
    setUser(nextUser)
    setLikedCount(0)
    setUnreadNotifications(0)
    const action = authActionRef.current
    authActionRef.current = null
    action?.()
  }

  const closeAuth = () => {
    authActionRef.current = null
    setAuthOpen(false)
  }

  const handleLogout = () => {
    apiFetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {})
    localStorage.removeItem('bazaar-session-token')
    // Per-user likes stay in localStorage so they are restored on the next login.
    setUser(null)
    setLikedCount(0)
    setUnreadNotifications(0)
    toast('تم تسجيل الخروج', 'info')
  }

  if (view === 'admin-login') {
    return (
      <>
        <Header onHome={goHome} onMenu={()=>setSidebarOpen(true)} onNotifications={()=>{}} onMessages={()=>{}} likedCount={0} user={adminUser} />
         <AdminLogin onSuccess={(u)=>{ setAdminUser(u); setView('admin'); window.history.pushState(null, '', appPath('/admin')) }} />
        <Footer />
          <BottomBar city={city} onCityChange={setCity} onHome={goHome} onPostAd={openSocialComposer} user={user} onLogout={handleLogout} onMessages={() => openMessages(null)} onProfile={openOwnProfile} />
      </>
    )
  }

  if (view === 'admin') {
    return (
      <>
        <Header onHome={goHome} onMenu={()=>setSidebarOpen(true)} onNotifications={()=>{}} onMessages={()=>{}} likedCount={0} user={adminUser} />
         <AdminDashboard onLogout={()=>{ setAdminUser(null); setView('admin-login'); window.history.pushState(null, '', appPath('/admin')) }} />
        <Footer />
          <BottomBar city={city} onCityChange={setCity} onHome={goHome} onPostAd={openSocialComposer} user={user} onLogout={handleLogout} onMessages={() => openMessages(null)} onProfile={openOwnProfile} />
      </>
    )
  }

  if (entrySplashVisible) return <EntrySplash />

  return (
    <>
      <Header onHome={goHome} onMenu={()=>setSidebarOpen(true)} onNotifications={openNotifications} onMessages={() => openMessages(null)} likedCount={unreadNotifications} user={user} />
      {serverOffline && (
        <div className="server-banner">
          الخادم غير متصل حاليا — اعلاناتك المحفوظة ستظهر عند عودة الاتصال. شغل السيرفر: <b>node server.js</b> داخل مجلد <b>server</b>
        </div>
      )}
      <Sidebar open={sidebarOpen} onClose={()=>setSidebarOpen(false)} city={city} onCityChange={setCity} user={user} onSetUser={setUser} onLogout={handleLogout} onRequireAuth={()=>setAuthOpen(true)} />
       <AuthModal open={authOpen} onClose={closeAuth} onSuccess={handleAuthSuccess} />

      <main>
        {view === 'home' && (
          <>
            <SocialFeed user={user} />
            <StoriesBar user={user} />
          </>
        )}

        {view === 'browse' && (
          <AdGrid ads={browseAds} category={activeCategory} city={city} activeCategory={activeCategory} loading={browseLoading} userId={user?.id} onCategoryChange={(c) => setActiveCategory(c)} onCityChange={setCity} onOpen={openAd} onAvatar={openSellerProfile} onResetFilters={() => { setActiveCategory(null); setCity('all'); setSearchQuery('') }} hasMore={browseHasMore} onLoadMore={loadMore} />
        )}

        {view === 'detail' && (<AdDetail ad={selectedAd} onBack={() => goBrowse(activeCategory)} />)}

        {view === 'profile' && (
          <SellerProfile
            seller={profileSeller}
            user={user}
            onBack={goHome}
            onOpenAd={openAd}
            onSeller={openSellerProfile}
            onMessage={openMessages}
            onRequireAuth={() => { setAuthOpen(true); toast('سجل الدخول لمتابعة المستخدمين وإضافة الأصدقاء', 'info') }}
            userId={user?.id}
          />
        )}

        {view === 'messages' && (
          <div className="messages-screen">
            <Messages
              user={user}
              initialPeer={msgPeer}
              onRequireAuth={() => setAuthOpen(true)}
            />
          </div>
        )}

        {view === 'favorites' && (
          <section className="section">
            <div className="container">
              <button type="button" className="back-btn" onClick={goHome} aria-label="رجوع" title="رجوع"><ArrowBackIcon size={20} /></button>
              <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                <h2 className="section-title">الاعجابات</h2>
                <div className="red-line small" style={{ margin: '8px auto 0' }}></div>
                <p className="section-sub">الاعلانات التي اعجبتك</p>
              </div>
              {favAds.length === 0 ? (
                <div className="empty-state">
                  <span className="empty-icon" aria-hidden="true">❤️</span>
                  <h3>لا يوجد اعجابات بعد</h3>
                  <p>اضغط القلب في اي اعلان ليظهر هنا</p>
                  <button type="button" className="btn btn-primary" onClick={goHome}>تصفح الاعلانات</button>
                </div>
              ) : (
                <div className="feed">
                  {favAds.map((ad) => (
                    <AdCard key={ad.id} ad={ad} userId={user?.id} onClick={openAd} onAvatar={openSellerProfile} />
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {view === 'notifications' && <NotificationCenter onBack={goHome} />}
      </main>

      {view !== 'messages' && <BackToTop />}
      {view !== 'messages' && <Footer />}
        {view !== 'messages' && <BottomBar city={city} onCityChange={setCity} onHome={goHome} onPostAd={openSocialComposer} user={user} onLogout={handleLogout} onSetUser={setUser} onMessages={() => openMessages(null)} onProfile={openOwnProfile} />}
    </>
  )
}

function mapApiAd(l) {
  const all = (l.images || []).filter(Boolean).map(mediaUrl)
  const videos = all.filter(p => /\.(mp4|webm|mov|m4v)$/i.test(p))
  const imgs = all.filter(p => !/\.(mp4|webm|mov|m4v)$/i.test(p))
  return {
    id: l.id,
    title: l.title,
    description: l.description,
    price: l.price,
    category: l.category_id,
    city: l.city_id,
    phone: l.phone || '',
    seller_id: l.user_id || null,
    seller_name: l.seller_name || 'بائع',
    seller_avatar: mediaUrl(l.seller_avatar),
    seller_verified: Boolean(l.seller_verified),
    likes: l.likes || 0,
    featured: Boolean(l.featured),
    date: (l.created_at || '').slice(0, 10),
    image: imgs[0] || null,
    images: imgs,
    video: videos[0] || null,
    mediaType: videos[0] ? 'video' : (imgs[0] ? 'image' : null),
  }
}

export default function App() {
  return (
    <>
      <Toasts />
      <AppContent />
    </>
  )
}
