import { useState, useEffect, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import {
  ChevronDown, ChevronRight, Plus, Edit2, Trash2,
  Check, Calendar, BarChart3, Settings, RefreshCw, Save,
  AlertCircle, FileText, X, Clock, Copy, Bot, ScrollText,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import {
  ensureOKRFields, getOKRSetup, saveOKRSetup,
  getPeriods, savePeriods,
  getAllGroupReports, getAllPeriodsReports, saveGroupReport,
  appendHistory, getHistory,
  uid, OKR_GROUPS, getFiscalYear,
} from '../lib/teableOKR'

const FY      = getFiscalYear()
const ACCENT  = '#2563EB'
const OKR_TID = import.meta.env.VITE_TEABLE_OKR_TABLE_ID

const AI_BASE  = (import.meta.env.VITE_AI_API_BASE  ?? '').replace(/\/$/, '')
const AI_KEY   = import.meta.env.VITE_AI_API_KEY  ?? ''
const AI_MODEL = import.meta.env.VITE_AI_MODEL    ?? 'claude-sonnet-4.6'

// ── 状态配色（纯色填充）──────────────────────────────────────────────────────────
const STATUS_CFG = {
  notstart: { label: '未开始', solid: '#DC2626', text: '#fff' },
  progress: { label: '进行中', solid: '#F59E0B', text: '#fff' },
  done:     { label: '已完成', solid: '#10B981', text: '#fff' },
  empty:    { label: '未填报', solid: 'rgba(100,116,139,0.12)', text: '#64748B' },
}

function StatusBadge({ status, size = 'sm' }) {
  const cfg = STATUS_CFG[status] ?? STATUS_CFG.empty
  const cls = size === 'xs'
    ? 'inline-flex items-center px-1.5 py-px rounded-md text-[9px] font-bold whitespace-nowrap'
    : 'inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold whitespace-nowrap'
  return (
    <span className={cls} style={{ background: cfg.solid, color: cfg.text }}>
      {cfg.label}
    </span>
  )
}

// ── 权限 hook ──────────────────────────────────────────────────────────────────
function useOKRAuth() {
  const { profile } = useAuth()
  const isAdmin   = profile?.role === 'admin'
  const myGroup   = profile?.okrGroup || ''
  const canAccess = isAdmin || !!myGroup
  return { isAdmin, myGroup, canAccess, profile }
}

// ── diff 计算 ──────────────────────────────────────────────────────────────────
function buildChangeDiff(oldData, newData, allKRs) {
  const changes = []
  for (const { kr } of allKRs) {
    const o = oldData[kr.id] || {}
    const n = newData[kr.id] || {}
    if ((o.status || '') !== (n.status || '')) {
      changes.push({
        krId: kr.id, krDesc: kr.desc, field: 'status',
        from: STATUS_CFG[o.status]?.label || '（未设置）',
        to:   STATUS_CFG[n.status]?.label || '（未设置）',
      })
    }
    if ((o.content || '') !== (n.content || '')) {
      changes.push({
        krId: kr.id, krDesc: kr.desc, field: 'content',
        from: o.content || '', to: n.content || '',
      })
    }
  }
  return changes
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
  const [allReports,     setAllReports]    = useState({})   // { periodId: { group: { krId: report } } }
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
        getOKRSetup(FY.annualKey),
        getOKRSetup(FY.quarterlyKey),
        getPeriods(),
        getAllPeriodsReports(),
      ])
      setAnnualOkr(a)
      setQuarterlyOkr(q)
      const sorted = [...p].sort((a, b) => b.start.localeCompare(a.start))
      setPeriods(sorted)
      setAllReports(allR)
      setSelectedPeriod(sorted[0]?.id || '')
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  async function refreshReports() {
    const allR = await getAllPeriodsReports()
    setAllReports(allR)
  }

  // ── 权限拦截 ──
  if (!canAccess) {
    return (
      <div className="flex items-center justify-center h-64 animate-page-in">
        <div className="text-center space-y-2">
          <AlertCircle className="w-10 h-10 mx-auto" style={{ color: 'var(--muted)' }} />
          <p className="font-medium" style={{ color: 'var(--text)' }}>暂无访问权限</p>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>仅管理员及采购经理可访问此模块</p>
        </div>
      </div>
    )
  }

  if (!OKR_TID) {
    return (
      <div className="max-w-md mx-auto mt-10 animate-page-in">
        <div className="card p-8 text-center space-y-4">
          <AlertCircle className="w-10 h-10 mx-auto" style={{ color: '#F59E0B' }} />
          <div>
            <h3 className="font-bold text-base mb-1" style={{ color: 'var(--text)' }}>尚未配置 OKR 数据表</h3>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              请在 GitHub Secrets 中配置
              <code className="mx-1 px-1.5 py-0.5 rounded text-xs font-mono"
                style={{ background: 'var(--surface2)', color: '#6366F1' }}>VITE_TEABLE_OKR_TABLE_ID</code>
              并重新部署。
            </p>
          </div>
        </div>
      </div>
    )
  }

  const TABS = [
    { key: 'overview',  label: '进度总览', icon: BarChart3,   show: true },
    { key: 'report',    label: '填写报告', icon: FileText,    show: !isAdmin && !!myGroup },
    { key: 'history',   label: '填写日志', icon: ScrollText,  show: true },
    { key: 'ai',        label: 'AI 报告',  icon: Bot,         show: true },
    { key: 'setup',     label: 'OKR 设置', icon: Settings,    show: isAdmin },
    { key: 'periods',   label: '周期管理', icon: Calendar,    show: isAdmin },
  ].filter(t => t.show)

  const reports = useMemo(() => allReports[selectedPeriod] || {}, [allReports, selectedPeriod])

  return (
    <div className="space-y-5 animate-page-in">
      {/* 页头 */}
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
              {myGroup} · 采购经理
            </span>
          )}
          <button onClick={init} disabled={loading}
            className="press flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium disabled:opacity-50"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)' }}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />刷新
          </button>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 p-1 rounded-2xl w-fit overflow-x-auto"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className="press flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-medium transition-all whitespace-nowrap"
            style={tab === t.key
              ? { background: ACCENT, color: '#fff' }
              : { color: 'var(--muted)' }}>
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
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
            <OverviewPanel
              annualOkr={annualOkr} quarterlyOkr={quarterlyOkr}
              periods={periods} allReports={allReports}
            />
          )}
          {tab === 'report' && (
            <ReportPanel
              annualOkr={annualOkr} quarterlyOkr={quarterlyOkr}
              periods={periods} allReports={allReports}
              selectedPeriod={selectedPeriod}
              onPeriodChange={pid => setSelectedPeriod(pid)}
              myGroup={myGroup} profile={profile}
              onSaved={refreshReports}
            />
          )}
          {tab === 'history' && (
            <HistoryPanel myGroup={myGroup} isAdmin={isAdmin} periods={periods} />
          )}
          {tab === 'ai' && (
            <AIReportPanel
              annualOkr={annualOkr} quarterlyOkr={quarterlyOkr}
              periods={periods} allReports={allReports}
            />
          )}
          {tab === 'setup' && (
            <SetupPanel profile={profile} onSaved={init} />
          )}
          {tab === 'periods' && (
            <PeriodsPanel
              periods={periods} setPeriods={setPeriods}
              profile={profile}
              onNewPeriod={async () => { const allR = await getAllPeriodsReports(); setAllReports(allR) }}
            />
          )}
        </>
      )}
    </div>
  )
}

