import { useState, useEffect, useMemo } from 'react'
import { Sparkles, Plus, RefreshCw, ChevronDown, CheckCircle2, XCircle,
         Clock, Eye, Trash2, UserCheck, X, History } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  isAIConfigured, ensureAIFields,
  listAI, createAI, approveAI, followAI, updateFollowStatus, deleteAI,
  FOLLOW_STATUS_OPTS,
} from '../lib/teableAI'

// ─── 常量 ─────────────────────────────────────────────────────────────────────
const ACCENT = '#7C3AED'

const STATUS_CFG = {
  pending:  { label: '待审批', color: '#F59E0B', bg: 'rgba(245,158,11,0.1)'  },
  approved: { label: '已通过', color: '#10B981', bg: 'rgba(16,185,129,0.1)'  },
  rejected: { label: '已拒绝', color: '#EF4444', bg: 'rgba(239,68,68,0.1)'   },
}

const FOLLOW_CFG = {
  '待跟进': { color: '#94A3B8', bg: 'rgba(148,163,184,0.1)' },
  '跟进中': { color: '#3B82F6', bg: 'rgba(59,130,246,0.1)'  },
  '已完成': { color: '#10B981', bg: 'rgba(16,185,129,0.1)'  },
}

// 许愿池星星位置（固定，避免每次渲染随机）
const STARS = [
  { left: '4%',  top: '28%', s: 2.5, d: 0,    dur: 3.2 },
  { left: '13%', top: '68%', s: 2,   d: 0.9,  dur: 4.1 },
  { left: '25%', top: '15%', s: 3,   d: 1.7,  dur: 2.8 },
  { left: '40%', top: '78%', s: 1.5, d: 0.4,  dur: 3.7 },
  { left: '56%', top: '22%', s: 2.5, d: 2.1,  dur: 3.0 },
  { left: '68%', top: '62%', s: 2,   d: 1.3,  dur: 4.3 },
  { left: '80%', top: '18%', s: 3.5, d: 0.7,  dur: 2.6 },
  { left: '90%', top: '55%', s: 2,   d: 1.9,  dur: 3.9 },
  { left: '47%', top: '48%', s: 1.5, d: 0.5,  dur: 4.5 },
  { left: '33%', top: '82%', s: 2,   d: 1.1,  dur: 3.4 },
]

// ─── 权限判断 ─────────────────────────────────────────────────────────────────
// 谁能修改跟进状态：尚未认领时运营组可认领；认领后只有对应跟进人 + admin
function canClaimOrFollow(item, currentUser, isAdmin, isOps) {
  if (!isOps) return false
  if (!item.follower) return true              // 未认领，运营组均可
  return item.follower === currentUser || isAdmin  // 已认领，只有本人或 admin
}

// 谁能删除：未认领只有 admin；已认领则对应跟进人 + admin
function canDelete(item, currentUser, isAdmin) {
  if (isAdmin) return true
  return !!(item.follower && item.follower === currentUser)
}

