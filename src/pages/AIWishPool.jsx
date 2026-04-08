import { useState, useEffect, useMemo } from 'react'
import { Sparkles, Plus, RefreshCw, ChevronDown, CheckCircle2, XCircle,
         Clock, Eye, Trash2, UserCheck, X, History, Zap, CircleDot } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  isAIConfigured, ensureAIFields,
  listAI, createAI, approveAI, followAI, updateFollowStatus, deleteAI,
  FOLLOW_STATUS_OPTS, URGENCY_OPTS,
} from '../lib/teableAI'

// ─── 设计 Token ───────────────────────────────────────────────────────────────
const ACCENT   = '#2563EB'
const ACCENT_S = '#0EA5E9'   // 次级蓝（用于渐变）

const FOLLOW_CFG = {
  '待跟进': { color: '#64748B', bg: 'rgba(100,116,139,0.1)', icon: Clock        },
  '跟进中': { color: '#2563EB', bg: 'rgba(37,99,235,0.1)',   icon: Zap          },
  '已完成': { color: '#22C55E', bg: 'rgba(34,197,94,0.1)',   icon: CheckCircle2 },
}

const URGENCY_CFG = {
  '紧急':   { color: '#EF4444', bg: 'rgba(239,68,68,0.1)',   label: '紧急'   },
  '较紧急': { color: '#F97316', bg: 'rgba(249,115,22,0.1)',  label: '较紧急' },
  '一般':   { color: '#F59E0B', bg: 'rgba(245,158,11,0.1)',  label: '一般'   },
  '低优先': { color: '#22C55E', bg: 'rgba(34,197,94,0.1)',   label: '低优先' },
}

// 分组顺序
const GROUP_ORDER = ['跟进中', '待跟进', '已完成']

// Hero 技术网格节点
const NODES = [
  { x: '6%',  y: '22%', d: 0   }, { x: '18%', y: '72%', d: 0.7 },
  { x: '32%', y: '14%', d: 1.4 }, { x: '45%', y: '58%', d: 0.3 },
  { x: '58%', y: '28%', d: 1.9 }, { x: '72%', y: '68%', d: 1.1 },
  { x: '83%', y: '18%', d: 0.5 }, { x: '93%', y: '52%', d: 1.6 },
  { x: '26%', y: '46%', d: 2.2 }, { x: '64%', y: '82%', d: 0.9 },
]

// ─── 权限 ─────────────────────────────────────────────────────────────────────
// 兼容「张三」和「张三-12345」两种格式
function matchesUser(stored, displayName) {
  if (!stored || !displayName) return false
  return stored === displayName || stored.startsWith(displayName + '-')
}
function canClaimOrFollow(item, currentUser, isAdmin, isOps) {
  if (!isOps) return false
  if (!item.follower) return true
  return matchesUser(item.follower, currentUser) || isAdmin
}
function canDel(item, currentUser, isAdmin) {
  if (isAdmin) return true
  return !!(item.follower && matchesUser(item.follower, currentUser))
}

