import { createContext, useContext, useEffect, useState } from 'react'
import bcrypt from 'bcryptjs'
import { findUserByEmail, createUser, updateUser, upsertSsoUser } from '../lib/teable'

const SESSION_KEY = 'pp_session'  // 存 { email } 到 localStorage

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)   // 当前用户（来自 Teable 记录）
  const [loading, setLoading] = useState(true)

  // 应用启动时：从 localStorage 恢复会话，并重新验证当前状态
  useEffect(() => {
    restoreSession()
  }, [])

  async function restoreSession() {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) {
      setLoading(false)
      return
    }
    try {
      const { email } = JSON.parse(raw)
      // 重新从 Teable 拉取，确保 status/role 是最新的
      const current = await findUserByEmail(email)
      if (current && current.status !== 'disabled') {
        setUser(current)
      } else {
        localStorage.removeItem(SESSION_KEY)
      }
    } catch {
      localStorage.removeItem(SESSION_KEY)
    }
    setLoading(false)
  }

  async function login(email, password) {
    const record = await findUserByEmail(email)
    if (!record) {
      throw new Error('USER_NOT_FOUND')
    }
    const match = await bcrypt.compare(password, record.passwordHash ?? '')
    if (!match) {
      throw new Error('WRONG_PASSWORD')
    }
    localStorage.setItem(SESSION_KEY, JSON.stringify({ email: record.email }))
    setUser(record)
    return record
  }

  async function register(email, password, displayName, extra = {}) {
    const existing = await findUserByEmail(email)
    if (existing) {
      throw new Error('EMAIL_EXISTS')
    }
    const passwordHash = await bcrypt.hash(password, 10)
    const fields = {
      email,
      displayName,
      passwordHash,
      role:      'member',
      status:    'pending',
      createdAt: new Date().toISOString(),
    }
    if (extra.jobId) fields.jobId = extra.jobId
    if (extra.dept)  fields.dept  = extra.dept
    if (extra.group) fields.group = extra.group
    await createUser(fields)
    // 注册成功，不自动登录，等待管理员审批
  }

  /** 通用 SSO 登录：拿到 Worker 返回的 user 数据 → upsert Teable → 建 session */
  async function finalizeSsoSession(workerPath, paramKey, paramValue) {
    const base = import.meta.env.VITE_SSO_WORKER_BASE
    if (!base) throw new Error('SSO_NOT_CONFIGURED')
    const resp = await fetch(`${base}${workerPath}?${paramKey}=${encodeURIComponent(paramValue)}`)
    const body = await resp.json().catch(() => ({}))
    if (body.errcode !== 0 || !body.data) {
      throw new Error(`SSO_VERIFY_FAILED:${body.errmsg ?? 'unknown'}`)
    }
    console.log('[SSO] verify response data:', body.data)
    console.log('[SSO] data keys:', Object.keys(body.data))
    const record = await upsertSsoUser(body.data)
    if (!record) throw new Error('SSO_UPSERT_FAILED')
    if (record.status === 'disabled') throw new Error('USER_DISABLED')
    localStorage.setItem(SESSION_KEY, JSON.stringify({ email: record.email }))
    setUser(record)
    return record
  }

  /** 扫码登录：前端 code → Worker /sso/qr-verify → Teable upsert */
  const ssoLogin      = code  => finalizeSsoSession('/sso/qr-verify', 'code',  code)
  /** 账密登录：SSO 回跳带的 token → Worker /sso/verify → Teable upsert */
  const ssoTokenLogin = token => finalizeSsoSession('/sso/verify',    'token', token)

  function logout() {
    localStorage.removeItem(SESSION_KEY)
    setUser(null)
  }

  async function changePassword(currentPassword, newPassword) {
    if (!user?.email) throw new Error('未登录')
    const record = await findUserByEmail(user.email)
    if (!record) throw new Error('用户不存在')
    const match = await bcrypt.compare(currentPassword, record.passwordHash ?? '')
    if (!match) throw new Error('当前密码错误')
    const newHash = await bcrypt.hash(newPassword, 10)
    await updateUser(record.uid, { passwordHash: newHash })
  }

  // 手动刷新当前用户状态（ProtectedRoute 可调用）
  async function refreshUser() {
    if (!user?.email) return
    const current = await findUserByEmail(user.email)
    if (current) setUser(current)
    else logout()
  }

  // profile 与 user 保持一致，兼容原有组件引用
  const value = { user, profile: user, loading, login, register, ssoLogin, ssoTokenLogin, logout, refreshUser, changePassword }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