// ─── 主页面 ───────────────────────────────────────────────────────────────────
export default function AIWishPool() {
  const { profile } = useAuth()
  const isAdmin     = profile?.role === 'admin'
  const isOps       = isAdmin || profile?.dept === '采购运营组'
  const currentUser = profile?.displayName || profile?.email || ''

  const [approved, setApproved] = useState([])
  const [pending,  setPending]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')
  const [showForm, setShowForm] = useState(false)
  const [detail,   setDetail]   = useState(null)

  async function load() {
    setLoading(true)
    try {
      await ensureAIFields()
      const data = await listAI()
      setApproved(data.approved)
      setPending(data.pending)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
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

  const followingCount = useMemo(
    () => approved.filter(r => r.followStatus === '跟进中').length,
    [approved]
  )

  if (!isAIConfigured()) {
    return (
      <div className="max-w-xl mx-auto mt-16 text-center space-y-3">
        <Sparkles className="w-10 h-10 mx-auto wish-float" style={{ color: ACCENT, opacity: 0.5 }} />
        <p className="font-semibold" style={{ color: 'var(--text)' }}>AI 需求池未配置</p>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          请在 <code>.env.local</code> 中配置 <code>VITE_TEABLE_AI_TABLE_ID</code>
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5 max-w-6xl mx-auto">

      {/* ── 许愿池 Hero ── */}
      <div className="relative overflow-hidden rounded-2xl px-6 py-6"
        style={{
          background: 'linear-gradient(135deg, rgba(124,58,237,0.09) 0%, rgba(14,165,233,0.05) 100%)',
          border: '1px solid rgba(124,58,237,0.18)',
        }}>
        {/* 星星粒子 */}
        {STARS.map((s, i) => (
          <span key={i} className="absolute rounded-full twinkle pointer-events-none"
            style={{
              left: s.left, top: s.top,
              width: s.s, height: s.s,
              background: ACCENT, opacity: 0.55,
              animationDelay: `${s.d}s`, animationDuration: `${s.dur}s`,
            }} />
        ))}

        {/* 主内容 */}
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center wish-float"
              style={{ background: 'rgba(124,58,237,0.15)', backdropFilter: 'blur(8px)' }}>
              <Sparkles className="w-5 h-5" style={{ color: ACCENT }} />
            </div>
            <div>
              <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>AI 需求池</h1>
              <p className="text-[12px] mt-0.5" style={{ color: 'var(--muted)' }}>
                许下你的 AI 愿望 · 审批通过后共享 · 运营组全力跟进落地
              </p>
            </div>
          </div>

          {/* 统计胶囊 */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <StatPill label="已通过" value={approved.length} color={ACCENT} />
            <StatPill label="跟进中" value={followingCount} color="#3B82F6" />
            {isAdmin && <StatPill label="待审批" value={pending.length} color="#F59E0B" />}
            <div className="flex items-center gap-2 ml-1">
              <button onClick={load} disabled={loading}
                className="press flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium"
                style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(124,58,237,0.2)', color: 'var(--muted)', backdropFilter: 'blur(4px)' }}>
                <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                刷新
              </button>
              <button onClick={() => setShowForm(true)}
                className="press flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-semibold text-white"
                style={{ background: ACCENT, boxShadow: '0 4px 14px rgba(124,58,237,0.35)' }}>
                <Plus className="w-3.5 h-3.5" />
                许愿
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── 管理员待审批队列 ── */}
      {isAdmin && pending.length > 0 && (
        <PendingQueue
          items={pending}
          currentUser={currentUser}
          onRefresh={load}
        />
      )}

      {/* ── 搜索栏 ── */}
      <div className="flex items-center gap-3">
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="搜索应用场景、现状、方案、提交人…"
          className="field"
          style={{ maxWidth: 320 }}
        />
        {search && (
          <button onClick={() => setSearch('')}
            className="text-xs px-2 py-1 rounded-lg"
            style={{ color: 'var(--muted)', background: 'var(--surface2)' }}>
            清除
          </button>
        )}
        <span className="text-sm ml-auto" style={{ color: 'var(--muted)' }}>
          <strong style={{ color: 'var(--text)' }}>{filtered.length}</strong> 条需求
        </span>
      </div>

      {/* ── 卡片区 ── */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="relative w-10 h-10">
            <div className="absolute inset-0 rounded-full border-2 animate-spin"
              style={{ borderColor: `${ACCENT}30`, borderTopColor: ACCENT }} />
            <Sparkles className="absolute inset-0 m-auto w-4 h-4 wish-float" style={{ color: ACCENT }} />
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState search={search} onSubmit={() => setShowForm(true)} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 stagger">
          {filtered.map(item => (
            <WishCard
              key={item._id}
              item={item}
              isOps={isOps}
              isAdmin={isAdmin}
              currentUser={currentUser}
              onRefresh={load}
              onDetail={() => setDetail(item)}
            />
          ))}
        </div>
      )}

      {showForm && (
        <SubmitModal
          submitter={currentUser}
          onClose={() => setShowForm(false)}
          onSuccess={() => { setShowForm(false); load() }}
        />
      )}

      {detail && (
        <DetailModal
          item={detail}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  )
}

// ─── 统计胶囊 ─────────────────────────────────────────────────────────────────
function StatPill({ label, value, color }) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl"
      style={{ background: `${color}14`, border: `1px solid ${color}28` }}>
      <span className="text-[11px] font-semibold" style={{ color }}>{value}</span>
      <span className="text-[11px]" style={{ color: `${color}aa` }}>{label}</span>
    </div>
  )
}

// ─── 待审批队列 ───────────────────────────────────────────────────────────────
function PendingQueue({ items, currentUser, onRefresh }) {
  const [busy, setBusy] = useState({})
  const { profile } = useAuth()
  const byUser = profile?.displayName || profile?.email || '管理员'

  async function handle(item, approved) {
    setBusy(b => ({ ...b, [item._id]: true }))
    try {
      await approveAI(item._id, approved, byUser, item.history)
      onRefresh()
    } catch (e) { alert(e.message) }
    finally { setBusy(b => ({ ...b, [item._id]: false })) }
  }

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ border: '1px solid rgba(245,158,11,0.3)', background: 'rgba(245,158,11,0.04)' }}>
      <div className="flex items-center gap-2 px-5 py-3.5"
        style={{ borderBottom: '1px solid rgba(245,158,11,0.18)' }}>
        <Clock className="w-4 h-4" style={{ color: '#F59E0B' }} />
        <span className="text-sm font-semibold" style={{ color: '#F59E0B' }}>待审批</span>
        <span className="text-[11px] px-1.5 py-0.5 rounded-full font-bold"
          style={{ background: 'rgba(245,158,11,0.15)', color: '#F59E0B' }}>
          {items.length}
        </span>
      </div>
      <div className="divide-y" style={{ borderColor: 'rgba(245,158,11,0.1)' }}>
        {items.map(item => (
          <div key={item._id} className="px-5 py-4 flex items-start gap-4">
            <div className="flex-1 min-w-0 space-y-1">
              <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>
                {item.scene || '（无标题）'}
              </p>
              {item.asis && (
                <p className="text-xs line-clamp-2" style={{ color: 'var(--muted)' }}>
                  <strong>AS-IS：</strong>{item.asis}
                </p>
              )}
              <p className="text-[11px]" style={{ color: 'var(--muted)' }}>
                {item.submitter} · {item.submittedAt ? new Date(item.submittedAt).toLocaleDateString('zh-CN') : ''}
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button disabled={busy[item._id]} onClick={() => handle(item, true)}
                className="press flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
                style={{ background: '#10B981' }}>
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
function WishCard({ item, isOps, isAdmin, currentUser, onRefresh, onDetail }) {
  const [showFollow, setShowFollow] = useState(false)
  const [busy,       setBusy]       = useState(false)

  const canFollow = canClaimOrFollow(item, currentUser, isAdmin, isOps)
  const canDel    = canDelete(item, currentUser, isAdmin)
  const fc        = FOLLOW_CFG[item.followStatus] || FOLLOW_CFG['待跟进']

  async function handleFollowStatus(status) {
    setBusy(true)
    setShowFollow(false)
    try {
      if (!item.follower) {
        // 首次认领
        await followAI(item._id, currentUser, status, currentUser, item.history)
      } else {
        // 已认领，仅更新状态
        await updateFollowStatus(item._id, status, currentUser, item.history, item.followStatus)
      }
      onRefresh()
    } catch (e) { alert(e.message) }
    finally { setBusy(false) }
  }

  async function handleDelete() {
    if (!confirm(`确定删除愿望「${item.scene}」？`)) return
    try { await deleteAI(item._id); onRefresh() }
    catch (e) { alert(e.message) }
  }

  return (
    <div
      className="wish-card card flex flex-col h-full cursor-default"
      style={{ borderTop: `3px solid ${ACCENT}` }}
      onClick={() => setShowFollow(false)}
    >
      {/* 标题栏 */}
      <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-2"
        style={{ borderBottom: '1px solid var(--border)' }}>
        <p className="text-[13px] font-bold leading-snug flex-1 min-w-0 pr-2" style={{ color: 'var(--text)' }}>
          {item.scene || '（无标题）'}
        </p>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* 跟进状态按钮（canFollow 时可点击） */}
          {isOps && (
            <div className="relative" onClick={e => e.stopPropagation()}>
              <button
                disabled={busy || !canFollow}
                onClick={() => setShowFollow(v => !v)}
                className="press flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg transition-opacity"
                style={{
                  background: fc.bg, color: fc.color,
                  opacity: canFollow ? 1 : 0.55,
                  cursor: canFollow ? 'pointer' : 'not-allowed',
                }}
                title={!canFollow ? `仅跟进人「${item.follower}」或管理员可修改` : undefined}>
                <UserCheck className="w-3 h-3" />
                {item.followStatus || '待跟进'}
                {canFollow && <ChevronDown className="w-2.5 h-2.5" />}
              </button>
              {showFollow && canFollow && (
                <div className="absolute right-0 top-full mt-1 z-20 rounded-xl shadow-xl overflow-hidden"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)', minWidth: 100 }}>
                  {FOLLOW_STATUS_OPTS.map(opt => {
                    const c = FOLLOW_CFG[opt]
                    return (
                      <button key={opt} onClick={() => handleFollowStatus(opt)}
                        className="w-full text-left px-3 py-2 text-xs font-medium transition-opacity hover:opacity-80"
                        style={{
                          color: c.color,
                          background: item.followStatus === opt ? c.bg : 'transparent',
                        }}>
                        {opt}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}
          {/* 删除按钮 */}
          {canDel && (
            <button onClick={handleDelete}
              className="press w-6 h-6 flex items-center justify-center rounded-lg opacity-30 hover:opacity-90 transition-opacity"
              style={{ background: 'rgba(239,68,68,0.08)', color: '#EF4444' }}
              title="删除愿望">
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex-1 px-4 py-3 space-y-3">
        {item.asis && (
          <FieldBlock label="AS-IS 现状" color={ACCENT} text={item.asis} />
        )}
        {item.tobe && (
          <FieldBlock label="TO-BE 方案" color="#0EA5E9" text={item.tobe} />
        )}
        {item.roi && (
          <FieldBlock label="ROI 收益" color="#10B981" text={item.roi} lines={2} />
        )}
      </div>

      {/* 底栏 */}
      <div className="px-4 pb-3.5 pt-2.5 flex items-center justify-between"
        style={{ borderTop: '1px solid var(--border)' }}>
        <div className="text-[11px] truncate max-w-[55%]" style={{ color: 'var(--muted)' }}>
          {item.submitter}
          {item.submittedAt && (
            <span className="ml-1.5">· {new Date(item.submittedAt).toLocaleDateString('zh-CN')}</span>
          )}
          {item.follower && (
            <span className="ml-1.5">· 跟进：{item.follower}</span>
          )}
        </div>
        <button onClick={onDetail}
          className="press flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg font-medium shrink-0"
          style={{ background: 'var(--surface2)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
          <Eye className="w-3 h-3" />详情
        </button>
      </div>
    </div>
  )
}

function FieldBlock({ label, color, text, lines = 3 }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color, opacity: 0.75 }}>{label}</p>
      <p className={`text-xs leading-relaxed line-clamp-${lines}`} style={{ color: 'var(--text)', opacity: 0.82 }}>
        {text}
      </p>
    </div>
  )
}

// ─── 空状态 ───────────────────────────────────────────────────────────────────
function EmptyState({ search, onSubmit }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 space-y-4">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center wish-float"
        style={{ background: 'rgba(124,58,237,0.08)' }}>
        <Sparkles className="w-7 h-7" style={{ color: ACCENT, opacity: 0.65 }} />
      </div>
      {search ? (
        <>
          <p className="font-semibold" style={{ color: 'var(--text)' }}>未找到匹配结果</p>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>换个关键词试试</p>
        </>
      ) : (
        <>
          <p className="font-semibold" style={{ color: 'var(--text)' }}>许愿池还是空的</p>
          <p className="text-sm text-center max-w-xs" style={{ color: 'var(--muted)' }}>
            成为第一个许愿的人，让 AI 帮你们提升工作效率
          </p>
          <button onClick={onSubmit}
            className="press flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white mt-2"
            style={{ background: ACCENT, boxShadow: '0 4px 16px rgba(124,58,237,0.3)' }}>
            <Sparkles className="w-4 h-4" />
            许个愿
          </button>
        </>
      )}
    </div>
  )
}

// ─── 详情弹窗 ─────────────────────────────────────────────────────────────────
function DetailModal({ item, onClose }) {
  const sc = STATUS_CFG[item.status] || STATUS_CFG.approved
  const fc = FOLLOW_CFG[item.followStatus] || FOLLOW_CFG['待跟进']

  return createPortal(
    <div className="fixed inset-0 z-[200] overflow-y-auto animate-fade-in"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}>
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="w-full max-w-lg rounded-2xl shadow-2xl"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          onClick={e => e.stopPropagation()}>

          {/* 标题栏 */}
          <div className="flex items-center justify-between px-5 py-4"
            style={{ borderBottom: '1px solid var(--border)', borderTop: `3px solid ${ACCENT}`, borderRadius: '16px 16px 0 0' }}>
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
              <Sparkles className="w-4 h-4 shrink-0" style={{ color: ACCENT }} />
              <h3 className="font-semibold text-[15px] truncate" style={{ color: 'var(--text)' }}>{item.scene}</h3>
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-3">
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                style={{ background: sc.bg, color: sc.color }}>{sc.label}</span>
              {item.followStatus && (
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: fc.bg, color: fc.color }}>{item.followStatus}</span>
              )}
              <button onClick={onClose}
                className="press w-7 h-7 flex items-center justify-center rounded-xl"
                style={{ background: 'var(--surface2)', color: 'var(--muted)' }}>
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* 内容 */}
          <div className="p-5 space-y-5">
            <Section label="AS-IS 现状痛点" color={ACCENT}    content={item.asis} />
            <Section label="TO-BE 优化方案" color="#0EA5E9"   content={item.tobe} />
            <Section label="ROI 预期收益"   color="#10B981"   content={item.roi}  />

            {/* 元信息 */}
            <div className="grid grid-cols-2 gap-4 pt-1"
              style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              <Info label="提交人" value={item.submitter} />
              <Info label="提交时间" value={item.submittedAt ? new Date(item.submittedAt).toLocaleString('zh-CN') : '—'} />
              {item.follower && <Info label="跟进人" value={item.follower} />}
            </div>

            {/* 历史记录 */}
            {item.history && <HistoryTimeline history={item.history} />}
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
      <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color, opacity: 0.8 }}>{label}</p>
      <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text)', opacity: 0.85 }}>{content}</p>
    </div>
  )
}

function Info({ label, value }) {
  return (
    <div>
      <p className="text-[11px] font-semibold mb-0.5" style={{ color: 'var(--muted)' }}>{label}</p>
      <p className="text-[13px]" style={{ color: 'var(--text)' }}>{value || '—'}</p>
    </div>
  )
}

// ─── 历史时间线 ───────────────────────────────────────────────────────────────
function HistoryTimeline({ history }) {
  const entries = history.split('\n').filter(Boolean).reverse() // 最新在前

  return (
    <div className="space-y-2.5" style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
      <div className="flex items-center gap-1.5">
        <History className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
        <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--muted)', opacity: 0.7 }}>修改历史</p>
      </div>
      <div className="relative pl-4 space-y-2.5">
        {/* 竖线 */}
        <div className="absolute left-1 top-2 bottom-2 w-px"
          style={{ background: 'var(--border)' }} />

        {entries.map((e, i) => {
          const parts = e.split(' | ')
          const ts     = parts[0] || ''
          const user   = parts[1] || ''
          const action = parts.slice(2).join(' | ') || e
          const isLatest = i === 0

          return (
            <div key={i} className="flex items-start gap-2.5 relative">
              {/* 时间轴圆点 */}
              <div className="absolute -left-[11px] mt-1 w-2 h-2 rounded-full shrink-0 z-10"
                style={{
                  background: isLatest ? ACCENT : 'var(--surface2)',
                  border: `2px solid ${isLatest ? ACCENT : 'var(--border)'}`,
                }} />
              <div className="flex-1 min-w-0">
                <p className="text-[12px] leading-snug" style={{ color: 'var(--text)', opacity: isLatest ? 0.9 : 0.65 }}>
                  {action}
                </p>
                <p className="text-[10px] mt-0.5" style={{ color: 'var(--muted)' }}>
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
  const [form,   setForm]   = useState({ scene: '', asis: '', tobe: '', roi: '' })
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
    try {
      await createAI(form, submitter)
      setDone(true)
      setTimeout(onSuccess, 1600)
    } catch(e) { setErr(e.message) }
    finally { setSaving(false) }
  }

  const FIELDS = [
    { key: 'scene', label: '应用场景',       placeholder: '描述这个 AI 需求的应用场景', rows: 2 },
    { key: 'asis',  label: 'AS-IS 现状痛点', placeholder: '目前的工作方式有哪些痛点？', rows: 3 },
    { key: 'tobe',  label: 'TO-BE 优化方案', placeholder: '期望 AI 如何改善？',         rows: 3 },
    { key: 'roi',   label: 'ROI 预期收益',   placeholder: '预计节省多少时间/人力？',     rows: 2 },
  ]

  return createPortal(
    <div className="fixed inset-0 z-[200] overflow-y-auto animate-fade-in"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}>
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="w-full max-w-lg rounded-2xl shadow-2xl animate-scale-in"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          onClick={e => e.stopPropagation()}>

          <div className="flex items-center justify-between px-5 py-4"
            style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-xl flex items-center justify-center"
                style={{ background: 'rgba(124,58,237,0.1)' }}>
                <Sparkles className="w-3.5 h-3.5" style={{ color: ACCENT }} />
              </div>
              <h3 className="font-semibold text-[15px]" style={{ color: 'var(--text)' }}>许个愿</h3>
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
                style={{ background: 'rgba(124,58,237,0.1)' }}>
                <Sparkles className="w-7 h-7" style={{ color: ACCENT }} />
              </div>
              <p className="font-semibold text-[15px]" style={{ color: 'var(--text)' }}>愿望已许下 ✨</p>
              <p className="text-sm text-center" style={{ color: 'var(--muted)' }}>提交成功，等待管理员审批后将公开展示</p>
            </div>
          ) : (
            <form onSubmit={submit} className="p-5 space-y-4">
              <p className="text-xs rounded-xl px-3 py-2.5" style={{ background: 'rgba(124,58,237,0.07)', color: ACCENT }}>
                需求提交后将由管理员审批，通过后在需求池中公开展示。
              </p>
              {FIELDS.map(f => (
                <div key={f.key}>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text)', opacity: 0.65 }}>
                    {f.label} <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <textarea rows={f.rows} className="field resize-none"
                    placeholder={f.placeholder} value={form[f.key]}
                    onChange={e => set(f.key, e.target.value)} />
                </div>
              ))}
              {err && <p className="text-xs text-red-500">{err}</p>}
              <div className="flex gap-2.5 pt-1">
                <button type="button" onClick={onClose}
                  className="press flex-1 py-2.5 text-sm font-semibold rounded-xl"
                  style={{ background: 'var(--surface2)', color: 'var(--muted)' }}>
                  取消
                </button>
                <button type="submit" disabled={saving}
                  className="press flex-1 py-2.5 text-sm font-semibold text-white rounded-xl disabled:opacity-60"
                  style={{ background: ACCENT, boxShadow: '0 4px 14px rgba(124,58,237,0.3)' }}>
                  {saving ? '许愿中…' : '✨ 许愿'}
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