// ─── 主页面 ───────────────────────────────────────────────────────────────────
export default function AIWishPool() {
  const { profile } = useAuth()
  const isAdmin     = profile?.role === 'admin'
  const isOps       = isAdmin || profile?.dept === '采购运营组'
  const currentUser = profile?.displayName || profile?.email || ''
  // 姓名-工号 格式，用于写入 Teable
  const userLabel   = profile?.displayName
    ? (profile.jobId ? `${profile.displayName}-${profile.jobId}` : profile.displayName)
    : (profile?.email || '')

  const [approved, setApproved] = useState([])
  const [pending,  setPending]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')
  const [showForm, setShowForm] = useState(false)
  const [detail,   setDetail]   = useState(null)
  const [collapsed, setCollapsed] = useState({})

  async function load() {
    setLoading(true)
    try {
      await ensureAIFields()
      const data = await listAI()
      setApproved(data.approved)
      setPending(data.pending)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    if (!search) return approved
    const q = search.toLowerCase()
    return approved.filter(r =>
      r.scene?.toLowerCase().includes(q) ||
      r.asis?.toLowerCase().includes(q)  ||
      r.tobe?.toLowerCase().includes(q)  ||
      r.submitter?.toLowerCase().includes(q)
    )
  }, [approved, search])

  // 按跟进状态分组
  const grouped = useMemo(() => {
    const g = { '跟进中': [], '待跟进': [], '已完成': [] }
    for (const r of filtered) {
      const k = r.followStatus || '待跟进'
      ;(g[k] ?? g['待跟进']).push(r)
    }
    return g
  }, [filtered])

  const stats = useMemo(() => ({
    total:    approved.length,
    active:   approved.filter(r => r.followStatus === '跟进中').length,
    pending:  pending.length,
    done:     approved.filter(r => r.followStatus === '已完成').length,
  }), [approved, pending])

  function toggleCollapse(k) {
    setCollapsed(c => ({ ...c, [k]: !c[k] }))
  }

  if (!isAIConfigured()) {
    return (
      <div className="max-w-xl mx-auto mt-20 text-center space-y-3">
        <Sparkles className="w-10 h-10 mx-auto wish-float" style={{ color: ACCENT, opacity: 0.5 }} />
        <p className="font-semibold" style={{ color: 'var(--text)' }}>AI 需求池未配置</p>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>请配置 <code>VITE_TEABLE_AI_TABLE_ID</code></p>
      </div>
    )
  }

  return (
    <div className="space-y-5 max-w-6xl mx-auto">

      {/* ── Hero ── */}
      <div className="relative overflow-hidden rounded-2xl px-6 py-6"
        style={{
          background: `
            linear-gradient(rgba(37,99,235,0.055) 1px, transparent 1px),
            linear-gradient(90deg, rgba(37,99,235,0.055) 1px, transparent 1px),
            linear-gradient(135deg, rgba(37,99,235,0.1) 0%, rgba(14,165,233,0.05) 100%)
          `,
          backgroundSize: '28px 28px, 28px 28px, 100% 100%',
          border: '1px solid rgba(37,99,235,0.2)',
        }}>

        {/* 节点粒子 */}
        {NODES.map((n, i) => (
          <span key={i} className="absolute twinkle pointer-events-none"
            style={{
              left: n.x, top: n.y,
              width: 3, height: 3,
              background: ACCENT, opacity: 0.5, borderRadius: 1,
              animationDelay: `${n.d}s`,
            }} />
        ))}

        {/* 右侧光晕 */}
        <div className="absolute right-0 top-0 w-64 h-full pointer-events-none"
          style={{ background: `radial-gradient(ellipse at right center, ${ACCENT_S}18 0%, transparent 70%)` }} />

        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          {/* 标题 */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center wish-float"
              style={{
                background: `rgba(37,99,235,0.12)`,
                border: `1px solid rgba(37,99,235,0.25)`,
                boxShadow: `0 0 16px rgba(37,99,235,0.2)`,
              }}>
              <Sparkles className="w-5 h-5" style={{ color: ACCENT }} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight" style={{ color: 'var(--text)' }}>AI 需求池</h1>
              </div>
              <p className="text-[12px] mt-0.5 font-mono" style={{ color: 'var(--muted)' }}>
                AI_WISH_POOL · {stats.total} WISHES LOADED
              </p>
            </div>
          </div>

          {/* 数据指示器 + 按钮 */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <TechStat label="ACTIVE" value={stats.active} color={ACCENT}       />
              <TechStat label="QUEUE"  value={stats.pending} color="#F59E0B" show={isAdmin} />
              <TechStat label="DONE"   value={stats.done}   color="#22C55E"       />
            </div>
            <div className="h-6 w-px" style={{ background: 'rgba(37,99,235,0.25)' }} />
            <button onClick={load} disabled={loading}
              className="press flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-medium"
              style={{ background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(37,99,235,0.22)', color: ACCENT }}>
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'SYNC...' : 'REFRESH'}
            </button>
            <button onClick={() => setShowForm(true)}
              className="press flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-semibold text-white"
              style={{ background: ACCENT, boxShadow: `0 4px 14px rgba(37,99,235,0.38)` }}>
              <Plus className="w-3.5 h-3.5" />
              许个愿
            </button>
          </div>
        </div>
      </div>

      {/* ── 管理员待审批 ── */}
      {isAdmin && pending.length > 0 && (
        <PendingQueue items={pending} userLabel={userLabel} onRefresh={load} />
      )}

      {/* ── 搜索栏 ── */}
      <div className="flex items-center gap-3">
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="/ 搜索应用场景、提交人…"
          className="field font-mono text-sm"
          style={{ maxWidth: 300 }}
        />
        {search && (
          <button onClick={() => setSearch('')}
            className="press text-xs px-2 py-1 rounded-lg"
            style={{ color: 'var(--muted)', background: 'var(--surface2)' }}>
            ✕ 清除
          </button>
        )}
      </div>

      {/* ── 分组卡片区 ── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <div className="relative w-10 h-10">
            <div className="absolute inset-0 rounded-full border-2 animate-spin"
              style={{ borderColor: `${ACCENT}25`, borderTopColor: ACCENT }} />
            <div className="absolute inset-2 rounded-full border animate-spin"
              style={{ borderColor: `${ACCENT_S}30`, borderTopColor: ACCENT_S, animationDirection: 'reverse', animationDuration: '0.7s' }} />
          </div>
          <p className="text-xs font-mono" style={{ color: ACCENT, opacity: 0.6 }}>LOADING WISHES...</p>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState search={search} onSubmit={() => setShowForm(true)} />
      ) : (
        <div className="space-y-7">
          {GROUP_ORDER.map(groupKey => {
            const items = grouped[groupKey] || []
            const cfg   = FOLLOW_CFG[groupKey]
            const Icon  = cfg.icon
            if (items.length === 0 && groupKey !== '待跟进') return null
            return (
              <div key={groupKey} className="space-y-3">
                {/* 分组标题栏 */}
                <button className="w-full flex items-center gap-2.5 group"
                  onClick={() => toggleCollapse(groupKey)}>
                  <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: cfg.color }} />
                  <span className="text-[11px] font-mono font-bold tracking-widest"
                    style={{ color: cfg.color }}>
                    {groupKey.toUpperCase()}
                  </span>
                  <span className="text-[11px] font-mono font-bold px-1.5 py-0.5 rounded-md"
                    style={{ background: cfg.bg, color: cfg.color }}>
                    {items.length}
                  </span>
                  <div className="flex-1 h-px" style={{ background: `${cfg.color}22` }} />
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform duration-200 ${collapsed[groupKey] ? '-rotate-90' : ''}`}
                    style={{ color: `${cfg.color}66` }} />
                </button>

                {/* 卡片网格 */}
                {!collapsed[groupKey] && (
                  items.length === 0 ? (
                    <p className="text-xs font-mono py-4 pl-2" style={{ color: 'var(--muted)', opacity: 0.5 }}>
                      — NO ITEMS —
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 stagger">
                      {items.map(item => (
                        <WishCard
                          key={item._id}
                          item={item}
                          isOps={isOps}
                          isAdmin={isAdmin}
                          currentUser={currentUser}
                          userLabel={userLabel}
                          onRefresh={load}
                          onDetail={() => setDetail(item)}
                        />
                      ))}
                    </div>
                  )
                )}
              </div>
            )
          })}
        </div>
      )}

      {showForm && (
        <SubmitModal
          submitter={userLabel}
          onClose={() => setShowForm(false)}
          onSuccess={() => { setShowForm(false); load() }}
        />
      )}
      {detail && <DetailModal item={detail} onClose={() => setDetail(null)} />}
    </div>
  )
}

// ─── 技术风格数据块 ───────────────────────────────────────────────────────────
function TechStat({ label, value, color, show = true }) {
  if (!show) return null
  return (
    <div className="flex flex-col items-center px-2.5 py-1.5 rounded-lg"
      style={{ background: `${color}0e`, border: `1px solid ${color}22` }}>
      <span className="text-base font-mono font-bold leading-none" style={{ color }}>{value}</span>
      <span className="text-[9px] font-mono tracking-widest mt-0.5" style={{ color: `${color}99` }}>{label}</span>
    </div>
  )
}

// ─── 待审批队列 ───────────────────────────────────────────────────────────────
function PendingQueue({ items, userLabel, onRefresh }) {
  const [busy, setBusy] = useState({})

  async function handle(item, approved) {
    setBusy(b => ({ ...b, [item._id]: true }))
    try { await approveAI(item._id, approved, userLabel || '管理员', item.history); onRefresh() }
    catch (e) { alert(e.message) }
    finally { setBusy(b => ({ ...b, [item._id]: false })) }
  }

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ border: '1px solid rgba(245,158,11,0.3)', background: 'rgba(245,158,11,0.03)' }}>
      <div className="flex items-center gap-2 px-5 py-3"
        style={{ borderBottom: '1px solid rgba(245,158,11,0.15)' }}>
        <Clock className="w-3.5 h-3.5" style={{ color: '#F59E0B' }} />
        <span className="text-[11px] font-mono font-bold tracking-widest" style={{ color: '#F59E0B' }}>
          PENDING_REVIEW
        </span>
        <span className="text-[11px] font-mono font-bold px-1.5 py-0.5 rounded-md"
          style={{ background: 'rgba(245,158,11,0.15)', color: '#F59E0B' }}>{items.length}</span>
      </div>
      <div className="divide-y" style={{ borderColor: 'rgba(245,158,11,0.08)' }}>
        {items.map(item => (
          <div key={item._id} className="px-5 py-3.5 flex items-start gap-4">
            <div className="flex-1 min-w-0 space-y-0.5">
              <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{item.scene}</p>
              {item.asis && (
                <p className="text-xs line-clamp-1" style={{ color: 'var(--muted)' }}>{item.asis}</p>
              )}
              <p className="text-[11px] font-mono" style={{ color: 'var(--muted)' }}>
                {item.submitter} · {item.submittedAt ? new Date(item.submittedAt).toLocaleDateString('zh-CN') : ''}
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button disabled={busy[item._id]} onClick={() => handle(item, true)}
                className="press flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
                style={{ background: '#22C55E', boxShadow: '0 2px 8px rgba(34,197,94,0.3)' }}>
                <CheckCircle2 className="w-3 h-3" />通过
              </button>
              <button disabled={busy[item._id]} onClick={() => handle(item, false)}
                className="press flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
                style={{ background: 'rgba(239,68,68,0.1)', color: '#EF4444' }}>
                <XCircle className="w-3 h-3" />拒绝
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── 需求卡片 ─────────────────────────────────────────────────────────────────
function WishCard({ item, isOps, isAdmin, currentUser, userLabel, onRefresh, onDetail }) {
  const [showFollow, setShowFollow] = useState(false)
  const [busy, setBusy] = useState(false)

  const canFollow  = canClaimOrFollow(item, currentUser, isAdmin, isOps)
  const canDelete  = canDel(item, currentUser, isAdmin)
  const fc = FOLLOW_CFG[item.followStatus] || FOLLOW_CFG['待跟进']
  const uc = URGENCY_CFG[item.urgency]
  const topBorderColor = uc?.color ?? ACCENT

  async function handleFollowStatus(status) {
    setBusy(true); setShowFollow(false)
    try {
      if (!item.follower) await followAI(item._id, userLabel, status, userLabel, item.history)
      else await updateFollowStatus(item._id, status, userLabel, item.history, item.followStatus)
      onRefresh()
    } catch (e) { alert(e.message) }
    finally { setBusy(false) }
  }

  async function handleDelete() {
    if (!confirm(`删除愿望「${item.scene}」？`)) return
    try { await deleteAI(item._id); onRefresh() }
    catch (e) { alert(e.message) }
  }

  return (
    <div
      className="wish-card card flex flex-col h-full"
      style={{ borderTop: `3px solid ${topBorderColor}`, position: 'relative', overflow: 'hidden' }}
      onClick={() => setShowFollow(false)}
    >
      {/* 标题行 */}
      <div className="px-4 pt-4 pb-3 flex items-start gap-2"
        style={{ borderBottom: '1px solid var(--border)' }}>
        <p className="flex-1 text-[13px] font-bold leading-snug min-w-0" style={{ color: 'var(--text)' }}>
          {item.scene || '（无标题）'}
        </p>

        {/* 优先级只读 badge */}
        {uc && (
          <span className="flex items-center gap-1 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md shrink-0"
            style={{ background: uc.bg, color: uc.color, border: `1px solid ${uc.color}33` }}>
            <CircleDot className="w-2.5 h-2.5" />
            {uc.label}
          </span>
        )}
      </div>

      {/* 内容 */}
      <div className="flex-1 px-4 py-3 space-y-2.5">
        {item.asis && <FieldBlock label="AS-IS" color={ACCENT}    text={item.asis} />}
        {item.tobe && <FieldBlock label="TO-BE" color={ACCENT_S}  text={item.tobe} />}
        {item.roi  && <FieldBlock label="ROI"   color="#22C55E"   text={item.roi}  lines={2} />}
      </div>

      {/* 人员 badges */}
      <div className="px-4 pt-2.5 pb-2 flex items-center gap-1.5 flex-wrap"
        style={{ borderTop: '1px solid var(--border)' }}>
        <PersonBadge name={item.submitter} role="提交" />
        {item.follower && <PersonBadge name={item.follower} role="跟进" accent />}
      </div>

      {/* 操作栏 */}
      <div className="px-4 pb-3 flex items-center justify-between gap-2">
        {/* 跟进状态 */}
        <div className="relative" onClick={e => e.stopPropagation()}>
          {isOps ? (
            <>
              <button
                disabled={busy || !canFollow}
                onClick={() => setShowFollow(v => !v)}
                className={`press flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg ${canFollow ? '' : 'opacity-50 cursor-not-allowed'}`}
                style={{ background: fc.bg, color: fc.color }}
                title={!canFollow ? `仅跟进人或 admin 可修改` : undefined}>
                <UserCheck className="w-3 h-3" />
                {item.followStatus || '待跟进'}
                {canFollow && <ChevronDown className="w-2.5 h-2.5" />}
              </button>
              {showFollow && canFollow && (
                <div className="absolute left-0 bottom-full mb-1.5 z-20 rounded-xl shadow-xl overflow-hidden"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)', minWidth: 108 }}>
                  {FOLLOW_STATUS_OPTS.map(opt => {
                    const c = FOLLOW_CFG[opt]
                    return (
                      <button key={opt} onClick={() => handleFollowStatus(opt)}
                        className="w-full text-left px-3 py-2 text-xs font-medium hover:opacity-80"
                        style={{ color: c.color, background: item.followStatus === opt ? c.bg : 'transparent' }}>
                        {opt}
                      </button>
                    )
                  })}
                </div>
              )}
            </>
          ) : (
            <span className="text-[11px] font-semibold px-2 py-1 rounded-lg"
              style={{ background: fc.bg, color: fc.color }}>
              {item.followStatus || '待跟进'}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button onClick={onDetail}
            className="press flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg font-medium"
            style={{ background: 'var(--surface2)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
            <Eye className="w-3 h-3" />详情
          </button>
          {canDelete && (
            <button onClick={handleDelete}
              className="press w-7 h-7 flex items-center justify-center rounded-lg opacity-25 hover:opacity-100 transition-opacity"
              style={{ color: '#EF4444' }}>
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// 姓名-工号 badge
function PersonBadge({ name, role, accent }) {
  if (!name) return null
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-md leading-none"
      style={accent
        ? { background: `rgba(37,99,235,0.1)`, color: ACCENT, border: `1px solid rgba(37,99,235,0.2)` }
        : { background: 'var(--surface2)', color: 'var(--muted)', border: '1px solid var(--border)' }
      }>
      <span style={{ opacity: 0.55 }}>{role}</span>
      <span>{name}</span>
    </span>
  )
}

function FieldBlock({ label, color, text, lines = 3 }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[9px] font-mono font-bold tracking-widest" style={{ color, opacity: 0.7 }}>{label}</p>
      <p className={`text-xs leading-relaxed line-clamp-${lines}`} style={{ color: 'var(--text)', opacity: 0.8 }}>{text}</p>
    </div>
  )
}

// ─── 空状态 ───────────────────────────────────────────────────────────────────
function EmptyState({ search, onSubmit }) {
  return (
    <div className="flex flex-col items-center py-20 space-y-4">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center wish-float"
        style={{
          background: `rgba(37,99,235,0.08)`,
          border: `1px solid rgba(37,99,235,0.2)`,
          boxShadow: `0 0 24px rgba(37,99,235,0.12)`,
        }}>
        <Sparkles className="w-6 h-6" style={{ color: ACCENT, opacity: 0.7 }} />
      </div>
      {search ? (
        <>
          <p className="font-semibold" style={{ color: 'var(--text)' }}>NO MATCH FOUND</p>
          <p className="text-sm font-mono" style={{ color: 'var(--muted)' }}>尝试其他关键词</p>
        </>
      ) : (
        <>
          <p className="font-semibold tracking-tight" style={{ color: 'var(--text)' }}>需求池为空</p>
          <p className="text-sm text-center max-w-xs" style={{ color: 'var(--muted)' }}>
            提交你的 AI 场景需求，等待审批后公开展示
          </p>
          <button onClick={onSubmit}
            className="press flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
            style={{
              background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_S})`,
              boxShadow: `0 4px 16px rgba(37,99,235,0.35)`,
            }}>
            <Plus className="w-4 h-4" />提交需求
          </button>
        </>
      )}
    </div>
  )
}

