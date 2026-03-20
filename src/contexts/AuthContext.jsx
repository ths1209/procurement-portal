import { createContext, useContext, useEffect, useState } from 'react'
import bcrypt from 'bcryptjs'
import { findUserByEmail, createUser, updateUser } from '../lib/teable'

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

  async function register(email, password, displayName) {
    const existing = await findUserByEmail(email)
    if (existing) {
      throw new Error('EMAIL_EXISTS')
    }
    const passwordHash = await bcrypt.hash(password, 10)
    await createUser({
      email,
      displayName,
      passwordHash,
      role:      'member',
      status:    'pending',
      createdAt: new Date().toISOString(),
    })
    // 注册成功，不自动登录，等待管理员审批
  }

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
  const value = { user, profile: user, loading, login, register, logout, refreshUser, changePassword }

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
