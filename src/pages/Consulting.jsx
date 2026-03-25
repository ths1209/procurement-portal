import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { RefreshCw, Plus, Search, X, Eye, Pencil, Trash2, BookOpen, Clock, BarChart2, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import {
  listConsulting, createRecord, updateRecord, deleteRecord,
  isConfigured, C, Q_TYPE_OPTS, Q_STAGE_OPTS, STATUS_OPTS, Q_TYPE_CFG,
} from '../lib/teableConsulting'

/* ── 日期格式化（ISO → 中国时间 YYYY-MM-DD） ── */
function fmtDate(val) {
  if (!val) return '—'
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val
  try {
    const d = new Date(val)
    const cst = new Date(d.getTime() + 8 * 3600000)
    return cst.toISOString().slice(0, 10)
  } catch { return val }
}

/* ── 日期字段存储用 YYYY-MM-DD（编辑弹窗） ── */
function toDateInput(val) {
  if (!val) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val
  try {
    const d = new Date(val)
    const cst = new Date(d.getTime() + 8 * 3600000)
    return cst.toISOString().slice(0, 10)
  } catch { return '' }
}

const EMPTY_FORM = {
  [C.question]: '', [C.answer]: '', [C.qType]: '', [C.qStage]: '',
  [C.contact]: '', [C.dept]: '', [C.handler]: '',
  [C.acceptDate]: '', [C.solveDate]: '', [C.status]: 'OPEN', [C.month]: '',
}

/* ── 通用组件 ── */
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
function Textarea({ value, onChange, rows = 4 }) {
  return (
    <textarea value={value ?? ''} onChange={e => onChange(e.target.value)} rows={rows}
      className="w-full px-3 py-1.5 rounded-lg text-sm outline-none resize-none"
      style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
  )
}
function TypeBadge({ type }) {
  const cfg = Q_TYPE_CFG[type] ?? { color: '#6B7280', bg: 'rgba(107,114,128,0.1)' }
  return (
    <span className="px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap"
      style={{ color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.color}28` }}>
      {type || '—'}
    </span>
  )
}
const STATUS_CFG = {
  'OPEN':       { color: '#F59E0B', bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.25)'  },
  'IN PROCESS': { color: '#3B82F6', bg: 'rgba(59,130,246,0.1)',  border: 'rgba(59,130,246,0.25)'  },
  'PENDING':    { color: '#8B5CF6', bg: 'rgba(139,92,246,0.1)',  border: 'rgba(139,92,246,0.25)'  },
  'CLOSE':      { color: '#10B981', bg: 'rgba(16,185,129,0.1)',  border: 'rgba(16,185,129,0.25)'  },
}
function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] ?? { color: '#6B7280', bg: 'rgba(107,114,128,0.1)', border: 'rgba(107,114,128,0.2)' }
  return (
    <span className="px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap"
      style={{ color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}` }}>
      {status || '—'}
    </span>
  )
}

/* ── 可排序表头 ── */
function SortTh({ label, field, sortKey, sortDir, onSort, align = 'left' }) {
  const active = sortKey === field
  return (
    <button className="flex items-center gap-0.5 text-xs group w-full"
      style={{ color: active ? 'var(--text)' : 'var(--muted)', justifyContent: align === 'center' ? 'center' : 'flex-start' }}
      onClick={() => onSort(field)}>
      {label}
      <span className="opacity-50 group-hover:opacity-100">
        {active
          ? sortDir === 'asc'
            ? <ChevronUp className="w-3 h-3" />
            : <ChevronDown className="w-3 h-3" />
          : <ChevronsUpDown className="w-3 h-3" />}
      </span>
    </button>
  )
}