// ─── 详情弹窗 ─────────────────────────────────────────────────────────────────
function DetailModal({ item, onClose }) {
  const uc  = URGENCY_CFG[item.urgency]
  const fc  = FOLLOW_CFG[item.followStatus] || FOLLOW_CFG['待跟进']
  const topColor = uc?.color ?? ACCENT

  return createPortal(
    <div className="fixed inset-0 z-[200] overflow-y-auto animate-fade-in"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(10px)' }}
      onClick={onClose}>
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderTop: `3px solid ${topColor}`,
          }}
          onClick={e => e.stopPropagation()}>

          <div className="flex items-center justify-between px-5 py-4"
            style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
              <Sparkles className="w-4 h-4 shrink-0" style={{ color: topColor }} />
              <h3 className="font-semibold text-[15px] truncate" style={{ color: 'var(--text)' }}>
                {item.scene}
              </h3>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 ml-3">
              {uc && (
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md"
                  style={{ background: uc.bg, color: uc.color }}>{uc.label}</span>
              )}
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-lg"
                style={{ background: fc.bg, color: fc.color }}>{item.followStatus || '待跟进'}</span>
              <button onClick={onClose}
                className="press w-7 h-7 flex items-center justify-center rounded-xl"
                style={{ background: 'var(--surface2)', color: 'var(--muted)' }}>
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="p-5 space-y-5">
            <Section label="AS-IS 现状痛点" color={ACCENT}    content={item.asis} />
            <Section label="TO-BE 优化方案" color={ACCENT_S}  content={item.tobe} />
            <Section label="ROI 预期收益"   color="#22C55E"   content={item.roi}  />

            <div className="grid grid-cols-2 gap-4 pt-1"
              style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              <Info label="提交人" value={item.submitter} />
              <Info label="提交时间" value={item.submittedAt ? new Date(item.submittedAt).toLocaleString('zh-CN') : '—'} />
              {item.follower && <Info label="跟进人" value={item.follower} />}
            </div>

            {item.history && <HistoryTimeline history={item.history} accentColor={topColor} />}
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