// ── 进度总览（全量所有周期时间线） ────────────────────────────────────────────────
function OverviewPanel({ annualOkr, quarterlyOkr, periods, allReports }) {
  const [typeFilter,     setTypeFilter]     = useState('')
  const [expandedPeriods, setExpandedPeriods] = useState(() => new Set(periods.slice(0, 2).map(p => p.id)))
  const [expandedObjs,   setExpandedObjs]   = useState(new Set())

  function togglePeriod(id) {
    setExpandedPeriods(prev => {
      const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s
    })
  }
  function toggleObj(id) {
    setExpandedObjs(prev => {
      const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s
    })
  }

  const items = useMemo(() => {
    const r = []
    if (!typeFilter || typeFilter === 'annual')
      annualOkr.objectives.forEach((obj, oi) => r.push({ typeLabel: '年度', oi, obj }))
    if (!typeFilter || typeFilter === 'quarterly')
      quarterlyOkr.objectives.forEach((obj, oi) => r.push({ typeLabel: `${FY.qk} 季度`, oi, obj }))
    return r
  }, [annualOkr, quarterlyOkr, typeFilter])

  const hasAny = annualOkr.objectives.length > 0 || quarterlyOkr.objectives.length > 0

  if (!hasAny) {
    return (
      <div className="card p-14 text-center space-y-2">
        <p className="text-3xl">📋</p>
        <p className="font-semibold" style={{ color: 'var(--text)' }}>暂无 OKR 数据</p>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>管理员请先在「OKR 设置」中添加目标</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* 筛选栏 */}
      <div className="card p-3.5 flex items-center gap-4 flex-wrap">
        <span className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>OKR 类型</span>
        <div className="flex gap-1">
          {[['', '全部'], ['annual', '年度 OKR'], ['quarterly', '季度 OKR']].map(([v, l]) => (
            <button key={v} onClick={() => setTypeFilter(v)}
              className="press px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all"
              style={typeFilter === v
                ? { background: ACCENT, color: '#fff' }
                : { background: 'var(--surface2)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
              {l}
            </button>
          ))}
        </div>
        <span className="text-xs ml-auto" style={{ color: 'var(--muted)' }}>
          共 {periods.length} 个汇报周期
        </span>
      </div>

      {periods.length === 0 ? (
        <div className="card p-10 text-center space-y-1">
          <p className="text-2xl">📅</p>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>暂无汇报周期，管理员请在「周期管理」中创建</p>
        </div>
      ) : (
        periods.map((period, pi) => {
          const expanded = expandedPeriods.has(period.id)
          const periodReports = allReports[period.id] || {}
          // 统计该周期完成度
          let total = 0, done = 0
          items.forEach(({ obj }) => obj.krs.forEach(kr => {
            OKR_GROUPS.forEach(g => {
              total++
              if ((periodReports[g]?.[kr.id]?.status || 'empty') === 'done') done++
            })
          }))
          const pct = total > 0 ? Math.round(done / total * 100) : 0

          return (
            <div key={period.id} className="rounded-2xl overflow-hidden"
              style={{ border: '1px solid var(--border)' }}>
              {/* 周期头 */}
              <button className="w-full flex items-center gap-3 px-5 py-3.5 text-left press"
                style={{ background: pi === 0 ? 'rgba(37,99,235,0.03)' : 'var(--surface)' }}
                onClick={() => togglePeriod(period.id)}>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md shrink-0"
                  style={{ background: pi === 0 ? 'rgba(37,99,235,0.1)' : 'var(--surface2)',
                    color: pi === 0 ? ACCENT : 'var(--muted)',
                    border: `1px solid ${pi === 0 ? 'rgba(37,99,235,0.2)' : 'var(--border)'}` }}>
                  {pi === 0 ? '最新' : `第 ${periods.length - pi} 期`}
                </span>
                <span className="font-semibold text-[13px]" style={{ color: 'var(--text)' }}>{period.label}</span>
                <span className="text-[11px] font-mono" style={{ color: 'var(--muted)' }}>
                  {period.start} · {period.end}
                </span>
                <div className="flex items-center gap-2 ml-auto">
                  <div className="w-16 h-1.5 rounded-full overflow-hidden shrink-0" style={{ background: 'var(--border)' }}>
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: '#10B981' }} />
                  </div>
                  <span className="text-[11px] font-bold w-6 text-right shrink-0"
                    style={{ color: pct > 0 ? '#10B981' : 'var(--muted)' }}>{pct}%</span>
                  {expanded
                    ? <ChevronDown className="w-4 h-4 shrink-0" style={{ color: 'var(--muted)' }} />
                    : <ChevronRight className="w-4 h-4 shrink-0" style={{ color: 'var(--muted)' }} />}
                </div>
              </button>

              {/* 展开内容 */}
              {expanded && (
                <div style={{ borderTop: '1px solid var(--border)' }}>
                  {items.length === 0 ? (
                    <div className="px-5 py-8 text-center text-sm" style={{ color: 'var(--muted)' }}>
                      暂无 OKR 内容，请在「OKR 设置」中添加
                    </div>
                  ) : items.map(({ typeLabel, oi, obj }) => (
                    <ObjBlock key={`${period.id}-${obj.id}`}
                      obj={obj} oi={oi} typeLabel={typeLabel}
                      expanded={expandedObjs.has(`${period.id}-${obj.id}`)}
                      onToggle={() => toggleObj(`${period.id}-${obj.id}`)}
                      reports={periodReports}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}

function ObjBlock({ obj, oi, typeLabel, expanded, onToggle, reports }) {
  const stats = useMemo(() => {
    let done = 0, total = 0
    obj.krs.forEach(kr => {
      OKR_GROUPS.forEach(g => {
        total++
        if ((reports[g]?.[kr.id]?.status || 'empty') === 'done') done++
      })
    })
    return { done, total, pct: total > 0 ? Math.round(done / total * 100) : 0 }
  }, [obj, reports])

  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <button className="w-full flex items-center gap-3 px-5 py-3.5 text-left press transition-colors"
        style={{ background: 'var(--bg)' }} onClick={onToggle}>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md shrink-0"
          style={{ background: 'rgba(37,99,235,0.08)', color: ACCENT }}>
          {typeLabel} O{oi + 1}
        </span>
        <span className="flex-1 text-[13px] font-semibold" style={{ color: 'var(--text)' }}>
          {obj.objective}
        </span>
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
            <div className="h-full rounded-full transition-all"
              style={{ width: `${stats.pct}%`, background: 'linear-gradient(90deg,#2563EB,#10B981)' }} />
          </div>
          <span className="text-[11px] font-bold w-7 text-right"
            style={{ color: stats.pct > 0 ? '#059669' : 'var(--muted)' }}>{stats.pct}%</span>
          {expanded
            ? <ChevronDown className="w-4 h-4" style={{ color: 'var(--muted)' }} />
            : <ChevronRight className="w-4 h-4" style={{ color: 'var(--muted)' }} />}
        </div>
      </button>

      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          {obj.krs.length === 0 ? (
            <div className="px-5 py-4 text-sm text-center" style={{ color: 'var(--muted)' }}>暂无 KR</div>
          ) : obj.krs.map((kr, ki) => (
            <KRRow key={kr.id} kr={kr} ki={ki} reports={reports} />
          ))}
        </div>
      )}
    </div>
  )
}

function KRRow({ kr, ki, reports }) {
  const [openGroup, setOpenGroup] = useState(null)

  return (
    <div className="px-5 py-3.5 border-b last:border-b-0" style={{ borderColor: 'var(--border)' }}>
      <div className="flex items-start gap-2.5 mb-3">
        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold shrink-0 mt-0.5"
          style={{ background: 'rgba(245,158,11,0.15)', color: '#B45309' }}>
          {ki + 1}
        </span>
        <span className="text-[13px] flex-1 leading-relaxed" style={{ color: 'var(--text)' }}>{kr.desc}</span>
      </div>
      <div className="grid gap-2 ml-7" style={{ gridTemplateColumns: `repeat(${OKR_GROUPS.length}, 1fr)` }}>
        {OKR_GROUPS.map(g => {
          const rep    = reports[g]?.[kr.id]
          const status = rep?.status || 'empty'
          const key    = g + kr.id
          return (
            <div key={g}>
              <button className="w-full rounded-xl p-2 text-center transition-all press"
                style={{
                  background: openGroup === key ? 'rgba(37,99,235,0.04)' : 'var(--surface)',
                  border: `1px solid ${openGroup === key ? 'rgba(37,99,235,0.18)' : 'var(--border)'}`,
                }}
                onClick={() => setOpenGroup(openGroup === key ? null : key)}>
                <p className="text-[9px] font-semibold mb-1.5 truncate" style={{ color: 'var(--muted)' }}>{g}</p>
                <StatusBadge status={status} size="xs" />
              </button>
              {openGroup === key && (
                <div className="mt-1.5 px-2.5 py-2 rounded-xl text-[11px] leading-relaxed"
                  style={{ background: 'rgba(37,99,235,0.03)', color: 'var(--text)', border: '1px solid rgba(37,99,235,0.1)', minHeight: 32 }}>
                  {rep?.content || <span style={{ color: 'var(--muted)' }}>暂无进展描述</span>}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── 填写报告 ───────────────────────────────────────────────────────────────────
function ReportPanel({ annualOkr, quarterlyOkr, periods, allReports, selectedPeriod, onPeriodChange, myGroup, profile, onSaved }) {
  const [draft,  setDraft]  = useState({})
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)

  // 上期参考数据
  const prevPeriod = useMemo(() => {
    const idx = periods.findIndex(p => p.id === selectedPeriod)
    return idx >= 0 && idx < periods.length - 1 ? periods[idx + 1] : null
  }, [periods, selectedPeriod])

  const prevReport = useMemo(() =>
    prevPeriod ? (allReports[prevPeriod.id]?.[myGroup] || {}) : {}
  , [allReports, prevPeriod, myGroup])

  const currentSaved = useMemo(() =>
    allReports[selectedPeriod]?.[myGroup] || {}
  , [allReports, selectedPeriod, myGroup])

  useEffect(() => {
    setDraft(currentSaved)
  }, [selectedPeriod, myGroup, JSON.stringify(currentSaved)])

  const allKRs = useMemo(() => {
    const r = []
    annualOkr.objectives.forEach((obj, oi) => obj.krs.forEach(kr => r.push({ typeLabel: '年度', oi, obj, kr })))
    quarterlyOkr.objectives.forEach((obj, oi) => obj.krs.forEach(kr => r.push({ typeLabel: `${FY.qk} 季度`, oi, obj, kr })))
    return r
  }, [annualOkr, quarterlyOkr])

  function update(krId, field, value) {
    setDraft(prev => ({ ...prev, [krId]: { ...prev[krId], [field]: value } }))
  }

  async function handleSave() {
    if (!selectedPeriod) { alert('请先选择汇报周期'); return }
    setSaving(true)
    try {
      const oldData = currentSaved
      const changes = buildChangeDiff(oldData, draft, allKRs)
      await saveGroupReport(myGroup, selectedPeriod, draft, profile?.displayName || '')
      if (changes.length > 0) {
        const p = periods.find(x => x.id === selectedPeriod)
        await appendHistory(selectedPeriod, myGroup, {
          ts: new Date().toISOString(),
          user: profile?.displayName || '未知用户',
          periodId: selectedPeriod,
          periodLabel: p?.label || selectedPeriod,
          changes,
        })
      }
      await onSaved()
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
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
        <div className="flex items-center gap-2">
          {saved && (
            <span className="text-xs font-medium flex items-center gap-1" style={{ color: '#059669' }}>
              <Check className="w-3 h-3" />已保存
            </span>
          )}
          <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg"
            style={{ background: 'rgba(37,99,235,0.1)', color: ACCENT, border: '1px solid rgba(37,99,235,0.15)' }}>
            {myGroup}
          </span>
          <button onClick={handleSave} disabled={saving || !selectedPeriod}
            className="press flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-semibold text-white disabled:opacity-50"
            style={{ background: ACCENT }}>
            <Save className="w-3.5 h-3.5" />{saving ? '保存中…' : '保存报告'}
          </button>
        </div>
      </div>

      {/* 上期参考提示 */}
      {prevPeriod && selectedPeriod && (
        <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-[11px]"
          style={{ background: 'rgba(245,158,11,0.06)', color: '#92400E', border: '1px solid rgba(245,158,11,0.18)' }}>
          <Clock className="w-3.5 h-3.5 shrink-0" />
          参考上期（{prevPeriod.label}）数据已在下方显示，可对比填写本期进展
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
          <p className="text-sm" style={{ color: 'var(--muted)' }}>暂无 KR，请管理员先在「OKR 设置」中添加</p>
        </div>
      ) : (
        <div className="space-y-3">
          {allKRs.map(({ typeLabel, oi, obj, kr }, idx) => {
            const showHead = idx === 0 || allKRs[idx - 1].obj.id !== obj.id
            const d = draft[kr.id] || {}
            const prev = prevReport[kr.id] || {}
            return (
              <div key={kr.id}>
                {showHead && (
                  <div className="flex items-center gap-2 mt-2 mb-1.5">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md"
                      style={{ background: 'rgba(37,99,235,0.08)', color: ACCENT }}>{typeLabel} O{oi + 1}</span>
                    <span className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>{obj.objective}</span>
                  </div>
                )}
                <div className="card p-4 space-y-3.5">
                  <div className="flex items-start gap-2">
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold shrink-0 mt-0.5"
                      style={{ background: 'rgba(245,158,11,0.15)', color: '#B45309' }}>KR</span>
                    <span className="text-[13px] flex-1 leading-relaxed font-medium" style={{ color: 'var(--text)' }}>{kr.desc}</span>
                  </div>

                  {/* 上期参考 */}
                  {prevPeriod && (prev.status || prev.content) && (
                    <div className="ml-7 px-3 py-2 rounded-xl text-[11px]"
                      style={{ background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.12)' }}>
                      <span className="font-semibold mr-2" style={{ color: '#92400E' }}>上期：</span>
                      {prev.status && <StatusBadge status={prev.status} size="xs" />}
                      {prev.content && (
                        <span className="ml-1.5 leading-relaxed" style={{ color: 'var(--muted)' }}>{prev.content}</span>
                      )}
                    </div>
                  )}

                  <div className="flex items-center gap-3 ml-7">
                    <span className="text-xs font-medium shrink-0" style={{ color: 'var(--muted)' }}>完成状态</span>
                    <div className="flex gap-2">
                      {(['notstart', 'progress', 'done']).map(s => {
                        const cfg = STATUS_CFG[s]
                        const active = d.status === s
                        return (
                          <button key={s} onClick={() => update(kr.id, 'status', s)}
                            className="press px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all"
                            style={active
                              ? { background: cfg.solid, color: cfg.text, border: `1px solid ${cfg.solid}` }
                              : { background: 'var(--surface2)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
                            {cfg.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  <div className="ml-7">
                    <textarea value={d.content || ''} onChange={e => update(kr.id, 'content', e.target.value)}
                      className="field text-[13px]" rows={3} style={{ resize: 'vertical' }}
                      placeholder={`描述 ${myGroup} 本周期在此 KR 的工作进展、成果及遇到的问题…`} />
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

// ── 填写日志 ───────────────────────────────────────────────────────────────────
function HistoryPanel({ myGroup, isAdmin, periods }) {
  const [entries,     setEntries]     = useState([])
  const [loading,     setLoading]     = useState(false)
  const [filterGroup, setFilterGroup] = useState(isAdmin ? '' : myGroup)
  const [filterPeriod, setFilterPeriod] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getHistory({
        group:    filterGroup  || undefined,
        periodId: filterPeriod || undefined,
      })
      setEntries(data)
    } catch {}
    finally { setLoading(false) }
  }, [filterGroup, filterPeriod])

  useEffect(() => { load() }, [load])

  function fmtTs(ts) {
    if (!ts) return ''
    const d = new Date(ts)
    return `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
  }

  const FIELD_LABELS = { status: '完成状态', content: '进展描述' }

  return (
    <div className="space-y-4">
      {/* 筛选栏 */}
      <div className="card p-3.5 flex items-center gap-4 flex-wrap">
        {isAdmin && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium shrink-0" style={{ color: 'var(--muted)' }}>负责组</span>
            <select value={filterGroup} onChange={e => setFilterGroup(e.target.value)}
              className="field text-xs py-1.5 px-2" style={{ width: 'auto' }}>
              <option value="">全部</option>
              {OKR_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
        )}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium shrink-0" style={{ color: 'var(--muted)' }}>汇报周期</span>
          <select value={filterPeriod} onChange={e => setFilterPeriod(e.target.value)}
            className="field text-xs py-1.5 px-2" style={{ minWidth: 160 }}>
            <option value="">全部周期</option>
            {periods.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>
        <button onClick={load} className="press ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium"
          style={{ background: 'var(--surface2)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />刷新
        </button>
      </div>

      {loading ? (
        <div className="card p-12 flex items-center justify-center gap-3">
          <div className="w-5 h-5 rounded-full border-2 animate-spin"
            style={{ borderColor: 'rgba(37,99,235,0.15)', borderTopColor: ACCENT }} />
          <span className="text-sm" style={{ color: 'var(--muted)' }}>加载日志中…</span>
        </div>
      ) : entries.length === 0 ? (
        <div className="card p-14 text-center space-y-2">
          <p className="text-3xl">📜</p>
          <p className="font-semibold" style={{ color: 'var(--text)' }}>暂无填写记录</p>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>采购经理提交报告后，修改历史将在此记录</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {entries.map((entry, ei) => (
            <div key={ei} className="card p-4 space-y-3">
              {/* 条目头 */}
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: 'rgba(37,99,235,0.1)' }}>
                  <Clock className="w-3.5 h-3.5" style={{ color: ACCENT }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-[13px]" style={{ color: 'var(--text)' }}>{entry.user}</span>
                    <span className="text-[11px] px-2 py-0.5 rounded-md font-medium"
                      style={{ background: 'rgba(37,99,235,0.08)', color: ACCENT }}>{entry.periodLabel}</span>
                    {isAdmin && entry.periodId && (
                      <span className="text-[11px] px-2 py-0.5 rounded-md font-medium"
                        style={{ background: 'rgba(16,185,129,0.1)', color: '#059669' }}>
                        {OKR_GROUPS.find(g => entry.ts && entry.periodId) ? '' : ''}
                        {entry.group || ''}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--muted)' }}>{fmtTs(entry.ts)}</p>
                </div>
              </div>

              {/* 变更明细 */}
              {(entry.changes || []).length > 0 && (
                <div className="ml-10 space-y-1.5">
                  {entry.changes.map((c, ci) => (
                    <div key={ci} className="px-3 py-2 rounded-xl text-[11px]"
                      style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                      <p className="font-medium mb-0.5 truncate" style={{ color: 'var(--text)', maxWidth: '100%' }}>
                        {c.krDesc}
                        <span className="ml-1.5 font-normal text-[10px] px-1.5 py-0.5 rounded"
                          style={{ background: 'rgba(100,116,139,0.1)', color: 'var(--muted)' }}>
                          {FIELD_LABELS[c.field] ?? c.field}
                        </span>
                      </p>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {c.field === 'status' ? (
                          <>
                            <StatusBadge status={Object.entries(STATUS_CFG).find(([, v]) => v.label === c.from)?.[0] || 'empty'} size="xs" />
                            <span style={{ color: 'var(--muted)' }}>→</span>
                            <StatusBadge status={Object.entries(STATUS_CFG).find(([, v]) => v.label === c.to)?.[0] || 'empty'} size="xs" />
                          </>
                        ) : (
                          <span className="leading-relaxed" style={{ color: 'var(--muted)' }}>
                            {c.to ? `"${c.to.slice(0, 80)}${c.to.length > 80 ? '…' : ''}"` : '（已清空）'}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── AI 月报 / 年报 ──────────────────────────────────────────────────────────────
function AIReportPanel({ annualOkr, quarterlyOkr, periods, allReports }) {
  const [mode,          setMode]          = useState('monthly')
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [generating,    setGenerating]    = useState(false)
  const [report,        setReport]        = useState('')
  const [copied,        setCopied]        = useState(false)

  // 可选年份：当前 FY 及上一年
  const yearOpts = [`${FY.fy}`, `${FY.fy - 1}`]
  const [selectedYear, setSelectedYear] = useState(yearOpts[0])

  // 可选月份：从 periods 中提取
  const monthOpts = useMemo(() => {
    const set = new Set(periods.map(p => p.start.slice(0, 7)))
    return [...set].sort().reverse()
  }, [periods])

  const allKRs = useMemo(() => {
    const r = []
    annualOkr.objectives.forEach(obj => obj.krs.forEach(kr => r.push({ obj, kr })))
    quarterlyOkr.objectives.forEach(obj => obj.krs.forEach(kr => r.push({ obj, kr })))
    return r
  }, [annualOkr, quarterlyOkr])

  function buildOKRStructure() {
    let text = ''
    if (annualOkr.objectives.length > 0) {
      text += '【年度 OKR】\n'
      annualOkr.objectives.forEach((obj, oi) => {
        text += `O${oi+1}: ${obj.objective}\n`
        obj.krs.forEach((kr, ki) => { text += `  KR${ki+1}: ${kr.desc}\n` })
      })
    }
    if (quarterlyOkr.objectives.length > 0) {
      text += `\n【${FY.qk} 季度 OKR】\n`
      quarterlyOkr.objectives.forEach((obj, oi) => {
        text += `O${oi+1}: ${obj.objective}\n`
        obj.krs.forEach((kr, ki) => { text += `  KR${ki+1}: ${kr.desc}\n` })
      })
    }
    return text
  }

  function buildPeriodsData(targetPeriods) {
    let text = ''
    targetPeriods.forEach(period => {
      text += `\n--- ${period.label}（${period.start} 至 ${period.end}）---\n`
      const rpts = allReports[period.id] || {}
      OKR_GROUPS.forEach(g => {
        const rep = rpts[g]
        if (!rep || Object.keys(rep).length === 0) {
          text += `${g}：（本期未提交报告）\n`
          return
        }
        text += `${g}：\n`
        allKRs.forEach(({ kr }) => {
          const r = rep[kr.id]
          if (r?.status || r?.content) {
            const statusLabel = STATUS_CFG[r.status]?.label || '未知'
            text += `  · ${kr.desc}\n`
            text += `    状态：${statusLabel}，进展：${r.content || '（无描述）'}\n`
          }
        })
      })
    })
    return text
  }

  function buildPrompt() {
    const okrStruct = buildOKRStructure()
    if (mode === 'monthly') {
      const monthPeriods = periods.filter(p => p.start.startsWith(selectedMonth))
      if (monthPeriods.length === 0) return null
      const periodsData = buildPeriodsData(monthPeriods)
      return `你是采购运营组的工作助手，请根据以下数据生成 ${selectedMonth} 月的 OKR 执行月报总结。

## OKR 结构
${okrStruct}

## 各周期汇报数据
${periodsData}

请用简洁的 Markdown 格式输出月报，包含：
1. **总体进展评估**（总体完成率、整体趋势）
2. **各组亮点**（列举各组的主要成果）
3. **风险与挑战**（问题与待解决事项）
4. **下月工作重点**（建议方向）

语言简洁专业，总字数控制在 600 字以内。`
    } else {
      const yearPeriods = periods.filter(p => p.start.startsWith(selectedYear) || p.start.startsWith(`${parseInt(selectedYear)-1}`))
      if (yearPeriods.length === 0) return null
      const periodsData = buildPeriodsData(yearPeriods)
      return `你是采购运营组的工作助手，请根据以下数据生成 ${selectedYear} 年度 OKR 执行总结报告。

## OKR 结构
${okrStruct}

## 全年各周期汇报数据
${periodsData}

请用简洁的 Markdown 格式输出年度报告，包含：
1. **年度总体评估**（年度 OKR 整体完成情况）
2. **各目标达成情况**（逐一评估各 O/KR 完成度）
3. **各组综合表现**（各采购组全年表现亮点）
4. **主要成果与经验**（值得沉淀的成果和经验）
5. **改进建议**（明年重点改进方向）

语言正式专业，总字数控制在 1000 字以内。`
    }
  }

  async function handleGenerate() {
    const prompt = buildPrompt()
    if (!prompt) { alert('所选时间范围内暂无汇报数据'); return }
    if (!AI_BASE || !AI_KEY) { alert('AI 接口未配置，请检查环境变量'); return }
    setGenerating(true); setReport('')
    try {
      const res = await fetch(`${AI_BASE}/chat/completions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${AI_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: AI_MODEL,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 2000,
        }),
      })
      if (!res.ok) throw new Error(`AI 接口返回 ${res.status}`)
      const data = await res.json()
      setReport(data.choices?.[0]?.message?.content || '生成失败，请重试')
    } catch (e) { setReport(`生成失败：${e.message}`) }
    finally { setGenerating(false) }
  }

  function handleCopy() {
    navigator.clipboard.writeText(report).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="space-y-4">
      {/* 模式选择 + 参数 */}
      <div className="card p-4 space-y-4">
        <div className="flex items-center gap-2">
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
              <span className="text-xs font-medium" style={{ color: 'var(--muted)' }}>选择月份</span>
              {monthOpts.length > 0 ? (
                <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}
                  className="field text-xs py-1.5 px-2" style={{ width: 'auto' }}>
                  {monthOpts.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              ) : (
                <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}
                  className="field text-xs py-1.5 px-2" style={{ width: 'auto' }} />
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium" style={{ color: 'var(--muted)' }}>选择年份</span>
              <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)}
                className="field text-xs py-1.5 px-2" style={{ width: 'auto' }}>
                {yearOpts.map(y => <option key={y} value={y}>{y} 年</option>)}
              </select>
            </div>
          )}

          <button onClick={handleGenerate} disabled={generating}
            className="press flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-semibold text-white ml-auto disabled:opacity-50"
            style={{ background: ACCENT }}>
            <Bot className={`w-3.5 h-3.5 ${generating ? 'animate-pulse' : ''}`} />
            {generating ? 'AI 生成中…' : `生成 ${mode === 'monthly' ? '月报' : '年报'}`}
          </button>
        </div>

        <p className="text-[11px]" style={{ color: 'var(--muted)' }}>
          {mode === 'monthly'
            ? `将汇总 ${selectedMonth} 月内所有双周汇报数据，由 AI 生成月度总结`
            : `将汇总 ${selectedYear} 年度所有双周汇报数据，由 AI 生成年度总结报告`
          }
        </p>
      </div>

      {/* 生成结果 */}
      {generating && (
        <div className="card p-12 flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 animate-spin"
            style={{ borderColor: 'rgba(37,99,235,0.15)', borderTopColor: ACCENT }} />
          <p className="text-sm" style={{ color: 'var(--muted)' }}>AI 正在生成报告，请稍候…</p>
        </div>
      )}

      {report && !generating && (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5"
            style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4" style={{ color: ACCENT }} />
              <span className="font-semibold text-[13px]" style={{ color: 'var(--text)' }}>
                AI 生成{mode === 'monthly' ? `月报 · ${selectedMonth}` : `年报 · ${selectedYear} 年`}
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
            <div className="prose prose-sm max-w-none text-[13px] leading-relaxed whitespace-pre-wrap"
              style={{ color: 'var(--text)' }}>
              {report}
            </div>
          </div>
        </div>
      )}

      {!report && !generating && (
        <div className="card p-14 text-center space-y-3">
          <Bot className="w-10 h-10 mx-auto" style={{ color: 'var(--muted)' }} />
          <p className="font-semibold" style={{ color: 'var(--text)' }}>
            AI {mode === 'monthly' ? '月报' : '年报'}生成
          </p>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            选择时间范围后点击「生成」按钮，AI 将自动汇总 OKR 进展并生成报告
          </p>
        </div>
      )}
    </div>
  )
}

// ── OKR 设置（管理员） ─────────────────────────────────────────────────────────
function SetupPanel({ profile, onSaved }) {
  const [subTab,   setSubTab]   = useState('annual')
  const [qkSel,    setQkSel]    = useState(FY.qk)
  const [okrData,  setOkrData]  = useState({ objectives: [] })
  const [loading,  setLoading]  = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [objModal, setObjModal] = useState(null)
  const [krModal,  setKrModal]  = useState(null)

  const byUser     = profile?.displayName || ''
  const currentKey = subTab === 'annual' ? FY.annualKey : `quarterly-${qkSel}`

  const QK_OPTS = useMemo(() => {
    const fy = FY.fy
    return [`${fy}-Q1`, `${fy}-Q2`, `${fy}-Q3`, `${fy}-Q4`]
  }, [])

  useEffect(() => { loadData() }, [currentKey])

  async function loadData() {
    setLoading(true)
    try { setOkrData(await getOKRSetup(currentKey)) }
    finally { setLoading(false) }
  }

  async function saveObj(text, editId) {
    const next = { ...okrData }
    if (editId) {
      next.objectives = next.objectives.map(o => o.id === editId ? { ...o, objective: text } : o)
    } else {
      next.objectives = [...(next.objectives || []), { id: uid(), objective: text, krs: [] }]
    }
    setSaving(true)
    try { await saveOKRSetup(currentKey, next, byUser); setOkrData(next); setObjModal(null) }
    catch (e) { alert('保存失败：' + e.message) }
    finally { setSaving(false) }
  }

  async function delObj(objId) {
    if (!confirm('确认删除此目标及其所有 KR？')) return
    const next = { ...okrData, objectives: okrData.objectives.filter(o => o.id !== objId) }
    await saveOKRSetup(currentKey, next, byUser)
    setOkrData(next)
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
    catch (e) { alert('保存失败：' + e.message) }
    finally { setSaving(false) }
  }

  async function delKR(objId, krId) {
    if (!confirm('确认删除此 KR？')) return
    const next = {
      ...okrData,
      objectives: okrData.objectives.map(o =>
        o.id !== objId ? o : { ...o, krs: (o.krs || []).filter(k => k.id !== krId) }
      ),
    }
    await saveOKRSetup(currentKey, next, byUser)
    setOkrData(next)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1 p-1 rounded-xl"
          style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
          {[{ key: 'annual', label: '年度 OKR' }, { key: 'quarterly', label: '季度 OKR' }].map(t => (
            <button key={t.key} onClick={() => setSubTab(t.key)}
              className="press px-4 py-1.5 rounded-lg text-[13px] font-medium transition-all"
              style={subTab === t.key
                ? { background: 'var(--surface)', color: 'var(--text)', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }
                : { color: 'var(--muted)' }}>
              {t.label}
            </button>
          ))}
        </div>
        {subTab === 'quarterly' && (
          <select value={qkSel} onChange={e => setQkSel(e.target.value)}
            className="field text-xs py-1.5 px-2" style={{ width: 'auto' }}>
            {QK_OPTS.map(q => <option key={q} value={q}>{q}{q === FY.qk ? '（当前）' : ''}</option>)}
          </select>
        )}
        <button onClick={() => setObjModal({ editId: null, text: '' })}
          className="press flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[13px] font-semibold text-white ml-auto"
          style={{ background: ACCENT }}>
          <Plus className="w-3.5 h-3.5" />添加目标
        </button>
      </div>

      {loading ? (
        <div className="card p-12 flex items-center justify-center gap-3">
          <div className="w-5 h-5 rounded-full border-2 animate-spin"
            style={{ borderColor: 'rgba(37,99,235,0.15)', borderTopColor: ACCENT }} />
          <span className="text-sm" style={{ color: 'var(--muted)' }}>加载中…</span>
        </div>
      ) : okrData.objectives.length === 0 ? (
        <div className="card p-14 text-center space-y-2">
          <p className="text-3xl">🎯</p>
          <p className="font-semibold" style={{ color: 'var(--text)' }}>暂无目标</p>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>点击右上角「添加目标」开始设置 OKR</p>
        </div>
      ) : (
        <div className="space-y-3">
          {okrData.objectives.map((obj, oi) => (
            <div key={obj.id} className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-3 px-4 py-3.5" style={{ background: 'var(--surface)' }}>
                <span className="text-[10px] font-bold px-2.5 py-1 rounded-lg shrink-0"
                  style={{ background: 'rgba(37,99,235,0.1)', color: ACCENT }}>O{oi + 1}</span>
                <span className="flex-1 text-[13px] font-semibold" style={{ color: 'var(--text)' }}>{obj.objective}</span>
                <button onClick={() => setObjModal({ editId: obj.id, text: obj.objective })}
                  className="press p-1.5 rounded-lg" style={{ color: 'var(--muted)' }}>
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => delObj(obj.id)} className="press p-1.5 rounded-lg" style={{ color: '#E11D48' }}>
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div style={{ borderTop: '1px solid var(--border)' }}>
                {(obj.krs || []).map((kr, ki) => (
                  <div key={kr.id} className="flex items-start gap-3 px-4 py-3 border-b last:border-b-0"
                    style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold shrink-0 mt-0.5"
                      style={{ background: 'rgba(245,158,11,0.15)', color: '#B45309' }}>{ki + 1}</span>
                    <span className="flex-1 text-[12px] leading-relaxed" style={{ color: 'var(--text)' }}>{kr.desc}</span>
                    <button onClick={() => setKrModal({ objId: obj.id, editId: kr.id, text: kr.desc })}
                      className="press p-1.5 rounded-lg shrink-0" style={{ color: 'var(--muted)' }}>
                      <Edit2 className="w-3 h-3" />
                    </button>
                    <button onClick={() => delKR(obj.id, kr.id)} className="press p-1.5 rounded-lg shrink-0" style={{ color: '#E11D48' }}>
                      <Trash2 className="w-3 h-3" />
                    </button>
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

      {objModal && (
        <TextModal
          title={objModal.editId ? '编辑目标（Objective）' : '添加目标（Objective）'}
          placeholder="例：提升采购效率，降低综合采购成本…"
          defaultValue={objModal.text} rows={3} saving={saving}
          onSave={text => saveObj(text, objModal.editId)}
          onClose={() => setObjModal(null)}
        />
      )}
      {krModal && (
        <TextModal
          title={krModal.editId ? '编辑关键结果（KR）' : '添加关键结果（KR）'}
          placeholder="例：Q1 综合采购成本相比上年同期降低 5%，覆盖主要类别…"
          defaultValue={krModal.text} rows={4} saving={saving}
          onSave={text => saveKR(text, krModal.objId, krModal.editId)}
          onClose={() => setKrModal(null)}
        />
      )}
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
    const today = new Date()
    const fmt = d => d.toISOString().slice(0, 10)
    setStart(fmt(today))
    setEnd(fmt(new Date(today.getTime() + 13 * 86400000)))
    setLabel(''); setShowAdd(true)
  }

  async function handleAdd() {
    if (!start || !end || start > end) { alert('请正确填写起止日期'); return }
    const newP = { id: uid(), start, end, label: label.trim() || `${start} 至 ${end}` }
    const next = [newP, ...periods].sort((a, b) => b.start.localeCompare(a.start))
    setSaving(true)
    try {
      await savePeriods(next, byUser)
      setPeriods(next); await onNewPeriod()
      setShowAdd(false)
    } catch (e) { alert('保存失败：' + e.message) }
    finally { setSaving(false) }
  }

  async function handleDel(id) {
    if (!confirm('删除周期后该周期填报数据将不再关联，确认继续？')) return
    const next = periods.filter(p => p.id !== id)
    await savePeriods(next, byUser)
    setPeriods(next)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: 'var(--muted)' }}>管理双周汇报周期，填报时选择对应周期</p>
        <button onClick={openAdd}
          className="press flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[13px] font-semibold text-white"
          style={{ background: ACCENT }}>
          <Plus className="w-3.5 h-3.5" />新增周期
        </button>
      </div>

      <div className="card overflow-hidden">
        {periods.length === 0 ? (
          <div className="p-14 text-center space-y-2">
            <p className="text-3xl">📅</p>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>暂无周期，请点击「新增周期」添加</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>
                {['周期标签', '开始日期', '结束日期', '操作'].map((h, i) => (
                  <th key={h} className={`px-4 py-3 text-left text-[11px] font-semibold tracking-wide ${i === 3 ? 'text-right' : ''}`}
                    style={{ color: 'var(--muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {periods.map(p => (
                <tr key={p.id} className="border-b last:border-b-0 transition-colors"
                  style={{ borderColor: 'var(--border)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <td className="px-4 py-3.5 font-medium text-[13px]" style={{ color: 'var(--text)' }}>{p.label}</td>
                  <td className="px-4 py-3.5 text-xs font-mono" style={{ color: 'var(--muted)' }}>{p.start}</td>
                  <td className="px-4 py-3.5 text-xs font-mono" style={{ color: 'var(--muted)' }}>{p.end}</td>
                  <td className="px-4 py-3.5 text-right">
                    <button onClick={() => handleDel(p.id)}
                      className="press inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium"
                      style={{ background: 'rgba(244,63,94,0.07)', color: '#E11D48', border: '1px solid rgba(244,63,94,0.14)' }}>
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
        <ModalShell title="新增双周周期" onClose={() => setShowAdd(false)}>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text)', opacity: 0.65 }}>开始日期</label>
                <input type="date" value={start} onChange={e => setStart(e.target.value)} className="field" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text)', opacity: 0.65 }}>结束日期</label>
                <input type="date" value={end} onChange={e => setEnd(e.target.value)} className="field" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text)', opacity: 0.65 }}>周期标签（可选，空则自动生成）</label>
              <input type="text" value={label} onChange={e => setLabel(e.target.value)}
                className="field" placeholder="例：2026-04-01 双周汇报" />
            </div>
            <div className="flex gap-2.5 pt-1">
              <button onClick={() => setShowAdd(false)}
                className="press flex-1 py-2.5 text-sm font-semibold rounded-xl"
                style={{ background: 'var(--surface2)', color: 'var(--muted)' }}>取消</button>
              <button onClick={handleAdd} disabled={saving}
                className="press flex-1 py-2.5 text-sm font-semibold text-white rounded-xl disabled:opacity-50"
                style={{ background: ACCENT }}>
                {saving ? '添加中…' : '添加'}
              </button>
            </div>
          </div>
        </ModalShell>
      )}
    </div>
  )
}

// ── 通用文本编辑 Modal ─────────────────────────────────────────────────────────
function TextModal({ title, placeholder, defaultValue, rows, saving, onSave, onClose }) {
  const [text, setText] = useState(defaultValue || '')

  return (
    <ModalShell title={title} onClose={onClose}>
      <div className="p-5 space-y-4">
        <textarea rows={rows} value={text} onChange={e => setText(e.target.value)}
          className="field text-[13px]" style={{ resize: 'vertical' }} placeholder={placeholder} />
        <div className="flex gap-2.5">
          <button onClick={onClose}
            className="press flex-1 py-2.5 text-sm font-semibold rounded-xl"
            style={{ background: 'var(--surface2)', color: 'var(--muted)' }}>取消</button>
          <button onClick={() => { if (!text.trim()) { alert('内容不能为空'); return }; onSave(text.trim()) }}
            disabled={saving}
            className="press flex-1 py-2.5 text-sm font-semibold text-white rounded-xl disabled:opacity-50"
            style={{ background: ACCENT }}>
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

// ── Modal 容器 ─────────────────────────────────────────────────────────────────
function ModalShell({ title, onClose, children }) {
  return createPortal(
    <div className="fixed inset-0 z-[200] overflow-y-auto animate-fade-in"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}>
      <div className="flex min-h-full items-center justify-center p-4"
        onClick={e => e.stopPropagation()}>
        <div className="w-full max-w-md rounded-2xl shadow-2xl animate-scale-in"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between px-5 py-4"
            style={{ borderBottom: '1px solid var(--border)' }}>
            <h3 className="font-semibold text-[15px]" style={{ color: 'var(--text)' }}>{title}</h3>
            <button onClick={onClose}
              className="press w-7 h-7 flex items-center justify-center rounded-xl"
              style={{ background: 'var(--surface2)', color: 'var(--muted)' }}>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {children}
        </div>
      </div>
    </div>,
    document.body
  )
}
