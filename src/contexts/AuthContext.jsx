import { createContext, useContext, useEffect, useState } from 'react'
import { api, setToken, clearToken, getToken } from '../lib/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    restoreSession()
    // 401 时全局广播,自动登出
    const onUnauth = () => setUser(null)
    window.addEventListener('pp:unauthorized', onUnauth)
    return () => window.removeEventListener('pp:unauthorized', onUnauth)
  }, [])

  async function restoreSession() {
    if (!getToken()) { setLoading(false); return }
    try {
      const { profile, token } = await api.get('/auth/me')
      if (token) setToken(token) // 后端按需续期
      if (profile && profile.status !== 'disabled') setUser(profile)
      else clearToken()
    } catch {
      clearToken()
    }
    setLoading(false)
  }

  async function login(email, password) {
    try {
      const { token, profile } = await api.post('/auth/login', { email, password })
      setToken(token)
      setUser(profile)
      return profile
    } catch (e) {
      // 映射后端 errmsg → 原有错误码,保持页面错误处理不变
      const msg = String(e?.message || '')
      if (e?.status === 401) {
        // 后端统一返回"账号或密码错误",细分原语义前端已不需要
        throw new Error('WRONG_PASSWORD')
      }
      if (e?.status === 403) throw new Error('USER_DISABLED')
      throw new Error(msg || 'LOGIN_FAILED')
    }
  }

  async function register(email, password, displayName, extra = {}) {
    try {
      await api.post('/auth/register', { email, password, displayName, ...extra })
    } catch (e) {
      if (e?.status === 409) throw new Error('EMAIL_EXISTS')
      throw e
    }
  }

  async function finalizeSsoSession(field, value) {
    const body = field === 'code' ? { code: value } : { token: value }
    try {
      const { token, profile } = await api.post('/auth/sso-finalize', body)
      setToken(token)
      setUser(profile)
      return profile
    } catch (e) {
      if (e?.status === 403) throw new Error('USER_DISABLED')
      if (e?.status === 401) throw new Error(`SSO_VERIFY_FAILED:${e.message}`)
      throw new Error(e.message || 'SSO_UPSERT_FAILED')
    }
  }

  const ssoLogin      = code  => finalizeSsoSession('code', code)
  const ssoTokenLogin = token => finalizeSsoSession('token', token)

  async function logout() {
    try { await api.post('/auth/logout', {}) } catch { /* 无状态,忽略 */ }
    clearToken()
    setUser(null)
  }

  async function changePassword(currentPassword, newPassword) {
    if (!user) throw new Error('未登录')
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword })
    } catch (e) {
      if (e?.status === 401) throw new Error('当前密码错误')
      throw e
    }
  }

  async function refreshUser() {
    if (!getToken()) return
    try {
      const { profile, token } = await api.get('/auth/me')
      if (token) setToken(token)
      if (profile) setUser(profile)
      else logout()
    } catch {
      logout()
    }
  }

  const value = { user, profile: user, loading, login, register, ssoLogin, ssoTokenLogin, logout, refreshUser, changePassword }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
