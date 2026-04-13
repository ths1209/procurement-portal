import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import {
  ChevronDown, ChevronRight, Plus, Edit2, Trash2,
  Check, Calendar, BarChart3, Settings, RefreshCw, Save,
  AlertCircle, FileText, X,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import {
  ensureOKRFields, getOKRSetup, saveOKRSetup,
  getPeriods, savePeriods,
  getAllGroupReports, saveGroupReport,
  uid, OKR_GROUPS, getFiscalYear,
} from '../lib/teableOKR'

const FY     = getFiscalYear()
const ACCENT = '#2563EB'
const OKR_TID = import.meta.env.VITE_TEABLE_OKR_TABLE_ID

const STATUS_CFG = {
  notstart: { label: '未开始', bg: 'rgba(148,163,184,0.12)', color: '#64748B' },
  progress: { label: '进行中', bg: 'rgba(245,158,11,0.12)',  color: '#B45309' },
  done:     { label: '已完成', bg: 'rgba(16,185,129,0.12)',  color: '#059669' },
  empty:    { label: '未填报', bg: 'rgba(244,63,94,0.08)',   color: '#E11D48' },
}

function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] ?? STATUS_CFG.empty
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap"
      style={{ background: cfg.bg, color: cfg.color }}>
      {cfg.label}
    </span>
  )
}

// ─── 权限 ──────────────────────────────────────────────────────────────────────
function useOKRAuth() {
  const { profile } = useAuth()
  const isAdmin  = profile?.role === 'admin'
  const myGroup  = profile?.okrGroup || ''
  const canAccess = isAdmin || !!myGroup
  return { isAdmin, myGroup, canAccess, profile }
}

// ─── 主页面 ────────────────────────────────────────────────────────────────────
export default function OKRReport() {
  const { isAdmin, myGroup, canAccess, profile } = useOKRAuth()

  const [tab,            setTab]            = useState('overview')
  const [loading,        setLoading]        = useState(true)
  const [error,          setError]          = useState('')
  const [annualOkr,      setAnnualOkr]      = useState({ objectives: [] })
  const [quarterlyOkr,   setQuarterlyOkr]   = useState({ objectives: [] })
  const [periods,        setPeriods]        = useState([])
  const [reports,        setReports]        = useState({})
  const [selectedPeriod, setSelectedPeriod] = useState('')

  useEffect(() => {
    if (!canAccess || !OKR_TID) { setLoading(false); return }
    init()
  }, [canAccess])

  async function init() {
    setLoading(true); setError('')
    try {
      await ensureOKRFields()
      const [a, q, p] = await Promise.all([
        getOKRSetup(FY.annualKey),
        getOKRSetup(FY.quarterlyKey),
        getPeriods(),
      ])
      setAnnualOkr(a)
      setQuarterlyOkr(q)
      const sorted = [...p].sort((a, b) => b.start.localeCompare(a.start))
      setPeriods(sorted)
      const latestId = sorted[0]?.id || ''
      setSelectedPeriod(latestId)
      if (latestId) setReports(await getAllGroupReports(latestId))
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  async function changePeriod(pid) {
    setSelectedPeriod(pid)
    if (!pid) { setReports({}); return }
    setReports(await getAllGroupReports(pid))
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
              请在 Teable 中创建新表，获取表 ID 后在 GitHub Secrets 中配置
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
    { key: 'overview', label: '进度总览', icon: BarChart3,  show: true },
    { key: 'report',   label: '填写报告', icon: FileText,   show: !isAdmin && !!myGroup },
    { key: 'setup',    label: 'OKR 设置', icon: Settings,   show: isAdmin },
    { key: 'periods',  label: '周期管理', icon: Calendar,   show: isAdmin },
  ].filter(t => t.show)

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
      <div className="flex gap-1 p-1 rounded-2xl w-fit"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className="press flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-medium transition-all"
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
              periods={periods} reports={reports}
              selectedPeriod={selectedPeriod} onPeriodChange={changePeriod}
            />
          )}
          {tab === 'report' && (
            <ReportPanel
              annualOkr={annualOkr} quarterlyOkr={quarterlyOkr}
              periods={periods} reports={reports}
              selectedPeriod={selectedPeriod} onPeriodChange={changePeriod}
              myGroup={myGroup} profile={profile}
              onSaved={async () => setReports(await getAllGroupReports(selectedPeriod))}
            />
          )}
          {tab === 'setup' && (
            <SetupPanel profile={profile} onSaved={init} />
          )}
          {tab === 'periods' && (
            <PeriodsPanel
              periods={periods} setPeriods={setPeriods}
              profile={profile}
              onNewPeriod={async (newPeriods) => {
                if (newPeriods.length > 0 && !selectedPeriod) {
                  const pid = newPeriods[0].id
                  setSelectedPeriod(pid)
                  setReports(await getAllGroupReports(pid))
                }
              }}
            />
          )}
        </>
      )}
    </div>
  )
}

