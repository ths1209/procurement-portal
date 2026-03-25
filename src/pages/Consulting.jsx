import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import {
  RefreshCw, Plus, Search, X, Eye, Pencil, Trash2,
  BookOpen, BarChart2, ChevronUp, ChevronDown, ChevronsUpDown,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import {
  listConsulting, createRecord, updateRecord, deleteRecord,
  isConfigured, C, Q_TYPE_OPTS, Q_STAGE_OPTS, STATUS_OPTS, Q_TYPE_CFG,
} from '../lib/teableConsulting'

/* ── 日期工具 ── */
function fmtDate(val) {
  if (!val) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val
  try {
    return new Date(new Date(val).getTime() + 8 * 3600000).toISOString().slice(0, 10)
  } catch { return '' }
}

// 财年：3月起算，FY = year+1（2025-03 → FY26，2026-01 → FY26）
function getFY(dateVal) {
  const d = fmtDate(dateVal)
  if (!d) return null
  const y = +d.slice(0, 4), m = +d.slice(5, 7)
  return m >= 3 ? y + 1 : y
}
function fyLabel(fy) { return `FY${String(fy).slice(2)}` }

/* ── 常量 ── */
const EMPTY_FORM = {
  [C.question]: '', [C.answer]: '', [C.qType]: '', [C.qStage]: '',
  [C.contact]: '', [C.dept]: '', [C.handler]: '',
  [C.acceptDate]: '', [C.solveDate]: '', [C.status]: 'OPEN', [C.month]: '',
}

const STATUS_CFG = {
  'OPEN':       { color: '#F59E0B', bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.3)'  },
  'IN PROCESS': { color: '#3B82F6', bg: 'rgba(59,130,246,0.1)',  border: 'rgba(59,130,246,0.3)'  },
  'PENDING':    { color: '#8B5CF6', bg: 'rgba(139,92,246,0.1)',  border: 'rgba(139,92,246,0.3)'  },
  'CLOSE':      { color: '#10B981', bg: 'rgba(16,185,129,0.1)',  border: 'rgba(16,185,129,0.3)'  },
}

/* ── 小组件 ── */
function LRow({ label, children }) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-xs" style={{ color: 'var(--muted)' }}>{label}</label>
      {children}
    </div>
  )
}
function FInput({ value, onChange, ...rest }) {
  return (
    <input value={value ?? ''} onChange={e => onChange(e.target.value)}
      className="w-full px-3 py-1.5 rounded-lg text-sm outline-none"
      style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}
      {...rest} />
  )
}
function FSel({ value, onChange, options, placeholder }) {
  return (
    <select value={value ?? ''} onChange={e => onChange(e.target.value)}
      className="w-full px-3 py-1.5 rounded-lg text-sm outline-none"
      style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}
function FTextarea({ value, onChange, rows = 4 }) {
  return (
    <textarea value={value ?? ''} onChange={e => onChange(e.target.value)} rows={rows}
      className="w-full px-3 py-1.5 rounded-lg text-sm outline-none resize-none"
      style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
  )
}
function TypeBadge({ type }) {
  const cfg = Q_TYPE_CFG[type] ?? { color: '#6B7280', bg: 'rgba(107,114,128,0.1)' }
  return (
    <span className="inline-block px-1.5 py-0.5 rounded text-[11px] font-medium whitespace-nowrap"
      style={{ color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.color}28` }}>
      {type || '—'}
    </span>
  )
}
function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] ?? { color: '#6B7280', bg: 'rgba(107,114,128,0.1)', border: 'rgba(107,114,128,0.2)' }
  return (
    <span className="inline-block px-1.5 py-0.5 rounded text-[11px] font-medium whitespace-nowrap"
      style={{ color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}` }}>
      {status || '—'}
    </span>
  )
}
function Chip({ active, color, onClick, children }) {
  return (
    <button onClick={onClick}
      className="px-2.5 py-0.5 rounded-full text-xs transition-all whitespace-nowrap"
      style={active
        ? { background: color ?? '#6366F1', color: '#fff' }
        : { background: 'var(--surface2)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
      {children}
    </button>
  )
}
function SortIcon({ field, sortKey, sortDir }) {
  if (sortKey !== field) return <ChevronsUpDown className="w-3 h-3 opacity-30" />
  return sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
}

/* ── 表格列 ── */
const COLS = [
  { key: 'question',   label: '咨询问题',  w: '1fr',    sort: false },
  { key: 'qType',      label: '问题类型',  w: '8rem',   sort: true  },
  { key: 'qStage',     label: '问题阶段',  w: '7.5rem', sort: true  },
  { key: 'contact',    label: '对接人',    w: '4.5rem', sort: true  },
  { key: 'dept',       label: '对接部门',  w: '8rem',   sort: true  },
  { key: 'handler',    label: '处理人',    w: '4.5rem', sort: true  },
  { key: 'status',     label: '状态',      w: '6.5rem', sort: true  },
  { key: 'acceptDate', label: '受理日期',  w: '5.5rem', sort: true  },
  { key: 'solveDate',  label: '解决日期',  w: '5.5rem', sort: true  },
  { key: '_ops',       label: '操作',      w: '5rem',   sort: false, center: true },
]
const GRID_TPL = COLS.map(c => c.w).join(' ')

/* ── 自定义 Tooltip ── */
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl shadow-xl px-3 py-2.5 text-xs flex flex-col gap-1"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)', minWidth: 130 }}>
      <div className="font-semibold mb-1" style={{ color: 'var(--text)' }}>{label}</div>
      {payload.map(p => (
        <div key={p.dataKey} className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
            <span style={{ color: 'var(--muted)' }}>{p.name}</span>
          </div>
          <span className="font-semibold" style={{ color: 'var(--text)' }}>{p.value}</span>
        </div>
      ))}
    </div>
  )
}

