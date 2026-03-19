import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function ProtectedRoute({ children, requireAdmin = false }) {
  const { user, profile, loading, logout } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-400">加载中…</p>
        </div>
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  if (profile?.status === 'pending') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-10 max-w-sm text-center">
          <div className="text-5xl mb-4">⏳</div>
          <h2 className="text-lg font-semibold text-slate-800 mb-2">账号审核中</h2>
          <p className="text-slate-500 text-sm mb-6">
            你的注册申请正在等待管理员审核，审核通过后即可使用所有功能。
          </p>
          <button
            onClick={logout}
            className="text-sm text-slate-400 hover:text-slate-600 transition-colors"
          >
            退出登录
          </button>
        </div>
      </div>
    )
  }

  if (profile?.status === 'disabled') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-10 max-w-sm text-center">
          <div className="text-5xl mb-4">🚫</div>
          <h2 className="text-lg font-semibold text-slate-800 mb-2">账号已停用</h2>
          <p className="text-slate-500 text-sm mb-6">你的账号已被管理员停用，如有疑问请联系团队负责人。</p>
          <button
            onClick={logout}
            className="text-sm text-slate-400 hover:text-slate-600 transition-colors"
          >
            退出登录
          </button>
        </div>
      </div>
    )
  }

  if (requireAdmin && profile?.role !== 'admin') {
    return <Navigate to="/dashboard" replace />
  }

  return children
}
