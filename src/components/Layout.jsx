import { useState } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { LayoutDashboard, ClipboardList, Users, LogOut, Menu, X, Sun, Moon, KeyRound } from 'lucide-react'
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
  const [pwOpen, setPwOpen] = useState(false)
  const isAdmin   = profile?.role === 'admin'

  function handleLogout() { logout(); navigate('/login', { replace: true }) }

  const links = NAV.filter(n => !n.admin || isAdmin)

  /* ── 侧边栏内容 ── */
  const Sidebar = () => (
    <div className="flex flex-col h-full" style={{ background: 'var(--sb-bg)', borderRight: '1px solid var(--sb-sep)' }}>

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
            <p className="text-[13px] font-semibold leading-none" style={{ color: 'var(--sb-text-strong)' }}>采购运营组</p>
            <p className="text-[10px] mt-0.5 tracking-widest" style={{ color: 'var(--sb-muted)' }}>PORTAL</p>
          </div>
        </div>
        <button onClick={() => setOpen(false)} className="press lg:hidden transition-colors" style={{ color: 'var(--sb-muted)' }}>
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="mx-4 h-px" style={{ background: 'var(--sb-sep)' }} />

      {/* 导航 */}
      <nav className="flex-1 px-3 py-3 space-y-0.5">
        {links.map(item => (
          <NavLink key={item.to} to={item.to} onClick={() => setOpen(false)}
            className={({ isActive }) =>
              `sb-nav-link flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-200 press${isActive ? ' sb-nav-active' : ''}`
            }>
            {({ isActive }) => (
              <>
                <item.icon className="w-4 h-4 shrink-0" strokeWidth={isActive ? 2.2 : 1.75}
                  style={{ color: isActive ? 'var(--sb-active-text)' : 'var(--sb-muted)' }} />
                {item.label}
                {isActive && <div className="ml-auto w-1.5 h-1.5 rounded-full" style={{ background: 'var(--sb-active-text)', opacity: 0.45 }} />}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="mx-4 h-px" style={{ background: 'var(--sb-sep)' }} />

      {/* 用户信息 */}
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold text-white shrink-0"
            style={{ background: 'linear-gradient(135deg,#6366F1,#0EA5E9)' }}>
            {(profile?.displayName || '?')[0].toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold truncate" style={{ color: 'var(--sb-text-strong)' }}>{profile?.displayName || '用户'}</p>
            <p className="text-[10px] truncate" style={{ color: 'var(--sb-muted)' }}>{profile?.email}</p>
          </div>
          {isAdmin && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md tracking-wide shrink-0"
              style={{ background: 'var(--sb-active)', color: 'var(--sb-active-text)', border: '1px solid var(--sb-sep)', opacity: 0.9 }}>
              ADMIN
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={toggle}
            className="sb-btn press flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors">
            {dark ? <Sun className="w-3 h-3" /> : <Moon className="w-3 h-3" />}
            {dark ? '浅色' : '深色'}
          </button>
          <button onClick={() => setPwOpen(true)}
            className="sb-btn press flex items-center justify-center py-1.5 px-2 rounded-lg transition-colors"
            title="修改密码">
            <KeyRound className="w-3 h-3" />
          </button>
          <button onClick={handleLogout}
            className="sb-btn sb-btn-danger press flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors">
            <LogOut className="w-3 h-3" />退出
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--bg)' }}>
      {pwOpen && <ChangePasswordModal onClose={() => setPwOpen(false)} />}
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
          style={{ background: 'var(--surface)', backdropFilter: 'blur(16px)', borderBottom: '1px solid var(--border)' }}>
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

// ─── 修改密码弹窗 ──────────────────────────────────────────────────────────────
function ChangePasswordModal({ onClose }) {
  const { changePassword } = useAuth()
  const [cur,    setCur]    = useState('')
  const [next,   setNext]   = useState('')
  const [confirm,setConfirm]= useState('')
  const [saving, setSaving] = useState(false)
  const [err,    setErr]    = useState('')
  const [ok,     setOk]     = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (next !== confirm) { setErr('两次输入的新密码不一致'); return }
    if (next.length < 6)  { setErr('新密码至少 6 位'); return }
    setSaving(true); setErr('')
    try {
      await changePassword(cur, next)
      setOk(true)
      setTimeout(onClose, 1500)
    } catch(e) { setErr(e.message) } finally { setSaving(false) }
  }

  return createPortal(
    <div className="fixed inset-0 z-[300] overflow-y-auto animate-fade-in"
      style={{ background:'rgba(0,0,0,0.5)', backdropFilter:'blur(8px)' }}
      onClick={onClose}>
      <div className="flex min-h-full items-center justify-center p-4" onClick={e => e.stopPropagation()}>
        <div className="w-full max-w-sm rounded-2xl shadow-2xl animate-scale-in"
          style={{ background:'var(--surface)', border:'1px solid var(--border)' }}>
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom:'1px solid var(--border)' }}>
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4" style={{ color:'#6366F1' }} />
              <h3 className="font-semibold text-[15px]" style={{ color:'var(--text)' }}>修改密码</h3>
            </div>
            <button onClick={onClose} className="press w-7 h-7 flex items-center justify-center rounded-xl"
              style={{ background:'var(--surface2)', color:'var(--muted)' }}>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {ok ? (
            <div className="p-8 text-center">
              <div className="text-3xl mb-2">✅</div>
              <p className="text-sm font-medium" style={{ color:'var(--text)' }}>密码修改成功</p>
            </div>
          ) : (
            <form onSubmit={submit} className="p-5 space-y-4">
              {[['当前密码', cur, setCur], ['新密码（至少6位）', next, setNext], ['确认新密码', confirm, setConfirm]].map(([label, val, set]) => (
                <div key={label}>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color:'var(--text)', opacity:0.65 }}>{label}</label>
                  <input type="password" required value={val} onChange={e => set(e.target.value)} className="field" />
                </div>
              ))}
              {err && <p className="text-xs text-red-500">{err}</p>}
              <div className="flex gap-2.5 pt-1">
                <button type="button" onClick={onClose}
                  className="press flex-1 py-2.5 text-sm font-semibold rounded-xl"
                  style={{ background:'var(--surface2)', color:'var(--muted)' }}>取消</button>
                <button type="submit" disabled={saving}
                  className="press flex-1 py-2.5 text-sm font-semibold text-white rounded-xl disabled:opacity-60"
                  style={{ background:'#6366F1' }}>
                  {saving ? '保存中…' : '确认修改'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
