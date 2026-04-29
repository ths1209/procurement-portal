import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, AlertCircle, Check, Search, RefreshCcw } from 'lucide-react'
import { loadCostLedger, updateCell } from '../lib/teableCostLedger'

/**
 * 成本台账 · 类 Excel 行内编辑
 * 数据源与视图 filter/sort/group/columnMeta 完全由 Teable 服务端决定，本地只做渲染与回写
 */
export default function CostLedger() {
  const [loading, setLoading] = useState(true)
  const [err, setErr]         = useState('')
  const [cols, setCols]       = useState([])
  const [rows, setRows]       = useState([])
  const [kw, setKw]           = useState('')

  // recordId + fieldName → 'saving' | 'ok' | 'err:xxx'
  const [cellState, setCellState] = useState({})

  async function load() {
    setLoading(true); setErr('')
    try {
      const { columns, records } = await loadCostLedger()
      setCols(columns)
      setRows(records)
    } catch(e) {
      setErr(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    if (!kw.trim()) return rows
    const q = kw.trim().toLowerCase()
    return rows.filter(r =>
      Object.values(r.fields).some(v => {
        if (v == null) return false
        if (typeof v === 'string') return v.toLowerCase().includes(q)
        if (typeof v === 'number') return String(v).includes(q)
        if (Array.isArray(v)) return v.some(x => typeof x === 'string' && x.toLowerCase().includes(q))
        return false
      })
    )
  }, [rows, kw])

  async function saveCell(recordId, fieldName, value) {
    const key = `${recordId}::${fieldName}`
    setCellState(s => ({ ...s, [key]: 'saving' }))
    try {
      await updateCell(recordId, fieldName, value)
      setRows(prev => prev.map(r =>
        r.id === recordId ? { ...r, fields: { ...r.fields, [fieldName]: value } } : r
      ))
      setCellState(s => ({ ...s, [key]: 'ok' }))
      setTimeout(() => setCellState(s => {
        if (s[key] !== 'ok') return s
        const { [key]: _, ...rest } = s
        return rest
      }), 1200)
    } catch(e) {
      setCellState(s => ({ ...s, [key]: 'err:' + e.message }))
    }
  }

  return (
    <div className="-m-5 lg:-m-7 h-[calc(100vh-2.5rem)] lg:h-screen flex flex-col">
      {/* 工具条 */}
      <div className="flex items-center gap-3 px-5 py-3"
        style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
        <h2 className="text-[15px] font-semibold" style={{ color: 'var(--text)' }}>成本台账</h2>
        <span className="text-[12px]" style={{ color: 'var(--muted)' }}>
          共 {rows.length} 条 · 已筛选 {filtered.length} 条
        </span>
        <div className="flex-1" />
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted)' }} />
          <input value={kw} onChange={e => setKw(e.target.value)} placeholder="搜索任意字段…"
            className="pl-7 pr-3 py-1.5 text-[13px] rounded-lg outline-none"
            style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', width: 220 }} />
        </div>
        <button onClick={load} disabled={loading}
          className="press flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium disabled:opacity-60"
          style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}>
          <RefreshCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />刷新
        </button>
      </div>

      {/* 错误 */}
      {err && (
        <div className="px-5 py-2 flex items-center gap-2 text-[12px]"
          style={{ background: '#FEF2F2', color: '#B91C1C', borderBottom: '1px solid #FCA5A5' }}>
          <AlertCircle className="w-3.5 h-3.5" />{err}
        </div>
      )}

      {/* 网格 */}
      <div className="flex-1 overflow-auto" style={{ background: 'var(--bg)' }}>
        {loading ? (
          <div className="h-full flex items-center justify-center" style={{ color: 'var(--muted)' }}>
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : (
          <Grid cols={cols} rows={filtered} cellState={cellState} onSave={saveCell} />
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════ Grid ═══════════════════════════
function Grid({ cols, rows, cellState, onSave }) {
  if (cols.length === 0) return null
  const [first, ...rest] = cols

  return (
    <table className="border-separate" style={{ borderSpacing: 0, minWidth: '100%' }}>
      <colgroup>
        <col style={{ width: first.width }} />
        {rest.map(c => <col key={c.id} style={{ width: c.width }} />)}
      </colgroup>
      <thead>
        <tr>
          <HeaderCell col={first} sticky />
          {rest.map(c => <HeaderCell key={c.id} col={c} />)}
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <Row key={r.id} row={r} cols={cols} cellState={cellState} onSave={onSave} />
        ))}
      </tbody>
    </table>
  )
}

function HeaderCell({ col, sticky }) {
  return (
    <th className="text-left text-[11px] font-semibold px-2.5 py-2"
      style={{
        background: 'var(--surface)',
        color: 'var(--text)',
        borderBottom: '1px solid var(--border)',
        borderRight: '1px solid var(--border)',
        position: 'sticky',
        top: 0,
        ...(sticky ? { left: 0, zIndex: 3 } : { zIndex: 2 }),
        whiteSpace: 'nowrap',
      }}
      title={col.description || col.name}>
      <span>{col.name}</span>
      {col.isComputed && <span className="ml-1 text-[9px] opacity-60">(公式)</span>}
    </th>
  )
}

function Row({ row, cols, cellState, onSave }) {
  const [first, ...rest] = cols
  return (
    <tr>
      <Cell col={first} row={row} sticky cellState={cellState} onSave={onSave} />
      {rest.map(c => (
        <Cell key={c.id} col={c} row={row} cellState={cellState} onSave={onSave} />
      ))}
    </tr>
  )
}

// ═══════════════════════════ Cell ═══════════════════════════
function Cell({ col, row, sticky, cellState, onSave }) {
  const value = row.fields[col.name]
  const state = cellState[`${row.id}::${col.name}`]
  const editable = col.kind !== 'readonly'

  const baseStyle = {
    background: sticky ? 'var(--surface)' : 'var(--bg)',
    borderBottom: '1px solid var(--border)',
    borderRight: '1px solid var(--border)',
    ...(sticky ? { position: 'sticky', left: 0, zIndex: 1 } : {}),
  }

  return (
    <td className="p-0 align-top" style={baseStyle}>
      <div className="relative">
        {editable
          ? <Editor col={col} value={value} onSave={v => onSave(row.id, col.name, v)} />
          : <ReadOnlyView col={col} value={value} />
        }
        {state && (
          <div className="absolute top-1 right-1 flex items-center gap-0.5 text-[10px]"
            style={{ color: state === 'ok' ? '#10B981' : state === 'saving' ? '#6366F1' : '#EF4444' }}
            title={state.startsWith('err:') ? state.slice(4) : ''}>
            {state === 'saving' && <Loader2 className="w-3 h-3 animate-spin" />}
            {state === 'ok' && <Check className="w-3 h-3" />}
            {state.startsWith('err:') && <AlertCircle className="w-3 h-3" />}
          </div>
        )}
      </div>
    </td>
  )
}

// ═══════════════════════════ Editors ═══════════════════════════
function Editor({ col, value, onSave }) {
  switch (col.kind) {
    case 'text':
      return <TextEditor value={value ?? ''} onSave={onSave} />
    case 'number':
      return <NumberEditor value={value ?? null} onSave={onSave} />
    case 'singleSelect':
      return <SelectEditor value={value ?? ''} choices={col.options.choices ?? []} onSave={onSave} />
    case 'multipleSelect':
      return <MultiSelectEditor value={value ?? []} choices={col.options.choices ?? []} onSave={onSave} />
    case 'checkbox':
      return <CheckboxEditor value={!!value} onSave={onSave} />
    default:
      return <ReadOnlyView col={col} value={value} />
  }
}

function TextEditor({ value, onSave }) {
  const [v, setV] = useState(value)
  useEffect(() => { setV(value) }, [value])
  return (
    <textarea value={v} onChange={e => setV(e.target.value)}
      onBlur={() => { if (v !== value) onSave(v || null) }}
      rows={1}
      className="w-full px-2 py-1.5 text-[12px] bg-transparent outline-none resize-none focus:bg-indigo-50 dark:focus:bg-indigo-950/30"
      style={{ color: 'var(--text)', minHeight: 28 }}
      onInput={e => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px' }} />
  )
}

function NumberEditor({ value, onSave }) {
  const [v, setV] = useState(value ?? '')
  useEffect(() => { setV(value ?? '') }, [value])
  return (
    <input type="number" value={v} onChange={e => setV(e.target.value)}
      onBlur={() => {
        const parsed = v === '' ? null : Number(v)
        if (parsed !== value) onSave(Number.isNaN(parsed) ? null : parsed)
      }}
      className="w-full px-2 py-1.5 text-[12px] bg-transparent outline-none focus:bg-indigo-50 dark:focus:bg-indigo-950/30"
      style={{ color: 'var(--text)' }} />
  )
}

function SelectEditor({ value, choices, onSave }) {
  return (
    <select value={value ?? ''} onChange={e => onSave(e.target.value || null)}
      className="w-full px-2 py-1.5 text-[12px] bg-transparent outline-none focus:bg-indigo-50 dark:focus:bg-indigo-950/30"
      style={{ color: 'var(--text)' }}>
      <option value="">—</option>
      {choices.map(c => <option key={c.id || c.name} value={c.name}>{c.name}</option>)}
    </select>
  )
}

function MultiSelectEditor({ value, choices, onSave }) {
  const [open, setOpen] = useState(false)
  const arr = Array.isArray(value) ? value : []
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  function toggle(name) {
    const next = arr.includes(name) ? arr.filter(x => x !== name) : [...arr, name]
    onSave(next.length ? next : null)
  }

  return (
    <div ref={ref} className="relative">
      <div onClick={() => setOpen(o => !o)}
        className="min-h-[28px] px-1.5 py-1 cursor-pointer flex flex-wrap gap-1 focus:bg-indigo-50 dark:focus:bg-indigo-950/30">
        {arr.length === 0 && <span className="text-[12px]" style={{ color: 'var(--muted)' }}>—</span>}
        {arr.map(name => {
          const ch = choices.find(c => c.name === name)
          return (
            <span key={name} className="text-[11px] px-1.5 py-0.5 rounded"
              style={{ background: colorToBg(ch?.color), color: 'var(--text)' }}>{name}</span>
          )
        })}
      </div>
      {open && (
        <div className="absolute left-0 top-full mt-1 rounded-lg shadow-lg p-1.5 z-10 max-h-60 overflow-auto w-max min-w-full"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          {choices.map(c => {
            const active = arr.includes(c.name)
            return (
              <div key={c.id || c.name} onClick={() => toggle(c.name)}
                className="flex items-center gap-2 px-2 py-1 rounded cursor-pointer text-[12px] hover:bg-black/5 dark:hover:bg-white/5">
                <input type="checkbox" checked={active} readOnly className="pointer-events-none" />
                <span className="px-1.5 py-0.5 rounded" style={{ background: colorToBg(c.color), color: 'var(--text)' }}>{c.name}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function CheckboxEditor({ value, onSave }) {
  return (
    <div className="flex items-center justify-center py-1.5">
      <input type="checkbox" checked={value} onChange={e => onSave(e.target.checked)} />
    </div>
  )
}

// ═══════════════════════════ Readonly Renderers ═══════════════════════════
function ReadOnlyView({ col, value }) {
  if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) {
    return <div className="px-2 py-1.5 text-[12px]" style={{ color: 'var(--muted)' }}>—</div>
  }
  if (col.type === 'attachment' && Array.isArray(value)) {
    return (
      <div className="px-2 py-1.5 flex flex-col gap-0.5">
        {value.map(f => (
          <a key={f.id} href={f.presignedUrl} target="_blank" rel="noopener noreferrer"
            className="text-[11px] underline truncate" style={{ color: '#6366F1' }} title={f.name}>
            📎 {f.name}
          </a>
        ))}
      </div>
    )
  }
  if (col.type === 'link' && Array.isArray(value)) {
    return <div className="px-2 py-1.5 text-[12px]" style={{ color: 'var(--text)' }}>
      {value.map(v => v.title || v.id).join(' / ')}
    </div>
  }
  if (col.type === 'link' && typeof value === 'object') {
    return <div className="px-2 py-1.5 text-[12px]" style={{ color: 'var(--text)' }}>{value.title || value.id}</div>
  }
  if (typeof value === 'number') {
    const fmt = col.options?.formatting
    let text = String(value)
    if (fmt?.type === 'percent') text = (value * 100).toFixed(fmt.precision ?? 2) + '%'
    else if (fmt?.type === 'decimal') text = value.toLocaleString('en-US', { minimumFractionDigits: fmt.precision ?? 2, maximumFractionDigits: fmt.precision ?? 2 })
    return <div className="px-2 py-1.5 text-[12px] tabular-nums" style={{ color: 'var(--text)' }}>{text}</div>
  }
  if (Array.isArray(value)) {
    return <div className="px-2 py-1.5 text-[12px]" style={{ color: 'var(--text)' }}>{value.join(' / ')}</div>
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return <div className="px-2 py-1.5 text-[12px]" style={{ color: 'var(--text)' }}>{value.slice(0, 10)}</div>
  }
  return <div className="px-2 py-1.5 text-[12px] whitespace-pre-wrap" style={{ color: 'var(--text)' }}>{String(value)}</div>
}

// Teable 选项色 → 轻量背景
function colorToBg(color) {
  if (!color) return 'rgba(99,102,241,0.12)'
  const map = {
    redLight2:     '#FEE2E2',
    orangeLight2:  '#FFEDD5',
    yellowLight2:  '#FEF3C7',
    greenLight2:   '#D1FAE5',
    tealLight2:    '#CCFBF1',
    cyanLight2:    '#CFFAFE',
    blueLight2:    '#DBEAFE',
    purpleLight2:  '#EDE9FE',
    pinkLight2:    '#FCE7F3',
    grayLight2:    '#F3F4F6',
    yellowLight1:  '#FEF9C3',
    red:           '#FECACA',
    orange:        '#FED7AA',
    yellow:        '#FDE68A',
    green:         '#A7F3D0',
    teal:          '#99F6E4',
    tealBright:    '#5EEAD4',
    blue:          '#BFDBFE',
    purple:        '#DDD6FE',
    pink:          '#FBCFE8',
    gray:          '#E5E7EB',
  }
  return map[color] ?? 'rgba(99,102,241,0.12)'
}
