import { useState, useEffect, useMemo, useDeferredValue } from 'react'
import { createPortal } from 'react-dom'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import {
  RefreshCw, Plus, Search, X, Eye, Pencil, Trash2,
  BookOpen, BarChart2, ChevronUp, ChevronDown, ChevronsUpDown,
  Filter, RotateCcw, Users, FileText, Sparkles, Loader2, Copy, Check,
} from 'lucide-react'
import { Modal } from './Dashboard'
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

/* ── 咨询月报 AI 调用 ── */
const OR_BASE  = 'https://openrouter.ai/api/v1'
const OR_KEY   = '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'
const OR_MODEL = 'openai/gpt-4o-mini'
const AI_BASE  = (import.meta.env.VITE_AI_API_BASE ?? '').replace(/\/$/, '')
const AI_KEY   = import.meta.env.VITE_AI_API_KEY   ?? ''
const AI_MODEL = import.meta.env.VITE_AI_MODEL     ?? 'claude-sonnet-4.6'

async function callAIChat(prompt) {
  // 优先尝试直连
  if (AI_BASE && AI_KEY && AI_BASE.startsWith('https')) {
    try {
      const res = await fetch(`${AI_BASE}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${AI_KEY}` },
        body: JSON.stringify({ model: AI_MODEL, messages: [{ role: 'user', content: prompt }], temperature: 0.7, max_tokens: 700 }),
      })
      if (res.ok) {
        const d = await res.json()
        const text = d.choices?.[0]?.message?.content?.trim()
        if (text) return text
      }
    } catch { /* 降级 */ }
  }
  // OpenRouter 兜底
  const res = await fetch(`${OR_BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OR_KEY}` },
    body: JSON.stringify({ model: OR_MODEL, messages: [{ role: 'user', content: prompt }], temperature: 0.7, max_tokens: 700 }),
  })
  if (!res.ok) throw new Error(`AI 接口错误 ${res.status}`)
  const d = await res.json()
  return d.choices?.[0]?.message?.content?.trim() ?? '（AI 返回内容为空）'
}

// 处理人颜色调色板（最多 12 人）
const HANDLER_PALETTE = [
  '#6366F1', '#10B981', '#F59E0B', '#3B82F6', '#EC4899',
  '#8B5CF6', '#14B8A6', '#F97316', '#06B6D4', '#EF4444',
  '#84CC16', '#A78BFA',
]
function buildHandlerColors(rows) {
  const map = {}
  let idx = 0
  rows.forEach(r => {
    if (r.handler && !(r.handler in map)) {
      map[r.handler] = HANDLER_PALETTE[idx % HANDLER_PALETTE.length]
      idx++
    }
  })
  return map
}

const INIT_FILTERS = {
  qType: '', qStage: '', contact: '', dept: '', handler: '',
  status: '', acceptFrom: '', acceptTo: '', q: '',
}

/* ── debounce hook ── */
function useDebounce(value, delay = 250) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return v
}

const PAGE_SIZE = 50

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
function SortIcon({ field, sortKey, sortDir }) {
  if (sortKey !== field) return <ChevronsUpDown className="w-3 h-3 opacity-30" />
  return sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
}

/* ── 筛选输入框（小尺寸） ── */
function FilterInput({ value, onChange, placeholder, icon: Icon }) {
  return (
    <div className="relative">
      {Icon && <Icon className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--muted)' }} />}
      <input value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full py-1.5 rounded-lg text-xs outline-none transition-colors"
        style={{
          paddingLeft: Icon ? '1.75rem' : '0.625rem',
          paddingRight: '0.625rem',
          background: 'var(--surface2)',
          border: '1px solid var(--border)',
          color: 'var(--text)',
        }} />
    </div>
  )
}
function FilterSelect({ value, onChange, options, placeholder }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="w-full px-2.5 py-1.5 rounded-lg text-xs outline-none transition-colors appearance-none"
      style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: value ? 'var(--text)' : 'var(--muted)' }}>
      <option value="">{placeholder ?? '全部'}</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )
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
        <ComposedChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 0 }} barCategoryGap="30%">
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
          <YAxis yAxisId="left" tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(99,102,241,0.04)' }} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
          <Bar yAxisId="left" dataKey="已关闭" name="已关闭" stackId="a" fill="#10B981" radius={[0, 0, 4, 4]} />
          <Bar yAxisId="left" dataKey="未关闭" name="未关闭" stackId="a" fill="#6366F1" opacity={0.6} radius={[4, 4, 0, 0]} />
          <Line yAxisId="right" dataKey="累计" name="累计受理" type="monotone"
            stroke="#F59E0B" strokeWidth={2} dot={{ r: 3, fill: '#F59E0B' }} activeDot={{ r: 5 }} />
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
                <div className="h-2 rounded-full transition-all duration-500"
                  style={{ width: `${(n / max) * 100}%`, background: cfg.color }} />
              </div>
              <span className="text-[11px] w-6 text-right font-semibold shrink-0" style={{ color: 'var(--text)' }}>{n}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── 处理人分布图 ── */
