import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { Loader2, AlertCircle, Check, Search, RefreshCcw, Wallet, ChevronDown } from 'lucide-react'
import { loadView, updateCell, pillColors, formatNumber, looksLikeCurrency, VIEW_TABS } from '../lib/teableCostLedger'

const WIDTH_LS_KEY = 'cost_ledger_widths_v1'

function loadWidths() {
  try { return JSON.parse(localStorage.getItem(WIDTH_LS_KEY) || '{}') } catch { return {} }
}
function saveWidths(map) {
  try { localStorage.setItem(WIDTH_LS_KEY, JSON.stringify(map)) } catch {}
}

export default function CostLedger() {
  const [activeView, setActiveView] = useState(VIEW_TABS[0].id)
  const [cache, setCache]           = useState({})   // viewId → { columns, rows, loading, err }
  const [kw, setKw]                 = useState('')
  const [cellState, setCellState]   = useState({})   // recordId::field → saving|ok|err:xxx
  const widthsRef                   = useRef(loadWidths())

  const data = cache[activeView]

  const load = useCallback(async (viewId) => {
    setCache(c => ({ ...c, [viewId]: { ...(c[viewId] ?? {}), loading: true, err: '' } }))
    try {
      const { columns, records } = await loadView(viewId)
      // 应用持久化的列宽覆写
      const savedForView = widthsRef.current[viewId] ?? {}
      const mergedCols = columns.map(c => savedForView[c.id] ? { ...c, width: savedForView[c.id] } : c)
      setCache(c => ({ ...c, [viewId]: { columns: mergedCols, rows: records, loading: false, err: '' } }))
    } catch(e) {
      setCache(c => ({ ...c, [viewId]: { columns: [], rows: [], loading: false, err: e.message } }))
    }
  }, [])

  useEffect(() => { if (!cache[activeView]) load(activeView) }, [activeView, cache, load])

  function setColumnWidth(viewId, colId, width) {
    setCache(c => {
      const v = c[viewId]
      if (!v) return c
      return { ...c, [viewId]: { ...v, columns: v.columns.map(col => col.id === colId ? { ...col, width } : col) } }
    })
    widthsRef.current = { ...widthsRef.current, [viewId]: { ...(widthsRef.current[viewId] ?? {}), [colId]: width } }
    saveWidths(widthsRef.current)
  }

  async function saveCell(recordId, fieldName, value) {
    const key = `${recordId}::${fieldName}`
    setCellState(s => ({ ...s, [key]: 'saving' }))
    try {
      await updateCell(recordId, fieldName, value)
      setCache(c => {
        const v = c[activeView]
        if (!v) return c
        return { ...c, [activeView]: { ...v, rows: v.rows.map(r => r.id === recordId ? { ...r, fields: { ...r.fields, [fieldName]: value } } : r) } }
      })
      setCellState(s => ({ ...s, [key]: 'ok' }))
      setTimeout(() => setCellState(s => {
        if (s[key] !== 'ok') return s
        const { [key]: _, ...rest } = s
        return rest
      }), 1200)
    } catch(e) {
      setCellState(s => ({ ...s, [key]: 'err:' + e.message }))
      setTimeout(() => setCellState(s => {
        const cur = s[key]
        if (!cur || !cur.startsWith('err')) return s
        const { [key]: _, ...rest } = s
        return rest
      }), 3000)
    }
  }

  const rows    = data?.rows ?? []
  const columns = data?.columns ?? []

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

  const activeTab = VIEW_TABS.find(v => v.id === activeView)

  return (
    <div className="-m-5 lg:-m-7 h-[calc(100vh-2.5rem)] lg:h-screen flex flex-col" style={{ background: 'var(--bg)' }}>
      {/* 顶栏：标题 + 操作 */}
      <header className="px-6 pt-5 pb-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg,#6366F1,#8B5CF6)' }}>
          <Wallet className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-[17px] font-bold leading-tight" style={{ color: 'var(--text)' }}>成本台账</h1>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--muted)' }}>
            {activeTab?.name} · 共 {rows.length} 条{kw.trim() && ` · 筛选 ${filtered.length} 条`}
          </p>
        </div>
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted)' }} />
          <input value={kw} onChange={e => setKw(e.target.value)} placeholder="搜索任意字段…"
            className="pl-7 pr-3 py-2 text-[13px] rounded-xl outline-none transition-colors focus:border-indigo-400"
            style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', width: 240 }} />
        </div>
        <button onClick={() => load(activeView)} disabled={data?.loading}
          className="press flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-medium disabled:opacity-60 transition-colors"
          style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}>
          <RefreshCcw className={`w-3.5 h-3.5 ${data?.loading ? 'animate-spin' : ''}`} />刷新
        </button>
      </header>

      {/* 视图 Tabs */}
      <div className="px-6 pb-3 flex items-center gap-1.5 overflow-x-auto">
        {VIEW_TABS.map(v => {
          const active = v.id === activeView
          return (
            <button key={v.id} onClick={() => setActiveView(v.id)}
              className={`press flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12.5px] font-medium whitespace-nowrap transition-all`}
              style={active ? {
                background: 'var(--text)',
                color: 'var(--bg)',
              } : {
                background: 'var(--surface)',
                color: 'var(--muted)',
                border: '1px solid var(--border)',
              }}>
              <span style={{ fontSize: 10 }}>{v.emoji}</span>
              {v.name}
            </button>
          )
        })}
      </div>

      {/* 错误条 */}
      {data?.err && (
        <div className="mx-6 mb-3 px-4 py-2.5 rounded-xl flex items-center gap-2 text-[12px]"
          style={{ background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FCA5A5' }}>
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />{data.err}
        </div>
      )}

      {/* 网格卡片 */}
      <div className="flex-1 mx-6 mb-6 rounded-2xl overflow-hidden flex flex-col"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        {data?.loading ? (
          <div className="flex-1 flex items-center justify-center" style={{ color: 'var(--muted)' }}>
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : columns.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-[13px]" style={{ color: 'var(--muted)' }}>
            暂无数据
          </div>
        ) : (
          <Grid cols={columns} rows={filtered} cellState={cellState}
            onSave={saveCell}
            onResize={(colId, w) => setColumnWidth(activeView, colId, w)} />
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════ Grid ═══════════════════════════
function Grid({ cols, rows, cellState, onSave, onResize }) {
  const [first, ...rest] = cols

  return (
    <div className="flex-1 overflow-auto">
      <table className="border-separate" style={{ borderSpacing: 0, minWidth: '100%' }}>
        <colgroup>
          <col style={{ width: first.width }} />
          {rest.map(c => <col key={c.id} style={{ width: c.width }} />)}
        </colgroup>
        <thead>
          <tr>
            <HeaderCell col={first} sticky onResize={onResize} />
            {rest.map(c => <HeaderCell key={c.id} col={c} onResize={onResize} />)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <Row key={r.id} row={r} cols={cols} idx={i} cellState={cellState} onSave={onSave} />
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={cols.length} className="text-center py-12 text-[12px]"
                style={{ color: 'var(--muted)' }}>没有匹配的记录</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function HeaderCell({ col, sticky, onResize }) {
  const startResize = (e) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startW = col.width
    function onMove(ev) {
      const w = Math.max(80, startW + (ev.clientX - startX))
      onResize(col.id, w)
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    document.body.style.cursor = 'col-resize'
  }

  return (
    <th className="text-left px-3 py-2.5 font-semibold text-[11.5px] tracking-wide"
      style={{
        background: 'var(--surface2)',
        color: 'var(--text)',
        borderBottom: '1px solid var(--border)',
        position: 'sticky',
        top: 0,
        ...(sticky ? { left: 0, zIndex: 3 } : { zIndex: 2 }),
        whiteSpace: 'nowrap',
      }}
      title={col.description || col.name}>
      <div className="flex items-center gap-1.5 select-none">
        <span className="truncate" style={{ maxWidth: col.width - 24 }}>{col.name}</span>
        {col.isComputed && <span className="text-[9px] opacity-50">ƒ</span>}
      </div>
      <div onMouseDown={startResize}
        className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-indigo-400/40 active:bg-indigo-400/70" />
    </th>
  )
}

function Row({ row, cols, idx, cellState, onSave }) {
  const [first, ...rest] = cols
  const rowBg = idx % 2 === 0 ? 'var(--surface)' : 'var(--surface2)'
  return (
    <tr className="group">
      <Cell col={first} row={row} sticky rowBg={rowBg} cellState={cellState} onSave={onSave} />
      {rest.map(c => (
        <Cell key={c.id} col={c} row={row} rowBg={rowBg} cellState={cellState} onSave={onSave} />
      ))}
    </tr>
  )
}

// ═══════════════════════════ Cell ═══════════════════════════
function Cell({ col, row, sticky, rowBg, cellState, onSave }) {
  const value = row.fields[col.name]
  const state = cellState[`${row.id}::${col.name}`]
  const [editing, setEditing] = useState(false)
  const editable = col.kind !== 'readonly' && !col.isComputed
  const numeric = col.kind === 'number' || (col.type === 'formula' && typeof value === 'number')

  const baseStyle = {
    background: sticky ? rowBg : rowBg,
    borderBottom: '1px solid var(--border)',
    borderRight: '1px solid var(--border)',
    ...(sticky ? { position: 'sticky', left: 0, zIndex: 1 } : {}),
    minWidth: 0,
  }

  const handleStartEdit = () => { if (editable) setEditing(true) }
  const handleDoneEdit  = (newVal) => {
    setEditing(false)
    if (newVal !== undefined && !deepEqual(newVal, value)) {
      onSave(row.id, col.name, newVal)
    }
  }

  return (
    <td className="p-0 align-top group-hover:[&]:brightness-[0.98] relative"
      style={baseStyle}
      onClick={handleStartEdit}>
      <div className={`relative ${editable ? 'cursor-text' : ''} ${numeric ? 'text-right' : ''}`}
        style={{ minHeight: 36 }}>
        {editing
          ? <Editor col={col} value={value} onDone={handleDoneEdit} />
          : <CellDisplay col={col} value={value} numeric={numeric} />
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

function deepEqual(a, b) {
  if (a === b) return true
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => x === b[i])
  }
  return false
}

// ═══════════════════════════ Display ═══════════════════════════
function CellDisplay({ col, value, numeric }) {
  if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) {
    return <div className="px-3 py-2 text-[12.5px]" style={{ color: 'var(--muted)' }}>—</div>
  }

  // 附件
  if (col.type === 'attachment' && Array.isArray(value)) {
    return (
      <div className="px-3 py-2 flex flex-col gap-1">
        {value.slice(0, 3).map(f => (
          <a key={f.id} href={f.presignedUrl} target="_blank" rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="text-[11.5px] truncate inline-flex items-center gap-1 hover:underline"
            style={{ color: '#6366F1' }} title={f.name}>
            📎 {f.name}
          </a>
        ))}
        {value.length > 3 && <span className="text-[10px]" style={{ color: 'var(--muted)' }}>还有 {value.length - 3} 个</span>}
      </div>
    )
  }

  // 关联
  if (col.type === 'link') {
    const arr = Array.isArray(value) ? value : [value]
    return (
      <div className="px-3 py-2 flex flex-wrap gap-1">
        {arr.map((v, i) => (
          <span key={i} className="text-[11.5px] px-2 py-0.5 rounded-md"
            style={{ background: 'rgba(99,102,241,0.08)', color: '#4F46E5' }}>
            🔗 {v.title || v.id}
          </span>
        ))}
      </div>
    )
  }

  // 单选 pill
  if (col.type === 'singleSelect' && typeof value === 'string') {
    const choice = (col.options.choices ?? []).find(c => c.name === value)
    const { bg, fg } = pillColors(choice?.color)
    return (
      <div className="px-3 py-2">
        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[12px] font-medium"
          style={{ background: bg, color: fg }}>{value}</span>
      </div>
    )
  }

  // 多选 pills
  if (col.type === 'multipleSelect' && Array.isArray(value)) {
    return (
      <div className="px-3 py-2 flex flex-wrap gap-1">
        {value.map(name => {
          const choice = (col.options.choices ?? []).find(c => c.name === name)
          const { bg, fg } = pillColors(choice?.color)
          return (
            <span key={name} className="inline-flex items-center px-2 py-0.5 rounded-md text-[11.5px] font-medium"
              style={{ background: bg, color: fg }}>{name}</span>
          )
        })}
      </div>
    )
  }

  // 数字 / 公式
  if (typeof value === 'number') {
    let text = formatNumber(value, col.options)
    if (!col.options?.formatting && looksLikeCurrency(col.name)) {
      text = '¥' + value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    } else if (col.options?.formatting?.type === 'decimal' && looksLikeCurrency(col.name)) {
      text = '¥' + text
    }
    return <div className="px-3 py-2 text-[12.5px] tabular-nums font-medium" style={{ color: 'var(--text)' }}>{text}</div>
  }

  // 勾选
  if (typeof value === 'boolean') {
    return <div className="px-3 py-2 text-[13px]">{value ? '✓' : ''}</div>
  }

  // ISO 日期字符串
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return <div className="px-3 py-2 text-[12.5px]" style={{ color: 'var(--text)' }}>{value.slice(0, 10)}</div>
  }

  // 数组兜底
  if (Array.isArray(value)) {
    return <div className="px-3 py-2 text-[12.5px]" style={{ color: 'var(--text)' }}>{value.join(' / ')}</div>
  }

  // 文本
  const str = String(value)
  return (
    <div className={`px-3 py-2 text-[12.5px] ${numeric ? '' : 'break-words'}`}
      style={{ color: 'var(--text)', lineHeight: 1.5 }}>
      {str}
    </div>
  )
}

// ═══════════════════════════ Editors ═══════════════════════════
function Editor({ col, value, onDone }) {
  switch (col.kind) {
    case 'text':           return <TextEditor value={value ?? ''} onDone={onDone} />
    case 'number':         return <NumberEditor value={value ?? ''} onDone={onDone} />
    case 'singleSelect':   return <SingleSelectEditor value={value ?? ''} choices={col.options.choices ?? []} onDone={onDone} />
    case 'multipleSelect': return <MultiSelectEditor value={Array.isArray(value) ? value : []} choices={col.options.choices ?? []} onDone={onDone} />
    case 'checkbox':       return <CheckboxEditor value={!!value} onDone={onDone} />
    default:               return <CellDisplay col={col} value={value} />
  }
}

function TextEditor({ value, onDone }) {
  const [v, setV] = useState(value)
  const ref = useRef(null)
  useEffect(() => { ref.current?.focus(); ref.current?.select?.() }, [])
  return (
    <textarea ref={ref} value={v} onChange={e => setV(e.target.value)}
      onBlur={() => onDone(v === '' ? null : v)}
      onKeyDown={e => {
        if (e.key === 'Escape') { e.preventDefault(); onDone(undefined) }
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.target.blur() }
      }}
      rows={1}
      className="w-full px-3 py-2 text-[12.5px] bg-white dark:bg-slate-900 outline-none resize-none"
      style={{ color: 'var(--text)', minHeight: 36, border: '2px solid #6366F1', borderRadius: 6, lineHeight: 1.5 }}
      onInput={e => { e.target.style.height = 'auto'; e.target.style.height = Math.max(36, e.target.scrollHeight) + 'px' }} />
  )
}

function NumberEditor({ value, onDone }) {
  const [v, setV] = useState(value === null ? '' : value)
  const ref = useRef(null)
  useEffect(() => { ref.current?.focus(); ref.current?.select?.() }, [])
  return (
    <input ref={ref} type="number" value={v} onChange={e => setV(e.target.value)}
      onBlur={() => {
        if (v === '' || v === null) { onDone(null); return }
        const n = Number(v); onDone(Number.isNaN(n) ? null : n)
      }}
      onKeyDown={e => {
        if (e.key === 'Escape') { e.preventDefault(); onDone(undefined) }
        if (e.key === 'Enter') { e.preventDefault(); e.target.blur() }
      }}
      className="w-full px-3 py-2 text-[12.5px] text-right tabular-nums bg-white dark:bg-slate-900 outline-none"
      style={{ color: 'var(--text)', border: '2px solid #6366F1', borderRadius: 6 }} />
  )
}

function SingleSelectEditor({ value, choices, onDone }) {
  const [open, setOpen] = useState(true)
  const ref = useRef(null)

  useEffect(() => {
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); onDone(undefined) } }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [onDone])

  return (
    <div ref={ref} className="relative">
      <div className="px-3 py-2 text-[12.5px] flex items-center justify-between"
        style={{ border: '2px solid #6366F1', borderRadius: 6, background: 'white' }}>
        {value
          ? (() => { const c = choices.find(x => x.name === value); const { bg, fg } = pillColors(c?.color); return <span className="px-2 py-0.5 rounded-md font-medium" style={{ background: bg, color: fg }}>{value}</span> })()
          : <span style={{ color: 'var(--muted)' }}>请选择…</span>}
        <ChevronDown className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
      </div>
      {open && (
        <div className="absolute left-0 top-full mt-1 rounded-lg shadow-lg p-1 z-20 max-h-60 overflow-auto w-max min-w-full"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div onClick={() => onDone(null)}
            className="px-3 py-1.5 rounded-md cursor-pointer text-[12px] hover:bg-black/5 dark:hover:bg-white/5"
            style={{ color: 'var(--muted)' }}>清除</div>
          {choices.map(c => {
            const { bg, fg } = pillColors(c.color)
            return (
              <div key={c.id || c.name} onClick={() => onDone(c.name)}
                className="px-2 py-1 rounded-md cursor-pointer hover:bg-black/5 dark:hover:bg-white/5">
                <span className="inline-block px-2 py-0.5 rounded-md text-[12px] font-medium"
                  style={{ background: bg, color: fg }}>{c.name}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function MultiSelectEditor({ value, choices, onDone }) {
  const [sel, setSel] = useState(value)
  const ref = useRef(null)

  useEffect(() => {
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) onDone(sel.length ? sel : null) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [sel, onDone])

  function toggle(name) { setSel(s => s.includes(name) ? s.filter(x => x !== name) : [...s, name]) }

  return (
    <div ref={ref} className="relative">
      <div className="px-2 py-1.5 flex flex-wrap gap-1 min-h-[36px] items-start"
        style={{ border: '2px solid #6366F1', borderRadius: 6, background: 'white' }}>
        {sel.length === 0 && <span className="text-[12px] self-center" style={{ color: 'var(--muted)' }}>请选择…</span>}
        {sel.map(name => {
          const c = choices.find(x => x.name === name); const { bg, fg } = pillColors(c?.color)
          return <span key={name} className="px-2 py-0.5 rounded-md text-[11.5px] font-medium" style={{ background: bg, color: fg }}>{name}</span>
        })}
      </div>
      <div className="absolute left-0 top-full mt-1 rounded-lg shadow-lg p-1 z-20 max-h-60 overflow-auto w-max min-w-full"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        {choices.map(c => {
          const active = sel.includes(c.name); const { bg, fg } = pillColors(c.color)
          return (
            <div key={c.id || c.name} onClick={() => toggle(c.name)}
              className="flex items-center gap-2 px-2 py-1 rounded-md cursor-pointer hover:bg-black/5 dark:hover:bg-white/5">
              <input type="checkbox" checked={active} readOnly className="pointer-events-none" />
              <span className="inline-block px-2 py-0.5 rounded-md text-[12px] font-medium"
                style={{ background: bg, color: fg }}>{c.name}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CheckboxEditor({ value, onDone }) {
  return (
    <div className="flex items-center justify-center py-2">
      <input type="checkbox" checked={value} onChange={e => onDone(e.target.checked)} />
    </div>
  )
}