/* ── 新建/编辑弹窗 ── */
function EditModal({ row, onClose, onSave }) {
  const [form, setForm] = useState(row ? {
    [C.question]: row.question, [C.answer]: row.answer,
    [C.qType]: row.qType, [C.qStage]: row.qStage,
    [C.contact]: row.contact, [C.dept]: row.dept, [C.handler]: row.handler,
    [C.acceptDate]: toDateInput(row.acceptDate), [C.solveDate]: toDateInput(row.solveDate),
    [C.status]: row.status, [C.month]: row.month,
  } : { ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  function set(key, val) { setForm(f => ({ ...f, [key]: val })) }
  async function handleSave() {
    if (!form[C.question]) { setErr('咨询问题不能为空'); return }
    setSaving(true); setErr('')
    try { await onSave(form) } catch (e) { setErr(e.message); setSaving(false) }
  }
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)' }}>
      <div className="w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh]"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <span className="font-semibold text-sm" style={{ color: 'var(--text)' }}>{row ? '编辑咨询记录' : '新建咨询记录'}</span>
          <button onClick={onClose} className="p-1 rounded hover:opacity-70"><X className="w-4 h-4" style={{ color: 'var(--muted)' }} /></button>
        </div>
        <div className="p-5 overflow-y-auto flex flex-col gap-4">
          <LRow label="咨询和受理问题 *"><Textarea value={form[C.question]} onChange={v => set(C.question, v)} rows={3} /></LRow>
          <LRow label="咨询建议和反馈"><Textarea value={form[C.answer]} onChange={v => set(C.answer, v)} rows={3} /></LRow>
          <div className="grid grid-cols-2 gap-4">
            <LRow label="问题类型"><Sel value={form[C.qType]} onChange={v => set(C.qType, v)} options={Q_TYPE_OPTS} placeholder="请选择" /></LRow>
            <LRow label="问题阶段"><Sel value={form[C.qStage]} onChange={v => set(C.qStage, v)} options={Q_STAGE_OPTS} placeholder="请选择" /></LRow>
            <LRow label="对接人"><Input value={form[C.contact]} onChange={v => set(C.contact, v)} /></LRow>
            <LRow label="对接部门"><Input value={form[C.dept]} onChange={v => set(C.dept, v)} /></LRow>
            <LRow label="处理人"><Input value={form[C.handler]} onChange={v => set(C.handler, v)} /></LRow>
            <LRow label="事项状态"><Sel value={form[C.status]} onChange={v => set(C.status, v)} options={STATUS_OPTS} /></LRow>
            <LRow label="受理日期"><Input value={form[C.acceptDate]} onChange={v => set(C.acceptDate, v)} type="date" /></LRow>
            <LRow label="解决日期"><Input value={form[C.solveDate]} onChange={v => set(C.solveDate, v)} type="date" /></LRow>
            <LRow label="受理月份"><Input value={form[C.month]} onChange={v => set(C.month, v)} placeholder="如：2025-03" /></LRow>
          </div>
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

/* ── 详情弹窗 ── */
function DetailModal({ row, onClose, onEdit, onDelete, isAdmin }) {
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)' }}>
      <div className="w-full max-w-xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh]"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-start justify-between px-5 py-4 gap-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-start gap-2 flex-wrap flex-1 min-w-0">
            <TypeBadge type={row.qType} />
            <StatusBadge status={row.status} />
          </div>
          <button onClick={onClose} className="p-1 rounded hover:opacity-70 shrink-0">
            <X className="w-4 h-4" style={{ color: 'var(--muted)' }} />
          </button>
        </div>
        <div className="p-5 overflow-y-auto flex flex-col gap-4">
          <div>
            <div className="text-xs mb-1" style={{ color: 'var(--muted)' }}>咨询和受理问题</div>
            <div className="text-sm leading-relaxed p-3 rounded-xl whitespace-pre-wrap"
              style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}>
              {row.question || '—'}
            </div>
          </div>
          {row.answer && (
            <div>
              <div className="text-xs mb-1" style={{ color: 'var(--muted)' }}>咨询建议和反馈</div>
              <div className="text-sm leading-relaxed p-3 rounded-xl whitespace-pre-wrap"
                style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}>
                {row.answer}
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 text-sm">
            {[
              ['问题阶段', row.qStage], ['对接人', row.contact],
              ['对接部门', row.dept],   ['处理人', row.handler],
              ['受理日期', fmtDate(row.acceptDate)], ['解决日期', fmtDate(row.solveDate)],
              ['受理月份', row.month],
            ].map(([l, v]) => (
              <div key={l}>
                <div className="text-xs mb-0.5" style={{ color: 'var(--muted)' }}>{l}</div>
                <div style={{ color: 'var(--text)' }}>{v || '—'}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="px-5 py-4 flex justify-between" style={{ borderTop: '1px solid var(--border)' }}>
          {isAdmin
            ? <button onClick={() => onDelete(row)} className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1">
                <Trash2 className="w-3.5 h-3.5" /> 删除
              </button>
            : <span />}
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-1.5 rounded-lg text-sm" style={{ color: 'var(--muted)' }}>关闭</button>
            <button onClick={() => onEdit(row)} className="px-4 py-1.5 rounded-lg text-sm font-medium"
              style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}>
              <Pencil className="w-3.5 h-3.5 inline mr-1" />编辑
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/* ── 统计卡片 ── */
function StatCards({ rows }) {
  const total     = rows.length
  const open      = rows.filter(r => r.status === 'OPEN').length
  const inProcess = rows.filter(r => r.status === 'IN PROCESS').length
  const pending   = rows.filter(r => r.status === 'PENDING').length
  const closed    = rows.filter(r => r.status === 'CLOSE').length
  return (
    <div className="grid grid-cols-5 gap-3">
      {[
        { label: '累计受理',    value: total,     color: '#6366F1' },
        { label: 'OPEN',       value: open,      color: '#F59E0B' },
        { label: 'IN PROCESS', value: inProcess, color: '#3B82F6' },
        { label: 'PENDING',    value: pending,   color: '#8B5CF6' },
        { label: 'CLOSE',      value: closed,    color: '#10B981' },
      ].map(s => (
        <div key={s.label} className="rounded-xl p-4 flex flex-col gap-1"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <span className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</span>
          <span className="text-xs" style={{ color: 'var(--muted)' }}>{s.label}</span>
        </div>
      ))}
    </div>
  )
}

/* ── 问题类型分布 ── */
function TypeDistribution({ rows }) {
  const data = useMemo(() => {
    const map = {}
    rows.forEach(r => { if (r.qType) map[r.qType] = (map[r.qType] ?? 0) + 1 })
    return Object.entries(map).sort(([, a], [, b]) => b - a)
  }, [rows])
  if (data.length === 0) return null
  const max = data[0]?.[1] ?? 1
  return (
    <div className="rounded-xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-2 mb-4">
        <BarChart2 className="w-4 h-4" style={{ color: '#6366F1' }} strokeWidth={1.75} />
        <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>问题类型分布</span>
      </div>
      <div className="flex flex-col gap-3">
        {data.map(([type, count]) => {
          const cfg = Q_TYPE_CFG[type] ?? { color: '#6B7280' }
          return (
            <div key={type} className="flex items-center gap-3">
              <span className="text-xs w-32 shrink-0 truncate" style={{ color: 'var(--muted)' }}>{type}</span>
              <div className="flex-1 h-2 rounded-full" style={{ background: 'var(--surface2)' }}>
                <div className="h-2 rounded-full transition-all"
                  style={{ width: `${(count / max) * 100}%`, background: cfg.color }} />
              </div>
              <span className="text-xs w-8 text-right shrink-0 font-semibold" style={{ color: 'var(--text)' }}>{count}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── 月度趋势 ── */
function MonthlyTrend({ rows }) {
  const months = useMemo(() => {
    const map = {}
    rows.forEach(r => {
      const raw = r.month || r.acceptDate
      const m = raw ? fmtDate(raw).slice(0, 7) : null
      if (m && m !== '—') map[m] = (map[m] ?? 0) + 1
    })
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).slice(-8)
  }, [rows])
  if (months.length === 0) return null
  const max = Math.max(...months.map(([, v]) => v), 1)
  return (
    <div className="rounded-xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-2 mb-4">
        <Clock className="w-4 h-4" style={{ color: '#0EA5E9' }} strokeWidth={1.75} />
        <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>月度受理趋势</span>
      </div>
      <div className="flex items-end gap-2" style={{ height: 120 }}>
        {months.map(([m, v]) => (
          <div key={m} className="flex-1 flex flex-col items-center gap-1.5">
            <span className="text-xs font-semibold" style={{ color: 'var(--text)' }}>{v}</span>
            <div className="w-full rounded-t transition-all"
              style={{ height: `${Math.max((v / max) * 88, 4)}px`, background: '#0EA5E9', opacity: 0.85 }} />
            <span className="text-[11px]" style={{ color: 'var(--muted)' }}>{m.slice(5)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── 列定义 ── */
const COLS = [
  { key: 'question',   label: '咨询问题',   flex: '1 1 0',   sortable: false },
  { key: 'qType',      label: '问题类型',   width: '9rem',   sortable: true  },
  { key: 'qStage',     label: '问题阶段',   width: '8rem',   sortable: true  },
  { key: 'contact',    label: '对接人',     width: '5rem',   sortable: true  },
  { key: 'dept',       label: '对接部门',   width: '9rem',   sortable: true  },
  { key: 'handler',    label: '处理人',     width: '5rem',   sortable: true  },
  { key: 'status',     label: '状态',       width: '6.5rem', sortable: true  },
  { key: 'acceptDate', label: '受理日期',   width: '6rem',   sortable: true  },
  { key: 'solveDate',  label: '解决日期',   width: '6rem',   sortable: true  },
  { key: '_ops',       label: '操作',       width: '5.5rem', sortable: false, center: true },
]
const GRID = COLS.map(c => c.flex ?? c.width).join(' ')

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
  const [statusFilter, setSt] = useState('全部')
  const [sortKey, setSortKey] = useState('acceptDate')
  const [sortDir, setSortDir] = useState('desc')
  const [editRow, setEdit]    = useState(null)
  const [viewRow, setView]    = useState(null)

  async function load() {
    setLoad(true); setErr('')
    try { setRows(await listConsulting()) } catch (e) { setErr(e.message) } finally { setLoad(false) }
  }
  useEffect(() => { load() }, [])

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const shown = useMemo(() => {
    let r = rows
    if (typeFilter !== '全部') r = r.filter(x => x.qType === typeFilter)
    if (statusFilter !== '全部') r = r.filter(x => x.status === statusFilter)
    if (search) {
      const q = search.toLowerCase()
      r = r.filter(x =>
        x.question.toLowerCase().includes(q) ||
        x.contact.toLowerCase().includes(q) ||
        x.dept.toLowerCase().includes(q) ||
        x.handler.toLowerCase().includes(q) ||
        x.qStage.toLowerCase().includes(q)
      )
    }
    // 排序
    r = [...r].sort((a, b) => {
      let av = a[sortKey] ?? '', bv = b[sortKey] ?? ''
      // 日期字段统一转换
      if (sortKey === 'acceptDate' || sortKey === 'solveDate') {
        av = fmtDate(av); bv = fmtDate(bv)
      }
      const cmp = String(av).localeCompare(String(bv), 'zh-CN')
      return sortDir === 'asc' ? cmp : -cmp
    })
    return r
  }, [rows, typeFilter, statusFilter, search, sortKey, sortDir])

  async function handleSave(form) {
    if (editRow && editRow._id) await updateRecord(editRow._id, form)
    else await createRecord(form)
    setEdit(null)
    await load()
  }

  async function handleDelete(row) {
    if (!confirm('确认删除该咨询记录？')) return
    try { await deleteRecord(row._id); setView(null); await load() } catch (e) { alert(e.message) }
  }

  return (
    <div className="px-4 py-4 space-y-4">
      {/* 页头 */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <BookOpen className="w-5 h-5" style={{ color: '#6366F1' }} strokeWidth={1.75} />
            <h1 className="font-semibold text-lg" style={{ color: 'var(--text)' }}>咨询赋能台账</h1>
          </div>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            咨询受理记录 · 问题分析与追踪
            {!configured && <span className="ml-2 text-amber-400">（未配置数据表）</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={loading}
            className="p-2 rounded-lg hover:opacity-70"
            style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
            <RefreshCw className="w-4 h-4" style={{ color: 'var(--muted)', animation: loading ? 'spin 1s linear infinite' : '' }} strokeWidth={1.75} />
          </button>
          <button onClick={() => setEdit(false)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white"
            style={{ background: '#6366F1' }}>
            <Plus className="w-4 h-4" strokeWidth={2} />新建
          </button>
        </div>
      </div>

      {/* 统计卡片 */}
      <StatCards rows={rows} />

      {/* 可视化图表 */}
      {rows.length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          <TypeDistribution rows={rows} />
          <MonthlyTrend rows={rows} />
        </div>
      )}

      {/* 筛选 + 搜索 */}
      <div className="flex flex-col gap-2">
        <div className="flex gap-1.5 flex-wrap items-center">
          <span className="text-xs shrink-0" style={{ color: 'var(--muted)' }}>类型</span>
          {['全部', ...Q_TYPE_OPTS].map(t => (
            <button key={t} onClick={() => setType(t)}
              className="px-2.5 py-0.5 rounded-full text-xs transition-all"
              style={typeFilter === t
                ? { background: '#6366F1', color: '#fff' }
                : { background: 'var(--surface2)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
              {t}
            </button>
          ))}
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <div className="flex gap-1.5 flex-wrap items-center">
            <span className="text-xs shrink-0" style={{ color: 'var(--muted)' }}>状态</span>
            {['全部', 'OPEN', 'IN PROCESS', 'PENDING', 'CLOSE'].map(s => (
              <button key={s} onClick={() => setSt(s)}
                className="px-2.5 py-0.5 rounded-full text-xs transition-all"
                style={statusFilter === s
                  ? { background: STATUS_CFG[s]?.color ?? '#52525B', color: '#fff' }
                  : { background: 'var(--surface2)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
                {s}
              </button>
            ))}
          </div>
          <div className="flex-1 min-w-48 relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="搜索问题、对接人、部门、处理人、阶段"
              className="w-full pl-8 pr-3 py-1.5 rounded-lg text-sm outline-none"
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          </div>
        </div>
      </div>

      {/* 表格 */}
      <div className="rounded-xl overflow-x-auto" style={{ border: '1px solid var(--border)' }}>
        {/* 表头 */}
        <div className="grid items-center px-3 py-2.5 min-w-max"
          style={{ gridTemplateColumns: GRID, background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
          {COLS.map(col => (
            <div key={col.key} style={{ width: col.width, flex: col.flex }}>
              {col.sortable
                ? <SortTh label={col.label} field={col.key} sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align={col.center ? 'center' : 'left'} />
                : <span className="text-xs" style={{ color: 'var(--muted)', display: 'block', textAlign: col.center ? 'center' : 'left' }}>{col.label}</span>}
            </div>
          ))}
        </div>

        {loading && (
          <div className="flex justify-center py-10">
            <div className="w-6 h-6 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
          </div>
        )}
        {!loading && err && <div className="text-center py-10 text-sm text-red-400">{err}</div>}
        {!loading && !err && shown.length === 0 && (
          <div className="text-center py-12 flex flex-col items-center gap-2">
            <BookOpen className="w-8 h-8" style={{ color: 'var(--muted)' }} strokeWidth={1.25} />
            <p className="text-sm" style={{ color: 'var(--muted)' }}>暂无咨询记录</p>
          </div>
        )}
        {!loading && shown.map((row, i) => (
          <div key={row._id}
            className="grid items-center px-3 py-2.5 text-xs transition-colors hover:bg-white/[0.02] cursor-pointer min-w-max"
            onClick={() => setView(row)}
            style={{ gridTemplateColumns: GRID, borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
            <span className="truncate pr-3 leading-relaxed" style={{ color: 'var(--text)', flex: '1 1 0' }}>{row.question}</span>
            <span style={{ width: '9rem' }}><TypeBadge type={row.qType} /></span>
            <span className="truncate pr-2" style={{ width: '8rem', color: 'var(--muted)' }}>{row.qStage || '—'}</span>
            <span className="truncate" style={{ width: '5rem', color: 'var(--muted)' }}>{row.contact || '—'}</span>
            <span className="truncate pr-2" style={{ width: '9rem', color: 'var(--muted)' }}>{row.dept || '—'}</span>
            <span className="truncate" style={{ width: '5rem', color: 'var(--muted)' }}>{row.handler || '—'}</span>
            <span style={{ width: '6.5rem' }}><StatusBadge status={row.status} /></span>
            <span style={{ width: '6rem', color: 'var(--muted)' }}>{fmtDate(row.acceptDate)}</span>
            <span style={{ width: '6rem', color: 'var(--muted)' }}>{fmtDate(row.solveDate)}</span>
            <div className="flex items-center justify-center gap-2" style={{ width: '5.5rem' }} onClick={e => e.stopPropagation()}>
              <button onClick={() => setView(row)} className="hover:opacity-70"><Eye className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} strokeWidth={1.75} /></button>
              <button onClick={() => setEdit(row)} className="hover:opacity-70"><Pencil className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} strokeWidth={1.75} /></button>
              {isAdmin && <button onClick={() => handleDelete(row)} className="hover:opacity-70"><Trash2 className="w-3.5 h-3.5 text-red-400/70" strokeWidth={1.75} /></button>}
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
