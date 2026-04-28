import { useState } from 'react'
import talLogo from '../assets/tal-logo.png'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, ArrowRight, Check, Moon, Sun } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'

const SSO_APPID       = import.meta.env.VITE_SSO_APPID
const SSO_WORKER_BASE = import.meta.env.VITE_SSO_WORKER_BASE
const SSO_ENABLED     = Boolean(SSO_APPID && SSO_WORKER_BASE)

// SSO 账密登录跳转入口；登录成功后 SSO 侧按"App单点登录回调地址"跳回 #/sso-callback?token=xxx
const SSO_PORTAL_LOGIN = SSO_APPID
  ? `https://sso.100tal.com/portal/login/${SSO_APPID}`
  : ''

export default function Login() {
  // 默认 Tab：SSO 已配置 → 账密（跳 SSO）；否则回退本地
  const [tab, setTab]           = useState(SSO_ENABLED ? 'sso-password' : 'local')
  const [mode, setMode]         = useState('login')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [name, setName]         = useState('')
  const [jobId, setJobId]       = useState('')
  const [dept, setDept]         = useState('')
  const [group, setGroup]       = useState('')
  const [showPwd, setShowPwd]   = useState(false)
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [done, setDone]         = useState(false)
  const { login, register } = useAuth()
  const { dark, toggle }    = useTheme()
  const navigate = useNavigate()

  function goSsoPortal() {
    // 直接顶层跳转到 100tal 登录门户；SSO 后台已配好回跳地址
    window.location.href = SSO_PORTAL_LOGIN
  }

  async function submit(e) {
    e.preventDefault(); setError(''); setLoading(true)
    try {
      if (mode === 'login') {
        await login(email, password)
        navigate('/dashboard', { replace: true })
      } else {
        if (name.trim().length < 2) { setError('姓名至少 2 个字符'); return }
        if (!dept) { setError('请选择所在部门'); return }
        if (!jobId.trim()) { setError('请填写工号'); return }
        await register(email, password, name.trim(), { jobId: jobId.trim(), dept, group })
        setDone(true)
      }
    } catch (err) { setError(parseErr(err.message)) }
    finally { setLoading(false) }
  }

  if (done) return (
    <Page dark={dark} toggle={toggle}>
      <div className="card p-10 text-center animate-scale-in" style={{ maxWidth: 400, width: '100%' }}>
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
          style={{ background: 'linear-gradient(135deg,#10B981,#34D399)' }}>
          <Check className="w-7 h-7 text-white" strokeWidth={2.5} />
        </div>
        <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text)' }}>申请已提交</h3>
        <p className="text-sm mb-6" style={{ color: 'var(--muted)' }}>管理员审批通过后即可登录，请耐心等待。</p>
        <button onClick={() => { setDone(false); setMode('login') }}
          className="press text-sm font-medium text-indigo-500 hover:text-indigo-400 transition-colors">← 返回登录</button>
      </div>
    </Page>
  )

  return (
    <Page dark={dark} toggle={toggle}>
      <div className="w-full flex" style={{ maxWidth: 900, minHeight: 520 }}>
        {/* 左侧品牌 */}
        <div className="hidden md:flex flex-col justify-between p-10 rounded-l-2xl relative overflow-hidden"
          style={{ width: 380, background: 'linear-gradient(145deg,#0A0F1E 0%,#12103A 50%,#071428 100%)', flexShrink: 0 }}>
          <div className="absolute inset-0 opacity-30"
            style={{ backgroundImage: 'radial-gradient(rgba(99,102,241,0.15) 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
          <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.2) 0%, transparent 70%)' }} />
          <div className="absolute -bottom-16 -left-16 w-48 h-48 rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(14,165,233,0.15) 0%, transparent 70%)' }} />
          <div className="relative flex items-center gap-2.5">
            <div className="rounded-2xl p-2 shrink-0"
              style={{ background: '#ffffff', boxShadow: '0 8px 24px rgba(0,0,0,0.25), 0 2px 8px rgba(0,0,0,0.15)' }}>
              <img src={talLogo} alt="TAL 好未来" className="h-7 w-auto object-contain block" />
            </div>
            <span className="text-white text-sm font-semibold">采购运营组</span>
          </div>
          <div className="relative space-y-5">
            <div>
              <p className="text-xs font-bold tracking-[0.2em] mb-2" style={{ color: 'rgba(99,102,241,0.8)' }}>PROCUREMENT PORTAL</p>
              <h1 className="text-4xl font-bold text-white leading-tight">高效协作<br />智能采购<br />一站直达</h1>
            </div>
            <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.35)' }}>集成 AI 工具、项目追踪<br />与数据看板，让采购更高效</p>
            <div className="space-y-2.5">
              {[['🤖','AI 产出工具直连'],['📋','项目进度实时跟踪'],['📊','数据看板一键预览']].map(([i,t]) => (
                <div key={t} className="flex items-center gap-2.5">
                  <span className="text-base">{i}</span>
                  <span className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>{t}</span>
                </div>
              ))}
            </div>
          </div>
          <p className="text-xs relative" style={{ color: 'rgba(255,255,255,0.18)' }}>© {new Date().getFullYear()} 采购运营组 · 内部系统</p>
        </div>

        {/* 右侧表单 */}
        <div className="flex-1 flex flex-col justify-center p-8 lg:p-10 rounded-r-2xl md:rounded-l-none rounded-2xl card">
          <h2 className="text-2xl font-bold mb-1" style={{ color: 'var(--text)' }}>
            {tab === 'sso-password' ? '统一身份登录'
              : mode === 'login'    ? '欢迎回来 👋' : '申请加入'}
          </h2>
          <p className="text-sm mb-6" style={{ color: 'var(--muted)' }}>
            {tab === 'sso-password' ? '跳转到 100tal 统一登录页'
              : mode === 'login'    ? '登录以访问工作门户' : '提交申请，等待管理员审批'}
          </p>

          {/* 顶层 Tab：账密(SSO) / 本地（仅当 SSO 已配置时显示 2 个 Tab） */}
          {SSO_ENABLED && (
            <div className="flex p-1 rounded-xl mb-5" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
              {[['sso-password','账号密码'],['local','本地测试']].map(([m,l]) => (
                <button key={m} onClick={() => { setTab(m); setError('') }}
                  className={`press flex-1 py-2 text-sm font-medium rounded-[10px] transition-all duration-200 ${tab===m ? 'text-white shadow' : ''}`}
                  style={tab===m ? { background: '#6366F1' } : { color: 'var(--muted)' }}>
                  {l}
                </button>
              ))}
            </div>
          )}

          {tab === 'sso-password' ? (
            <div className="space-y-4">
              <div className="rounded-xl p-4 text-sm" style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--muted)' }}>
                点击下方按钮跳转到 100tal 统一登录页。知音楼 App 内打开本系统会自动免登。
              </div>
              <button onClick={goSsoPortal} disabled={loading}
                className="press w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-white shadow-lg transition-opacity disabled:opacity-60"
                style={{ background: '#6366F1', boxShadow: '0 4px 20px rgba(99,102,241,0.25)' }}>
                {loading ? <><Spin /> 处理中…</> : <>前往统一登录 <ArrowRight className="w-4 h-4" /></>}
              </button>
              {error && (
                <div className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm animate-scale-in"
                  style={{ background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.2)', color: '#F43F5E' }}>
                  ⚠️ {error}
                </div>
              )}
              <p className="text-xs text-center" style={{ color: 'var(--muted)' }}>
                首次登录会创建 pending 账号，需管理员在「用户管理」审批
              </p>
            </div>
          ) : <>

          {/* 本地测试：登录 / 申请账号 切换 */}
          <div className="flex p-1 rounded-xl mb-6" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
            {[['login','登录'],['register','申请账号']].map(([m,l]) => (
              <button key={m} onClick={() => { setMode(m); setError('') }}
                className={`press flex-1 py-2 text-sm font-medium rounded-[10px] transition-all duration-200 ${mode===m ? 'text-white shadow' : ''}`}
                style={mode===m ? { background: '#6366F1' } : { color: 'var(--muted)' }}>
                {l}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-3.5">
            {mode === 'register' && <Field label="姓名" value={name} onChange={setName} placeholder="请输入真实姓名" />}
            {mode === 'register' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color:'var(--text)', opacity:0.75 }}>
                    所在部门 <span className="text-red-500">*</span>
                  </label>
                  <select required value={dept} onChange={e => { setDept(e.target.value); setGroup('') }} className="field">
                    <option value="">请选择</option>
                    <option>采购运营组</option>
                    <option>集团采购部</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color:'var(--text)', opacity:0.75 }}>工号 <span className="text-red-500">*</span></label>
                  <input value={jobId} onChange={e => setJobId(e.target.value)} placeholder="如 381639"
                    required className="field font-mono" />
                </div>
              </div>
            )}
            {mode === 'register' && dept === '采购运营组' && (
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color:'var(--text)', opacity:0.75 }}>所在小组</label>
                <select value={group} onChange={e => setGroup(e.target.value)} className="field">
                  <option value="">请选择（可选）</option>
                  <option>运营分析组</option>
                  <option>采购稽核组</option>
                  <option>供应商管理组</option>
                </select>
              </div>
            )}
            <Field label="邮箱" type="email" value={email} onChange={setEmail} placeholder="your@company.com" />
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text)', opacity: 0.75 }}>密码</label>
              <div className="relative">
                <input type={showPwd ? 'text' : 'password'} value={password}
                  onChange={e => setPassword(e.target.value)} placeholder="至少 6 位" required minLength={6}
                  className="field pr-10" />
                <button type="button" onClick={() => setShowPwd(v => !v)}
                  className="press absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: 'var(--muted)' }}>
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm animate-scale-in"
                style={{ background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.2)', color: '#F43F5E' }}>
                ⚠️ {error}
              </div>
            )}

            <button type="submit" disabled={loading}
              className="press w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-white mt-1 shadow-lg transition-opacity disabled:opacity-60"
              style={{ background: '#6366F1', boxShadow: '0 4px 20px rgba(99,102,241,0.25)' }}>
              {loading
                ? <><Spin /> 处理中…</>
                : <>{mode==='login' ? '登录' : '提交申请'} <ArrowRight className="w-4 h-4" /></>
              }
            </button>
          </form>
          </>}
        </div>
      </div>
    </Page>
  )
}

