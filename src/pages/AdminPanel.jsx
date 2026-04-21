import { useEffect, useState } from 'react'
import { RefreshCw, UserCheck, UserX, ShieldCheck, Users, BarChart2, Eye, MousePointer } from 'lucide-react'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { listUsers, updateUser, ensureUserFields } from '../lib/teable'
import { useAuth } from '../contexts/AuthContext'
import { loadAnalytics } from '../lib/teableAnalytics'

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
    try {
      await ensureUserFields()
      setUsers(await listUsers())
    } finally { setLoading(false) }
  }

  async function handleStatusChange(uid, status) {
    setActionLoading(uid + status)
    try {
      await updateUser(uid, { status })
      setUsers(prev => prev.map(u => u.uid === uid ? { ...u, status } : u))
    } finally { setActionLoading(null) }
  }

  async function handleRoleChange(uid, role) {
    setActionLoading(uid + 'role')
    try {
      await updateUser(uid, { role })
      setUsers(prev => prev.map(u => u.uid === uid ? { ...u, role } : u))
    } catch(e) { alert('修改失败：' + e.message) }
    finally { setActionLoading(null) }
  }

  async function handleProfileChange(uid, fields) {
    setActionLoading(uid + 'profile')
    // 单选字段不能发空字符串给 Teable，过滤掉
    const clean = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== ''))
    try {
      if (Object.keys(clean).length > 0) {
        await updateUser(uid, clean)
      }
      setUsers(prev => prev.map(u => u.uid === uid ? { ...u, ...fields } : u))
    } catch(e) { alert('修改失败：' + e.message) }
    finally { setActionLoading(null) }
  }

  const [analytics, setAnalytics] = useState(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(true)

  useEffect(() => {
    loadAnalytics().then(d => { setAnalytics(d); setAnalyticsLoading(false) }).catch(() => setAnalyticsLoading(false))
  }, [])

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

      {/* 访问统计 */}
      <AnalyticsSection data={analytics} loading={analyticsLoading} />

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
                  {['姓名 / 邮箱','部门','小组','工号','状态','角色','OKR 负责组','注册时间','操作'].map((h,i) => (
                    <th key={h} className={`px-4 py-3 text-left text-[11px] font-semibold tracking-wide ${i===8?'text-right':''}`}
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
                    onRoleChange={handleRoleChange}
                    onProfileChange={handleProfileChange} />
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

// ─── 访问统计模块 ─────────────────────────────────────────────────────────────
function AnalyticsSection({ data, loading }) {
  const statCards = [
    { label: '今日 PV', value: data?.todayPV ?? 0, icon: <Eye className="w-4 h-4" />, clr: '#6366F1' },
    { label: '今日 UV', value: data?.todayUV ?? 0, icon: <Users className="w-4 h-4" />, clr: '#10B981' },
    { label: '本月 PV', value: data?.monthPV ?? 0, icon: <BarChart2 className="w-4 h-4" />, clr: '#0EA5E9' },
    { label: '本月 UV', value: data?.monthUV ?? 0, icon: <MousePointer className="w-4 h-4" />, clr: '#F59E0B' },
  ]

  return (
    <div className="space-y-3">
      {/* 标题 */}
      <div className="flex items-center gap-3 px-4 py-3 rounded-2xl"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: 'rgba(99,102,241,0.1)', color: '#6366F1' }}>
          <BarChart2 className="w-4 h-4" />
        </div>
        <div>
          <h3 className="font-semibold text-[14px] leading-none" style={{ color: 'var(--text)' }}>访问统计</h3>
          <p className="text-[11px] mt-1" style={{ color: 'var(--muted)' }}>网站 PV / UV 趋势 · 近 30 天</p>
        </div>
      </div>

      {loading ? (
        <div className="card p-10 flex items-center justify-center gap-3">
          <div className="w-5 h-5 rounded-full border-2 animate-spin"
            style={{ borderColor: 'rgba(99,102,241,0.2)', borderTopColor: '#6366F1' }} />
          <span className="text-sm" style={{ color: 'var(--muted)' }}>加载统计数据…</span>
        </div>
      ) : (
        <>
          {/* 4 个指标卡 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {statCards.map(s => (
              <div key={s.label} className="card p-4 flex flex-col gap-2">
                <div className="flex items-center gap-2" style={{ color: s.clr }}>
                  {s.icon}
                  <span className="text-xs font-medium" style={{ color: 'var(--muted)' }}>{s.label}</span>
                </div>
                <p className="text-2xl font-bold" style={{ color: s.clr }}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* PV/UV 趋势折线图 */}
          <div className="card p-5">
            <p className="text-[12px] font-semibold mb-4" style={{ color: 'var(--text)' }}>近 30 天访问趋势</p>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={data?.trend ?? []} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--muted)' }} tickLine={false} axisLine={false}
                  interval={4} />
                <YAxis yAxisId="left" tick={{ fontSize: 10, fill: '#6366F1' }} tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#10B981' }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12 }}
                  labelStyle={{ color: 'var(--text)', fontWeight: 600 }}
                  formatter={(v, name) => [v, name === 'pv' ? 'PV（访问次数）' : 'UV（独立访客）']}
                />
                <Line yAxisId="left" type="monotone" dataKey="pv" stroke="#6366F1" strokeWidth={2} dot={false} name="pv" />
                <Line yAxisId="right" type="monotone" dataKey="uv" stroke="#10B981" strokeWidth={2} dot={false} name="uv" />
              </LineChart>
            </ResponsiveContainer>
            <div className="flex gap-4 mt-3 justify-center">
              {[['#6366F1', 'PV 访问次数'], ['#10B981', 'UV 独立访客']].map(([clr, lbl]) => (
                <div key={lbl} className="flex items-center gap-1.5">
                  <div className="w-3 h-0.5 rounded" style={{ background: clr }} />
                  <span className="text-[11px]" style={{ color: 'var(--muted)' }}>{lbl}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 页面访问排行 */}
          {data?.pageRank?.length > 0 && (
            <div className="card p-5">
              <p className="text-[12px] font-semibold mb-4" style={{ color: 'var(--text)' }}>页面访问排行</p>
              <ResponsiveContainer width="100%" height={140}>
                <BarChart data={data.pageRank.slice(0, 6)} layout="vertical"
                  margin={{ top: 0, right: 32, bottom: 0, left: 8 }}>
                  <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--muted)' }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="page" tick={{ fontSize: 11, fill: 'var(--text)' }} tickLine={false} axisLine={false} width={90} />
                  <Tooltip
                    contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12 }}
                    formatter={v => [v, 'PV']}
                  />
                  <Bar dataKey="pv" fill="#6366F1" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  )
}

const DEPT_OPTS      = ['', '采购运营组', '集团采购部']
const GROUP_OPTS     = ['', '运营分析组', '采购稽核组', '供应商管理组']
const OKR_GROUP_OPTS = ['采购一组', '采购二组', '采购三组', '采购四组', '采购运营组']
const DEPT_CFG = {
  '采购运营组': { bg:'rgba(99,102,241,0.1)',  color:'#6366F1' },
  '集团采购部': { bg:'rgba(14,165,233,0.1)',  color:'#0284C7' },
}
const GROUP_CFG2 = {
  '运营分析组':  { bg:'rgba(16,185,129,0.1)', color:'#059669' },
  '采购稽核组':  { bg:'rgba(245,158,11,0.1)', color:'#B45309' },
  '供应商管理组':{ bg:'rgba(139,92,246,0.1)', color:'#7C3AED' },
}

function UserRow({ user: u, isSelf, actionLoading, onStatusChange, onRoleChange, onProfileChange }) {
  const sc = STATUS_CFG[u.status] ?? STATUS_CFG.pending
  const createdAt = u.createdAt ? new Date(u.createdAt).toLocaleDateString('zh-CN') : '—'
  const busy = actionLoading === u.uid + 'role' || actionLoading === u.uid + 'profile' ||
               actionLoading === u.uid + 'active' || actionLoading === u.uid + 'disabled'

  const deptCfg  = DEPT_CFG[u.dept]
  const groupCfg = GROUP_CFG2[u.group]

  return (
    <tr className="transition-colors"
      onMouseEnter={e => e.currentTarget.style.background='var(--surface2)'}
      onMouseLeave={e => e.currentTarget.style.background='transparent'}>

      {/* 姓名/邮箱 */}
      <td className="px-4 py-3.5">
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

      {/* 部门 */}
      <td className="px-4 py-3.5">
        {isSelf ? (
          deptCfg
            ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background:deptCfg.bg, color:deptCfg.color }}>{u.dept}</span>
            : <span style={{ color:'var(--muted)', opacity:0.4 }}>—</span>
        ) : (
          <select value={u.dept||''} onChange={e => onProfileChange(u.uid, { dept: e.target.value, group: '' })}
            disabled={busy} className="field text-xs py-1.5 px-2" style={{ width:'auto', minWidth:90 }}>
            {DEPT_OPTS.map(o => <option key={o} value={o}>{o || '未设置'}</option>)}
          </select>
        )}
      </td>

      {/* 小组（仅采购运营组） */}
      <td className="px-4 py-3.5">
        {u.dept !== '采购运营组' ? (
          <span style={{ color:'var(--muted)', opacity:0.3 }}>—</span>
        ) : isSelf ? (
          groupCfg
            ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background:groupCfg.bg, color:groupCfg.color }}>{u.group}</span>
            : <span style={{ color:'var(--muted)', opacity:0.4 }}>—</span>
        ) : (
          <select value={u.group||''} onChange={e => onProfileChange(u.uid, { group: e.target.value })}
            disabled={busy} className="field text-xs py-1.5 px-2" style={{ width:'auto', minWidth:100 }}>
            {GROUP_OPTS.map(o => <option key={o} value={o}>{o || '未设置'}</option>)}
          </select>
        )}
      </td>

      {/* 工号 */}
      <td className="px-4 py-3.5">
        {isSelf ? (
          <span className="text-[12px] font-mono" style={{ color:'var(--text)' }}>{u.jobId || '—'}</span>
        ) : (
          <input defaultValue={u.jobId||''} disabled={busy}
            onBlur={e => { const v = e.target.value.trim(); if (v !== (u.jobId||'')) onProfileChange(u.uid, { jobId: v }) }}
            placeholder="工号" className="field text-xs py-1.5 px-2 font-mono" style={{ width:80 }} />
        )}
      </td>

      {/* 状态 */}
      <td className="px-4 py-3.5">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap"
          style={{ background:sc.bg, color:sc.color }}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background:sc.dot }} />
          {sc.label}
        </span>
      </td>

      {/* 角色 */}
      <td className="px-4 py-3.5">
        {isSelf ? (
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-md"
            style={{ background:'rgba(99,102,241,0.1)', color:'#6366F1' }}>管理员（当前）</span>
        ) : (
          <select value={u.role||'member'} onChange={e => onRoleChange(u.uid, e.target.value)}
            disabled={busy} className="field text-xs py-1.5 px-2.5" style={{ width:'auto' }}>
            <option value="member">普通成员</option>
            <option value="admin">管理员</option>
          </select>
        )}
      </td>

      {/* OKR 负责组 */}
      <td className="px-4 py-3.5">
        {isSelf ? (
          u.okrGroup
            ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold"
                style={{ background:'rgba(37,99,235,0.1)', color:'#2563EB' }}>{u.okrGroup}</span>
            : <span style={{ color:'var(--muted)', opacity:0.3 }}>—</span>
        ) : (
          <select value={u.okrGroup||''} onChange={e => onProfileChange(u.uid, { okrGroup: e.target.value || null })}
            disabled={busy} className="field text-xs py-1.5 px-2" style={{ width:'auto', minWidth:90 }}>
            <option value="">无</option>
            {OKR_GROUP_OPTS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        )}
      </td>

      {/* 注册时间 */}
      <td className="px-4 py-3.5">
        <span className="text-xs font-mono" style={{ color:'var(--muted)' }}>{createdAt}</span>
      </td>

      {/* 操作 */}
      <td className="px-4 py-3.5 text-right">
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
