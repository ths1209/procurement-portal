import { useState } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { LayoutDashboard, ClipboardList, Users, LogOut, Menu, X, Sun, Moon } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'

const NAV = [
  { to: '/dashboard', label: '百宝箱', icon: LayoutDashboard },
  { to: '/projects',  label: '项目进度', icon: ClipboardList   },
  { to: '/admin',     label: '用户管理', icon: Users, admin: true },
]

export default function Layout({ children }) {
  const { profile, logout } = useAuth()
  const { dark, toggle }    = useTheme()
  const navigate  = useNavigate()
  const location  = useLocation()
  const [open, setOpen] = useState(false)
  const isAdmin   = profile?.role === 'admin'

  function handleLogout() { logout(); navigate('/login', { replace: true }) }

  const links = NAV.filter(n => !n.admin || isAdmin)

  /* ── 侧边栏内容 ── */
  const Sidebar = () => (
    <div className="flex flex-col h-full" style={{ background: 'var(--sidebar)' }}>

      {/* Logo */}
      <div className="px-5 pt-6 pb-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'linear-gradient(135deg,#6366F1,#0EA5E9)' }}>
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <div>
            <p className="text-white text-[13px] font-semibold leading-none">采购运营组</p>
            <p className="text-white/30 text-[10px] mt-0.5 tracking-widest">PORTAL</p>
          </div>
        </div>
        <button onClick={() => setOpen(false)} className="press lg:hidden text-white/30 hover:text-white/60 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="mx-4 h-px" style={{ background: 'rgba(255,255,255,0.05)' }} />

      {/* 导航 */}
      <nav className="flex-1 px-3 py-3 space-y-0.5">
        {links.map(item => (
          <NavLink key={item.to} to={item.to} onClick={() => setOpen(false)}
            className={({ isActive }) =>
              `group flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-200 press ${
                isActive ? 'text-white' : 'text-white/40 hover:text-white/75 hover:bg-white/5'
              }`
            }
            style={({ isActive }) => isActive
              ? { background: 'rgba(99,102,241,0.35)' }
              : {}
            }>
            {({ isActive }) => (
              <>
                <item.icon className={`w-4 h-4 shrink-0 transition-colors ${isActive ? 'text-white' : 'text-white/35 group-hover:text-white/65'}`} strokeWidth={isActive ? 2.2 : 1.75} />
                {item.label}
                {isActive && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-400/70" />}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="mx-4 h-px" style={{ background: 'rgba(255,255,255,0.05)' }} />

      {/* 用户信息 */}
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold text-white shrink-0"
            style={{ background: 'linear-gradient(135deg,#6366F1,#0EA5E9)' }}>
            {(profile?.displayName || '?')[0].toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-white text-[12px] font-semibold truncate">{profile?.displayName || '用户'}</p>
            <p className="text-white/30 text-[10px] truncate">{profile?.email}</p>
          </div>
          {isAdmin && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md tracking-wide shrink-0"
              style={{ background: 'rgba(99,102,241,0.25)', color: '#A5B4FC', border: '1px solid rgba(99,102,241,0.25)' }}>
              ADMIN
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={toggle}
            className="press flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-medium text-white/40 hover:text-white/70 transition-colors"
            style={{ background: 'rgba(255,255,255,0.05)' }}>
            {dark ? <Sun className="w-3 h-3" /> : <Moon className="w-3 h-3" />}
            {dark ? '浅色' : '深色'}
          </button>
          <button onClick={handleLogout}
            className="press flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-medium text-white/40 hover:text-red-400/70 transition-colors"
            style={{ background: 'rgba(255,255,255,0.05)' }}>
            <LogOut className="w-3 h-3" />退出
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--bg)' }}>
      {/* 遮罩 */}
      {open && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-20 lg:hidden animate-fade-in"
          onClick={() => setOpen(false)} />
      )}

      {/* 桌面侧边栏 */}
      <aside className="hidden lg:block fixed top-0 left-0 h-full z-10" style={{ width: 220 }}>
        <Sidebar />
      </aside>

      {/* 移动侧边栏 */}
      <aside className={`lg:hidden fixed top-0 left-0 h-full z-30 transition-transform duration-300`}
        style={{ width: 220, transform: open ? 'translateX(0)' : 'translateX(-100%)' }}>
        <Sidebar />
      </aside>

      {/* 主区域 */}
      <div className="flex-1 flex flex-col min-w-0 lg:ml-[220px]">
        {/* 移动顶栏 */}
        <header className="lg:hidden sticky top-0 z-10 flex items-center justify-between px-4 py-3"
          style={{ background: 'rgba(var(--bg-rgb,240,244,255),0.85)', backdropFilter: 'blur(16px)', borderBottom: '1px solid var(--border)' }}>
          <button onClick={() => setOpen(true)} className="press p-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 text-[var(--text)] transition-colors">
            <Menu className="w-5 h-5" />
          </button>
          <span className="text-sm font-bold" style={{ color: 'var(--text)' }}>采购运营组工作门户</span>
          <button onClick={toggle} className="press p-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition-colors" style={{ color: 'var(--muted)' }}>
            {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </header>

        {/* 页面内容 */}
        <main key={location.pathname} className="flex-1 p-5 lg:p-7">
          {children}
        </main>
      </div>
    </div>
  )
}