function Section({ label, color, content }) {
  if (!content) return null
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-mono font-bold uppercase tracking-widest" style={{ color, opacity: 0.8 }}>
        {label}
      </p>
      <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text)', opacity: 0.85 }}>
        {content}
      </p>
    </div>
  )
}

function Info({ label, value }) {
  return (
    <div>
      <p className="text-[10px] font-mono font-semibold mb-0.5 tracking-widest" style={{ color: 'var(--muted)', opacity: 0.7 }}>{label}</p>
      <p className="text-[13px]" style={{ color: 'var(--text)' }}>{value || '—'}</p>
    </div>
  )
}

// ─── 历史时间线 ───────────────────────────────────────────────────────────────
function HistoryTimeline({ history, accentColor }) {
  const entries = history.split('\n').filter(Boolean).reverse()
  return (
    <div className="space-y-3" style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
      <div className="flex items-center gap-1.5">
        <History className="w-3 h-3" style={{ color: 'var(--muted)' }} />
        <p className="text-[10px] font-mono font-bold tracking-widest" style={{ color: 'var(--muted)', opacity: 0.6 }}>
          CHANGE LOG
        </p>
      </div>
      <div className="relative pl-4 space-y-3">
        <div className="absolute left-1 top-2 bottom-2 w-px" style={{ background: 'var(--border)' }} />
        {entries.map((e, i) => {
          const [ts, user, ...rest] = e.split(' | ')
          const action = rest.join(' | ') || e
          return (
            <div key={i} className="flex items-start gap-2.5 relative">
              <div className="absolute -left-[11px] mt-1.5 w-2 h-2 rounded-full shrink-0 z-10"
                style={{
                  background: i === 0 ? accentColor : 'var(--surface2)',
                  border: `2px solid ${i === 0 ? accentColor : 'var(--border)'}`,
                }} />
              <div className="flex-1">
                <p className="text-[12px]" style={{ color: 'var(--text)', opacity: i === 0 ? 0.9 : 0.6 }}>
                  {action}
                </p>
                <p className="text-[10px] font-mono mt-0.5" style={{ color: 'var(--muted)' }}>
                  {user}{user && ts ? ' · ' : ''}{ts}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── 提交弹窗 ─────────────────────────────────────────────────────────────────
function SubmitModal({ submitter, onClose, onSuccess }) {
  const [form,   setForm]   = useState({ scene: '', asis: '', tobe: '', roi: '', urgency: '' })
  const [saving, setSaving] = useState(false)
  const [err,    setErr]    = useState('')
  const [done,   setDone]   = useState(false)

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function submit(e) {
    e.preventDefault()
    if (!form.scene.trim()) { setErr('请填写应用场景'); return }
    if (!form.asis.trim())  { setErr('请填写现状痛点 (AS-IS)'); return }
    if (!form.tobe.trim())  { setErr('请填写优化方案 (TO-BE)'); return }
    if (!form.roi.trim())   { setErr('请填写预期收益 (ROI)'); return }
    setSaving(true); setErr('')
    try { await createAI(form, submitter); setDone(true); setTimeout(onSuccess, 1600) }
    catch(e) { setErr(e.message) }
    finally { setSaving(false) }
  }

  const FIELDS = [
    { key: 'scene', label: 'SCENE — 应用场景',    rows: 2, ph: '描述 AI 需求的应用场景' },
    { key: 'asis',  label: 'AS-IS — 现状痛点',    rows: 3, ph: '目前工作方式的痛点' },
    { key: 'tobe',  label: 'TO-BE — 优化方案',    rows: 3, ph: '期望 AI 如何改善' },
    { key: 'roi',   label: 'ROI — 预期收益',      rows: 2, ph: '预计节省多少时间/人力' },
  ]

  return createPortal(
    <div className="fixed inset-0 z-[200] overflow-y-auto animate-fade-in"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(10px)' }}
      onClick={onClose}>
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="w-full max-w-lg rounded-2xl shadow-2xl animate-scale-in overflow-hidden"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderTop: `3px solid ${ACCENT}`,
          }}
          onClick={e => e.stopPropagation()}>

          <div className="flex items-center justify-between px-5 py-4"
            style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-4 h-4" style={{ color: ACCENT }} />
              <h3 className="font-semibold text-[15px]" style={{ color: 'var(--text)' }}>提交 AI 需求</h3>
            </div>
            <button onClick={onClose}
              className="press w-7 h-7 flex items-center justify-center rounded-xl"
              style={{ background: 'var(--surface2)', color: 'var(--muted)' }}>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {done ? (
            <div className="p-10 flex flex-col items-center gap-3">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center wish-float"
                style={{ background: `rgba(37,99,235,0.1)`, border: `1px solid rgba(37,99,235,0.2)` }}>
                <Sparkles className="w-7 h-7" style={{ color: ACCENT }} />
              </div>
              <p className="font-semibold text-[15px]" style={{ color: 'var(--text)' }}>提交成功 ✦</p>
              <p className="text-sm text-center" style={{ color: 'var(--muted)' }}>
                需求已提交，等待管理员审批
              </p>
            </div>
          ) : (
            <form onSubmit={submit} className="p-5 space-y-4">
              <p className="text-xs font-mono rounded-xl px-3 py-2.5"
                style={{ background: `rgba(37,99,235,0.07)`, color: ACCENT }}>
                // 审批通过后将在需求池中公开展示
              </p>

              {/* 紧急程度选择 */}
              <div>
                <p className="text-[10px] font-mono font-bold tracking-widest mb-2"
                  style={{ color: 'var(--text)', opacity: 0.5 }}>
                  URGENCY — 需求紧急程度
                </p>
                <div className="flex gap-2 flex-wrap">
                  {['', ...URGENCY_OPTS].map(u => {
                    const c = URGENCY_CFG[u]
                    const active = form.urgency === u
                    return (
                      <button key={u} type="button"
                        onClick={() => set('urgency', u)}
                        className="press flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                        style={active && c
                          ? { background: c.bg, color: c.color, border: `1.5px solid ${c.color}66`, boxShadow: `0 2px 8px ${c.color}33` }
                          : active
                            ? { background: 'var(--surface2)', color: 'var(--text)', border: '1.5px solid var(--border)' }
                            : { background: 'transparent', color: 'var(--muted)', border: '1px solid var(--border)' }
                        }>
                        {c && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.color }} />}
                        {u || '不设置'}
                      </button>
                    )
                  })}
                </div>
              </div>

              {FIELDS.map(f => (
                <div key={f.key}>
                  <label className="block text-[10px] font-mono font-bold tracking-widest mb-1.5"
                    style={{ color: 'var(--text)', opacity: 0.5 }}>
                    {f.label} <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <textarea rows={f.rows} className="field resize-none"
                    placeholder={f.ph} value={form[f.key]}
                    onChange={e => set(f.key, e.target.value)} />
                </div>
              ))}
              {err && <p className="text-xs text-red-500 font-mono">{err}</p>}
              <div className="flex gap-2.5 pt-1">
                <button type="button" onClick={onClose}
                  className="press flex-1 py-2.5 text-sm font-semibold rounded-xl"
                  style={{ background: 'var(--surface2)', color: 'var(--muted)' }}>
                  取消
                </button>
                <button type="submit" disabled={saving}
                  className="press flex-1 py-2.5 text-sm font-semibold text-white rounded-xl disabled:opacity-60"
                  style={{ background: ACCENT, boxShadow: `0 4px 14px rgba(37,99,235,0.35)` }}>
                  {saving ? 'SUBMITTING...' : '提交需求 ✦'}
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
