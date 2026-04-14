import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  ChevronDown, ChevronRight, Plus, Edit2, Trash2,
  Check, Calendar, BarChart3, Settings, RefreshCw, Save,
  AlertCircle, FileText, X, Clock, Copy, Bot, ScrollText,
  Bell, Send, Loader2,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import {
  ensureOKRFields, getOKRSetup, saveOKRSetup,
  getPeriods, savePeriods,
  getAllPeriodsReports, saveGroupReport,
  appendHistory, getHistory,
  getKRAttachments, uploadKRAttachment, deleteKRAttachment,
  uid, OKR_GROUPS, getFiscalYear,
} from '../lib/teableOKR'
import { listUsers } from '../lib/teable'
import { sendNotify } from '../lib/notify'

const FY       = getFiscalYear()
const ACCENT   = '#2563EB'   // 年度 OKR — 蓝色
const Q_ACCENT = '#7C3AED'   // 季度 OKR — 紫色
const OKR_TID  = import.meta.env.VITE_TEABLE_OKR_TABLE_ID

// AI 调用配置（与 aiSummary.js 保持一致）
const AI_BASE  = (import.meta.env.VITE_AI_API_BASE  ?? '').replace(/\/$/, '')
const AI_KEY   = import.meta.env.VITE_AI_API_KEY  ?? ''
const AI_MODEL = import.meta.env.VITE_AI_MODEL    ?? 'claude-sonnet-4.6'
const OR_BASE  = 'https://openrouter.ai/api/v1'
const OR_KEY   = import.meta.env.VITE_OPENROUTER_KEY ?? ''
const OR_MODELS = [
  import.meta.env.VITE_OPENROUTER_MODEL ?? 'z-ai/glm-4.5-air:free',
  'minimax/minimax-m2.5:free',
  'stepfun/step-3.5-flash:free',
  'meta-llama/llama-3.2-3b-instruct:free',
]

function fmtFileSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// ── 状态配色（纯色填充）──────────────────────────────────────────────────────────
const STATUS_CFG = {
  notstart: { label: '未开始', solid: '#DC2626', text: '#fff' },
  progress: { label: '进行中', solid: '#F59E0B', text: '#fff' },
  done:     { label: '已完成', solid: '#10B981', text: '#fff' },
  empty:    { label: '未填报', solid: 'rgba(100,116,139,0.1)', text: '#94A3B8' },
}

function StatusBadge({ status, size = 'sm' }) {
  const cfg = STATUS_CFG[status] ?? STATUS_CFG.empty
  const cls = size === 'xs'
    ? 'inline-flex items-center px-1.5 py-px rounded text-[9px] font-bold whitespace-nowrap'
    : 'inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold whitespace-nowrap'
  return <span className={cls} style={{ background: cfg.solid, color: cfg.text }}>{cfg.label}</span>
}

// ── hover tooltip（portal 渲染，避免被 overflow 裁剪） ──────────────────────────
function CellTooltip({ content, children }) {
  const [pos, setPos] = useState(null)
  if (!content) return children
  return (
    <div className="inline-block"
      onMouseEnter={e => {
        const r = e.currentTarget.getBoundingClientRect()
        setPos({ x: r.left + r.width / 2, y: r.top })
      }}
      onMouseLeave={() => setPos(null)}>
      {children}
      {pos && createPortal(
        <div className="fixed pointer-events-none text-[11px] leading-relaxed z-[9999]"
          style={{
            left: pos.x, top: pos.y - 8,
            transform: 'translate(-50%, -100%)',
            maxWidth: 220, padding: '8px 10px',
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.14)',
            color: 'var(--text)',
          }}>
          {content}
        </div>,
        document.body
      )}
    </div>
  )
}

// ── diff 计算 ──────────────────────────────────────────────────────────────────
function buildChangeDiff(oldData, newData, allKRs) {
  const changes = []
  for (const { kr } of allKRs) {
    const o = oldData[kr.id] || {}
    const n = newData[kr.id] || {}
    if ((o.status || '') !== (n.status || ''))
      changes.push({ krId: kr.id, krDesc: kr.desc, field: 'status',
        from: STATUS_CFG[o.status]?.label || '（未设置）', to: STATUS_CFG[n.status]?.label || '（未设置）' })
    if ((o.content || '') !== (n.content || ''))
      changes.push({ krId: kr.id, krDesc: kr.desc, field: 'content',
        from: o.content || '', to: n.content || '' })
  }
  return changes
}

// ── 权限 hook ──────────────────────────────────────────────────────────────────
function useOKRAuth() {
  const { profile } = useAuth()
  const isAdmin   = profile?.role === 'admin'
  const myGroup   = profile?.okrGroup || ''
  const canAccess = isAdmin || !!myGroup
  return { isAdmin, myGroup, canAccess, profile }
}

// ── 主页面 ─────────────────────────────────────────────────────────────────────
export default function OKRReport() {
  const { isAdmin, myGroup, canAccess, profile } = useOKRAuth()

  const [tab,            setTab]           = useState('overview')
  const [loading,        setLoading]       = useState(true)
  const [error,          setError]         = useState('')
  const [annualOkr,      setAnnualOkr]     = useState({ objectives: [] })
  const [quarterlyOkr,   setQuarterlyOkr]  = useState({ objectives: [] })
  const [periods,        setPeriods]       = useState([])
  const [allReports,     setAllReports]    = useState({})
  const [selectedPeriod, setSelectedPeriod] = useState('')

  useEffect(() => {
    if (!canAccess || !OKR_TID) { setLoading(false); return }
    init()
  }, [canAccess])

  async function init() {
    setLoading(true); setError('')
    try {
      await ensureOKRFields()
      const [a, q, p, allR] = await Promise.all([
        getOKRSetup(FY.annualKey), getOKRSetup(FY.quarterlyKey),
        getPeriods(), getAllPeriodsReports(),
      ])
      setAnnualOkr(a); setQuarterlyOkr(q)
      const sorted = [...p].sort((a, b) => b.start.localeCompare(a.start))
      setPeriods(sorted); setAllReports(allR)
      setSelectedPeriod(sorted[0]?.id || '')
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  async function refreshReports() {
    const allR = await getAllPeriodsReports(); setAllReports(allR)
  }

  if (!canAccess) return (
    <div className="flex items-center justify-center h-64 animate-page-in">
      <div className="text-center space-y-2">
        <AlertCircle className="w-10 h-10 mx-auto" style={{ color: 'var(--muted)' }} />
        <p className="font-medium" style={{ color: 'var(--text)' }}>暂无访问权限</p>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>仅管理员及采购经理可访问此模块</p>
      </div>
    </div>
  )

  if (!OKR_TID) return (
    <div className="max-w-md mx-auto mt-10 animate-page-in">
      <div className="card p-8 text-center space-y-3">
        <AlertCircle className="w-10 h-10 mx-auto" style={{ color: '#F59E0B' }} />
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          请配置 <code className="px-1.5 py-0.5 rounded text-xs font-mono"
            style={{ background: 'var(--surface2)', color: '#6366F1' }}>VITE_TEABLE_OKR_TABLE_ID</code> 并重新部署
        </p>
      </div>
    </div>
  )

  const TABS = [
    { key: 'overview', label: '进度总览', icon: BarChart3,  show: true },
    { key: 'report',   label: '填写报告', icon: FileText,   show: !isAdmin && !!myGroup },
    { key: 'ai',       label: 'AI 报告',  icon: Bot,        show: true },
    { key: 'setup',    label: 'OKR 设置', icon: Settings,   show: isAdmin },
    { key: 'periods',  label: '周期管理', icon: Calendar,   show: isAdmin },
  ].filter(t => t.show)

  return (
    <div className="space-y-5 animate-page-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--text)' }}>OKR 进度报告</h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--muted)' }}>{FY.annualLabel}</p>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="inline-flex items-center px-3 py-1.5 rounded-xl text-[12px] font-bold"
            style={{ background: 'rgba(37,99,235,0.1)', color: ACCENT, border: '1px solid rgba(37,99,235,0.15)' }}>
            {FY.qk}
          </span>
          {myGroup && !isAdmin && (
            <span className="inline-flex items-center px-3 py-1.5 rounded-xl text-[11px] font-semibold"
              style={{ background: 'rgba(16,185,129,0.1)', color: '#059669', border: '1px solid rgba(16,185,129,0.2)' }}>
              {myGroup}
            </span>
          )}
          <button onClick={init} disabled={loading}
            className="press flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium disabled:opacity-50"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)' }}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />刷新
          </button>
        </div>
      </div>

      <div className="flex gap-1 p-1 rounded-2xl w-fit"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className="press flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-medium transition-all whitespace-nowrap"
            style={tab === t.key ? { background: ACCENT, color: '#fff' } : { color: 'var(--muted)' }}>
            <t.icon className="w-3.5 h-3.5" />{t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm"
          style={{ background: 'rgba(244,63,94,0.08)', color: '#E11D48', border: '1px solid rgba(244,63,94,0.15)' }}>
          <AlertCircle className="w-4 h-4 shrink-0" />{error}
        </div>
      )}

      {loading ? (
        <div className="card p-16 flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 animate-spin"
            style={{ borderColor: 'rgba(37,99,235,0.15)', borderTopColor: ACCENT }} />
          <p className="text-sm" style={{ color: 'var(--muted)' }}>加载数据中…</p>
        </div>
      ) : (
        <>
          {tab === 'overview' && (
            <OverviewPanel annualOkr={annualOkr} quarterlyOkr={quarterlyOkr}
              periods={periods} allReports={allReports} />
          )}
          {tab === 'report' && (
            <ReportPanel annualOkr={annualOkr} quarterlyOkr={quarterlyOkr}
              periods={periods} allReports={allReports}
              selectedPeriod={selectedPeriod} onPeriodChange={setSelectedPeriod}
              myGroup={myGroup} profile={profile} onSaved={refreshReports} />
          )}
          {tab === 'ai' && (
            <AIReportPanel annualOkr={annualOkr} quarterlyOkr={quarterlyOkr}
              periods={periods} allReports={allReports} />
          )}
          {tab === 'setup' && <SetupPanel profile={profile} onSaved={init} />}
          {tab === 'periods' && (
            <PeriodsPanel periods={periods} setPeriods={setPeriods}
              profile={profile} onNewPeriod={refreshReports} />
          )}
        </>
      )}
    </div>
  )
}

