import { useMemo, useState, useRef, useEffect, useCallback } from 'react'
import {
  Search, Loader2, AlertCircle, RefreshCcw, Check, ChevronDown, ChevronRight,
  FileText, Hash, List, Paperclip, Lock, Calendar, Info, Sparkles, ArrowLeft,
} from 'lucide-react'
import { pillColors, formatNumber, looksLikeCurrency, VIEW_TABS } from '../lib/teableCostLedger'
import { TIER, guideFor, splitFieldsByTier, isFilled, tierProgress, TIME_REQUIREMENTS } from '../lib/costLedgerGuide'

/**
 * 成本台账 · 项目填报模式
 * props:
 *   activeView / data / loading / err / kw / setKw
 *   onReload / onSave / cellState
 */
export default function CostLedgerFill({
  activeView, data, loading, err, kw, setKw,
  onReload, onSave, cellState,
}) {
  const rows    = data?.records ?? []
  const columns = data?.columns ?? []
  const [selectedId, setSelectedId] = useState(null)
  const [mobileDetail, setMobileDetail] = useState(false)  // 移动端展示详情

  // 过滤项目
  const filtered = useMemo(() => {
    if (!kw.trim()) return rows
    const q = kw.trim().toLowerCase()
    return rows.filter(r => Object.values(r.fields).some(v => {
      if (typeof v === 'string') return v.toLowerCase().includes(q)
      if (typeof v === 'number') return String(v).includes(q)
      if (Array.isArray(v)) return v.some(x => typeof x === 'string' && x.toLowerCase().includes(q))
      return false
    }))
  }, [rows, kw])

  // 默认选中第一条
  useEffect(() => {
    if (filtered.length > 0 && !filtered.find(r => r.id === selectedId)) {
      setSelectedId(filtered[0].id)
    }
  }, [filtered, selectedId])

  const selected = filtered.find(r => r.id === selectedId) ?? null
  const groups = useMemo(() => splitFieldsByTier(columns), [columns])

  return (
    <div className="flex-1 mx-6 mb-6 rounded-2xl overflow-hidden flex min-h-0"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>

      {/* 左栏：项目列表 */}
      <aside
        className={`${mobileDetail ? 'hidden' : 'flex'} lg:flex flex-col shrink-0 w-full lg:w-[340px]`}
        style={{ borderRight: '1px solid var(--border)', background: 'var(--surface2)' }}>

        <div className="px-4 pt-4 pb-3 flex items-center gap-2" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted)' }} />
            <input value={kw} onChange={e => setKw(e.target.value)} placeholder="搜索项目..."
              className="w-full pl-7 pr-3 py-1.5 text-[12.5px] rounded-lg outline-none transition-colors focus:border-indigo-400"
              style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }} />
          </div>
          <button onClick={onReload} disabled={loading}
            className="press shrink-0 p-1.5 rounded-lg disabled:opacity-60 transition-colors"
            style={{ background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }}
            title="刷新">
            <RefreshCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="px-4 py-2 text-[10.5px] uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
          共 {filtered.length} 个项目
        </div>

        <div className="flex-1 overflow-auto px-3 pb-4 space-y-1.5">
          {loading && rows.length === 0 && (
            <div className="flex items-center justify-center py-10" style={{ color: 'var(--muted)' }}>
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
          )}
          {filtered.length === 0 && !loading && (
            <div className="text-center py-10 text-[12px]" style={{ color: 'var(--muted)' }}>
              {kw.trim() ? '没有匹配的项目' : '暂无项目'}
            </div>
          )}
          {filtered.map(rec => (
            <ProjectCard key={rec.id} record={rec} columns={columns} groups={groups}
              active={rec.id === selectedId}
              onClick={() => { setSelectedId(rec.id); setMobileDetail(true) }} />
          ))}
        </div>
      </aside>

      {/* 右栏：项目详情填报 */}
      <section className={`${mobileDetail ? 'flex' : 'hidden'} lg:flex flex-col flex-1 min-w-0`}>
        {err && (
          <div className="m-4 px-4 py-2.5 rounded-xl flex items-center gap-2 text-[12px]"
            style={{ background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FCA5A5' }}>
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />{err}
          </div>
        )}
        {loading && !selected && (
          <div className="flex-1 flex items-center justify-center" style={{ color: 'var(--muted)' }}>
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        )}
        {!loading && !selected && (
          <div className="flex-1 flex items-center justify-center text-[13px]" style={{ color: 'var(--muted)' }}>
            从左侧选择一个项目开始填报
          </div>
        )}
        {selected && (
          <ProjectDetail
            record={selected} columns={columns} groups={groups}
            activeView={activeView} cellState={cellState}
            onSave={(fieldName, value) => onSave(selected.id, fieldName, value)}
            onBack={() => setMobileDetail(false)} />
        )}
      </section>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// 项目卡片
// ═══════════════════════════════════════════════════════════════════
function ProjectCard({ record, columns, groups, active, onClick }) {
  const title = deriveTitle(record, columns)
  const subtitle = deriveSubtitle(record, columns)
  const amount = deriveAmount(record, columns)
  const coreP = tierProgress(groups.core, record)
  const reqP  = tierProgress(groups.required, record)

  const coreColor = coreP.filled === coreP.total ? '#10B981' : coreP.filled > 0 ? '#F59E0B' : '#EF4444'

  return (
    <button onClick={onClick}
      className="press w-full text-left px-3 py-2.5 rounded-xl transition-all relative flex flex-col gap-1.5"
      style={{
        background: active ? 'var(--surface)' : 'transparent',
        border: active ? '1px solid #6366F1' : '1px solid transparent',
        boxShadow: active ? '0 2px 8px rgba(99,102,241,0.12)' : 'none',
      }}>
      {active && (
        <div className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r"
          style={{ background: '#6366F1' }} />
      )}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] font-semibold leading-snug line-clamp-2"
            style={{ color: active ? 'var(--text)' : 'var(--text)' }}>
            {title || '（未命名）'}
          </div>
          {subtitle && (
            <div className="text-[10.5px] mt-1 truncate" style={{ color: 'var(--muted)' }}>
              {subtitle}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {amount != null && (
          <span className="text-[11px] font-semibold tabular-nums" style={{ color: '#6366F1' }}>
            ¥{amount.toLocaleString('en-US', { maximumFractionDigits: 0 })}
          </span>
        )}
        <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md font-medium"
          style={{ background: coreColor + '1A', color: coreColor }}>
          核心 {coreP.filled}/{coreP.total}
        </span>
        {reqP.total > 0 && (
          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md"
            style={{ background: 'var(--surface2)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
            2.28 {reqP.filled}/{reqP.total}
          </span>
        )}
      </div>
    </button>
  )
}

// ═══════════════════════════════════════════════════════════════════
// 项目详情填报
// ═══════════════════════════════════════════════════════════════════
function ProjectDetail({ record, columns, groups, activeView, cellState, onSave, onBack }) {
  const tab = VIEW_TABS.find(v => v.id === activeView)
  const title = deriveTitle(record, columns)
  const subtitle = deriveSubtitle(record, columns)
  const amount = deriveAmount(record, columns)

  const coreP = tierProgress(groups.core, record)
  const reqP  = tierProgress(groups.required, record)
  const optP  = tierProgress(groups.optional, record)
  const total = coreP.total + reqP.total + optP.total
  const done  = coreP.filled + reqP.filled + optP.filled
  const pct   = total > 0 ? Math.round(done / total * 100) : 0

  return (
    <div className="flex-1 overflow-auto">
      {/* 项目头卡 */}
      <div className="px-6 lg:px-8 pt-6 pb-5"
        style={{ background: 'linear-gradient(180deg, rgba(99,102,241,0.06), transparent)' }}>
        <button onClick={onBack}
          className="lg:hidden press flex items-center gap-1 text-[12px] mb-3 px-2 py-1 rounded-lg"
          style={{ background: 'var(--surface2)', color: 'var(--muted)' }}>
          <ArrowLeft className="w-3 h-3" />返回列表
        </button>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-lg"
            style={{ background: tab?.accent || '#6366F1' }}>
            <span>{tab?.emoji}</span>
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-[17px] font-bold leading-tight" style={{ color: 'var(--text)' }}>
              {title || '（未命名项目）'}
            </h2>
            <div className="text-[11.5px] mt-1 flex items-center gap-2 flex-wrap" style={{ color: 'var(--muted)' }}>
              <span>{tab?.name}</span>
              {subtitle && <><span>·</span><span>{subtitle}</span></>}
              {amount != null && (
                <><span>·</span><span className="font-semibold tabular-nums" style={{ color: '#6366F1' }}>
                  ¥{amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                </span></>
              )}
            </div>
          </div>
        </div>

        {/* 进度条 */}
        <div className="mt-5">
          <div className="flex items-center justify-between mb-1.5 text-[11px]" style={{ color: 'var(--muted)' }}>
            <span>填报进度 · {done}/{total}</span>
            <span className="font-semibold" style={{ color: 'var(--text)' }}>{pct}%</span>
          </div>
          <SegmentedProgress core={coreP} required={reqP} optional={optP} />
          <div className="flex items-center gap-3 mt-2 text-[10.5px]" style={{ color: 'var(--muted)' }}>
            <LegendDot color={TIER.CORE.color} label={`核心 ${coreP.filled}/${coreP.total}`} />
            <LegendDot color={TIER.REQUIRED.color} label={`2.28口径 ${reqP.filled}/${reqP.total}`} />
            <LegendDot color={TIER.OPTIONAL.color} label={`选填 ${optP.filled}/${optP.total}`} />
          </div>
        </div>
      </div>

      <div className="px-6 lg:px-8 pb-10 space-y-5">
        <TierSection tier={TIER.CORE} fields={groups.core} record={record}
          cellState={cellState} onSave={onSave} defaultOpen />
        <TierSection tier={TIER.REQUIRED} fields={groups.required} record={record}
          cellState={cellState} onSave={onSave} defaultOpen />
        <TierSection tier={TIER.OPTIONAL} fields={groups.optional} record={record}
          cellState={cellState} onSave={onSave} />
        <SystemSection fields={groups.system} record={record} />
        <TimeRequirements />
      </div>
    </div>
  )
}

function SegmentedProgress({ core, required, optional }) {
  const total = core.total + required.total + optional.total
  if (total === 0) return <div className="h-2 rounded-full" style={{ background: 'var(--surface2)' }} />
  const pieces = [
    { total: core.total,     filled: core.filled,     color: TIER.CORE.color },
    { total: required.total, filled: required.filled, color: TIER.REQUIRED.color },
    { total: optional.total, filled: optional.filled, color: TIER.OPTIONAL.color },
  ]
  return (
    <div className="h-2 rounded-full overflow-hidden flex" style={{ background: 'var(--surface2)' }}>
      {pieces.map((p, i) => (
        p.total > 0 && (
          <div key={i} className="relative" style={{ flex: p.total, background: 'transparent' }}>
            <div className="absolute inset-y-0 left-0 transition-all"
              style={{ width: `${(p.filled / p.total) * 100}%`, background: p.color }} />
          </div>
        )
      ))}
    </div>
  )
}

function LegendDot({ color, label }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  )
}

// ═══════════════════════════════════════════════════════════════════
// 分组区块
// ═══════════════════════════════════════════════════════════════════
function TierSection({ tier, fields, record, cellState, onSave, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  if (fields.length === 0) return null
  const p = tierProgress(fields, record)

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <button onClick={() => setOpen(o => !o)}
        className="w-full px-5 py-3.5 flex items-center gap-3 transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.02]">
        <div className="w-1 h-6 rounded-full" style={{ background: tier.color }} />
        <div className="flex-1 text-left flex items-center gap-2">
          <span className="text-[14px] font-semibold" style={{ color: 'var(--text)' }}>
            {tier.label}
          </span>
          {tier.stars && <span className="text-[11px]" style={{ color: tier.color }}>{tier.stars}</span>}
          <span className="text-[11px] px-2 py-0.5 rounded-md ml-1"
            style={{ background: tier.bg, color: tier.color, fontWeight: 600 }}>
            {p.filled}/{p.total}
          </span>
        </div>
        {open ? <ChevronDown className="w-4 h-4" style={{ color: 'var(--muted)' }} />
              : <ChevronRight className="w-4 h-4" style={{ color: 'var(--muted)' }} />}
      </button>
      {open && (
        <div className="px-5 pb-5 pt-1 space-y-4" style={{ borderTop: '1px solid var(--border)' }}>
          {fields.map(({ col, guide }) => (
            <FieldCard key={col.id} col={col} guide={guide} tier={tier}
              value={record.fields[col.name]}
              state={cellState[`${record.id}::${col.name}`]}
              onSave={val => onSave(col.name, val)} />
          ))}
        </div>
      )}
    </div>
  )
}

function SystemSection({ fields, record }) {
  const [open, setOpen] = useState(false)
  if (fields.length === 0) return null
  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
      <button onClick={() => setOpen(o => !o)}
        className="w-full px-5 py-3 flex items-center gap-3 hover:bg-black/[0.02] dark:hover:bg-white/[0.02]">
        <Lock className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
        <span className="text-[13px] font-semibold flex-1 text-left" style={{ color: 'var(--muted)' }}>
          系统字段 · 寻源单据带出
        </span>
        <span className="text-[10.5px] px-2 py-0.5 rounded-md"
          style={{ background: 'var(--surface)', color: 'var(--muted)' }}>
          {fields.length} 项
        </span>
        {open ? <ChevronDown className="w-4 h-4" style={{ color: 'var(--muted)' }} />
              : <ChevronRight className="w-4 h-4" style={{ color: 'var(--muted)' }} />}
      </button>
      {open && (
        <div className="px-5 pb-4 pt-2 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2.5"
          style={{ borderTop: '1px solid var(--border)' }}>
          {fields.map(({ col }) => (
            <SystemFieldRow key={col.id} col={col} value={record.fields[col.name]} />
          ))}
        </div>
      )}
    </div>
  )
}

function SystemFieldRow({ col, value }) {
  return (
    <div className="flex items-start gap-2 py-1">
      <div className="text-[11px] w-28 shrink-0 pt-0.5" style={{ color: 'var(--muted)' }}>
        {col.name}
      </div>
      <div className="text-[12px] flex-1 min-w-0" style={{ color: 'var(--text)' }}>
        <ReadonlyValue col={col} value={value} />
      </div>
    </div>
  )
}

function ReadonlyValue({ col, value }) {
  if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) {
    return <span style={{ color: 'var(--muted)' }}>—</span>
  }
  if (col.type === 'attachment' && Array.isArray(value)) {
    return (
      <div className="flex flex-wrap gap-1">
        {value.map(f => (
          <a key={f.id} href={f.presignedUrl} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md hover:underline"
            style={{ background: 'rgba(99,102,241,0.08)', color: '#6366F1' }}>
            <Paperclip className="w-3 h-3" />{f.name}
          </a>
        ))}
      </div>
    )
  }
  if (col.type === 'singleSelect' && typeof value === 'string') {
    const choice = (col.options?.choices ?? []).find(c => c.name === value)
    const { bg, fg } = pillColors(choice?.color)
    return <span className="inline-block px-2 py-0.5 rounded-md text-[11px] font-medium" style={{ background: bg, color: fg }}>{value}</span>
  }
  if (col.type === 'multipleSelect' && Array.isArray(value)) {
    return (
      <div className="flex flex-wrap gap-1">
        {value.map(name => {
          const choice = (col.options?.choices ?? []).find(c => c.name === name)
          const { bg, fg } = pillColors(choice?.color)
          return <span key={name} className="px-2 py-0.5 rounded-md text-[11px] font-medium" style={{ background: bg, color: fg }}>{name}</span>
        })}
      </div>
    )
  }
  if (typeof value === 'number') {
    let text = formatNumber(value, col.options)
    if (!col.options?.formatting && looksLikeCurrency(col.name)) {
      text = '¥' + value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    }
    return <span className="font-medium tabular-nums">{text}</span>
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return <span>{value.slice(0, 10)}</span>
  }
  if (Array.isArray(value)) return <span>{value.join(' / ')}</span>
  return <span className="break-words">{String(value)}</span>
}

// ═══════════════════════════════════════════════════════════════════
// 字段填报卡
// ═══════════════════════════════════════════════════════════════════
function FieldCard({ col, guide, tier, value, state, onSave }) {
  const filled = isFilled(col, value)
  const kindIcon = kindIconFor(col)
  const refValue = guide?.referenceField  // 系统参考字段（不从 record 取，仅展示名字占位）

  return (
    <div className="rounded-xl transition-colors" style={{
      background: 'var(--surface2)',
      border: '1px solid var(--border)',
    }}>
      {/* 字段头 */}
      <div className="px-4 pt-3 pb-2 flex items-start gap-3">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: filled ? '#10B98118' : tier.bg, color: filled ? '#10B981' : tier.color }}>
          {filled ? <Check className="w-3.5 h-3.5" /> : kindIcon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>
              {col.name}
            </span>
            {tier.id !== 'optional' && (
              <span className="text-[10px] leading-none px-1.5 py-0.5 rounded"
                style={{ background: tier.bg, color: tier.color, fontWeight: 700 }}>必填</span>
            )}
            <span className="text-[10px] leading-none px-1.5 py-0.5 rounded"
              style={{ background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
              {kindLabel(col)}
            </span>
          </div>
          {guide?.hint && (
            <div className="text-[11.5px] mt-1 leading-relaxed" style={{ color: 'var(--muted)' }}>
              {guide.hint}
            </div>
          )}
        </div>
        <SaveBadge state={state} />
      </div>

      {/* 填写逻辑 / 公式 / 注意 */}
      {(guide?.rules || guide?.formula || guide?.note || refValue) && (
        <div className="mx-4 mb-3 rounded-lg px-3 py-2 text-[11px] leading-relaxed space-y-1.5"
          style={{ background: 'var(--surface)', border: '1px dashed var(--border)', color: 'var(--muted)' }}>
          {guide?.rules?.map((r, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <span style={{ color: tier.color }}>·</span><span>{r}</span>
            </div>
          ))}
          {guide?.formula && (
            <div className="flex items-start gap-1.5">
              <span style={{ color: tier.color }}>ƒ</span>
              <span className="font-mono text-[10.5px] break-all" style={{ color: 'var(--text)' }}>
                {guide.formula}
              </span>
            </div>
          )}
          {refValue && (
            <div className="flex items-start gap-1.5">
              <Info className="w-3 h-3 mt-0.5 shrink-0" />
              <span>可参考列 <span className="font-semibold" style={{ color: 'var(--text)' }}>{refValue}</span>（系统自动提取）</span>
            </div>
          )}
          {guide?.note && (
            <div className="flex items-start gap-1.5">
              <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" style={{ color: '#F59E0B' }} />
              <span>{guide.note}</span>
            </div>
          )}
        </div>
      )}

      {/* 输入控件 */}
      <div className="px-4 pb-4">
        <FieldInput col={col} value={value} onSave={onSave} />
      </div>
    </div>
  )
}

function SaveBadge({ state }) {
  if (!state) return null
  if (state === 'saving') return <span className="inline-flex items-center gap-1 text-[10.5px]" style={{ color: '#6366F1' }}>
    <Loader2 className="w-3 h-3 animate-spin" />保存中
  </span>
  if (state === 'ok') return <span className="inline-flex items-center gap-1 text-[10.5px]" style={{ color: '#10B981' }}>
    <Check className="w-3 h-3" />已保存
  </span>
  if (state.startsWith('err:')) return <span className="inline-flex items-center gap-1 text-[10.5px]" style={{ color: '#EF4444' }} title={state.slice(4)}>
    <AlertCircle className="w-3 h-3" />保存失败
  </span>
  return null
}

// ═══════════════════════════════════════════════════════════════════
// 输入控件
// ═══════════════════════════════════════════════════════════════════
function FieldInput({ col, value, onSave }) {
  const editable = !col.isComputed && col.kind !== 'readonly'
  if (!editable) {
    return (
      <div className="px-3 py-2 rounded-lg text-[12px]"
        style={{ background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
        <ReadonlyValue col={col} value={value} />
      </div>
    )
  }
  switch (col.kind) {
    case 'text':           return <TextInput col={col} value={value} onSave={onSave} />
    case 'number':         return <NumberInput col={col} value={value} onSave={onSave} />
    case 'singleSelect':   return <SingleSelectInput col={col} value={value} onSave={onSave} />
    case 'multipleSelect': return <MultiSelectInput col={col} value={value} onSave={onSave} />
    case 'checkbox':       return <CheckboxInput col={col} value={value} onSave={onSave} />
    default:               return <ReadonlyValue col={col} value={value} />
  }
}

function TextInput({ col, value, onSave }) {
  const [v, setV] = useState(value ?? '')
  useEffect(() => { setV(value ?? '') }, [value])
  const commit = () => {
    const next = v === '' ? null : v
    if (!shallowEqual(next, value ?? null)) onSave(next)
  }
  const multiline = col.type === 'longText' || (v || '').length > 40
  if (multiline) {
    return (
      <textarea value={v} onChange={e => setV(e.target.value)} onBlur={commit}
        placeholder="请输入..." rows={3}
        className="field resize-y"
        style={{ minHeight: 80, lineHeight: 1.5 }} />
    )
  }
  return (
    <input value={v} onChange={e => setV(e.target.value)} onBlur={commit}
      placeholder="请输入..." className="field" />
  )
}

function NumberInput({ col, value, onSave }) {
  const [v, setV] = useState(value == null ? '' : String(value))
  useEffect(() => { setV(value == null ? '' : String(value)) }, [value])
  const currency = looksLikeCurrency(col.name)
  const commit = () => {
    if (v === '' || v == null) { if (value != null) onSave(null); return }
    const n = Number(v)
    if (Number.isNaN(n)) return
    if (n !== value) onSave(n)
  }
  const precision = col.options?.formatting?.precision ?? 2
  const preview = value != null && !Number.isNaN(Number(v))
    ? formatNumber(Number(v), col.options)
    : null

  return (
    <div className="space-y-1.5">
      <div className="relative">
        {currency && (
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[13px] font-semibold pointer-events-none"
            style={{ color: 'var(--muted)' }}>¥</span>
        )}
        <input type="number" value={v} onChange={e => setV(e.target.value)} onBlur={commit}
          step={precision > 0 ? Math.pow(10, -precision) : 1}
          placeholder="0"
          className="field tabular-nums text-right"
          style={currency ? { paddingLeft: 28 } : undefined} />
      </div>
      {preview && v !== '' && (
        <div className="text-[10.5px] tabular-nums" style={{ color: 'var(--muted)' }}>
          预览：<span className="font-semibold" style={{ color: 'var(--text)' }}>
            {currency && !col.options?.formatting ? '¥' : ''}{preview}
          </span>
        </div>
      )}
    </div>
  )
}

function SingleSelectInput({ col, value, onSave }) {
  const choices = col.options?.choices ?? []
  return (
    <div className="flex flex-wrap gap-1.5">
      {choices.map(c => {
        const { bg, fg } = pillColors(c.color)
        const active = value === c.name
        return (
          <button key={c.id || c.name} onClick={() => onSave(active ? null : c.name)}
            className="press px-2.5 py-1 rounded-lg text-[11.5px] font-medium transition-all"
            style={active
              ? { background: bg, color: fg, boxShadow: `0 0 0 2px ${fg}33` }
              : { background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
            {c.name}
          </button>
        )
      })}
      {choices.length === 0 && <span className="text-[11.5px]" style={{ color: 'var(--muted)' }}>暂无选项</span>}
    </div>
  )
}

function MultiSelectInput({ col, value, onSave }) {
  const choices = col.options?.choices ?? []
  const sel = Array.isArray(value) ? value : []
  function toggle(name) {
    const next = sel.includes(name) ? sel.filter(x => x !== name) : [...sel, name]
    onSave(next.length ? next : null)
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {choices.map(c => {
        const { bg, fg } = pillColors(c.color)
        const active = sel.includes(c.name)
        return (
          <button key={c.id || c.name} onClick={() => toggle(c.name)}
            className="press px-2.5 py-1 rounded-lg text-[11.5px] font-medium transition-all inline-flex items-center gap-1"
            style={active
              ? { background: bg, color: fg, boxShadow: `0 0 0 2px ${fg}33` }
              : { background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
            {active && <Check className="w-3 h-3" />}{c.name}
          </button>
        )
      })}
      {choices.length === 0 && <span className="text-[11.5px]" style={{ color: 'var(--muted)' }}>暂无选项</span>}
    </div>
  )
}

function CheckboxInput({ col, value, onSave }) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer text-[12.5px]" style={{ color: 'var(--text)' }}>
      <input type="checkbox" checked={!!value} onChange={e => onSave(e.target.checked)} />
      <span>{value ? '是' : '否'}</span>
    </label>
  )
}

// ═══════════════════════════════════════════════════════════════════
// 时间要求底部提示
// ═══════════════════════════════════════════════════════════════════
function TimeRequirements() {
  return (
    <div className="rounded-2xl px-5 py-4"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-2 mb-3">
        <Calendar className="w-4 h-4" style={{ color: '#6366F1' }} />
        <span className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>填报时间要求</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        {TIME_REQUIREMENTS.map(r => (
          <div key={r.label} className="flex items-start gap-2 px-3 py-2 rounded-lg"
            style={{ background: 'var(--surface2)' }}>
            <span className="text-[14px] shrink-0">{r.icon}</span>
            <div className="min-w-0">
              <div className="text-[11.5px] font-semibold" style={{ color: 'var(--text)' }}>{r.label}</div>
              <div className="text-[10.5px] mt-0.5 leading-relaxed" style={{ color: 'var(--muted)' }}>{r.text}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// 工具
// ═══════════════════════════════════════════════════════════════════
function kindIconFor(col) {
  if (col.type === 'attachment')        return <Paperclip className="w-3.5 h-3.5" />
  if (col.kind === 'number')            return <Hash className="w-3.5 h-3.5" />
  if (col.kind === 'singleSelect' || col.kind === 'multipleSelect')
                                        return <List className="w-3.5 h-3.5" />
  if (col.kind === 'checkbox')          return <Check className="w-3.5 h-3.5" />
  return <FileText className="w-3.5 h-3.5" />
}

function kindLabel(col) {
  if (col.type === 'attachment') return '附件'
  switch (col.kind) {
    case 'text':           return '文本'
    case 'number':         return '数字'
    case 'singleSelect':   return '单选'
    case 'multipleSelect': return '多选'
    case 'checkbox':       return '勾选'
    default:               return '只读'
  }
}

function shallowEqual(a, b) {
  if (a === b) return true
  if (a == null && b == null) return true
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => x === b[i])
  return false
}

// 找"项目编号/名称"做标题
function deriveTitle(record, columns) {
  const nameCol = columns.find(c => c.isPrimary) || columns.find(c => /项目名称|名称/.test(c.name))
  const v = nameCol ? record.fields[nameCol.name] : record.name
  return typeof v === 'string' ? v : (v ? String(v) : record.name || '')
}

function deriveSubtitle(record, columns) {
  const codeCol = columns.find(c => /项目编号|编号|SR/i.test(c.name))
  const userCol = columns.find(c => /采购经理|负责人|项目经理/.test(c.name))
  const dateCol = columns.find(c => /授标时间|授标日期|完成时间/.test(c.name))
  const parts = []
  if (codeCol) {
    const v = record.fields[codeCol.name]
    if (v) parts.push(typeof v === 'string' ? v : String(v))
  }
  if (userCol) {
    const v = record.fields[userCol.name]
    if (v) parts.push(Array.isArray(v) ? v.join('/') : String(v))
  }
  if (dateCol) {
    const v = record.fields[dateCol.name]
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) parts.push(v.slice(0, 10))
  }
  return parts.join(' · ')
}

function deriveAmount(record, columns) {
  const col = columns.find(c => /合同金额|授标金额|项目金额/.test(c.name)) ||
              columns.find(c => /金额 CNY|金额CNY/.test(c.name))
  if (!col) return null
  const v = record.fields[col.name]
  return typeof v === 'number' ? v : null
}
