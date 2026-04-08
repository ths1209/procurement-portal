import { useState, useEffect, useMemo } from 'react'
import { Sparkles, Plus, RefreshCw, ChevronDown, CheckCircle2, XCircle, Clock, Eye, Trash2, UserCheck, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  isAIConfigured,
  listAI,
  createAI,
  approveAI,
  followAI,
  updateFollowStatus,
  deleteAI,
  FOLLOW_STATUS_OPTS,
} from '../lib/teableAI'

// ─── 常量 ─────────────────────────────────────────────────────────────────────
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

const ACCENT = '#7C3AED'

// ─── 主页面 ───────────────────────────────────────────────────────────────────
export default function AIWishPool() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const isOps   = isAdmin || profile?.dept === '采购运营组'

  const [approved, setApproved] = useState([])
  const [pending,  setPending]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')
  const [showForm, setShowForm] = useState(false)
  const [detailItem, setDetailItem] = useState(null)

  async function load() {
    setLoading(true)
    try {
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

  const filteredApproved = useMemo(() => {
    if (!search) return approved
    const q = search.toLowerCase()
    return approved.filter(r =>
      r.scene?.toLowerCase().includes(q) ||
      r.asis?.toLowerCase().includes(q)  ||
      r.tobe?.toLowerCase().includes(q)  ||
      r.submitter?.toLowerCase().includes(q)
    )
  }, [approved, search])

  // 非配置状态提示
  if (!isAIConfigured()) {
    return (
      <div className="max-w-xl mx-auto mt-16 text-center space-y-3">
        <Sparkles className="w-10 h-10 mx-auto" style={{ color: ACCENT, opacity: 0.5 }} />
        <p className="font-semibold" style={{ color: 'var(--text)' }}>AI 需求池未配置</p>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>请在 <code>.env.local</code> 中配置 <code>VITE_TEABLE_AI_TABLE_ID</code></p>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* ── 页头 ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: `rgba(124,58,237,0.12)` }}>
              <Sparkles className="w-4 h-4" style={{ color: ACCENT }} />
            </div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>AI 需求池</h1>
          </div>
          <p className="text-[12px] mt-1 ml-10" style={{ color: 'var(--muted)' }}>
            汇集 AI 应用需求，审批通过后公开展示 · 运营组持续跟进落地
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={loading}
            className="press flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium"
            style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--muted)' }}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </button>
          <button onClick={() => setShowForm(true)}
            className="press flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white"
            style={{ background: ACCENT }}>
            <Plus className="w-4 h-4" />
            提交需求
          </button>
        </div>
      </div>

      {/* ── 管理员待审批区域 ── */}
      {isAdmin && pending.length > 0 && (
        <PendingQueue items={pending} onRefresh={load} />
      )}

      {/* ── 搜索 + 统计 ── */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="搜索应用场景、描述、提交人…"
          className="field"
          style={{ maxWidth: 300 }}
        />
        <span className="text-sm" style={{ color: 'var(--muted)' }}>
          共 <strong style={{ color: 'var(--text)' }}>{filteredApproved.length}</strong> 条已通过需求
        </span>
      </div>

      {/* ── 已通过需求卡片区 ── */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 rounded-full animate-spin"
            style={{ borderColor: `${ACCENT}33`, borderTopColor: ACCENT }} />
        </div>
      ) : filteredApproved.length === 0 ? (
        <EmptyState search={search} onSubmit={() => setShowForm(true)} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 stagger">
          {filteredApproved.map(item => (
            <WishCard
              key={item._id}
              item={item}
              isOps={isOps}
              isAdmin={isAdmin}
              currentUser={profile?.displayName || profile?.email || ''}
              onRefresh={load}
              onDetail={() => setDetailItem(item)}
            />
          ))}
        </div>
      )}

      {/* ── 管理员：已通过列表也显示 pending 为 0 时的提示 ── */}
      {isAdmin && pending.length === 0 && !loading && (
        <p className="text-center text-xs" style={{ color: 'var(--muted)' }}>
          暂无待审批需求
        </p>
      )}

      {showForm && (
        <SubmitModal
          onClose={() => setShowForm(false)}
          onSuccess={() => { setShowForm(false); load() }}
          submitter={profile?.displayName || profile?.email || '匿名'}
        />
      )}

      {detailItem && (
        <DetailModal item={detailItem} onClose={() => setDetailItem(null)} />
      )}
    </div>
  )
}