function HandlerChart({ rows, handlerColors }) {
  const now = new Date()

  const data = useMemo(() => {
    // 统计每个处理人：总量 + 首次受理日期
    const m = {}
    rows.forEach(r => {
      if (!r.handler) return
      const d = fmtDate(r.acceptDate)
      if (!m[r.handler]) m[r.handler] = { count: 0, firstDate: d || '' }
      m[r.handler].count++
      if (d && (!m[r.handler].firstDate || d < m[r.handler].firstDate)) {
        m[r.handler].firstDate = d
      }
    })
    // 计算月均：从首次受理日 → 今日的自然月数（至少 1 个月）
    return Object.entries(m)
      .map(([handler, { count, firstDate }]) => {
        let monthsActive = 1
        if (firstDate) {
          const fd = new Date(firstDate)
          monthsActive = Math.max(
            1,
            (now.getFullYear() - fd.getFullYear()) * 12 + (now.getMonth() - fd.getMonth()) + 1
          )
        }
        const avg = (count / monthsActive).toFixed(1)
        return { handler, count, avg: parseFloat(avg), monthsActive }
      })
      .sort((a, b) => b.count - a.count)
  }, [rows])

  if (!data.length) return null
  const maxCount = data[0].count
  const maxAvg   = Math.max(...data.map(d => d.avg))

  return (
    <div className="rounded-xl p-4 flex flex-col gap-2.5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-3.5 h-3.5" style={{ color: '#10B981' }} strokeWidth={1.75} />
          <span className="text-xs font-medium" style={{ color: 'var(--text)' }}>处理人分布</span>
        </div>
        <div className="flex items-center gap-3 text-[10px]" style={{ color: 'var(--muted)' }}>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-sm opacity-80" style={{ background: '#10B981' }} />总量
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-sm opacity-50" style={{ background: '#10B981' }} />月均
          </span>
        </div>
      </div>

      {/* 列标题 */}
      <div className="grid text-[10px] font-medium px-0.5" style={{ gridTemplateColumns: '4rem 1fr 2.8rem 2.8rem', color: 'var(--muted)', gap: '0 6px' }}>
        <span>处理人</span>
        <span />
        <span className="text-right">总量</span>
        <span className="text-right">月均</span>
      </div>

      <div className="flex flex-col gap-2.5 overflow-y-auto" style={{ maxHeight: 200 }}>
        {data.map(({ handler, count, avg }) => {
          const color = handlerColors[handler] ?? '#6B7280'
          return (
            <div key={handler} className="grid items-center" style={{ gridTemplateColumns: '4rem 1fr 2.8rem 2.8rem', gap: '0 6px' }}>
              <span className="text-[11px] truncate" style={{ color: 'var(--muted)' }}>{handler}</span>
              {/* 双层进度条：底层月均（浅），上层总量（实色） */}
              <div className="relative h-3 rounded-full overflow-hidden" style={{ background: 'var(--surface2)' }}>
                {/* 月均条（浅色背景） */}
                <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
                  style={{ width: `${(avg / maxAvg) * 100}%`, background: color, opacity: 0.25 }} />
                {/* 总量条（实色，较细） */}
                <div className="absolute top-[3px] bottom-[3px] left-0 rounded-full transition-all duration-500"
                  style={{ width: `${(count / maxCount) * 100}%`, background: color }} />
              </div>
              <span className="text-[11px] text-right font-semibold tabular-nums" style={{ color: 'var(--text)' }}>{count}</span>
              <span className="text-[11px] text-right tabular-nums" style={{ color: color }}>{avg}/月</span>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] animate-scale-in"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <span className="font-semibold text-sm" style={{ color: 'var(--text)' }}>{row ? '编辑' : '新建'}咨询记录</span>
          <button onClick={onClose} className="press p-1 rounded-lg hover:opacity-70">
            <X className="w-4 h-4" style={{ color: 'var(--muted)' }} />
          </button>
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
          <button onClick={onClose} className="press px-4 py-1.5 rounded-lg text-sm" style={{ color: 'var(--muted)' }}>取消</button>
          <button onClick={submit} disabled={saving}
            className="press px-4 py-1.5 rounded-lg text-sm font-medium text-white"
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] animate-scale-in"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2 flex-wrap">
            <TypeBadge type={row.qType} /><StatusBadge status={row.status} />
          </div>
          <button onClick={onClose} className="press p-1 rounded-lg hover:opacity-70">
            <X className="w-4 h-4" style={{ color: 'var(--muted)' }} />
          </button>
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
            ? <button onClick={() => onDelete(row)} className="press text-xs text-red-400 flex items-center gap-1 hover:text-red-300">
                <Trash2 className="w-3.5 h-3.5" /> 删除
              </button>
            : <span />}
          <div className="flex gap-2">
            <button onClick={onClose} className="press px-3 py-1.5 rounded-lg text-sm" style={{ color: 'var(--muted)' }}>关闭</button>
            <button onClick={() => onEdit(row)}
              className="press px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1"
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

/* ── 咨询月报弹窗 ── */
function ConsultingMonthlyReport({ rows, onClose }) {
  const now = new Date()
  const [year,  setYear]  = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [copied,    setCopied]    = useState(false)
  const [aiText,    setAiText]    = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError,   setAiError]   = useState('')
  const [aiProgress, setAiProgress] = useState('')

  function changeDate(y, m) { setYear(y); setMonth(m); setAiText(''); setAiError('') }

  // 按受理日期筛选本月
  const monthRows = useMemo(() => rows.filter(r => {
    const d = fmtDate(r.acceptDate)
    if (!d) return false
    return +d.slice(0, 4) === year && +d.slice(5, 7) === month
  }), [rows, year, month])

  const stats = useMemo(() => {
    const total  = monthRows.length
    const closed = monthRows.filter(r => r.status === 'CLOSE').length
    const open   = monthRows.filter(r => r.status === 'OPEN').length
    const inProc = monthRows.filter(r => r.status === 'IN PROCESS').length
    const closeRate = total > 0 ? Math.round(closed / total * 100) : 0
    // 按类型统计（取前 6）
    const typeMap = {}
    monthRows.forEach(r => { if (r.qType) typeMap[r.qType] = (typeMap[r.qType] ?? 0) + 1 })
    const byType = Object.entries(typeMap).sort(([, a], [, b]) => b - a).slice(0, 6)
    // 按处理人统计
    const handlerMap = {}
    monthRows.forEach(r => { if (r.handler) handlerMap[r.handler] = (handlerMap[r.handler] ?? 0) + 1 })
    const byHandler = Object.entries(handlerMap).sort(([, a], [, b]) => b - a)
    return { total, closed, open, inProc, closeRate, byType, byHandler }
  }, [monthRows])

  function buildText() {
    const lines = [
      `# ${year}年${month}月 咨询赋能台账月报`,
      `生成时间：${new Date().toLocaleString('zh-CN')}`,
      '',
      '## 📊 总览',
      `- 本月受理咨询：${stats.total} 条`,
      `- 已关闭：${stats.closed}  处理中：${stats.inProc}  待处理：${stats.open}`,
      `- 关闭率：${stats.closeRate}%`,
      '',
      '## 🗂️ 问题类型分布',
      ...stats.byType.map(([t, n]) => `- ${t}：${n} 条`),
      '',
      '## 👤 处理人工作量',
      ...stats.byHandler.map(([h, n]) => `- ${h}：${n} 条`),
      '',
      '## 📋 咨询明细（前30条）',
      ...monthRows.slice(0, 30).map(r =>
        `- [${r.status}] ${r.qType ? `【${r.qType}】` : ''}${r.question?.slice(0, 40) ?? '—'}（${r.handler ?? '—'}，${fmtDate(r.acceptDate)}）`
      ),
    ]
    return lines.join('\n')
  }

  async function handleAiSummary() {
    setAiLoading(true); setAiError(''); setAiText(''); setAiProgress('AI 分析中…')
    try {
      const prompt = `你是一位专业的采购管理顾问，请根据以下 ${year} 年 ${month} 月咨询赋能台账数据，生成一份简洁、专业的月度汇报（150～250字）。

## 数据摘要
- 本月受理咨询：${stats.total} 条
- 已关闭：${stats.closed}  处理中：${stats.inProc}  待处理：${stats.open}
- 关闭率：${stats.closeRate}%

## 问题类型分布（前6）
${stats.byType.map(([t, n]) => `  - ${t}：${n} 条`).join('\n')}

## 处理人工作量
${stats.byHandler.map(([h, n]) => `  - ${h}：${n} 条`).join('\n')}

## 要求
1. 语言正式、简洁，适合向领导汇报
2. 点出本月咨询热点和高频问题领域
3. 对关闭率情况给出评价，提出 1～2 条优化建议
4. 最后一行单独注明：（本报告由 AI 辅助生成）`
      setAiText(await callAIChat(prompt))
    } catch (e) {
      setAiError('AI 生成失败：' + e.message)
    } finally {
      setAiLoading(false); setAiProgress('')
    }
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text ?? buildText())
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    } catch { alert('复制失败，请手动选取') }
  }

  const years  = [now.getFullYear() - 1, now.getFullYear()]
  const months = Array.from({ length: 12 }, (_, i) => i + 1)

  return (
    <Modal title="📋 咨询赋能月报" onClose={onClose}>
      <div className="p-5 space-y-4">
        {/* 月份选择 */}
        <div className="flex items-center gap-2">
          <select value={year} onChange={e => changeDate(+e.target.value, month)}
            className="flex-1 px-3 py-1.5 rounded-lg text-sm outline-none"
            style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}>
            {years.map(y => <option key={y}>{y}</option>)}
          </select>
          <select value={month} onChange={e => changeDate(year, +e.target.value)}
            className="flex-1 px-3 py-1.5 rounded-lg text-sm outline-none"
            style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}>
            {months.map(m => <option key={m} value={m}>{m}月</option>)}
          </select>
          <button onClick={() => copyText()}
            className="press flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-sm font-semibold shrink-0"
            style={{
              background: copied ? 'rgba(16,185,129,0.1)' : 'rgba(99,102,241,0.08)',
              color: copied ? '#059669' : '#6366F1',
              border: `1px solid ${copied ? 'rgba(16,185,129,0.2)' : 'rgba(99,102,241,0.15)'}`,
            }}>
            {copied ? <><Check className="w-3.5 h-3.5" />已复制</> : <><Copy className="w-3.5 h-3.5" />复制</>}
          </button>
        </div>

        {monthRows.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-4xl mb-2">📭</p>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>{year}年{month}月暂无咨询数据</p>
          </div>
        ) : (
          <>
            {/* 统计卡片 */}
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: '受理总量', val: stats.total,     clr: '#6366F1' },
                { label: '已关闭',   val: stats.closed,    clr: '#10B981' },
                { label: '处理中',   val: stats.inProc,    clr: '#3B82F6' },
                { label: '待处理',   val: stats.open,      clr: '#F59E0B' },
              ].map(s => (
                <div key={s.label} className="rounded-xl p-3 text-center"
                  style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                  <p className="text-2xl font-bold" style={{ color: s.clr }}>{s.val}</p>
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--muted)' }}>{s.label}</p>
                </div>
              ))}
            </div>

            {/* 关闭率进度条 */}
            <div>
              <div className="flex justify-between text-[11px] mb-1.5" style={{ color: 'var(--muted)' }}>
                <span>关闭率</span><span className="font-semibold" style={{ color: 'var(--text)' }}>{stats.closeRate}%</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface2)' }}>
                <div className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${stats.closeRate}%`, background: 'linear-gradient(90deg,#6366F1,#10B981)' }} />
              </div>
            </div>

            {/* 问题类型 + 处理人 */}
            <div className="grid grid-cols-2 gap-3">
              {/* 问题类型 */}
              <div>
                <p className="text-[11px] font-semibold mb-2" style={{ color: 'var(--muted)' }}>问题类型分布</p>
                <div className="flex flex-col gap-1.5">
                  {stats.byType.map(([t, n]) => {
                    const cfg = Q_TYPE_CFG[t] ?? { color: '#6B7280' }
                    return (
                      <div key={t} className="flex items-center gap-2">
                        <span className="text-[11px] truncate shrink-0" style={{ color: 'var(--muted)', width: '5.5rem' }}>{t}</span>
                        <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface2)' }}>
                          <div className="h-full rounded-full" style={{ width: `${(n / stats.byType[0][1]) * 100}%`, background: cfg.color }} />
                        </div>
                        <span className="text-[11px] w-5 text-right font-semibold shrink-0" style={{ color: 'var(--text)' }}>{n}</span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* 处理人 */}
              <div>
                <p className="text-[11px] font-semibold mb-2" style={{ color: 'var(--muted)' }}>处理人工作量</p>
                <div className="flex flex-col gap-1.5">
                  {stats.byHandler.map(([h, n]) => (
                    <div key={h} className="flex items-center gap-2">
                      <span className="text-[11px] w-12 shrink-0 truncate" style={{ color: 'var(--muted)' }}>{h}</span>
                      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface2)' }}>
                        <div className="h-full rounded-full" style={{ width: `${(n / stats.byHandler[0][1]) * 100}%`, background: '#6366F1' }} />
                      </div>
                      <span className="text-[11px] w-5 text-right font-semibold shrink-0" style={{ color: 'var(--text)' }}>{n}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 咨询明细列表 */}
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
              <div className="px-3 py-2" style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
                <p className="text-[11px] font-semibold" style={{ color: 'var(--muted)' }}>
                  咨询明细（{monthRows.length} 条）
                </p>
              </div>
              <div className="scroll-thin" style={{ maxHeight: 200 }}>
                {monthRows.map(r => {
                  const scfg = STATUS_CFG[r.status] ?? { color: '#6B7280', bg: 'rgba(107,114,128,0.1)' }
                  const tcfg = Q_TYPE_CFG[r.qType]  ?? { color: '#6B7280', bg: 'rgba(107,114,128,0.1)' }
                  return (
                    <div key={r._id} className="flex items-start gap-2 px-3 py-2"
                      style={{ borderTop: '1px solid var(--border)' }}>
                      <span className="text-[11px] shrink-0 px-1.5 py-0.5 rounded font-medium"
                        style={{ color: scfg.color, background: scfg.bg }}>{r.status || '—'}</span>
                      {r.qType && (
                        <span className="text-[10px] shrink-0 px-1.5 py-0.5 rounded"
                          style={{ color: tcfg.color, background: tcfg.bg }}>{r.qType}</span>
                      )}
                      <span className="flex-1 text-xs truncate" style={{ color: 'var(--text)' }}>{r.question || '—'}</span>
                      <span className="text-[11px] shrink-0" style={{ color: 'var(--muted)' }}>{r.handler || ''}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        )}

        {/* AI 一键总结 */}
        {monthRows.length > 0 && (
          <div className="space-y-2">
            <button onClick={handleAiSummary} disabled={aiLoading}
              className="press w-full flex items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-xl disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg,rgba(99,102,241,0.12),rgba(139,92,246,0.12))', color: '#7C3AED', border: '1px solid rgba(139,92,246,0.2)' }}>
              {aiLoading
                ? <><Loader2 className="w-4 h-4 animate-spin" />{aiProgress || 'AI 生成中…'}</>
                : <><Sparkles className="w-4 h-4" />AI 一键总结</>}
            </button>
            {aiError && <p className="text-[12px] text-center" style={{ color: '#F43F5E' }}>{aiError}</p>}
            {aiText && (
              <div className="rounded-xl p-4 space-y-2"
                style={{ background: 'rgba(139,92,246,0.05)', border: '1px solid rgba(139,92,246,0.15)' }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" style={{ color: '#7C3AED' }} />
                    <span className="text-[11px] font-semibold" style={{ color: '#7C3AED' }}>AI 生成汇报</span>
                  </div>
                  <button onClick={() => copyText(aiText)}
                    className="press flex items-center gap-1 text-[11px]" style={{ color: 'var(--muted)' }}>
                    {copied ? <><Check className="w-3 h-3 text-green-500" />已复制</> : <><Copy className="w-3 h-3" />复制</>}
                  </button>
                </div>
                <p className="text-[13px] leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text)' }}>{aiText}</p>
              </div>
            )}
          </div>
        )}

        <button onClick={onClose}
          className="press w-full py-2.5 text-sm font-semibold rounded-xl"
          style={{ background: 'var(--surface2)', color: 'var(--muted)' }}>关闭</button>
      </div>
    </Modal>
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
  const [fyFilter, setFY]     = useState('全部')
  const [filters, setFilters] = useState({ ...INIT_FILTERS })
  const [sortKey, setSortKey] = useState('acceptDate')
  const [sortDir, setSortDir] = useState('desc')
  const [editRow, setEdit]    = useState(null)
  const [viewRow, setView]    = useState(null)
  const [filterOpen, setFilterOpen]   = useState(true)
  const [page, setPage]               = useState(1)
  const [reportOpen, setReportOpen]   = useState(false)

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

  // 按财年筛选（用于图表和统计）
  const fyRows = useMemo(() => {
    if (fyFilter === '全部') return rows
    return rows.filter(r => getFY(r.acceptDate) === Number(fyFilter))
  }, [rows, fyFilter])

  // 处理人颜色映射（基于全量数据，颜色稳定不变）
  const handlerColors = useMemo(() => buildHandlerColors(rows), [rows])

  // 统计卡片数值（基于 fyRows）
  const stats = useMemo(() => ({
    total:     fyRows.length,
    open:      fyRows.filter(r => r.status === 'OPEN').length,
    inProcess: fyRows.filter(r => r.status === 'IN PROCESS').length,
    pending:   fyRows.filter(r => r.status === 'PENDING').length,
    closed:    fyRows.filter(r => r.status === 'CLOSE').length,
  }), [fyRows])

  // 点击统计卡片切换状态筛选
  function toggleStatFilter(status) {
    setFilters(f => ({ ...f, status: f.status === status ? '' : status }))
  }

  // 是否有任何筛选条件生效
  const hasFilters = Object.values(filters).some(v => v !== '')

  // 文本类筛选 debounce（250ms），避免每次击键触发全量重排）
  const dFilters = {
    ...filters,
    contact: useDebounce(filters.contact),
    dept:    useDebounce(filters.dept),
    handler: useDebounce(filters.handler),
    q:       useDebounce(filters.q),
  }
  // 非紧急渲染延迟（让输入框 & 统计卡片先响应，再渲染大表格）
  const deferred = useDeferredValue(dFilters)
  const isStale  = deferred !== dFilters   // 延迟期间显示轻微透明提示

  // 明细筛选（在财年基础上叠加所有筛选器）
  const shown = useMemo(() => {
    let r = fyRows
    if (deferred.qType)  r = r.filter(x => x.qType === deferred.qType)
    if (deferred.qStage) r = r.filter(x => x.qStage === deferred.qStage)
    if (deferred.status) r = r.filter(x => x.status === deferred.status)
    if (deferred.contact) {
      const q = deferred.contact.toLowerCase()
      r = r.filter(x => x.contact?.toLowerCase().includes(q))
    }
    if (deferred.dept) {
      const q = deferred.dept.toLowerCase()
      r = r.filter(x => x.dept?.toLowerCase().includes(q))
    }
    if (deferred.handler) {
      const q = deferred.handler.toLowerCase()
      r = r.filter(x => x.handler?.toLowerCase().includes(q))
    }
    if (deferred.acceptFrom) r = r.filter(x => (fmtDate(x.acceptDate) || '') >= deferred.acceptFrom)
    if (deferred.acceptTo)   r = r.filter(x => (fmtDate(x.acceptDate) || '') <= deferred.acceptTo)
    if (deferred.q) {
      const q = deferred.q.toLowerCase()
      r = r.filter(x => [x.question, x.contact, x.dept, x.handler, x.qStage, x.answer]
        .some(v => v?.toLowerCase().includes(q)))
    }
    return [...r].sort((a, b) => {
      let av = a[sortKey] ?? '', bv = b[sortKey] ?? ''
      if (sortKey === 'acceptDate' || sortKey === 'solveDate') { av = fmtDate(av); bv = fmtDate(bv) }
      const c = String(av).localeCompare(String(bv), 'zh-CN')
      return sortDir === 'asc' ? c : -c
    })
  }, [fyRows, deferred, sortKey, sortDir])

  // 筛选/排序/财年变化时重置到第1页
  useEffect(() => { setPage(1) }, [fyFilter, filters, sortKey, sortDir])

  // 当前页数据
  const totalPages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE))
  const pageRows   = shown.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  async function handleSave(form) {
    if (editRow?._id) await updateRecord(editRow._id, form)
    else await createRecord(form)
    setEdit(null); await load()
  }
  async function handleDelete(row) {
    if (!confirm('确认删除该咨询记录？')) return
    try { await deleteRecord(row._id); setView(null); await load() } catch (e) { alert(e.message) }
  }

  const STAT_CARDS = [
    { label: '累计受理',    value: stats.total,     color: '#6366F1', statusKey: null },
    { label: 'OPEN',       value: stats.open,      color: '#F59E0B', statusKey: 'OPEN' },
    { label: 'IN PROCESS', value: stats.inProcess, color: '#3B82F6', statusKey: 'IN PROCESS' },
    { label: 'PENDING',    value: stats.pending,   color: '#8B5CF6', statusKey: 'PENDING' },
    { label: 'CLOSE',      value: stats.closed,    color: '#10B981', statusKey: 'CLOSE' },
  ]

  return (
    <div className="px-5 py-4 flex flex-col gap-4 animate-page-in">

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
          <button onClick={load} disabled={loading} className="press p-1.5 rounded-lg hover:opacity-70"
            style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
            <RefreshCw className="w-4 h-4"
              style={{ color: 'var(--muted)', animation: loading ? 'spin 1s linear infinite' : '' }} strokeWidth={1.75} />
          </button>
          <button onClick={() => setReportOpen(true)}
            className="press flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium"
            style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}>
            <FileText className="w-4 h-4" strokeWidth={1.75} />月报
          </button>
          <button onClick={() => setEdit(false)}
            className="press flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white"
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
              className="press px-3 py-1 rounded-lg text-xs font-medium transition-all duration-200"
              style={active
                ? { background: '#6366F1', color: '#fff', boxShadow: '0 2px 8px rgba(99,102,241,0.3)' }
                : { background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
              {label}
            </button>
          )
        })}
      </div>

      {/* 统计卡片（AdminPanel 风格，默认高亮累计受理） */}
      <div className="grid grid-cols-5 gap-3">
        {STAT_CARDS.map(s => {
          // 累计受理：无状态筛选时高亮；其他：状态匹配时高亮
          const isActive = s.statusKey === null
            ? filters.status === ''
            : filters.status === s.statusKey
          return (
            <button key={s.label}
              onClick={() => s.statusKey !== null ? toggleStatFilter(s.statusKey) : setFilters(f => ({ ...f, status: '' }))}
              className="press card p-4 text-left w-full"
              style={isActive ? {
                borderColor: s.color,
                boxShadow: `0 0 0 1px ${s.color}33, 0 4px 20px ${s.color}20`,
              } : {}}>
              <div className="flex items-center gap-1.5 mb-2" style={{ color: isActive ? s.color : 'var(--muted)' }}>
                <span className="text-xs font-medium">{s.label}</span>
              </div>
              <p className="text-2xl font-bold tabular-nums" style={{ color: isActive ? s.color : 'var(--text)' }}>
                {s.value}
              </p>
            </button>
          )
        })}
      </div>

      {/* 图表 */}
      {rows.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <TypeChart rows={fyRows} />
          <HandlerChart rows={fyRows} handlerColors={handlerColors} />
          <TrendChart rows={fyRows} />
        </div>
      )}

      {/* 筛选器面板 */}
      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        {/* 筛选器头部 */}
        <button
          onClick={() => setFilterOpen(o => !o)}
          className="w-full flex items-center justify-between px-4 py-2.5 transition-colors hover:opacity-80"
          style={{ borderBottom: filterOpen ? '1px solid var(--border)' : 'none' }}>
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5" style={{ color: hasFilters ? '#6366F1' : 'var(--muted)' }} strokeWidth={1.75} />
            <span className="text-xs font-medium" style={{ color: hasFilters ? '#6366F1' : 'var(--text)' }}>
              筛选器
            </span>
            {hasFilters && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold text-white"
                style={{ background: '#6366F1' }}>
                {Object.values(filters).filter(v => v !== '').length}
              </span>
            )}
            <span className="text-xs" style={{ color: 'var(--muted)' }}>
              共 <span className="font-semibold" style={{ color: 'var(--text)' }}>{shown.length}</span> 条
            </span>
          </div>
          <div className="flex items-center gap-2">
            {hasFilters && (
              <button
                onClick={e => { e.stopPropagation(); setFilters({ ...INIT_FILTERS }) }}
                className="press flex items-center gap-1 text-xs px-2 py-0.5 rounded-md"
                style={{ color: '#6366F1', background: 'rgba(99,102,241,0.08)' }}>
                <RotateCcw className="w-3 h-3" />清空
              </button>
            )}
            {filterOpen
              ? <ChevronUp className="w-4 h-4" style={{ color: 'var(--muted)' }} />
              : <ChevronDown className="w-4 h-4" style={{ color: 'var(--muted)' }} />}
          </div>
        </button>

        {/* 筛选器内容 */}
        {filterOpen && (
          <div className="p-4 grid gap-3 animate-slide-down" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
            {/* 第一行：类型 / 阶段 / 状态 / 关键词 */}
            <div>
              <div className="text-[11px] mb-1 font-medium" style={{ color: 'var(--muted)' }}>问题类型</div>
              <FilterSelect
                value={filters.qType}
                onChange={v => setFilters(f => ({ ...f, qType: v }))}
                options={Q_TYPE_OPTS}
                placeholder="全部类型" />
            </div>
            <div>
              <div className="text-[11px] mb-1 font-medium" style={{ color: 'var(--muted)' }}>问题阶段</div>
              <FilterSelect
                value={filters.qStage}
                onChange={v => setFilters(f => ({ ...f, qStage: v }))}
                options={Q_STAGE_OPTS}
                placeholder="全部阶段" />
            </div>
            <div>
              <div className="text-[11px] mb-1 font-medium" style={{ color: 'var(--muted)' }}>事项状态</div>
              <FilterSelect
                value={filters.status}
                onChange={v => setFilters(f => ({ ...f, status: v }))}
                options={STATUS_OPTS}
                placeholder="全部状态" />
            </div>
            <div>
              <div className="text-[11px] mb-1 font-medium" style={{ color: 'var(--muted)' }}>关键词搜索</div>
              <FilterInput
                value={filters.q}
                onChange={v => setFilters(f => ({ ...f, q: v }))}
                placeholder="问题、建议、部门…"
                icon={Search} />
            </div>

            {/* 第二行：对接人 / 对接部门 / 处理人 / 受理日期范围 */}
            <div>
              <div className="text-[11px] mb-1 font-medium" style={{ color: 'var(--muted)' }}>对接人</div>
              <FilterInput
                value={filters.contact}
                onChange={v => setFilters(f => ({ ...f, contact: v }))}
                placeholder="输入对接人" />
            </div>
            <div>
              <div className="text-[11px] mb-1 font-medium" style={{ color: 'var(--muted)' }}>对接部门</div>
              <FilterInput
                value={filters.dept}
                onChange={v => setFilters(f => ({ ...f, dept: v }))}
                placeholder="输入部门名称" />
            </div>
            <div>
              <div className="text-[11px] mb-1 font-medium" style={{ color: 'var(--muted)' }}>处理人</div>
              <FilterInput
                value={filters.handler}
                onChange={v => setFilters(f => ({ ...f, handler: v }))}
                placeholder="输入处理人" />
            </div>
            <div>
              <div className="text-[11px] mb-1 font-medium" style={{ color: 'var(--muted)' }}>受理日期范围</div>
              <div className="flex items-center gap-1">
                <input type="date" value={filters.acceptFrom}
                  onChange={e => setFilters(f => ({ ...f, acceptFrom: e.target.value }))}
                  className="flex-1 px-2 py-1.5 rounded-lg text-xs outline-none"
                  style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', minWidth: 0 }} />
                <span className="text-[11px] shrink-0" style={{ color: 'var(--muted)' }}>—</span>
                <input type="date" value={filters.acceptTo}
                  onChange={e => setFilters(f => ({ ...f, acceptTo: e.target.value }))}
                  className="flex-1 px-2 py-1.5 rounded-lg text-xs outline-none"
                  style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', minWidth: 0 }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 表格 */}
      <div className="rounded-xl overflow-hidden transition-opacity duration-200" style={{ border: '1px solid var(--border)', opacity: isStale ? 0.6 : 1 }}>
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

        {loading && (
          <div className="flex justify-center py-10">
            <div className="w-5 h-5 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
          </div>
        )}
        {!loading && err && <div className="text-center py-10 text-sm text-red-400">{err}</div>}
        {!loading && !err && shown.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-12">
            <BookOpen className="w-7 h-7" style={{ color: 'var(--muted)' }} strokeWidth={1.25} />
            <p className="text-sm" style={{ color: 'var(--muted)' }}>暂无咨询记录</p>
          </div>
        )}
        {!loading && pageRows.map((row, i) => {
          const hColor = row.handler ? (handlerColors[row.handler] ?? null) : null
          return (
          <div key={row._id}
            className="hover:bg-black/[0.02] dark:hover:bg-white/[0.02] cursor-pointer transition-colors"
            style={{
              display: 'grid', gridTemplateColumns: GRID_TPL,
              padding: '7px 12px', gap: '0 8px', alignItems: 'center',
              borderTop: i === 0 ? 'none' : '1px solid var(--border)',
              borderLeft: hColor ? `3px solid ${hColor}` : '3px solid transparent',
            }}
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
              <button onClick={() => setView(row)} className="press hover:opacity-70"><Eye className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} strokeWidth={1.75} /></button>
              <button onClick={() => setEdit(row)} className="press hover:opacity-70"><Pencil className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} strokeWidth={1.75} /></button>
              {isAdmin && <button onClick={() => handleDelete(row)} className="press hover:opacity-70"><Trash2 className="w-3.5 h-3.5" style={{ color: '#F87171' }} strokeWidth={1.75} /></button>}
            </div>
          </div>
        )})}

        {/* 分页器 */}
        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-2.5" style={{ borderTop: '1px solid var(--border)', background: 'var(--surface2)' }}>
            <span className="text-xs tabular-nums" style={{ color: 'var(--muted)' }}>
              第 {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, shown.length)} 条，共 {shown.length} 条
            </span>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(1)} disabled={page === 1}
                className="press px-2 py-1 rounded text-xs disabled:opacity-30"
                style={{ color: 'var(--muted)', background: 'var(--surface)', border: '1px solid var(--border)' }}>首页</button>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="press px-2 py-1 rounded text-xs disabled:opacity-30"
                style={{ color: 'var(--muted)', background: 'var(--surface)', border: '1px solid var(--border)' }}>‹ 上页</button>
              {/* 页码 */}
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const start = Math.max(1, Math.min(page - 2, totalPages - 4))
                const p = start + i
                return (
                  <button key={p} onClick={() => setPage(p)}
                    className="press w-7 py-1 rounded text-xs tabular-nums"
                    style={p === page
                      ? { background: '#6366F1', color: '#fff', border: '1px solid #6366F1' }
                      : { color: 'var(--muted)', background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    {p}
                  </button>
                )
              })}
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="press px-2 py-1 rounded text-xs disabled:opacity-30"
                style={{ color: 'var(--muted)', background: 'var(--surface)', border: '1px solid var(--border)' }}>下页 ›</button>
              <button onClick={() => setPage(totalPages)} disabled={page === totalPages}
                className="press px-2 py-1 rounded text-xs disabled:opacity-30"
                style={{ color: 'var(--muted)', background: 'var(--surface)', border: '1px solid var(--border)' }}>末页</button>
            </div>
          </div>
        )}
      </div>

      {/* 表格加载中时略微透明，提示数据在更新 */}
      {isStale && !loading && (
        <div className="fixed bottom-4 right-6 text-[11px] px-2.5 py-1 rounded-lg"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)' }}>
          筛选中…
        </div>
      )}

      {reportOpen && <ConsultingMonthlyReport rows={rows} onClose={() => setReportOpen(false)} />}
      {editRow !== null && <EditModal row={editRow || null} onClose={() => setEdit(null)} onSave={handleSave} />}
      {viewRow && <DetailModal row={viewRow} onClose={() => setView(null)}
        onEdit={r => { setView(null); setEdit(r) }} onDelete={handleDelete} isAdmin={isAdmin} />}
    </div>
  )
}
