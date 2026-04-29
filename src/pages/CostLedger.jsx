import { useEffect, useMemo, useRef, useState, useCallback, Fragment } from 'react'
import { Loader2, AlertCircle, Check, Search, RefreshCcw, Wallet, ChevronDown, ChevronRight, Rows3, ArrowUpDown, Filter, Layers } from 'lucide-react'
import {
  loadView, updateCell, pillColors, formatNumber, looksLikeCurrency,
  VIEW_TABS, OPERATOR_LABELS, formatFilterValue,
} from '../lib/teableCostLedger'

const WIDTH_LS_KEY  = 'cost_ledger_widths_v1'
const HEIGHT_LS_KEY = 'cost_ledger_rowheight_v1'

const ROW_HEIGHTS = [
  { id: 'compact',  label: '紧凑', px: 32 },
  { id: 'normal',   label: '标准', px: 44 },
  { id: 'loose',    label: '宽松', px: 64 },
  { id: 'extra',    label: '超宽', px: 96 },
]

function loadLS(key, fallback) { try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback } catch { return fallback } }
function saveLS(key, v) { try { localStorage.setItem(key, JSON.stringify(v)) } catch {} }

export default function CostLedger() {
  const [activeView, setActiveView] = useState(VIEW_TABS[0].id)
  const [cache, setCache]           = useState({})
  const [kw, setKw]                 = useState('')
  const [cellState, setCellState]   = useState({})
  const [rowHeights, setRowHeights] = useState(() => loadLS(HEIGHT_LS_KEY, {}))
  const [collapsed, setCollapsed]   = useState({})  // { viewId: { groupKey: true } }
  const widthsRef                   = useRef(loadLS(WIDTH_LS_KEY, {}))

  const data = cache[activeView]
  const rowHeightId = rowHeights[activeView] ?? 'normal'
  const rowHeightPx = (ROW_HEIGHTS.find(r => r.id === rowHeightId) ?? ROW_HEIGHTS[1]).px

  const load = useCallback(async (viewId) => {
    setCache(c => ({ ...c, [viewId]: { ...(c[viewId] ?? {}), loading: true, err: '' } }))
    try {
      const resp = await loadView(viewId)
      const savedForView = widthsRef.current[viewId] ?? {}
      const mergedCols = resp.columns.map(c => savedForView[c.id] ? { ...c, width: savedForView[c.id] } : c)
      setCache(c => ({ ...c, [viewId]: { ...resp, columns: mergedCols, loading: false, err: '' } }))
    } catch(e) {
      setCache(c => ({ ...c, [viewId]: { columns: [], records: [], sorts: [], filters: [], group: null, headerLines: 1, loading: false, err: e.message } }))
    }
  }, [])

  useEffect(() => { if (!cache[activeView]) load(activeView) }, [activeView, cache, load])

  function setColumnWidth(viewId, colId, width) {
    setCache(c => {
      const v = c[viewId]; if (!v) return c
      return { ...c, [viewId]: { ...v, columns: v.columns.map(col => col.id === colId ? { ...col, width } : col) } }
    })
    widthsRef.current = { ...widthsRef.current, [viewId]: { ...(widthsRef.current[viewId] ?? {}), [colId]: width } }
    saveLS(WIDTH_LS_KEY, widthsRef.current)
  }

  function setRowHeight(id) {
    const next = { ...rowHeights, [activeView]: id }
    setRowHeights(next); saveLS(HEIGHT_LS_KEY, next)
  }

  function toggleGroup(key) {
    setCollapsed(c => ({ ...c, [activeView]: { ...(c[activeView] ?? {}), [key]: !(c[activeView]?.[key]) } }))
  }

  async function saveCell(recordId, fieldName, value) {
    const key = `${recordId}::${fieldName}`
    setCellState(s => ({ ...s, [key]: 'saving' }))
    try {
      await updateCell(recordId, fieldName, value)
      setCache(c => {
        const v = c[activeView]; if (!v) return c
        return { ...c, [activeView]: { ...v, records: v.records.map(r => r.id === recordId ? { ...r, fields: { ...r.fields, [fieldName]: value } } : r) } }
      })
      setCellState(s => ({ ...s, [key]: 'ok' }))
      setTimeout(() => setCellState(s => { if (s[key] !== 'ok') return s; const { [key]: _, ...rest } = s; return rest }), 1200)
    } catch(e) {
      setCellState(s => ({ ...s, [key]: 'err:' + e.message }))
      setTimeout(() => setCellState(s => { const cur = s[key]; if (!cur || !cur.startsWith('err')) return s; const { [key]: _, ...rest } = s; return rest }), 4000)
    }
  }

  const rows     = data?.records ?? []
  const columns  = data?.columns ?? []
  const sorts    = data?.sorts   ?? []
  const filters  = data?.filters ?? []
  const group    = data?.group   ?? null
  const headerLines = data?.headerLines ?? 1

  const filtered = useMemo(() => {
    if (!kw.trim()) return rows
    const q = kw.trim().toLowerCase()
    return rows.filter(r => Object.values(r.fields).some(v => {
      if (v == null) return false
      if (typeof v === 'string') return v.toLowerCase().includes(q)
      if (typeof v === 'number') return String(v).includes(q)
      if (Array.isArray(v)) return v.some(x => typeof x === 'string' && x.toLowerCase().includes(q))
      return false
    }))
  }, [rows, kw])

  // 按 group 字段聚合
  const grouped = useMemo(() => {
    if (!group) return [{ key: '__all__', value: null, rows: filtered, hasHeader: false }]
    const out = []
    let cur = null
    for (const r of filtered) {
      const v = r.fields[group.fieldName]
      const key = Array.isArray(v) ? v.join(',') : String(v ?? '')
      if (!cur || cur.key !== key) { cur = { key, value: v, rows: [], hasHeader: true }; out.push(cur) }
      cur.rows.push(r)
    }
    return out
  }, [filtered, group])

  const activeTab = VIEW_TABS.find(v => v.id === activeView)
  const collapsedMap = collapsed[activeView] ?? {}

  return (
    <div className="-m-5 lg:-m-7 h-[calc(100vh-2.5rem)] lg:h-screen flex flex-col" style={{ background: 'var(--bg)' }}>
      {/* 顶栏 */}
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
        <RowHeightPicker value={rowHeightId} onChange={setRowHeight} />
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
              className="press flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12.5px] font-medium whitespace-nowrap transition-all"
              style={active
                ? { background: 'var(--text)', color: 'var(--bg)' }
                : { background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
              <span style={{ fontSize: 10 }}>{v.emoji}</span>{v.name}
            </button>
          )
        })}
      </div>

      {/* Sort / Filter / Group 指示条 */}
      <ViewConfigBar sorts={sorts} filters={filters} group={group} conjunction={data?.filterConjunction} />

      {/* 错误 */}
      {data?.err && (
        <div className="mx-6 mb-3 px-4 py-2.5 rounded-xl flex items-center gap-2 text-[12px]"
          style={{ background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FCA5A5' }}>
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />{data.err}
        </div>
      )}

      {/* 表格 */}
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
          <Grid cols={columns} grouped={grouped} group={group}
            headerLines={headerLines} rowHeightPx={rowHeightPx} collapsedMap={collapsedMap}
            cellState={cellState}
            onSave={saveCell}
            onResize={(colId, w) => setColumnWidth(activeView, colId, w)}
            onToggleGroup={toggleGroup} />
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════ 顶部配置指示 ═══════════════════════════
function ViewConfigBar({ sorts, filters, group, conjunction }) {
  const [openFilters, setOpenFilters] = useState(false)
  if (sorts.length === 0 && filters.length === 0 && !group) return null

  return (
    <div className="px-6 pb-3 flex items-center gap-2 flex-wrap text-[11.5px]">
      {group && (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg"
          style={{ background: 'rgba(139,92,246,0.08)', color: '#7C3AED' }}>
          <Layers className="w-3 h-3" /> 分组：{group.fieldName}
        </span>
      )}
      {sorts.length > 0 && (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg"
          style={{ background: 'rgba(99,102,241,0.08)', color: '#4F46E5' }}>
          <ArrowUpDown className="w-3 h-3" /> 排序：
          {sorts.map((s, i) => (
            <span key={s.fieldId}>{i > 0 && '，'}{s.fieldName} {s.order === 'asc' ? '↑' : '↓'}</span>
          ))}
        </span>
      )}
      {filters.length > 0 && (
        <div className="relative">
          <button onClick={() => setOpenFilters(o => !o)}
            className="press inline-flex items-center gap-1 px-2.5 py-1 rounded-lg"
            style={{ background: 'rgba(16,185,129,0.08)', color: '#047857' }}>
            <Filter className="w-3 h-3" /> 筛选 {filters.length} 条
            <ChevronDown className="w-3 h-3" />
          </button>
          {openFilters && (
            <div className="absolute left-0 top-full mt-1 rounded-xl shadow-lg p-2 z-20 min-w-[280px]"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="text-[10px] mb-1.5 uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
                规则（{conjunction === 'or' ? '任一满足' : '全部满足'}）
              </div>
              {filters.map((f, i) => (
                <div key={i} className="px-2 py-1.5 text-[11.5px] flex items-center gap-1.5 flex-wrap"
                  style={{ color: 'var(--text)' }}>
                  <span className="font-medium">{f.fieldName}</span>
                  <span style={{ color: 'var(--muted)' }}>{OPERATOR_LABELS[f.operator] ?? f.operator}</span>
                  <span className="font-mono">{formatFilterValue(f.value)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function RowHeightPicker({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])
  const cur = ROW_HEIGHTS.find(r => r.id === value) ?? ROW_HEIGHTS[1]
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)}
        className="press flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-medium transition-colors"
        style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}>
        <Rows3 className="w-3.5 h-3.5" />行高：{cur.label}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 rounded-xl shadow-lg p-1 z-20 min-w-[120px]"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          {ROW_HEIGHTS.map(r => (
            <div key={r.id} onClick={() => { onChange(r.id); setOpen(false) }}
              className="px-3 py-1.5 rounded-lg cursor-pointer text-[12px] flex items-center justify-between hover:bg-black/5 dark:hover:bg-white/5"
              style={{ color: 'var(--text)' }}>
              <span>{r.label}</span>
              {r.id === value && <Check className="w-3 h-3" style={{ color: '#6366F1' }} />}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════ Grid ═══════════════════════════
function Grid({ cols, grouped, group, headerLines, rowHeightPx, collapsedMap, cellState, onSave, onResize, onToggleGroup }) {
  const [first, ...rest] = cols
  const headerMinH = Math.max(44, headerLines * 18 + 20)

  return (
    <div className="flex-1 overflow-auto">
      <table className="border-separate" style={{ borderSpacing: 0, minWidth: '100%' }}>
        <colgroup>
          <col style={{ width: first.width }} />
          {rest.map(c => <col key={c.id} style={{ width: c.width }} />)}
        </colgroup>
        <thead>
          <tr>
            <HeaderCell col={first} sticky onResize={onResize} lines={headerLines} minH={headerMinH} />
            {rest.map(c => <HeaderCell key={c.id} col={c} onResize={onResize} lines={headerLines} minH={headerMinH} />)}
          </tr>
        </thead>
        <tbody>
          {grouped.map(g => {
            const isCollapsed = g.hasHeader && collapsedMap[g.key]
            const rowsToRender = isCollapsed ? [] : g.rows
            return (
              <Fragment key={g.key}>
                {g.hasHeader && (
                  <GroupHeader group={group} gData={g} colSpan={cols.length}
                    isCollapsed={isCollapsed} onToggle={() => onToggleGroup(g.key)} cols={cols} />
                )}
                {rowsToRender.map((r, i) => (
                  <Row key={r.id} row={r} cols={cols} idx={i} rowHeightPx={rowHeightPx}
                    cellState={cellState} onSave={onSave} />
                ))}
              </Fragment>
            )
          })}
          {grouped.every(g => g.rows.length === 0) && (
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

function HeaderCell({ col, sticky, onResize, lines, minH }) {
  const startResize = (e) => {
    e.preventDefault(); e.stopPropagation()
    const startX = e.clientX, startW = col.width
    function onMove(ev) { onResize(col.id, Math.max(80, startW + (ev.clientX - startX))) }
    function onUp() { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); document.body.style.cursor = '' }
    document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp); document.body.style.cursor = 'col-resize'
  }
  return (
    <th className="text-left px-3 py-2 font-semibold text-[11.5px] tracking-wide"
      style={{
        background: 'var(--surface2)',
        color: 'var(--text)',
        borderBottom: '1px solid var(--border)',
        position: 'sticky', top: 0,
        ...(sticky ? { left: 0, zIndex: 3 } : { zIndex: 2 }),
        verticalAlign: 'top', minHeight: minH, height: minH,
      }}
      title={col.description || col.name}>
      <div className="flex items-start gap-1.5 select-none" style={{ minHeight: minH - 16 }}>
        <span style={{
          display: '-webkit-box',
          WebkitLineClamp: lines, WebkitBoxOrient: 'vertical',
          overflow: 'hidden', wordBreak: 'break-word', lineHeight: 1.4,
        }}>{col.name}</span>
        {col.isComputed && <span className="text-[9px] opacity-50 shrink-0">ƒ</span>}
      </div>
      <div onMouseDown={startResize}
        className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-indigo-400/40 active:bg-indigo-400/70" />
    </th>
  )
}

function GroupHeader({ group, gData, colSpan, isCollapsed, onToggle, cols }) {
  // 计算数字列的统计
  const stats = useMemo(() => {
    const numCols = cols.filter(c => c.kind === 'number' || (c.isComputed && c.type === 'formula'))
    const result = {}
    for (const c of numCols) {
      let sum = 0, count = 0
      for (const r of gData.rows) {
        const v = r.fields[c.name]
        if (typeof v === 'number') { sum += v; count++ }
      }
      if (count > 0) result[c.name] = { sum, count }
    }
    return result
  }, [gData.rows, cols])

  // 选一个主要金额字段展示
  const showStatKey = Object.keys(stats).find(n => looksLikeCurrency(n))
  const showStat = showStatKey ? stats[showStatKey] : null

  let label = gData.value
  if (Array.isArray(label)) label = label.join(' / ')
  const groupChoice = (cols.find(c => c.name === group.fieldName)?.options?.choices ?? []).find(ch => ch.name === label)
  const colors = groupChoice ? pillColors(groupChoice.color) : null

  return (
    <tr>
      <td colSpan={colSpan}
        className="px-4 py-2 cursor-pointer select-none"
        onClick={onToggle}
        style={{
          background: 'linear-gradient(90deg, rgba(99,102,241,0.06), rgba(99,102,241,0) 60%)',
          borderBottom: '1px solid var(--border)',
          borderTop: '1px solid var(--border)',
          position: 'sticky', left: 0,
        }}>
        <div className="flex items-center gap-2 text-[12px]">
          {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          <span className="font-semibold" style={{ color: 'var(--muted)' }}>{group.fieldName}：</span>
          {colors ? (
            <span className="px-2 py-0.5 rounded-md text-[11.5px] font-medium" style={{ background: colors.bg, color: colors.fg }}>
              {label || '（空）'}
            </span>
          ) : (
            <span className="font-semibold" style={{ color: 'var(--text)' }}>{label || '（空）'}</span>
          )}
          <span className="text-[11px] px-1.5 py-0.5 rounded"
            style={{ background: 'var(--surface2)', color: 'var(--muted)' }}>
            {gData.rows.length} 条
          </span>
          {showStat && (
            <span className="ml-auto text-[11px] tabular-nums" style={{ color: 'var(--muted)' }}>
              {showStatKey} 求和：<span className="font-semibold" style={{ color: 'var(--text)' }}>
                ¥{showStat.sum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </span>
          )}
        </div>
      </td>
    </tr>
  )
}

function Row({ row, cols, idx, rowHeightPx, cellState, onSave }) {
  const [first, ...rest] = cols
  const rowBg = idx % 2 === 0 ? 'var(--surface)' : 'var(--surface2)'
  return (
    <tr className="group">
      <Cell col={first} row={row} sticky rowBg={rowBg} rowHeightPx={rowHeightPx} cellState={cellState} onSave={onSave} />
      {rest.map(c => (
        <Cell key={c.id} col={c} row={row} rowBg={rowBg} rowHeightPx={rowHeightPx} cellState={cellState} onSave={onSave} />
      ))}
    </tr>
  )
}

// ═══════════════════════════ Cell ═══════════════════════════
function Cell({ col, row, sticky, rowBg, rowHeightPx, cellState, onSave }) {
  const value = row.fields[col.name]
  const state = cellState[`${row.id}::${col.name}`]
  const [editing, setEditing] = useState(false)
  const editable = col.kind !== 'readonly' && !col.isComputed
  const numeric = col.kind === 'number' || (col.type === 'formula' && typeof value === 'number')

  const baseStyle = {
    background: rowBg,
    borderBottom: '1px solid var(--border)',
    borderRight: '1px solid var(--border)',
    ...(sticky ? { position: 'sticky', left: 0, zIndex: 1 } : {}),
    minWidth: 0,
    height: rowHeightPx,
  }

  const handleStartEdit = () => { if (editable && !editing) setEditing(true) }
  const handleDoneEdit  = (newVal) => {
    setEditing(false)
    if (newVal !== undefined && !deepEqual(newVal, value)) onSave(row.id, col.name, newVal)
  }

  return (
    <td className="p-0 align-top group-hover:[&]:brightness-[0.98] relative"
      style={baseStyle} onClick={handleStartEdit}>
      <div className={`relative ${editable ? 'cursor-text' : ''} ${numeric ? 'text-right' : ''}`}
        style={{ height: '100%', maxHeight: rowHeightPx, overflow: 'auto' }}>
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
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => x === b[i])
  return false
}

// ═══════════════════════════ Display ═══════════════════════════
function CellDisplay({ col, value, numeric }) {
  if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) {
    return <div className="px-3 py-2 text-[12.5px]" style={{ color: 'var(--muted)' }}>—</div>
  }
  if (col.type === 'attachment' && Array.isArray(value)) {
    return (
      <div className="px-3 py-2 flex flex-col gap-1">
        {value.map(f => (
          <a key={f.id} href={f.presignedUrl} target="_blank" rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="text-[11.5px] truncate inline-flex items-center gap-1 hover:underline"
            style={{ color: '#6366F1' }} title={f.name}>
            📎 {f.name}
          </a>
        ))}
      </div>
    )
  }
  if (col.type === 'link') {
    const arr = Array.isArray(value) ? value : [value]
    return (
      <div className="px-3 py-2 flex flex-wrap gap-1">
        {arr.map((v, i) => (
          <span key={i} className="text-[11.5px] px-2 py-0.5 rounded-md"
            style={{ background: 'rgba(99,102,241,0.08)', color: '#4F46E5' }}>🔗 {v.title || v.id}</span>
        ))}
      </div>
    )
  }
  if (col.type === 'singleSelect' && typeof value === 'string') {
    const choice = (col.options.choices ?? []).find(c => c.name === value)
    const { bg, fg } = pillColors(choice?.color)
    return <div className="px-3 py-2"><span className="inline-flex items-center px-2 py-0.5 rounded-md text-[12px] font-medium" style={{ background: bg, color: fg }}>{value}</span></div>
  }
  if (col.type === 'multipleSelect' && Array.isArray(value)) {
    return (
      <div className="px-3 py-2 flex flex-wrap gap-1">
        {value.map(name => {
          const choice = (col.options.choices ?? []).find(c => c.name === name)
          const { bg, fg } = pillColors(choice?.color)
          return <span key={name} className="inline-flex items-center px-2 py-0.5 rounded-md text-[11.5px] font-medium" style={{ background: bg, color: fg }}>{name}</span>
        })}
      </div>
    )
  }
  if (typeof value === 'number') {
    let text = formatNumber(value, col.options)
    if (!col.options?.formatting && looksLikeCurrency(col.name)) {
      text = '¥' + value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    } else if (col.options?.formatting?.type === 'decimal' && looksLikeCurrency(col.name)) {
      text = '¥' + text
    }
    return <div className="px-3 py-2 text-[12.5px] tabular-nums font-medium" style={{ color: 'var(--text)' }}>{text}</div>
  }
  if (typeof value === 'boolean') return <div className="px-3 py-2 text-[13px]">{value ? '✓' : ''}</div>
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return <div className="px-3 py-2 text-[12.5px]" style={{ color: 'var(--text)' }}>{value.slice(0, 10)}</div>
  }
  if (Array.isArray(value)) return <div className="px-3 py-2 text-[12.5px]" style={{ color: 'var(--text)' }}>{value.join(' / ')}</div>
  return <div className={`px-3 py-2 text-[12.5px] ${numeric ? '' : 'break-words'}`} style={{ color: 'var(--text)', lineHeight: 1.5 }}>{String(value)}</div>
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
      onBlur={() => { if (v === '' || v === null) { onDone(null); return } const n = Number(v); onDone(Number.isNaN(n) ? null : n) }}
      onKeyDown={e => {
        if (e.key === 'Escape') { e.preventDefault(); onDone(undefined) }
        if (e.key === 'Enter') { e.preventDefault(); e.target.blur() }
      }}
      className="w-full px-3 py-2 text-[12.5px] text-right tabular-nums bg-white dark:bg-slate-900 outline-none"
      style={{ color: 'var(--text)', border: '2px solid #6366F1', borderRadius: 6 }} />
  )
}

function SingleSelectEditor({ value, choices, onDone }) {
  const ref = useRef(null)
  useEffect(() => {
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) onDone(undefined) }
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
              <span className="inline-block px-2 py-0.5 rounded-md text-[12px] font-medium" style={{ background: bg, color: fg }}>{c.name}</span>
            </div>
          )
        })}
      </div>
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
              <span className="inline-block px-2 py-0.5 rounded-md text-[12px] font-medium" style={{ background: bg, color: fg }}>{c.name}</span>
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