function Page({ children, dark, toggle }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative" style={{ background: 'var(--bg)' }}>
      {/* 暗色模式背景光晕 */}
      {dark && <>
        <div className="fixed top-0 left-1/4 w-96 h-96 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.06) 0%, transparent 70%)', filter: 'blur(40px)' }} />
        <div className="fixed bottom-0 right-1/4 w-96 h-96 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(14,165,233,0.05) 0%, transparent 70%)', filter: 'blur(40px)' }} />
      </>}
      <button onClick={toggle}
        className="press fixed top-4 right-4 z-10 w-9 h-9 rounded-xl flex items-center justify-center transition-colors"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)' }}>
        {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      </button>
      <div className="w-full animate-scale-in" style={{ maxWidth: 900 }}>{children}</div>
    </div>
  )
}

function Field({ label, type = 'text', value, onChange, placeholder }) {
  return (
    <div>
      <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text)', opacity: 0.75 }}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} required
        className="field" />
    </div>
  )
}
function Spin() {
  return <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
}
function parseErr(c) {
  const s = String(c ?? '')
  if (s.startsWith('SSO_VERIFY_FAILED:')) return 'SSO 校验失败：' + s.slice('SSO_VERIFY_FAILED:'.length)
  if (s === 'SSO_NOT_CONFIGURED')         return 'SSO 未配置'
  if (s === 'USER_DISABLED')              return '该账号已被停用'
  if (s === 'SSO_UPSERT_FAILED')          return '用户同步失败'
  return { USER_NOT_FOUND:'邮箱未注册', WRONG_PASSWORD:'密码错误', EMAIL_EXISTS:'邮箱已被注册' }[s] ?? `操作失败（${s}）`
}
