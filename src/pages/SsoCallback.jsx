import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

/**
 * SSO 回调页
 *
 * 两种触发场景：
 *   A. iframe 扫码：SSO 跳回本地址 ?code=xxx
 *      → postMessage code 给父窗口，父窗口做登录
 *   B. 顶层账密：SSO portal 登录成功跳回 ?token=xxx（或顶层扫码脱框跳回 ?code=xxx）
 *      → 本页直接调 ssoLogin/ssoTokenLogin 然后进 dashboard
 */
export default function SsoCallback() {
  const { ssoLogin, ssoTokenLogin } = useAuth()
  const navigate = useNavigate()
  const [msg, setMsg] = useState('正在完成登录…')
  const [error, setError] = useState('')

  useEffect(() => {
    const { code, token } = readParamsFromHash()
    if (!code && !token) {
      setError('未获取到 code 或 token 参数')
      return
    }

    const inIframe = window.parent && window.parent !== window
    if (inIframe) {
      try {
        window.parent.postMessage({ type: 'pp-sso-auth', code, token }, '*')
        setMsg('扫码成功，正在跳转…')
      } catch (e) {
        setError('iframe 通信失败：' + e.message)
      }
      return
    }

    ;(async () => {
      try {
        if (token) await ssoTokenLogin(token)
        else       await ssoLogin(code)
        navigate('/dashboard', { replace: true })
      } catch (err) {
        setError(parseErr(err.message))
      }
    })()
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <div className="card p-8 text-center" style={{ maxWidth: 380, width: '100%' }}>
        {error ? (
          <>
            <div className="text-2xl mb-3">⚠️</div>
            <h3 className="text-base font-semibold mb-2" style={{ color: 'var(--text)' }}>登录失败</h3>
            <p className="text-sm mb-5" style={{ color: 'var(--muted)' }}>{error}</p>
            <button onClick={() => navigate('/login', { replace: true })}
              className="press text-sm font-medium text-indigo-500 hover:text-indigo-400">
              返回登录页
            </button>
          </>
        ) : (
          <>
            <div className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm" style={{ color: 'var(--muted)' }}>{msg}</p>
          </>
        )}
      </div>
    </div>
  )
}

/**
 * 兼容两种回跳形式：
 *   A. /#/sso-callback?token=xxx   → 参数在 hash 内
 *   B. /?token=xxx#/sso-callback   → 参数在 search 里（某些 SSO 粗暴拼 URL 会这样）
 */
function readParamsFromHash() {
  const fromHash = parseQueryFromHash(window.location.hash)
  const fromSearch = new URLSearchParams(window.location.search)
  return {
    code:  fromHash.code  || fromSearch.get('code')  || '',
    token: fromHash.token || fromSearch.get('token') || '',
  }
}

function parseQueryFromHash(hash) {
  const qIdx = (hash ?? '').indexOf('?')
  if (qIdx < 0) return { code: '', token: '' }
  const p = new URLSearchParams(hash.slice(qIdx + 1))
  return { code: p.get('code') ?? '', token: p.get('token') ?? '' }
}

function parseErr(raw) {
  const s = String(raw ?? '')
  if (s.startsWith('SSO_VERIFY_FAILED:')) return 'SSO 校验失败：' + s.slice('SSO_VERIFY_FAILED:'.length)
  if (s === 'SSO_NOT_CONFIGURED')         return 'SSO 未配置（VITE_SSO_WORKER_BASE 缺失）'
  if (s === 'USER_DISABLED')              return '该账号已被停用'
  if (s === 'SSO_UPSERT_FAILED')          return '用户同步到 Teable 失败'
  return s || '未知错误'
}