// ─── 进度总览 ──────────────────────────────────────────────────────────────────
function OverviewPanel({ annualOkr, quarterlyOkr, periods, reports, selectedPeriod, onPeriodChange }) {
  const [typeFilter,    setTypeFilter]    = useState('')
  const [expandedObjs,  setExpandedObjs]  = useState(new Set())

  function toggleObj(id) {
    setExpandedObjs(prev => {
      const s = new Set(prev)
      s.has(id) ? s.delete(id) : s.add(id)
      return s
    })
  }

  const items = useMemo(() => {
    const r = []
    if (!typeFilter || typeFilter === 'annual') {
      annualOkr.objectives.forEach((obj, oi) => r.push({ typeLabel: '年度', oi, obj }))
    }
    if (!typeFilter || typeFilter === 'quarterly') {
      quarterlyOkr.objectives.forEach((obj, oi) => r.push({ typeLabel: `${FY.qk} 季度`, oi, obj }))
    }
    return r
  }, [annualOkr, quarterlyOkr, typeFilter])

  const currentPeriod = periods.find(p => p.id === selectedPeriod)

  if (!annualOkr.objectives.length && !quarterlyOkr.objectives.length) {
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
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium shrink-0" style={{ color: 'var(--muted)' }}>汇报周期</span>
          <select value={selectedPeriod} onChange={e => onPeriodChange(e.target.value)}
            className="field text-xs py-1.5 px-2" style={{ minWidth: 160 }}>
            <option value="">全部周期</option>
            {periods.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium shrink-0" style={{ color: 'var(--muted)' }}>OKR 类型</span>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
            className="field text-xs py-1.5 px-2" style={{ width: 'auto' }}>
            <option value="">全部</option>
            <option value="annual">年度 OKR</option>
            <option value="quarterly">季度 OKR</option>
          </select>
        </div>
        {currentPeriod && (
          <span className="text-xs px-2.5 py-1 rounded-lg ml-auto"
            style={{ background: 'rgba(37,99,235,0.07)', color: ACCENT }}>
            {currentPeriod.start} 至 {currentPeriod.end}
          </span>
        )}
      </div>

      {items.map(({ typeLabel, oi, obj }) => (
        <ObjBlock key={obj.id}
          obj={obj} oi={oi} typeLabel={typeLabel}
          expanded={expandedObjs.has(obj.id)}
          onToggle={() => toggleObj(obj.id)}
          reports={reports}
        />
      ))}
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
    <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
      <button className="w-full flex items-center gap-3 px-5 py-4 text-left press transition-colors"
        style={{ background: 'var(--surface)' }} onClick={onToggle}>
        <span className="text-[10px] font-bold px-2.5 py-1 rounded-lg shrink-0"
          style={{ background: 'rgba(37,99,235,0.1)', color: ACCENT }}>
          {typeLabel} O{oi + 1}
        </span>
        <span className="flex-1 text-[13px] font-semibold" style={{ color: 'var(--text)' }}>
          {obj.objective}
        </span>
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-20 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
              <div className="h-full rounded-full transition-all duration-500"
                style={{ width: `${stats.pct}%`, background: 'linear-gradient(90deg,#2563EB,#10B981)' }} />
            </div>
            <span className="text-[11px] font-bold w-7 text-right"
              style={{ color: stats.pct > 0 ? '#059669' : 'var(--muted)' }}>{stats.pct}%</span>
          </div>
          {expanded
            ? <ChevronDown className="w-4 h-4" style={{ color: 'var(--muted)' }} />
            : <ChevronRight className="w-4 h-4" style={{ color: 'var(--muted)' }} />}
        </div>
      </button>

      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          {obj.krs.length === 0 ? (
            <div className="px-5 py-5 text-sm text-center" style={{ color: 'var(--muted)' }}>暂无 KR</div>
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
    <div className="px-5 py-4 border-b last:border-b-0" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
      <div className="flex items-start gap-2.5 mb-3">
        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold shrink-0 mt-0.5"
          style={{ background: 'rgba(245,158,11,0.15)', color: '#B45309' }}>
          {ki + 1}
        </span>
        <span className="text-[13px] flex-1 leading-relaxed" style={{ color: 'var(--text)' }}>{kr.desc}</span>
      </div>
      <div className="grid grid-cols-5 gap-2 ml-7">
        {OKR_GROUPS.map(g => {
          const rep    = reports[g]?.[kr.id]
          const status = rep?.status || 'empty'
          const key    = g + kr.id
          return (
            <div key={g}>
              <button className="w-full rounded-xl p-2 text-center transition-all press"
                style={{
                  background: openGroup === key ? 'rgba(37,99,235,0.05)' : 'var(--surface)',
                  border: `1px solid ${openGroup === key ? 'rgba(37,99,235,0.2)' : 'var(--border)'}`,
                }}
                onClick={() => setOpenGroup(openGroup === key ? null : key)}>
                <p className="text-[10px] font-medium mb-1.5" style={{ color: 'var(--muted)' }}>{g}</p>
                <StatusBadge status={status} />
              </button>
              {openGroup === key && rep?.content && (
                <div className="mt-1.5 px-2.5 py-2 rounded-xl text-[11px] leading-relaxed"
                  style={{ background: 'rgba(37,99,235,0.04)', color: 'var(--text)', border: '1px solid rgba(37,99,235,0.1)' }}>
                  {rep.content}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── 填写报告 ──────────────────────────────────────────────────────────────────
function ReportPanel({ annualOkr, quarterlyOkr, periods, reports, selectedPeriod, onPeriodChange, myGroup, profile, onSaved }) {
  const [draft,  setDraft]  = useState({})
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)

  useEffect(() => {
    setDraft(reports[myGroup] || {})
  }, [reports, myGroup, selectedPeriod])

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
      await saveGroupReport(myGroup, selectedPeriod, draft, profile?.displayName || '')
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
          {saved && <span className="text-xs font-medium" style={{ color: '#059669' }}><Check className="w-3 h-3 inline mr-0.5" />已保存</span>}
          <span className="text-[11px] font-semibold px-2.5 py-1 rounded-lg"
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
            return (
              <div key={kr.id}>
                {showHead && (
                  <div className="flex items-center gap-2 mt-2 mb-1.5">
                    <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-lg"
                      style={{ background: 'rgba(37,99,235,0.1)', color: ACCENT }}>{typeLabel} O{oi + 1}</span>
                    <span className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>{obj.objective}</span>
                  </div>
                )}
                <div className="card p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold shrink-0 mt-0.5"
                      style={{ background: 'rgba(245,158,11,0.15)', color: '#B45309' }}>KR</span>
                    <span className="text-[13px] flex-1 leading-relaxed" style={{ color: 'var(--text)' }}>{kr.desc}</span>
                  </div>
                  <div className="flex items-center gap-3 ml-7">
                    <span className="text-xs font-medium shrink-0" style={{ color: 'var(--muted)' }}>完成状态</span>
                    <div className="flex gap-2">
                      {(['notstart', 'progress', 'done'] ).map(s => {
                        const cfg = STATUS_CFG[s]
                        return (
                          <button key={s} onClick={() => update(kr.id, 'status', s)}
                            className="press px-3 py-1.5 rounded-xl text-[11px] font-semibold transition-all"
                            style={d.status === s
                              ? { background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}40` }
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

// ─── OKR 设置（管理员） ────────────────────────────────────────────────────────
function SetupPanel({ profile, onSaved }) {
  const [subTab,   setSubTab]   = useState('annual')
  const [qkSel,    setQkSel]    = useState(FY.qk)
  const [okrData,  setOkrData]  = useState({ objectives: [] })
  const [loading,  setLoading]  = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [objModal, setObjModal] = useState(null)
  const [krModal,  setKrModal]  = useState(null)

  const byUser    = profile?.displayName || ''
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
      {/* Sub-tabs + 添加按钮 */}
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
        <button
          onClick={() => setObjModal({ editId: null, text: '' })}
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
              {/* Objective head */}
              <div className="flex items-center gap-3 px-4 py-3.5" style={{ background: 'var(--surface)' }}>
                <span className="text-[10px] font-bold px-2.5 py-1 rounded-lg shrink-0"
                  style={{ background: 'rgba(37,99,235,0.1)', color: ACCENT }}>O{oi + 1}</span>
                <span className="flex-1 text-[13px] font-semibold" style={{ color: 'var(--text)' }}>{obj.objective}</span>
                <button onClick={() => setObjModal({ editId: obj.id, text: obj.objective })}
                  className="press p-1.5 rounded-lg" style={{ color: 'var(--muted)' }}>
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => { if (confirm(`确认删除目标 O${oi+1} 及其所有 KR？`)) delObj(obj.id) }}
                  className="press p-1.5 rounded-lg" style={{ color: '#E11D48' }}>
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              {/* KR list */}
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
                    <button onClick={() => { if (confirm('确认删除此 KR？')) delKR(obj.id, kr.id) }}
                      className="press p-1.5 rounded-lg shrink-0" style={{ color: '#E11D48' }}>
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

// ─── 周期管理（管理员） ────────────────────────────────────────────────────────
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
      setPeriods(next); await onNewPeriod(next)
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
            <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {periods.map(p => (
                <tr key={p.id} className="transition-colors"
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

// ─── 通用文本编辑 Modal ────────────────────────────────────────────────────────
function TextModal({ title, placeholder, defaultValue, rows, saving, onSave, onClose }) {
  const [text, setText] = useState(defaultValue || '')

  async function handleSave() {
    if (!text.trim()) { alert('内容不能为空'); return }
    await onSave(text.trim())
  }

  return (
    <ModalShell title={title} onClose={onClose}>
      <div className="p-5 space-y-4">
        <textarea rows={rows} value={text} onChange={e => setText(e.target.value)}
          className="field text-[13px]" style={{ resize: 'vertical' }} placeholder={placeholder} />
        <div className="flex gap-2.5">
          <button onClick={onClose}
            className="press flex-1 py-2.5 text-sm font-semibold rounded-xl"
            style={{ background: 'var(--surface2)', color: 'var(--muted)' }}>取消</button>
          <button onClick={handleSave} disabled={saving}
            className="press flex-1 py-2.5 text-sm font-semibold text-white rounded-xl disabled:opacity-50"
            style={{ background: ACCENT }}>
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

// ─── Modal 容器 ────────────────────────────────────────────────────────────────
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