// ─── 待审批队列（仅 admin 可见） ───────────────────────────────────────────────
function PendingQueue({ items, onRefresh }) {
  const [busy, setBusy] = useState({})

  async function handle(id, approved) {
    setBusy(b => ({ ...b, [id]: true }))
    try { await approveAI(id, approved); onRefresh() }
    catch (e) { alert(e.message) }
    finally { setBusy(b => ({ ...b, [id]: false })) }
  }

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(245,158,11,0.3)', background: 'rgba(245,158,11,0.04)' }}>
      <div className="flex items-center gap-2 px-5 py-3.5" style={{ borderBottom: '1px solid rgba(245,158,11,0.2)' }}>
        <Clock className="w-4 h-4" style={{ color: '#F59E0B' }} />
        <span className="text-sm font-semibold" style={{ color: '#F59E0B' }}>待审批</span>
        <span className="text-[11px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: 'rgba(245,158,11,0.15)', color: '#F59E0B' }}>
          {items.length}
        </span>
      </div>
      <div className="divide-y" style={{ borderColor: 'rgba(245,158,11,0.1)' }}>
        {items.map(item => (
          <div key={item._id} className="px-5 py-4 flex items-start gap-4">
            <div className="flex-1 min-w-0 space-y-1">
              <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{item.scene || '（无标题）'}</p>
              <p className="text-xs line-clamp-2" style={{ color: 'var(--muted)' }}>
                {item.asis && <span><strong>AS-IS：</strong>{item.asis}</span>}
              </p>
              <p className="text-[11px]" style={{ color: 'var(--muted)' }}>
                提交人：{item.submitter} · {item.submittedAt ? new Date(item.submittedAt).toLocaleDateString('zh-CN') : ''}
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                disabled={busy[item._id]}
                onClick={() => handle(item._id, true)}
                className="press flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
                style={{ background: '#10B981' }}>
                <CheckCircle2 className="w-3 h-3" />通过
              </button>
              <button
                disabled={busy[item._id]}
                onClick={() => handle(item._id, false)}
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
  const [followBusy, setFollowBusy] = useState(false)

  const fc = FOLLOW_CFG[item.followStatus] || FOLLOW_CFG['待跟进']

  async function handleFollowStatus(status) {
    setFollowBusy(true)
    setShowFollow(false)
    try {
      if (!item.follower) {
        await followAI(item._id, currentUser, status)
      } else {
        await updateFollowStatus(item._id, status)
      }
      onRefresh()
    } catch (e) { alert(e.message) }
    finally { setFollowBusy(false) }
  }

  async function handleDelete() {
    if (!confirm(`确定删除需求「${item.scene}」？`)) return
    try { await deleteAI(item._id); onRefresh() }
    catch (e) { alert(e.message) }
  }

  return (
    <div className="card flex flex-col h-full" style={{ borderTop: `3px solid ${ACCENT}` }}>
      {/* 标题栏 */}
      <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-2"
        style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[13px] font-bold leading-snug" style={{ color: 'var(--text)' }}>{item.scene || '（无标题）'}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {/* 跟进状态 badge */}
          {isOps && (
            <div className="relative">
              <button
                disabled={followBusy}
                onClick={() => setShowFollow(v => !v)}
                className="press flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg disabled:opacity-50"
                style={{ background: fc.bg, color: fc.color }}>
                <UserCheck className="w-3 h-3" />
                {item.followStatus || '待跟进'}
                <ChevronDown className="w-2.5 h-2.5" />
              </button>
              {showFollow && (
                <div className="absolute right-0 top-full mt-1 z-20 rounded-xl shadow-xl overflow-hidden"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)', minWidth: 100 }}>
                  {FOLLOW_STATUS_OPTS.map(opt => {
                    const c = FOLLOW_CFG[opt]
                    return (
                      <button key={opt} onClick={() => handleFollowStatus(opt)}
                        className="w-full text-left px-3 py-2 text-xs font-medium hover:opacity-80 transition-opacity"
                        style={{ color: c.color, background: item.followStatus === opt ? c.bg : 'transparent' }}>
                        {opt}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}
          {isAdmin && (
            <button onClick={handleDelete}
              className="press w-6 h-6 flex items-center justify-center rounded-lg opacity-40 hover:opacity-100 transition-opacity"
              style={{ background: 'rgba(239,68,68,0.08)', color: '#EF4444' }}
              title="删除">
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex-1 px-4 py-3 space-y-3">
        {item.asis && (
          <div className="space-y-0.5">
            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: ACCENT, opacity: 0.7 }}>AS-IS 现状</p>
            <p className="text-xs leading-relaxed line-clamp-3" style={{ color: 'var(--text)', opacity: 0.8 }}>{item.asis}</p>
          </div>
        )}
        {item.tobe && (
          <div className="space-y-0.5">
            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#0EA5E9', opacity: 0.7 }}>TO-BE 方案</p>
            <p className="text-xs leading-relaxed line-clamp-3" style={{ color: 'var(--text)', opacity: 0.8 }}>{item.tobe}</p>
          </div>
        )}
        {item.roi && (
          <div className="space-y-0.5">
            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#10B981', opacity: 0.7 }}>ROI 收益</p>
            <p className="text-xs leading-relaxed line-clamp-2" style={{ color: 'var(--text)', opacity: 0.8 }}>{item.roi}</p>
          </div>
        )}
      </div>

      {/* 底栏 */}
      <div className="px-4 pb-3.5 pt-2 flex items-center justify-between"
        style={{ borderTop: '1px solid var(--border)' }}>
        <div className="text-[11px]" style={{ color: 'var(--muted)' }}>
          <span>{item.submitter}</span>
          {item.submittedAt && (
            <span className="ml-1.5">· {new Date(item.submittedAt).toLocaleDateString('zh-CN')}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {item.follower && (
            <span className="text-[11px]" style={{ color: 'var(--muted)' }}>
              跟进：{item.follower}
            </span>
          )}
          <button onClick={onDetail}
            className="press flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg font-medium"
            style={{ background: 'var(--surface2)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
            <Eye className="w-3 h-3" />
            详情
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── 空状态 ───────────────────────────────────────────────────────────────────
function EmptyState({ search, onSubmit }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 space-y-4">
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
        style={{ background: `rgba(124,58,237,0.08)` }}>
        <Sparkles className="w-6 h-6" style={{ color: ACCENT, opacity: 0.6 }} />
      </div>
      {search ? (
        <>
          <p className="font-semibold" style={{ color: 'var(--text)' }}>未找到匹配结果</p>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>换个关键词试试？</p>
        </>
      ) : (
        <>
          <p className="font-semibold" style={{ color: 'var(--text)' }}>还没有已通过的需求</p>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>成为第一个提交 AI 需求的人吧</p>
          <button onClick={onSubmit}
            className="press flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white mt-2"
            style={{ background: ACCENT }}>
            <Plus className="w-4 h-4" />
            提交需求
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
            style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: `rgba(124,58,237,0.1)` }}>
                <Sparkles className="w-4 h-4" style={{ color: ACCENT }} />
              </div>
              <h3 className="font-semibold text-[15px] truncate" style={{ color: 'var(--text)' }}>{item.scene}</h3>
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-3">
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                style={{ background: sc.bg, color: sc.color }}>
                {sc.label}
              </span>
              <button onClick={onClose}
                className="press w-7 h-7 flex items-center justify-center rounded-xl"
                style={{ background: 'var(--surface2)', color: 'var(--muted)' }}>
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          {/* 内容 */}
          <div className="p-5 space-y-5">
            <Section label="AS-IS 现状痛点" color={ACCENT} content={item.asis} />
            <Section label="TO-BE 优化方案" color="#0EA5E9" content={item.tobe} />
            <Section label="ROI 预期收益"   color="#10B981" content={item.roi}  />

            <div className="grid grid-cols-2 gap-4 pt-2">
              <Info label="提交人" value={item.submitter} />
              <Info label="提交时间" value={item.submittedAt ? new Date(item.submittedAt).toLocaleString('zh-CN') : '—'} />
              {item.follower && <Info label="跟进人" value={item.follower} />}
              {item.followStatus && (
                <div>
                  <p className="text-[11px] font-semibold mb-1" style={{ color: 'var(--muted)' }}>跟进状态</p>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: fc.bg, color: fc.color }}>
                    {item.followStatus}
                  </span>
                </div>
              )}
            </div>
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

// ─── 提交弹窗 ─────────────────────────────────────────────────────────────────
function SubmitModal({ onClose, onSuccess, submitter }) {
  const [form, setForm] = useState({ scene: '', asis: '', tobe: '', roi: '' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

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
      onSuccess()
    } catch(e) { setErr(e.message) }
    finally { setSaving(false) }
  }

  const FIELDS = [
    { key: 'scene', label: '应用场景',         placeholder: '描述这个 AI 需求的应用场景，例如：采购合同智能审核', rows: 2  },
    { key: 'asis',  label: 'AS-IS 现状痛点',   placeholder: '目前的工作方式有哪些痛点？效率如何？', rows: 3  },
    { key: 'tobe',  label: 'TO-BE 优化方案',   placeholder: '期望 AI 如何改善？具体功能或交互是什么？', rows: 3  },
    { key: 'roi',   label: 'ROI 预期收益',     placeholder: '预计节省多少时间/人力？量化收益有多少？', rows: 2  },
  ]

  return createPortal(
    <div className="fixed inset-0 z-[200] overflow-y-auto animate-fade-in"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}>
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="w-full max-w-lg rounded-2xl shadow-2xl animate-scale-in"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          onClick={e => e.stopPropagation()}>
          {/* 弹窗标题 */}
          <div className="flex items-center justify-between px-5 py-4"
            style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-xl flex items-center justify-center"
                style={{ background: 'rgba(124,58,237,0.1)' }}>
                <Sparkles className="w-3.5 h-3.5" style={{ color: ACCENT }} />
              </div>
              <h3 className="font-semibold text-[15px]" style={{ color: 'var(--text)' }}>提交 AI 需求</h3>
            </div>
            <button onClick={onClose}
              className="press w-7 h-7 flex items-center justify-center rounded-xl"
              style={{ background: 'var(--surface2)', color: 'var(--muted)' }}>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {/* 表单 */}
          <form onSubmit={submit} className="p-5 space-y-4">
            <p className="text-xs rounded-xl px-3 py-2.5" style={{ background: 'rgba(124,58,237,0.07)', color: ACCENT }}>
              需求将提交至管理员审批，通过后公开展示在需求池中。
            </p>
            {FIELDS.map(f => (
              <div key={f.key}>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text)', opacity: 0.65 }}>
                  {f.label} <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <textarea
                  rows={f.rows}
                  className="field resize-none"
                  placeholder={f.placeholder}
                  value={form[f.key]}
                  onChange={e => set(f.key, e.target.value)}
                />
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
                style={{ background: ACCENT }}>
                {saving ? '提交中…' : '提交需求'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>,
    document.body
  )
}