// ── 进度总览（OKR 中心视图，跨周期对比） ──────────────────────────────────────────
function OverviewPanel({ annualOkr, quarterlyOkr, periods, allReports }) {
  const { profile, isAdmin } = useOKRAuth()
  const [typeFilter,    setTypeFilter]    = useState('')
  const [periodCount,   setPeriodCount]   = useState('all')  // 'all'|'3'|'6'|'single'
  const [singlePeriodId, setSinglePeriodId] = useState('')
  const [expandedObjs,  setExpandedObjs]  = useState(new Set())
  const [krHistories,   setKrHistories]   = useState({})     // { krId: entries[] }
  const [loadingHist,   setLoadingHist]   = useState(null)
  const [expandedHist,  setExpandedHist]  = useState(new Set())
  const [detailModal,   setDetailModal]   = useState(null)   // { periodId, group, kr, periodLabel }
  const [urgeModal,     setUrgeModal]     = useState(null)   // { period, people, targetGroups }
  const [loadingUrge,   setLoadingUrge]   = useState(false)

  const filteredPeriods = useMemo(() => {
    if (periodCount === '3') return periods.slice(0, 3)
    if (periodCount === '6') return periods.slice(0, 6)
    if (periodCount === 'single' && singlePeriodId) return periods.filter(p => p.id === singlePeriodId)
    return periods
  }, [periods, periodCount, singlePeriodId])

  // 催办目标周期：单选时用对应周期，否则用最新一期
  const urgePeriod = useMemo(() =>
    periodCount === 'single' && singlePeriodId
      ? periods.find(p => p.id === singlePeriodId)
      : periods[0]
  , [periods, periodCount, singlePeriodId])

  async function openUrgeModal(targetGroup = null) {
    if (!urgePeriod) { alert('暂无汇报周期，请先在「周期管理」中创建'); return }
    setLoadingUrge(true)
    try {
      const users = await listUsers()
      const managers = users.filter(u => u.okrGroup && u.status !== 'disabled')
      const periodReports = allReports[urgePeriod.id] || {}

      // 判断哪些组未提交（无数据或草稿状态）
      const checkGroups = targetGroup ? [targetGroup] : OKR_GROUPS
      const unfilledGroups = checkGroups.filter(g => {
        const rep = periodReports[g]
        if (!rep || Object.keys(rep).filter(k => k !== '_meta').length === 0) return true
        return (rep._meta?.status || 'draft') !== 'submitted'
      })

      if (unfilledGroups.length === 0) {
        alert(`「${urgePeriod.label}」所有组均已提交报告`)
        return
      }

      // 找对应负责人
      const people = unfilledGroups.map(g => {
        const manager = managers.find(u => u.okrGroup === g)
        return { group: g, uid: manager?.uid || g, displayName: manager?.displayName || '（未配置）', jobId: manager?.jobId || '' }
      })

      setUrgeModal({ period: urgePeriod, people })
    } catch (e) { alert('加载用户信息失败：' + e.message) }
    finally { setLoadingUrge(false) }
  }

  const items = useMemo(() => {
    const r = []
    if (!typeFilter || typeFilter === 'annual')
      annualOkr.objectives.forEach((obj, oi) => r.push({ typeLabel: '年度', oi, obj, typeColor: ACCENT }))
    if (!typeFilter || typeFilter === 'quarterly')
      quarterlyOkr.objectives.forEach((obj, oi) => r.push({ typeLabel: `${FY.qk} 季度`, oi, obj, typeColor: Q_ACCENT }))
    return r
  }, [annualOkr, quarterlyOkr, typeFilter])

  function toggleObj(id) {
    setExpandedObjs(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }

  async function toggleKRHistory(krId) {
    const next = new Set(expandedHist)
    if (next.has(krId)) { next.delete(krId); setExpandedHist(next); return }
    next.add(krId); setExpandedHist(next)
    if (krHistories[krId] !== undefined) return
    setLoadingHist(krId)
    try {
      const all = await getHistory({})
      const filtered = all.filter(e => e.changes?.some(c => c.krId === krId))
      setKrHistories(prev => ({ ...prev, [krId]: filtered }))
    } catch { setKrHistories(prev => ({ ...prev, [krId]: [] })) }
    setLoadingHist(null)
  }

  const hasOKR = annualOkr.objectives.length > 0 || quarterlyOkr.objectives.length > 0

  if (!hasOKR) return (
    <div className="card p-14 text-center space-y-2">
      <p className="text-3xl">📋</p>
      <p className="font-semibold" style={{ color: 'var(--text)' }}>暂无 OKR 数据</p>
      <p className="text-sm" style={{ color: 'var(--muted)' }}>管理员请先在「OKR 设置」中添加目标</p>
    </div>
  )

  return (
    <div className="space-y-4">
      {/* 筛选栏 */}
      <div className="card p-3.5 flex items-center gap-4 flex-wrap">
        {/* OKR 类型 */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium shrink-0" style={{ color: 'var(--muted)' }}>OKR 类型</span>
          <div className="flex gap-1">
            {[['', '全部'], ['annual', '年度'], ['quarterly', '季度']].map(([v, l]) => (
              <button key={v} onClick={() => setTypeFilter(v)}
                className="press px-3 py-1 rounded-lg text-[11px] font-semibold"
                style={typeFilter === v
                  ? { background: ACCENT, color: '#fff' }
                  : { background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', opacity: 0.6 }}>
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* 显示周期：快捷按钮 + 单选下拉 */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium shrink-0" style={{ color: 'var(--muted)' }}>显示周期</span>
          <div className="flex gap-1">
            {[['all', '全量'], ['6', '近6期'], ['3', '近3期']].map(([v, l]) => (
              <button key={v}
                onClick={() => { setPeriodCount(v); setSinglePeriodId('') }}
                className="press px-3 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap"
                style={periodCount === v
                  ? { background: ACCENT, color: '#fff' }
                  : { background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', opacity: 0.6 }}>
                {l}
              </button>
            ))}
          </div>
          <select
            value={periodCount === 'single' ? singlePeriodId : ''}
            onChange={e => {
              if (e.target.value) { setPeriodCount('single'); setSinglePeriodId(e.target.value) }
              else { setPeriodCount('all'); setSinglePeriodId('') }
            }}
            className="field text-[11px] py-1 px-2"
            style={{ minWidth: 130, borderColor: periodCount === 'single' ? ACCENT : 'var(--border)',
              color: periodCount === 'single' ? ACCENT : 'var(--muted)' }}>
            <option value="">指定周期…</option>
            {periods.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>

        {/* 催办按钮（仅管理员） */}
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-[11px]" style={{ color: 'var(--muted)' }}>
            {filteredPeriods.length} 个周期
          </span>
          {isAdmin && (
            <button
              onClick={() => openUrgeModal()}
              disabled={loadingUrge || periods.length === 0}
              className="press flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12px] font-semibold disabled:opacity-50 whitespace-nowrap"
              style={{ background: 'rgba(239,68,68,0.08)', color: '#DC2626',
                border: '1px solid rgba(239,68,68,0.2)' }}>
              {loadingUrge
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Bell className="w-3.5 h-3.5" />}
              一键催办
            </button>
          )}
        </div>
      </div>

      {filteredPeriods.length === 0 && (
        <div className="card p-10 text-center space-y-1">
          <p className="text-2xl">📅</p>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>暂无汇报周期，管理员请在「周期管理」中创建</p>
        </div>
      )}

      {/* OKR 目标卡片 */}
      {items.map(({ typeLabel, oi, obj, typeColor }) => {
        const isExpanded = expandedObjs.has(obj.id)
        const hexAlpha = typeColor === Q_ACCENT ? 'rgba(124,58,237,0.1)' : 'rgba(37,99,235,0.1)'
        // 计算总体完成率（跨周期最高状态）
        const stats = (() => {
          let total = 0, done = 0
          obj.krs.forEach(kr => OKR_GROUPS.forEach(g => {
            total++
            const best = filteredPeriods.find(p => allReports[p.id]?.[g]?.[kr.id]?.status === 'done')
            if (best) done++
          }))
          return { pct: total > 0 ? Math.round(done / total * 100) : 0 }
        })()

        return (
          <div key={obj.id} className="rounded-2xl overflow-hidden"
            style={{ border: '1px solid var(--border)' }}>
            {/* Objective header */}
            <button className="w-full flex items-center gap-3 px-5 py-4 text-left press"
              style={{ background: `linear-gradient(135deg, ${typeColor}08 0%, var(--surface) 60%)` }}
              onClick={() => toggleObj(obj.id)}>
              <span className="text-[10px] font-bold px-2.5 py-1 rounded-lg shrink-0"
                style={{ background: hexAlpha, color: typeColor }}>
                {typeLabel} O{oi + 1}
              </span>
              <span className="flex-1 text-[13px] font-semibold" style={{ color: 'var(--text)' }}>{obj.objective}</span>
              <div className="flex items-center gap-2.5 shrink-0">
                <div className="w-20 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                  <div className="h-full rounded-full transition-all"
                    style={{ width: `${stats.pct}%`, background: `linear-gradient(90deg,${typeColor},#10B981)` }} />
                </div>
                <span className="text-[11px] font-bold w-7 text-right"
                  style={{ color: stats.pct > 0 ? '#059669' : 'var(--muted)' }}>{stats.pct}%</span>
                {isExpanded
                  ? <ChevronDown className="w-4 h-4" style={{ color: 'var(--muted)' }} />
                  : <ChevronRight className="w-4 h-4" style={{ color: 'var(--muted)' }} />}
              </div>
            </button>

            {isExpanded && (
              <div style={{ borderTop: '1px solid var(--border)' }}>
                {obj.krs.length === 0 ? (
                  <div className="px-5 py-8 text-center text-sm" style={{ color: 'var(--muted)' }}>暂无 KR</div>
                ) : obj.krs.map((kr, ki) => (
                  <KRSection key={kr.id} kr={kr} ki={ki}
                    typeColor={typeColor}
                    filteredPeriods={filteredPeriods} allReports={allReports}
                    historyEntries={krHistories[kr.id]}
                    historyExpanded={expandedHist.has(kr.id)}
                    historyLoading={loadingHist === kr.id}
                    onToggleHistory={() => toggleKRHistory(kr.id)}
                    onCellClick={(periodId, group, periodLabel) =>
                      setDetailModal({ periodId, group, kr, periodLabel })}
                    onUrgeGroup={isAdmin ? openUrgeModal : null}
                  />
                ))}
              </div>
            )}
          </div>
        )
      })}

      {detailModal && (
        <CellDetailModal
          {...detailModal}
          allReports={allReports}
          onClose={() => setDetailModal(null)}
        />
      )}

      {urgeModal && (
        <OKRUrgeModal
          period={urgeModal.period}
          people={urgeModal.people}
          onClose={() => setUrgeModal(null)}
        />
      )}
    </div>
  )
}

// ── KR 行：周期×组 对比表格 ───────────────────────────────────────────────────
function KRSection({ kr, ki, filteredPeriods, allReports, historyEntries, historyExpanded, historyLoading, onToggleHistory, onCellClick, onUrgeGroup, typeColor = ACCENT }) {
  const FIELD_LABELS = { status: '状态', content: '进展' }
  const fmtTs = ts => {
    if (!ts) return ''
    const d = new Date(ts)
    return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
  }

  return (
    <div className="border-b last:border-b-0" style={{ borderColor: 'var(--border)' }}>
      <div className="px-5 py-3.5">
        {/* KR 描述 */}
        <div className="flex items-start gap-2 mb-3">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold shrink-0 mt-0.5"
            style={{ background: 'rgba(245,158,11,0.15)', color: '#B45309' }}>{ki + 1}</span>
          <span className="text-[13px] flex-1 leading-relaxed font-medium" style={{ color: 'var(--text)' }}>{kr.desc}</span>
        </div>

        {/* 周期×组 对比表 */}
        {filteredPeriods.length > 0 && (
          <div className="overflow-x-auto ml-7">
            <table className="w-full text-[11px]" style={{ minWidth: `${OKR_GROUPS.length * 90 + 140}px` }}>
              <thead>
                <tr>
                  <th className="text-left pb-2.5 pr-3 font-semibold text-[10px] w-36 shrink-0"
                    style={{ color: 'var(--text)', opacity: 0.5 }}>汇报周期</th>
                  {OKR_GROUPS.map(g => (
                    <th key={g} className="pb-2.5 px-1 font-semibold text-[10px] text-center" style={{ color: 'var(--text)', opacity: 0.55 }}>
                      <div className="flex flex-col items-center gap-0.5">
                        <span>{g.replace('采购', '')}</span>
                        {onUrgeGroup && (
                          <button onClick={() => onUrgeGroup(g)}
                            title={`催办${g}`}
                            className="press opacity-30 hover:opacity-80 transition-opacity"
                            style={{ color: '#DC2626' }}>
                            <Bell className="w-2.5 h-2.5" />
                          </button>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredPeriods.map((period, pi) => (
                  <tr key={period.id} className="group/row transition-colors"
                    style={{ borderRadius: 8 }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td className="py-2 pr-3 align-middle rounded-l-lg">
                      <span className="text-[10px] font-mono" style={{ color: 'var(--text)', opacity: 0.6 }}>
                        {period.start.slice(5)} · {period.label.slice(0, 12)}
                      </span>
                    </td>
                    {OKR_GROUPS.map(g => {
                      const rep    = allReports[period.id]?.[g]?.[kr.id]
                      const status = rep?.status || 'empty'
                      const content = rep?.content || ''
                      return (
                        <td key={g} className="py-1.5 px-1 text-center align-middle">
                          <CellTooltip content={content}>
                            <button
                              className="press inline-block rounded-md transition-all"
                              style={{ opacity: status === 'empty' ? 0.5 : 1 }}
                              onClick={() => onCellClick(period.id, g, period.label)}>
                              <StatusBadge status={status} size="xs" />
                            </button>
                          </CellTooltip>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 变更记录切换 */}
        <div className="mt-2.5 ml-7">
          <button onClick={onToggleHistory}
            className="press flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-lg"
            style={{ background: historyExpanded ? `${typeColor}10` : 'transparent',
              color: historyExpanded ? typeColor : 'var(--muted)', border: `1px solid ${historyExpanded ? `${typeColor}26` : 'transparent'}` }}>
            <ScrollText className="w-3 h-3" />
            {historyLoading ? '加载中…' : `变更记录${historyEntries ? `（${historyEntries.length}）` : ''}`}
            {historyExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>

          {historyExpanded && !historyLoading && (
            <div className="mt-2 space-y-1.5">
              {(!historyEntries || historyEntries.length === 0) ? (
                <p className="text-[11px] px-2" style={{ color: 'var(--muted)' }}>暂无变更记录</p>
              ) : historyEntries.slice(0, 10).map((e, ei) => (
                <div key={ei} className="px-3 py-2 rounded-xl text-[11px]"
                  style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold" style={{ color: 'var(--text)' }}>{e.user}</span>
                    <span className="px-1.5 py-px rounded text-[9px] font-bold"
                      style={{ background: `${typeColor}14`, color: typeColor }}>{e.group}</span>
                    <span style={{ color: 'var(--muted)' }}>{e.periodLabel}</span>
                    <span className="ml-auto font-mono text-[9px]" style={{ color: 'var(--muted)' }}>{fmtTs(e.ts)}</span>
                  </div>
                  {(e.changes || []).filter(c => c.krId === kr.id).map((c, ci) => (
                    <div key={ci} className="flex items-center gap-1.5 flex-wrap">
                      <span style={{ color: 'var(--muted)' }}>{FIELD_LABELS[c.field] ?? c.field}：</span>
                      {c.field === 'status' ? (
                        <><span style={{ color: 'var(--muted)' }}>{c.from}</span>
                          <span style={{ color: 'var(--muted)' }}>→</span>
                          <span className="font-semibold" style={{ color: 'var(--text)' }}>{c.to}</span></>
                      ) : (
                        <span className="leading-relaxed" style={{ color: 'var(--text)' }}>
                          {(c.to || '').slice(0, 60)}{(c.to || '').length > 60 ? '…' : ''}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── 单元格详情 Modal ─────────────────────────────────────────────────────────
function CellDetailModal({ periodId, group, kr, periodLabel, allReports, onClose }) {
  const rep    = allReports[periodId]?.[group]?.[kr.id]
  const status = rep?.status || 'empty'
  const [entries,    setEntries]    = useState(null)
  const [detailAtts, setDetailAtts] = useState(null)

  useEffect(() => {
    getHistory({ group, periodId }).then(all => {
      setEntries(all.filter(e => e.changes?.some(c => c.krId === kr.id)))
    }).catch(() => setEntries([]))
  }, [group, periodId, kr.id])

  useEffect(() => {
    getKRAttachments(group, periodId)
      .then(atts => setDetailAtts(atts.filter(a => a.krId === kr.id)))
      .catch(() => setDetailAtts([]))
  }, [group, periodId, kr.id])

  const fmtTs = ts => {
    if (!ts) return ''
    const d = new Date(ts)
    return `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
  }

  return (
    <ModalShell title={`${group} · ${periodLabel}`} onClose={onClose}>
      <div className="p-5 space-y-4" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
        <div>
          <p className="text-[11px] font-semibold mb-1" style={{ color: 'var(--muted)' }}>KR</p>
          <p className="text-[13px] leading-relaxed" style={{ color: 'var(--text)' }}>{kr.desc}</p>
        </div>
        <div className="flex items-center gap-2">
          <p className="text-[11px] font-semibold" style={{ color: 'var(--muted)' }}>状态</p>
          <StatusBadge status={status} />
        </div>
        <div>
          <p className="text-[11px] font-semibold mb-1" style={{ color: 'var(--muted)' }}>进展描述</p>
          <p className="text-[13px] leading-relaxed px-3 py-2.5 rounded-xl"
            style={{ background: 'var(--surface2)', color: rep?.content ? 'var(--text)' : 'var(--muted)', minHeight: 48 }}>
            {rep?.content || '暂无进展描述'}
          </p>
        </div>
        {/* 附件 */}
        {detailAtts !== null && detailAtts.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold mb-1.5" style={{ color: 'var(--muted)' }}>支撑附件</p>
            <div className="space-y-1">
              {detailAtts.map(att => (
                <div key={att.token} className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-[11px]"
                  style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                  <FileText className="w-3 h-3 shrink-0" style={{ color: ACCENT }} />
                  <span className="flex-1 truncate font-medium" style={{ color: 'var(--text)' }}>{att.displayName}</span>
                  <span className="font-mono text-[10px] shrink-0" style={{ color: 'var(--muted)' }}>
                    {fmtFileSize(att.size)}
                  </span>
                  {att.presignedUrl && (
                    <a href={att.presignedUrl} target="_blank" rel="noreferrer"
                      className="press px-2 py-0.5 rounded-lg text-[10px] font-semibold"
                      style={{ background: `${ACCENT}14`, color: ACCENT }}>下载</a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="text-[11px] font-semibold mb-2" style={{ color: 'var(--muted)' }}>变更记录</p>
          {entries === null ? (
            <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--muted)' }}>
              <div className="w-3 h-3 rounded-full border animate-spin"
                style={{ borderColor: 'rgba(37,99,235,0.15)', borderTopColor: ACCENT }} />加载中…
            </div>
          ) : entries.length === 0 ? (
            <p className="text-[11px]" style={{ color: 'var(--muted)' }}>暂无变更记录</p>
          ) : entries.map((e, ei) => (
            <div key={ei} className="mb-2 px-3 py-2 rounded-xl text-[11px]"
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-1.5 mb-1">
                <span className="font-semibold" style={{ color: 'var(--text)' }}>{e.user}</span>
                <span className="font-mono text-[9px] ml-auto" style={{ color: 'var(--muted)' }}>{fmtTs(e.ts)}</span>
              </div>
              {(e.changes || []).filter(c => c.krId === kr.id).map((c, ci) => (
                <p key={ci} style={{ color: 'var(--muted)' }}>
                  {c.field === 'status'
                    ? <>{c.from} → <span className="font-semibold" style={{ color: 'var(--text)' }}>{c.to}</span></>
                    : <span style={{ color: 'var(--text)' }}>{(c.to || '').slice(0, 80)}</span>}
                </p>
              ))}
            </div>
          ))}
        </div>
      </div>
    </ModalShell>
  )
}

// ── 填写报告（草稿 / 提交双状态） ─────────────────────────────────────────────
function ReportPanel({ annualOkr, quarterlyOkr, periods, allReports, selectedPeriod, onPeriodChange, myGroup, profile, onSaved }) {
  const [draft,       setDraft]       = useState({})
  const [saving,      setSaving]      = useState(false)
  const [saved,       setSaved]       = useState(false)
  const [krAtts,      setKrAtts]      = useState({})   // { krId: [{ token, displayName, size, presignedUrl, mimetype }] }
  const [uploadingKr, setUploadingKr] = useState(null) // krId
  const [deletingToken, setDeletingToken] = useState(null)
  const fileInputRefs = useRef({})  // { krId: <input el> }

  // 读取当前已保存数据（含 _meta）
  const savedData = useMemo(() =>
    allReports[selectedPeriod]?.[myGroup] || {}
  , [allReports, selectedPeriod, myGroup])

  const submitStatus = savedData._meta?.status || 'draft'
  const isSubmitted  = submitStatus === 'submitted'

  // 上期参考
  const prevPeriod = useMemo(() => {
    const idx = periods.findIndex(p => p.id === selectedPeriod)
    return idx >= 0 && idx < periods.length - 1 ? periods[idx + 1] : null
  }, [periods, selectedPeriod])
  const prevReport = useMemo(() =>
    prevPeriod ? (allReports[prevPeriod.id]?.[myGroup] || {}) : {}
  , [allReports, prevPeriod, myGroup])

  // 草稿 KR 数据（不含 _meta）
  const krData = useMemo(() => {
    const d = { ...savedData }; delete d._meta; return d
  }, [savedData])

  useEffect(() => { setDraft(krData) }, [selectedPeriod, myGroup, JSON.stringify(krData)])

  // 加载当前组-周期附件
  useEffect(() => {
    if (!selectedPeriod || !myGroup) return
    getKRAttachments(myGroup, selectedPeriod)
      .then(atts => setKrAtts(groupByKr(atts)))
      .catch(() => {})
  }, [selectedPeriod, myGroup])

  function groupByKr(atts) {
    const m = {}
    for (const a of atts) {
      if (!m[a.krId]) m[a.krId] = []
      m[a.krId].push(a)
    }
    return m
  }

  async function handleKRFileUpload(krId, files) {
    if (!selectedPeriod) { alert('请先选择汇报周期'); return }
    setUploadingKr(krId)
    try {
      let latest
      for (const file of files) {
        if (file.size > 20 * 1024 * 1024) { alert(`「${file.name}」超过 20MB`); continue }
        latest = await uploadKRAttachment(myGroup, selectedPeriod, krId, file)
      }
      if (latest) setKrAtts(groupByKr(latest))
    } catch (e) { alert('上传失败：' + e.message) }
    finally { setUploadingKr(null) }
  }

  async function handleKRFileDelete(token) {
    if (!selectedPeriod) return
    setDeletingToken(token)
    try {
      const allAtts = Object.values(krAtts).flat()
      const keepTokens = allAtts.filter(a => a.token !== token).map(a => a.token)
      const latest = await deleteKRAttachment(myGroup, selectedPeriod, keepTokens)
      if (latest) setKrAtts(groupByKr(latest))
    } catch (e) { alert('删除失败：' + e.message) }
    finally { setDeletingToken(null) }
  }

  const allKRs = useMemo(() => {
    const r = []
    annualOkr.objectives.forEach((obj, oi) => obj.krs.forEach(kr => r.push({ typeLabel: '年度', oi, obj, kr })))
    quarterlyOkr.objectives.forEach((obj, oi) => obj.krs.forEach(kr => r.push({ typeLabel: `${FY.qk} 季度`, oi, obj, kr })))
    return r
  }, [annualOkr, quarterlyOkr])

  function update(krId, field, value) {
    setDraft(prev => ({ ...prev, [krId]: { ...prev[krId], [field]: value } }))
  }

  async function handleSave(newSubmitStatus) {
    if (!selectedPeriod) { alert('请先选择汇报周期'); return }
    setSaving(true)
    try {
      const changes = buildChangeDiff(krData, draft, allKRs)
      const payload = {
        ...draft,
        _meta: {
          status: newSubmitStatus,
          ...(newSubmitStatus === 'submitted'
            ? { submittedAt: new Date().toISOString(), submittedBy: profile?.displayName || '' }
            : {}),
        },
      }
      await saveGroupReport(myGroup, selectedPeriod, payload, profile?.displayName || '')
      if (changes.length > 0) {
        const p = periods.find(x => x.id === selectedPeriod)
        await appendHistory(selectedPeriod, myGroup, {
          ts: new Date().toISOString(),
          user: profile?.displayName || '未知用户',
          group: myGroup,
          periodId: selectedPeriod,
          periodLabel: p?.label || selectedPeriod,
          changes,
        })
      }
      await onSaved(); setSaved(true); setTimeout(() => setSaved(false), 2500)
    } catch (e) { alert('保存失败：' + e.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-4">
      {/* 控制栏 */}
      <div className="card p-3.5 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-xs font-medium shrink-0" style={{ color: 'var(--muted)' }}>汇报周期</span>
          <select value={selectedPeriod} onChange={e => onPeriodChange(e.target.value)}
            className="field text-xs py-1.5 px-2" style={{ minWidth: 160 }}>
            <option value="">请选择周期</option>
            {periods.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {saved && <span className="text-xs font-medium flex items-center gap-1" style={{ color: '#059669' }}>
            <Check className="w-3 h-3" />已保存</span>}
          <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg"
            style={{ background: 'rgba(37,99,235,0.1)', color: ACCENT, border: '1px solid rgba(37,99,235,0.15)' }}>
            {myGroup}
          </span>
          {isSubmitted ? (
            <>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold"
                style={{ background: 'rgba(16,185,129,0.1)', color: '#059669', border: '1px solid rgba(16,185,129,0.25)' }}>
                <Check className="w-3 h-3" />已提交
              </span>
              <button onClick={() => handleSave('draft')} disabled={saving}
                className="press px-2.5 py-1 rounded-lg text-[11px] font-semibold disabled:opacity-50"
                style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', opacity: 0.75 }}>
                重新编辑
              </button>
            </>
          ) : (
            <>
              <button onClick={() => handleSave('draft')} disabled={saving || !selectedPeriod}
                className="press flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[13px] font-semibold disabled:opacity-50"
                style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', opacity: 0.75 }}>
                <Save className="w-3.5 h-3.5" />{saving ? '…' : '保存草稿'}
              </button>
              <button onClick={() => handleSave('submitted')} disabled={saving || !selectedPeriod}
                className="press flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-semibold text-white disabled:opacity-50"
                style={{ background: ACCENT }}>
                <Check className="w-3.5 h-3.5" />{saving ? '…' : '提交报告'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* 上期参考提示 */}
      {prevPeriod && selectedPeriod && (
        <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-[11px]"
          style={{ background: 'rgba(245,158,11,0.06)', color: '#92400E', border: '1px solid rgba(245,158,11,0.15)' }}>
          <Clock className="w-3.5 h-3.5 shrink-0" />
          下方已展示上期（{prevPeriod.label}）数据供参考
        </div>
      )}

      {isSubmitted && (
        <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-[11px]"
          style={{ background: 'rgba(16,185,129,0.06)', color: '#065F46', border: '1px solid rgba(16,185,129,0.2)' }}>
          <Check className="w-3.5 h-3.5 shrink-0" />
          本期报告已提交，如需修改请点击「重新编辑」
          {savedData._meta?.submittedAt && (
            <span className="ml-1" style={{ color: '#059669' }}>
              · 提交于 {new Date(savedData._meta.submittedAt).toLocaleDateString('zh-CN')}
            </span>
          )}
        </div>
      )}

      {!selectedPeriod ? (
        <div className="card p-14 text-center space-y-2">
          <p className="text-3xl">📅</p>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>请选择汇报周期以开始填写</p>
        </div>
      ) : allKRs.length === 0 ? (
        <div className="card p-14 text-center space-y-2">
          <p className="text-3xl">📋</p>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>暂无 KR，管理员请先在「OKR 设置」中添加</p>
        </div>
      ) : (
        <div className="space-y-3">
          {allKRs.map(({ typeLabel, oi, obj, kr }, idx) => {
            const showHead = idx === 0 || allKRs[idx - 1].obj.id !== obj.id
            const d    = draft[kr.id] || {}
            const prev = prevReport[kr.id] || {}
            const tc   = typeLabel === '年度' ? ACCENT : Q_ACCENT
            return (
              <div key={kr.id}>
                {showHead && (
                  <div className="flex items-center gap-2 mt-3 mb-1.5 px-1">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md"
                      style={{ background: `${tc}18`, color: tc }}>{typeLabel} O{oi + 1}</span>
                    <span className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>{obj.objective}</span>
                  </div>
                )}
                <div className="card p-4 space-y-3"
                  style={{
                    opacity: isSubmitted ? 0.8 : 1,
                    pointerEvents: isSubmitted ? 'none' : 'auto',
                    borderLeft: `3px solid ${tc}`,
                  }}>
                  <div className="flex items-start gap-2">
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold shrink-0 mt-0.5"
                      style={{ background: 'rgba(245,158,11,0.15)', color: '#B45309' }}>KR</span>
                    <span className="text-[13px] flex-1 leading-relaxed font-medium" style={{ color: 'var(--text)' }}>{kr.desc}</span>
                  </div>
                  {prevPeriod && (prev.status || prev.content) && (
                    <div className="ml-7 px-3 py-2 rounded-xl text-[11px] flex items-start gap-2"
                      style={{ background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.12)' }}>
                      <span className="font-semibold shrink-0" style={{ color: '#92400E' }}>上期</span>
                      {prev.status && <StatusBadge status={prev.status} size="xs" />}
                      {prev.content && <span className="leading-relaxed" style={{ color: 'var(--muted)' }}>{prev.content}</span>}
                    </div>
                  )}
                  <div className="flex items-center gap-3 ml-7">
                    <span className="text-xs font-medium shrink-0" style={{ color: 'var(--muted)' }}>完成状态</span>
                    <div className="flex gap-2">
                      {['notstart', 'progress', 'done'].map(s => {
                        const cfg = STATUS_CFG[s]; const active = d.status === s
                        return (
                          <button key={s} onClick={() => update(kr.id, 'status', s)}
                            className="press px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all"
                            style={active
                              ? { background: cfg.solid, color: cfg.text, boxShadow: `0 2px 8px ${cfg.solid}55` }
                              : { background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', opacity: 0.6 }}>
                            {cfg.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  {/* 进展文本 */}
                  <div className="ml-7">
                    <textarea value={d.content || ''} onChange={e => update(kr.id, 'content', e.target.value)}
                      className="field text-[13px]" rows={3} style={{ resize: 'vertical' }}
                      placeholder={`描述 ${myGroup} 本周期在此 KR 的进展…`} />
                  </div>

                  {/* 逐 KR 附件区 */}
                  <div className="ml-7">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-[11px] font-semibold" style={{ color: 'var(--text)', opacity: 0.65 }}>支撑附件</span>
                      {!isSubmitted && (
                        <>
                          <button
                            onClick={() => fileInputRefs.current[kr.id]?.click()}
                            disabled={!!uploadingKr}
                            className="press flex items-center gap-0.5 px-2 py-0.5 rounded-lg text-[10px] font-semibold disabled:opacity-40"
                            style={{ background: 'rgba(37,99,235,0.07)', color: ACCENT, border: '1px solid rgba(37,99,235,0.15)' }}>
                            {uploadingKr === kr.id
                              ? <Loader2 className="w-2.5 h-2.5 animate-spin" />
                              : <Plus className="w-2.5 h-2.5" />}
                            上传
                          </button>
                          <input
                            ref={el => { fileInputRefs.current[kr.id] = el }}
                            type="file" multiple hidden
                            onChange={e => { handleKRFileUpload(kr.id, Array.from(e.target.files)); e.target.value = '' }} />
                        </>
                      )}
                    </div>
                    {(krAtts[kr.id] || []).length > 0 && (
                      <div className="space-y-1">
                        {(krAtts[kr.id] || []).map(att => (
                          <div key={att.token} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px]"
                            style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                            <FileText className="w-3 h-3 shrink-0" style={{ color: 'var(--muted)' }} />
                            <span className="flex-1 truncate" style={{ color: 'var(--text)' }}>{att.displayName}</span>
                            <span className="font-mono shrink-0 text-[10px]" style={{ color: 'var(--muted)' }}>
                              {fmtFileSize(att.size)}
                            </span>
                            {att.presignedUrl && (
                              <a href={att.presignedUrl} target="_blank" rel="noreferrer"
                                className="press px-1.5 py-0.5 rounded text-[10px]"
                                style={{ background: 'rgba(37,99,235,0.07)', color: ACCENT }}>下载</a>
                            )}
                            {!isSubmitted && (
                              <button onClick={() => handleKRFileDelete(att.token)}
                                disabled={deletingToken === att.token}
                                className="press px-1.5 py-0.5 rounded text-[10px] disabled:opacity-40"
                                style={{ background: 'rgba(244,63,94,0.07)', color: '#E11D48' }}>
                                {deletingToken === att.token ? '…' : '删除'}
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── AI 月报 / 年报（含 OpenRouter 兜底） ───────────────────────────────────────
async function callAI(prompt) {
  // 1. 直连内部 AI
  if (AI_BASE && AI_KEY && AI_BASE.startsWith('https')) {
    try {
      const res = await fetch(`${AI_BASE}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${AI_KEY}` },
        body: JSON.stringify({ model: AI_MODEL, messages: [{ role: 'user', content: prompt }], max_tokens: 2000 }),
      })
      if (res.ok) {
        const data = await res.json()
        const text = data.choices?.[0]?.message?.content?.trim()
        if (text) return text
      }
    } catch { /* fall through */ }
  }
  // 2. OpenRouter 兜底
  if (!OR_KEY) throw new Error('内部 AI 接口不可用，且未配置 VITE_OPENROUTER_KEY')
  for (const model of OR_MODELS) {
    try {
      const res = await fetch(`${OR_BASE}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OR_KEY}`,
          'HTTP-Referer': window.location.origin, 'X-Title': 'OKR Report' },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], max_tokens: 2000 }),
      })
      if (res.status === 429 || res.status === 403) continue
      if (!res.ok) continue
      const data = await res.json()
      const text = data.choices?.[0]?.message?.content?.trim()
      if (text) return text
    } catch { continue }
  }
  throw new Error('AI 服务暂时不可用，请稍后重试')
}

function AIReportPanel({ annualOkr, quarterlyOkr, periods, allReports }) {
  const [mode,          setMode]          = useState('monthly')
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [selectedYear,  setSelectedYear]  = useState(String(FY.fy))
  const [generating,    setGenerating]    = useState(false)
  const [report,        setReport]        = useState('')
  const [copied,        setCopied]        = useState(false)

  const monthOpts = useMemo(() => {
    const s = new Set(periods.map(p => p.start.slice(0, 7)))
    return [...s].sort().reverse()
  }, [periods])

  const allKRs = useMemo(() => {
    const r = []
    annualOkr.objectives.forEach(obj => obj.krs.forEach(kr => r.push({ obj, kr })))
    quarterlyOkr.objectives.forEach(obj => obj.krs.forEach(kr => r.push({ obj, kr })))
    return r
  }, [annualOkr, quarterlyOkr])

  function buildOKRText() {
    let t = ''
    annualOkr.objectives.forEach((obj, oi) => {
      t += `O${oi+1}（年度）: ${obj.objective}\n`
      obj.krs.forEach((kr, ki) => { t += `  KR${ki+1}: ${kr.desc}\n` })
    })
    quarterlyOkr.objectives.forEach((obj, oi) => {
      t += `O${oi+1}（${FY.qk}季度）: ${obj.objective}\n`
      obj.krs.forEach((kr, ki) => { t += `  KR${ki+1}: ${kr.desc}\n` })
    })
    return t
  }

  function buildPeriodsText(targetPeriods) {
    return targetPeriods.map(p => {
      let t = `\n【${p.label} · ${p.start}~${p.end}】\n`
      OKR_GROUPS.forEach(g => {
        const rep = allReports[p.id]?.[g]
        if (!rep || Object.keys(rep).filter(k => k !== '_meta').length === 0) { t += `${g}：未填报\n`; return }
        t += `${g}：\n`
        allKRs.forEach(({ kr }) => {
          const r = rep[kr.id]
          if (r?.status || r?.content)
            t += `  · ${kr.desc} | ${STATUS_CFG[r.status]?.label || '?'} | ${r.content || '无'}\n`
        })
      })
      return t
    }).join('')
  }

  function buildPrompt() {
    const okr = buildOKRText()
    if (mode === 'monthly') {
      const ps = periods.filter(p => p.start.startsWith(selectedMonth))
      if (ps.length === 0) return null
      return `你是采购运营组工作助手，根据以下数据生成 ${selectedMonth} OKR 月报。\n\nOKR结构：\n${okr}\n\n数据：${buildPeriodsText(ps)}\n\n输出Markdown月报（总体进展/各组亮点/风险挑战/下月重点），600字内。`
    }
    const ps = periods.filter(p => p.start.startsWith(selectedYear) || (p.start >= `${parseInt(selectedYear)-1}-03`))
    if (ps.length === 0) return null
    return `你是采购运营组工作助手，根据以下数据生成 ${selectedYear} 年度 OKR 总结。\n\nOKR结构：\n${okr}\n\n数据：${buildPeriodsText(ps)}\n\n输出Markdown年报（年度总评/各O达成/各组表现/亮点经验/改进建议），1000字内。`
  }

  async function handleGenerate() {
    const prompt = buildPrompt()
    if (!prompt) { alert('所选时间范围内暂无汇报数据'); return }
    setGenerating(true); setReport('')
    try { setReport(await callAI(prompt)) }
    catch (e) { setReport(`生成失败：${e.message}`) }
    finally { setGenerating(false) }
  }

  function handleCopy() {
    navigator.clipboard.writeText(report).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }

  return (
    <div className="space-y-4">
      <div className="card p-4 space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex gap-1 p-1 rounded-xl"
            style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
            {[['monthly', '月报'], ['annual', '年报']].map(([v, l]) => (
              <button key={v} onClick={() => { setMode(v); setReport('') }}
                className="press px-4 py-1.5 rounded-lg text-[13px] font-medium transition-all"
                style={mode === v
                  ? { background: 'var(--surface)', color: 'var(--text)', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }
                  : { color: 'var(--muted)' }}>
                {l}
              </button>
            ))}
          </div>
          {mode === 'monthly' ? (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium" style={{ color: 'var(--muted)' }}>月份</span>
              {monthOpts.length > 0
                ? <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}
                    className="field text-xs py-1.5 px-2" style={{ width: 'auto' }}>
                    {monthOpts.map(m => <option key={m}>{m}</option>)}
                  </select>
                : <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}
                    className="field text-xs py-1.5 px-2" style={{ width: 'auto' }} />}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium" style={{ color: 'var(--muted)' }}>年份</span>
              <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)}
                className="field text-xs py-1.5 px-2" style={{ width: 'auto' }}>
                {[String(FY.fy), String(FY.fy - 1)].map(y => <option key={y}>{y}</option>)}
              </select>
            </div>
          )}
          <button onClick={handleGenerate} disabled={generating}
            className="press flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-semibold text-white ml-auto disabled:opacity-50"
            style={{ background: ACCENT }}>
            <Bot className={`w-3.5 h-3.5 ${generating ? 'animate-pulse' : ''}`} />
            {generating ? '生成中…' : `生成${mode === 'monthly' ? '月报' : '年报'}`}
          </button>
        </div>
      </div>

      {generating && (
        <div className="card p-12 flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 animate-spin"
            style={{ borderColor: 'rgba(37,99,235,0.15)', borderTopColor: ACCENT }} />
          <p className="text-sm" style={{ color: 'var(--muted)' }}>AI 正在生成报告…</p>
        </div>
      )}

      {report && !generating && (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5"
            style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4" style={{ color: ACCENT }} />
              <span className="font-semibold text-[13px]" style={{ color: 'var(--text)' }}>
                AI {mode === 'monthly' ? `月报 · ${selectedMonth}` : `年报 · ${selectedYear}`}
              </span>
            </div>
            <button onClick={handleCopy}
              className="press flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-medium"
              style={{ background: 'var(--surface2)', color: copied ? '#059669' : 'var(--muted)',
                border: `1px solid ${copied ? 'rgba(16,185,129,0.3)' : 'var(--border)'}` }}>
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {copied ? '已复制' : '复制'}
            </button>
          </div>
          <div className="p-5" style={{ maxHeight: 520, overflowY: 'auto' }}>
            <pre className="text-[13px] leading-relaxed whitespace-pre-wrap font-sans"
              style={{ color: 'var(--text)' }}>{report}</pre>
          </div>
        </div>
      )}

      {!report && !generating && (
        <div className="card p-14 text-center space-y-3">
          <Bot className="w-10 h-10 mx-auto" style={{ color: 'var(--muted)' }} />
          <p className="font-semibold" style={{ color: 'var(--text)' }}>AI {mode === 'monthly' ? '月报' : '年报'}生成</p>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>选择时间范围后点击生成，AI 将自动汇总 OKR 数据</p>
        </div>
      )}
    </div>
  )
}

// ── OKR 设置（管理员） ─────────────────────────────────────────────────────────
function SetupPanel({ profile, onSaved }) {
  const [subTab,  setSubTab]  = useState('annual')
  const [qkSel,   setQkSel]   = useState(FY.qk)
  const [okrData, setOkrData] = useState({ objectives: [] })
  const [loading, setLoading] = useState(false)
  const [saving,  setSaving]  = useState(false)
  const [objModal,setObjModal] = useState(null)
  const [krModal, setKrModal]  = useState(null)

  const byUser     = profile?.displayName || ''
  const currentKey = subTab === 'annual' ? FY.annualKey : `quarterly-${qkSel}`
  const QK_OPTS    = useMemo(() => [`${FY.fy}-Q1`,`${FY.fy}-Q2`,`${FY.fy}-Q3`,`${FY.fy}-Q4`], [])
  const setupColor = subTab === 'annual' ? ACCENT : Q_ACCENT
  const setupAlpha = subTab === 'annual' ? 'rgba(37,99,235,0.1)' : 'rgba(124,58,237,0.1)'

  useEffect(() => { setLoading(true); getOKRSetup(currentKey).then(setOkrData).finally(() => setLoading(false)) }, [currentKey])

  async function saveObj(text, editId) {
    const next = { ...okrData }
    next.objectives = editId
      ? next.objectives.map(o => o.id === editId ? { ...o, objective: text } : o)
      : [...(next.objectives || []), { id: uid(), objective: text, krs: [] }]
    setSaving(true)
    try { await saveOKRSetup(currentKey, next, byUser); setOkrData(next); setObjModal(null) }
    catch (e) { alert(e.message) } finally { setSaving(false) }
  }

  async function delObj(objId) {
    if (!confirm('确认删除此目标及所有 KR？')) return
    const next = { ...okrData, objectives: okrData.objectives.filter(o => o.id !== objId) }
    await saveOKRSetup(currentKey, next, byUser); setOkrData(next)
  }

  async function saveKR(text, objId, editId) {
    const next = {
      ...okrData,
      objectives: okrData.objectives.map(o => {
        if (o.id !== objId) return o
        const krs = editId
          ? (o.krs || []).map(k => k.id === editId ? { ...k, desc: text } : k)
          : [...(o.krs || []), { id: uid(), desc: text }]
        return { ...o, krs }
      }),
    }
    setSaving(true)
    try { await saveOKRSetup(currentKey, next, byUser); setOkrData(next); setKrModal(null) }
    catch (e) { alert(e.message) } finally { setSaving(false) }
  }

  async function delKR(objId, krId) {
    if (!confirm('确认删除此 KR？')) return
    const next = { ...okrData,
      objectives: okrData.objectives.map(o => o.id !== objId ? o : { ...o, krs: (o.krs||[]).filter(k=>k.id!==krId) }) }
    await saveOKRSetup(currentKey, next, byUser); setOkrData(next)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
          {[{ key: 'annual', label: '年度 OKR' }, { key: 'quarterly', label: '季度 OKR' }].map(t => (
            <button key={t.key} onClick={() => setSubTab(t.key)}
              className="press px-4 py-1.5 rounded-lg text-[13px] font-medium transition-all"
              style={subTab === t.key
                ? { background: 'var(--surface)', color: 'var(--text)', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }
                : { color: 'var(--muted)' }}>{t.label}</button>
          ))}
        </div>
        {subTab === 'quarterly' && (
          <select value={qkSel} onChange={e => setQkSel(e.target.value)} className="field text-xs py-1.5 px-2" style={{ width: 'auto' }}>
            {QK_OPTS.map(q => <option key={q} value={q}>{q}{q===FY.qk?'（当前）':''}</option>)}
          </select>
        )}
        <button onClick={() => setObjModal({ editId: null, text: '' })}
          className="press flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[13px] font-semibold text-white ml-auto"
          style={{ background: setupColor }}><Plus className="w-3.5 h-3.5" />添加目标</button>
      </div>

      {loading ? (
        <div className="card p-12 flex items-center justify-center gap-3">
          <div className="w-5 h-5 rounded-full border-2 animate-spin" style={{ borderColor: 'rgba(37,99,235,0.15)', borderTopColor: ACCENT }} />
          <span className="text-sm" style={{ color: 'var(--muted)' }}>加载中…</span>
        </div>
      ) : okrData.objectives.length === 0 ? (
        <div className="card p-14 text-center space-y-2">
          <p className="text-3xl">🎯</p>
          <p className="font-semibold" style={{ color: 'var(--text)' }}>暂无目标</p>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>点击右上角「添加目标」开始设置</p>
        </div>
      ) : (
        <div className="space-y-3">
          {okrData.objectives.map((obj, oi) => (
            <div key={obj.id} className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-3 px-4 py-3.5" style={{ background: 'var(--surface)' }}>
                <span className="text-[10px] font-bold px-2.5 py-1 rounded-lg shrink-0" style={{ background: setupAlpha, color: setupColor }}>O{oi+1}</span>
                <span className="flex-1 text-[13px] font-semibold" style={{ color: 'var(--text)' }}>{obj.objective}</span>
                <button onClick={() => setObjModal({ editId: obj.id, text: obj.objective })} className="press p-1.5 rounded-lg" style={{ color: 'var(--muted)' }}><Edit2 className="w-3.5 h-3.5" /></button>
                <button onClick={() => delObj(obj.id)} className="press p-1.5 rounded-lg" style={{ color: '#E11D48' }}><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
              <div style={{ borderTop: '1px solid var(--border)' }}>
                {(obj.krs||[]).map((kr, ki) => (
                  <div key={kr.id} className="flex items-start gap-3 px-4 py-3 border-b last:border-b-0" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold shrink-0 mt-0.5" style={{ background: 'rgba(245,158,11,0.15)', color: '#B45309' }}>{ki+1}</span>
                    <span className="flex-1 text-[12px] leading-relaxed" style={{ color: 'var(--text)' }}>{kr.desc}</span>
                    <button onClick={() => setKrModal({ objId: obj.id, editId: kr.id, text: kr.desc })} className="press p-1.5 rounded-lg shrink-0" style={{ color: 'var(--muted)' }}><Edit2 className="w-3 h-3" /></button>
                    <button onClick={() => delKR(obj.id, kr.id)} className="press p-1.5 rounded-lg shrink-0" style={{ color: '#E11D48' }}><Trash2 className="w-3 h-3" /></button>
                  </div>
                ))}
                <div className="px-4 py-2.5">
                  <button onClick={() => setKrModal({ objId: obj.id, editId: null, text: '' })}
                    className="press flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg"
                    style={{ background: 'rgba(245,158,11,0.08)', color: '#B45309', border: '1px solid rgba(245,158,11,0.18)' }}>
                    <Plus className="w-3 h-3" />添加 KR
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {objModal && <TextModal title={objModal.editId?'编辑目标':'添加目标'} placeholder="例：提升采购效率…" defaultValue={objModal.text} rows={3} saving={saving} onSave={t=>saveObj(t,objModal.editId)} onClose={()=>setObjModal(null)} />}
      {krModal && <TextModal title={krModal.editId?'编辑 KR':'添加 KR'} placeholder="例：Q1 综合采购成本降低 5%…" defaultValue={krModal.text} rows={4} saving={saving} onSave={t=>saveKR(t,krModal.objId,krModal.editId)} onClose={()=>setKrModal(null)} />}
    </div>
  )
}

// ── 周期管理（管理员） ─────────────────────────────────────────────────────────
function PeriodsPanel({ periods, setPeriods, profile, onNewPeriod }) {
  const [showAdd, setShowAdd] = useState(false)
  const [start,   setStart]   = useState('')
  const [end,     setEnd]     = useState('')
  const [label,   setLabel]   = useState('')
  const [saving,  setSaving]  = useState(false)
  const byUser = profile?.displayName || ''

  function openAdd() {
    const t = new Date(), fmt = d => d.toISOString().slice(0,10)
    setStart(fmt(t)); setEnd(fmt(new Date(t.getTime()+13*86400000))); setLabel(''); setShowAdd(true)
  }

  async function handleAdd() {
    if (!start||!end||start>end) { alert('请正确填写起止日期'); return }
    const newP = { id: uid(), start, end, label: label.trim()||`${start} 至 ${end}` }
    const next = [newP,...periods].sort((a,b)=>b.start.localeCompare(a.start))
    setSaving(true)
    try { await savePeriods(next,byUser); setPeriods(next); await onNewPeriod(); setShowAdd(false) }
    catch(e){ alert(e.message) } finally { setSaving(false) }
  }

  async function handleDel(id) {
    if (!confirm('删除周期后相关填报数据将不再关联，确认？')) return
    const next = periods.filter(p=>p.id!==id)
    await savePeriods(next,byUser); setPeriods(next)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: 'var(--muted)' }}>管理双周汇报周期</p>
        <button onClick={openAdd} className="press flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[13px] font-semibold text-white" style={{ background: ACCENT }}>
          <Plus className="w-3.5 h-3.5" />新增周期
        </button>
      </div>
      <div className="card overflow-hidden">
        {periods.length === 0 ? (
          <div className="p-14 text-center space-y-2"><p className="text-3xl">📅</p><p className="text-sm" style={{ color: 'var(--muted)' }}>暂无周期</p></div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr style={{ borderBottom:'1px solid var(--border)', background:'var(--surface2)' }}>
              {['周期标签','开始日期','结束日期','操作'].map((h,i)=>(
                <th key={h} className={`px-4 py-3 text-left text-[11px] font-semibold ${i===3?'text-right':''}`} style={{ color:'var(--muted)' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {periods.map(p=>(
                <tr key={p.id} className="border-b last:border-b-0" style={{ borderColor:'var(--border)' }}
                  onMouseEnter={e=>e.currentTarget.style.background='var(--surface2)'}
                  onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <td className="px-4 py-3.5 font-medium text-[13px]" style={{ color:'var(--text)' }}>{p.label}</td>
                  <td className="px-4 py-3.5 text-xs font-mono" style={{ color:'var(--muted)' }}>{p.start}</td>
                  <td className="px-4 py-3.5 text-xs font-mono" style={{ color:'var(--muted)' }}>{p.end}</td>
                  <td className="px-4 py-3.5 text-right">
                    <button onClick={()=>handleDel(p.id)} className="press inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium"
                      style={{ background:'rgba(244,63,94,0.07)', color:'#E11D48', border:'1px solid rgba(244,63,94,0.14)' }}>
                      <Trash2 className="w-3 h-3" />删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {showAdd && (
        <ModalShell title="新增双周周期" onClose={()=>setShowAdd(false)}>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs font-semibold mb-1.5" style={{ color:'var(--text)',opacity:.65 }}>开始日期</label>
                <input type="date" value={start} onChange={e=>setStart(e.target.value)} className="field" /></div>
              <div><label className="block text-xs font-semibold mb-1.5" style={{ color:'var(--text)',opacity:.65 }}>结束日期</label>
                <input type="date" value={end} onChange={e=>setEnd(e.target.value)} className="field" /></div>
            </div>
            <div><label className="block text-xs font-semibold mb-1.5" style={{ color:'var(--text)',opacity:.65 }}>周期标签（可选）</label>
              <input type="text" value={label} onChange={e=>setLabel(e.target.value)} className="field" placeholder="例：2026-04-01 双周汇报" /></div>
            <div className="flex gap-2.5 pt-1">
              <button onClick={()=>setShowAdd(false)} className="press flex-1 py-2.5 text-sm font-semibold rounded-xl" style={{ background:'var(--surface2)',color:'var(--muted)' }}>取消</button>
              <button onClick={handleAdd} disabled={saving} className="press flex-1 py-2.5 text-sm font-semibold text-white rounded-xl disabled:opacity-50" style={{ background:ACCENT }}>
                {saving?'添加中…':'添加'}
              </button>
            </div>
          </div>
        </ModalShell>
      )}
    </div>
  )
}

// ── 催办确认 Modal ──────────────────────────────────────────────────────────
function OKRUrgeModal({ period, people, onClose }) {
  const [selected, setSelected] = useState(() => new Set(people.map(p => p.uid)))
  const [sending,  setSending]  = useState(false)
  const [results,  setResults]  = useState(null)  // { sent, failed }

  function toggle(uid) {
    setSelected(prev => { const s = new Set(prev); s.has(uid) ? s.delete(uid) : s.add(uid); return s })
  }

  async function handleSend() {
    const targets = people.filter(p => selected.has(p.uid))
    if (targets.length === 0) { alert('请至少选择一名催办对象'); return }
    setSending(true)
    const sent = [], failed = []
    for (const p of targets) {
      if (!p.jobId) { failed.push({ ...p, reason: '未配置工号' }); continue }
      try {
        const content = `您好，${period.label} OKR 进度报告（${p.group}）尚未提交，请尽快登录采购运营门户完成填写。`
        await sendNotify(p.jobId, content)
        sent.push(p)
      } catch (e) {
        failed.push({ ...p, reason: e.message || '发送失败' })
      }
    }
    setResults({ sent, failed })
    setSending(false)
  }

  return createPortal(
    <div className="fixed inset-0 z-[200] overflow-y-auto animate-fade-in"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)' }}
      onClick={results ? onClose : undefined}>
      <div className="flex min-h-full items-center justify-center p-4" onClick={e => e.stopPropagation()}>
        <div className="w-full max-w-md rounded-2xl shadow-2xl animate-scale-in"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          {/* 头部 */}
          <div className="flex items-center justify-between px-5 py-4"
            style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4" style={{ color: '#DC2626' }} />
              <h3 className="font-semibold text-[15px]" style={{ color: 'var(--text)' }}>催办提醒</h3>
            </div>
            <button onClick={onClose} className="press w-7 h-7 flex items-center justify-center rounded-xl"
              style={{ background: 'var(--surface2)', color: 'var(--muted)' }}><X className="w-3.5 h-3.5" /></button>
          </div>

          <div className="p-5 space-y-4">
            {/* 周期信息 */}
            <div className="px-3 py-2 rounded-xl text-[12px]"
              style={{ background: 'rgba(239,68,68,0.06)', color: '#DC2626', border: '1px solid rgba(239,68,68,0.15)' }}>
              催办周期：<span className="font-semibold">{period.label}</span>
              <span className="ml-2 opacity-70">{period.start} ~ {period.end}</span>
            </div>

            {results ? (
              /* 发送结果 */
              <div className="space-y-3">
                {results.sent.length > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold mb-1.5" style={{ color: '#059669' }}>
                      发送成功（{results.sent.length}）
                    </p>
                    {results.sent.map(p => (
                      <div key={p.uid} className="flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] mb-1"
                        style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.15)' }}>
                        <Check className="w-3 h-3 shrink-0" style={{ color: '#059669' }} />
                        <span className="font-semibold" style={{ color: 'var(--text)' }}>{p.group}</span>
                        <span style={{ color: 'var(--muted)' }}>{p.displayName}</span>
                        <span className="ml-auto font-mono text-[10px]" style={{ color: 'var(--muted)' }}>{p.jobId}</span>
                      </div>
                    ))}
                  </div>
                )}
                {results.failed.length > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold mb-1.5" style={{ color: '#DC2626' }}>
                      发送失败（{results.failed.length}）
                    </p>
                    {results.failed.map(p => (
                      <div key={p.uid} className="flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] mb-1"
                        style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.12)' }}>
                        <X className="w-3 h-3 shrink-0" style={{ color: '#DC2626' }} />
                        <span className="font-semibold" style={{ color: 'var(--text)' }}>{p.group}</span>
                        <span style={{ color: 'var(--muted)' }}>{p.displayName}</span>
                        <span className="ml-auto text-[10px]" style={{ color: '#DC2626' }}>{p.reason}</span>
                      </div>
                    ))}
                  </div>
                )}
                <button onClick={onClose}
                  className="press w-full py-2.5 text-sm font-semibold rounded-xl text-white"
                  style={{ background: ACCENT }}>关闭</button>
              </div>
            ) : (
              <>
                {/* 人员列表（可勾选） */}
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold" style={{ color: 'var(--muted)' }}>
                    以下小组尚未提交报告，将向其 OKR 负责人发送催办通知：
                  </p>
                  {people.map(p => (
                    <label key={p.uid}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all"
                      style={{
                        background: selected.has(p.uid) ? 'rgba(37,99,235,0.06)' : 'var(--surface2)',
                        border: `1px solid ${selected.has(p.uid) ? 'rgba(37,99,235,0.2)' : 'var(--border)'}`,
                      }}>
                      <input type="checkbox" checked={selected.has(p.uid)} onChange={() => toggle(p.uid)}
                        className="w-3.5 h-3.5 rounded accent-blue-600 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[12px] font-semibold" style={{ color: 'var(--text)' }}>{p.group}</span>
                          <span className="text-[11px]" style={{ color: 'var(--muted)' }}>{p.displayName}</span>
                        </div>
                        {p.jobId
                          ? <span className="text-[10px] font-mono" style={{ color: 'var(--muted)' }}>工号：{p.jobId}</span>
                          : <span className="text-[10px]" style={{ color: '#DC2626' }}>⚠ 未配置工号，无法发送</span>}
                      </div>
                    </label>
                  ))}
                </div>

                {/* 提示 */}
                <div className="flex items-start gap-2 px-3 py-2 rounded-xl text-[11px]"
                  style={{ background: 'rgba(245,158,11,0.06)', color: '#92400E', border: '1px solid rgba(245,158,11,0.15)' }}>
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  将通过数环通向所选工号发送催办消息
                </div>

                {/* 操作按钮 */}
                <div className="flex gap-2.5 pt-1">
                  <button onClick={onClose} disabled={sending}
                    className="press flex-1 py-2.5 text-sm font-semibold rounded-xl disabled:opacity-50"
                    style={{ background: 'var(--surface2)', color: 'var(--muted)' }}>取消</button>
                  <button onClick={handleSend} disabled={sending || selected.size === 0}
                    className="press flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-semibold text-white rounded-xl disabled:opacity-50"
                    style={{ background: '#DC2626' }}>
                    {sending
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />发送中…</>
                      : <><Send className="w-3.5 h-3.5" />发送催办（{selected.size}）</>}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ── 通用 Modal ──────────────────────────────────────────────────────────────
function TextModal({ title, placeholder, defaultValue, rows, saving, onSave, onClose }) {
  const [text, setText] = useState(defaultValue||'')
  return (
    <ModalShell title={title} onClose={onClose}>
      <div className="p-5 space-y-4">
        <textarea rows={rows} value={text} onChange={e=>setText(e.target.value)}
          className="field text-[13px]" style={{ resize:'vertical' }} placeholder={placeholder} />
        <div className="flex gap-2.5">
          <button onClick={onClose} className="press flex-1 py-2.5 text-sm font-semibold rounded-xl" style={{ background:'var(--surface2)',color:'var(--muted)' }}>取消</button>
          <button onClick={()=>{ if(!text.trim()){alert('内容不能为空');return}; onSave(text.trim()) }} disabled={saving}
            className="press flex-1 py-2.5 text-sm font-semibold text-white rounded-xl disabled:opacity-50" style={{ background:ACCENT }}>
            {saving?'保存中…':'保存'}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

function ModalShell({ title, onClose, children }) {
  return createPortal(
    <div className="fixed inset-0 z-[200] overflow-y-auto animate-fade-in"
      style={{ background:'rgba(0,0,0,0.5)', backdropFilter:'blur(8px)' }} onClick={onClose}>
      <div className="flex min-h-full items-center justify-center p-4" onClick={e=>e.stopPropagation()}>
        <div className="w-full max-w-md rounded-2xl shadow-2xl animate-scale-in"
          style={{ background:'var(--surface)', border:'1px solid var(--border)' }}>
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom:'1px solid var(--border)' }}>
            <h3 className="font-semibold text-[15px]" style={{ color:'var(--text)' }}>{title}</h3>
            <button onClick={onClose} className="press w-7 h-7 flex items-center justify-center rounded-xl"
              style={{ background:'var(--surface2)',color:'var(--muted)' }}><X className="w-3.5 h-3.5" /></button>
          </div>
          {children}
        </div>
      </div>
    </div>,
    document.body
  )
}
