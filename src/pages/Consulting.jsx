import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { RefreshCw, Plus, Search, X, Pencil, Trash2, BookOpen, TrendingUp, Users } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import {
  listConsulting, createRecord, updateRecord, deleteRecord,
  isConfigured, C, TYPE_OPTS, LANDED_OPTS, TYPE_CFG,
} from '../lib/teableConsulting'

const EMPTY_FORM = {
  [C.type]: '培训赋能', [C.date]: '', [C.title]: '', [C.beneficiary]: '',
  [C.headcount]: '', [C.trainer]: '', [C.toolName]: '', [C.usageRate]: '',
  [C.direction]: '', [C.outcome]: '', [C.landed]: '', [C.remark]: '',
}

/* ── 通用输入组件 ── */
function LRow({ label, children }) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-xs" style={{ color: 'var(--muted)' }}>{label}</label>
      {children}
    </div>
  )
}

function Input({ value, onChange, ...rest }) {
  return (
    <input value={value ?? ''} onChange={e => onChange(e.target.value)}
      className="w-full px-3 py-1.5 rounded-lg text-sm outline-none"
      style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}
      {...rest} />
  )
}

function Sel({ value, onChange, options, placeholder }) {
  return (
    <select value={value ?? ''} onChange={e => onChange(e.target.value)}
      className="w-full px-3 py-1.5 rounded-lg text-sm outline-none"
      style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}

function Textarea({ value, onChange, rows = 3 }) {
  return (
    <textarea value={value ?? ''} onChange={e => onChange(e.target.value)} rows={rows}
      className="w-full px-3 py-1.5 rounded-lg text-sm outline-none resize-none"
      style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
  )
}

function TypeBadge({ type }) {
  const cfg = TYPE_CFG[type] ?? { color: '#6B7280', bg: 'rgba(107,114,128,0.1)' }
  return (
    <span className="px-2 py-0.5 rounded text-xs font-medium"
      style={{ color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.color}30` }}>
      {type}
    </span>
  )
}

/* ── 新建/编辑弹窗 ── */
function EditModal({ row, onClose, onSave }) {
  const [form, setForm] = useState(row ? {
    [C.type]: row.type, [C.date]: row.date, [C.title]: row.title,
    [C.beneficiary]: row.beneficiary, [C.headcount]: row.headcount,
    [C.trainer]: row.trainer, [C.toolName]: row.toolName, [C.usageRate]: row.usageRate,
    [C.direction]: row.direction, [C.outcome]: row.outcome,
    [C.landed]: row.landed, [C.remark]: row.remark,
  } : { ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  function set(key, val) { setForm(f => ({ ...f, [key]: val })) }
  const type = form[C.type]

  async function handleSave() {
    if (!form[C.title]) { setErr('主题/名称不能为空'); return }
    setSaving(true); setErr('')
    try { await onSave(form) } catch (e) { setErr(e.message); setSaving(false) }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)' }}>
      <div className="w-full max-w-xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh]"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <span className="font-semibold text-sm" style={{ color: 'var(--text)' }}>
            {row ? '编辑赋能记录' : '新建赋能记录'}
          </span>
          <button onClick={onClose} className="p-1 rounded hover:opacity-70">
            <X className="w-4 h-4" style={{ color: 'var(--muted)' }} />
          </button>
        </div>
        <div className="p-5 overflow-y-auto flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <LRow label="赋能类型">
              <Sel value={form[C.type]} onChange={v => set(C.type, v)} options={TYPE_OPTS} />
            </LRow>
            <LRow label="日期"><Input value={form[C.date]} onChange={v => set(C.date, v)} type="date" /></LRow>
            <LRow label="主题/名称 *">
              <Input value={form[C.title]} onChange={v => set(C.title, v)}
                placeholder={type === '培训赋能' ? '培训主题' : type === '工具赋能' ? '工具名称' : type === '咨询赋能' ? '咨询主题' : '项目名称'} />
            </LRow>
            <LRow label="受益组织">
              <Input value={form[C.beneficiary]} onChange={v => set(C.beneficiary, v)} placeholder="如：运营分析组" />
            </LRow>

            {/* 类型特定字段 */}
            {type === '培训赋能' && <>
              <LRow label="讲师"><Input value={form[C.trainer]} onChange={v => set(C.trainer, v)} /></LRow>
              <LRow label="参与人数"><Input value={form[C.headcount]} onChange={v => set(C.headcount, v)} type="number" /></LRow>
            </>}
            {type === '工具赋能' && <>
              <LRow label="工具名称"><Input value={form[C.toolName]} onChange={v => set(C.toolName, v)} /></LRow>
              <LRow label="使用率 (%)"><Input value={form[C.usageRate]} onChange={v => set(C.usageRate, v)} type="number" placeholder="0-100" /></LRow>
            </>}
            {type === '咨询赋能' && (
              <LRow label="咨询方向"><Input value={form[C.direction]} onChange={v => set(C.direction, v)} /></LRow>
            )}

            <LRow label="落地情况">
              <Sel value={form[C.landed]} onChange={v => set(C.landed, v)} options={LANDED_OPTS} placeholder="请选择" />
            </LRow>
          </div>
          <LRow label="效果/结论"><Textarea value={form[C.outcome]} onChange={v => set(C.outcome, v)} /></LRow>
          <LRow label="备注"><Input value={form[C.remark]} onChange={v => set(C.remark, v)} /></LRow>
          {err && <p className="text-xs text-red-400">{err}</p>}
        </div>
        <div className="px-5 py-4 flex justify-end gap-2" style={{ borderTop: '1px solid var(--border)' }}>
          <button onClick={onClose} className="px-4 py-1.5 rounded-lg text-sm" style={{ color: 'var(--muted)' }}>取消</button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-1.5 rounded-lg text-sm font-medium text-white"
            style={{ background: '#6366F1', opacity: saving ? 0.6 : 1 }}>
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/* ── 可视化：统计卡片 ── */
function StatCards({ rows }) {
  return (
    <div className="grid grid-cols-4 gap-3">
      {TYPE_OPTS.map(type => {
        const cfg = TYPE_CFG[type]
        const count = rows.filter(r => r.type === type).length
        return (
          <div key={type} className="rounded-xl p-4 flex flex-col gap-2"
            style={{ background: 'var(--surface)', border: `1px solid ${cfg.color}30` }}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium" style={{ color: cfg.color }}>{type}</span>
              <span className="text-2xl font-bold" style={{ color: cfg.color }}>{count}</span>
            </div>
            <div className="h-1 rounded-full" style={{ background: 'var(--surface2)' }}>
              <div className="h-1 rounded-full transition-all"
                style={{ width: rows.length ? `${(count / rows.length) * 100}%` : '0%', background: cfg.color }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ── 可视化：月度趋势 ── */
function MonthlyTrend({ rows }) {
  const months = useMemo(() => {
    const map = {}
    rows.forEach(r => {
      const m = r.date?.slice(0, 7)
      if (!m) return
      map[m] = (map[m] ?? 0) + 1
    })
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).slice(-6)
  }, [rows])

  if (months.length === 0) return null
  const max = Math.max(...months.map(([, v]) => v), 1)

  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="w-4 h-4" style={{ color: '#6366F1' }} strokeWidth={1.75} />
        <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>月度趋势</span>
      </div>
      <div className="flex items-end gap-2 h-16">
        {months.map(([m, v]) => (
          <div key={m} className="flex-1 flex flex-col items-center gap-1">
            <span className="text-xs font-medium" style={{ color: 'var(--text)' }}>{v}</span>
            <div className="w-full rounded-t transition-all"
              style={{ height: `${(v / max) * 48}px`, background: '#6366F1', minHeight: 4, opacity: 0.8 }} />
            <span className="text-[10px]" style={{ color: 'var(--muted)' }}>{m.slice(5)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── 可视化：受益组织分布 ── */
function OrgDistribution({ rows }) {
  const orgs = useMemo(() => {
    const map = {}
    rows.forEach(r => {
      const o = r.beneficiary || '未填写'
      map[o] = (map[o] ?? 0) + 1
    })
    return Object.entries(map).sort(([, a], [, b]) => b - a).slice(0, 6)
  }, [rows])

  if (orgs.length === 0) return null
  const max = orgs[0]?.[1] ?? 1

  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-2 mb-4">
        <Users className="w-4 h-4" style={{ color: '#0EA5E9' }} strokeWidth={1.75} />
        <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>受益组织</span>
      </div>
      <div className="flex flex-col gap-2.5">
        {orgs.map(([org, count]) => (
          <div key={org} className="flex items-center gap-3">
            <span className="text-xs w-24 truncate shrink-0" style={{ color: 'var(--muted)' }}>{org}</span>
            <div className="flex-1 h-1.5 rounded-full" style={{ background: 'var(--surface2)' }}>
              <div className="h-1.5 rounded-full transition-all"
                style={{ width: `${(count / max) * 100}%`, background: '#0EA5E9' }} />
            </div>
            <span className="text-xs w-4 text-right shrink-0" style={{ color: 'var(--text)' }}>{count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── 主页面 ── */
export default function Consulting() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const configured = isConfigured()

  const [rows, setRows]     = useState([])
  const [loading, setLoad]  = useState(false)
  const [err, setErr]       = useState('')
  const [search, setSearch] = useState('')
  const [typeFilter, setType] = useState('全部')
  const [editRow, setEdit]  = useState(null)  // null=关, false=新建, row=编辑

  async function load() {
    setLoad(true); setErr('')
    try { setRows(await listConsulting()) } catch (e) { setErr(e.message) } finally { setLoad(false) }
  }
  useEffect(() => { load() }, [])

  const shown = useMemo(() => {
    let r = rows
    if (typeFilter !== '全部') r = r.filter(x => x.type === typeFilter)
    if (search) {
      const q = search.toLowerCase()
      r = r.filter(x =>
        x.title.toLowerCase().includes(q) ||
        x.beneficiary.toLowerCase().includes(q) ||
        x.outcome.toLowerCase().includes(q)
      )
    }
    return r
  }, [rows, typeFilter, search])

  async function handleSave(form) {
    if (editRow && editRow._id) {
      await updateRecord(editRow._id, form)
    } else {
      await createRecord(form, profile?.displayName ?? profile?.email ?? '')
    }
    setEdit(null)
    await load()
  }

  async function handleDelete(row) {
    if (!confirm(`确认删除赋能记录"${row.title}"？`)) return
    try { await deleteRecord(row._id); await load() } catch (e) { alert(e.message) }
  }

  return (
    <div className="p-5 max-w-6xl mx-auto space-y-5">
      {/* 页头 */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <BookOpen className="w-5 h-5" style={{ color: '#8B5CF6' }} strokeWidth={1.75} />
            <h1 className="font-semibold text-lg" style={{ color: 'var(--text)' }}>咨询赋能台账</h1>
          </div>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            赋能数据登记与多维度可视化
            {!configured && <span className="ml-2 text-amber-400">（未配置数据表，请联系管理员）</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={loading}
            className="p-2 rounded-lg transition-opacity hover:opacity-70"
            style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
            <RefreshCw className="w-4 h-4" style={{ color: 'var(--muted)', animation: loading ? 'spin 1s linear infinite' : '' }} strokeWidth={1.75} />
          </button>
          <button onClick={() => setEdit(false)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white"
            style={{ background: '#8B5CF6' }}>
            <Plus className="w-4 h-4" strokeWidth={2} />登记
          </button>
        </div>
      </div>

      {/* 统计卡片 */}
      <StatCards rows={rows} />

      {/* 可视化图表 */}
      {rows.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <MonthlyTrend rows={rows} />
          <OrgDistribution rows={rows} />
        </div>
      )}

      {/* 筛选 + 搜索 */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1.5 flex-wrap">
          {['全部', ...TYPE_OPTS].map(t => (
            <button key={t} onClick={() => setType(t)}
              className="px-3 py-1 rounded-full text-xs transition-all"
              style={typeFilter === t
                ? { background: '#8B5CF6', color: '#fff' }
                : { background: 'var(--surface2)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
              {t}
            </button>
          ))}
        </div>
        <div className="flex-1 min-w-48 relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="搜索主题、受益方、结论"
            className="w-full pl-8 pr-3 py-1.5 rounded-lg text-sm outline-none"
            style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
        </div>
      </div>

      {/* 记录列表 */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        <div className="grid text-xs px-4 py-2.5"
          style={{ gridTemplateColumns: '7rem 1fr 7rem 5rem 6rem 5rem 5rem', background: 'var(--surface2)', color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
          <span>类型</span>
          <span>主题/名称</span>
          <span>受益组织</span>
          <span>日期</span>
          <span>效果/结论</span>
          <span>落地情况</span>
          <span className="text-center">操作</span>
        </div>

        {loading && (
          <div className="flex justify-center py-10">
            <div className="w-6 h-6 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
          </div>
        )}
        {!loading && err && (
          <div className="text-center py-10 text-sm text-red-400">{err}</div>
        )}
        {!loading && !err && shown.length === 0 && (
          <div className="text-center py-12 flex flex-col items-center gap-2">
            <BookOpen className="w-8 h-8" style={{ color: 'var(--muted)' }} strokeWidth={1.25} />
            <p className="text-sm" style={{ color: 'var(--muted)' }}>暂无赋能记录</p>
          </div>
        )}
        {!loading && shown.map((row, i) => {
          const landedCfg = {
            '已落地': { color: '#10B981' }, '推进中': { color: '#F59E0B' }, '未落地': { color: '#6B7280' }
          }
          return (
            <div key={row._id} className="grid items-center px-4 py-3 text-sm transition-colors hover:bg-white/[0.02]"
              style={{ gridTemplateColumns: '7rem 1fr 7rem 5rem 6rem 5rem 5rem', borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
              <span><TypeBadge type={row.type} /></span>
              <span className="font-medium truncate pr-2" style={{ color: 'var(--text)' }}>{row.title}</span>
              <span className="text-xs truncate" style={{ color: 'var(--muted)' }}>{row.beneficiary || '—'}</span>
              <span className="text-xs" style={{ color: 'var(--muted)' }}>{row.date || '—'}</span>
              <span className="text-xs truncate pr-2" style={{ color: 'var(--muted)' }}>{row.outcome || '—'}</span>
              <span className="text-xs" style={{ color: landedCfg[row.landed]?.color ?? 'var(--muted)' }}>
                {row.landed || '—'}
              </span>
              <div className="flex items-center justify-center gap-2">
                <button onClick={() => setEdit(row)} className="hover:opacity-70 transition-opacity">
                  <Pencil className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} strokeWidth={1.75} />
                </button>
                {isAdmin && (
                  <button onClick={() => handleDelete(row)} className="hover:opacity-70 transition-opacity">
                    <Trash2 className="w-3.5 h-3.5 text-red-400/70" strokeWidth={1.75} />
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* 弹窗 */}
      {editRow !== null && (
        <EditModal row={editRow || null} onClose={() => setEdit(null)} onSave={handleSave} />
      )}
    </div>
  )
}