/* ── 月度趋势组合图 ── */
function TrendChart({ rows }) {
  const data = useMemo(() => {
    const map = {}
    rows.forEach(r => {
      const d = fmtDate(r.acceptDate)
      if (!d) return
      const k = d.slice(0, 7)
      if (!map[k]) map[k] = { month: k, label: k.slice(5) + '月', 受理: 0, 已关闭: 0, 未关闭: 0 }
      map[k].受理++
      if (r.status === 'CLOSE') map[k].已关闭++
      else map[k].未关闭++
    })
    const arr = Object.values(map).sort((a, b) => a.month.localeCompare(b.month))
    // 累计受理
    let cum = 0
    arr.forEach(d => { cum += d.受理; d.累计 = cum })
    return arr
  }, [rows])

  if (!data.length) return (
    <div className="rounded-xl flex items-center justify-center" style={{ height: 220, background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <p className="text-xs" style={{ color: 'var(--muted)' }}>暂无数据</p>
    </div>
  )

  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-2 mb-3">
        <BarChart2 className="w-3.5 h-3.5" style={{ color: '#0EA5E9' }} strokeWidth={1.75} />
        <span className="text-xs font-medium" style={{ color: 'var(--text)' }}>月度受理趋势</span>
        <span className="text-[11px] ml-1" style={{ color: 'var(--muted)' }}>柱：本月受理量（已关闭/未关闭）· 折线：累计</span>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}
          barCategoryGap="30%">
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
          <YAxis yAxisId="left" tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(99,102,241,0.04)' }} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
          <Bar yAxisId="left" dataKey="已关闭" name="已关闭" stackId="a" fill="#10B981" radius={[0, 0, 4, 4]} />
          <Bar yAxisId="left" dataKey="未关闭" name="未关闭" stackId="a" fill="#6366F1" opacity={0.6} radius={[4, 4, 0, 0]} />
          <Line yAxisId="right" dataKey="累计" name="累计受理" type="monotone"
            stroke="#F59E0B" strokeWidth={2} dot={{ r: 3, fill: '#F59E0B' }}
            activeDot={{ r: 5 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

/* ── 类型分布图 ── */
function TypeChart({ rows }) {
  const data = useMemo(() => {
    const m = {}
    rows.forEach(r => { if (r.qType) m[r.qType] = (m[r.qType] ?? 0) + 1 })
    return Object.entries(m).sort(([, a], [, b]) => b - a)
  }, [rows])
  if (!data.length) return null
  const max = data[0][1]
  return (
    <div className="rounded-xl p-4 flex flex-col gap-2.5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-2">
        <BarChart2 className="w-3.5 h-3.5" style={{ color: '#6366F1' }} strokeWidth={1.75} />
        <span className="text-xs font-medium" style={{ color: 'var(--text)' }}>问题类型分布</span>
      </div>
      <div className="flex flex-col gap-2 overflow-y-auto" style={{ maxHeight: 220 }}>
        {data.map(([type, n]) => {
          const cfg = Q_TYPE_CFG[type] ?? { color: '#6B7280' }
          return (
            <div key={type} className="flex items-center gap-2">
              <span className="text-[11px] w-24 shrink-0 truncate" style={{ color: 'var(--muted)' }}>{type}</span>
              <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface2)' }}>
                <div className="h-2 rounded-full" style={{ width: `${(n / max) * 100}%`, background: cfg.color }} />
              </div>
              <span className="text-[11px] w-6 text-right font-semibold shrink-0" style={{ color: 'var(--text)' }}>{n}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── 新建/编辑弹窗 ── */
function EditModal({ row, onClose, onSave }) {
  const [form, setForm] = useState(row ? {
    [C.question]: row.question, [C.answer]: row.answer,
    [C.qType]: row.qType, [C.qStage]: row.qStage,
    [C.contact]: row.contact, [C.dept]: row.dept, [C.handler]: row.handler,
    [C.acceptDate]: fmtDate(row.acceptDate), [C.solveDate]: fmtDate(row.solveDate),
    [C.status]: row.status, [C.month]: row.month,
  } : { ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  async function submit() {
    if (!form[C.question]) { setErr('咨询问题不能为空'); return }
    setSaving(true); setErr('')
    try { await onSave(form) } catch (e) { setErr(e.message); setSaving(false) }
  }
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh]"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <span className="font-semibold text-sm" style={{ color: 'var(--text)' }}>{row ? '编辑' : '新建'}咨询记录</span>
          <button onClick={onClose}><X className="w-4 h-4" style={{ color: 'var(--muted)' }} /></button>
        </div>
        <div className="p-5 overflow-y-auto flex flex-col gap-4">
          <LRow label="咨询和受理问题 *"><FTextarea value={form[C.question]} onChange={v => set(C.question, v)} rows={3} /></LRow>
          <LRow label="咨询建议和反馈"><FTextarea value={form[C.answer]} onChange={v => set(C.answer, v)} rows={3} /></LRow>
          <div className="grid grid-cols-2 gap-3">
            <LRow label="问题类型"><FSel value={form[C.qType]} onChange={v => set(C.qType, v)} options={Q_TYPE_OPTS} placeholder="请选择" /></LRow>
            <LRow label="问题阶段"><FSel value={form[C.qStage]} onChange={v => set(C.qStage, v)} options={Q_STAGE_OPTS} placeholder="请选择" /></LRow>
            <LRow label="对接人"><FInput value={form[C.contact]} onChange={v => set(C.contact, v)} /></LRow>
            <LRow label="对接部门"><FInput value={form[C.dept]} onChange={v => set(C.dept, v)} /></LRow>
            <LRow label="处理人"><FInput value={form[C.handler]} onChange={v => set(C.handler, v)} /></LRow>
            <LRow label="事项状态"><FSel value={form[C.status]} onChange={v => set(C.status, v)} options={STATUS_OPTS} /></LRow>
            <LRow label="受理日期"><FInput value={form[C.acceptDate]} onChange={v => set(C.acceptDate, v)} type="date" /></LRow>
            <LRow label="解决日期"><FInput value={form[C.solveDate]} onChange={v => set(C.solveDate, v)} type="date" /></LRow>
            <LRow label="受理月份"><FInput value={form[C.month]} onChange={v => set(C.month, v)} placeholder="如：2025-03" /></LRow>
          </div>
          {err && <p className="text-xs text-red-400">{err}</p>}
        </div>
        <div className="px-5 py-3 flex justify-end gap-2" style={{ borderTop: '1px solid var(--border)' }}>
          <button onClick={onClose} className="px-4 py-1.5 rounded-lg text-sm" style={{ color: 'var(--muted)' }}>取消</button>
          <button onClick={submit} disabled={saving}
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

/* ── 详情弹窗 ── */
function DetailModal({ row, onClose, onEdit, onDelete, isAdmin }) {
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh]"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2 flex-wrap">
            <TypeBadge type={row.qType} /><StatusBadge status={row.status} />
          </div>
          <button onClick={onClose}><X className="w-4 h-4" style={{ color: 'var(--muted)' }} /></button>
        </div>
        <div className="p-5 overflow-y-auto flex flex-col gap-4">
          <div>
            <div className="text-xs mb-1.5 font-medium" style={{ color: 'var(--muted)' }}>咨询和受理问题</div>
            <div className="text-sm leading-relaxed p-3 rounded-xl whitespace-pre-wrap"
              style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}>
              {row.question || '—'}
            </div>
          </div>
          {row.answer && (
            <div>
              <div className="text-xs mb-1.5 font-medium" style={{ color: 'var(--muted)' }}>咨询建议和反馈</div>
              <div className="text-sm leading-relaxed p-3 rounded-xl whitespace-pre-wrap"
                style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}>
                {row.answer}
              </div>
            </div>
          )}
          <div className="grid grid-cols-3 gap-x-4 gap-y-3 text-sm">
            {[
              ['问题阶段', row.qStage], ['对接人', row.contact], ['对接部门', row.dept],
              ['处理人', row.handler], ['受理日期', fmtDate(row.acceptDate)], ['解决日期', fmtDate(row.solveDate)],
              ['受理月份', row.month],
            ].map(([l, v]) => (
              <div key={l}>
                <div className="text-xs mb-0.5" style={{ color: 'var(--muted)' }}>{l}</div>
                <div style={{ color: 'var(--text)' }}>{v || '—'}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="px-5 py-3 flex justify-between items-center" style={{ borderTop: '1px solid var(--border)' }}>
          {isAdmin
            ? <button onClick={() => onDelete(row)} className="text-xs text-red-400 flex items-center gap-1 hover:text-red-300">
                <Trash2 className="w-3.5 h-3.5" /> 删除
              </button>
            : <span />}
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-sm" style={{ color: 'var(--muted)' }}>关闭</button>
            <button onClick={() => onEdit(row)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1"
              style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}>
              <Pencil className="w-3.5 h-3.5" />编辑
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/* ── 主页面 ── */
export default function Consulting() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const configured = isConfigured()

  const [rows, setRows]       = useState([])
  const [loading, setLoad]    = useState(false)
  const [err, setErr]         = useState('')
  const [search, setSearch]   = useState('')
  const [typeFilter, setType] = useState('全部')
  const [stFilter, setSt]     = useState('全部')
  const [fyFilter, setFY]     = useState('全部')
  const [sortKey, setSortKey] = useState('acceptDate')
  const [sortDir, setSortDir] = useState('desc')
  const [editRow, setEdit]    = useState(null)
  const [viewRow, setView]    = useState(null)

  async function load() {
    setLoad(true); setErr('')
    try { setRows(await listConsulting()) } catch (e) { setErr(e.message) } finally { setLoad(false) }
  }
  useEffect(() => { load() }, [])

  // 财年选项（从数据中自动生成）
  const fyOpts = useMemo(() => {
    const s = new Set()
    rows.forEach(r => { const fy = getFY(r.acceptDate); if (fy) s.add(fy) })
    return [...s].sort((a, b) => b - a)
  }, [rows])

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  // 按财年筛选后的数据（用于图表和明细）
  const fyRows = useMemo(() => {
    if (fyFilter === '全部') return rows
    return rows.filter(r => getFY(r.acceptDate) === Number(fyFilter))
  }, [rows, fyFilter])

  // 明细筛选（在财年基础上叠加）
  const shown = useMemo(() => {
    let r = fyRows
    if (typeFilter !== '全部') r = r.filter(x => x.qType === typeFilter)
    if (stFilter !== '全部') r = r.filter(x => x.status === stFilter)
    if (search) {
      const q = search.toLowerCase()
      r = r.filter(x => [x.question, x.contact, x.dept, x.handler, x.qStage]
        .some(v => v?.toLowerCase().includes(q)))
    }
    return [...r].sort((a, b) => {
      let av = a[sortKey] ?? '', bv = b[sortKey] ?? ''
      if (sortKey === 'acceptDate' || sortKey === 'solveDate') { av = fmtDate(av); bv = fmtDate(bv) }
      const c = String(av).localeCompare(String(bv), 'zh-CN')
      return sortDir === 'asc' ? c : -c
    })
  }, [fyRows, typeFilter, stFilter, search, sortKey, sortDir])

  async function handleSave(form) {
    if (editRow?._id) await updateRecord(editRow._id, form)
    else await createRecord(form)
    setEdit(null); await load()
  }
  async function handleDelete(row) {
    if (!confirm('确认删除该咨询记录？')) return
    try { await deleteRecord(row._id); setView(null); await load() } catch (e) { alert(e.message) }
  }

  const total     = fyRows.length
  const open      = fyRows.filter(r => r.status === 'OPEN').length
  const inProcess = fyRows.filter(r => r.status === 'IN PROCESS').length
  const pending   = fyRows.filter(r => r.status === 'PENDING').length
  const closed    = fyRows.filter(r => r.status === 'CLOSE').length

  return (
    <div className="px-5 py-4 flex flex-col gap-4">

      {/* 页头 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 shrink-0" style={{ color: '#6366F1' }} strokeWidth={1.75} />
          <div>
            <h1 className="font-semibold text-base leading-tight" style={{ color: 'var(--text)' }}>咨询赋能台账</h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
              咨询受理记录 · 问题分析与追踪
              {!configured && <span className="ml-1 text-amber-400">（未配置数据表）</span>}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={load} disabled={loading} className="p-1.5 rounded-lg hover:opacity-70"
            style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
            <RefreshCw className="w-4 h-4" style={{ color: 'var(--muted)', animation: loading ? 'spin 1s linear infinite' : '' }} strokeWidth={1.75} />
          </button>
          <button onClick={() => setEdit(false)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white"
            style={{ background: '#6366F1' }}>
            <Plus className="w-4 h-4" strokeWidth={2} />新建
          </button>
        </div>
      </div>

      {/* 财年 tab */}
      <div className="flex items-center gap-2 flex-wrap">
        {['全部', ...fyOpts].map(fy => {
          const label = fy === '全部' ? '全部' : fyLabel(fy)
          const active = fyFilter === String(fy)
          return (
            <button key={fy} onClick={() => setFY(String(fy))}
              className="px-3 py-1 rounded-lg text-xs font-medium transition-all"
              style={active
                ? { background: '#6366F1', color: '#fff', boxShadow: '0 2px 8px rgba(99,102,241,0.3)' }
                : { background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
              {label}
            </button>
          )
        })}
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { label: '累计受理',    v: total,     color: '#6366F1' },
          { label: 'OPEN',       v: open,      color: '#F59E0B' },
          { label: 'IN PROCESS', v: inProcess, color: '#3B82F6' },
          { label: 'PENDING',    v: pending,   color: '#8B5CF6' },
          { label: 'CLOSE',      v: closed,    color: '#10B981' },
        ].map(s => (
          <div key={s.label} className="rounded-xl px-4 py-3 flex items-center justify-between"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <span className="text-xs" style={{ color: 'var(--muted)' }}>{s.label}</span>
            <span className="text-2xl font-bold" style={{ color: s.color }}>{s.v}</span>
          </div>
        ))}
      </div>

      {/* 图表 */}
      {rows.length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          <TypeChart rows={fyRows} />
          <TrendChart rows={fyRows} />
        </div>
      )}

      {/* 筛选卡片 */}
      <div className="rounded-xl p-3 flex flex-col gap-2" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium w-8 shrink-0" style={{ color: 'var(--muted)' }}>类型</span>
          <Chip active={typeFilter === '全部'} onClick={() => setType('全部')}>全部</Chip>
          {Q_TYPE_OPTS.map(t => (
            <Chip key={t} active={typeFilter === t} color={Q_TYPE_CFG[t]?.color ?? '#6366F1'} onClick={() => setType(t)}>{t}</Chip>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium w-8 shrink-0" style={{ color: 'var(--muted)' }}>状态</span>
          {['全部', 'OPEN', 'IN PROCESS', 'PENDING', 'CLOSE'].map(s => (
            <Chip key={s} active={stFilter === s} color={STATUS_CFG[s]?.color} onClick={() => setSt(s)}>{s}</Chip>
          ))}
          <div className="flex-1 min-w-48 relative ml-2">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="搜索问题、对接人、部门、处理人、阶段"
              className="w-full pl-8 pr-3 py-1 rounded-lg text-xs outline-none"
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          </div>
        </div>
      </div>

      {/* 表格 */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        {/* 表头 */}
        <div style={{ display: 'grid', gridTemplateColumns: GRID_TPL, background: 'var(--surface2)', borderBottom: '1px solid var(--border)', padding: '8px 12px', gap: '0 8px', alignItems: 'center' }}>
          {COLS.map(col => (
            <div key={col.key} style={{ minWidth: 0, textAlign: col.center ? 'center' : 'left' }}>
              {col.sort
                ? <button className="flex items-center gap-0.5 text-xs group"
                    style={{ color: sortKey === col.key ? 'var(--text)' : 'var(--muted)' }}
                    onClick={() => toggleSort(col.key)}>
                    <span className="truncate">{col.label}</span>
                    <SortIcon field={col.key} sortKey={sortKey} sortDir={sortDir} />
                  </button>
                : <span className="text-xs" style={{ color: 'var(--muted)' }}>{col.label}</span>}
            </div>
          ))}
        </div>

        {loading && <div className="flex justify-center py-10"><div className="w-5 h-5 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" /></div>}
        {!loading && err && <div className="text-center py-10 text-sm text-red-400">{err}</div>}
        {!loading && !err && shown.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-12">
            <BookOpen className="w-7 h-7" style={{ color: 'var(--muted)' }} strokeWidth={1.25} />
            <p className="text-sm" style={{ color: 'var(--muted)' }}>暂无咨询记录</p>
          </div>
        )}
        {!loading && shown.map((row, i) => (
          <div key={row._id}
            className="hover:bg-black/[0.02] dark:hover:bg-white/[0.02] cursor-pointer transition-colors"
            style={{ display: 'grid', gridTemplateColumns: GRID_TPL, padding: '7px 12px', gap: '0 8px', alignItems: 'center', borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}
            onClick={() => setView(row)}>
            <span className="text-xs truncate pr-1" style={{ color: 'var(--text)', minWidth: 0 }}>{row.question}</span>
            <span style={{ minWidth: 0 }}><TypeBadge type={row.qType} /></span>
            <span className="text-xs truncate" style={{ color: 'var(--muted)', minWidth: 0 }}>{row.qStage || '—'}</span>
            <span className="text-xs truncate" style={{ color: 'var(--muted)', minWidth: 0 }}>{row.contact || '—'}</span>
            <span className="text-xs truncate" style={{ color: 'var(--muted)', minWidth: 0 }}>{row.dept || '—'}</span>
            <span className="text-xs truncate" style={{ color: 'var(--muted)', minWidth: 0 }}>{row.handler || '—'}</span>
            <span style={{ minWidth: 0 }}><StatusBadge status={row.status} /></span>
            <span className="text-xs tabular-nums" style={{ color: 'var(--muted)', minWidth: 0 }}>{fmtDate(row.acceptDate) || '—'}</span>
            <span className="text-xs tabular-nums" style={{ color: 'var(--muted)', minWidth: 0 }}>{fmtDate(row.solveDate) || '—'}</span>
            <div className="flex items-center justify-center gap-2" style={{ minWidth: 0 }} onClick={e => e.stopPropagation()}>
              <button onClick={() => setView(row)} className="hover:opacity-70"><Eye className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} strokeWidth={1.75} /></button>
              <button onClick={() => setEdit(row)} className="hover:opacity-70"><Pencil className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} strokeWidth={1.75} /></button>
              {isAdmin && <button onClick={() => handleDelete(row)} className="hover:opacity-70"><Trash2 className="w-3.5 h-3.5" style={{ color: '#F87171' }} strokeWidth={1.75} /></button>}
            </div>
          </div>
        ))}
      </div>

      {editRow !== null && <EditModal row={editRow || null} onClose={() => setEdit(null)} onSave={handleSave} />}
      {viewRow && <DetailModal row={viewRow} onClose={() => setView(null)}
        onEdit={r => { setView(null); setEdit(r) }} onDelete={handleDelete} isAdmin={isAdmin} />}
    </div>
  )
}
