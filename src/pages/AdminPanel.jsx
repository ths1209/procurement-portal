import { useEffect, useState } from 'react'
import { RefreshCw, UserCheck, UserX, ShieldCheck, Users } from 'lucide-react'
import { listUsers, updateUser } from '../lib/teable'
import { useAuth } from '../contexts/AuthContext'

const STATUS_CFG = {
  pending:  { label:'待审批', bg:'rgba(245,158,11,0.12)',  color:'#B45309', dot:'#F59E0B' },
  active:   { label:'已激活', bg:'rgba(16,185,129,0.12)',  color:'#059669', dot:'#10B981' },
  disabled: { label:'已禁用', bg:'rgba(244,63,94,0.12)',   color:'#E11D48', dot:'#F43F5E' },
}

export default function AdminPanel() {
  const { user } = useAuth()
  const [users, setUsers]     = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter]   = useState('all')
  const [actionLoading, setActionLoading] = useState(null)

  useEffect(() => { fetchUsers() }, [])

  async function fetchUsers() {
    setLoading(true)
    try { setUsers(await listUsers()) } finally { setLoading(false) }
  }

  async function handleStatusChange(uid, status) {
    setActionLoading(uid + status)
    try {
      await updateUser(uid, { status })
      setUsers(prev => prev.map(u => u.uid === uid ? { ...u, status } : u))
    } finally { setActionLoading(null) }
  }

  async function handleRoleChange(uid, role) {
    setActionLoading(uid + role)
    try {
      await updateUser(uid, { role })
      setUsers(prev => prev.map(u => u.uid === uid ? { ...u, role } : u))
    } finally { setActionLoading(null) }
  }

  const filtered = filter === 'all' ? users : users.filter(u => u.status === filter)
  const counts = {
    all:      users.length,
    pending:  users.filter(u => u.status === 'pending').length,
    active:   users.filter(u => u.status === 'active').length,
    disabled: users.filter(u => u.status === 'disabled').length,
  }

  return (
    <div className="space-y-5 animate-page-in">
      {/* 页头 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold" style={{ color:'var(--text)' }}>用户管理</h2>
          <p className="text-sm mt-0.5" style={{ color:'var(--muted)' }}>审核成员申请，管理账号权限</p>
        </div>
        <button onClick={fetchUsers} disabled={loading}
          className="press flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium disabled:opacity-50"
          style={{ background:'var(--surface)', border:'1px solid var(--border)', color:'var(--muted)' }}>
          <RefreshCw className={`w-3.5 h-3.5 ${loading?'animate-spin':''}`} />刷新
        </button>
      </div>

      {/* 统计筛选 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { key:'all',      label:'全部成员', n:counts.all,      icon:<Users className="w-4 h-4" />,        clr:'#6366F1' },
          { key:'pending',  label:'待审批',   n:counts.pending,  icon:<ShieldCheck className="w-4 h-4" />,  clr:'#F59E0B' },
          { key:'active',   label:'已激活',   n:counts.active,   icon:<UserCheck className="w-4 h-4" />,    clr:'#10B981' },
          { key:'disabled', label:'已禁用',   n:counts.disabled, icon:<UserX className="w-4 h-4" />,        clr:'#F43F5E' },
        ].map(s => (
          <button key={s.key} onClick={() => setFilter(s.key)}
            className="press card p-4 text-left"
            style={filter===s.key ? { borderColor:s.clr, boxShadow:`0 0 0 1px ${s.clr}33, 0 4px 20px ${s.clr}20` } : {}}>
            <div className="flex items-center gap-2 mb-2" style={{ color: filter===s.key ? s.clr : 'var(--muted)' }}>
              {s.icon}
              <span className="text-xs font-medium">{s.label}</span>
            </div>
            <p className="text-2xl font-bold" style={{ color: filter===s.key ? s.clr : 'var(--text)' }}>{s.n}</p>
          </button>
        ))}
      </div>

      {/* 用户表 */}
      {loading ? (
        <div className="card p-16 flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 animate-spin"
            style={{ borderColor:'rgba(99,102,241,0.2)', borderTopColor:'#6366F1' }} />
          <p className="text-sm" style={{ color:'var(--muted)' }}>加载中…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-16 text-center">
          <p className="text-4xl mb-3">👤</p>
          <p className="text-sm" style={{ color:'var(--muted)' }}>暂无用户</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom:'1px solid var(--border)', background:'var(--surface2)' }}>
                  {['姓名 / 邮箱','状态','角色','注册时间','操作'].map((h,i) => (
                    <th key={h} className={`px-5 py-3 text-left text-[11px] font-semibold tracking-wide ${i===4?'text-right':''}`}
                      style={{ color:'var(--muted)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor:'var(--border)' }}>
                {filtered.map(u => (
                  <UserRow key={u.uid} user={u}
                    isSelf={u.uid === user?.uid || u.email === user?.email}
                    actionLoading={actionLoading}
                    onStatusChange={handleStatusChange}
                    onRoleChange={handleRoleChange} />
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-2.5 text-[11px] font-medium" style={{ borderTop:'1px solid var(--border)', color:'var(--muted)' }}>
            {filtered.length} 条{filtered.length < users.length ? ` / 共 ${users.length} 条` : ''}
          </div>
        </div>
      )}
    </div>
  )
}

function UserRow({ user: u, isSelf, actionLoading, onStatusChange, onRoleChange }) {
  const sc = STATUS_CFG[u.status] ?? STATUS_CFG.pending
  const createdAt = u.createdAt ? new Date(u.createdAt).toLocaleDateString('zh-CN') : '—'

  return (
    <tr className="transition-colors"
      onMouseEnter={e => e.currentTarget.style.background='var(--surface2)'}
      onMouseLeave={e => e.currentTarget.style.background='transparent'}>
      <td className="px-5 py-3.5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold text-white shrink-0"
            style={{ background:'linear-gradient(135deg,#6366F1,#0EA5E9)' }}>
            {(u.displayName||u.email||'?')[0].toUpperCase()}
          </div>
          <div>
            <p className="font-medium text-[13px]" style={{ color:'var(--text)' }}>{u.displayName||'—'}</p>
            <p className="text-xs" style={{ color:'var(--muted)' }}>{u.email}</p>
          </div>
        </div>
      </td>
      <td className="px-5 py-3.5">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap"
          style={{ background:sc.bg, color:sc.color }}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background:sc.dot }} />
          {sc.label}
        </span>
      </td>
      <td className="px-5 py-3.5">
        {isSelf ? (
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-md"
            style={{ background:'rgba(99,102,241,0.1)', color:'#6366F1' }}>管理员（当前）</span>
        ) : (
          <select value={u.role||'member'} onChange={e => onRoleChange(u.uid, e.target.value)}
            disabled={!!actionLoading}
            className="field text-xs py-1.5 px-2.5" style={{ width:'auto' }}>
            <option value="member">普通成员</option>
            <option value="admin">管理员</option>
          </select>
        )}
      </td>
      <td className="px-5 py-3.5">
        <span className="text-xs font-mono" style={{ color:'var(--muted)' }}>{createdAt}</span>
      </td>
      <td className="px-5 py-3.5 text-right">
        {!isSelf && (
          <div className="flex items-center justify-end gap-1.5">
            {u.status !== 'active' && (
              <ActionBtn label="激活" color="#059669" bg="rgba(16,185,129,0.1)" border="rgba(16,185,129,0.2)"
                loading={actionLoading === u.uid+'active'} onClick={() => onStatusChange(u.uid,'active')} />
            )}
            {u.status === 'active' && (
              <ActionBtn label="禁用" color="#E11D48" bg="rgba(244,63,94,0.08)" border="rgba(244,63,94,0.18)"
                loading={actionLoading === u.uid+'disabled'} onClick={() => onStatusChange(u.uid,'disabled')} />
            )}
          </div>
        )}
      </td>
    </tr>
  )
}

function ActionBtn({ label, color, bg, border, loading, onClick }) {
  return (
    <button onClick={onClick} disabled={loading}
      className="press flex items-center px-2.5 py-1.5 rounded-xl text-[11px] font-medium disabled:opacity-50"
      style={{ background:bg, color, border:`1px solid ${border}` }}>
      {loading ? '…' : label}
    </button>
  )
}
