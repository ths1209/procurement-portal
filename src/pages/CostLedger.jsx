import { useState, useEffect, useMemo, useRef } from 'react'
import {
  Wallet, Search, Loader2, AlertCircle, ExternalLink, X,
  Crown, User, Sparkles, FileText,
  Calendar, Paperclip, Save, SlidersHorizontal,
  Check, ChevronDown, Star, RefreshCw, Handshake, Lock, ClipboardList,
  ArrowRight, CheckCircle2,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import {
  listCostLedger, updateCostLedger, getAttachments, loadFieldChoices, loadViews,
  fmtCNY, fmtPct, isCostLedgerConfigured, F, EDITABLE, EDITABLE_GROUPS,
  SYSTEM_REF_GROUPS, computeCompleteness, DEFAULT_VIEW,
} from '../lib/teableCostLedger'

// 角色 → 颜色（柔和色块）
const ROLE_KEYS = ['主导者', '谈判者', '执行者']
const ROLE_STYLE = {
  '主导者': { bg: 'rgba(239,68,68,0.10)',  color: '#DC2626', icon: Crown,     label: '主导者' },
  '谈判者': { bg: 'rgba(99,102,241,0.10)', color: '#4F46E5', icon: Handshake, label: '谈判者' },
  '执行者': { bg: 'rgba(16,185,129,0.10)', color: '#059669', icon: Sparkles,  label: '执行者' },
}
const ROLE_FALLBACK = { bg: 'rgba(100,116,139,0.10)', color: '#475569', icon: User, label: '未分类' }

const TEABLE_BASE = 'https://yach-teable.zhiyinlou.com/base/bsezwCnyl2rAB8R4wFT/table/tbl4e5Cuu6nlNw19uqz'

export default function CostLedger() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'

  const [rows,    setRows]    = useState([])
  const [choices, setChoices] = useState({})
  const [views,   setViews]   = useState([])
  const [viewId,  setViewId]  = useState(DEFAULT_VIEW)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const [pickedId, setPickedId] = useState(null)   // 当前选中项目 _id

  const [keyword, setKeyword] = useState('')
  const [status,  setStatus]  = useState('')        // ''=全部 | 'todo' | 'done'
  const [sort,    setSort]    = useState('todo-first')

  useEffect(() => { load() }, [profile?.jobId, profile?.role, viewId])

  async function load() {
    if (!isCostLedgerConfigured()) {
      setError('未配置成本台账表'); setLoading(false); return
    }
    setLoading(true); setError('')
    try {
      const [data, ch, vs] = await Promise.all([
        listCostLedger(profile, viewId),
        loadFieldChoices(),
        loadViews(),
      ])
      setRows(data)
      setChoices(ch)
      setViews(vs)
    } catch (e) {
      setError(e.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }

  function switchView(id) {
    if (id === viewId) return
    setViewId(id)
    setKeyword(''); setStatus(''); setPickedId(null)
  }

  // 过滤 + 排序后的列表
  const list = useMemo(() => {
    let v = rows.slice()
    const kw = keyword.trim().toLowerCase()
    if (kw) {
      v = v.filter(r => {
        const f = r.fields
        return [f[F.projectName], f[F.supplier], f[F.contractNo], f[F.requestDept], f[F.buyerName]]
          .some(x => String(x || '').toLowerCase().includes(kw))
      })
    }
    if (status) v = v.filter(r => {
      const done = computeCompleteness(r.fields).done
      return status === 'done' ? done : !done
    })
    v.sort((a, b) => {
      const fa = a.fields, fb = b.fields
      if (sort === 'todo-first') {
        // 待完善优先，其次按调整后降本降序
        const da = computeCompleteness(fa).done ? 1 : 0
        const db = computeCompleteness(fb).done ? 1 : 0
        if (da !== db) return da - db
        return num(fb[F.savingAdjusted]) - num(fa[F.savingAdjusted])
      }
      if (sort === 'saving-desc') return num(fb[F.savingAdjusted]) - num(fa[F.savingAdjusted])
      if (sort === 'amount-desc') return num(fb[F.winAmount]) - num(fa[F.winAmount])
      if (sort === 'time-desc')   return new Date(fb[F.projectDate] || 0) - new Date(fa[F.projectDate] || 0)
      return 0
    })
    return v
  }, [rows, keyword, status, sort])

  // 完整度统计
  const completeness = useMemo(() => {
    let done = 0
    for (const r of rows) if (computeCompleteness(r.fields).done) done++
    return { total: rows.length, done, todo: rows.length - done }
  }, [rows])

  // 选中项：默认列表第一条
  const picked = useMemo(() => {
    if (!list.length) return null
    return list.find(r => r._id === pickedId) || list[0]
  }, [list, pickedId])

  // 保存后更新本地数据
  function applySaved(updated) {
    setRows(rs => rs.map(r => r._id === updated._id ? updated : r))
  }

  // 保存并跳到下一个待完善项目
  function gotoNextTodo(currentId) {
    const idx = list.findIndex(r => r._id === currentId)
    // 从当前位置往后找第一个未完善的
    for (let i = idx + 1; i < list.length; i++) {
      if (!computeCompleteness(list[i].fields).done) { setPickedId(list[i]._id); return true }
    }
    for (let i = 0; i < idx; i++) {
      if (!computeCompleteness(list[i].fields).done) { setPickedId(list[i]._id); return true }
    }
    return false
  }

  if (error) return <ErrorState msg={error} onRetry={load} />

  return (
    <div className="flex flex-col gap-4 animate-page-in h-full">
      <Header isAdmin={isAdmin} loading={loading} onReload={load}
        shareUrl={`${TEABLE_BASE}/${viewId}`} c={completeness} />

      <ViewTabs views={views} current={viewId} onSwitch={switchView} loading={loading} />

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--muted)' }} />
        </div>
      ) : rows.length === 0 ? (
        <Empty hasData={false} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 min-h-0 flex-1">
          {/* 左：项目列表 */}
          <ProjectList
            list={list} pickedId={picked?._id} onPick={setPickedId}
            keyword={keyword} setKeyword={setKeyword}
            status={status} setStatus={setStatus}
            sort={sort} setSort={setSort}
            total={rows.length}
          />

          {/* 右：填写大表单 */}
          {picked ? (
            <ProjectForm
              key={picked._id}
              record={picked} choices={choices} isAdmin={isAdmin}
              hasNextTodo={completeness.todo > (computeCompleteness(picked.fields).done ? 0 : 1)}
              onSaved={applySaved}
              onSavedNext={gotoNextTodo}
            />
          ) : (
            <div className="card flex items-center justify-center text-[13px]"
              style={{ color: 'var(--muted)' }}>没有符合条件的项目</div>
          )}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
function Header({ isAdmin, loading, onReload, shareUrl, c }) {
  const allDone = c.todo === 0 && c.total > 0
  return (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-2.5">
        <Wallet className="w-5 h-5 shrink-0" style={{ color: '#6366F1' }} strokeWidth={1.75} />
        <div>
          <h1 className="font-semibold text-base leading-tight" style={{ color: 'var(--text)' }}>成本台账 · 项目维护</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
            {isAdmin ? '管理员视图 · 全部数据' : '仅显示您参与的项目'}
            {c.total > 0 && (allDone
              ? <span className="ml-1.5" style={{ color: '#059669' }}>· 全部 {c.total} 个已完善 🎉</span>
              : <span className="ml-1.5" style={{ color: '#B45309' }}>· {c.todo} 个待完善 / 共 {c.total}</span>)}
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={onReload} disabled={loading} className="press p-1.5 rounded-lg"
          style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
          <RefreshCw className="w-4 h-4"
            style={{ color: 'var(--muted)', animation: loading ? 'spin 1s linear infinite' : '' }} strokeWidth={1.75} />
        </button>
        <a href={shareUrl} target="_blank" rel="noopener noreferrer"
          className="press flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium"
          style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}>
          <ExternalLink className="w-4 h-4" strokeWidth={1.75} />原表
        </a>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// 视图名前缀 emoji → 纯色
const VIEW_EMOJI_COLOR = {
  '🚩': '#EF4444', '🏁': '#EF4444',
  '🟢': '#22C55E', '🟩': '#22C55E', '✅': '#22C55E',
  '🔴': '#DC2626', '⭕': '#DC2626',
  '🟡': '#F59E0B', '🟨': '#F59E0B', '⚠️': '#F59E0B',
  '🟠': '#F97316', '🔵': '#3B82F6', '🟦': '#3B82F6',
  '🟣': '#8B5CF6', '⚫': '#475569', '⚪': '#94A3B8',
}
const VIEW_FALLBACK = ['#6366F1', '#22C55E', '#F59E0B', '#EC4899', '#0EA5E9']

function parseViewName(raw, idx) {
  const name = String(raw || '').trim()
  const first2 = name.slice(0, 2)
  const first1 = name.slice(0, 1)
  if (VIEW_EMOJI_COLOR[first2]) return { color: VIEW_EMOJI_COLOR[first2], label: name.slice(2).trim() }
  if (VIEW_EMOJI_COLOR[first1]) return { color: VIEW_EMOJI_COLOR[first1], label: name.slice(1).trim() }
  return { color: VIEW_FALLBACK[idx % VIEW_FALLBACK.length], label: name }
}

function ViewTabs({ views, current, onSwitch, loading }) {
  if (!views.length) return null
  return (
    <div className="flex items-center gap-1 overflow-x-auto px-1 -mx-1"
      style={{ borderBottom: '1px solid var(--border)' }}>
      {views.map((v, idx) => {
        const active = v.id === current
        const { color, label } = parseViewName(v.name, idx)
        return (
          <button key={v.id} onClick={() => onSwitch(v.id)} disabled={loading && active}
            className="view-tab press relative inline-flex items-center gap-2 px-3 py-2 text-[12.5px] whitespace-nowrap transition-colors shrink-0"
            style={{ color: active ? 'var(--text)' : 'var(--muted)', fontWeight: active ? 600 : 500 }}>
            <span className="w-2 h-2 rounded-sm shrink-0"
              style={{ background: color, opacity: active ? 1 : 0.55, transition: 'opacity 0.18s ease' }} />
            {label || v.name}
            {active && <span className="absolute left-3 right-3 bottom-0 h-[2px] rounded-t" style={{ background: color }} />}
          </button>
        )
      })}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// 左侧项目列表
function ProjectList({ list, pickedId, onPick, keyword, setKeyword, status, setStatus, sort, setSort, total }) {
  return (
    <div className="card flex flex-col overflow-hidden" style={{ maxHeight: 'calc(100vh - 180px)' }}>
      {/* 搜索 + 筛选 */}
      <div className="p-3 space-y-2.5 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
          <input value={keyword} onChange={e => setKeyword(e.target.value)}
            placeholder="搜索项目 / 供应商 / 采购员"
            className="w-full pl-9 pr-3 py-2 rounded-lg text-[12.5px] outline-none"
            style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid transparent' }} />
        </div>
        <div className="flex items-center gap-1.5">
          {[['', '全部'], ['todo', '待完善'], ['done', '已完善']].map(([v, l]) => (
            <button key={v} onClick={() => setStatus(v)}
              className="press flex-1 py-1.5 rounded-lg text-[11.5px] font-semibold transition-colors"
              style={status === v
                ? (v === 'todo'
                    ? { background: '#F59E0B', color: '#fff' }
                    : v === 'done'
                      ? { background: '#10B981', color: '#fff' }
                      : { background: '#6366F1', color: '#fff' })
                : { background: 'var(--surface2)', color: 'var(--muted)' }}>
              {l}
            </button>
          ))}
        </div>
        <MiniSelect value={sort} onChange={setSort} icon={SlidersHorizontal} block options={[
          { value: 'todo-first',  label: '待完善优先' },
          { value: 'saving-desc', label: '按调整后降本' },
          { value: 'amount-desc', label: '按合同金额' },
          { value: 'time-desc',   label: '按立项时间' },
        ]} />
      </div>

      {/* 列表 */}
      <div className="flex-1 overflow-y-auto">
        {list.length === 0 ? (
          <div className="px-4 py-10 text-center text-[12px]" style={{ color: 'var(--muted)' }}>
            没有符合条件的项目
          </div>
        ) : list.map(r => (
          <ProjectListItem key={r._id} record={r} active={r._id === pickedId} onClick={() => onPick(r._id)} />
        ))}
      </div>

      <div className="px-3 py-2 text-[11px] shrink-0 text-center"
        style={{ borderTop: '1px solid var(--border)', color: 'var(--muted)' }}>
        显示 {list.length} / 共 {total} 个项目
      </div>
    </div>
  )
}

function ProjectListItem({ record, active, onClick }) {
  const f = record.fields
  const cp = computeCompleteness(f)
  const roleKey = f[F.role] || ''
  const roleStyle = ROLE_STYLE[roleKey] || ROLE_FALLBACK
  const barColor = cp.done ? '#10B981' : '#F59E0B'

  return (
    <button onClick={onClick}
      className="w-full text-left px-3.5 py-3 transition-colors relative"
      style={{
        borderBottom: '1px solid var(--border)',
        background: active ? 'rgba(99,102,241,0.07)' : 'transparent',
        boxShadow: active ? 'inset 3px 0 0 #6366F1' : 'none',
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--surface2)' }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}>
      <div className="flex items-center gap-1.5 mb-1">
        {cp.done
          ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" style={{ color: '#10B981' }} />
          : <span className="w-2 h-2 rounded-full shrink-0 ml-0.5 mr-0.5" style={{ background: '#F59E0B' }} />}
        <span className="text-[13px] font-medium truncate flex-1" style={{ color: 'var(--text)' }}>
          {f[F.projectName] || '未命名项目'}
        </span>
      </div>
      <div className="flex items-center gap-2 mb-1.5 pl-5">
        <span className="text-[10px] px-1.5 py-px rounded font-medium"
          style={{ background: roleStyle.bg, color: roleStyle.color }}>{roleStyle.label}</span>
        <span className="text-[11px] truncate" style={{ color: 'var(--muted)' }}>
          ¥{fmtCNY(f[F.savingAdjusted])} 降本
        </span>
      </div>
      {/* 完成度条 */}
      <div className="flex items-center gap-2 pl-5">
        <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'var(--surface2)' }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${cp.pct}%`, background: barColor }} />
        </div>
        <span className="text-[10px] tabular-nums shrink-0"
          style={{ color: cp.done ? '#059669' : '#B45309' }}>
          {cp.done ? '已完善' : `${cp.filled}/${cp.total}`}
        </span>
      </div>
    </button>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// 右侧填写大表单
function ProjectForm({ record, choices, isAdmin, hasNextTodo, onSaved, onSavedNext }) {
  const f = record.fields
  const [draft, setDraft] = useState(() => pickEditable(f))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [savedFlash, setSavedFlash] = useState(false)
  const [showSysRef, setShowSysRef] = useState(false)
  const scrollRef = useRef(null)

  // 实时完整度（基于 draft）
  const cp = computeCompleteness({ ...f, ...draft })

  function set(name, v) { setDraft(d => ({ ...d, [name]: v })) }

  async function doSave(thenNext) {
    setSaving(true); setErr('')
    try {
      await updateCostLedger(record._id, draft)
      const updated = { ...record, fields: { ...record.fields, ...draft } }
      onSaved(updated)
      setSavedFlash(true); setTimeout(() => setSavedFlash(false), 2000)
      if (thenNext) {
        const moved = onSavedNext(record._id)
        if (!moved) scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
      }
    } catch (e) {
      setErr(e.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const roleKey = f[F.role] || ''
  const roleStyle = ROLE_STYLE[roleKey] || ROLE_FALLBACK
  const RoleIcon = roleStyle.icon

  return (
    <div ref={scrollRef} className="card flex flex-col overflow-hidden" style={{ maxHeight: 'calc(100vh - 180px)' }}>
      {/* 顶栏：项目名 + 完整度 */}
      <div className="px-5 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-semibold shrink-0"
                style={{ background: roleStyle.bg, color: roleStyle.color }}>
                <RoleIcon className="w-2.5 h-2.5" />{roleStyle.label}
              </span>
              <h2 className="text-[15px] font-bold truncate" style={{ color: 'var(--text)' }}>
                {f[F.projectName] || '未命名项目'}
              </h2>
            </div>
            <p className="text-[11.5px] truncate" style={{ color: 'var(--muted)' }}>
              {f[F.supplier] || '—'} · {f[F.requestDept] || '—'}
            </p>
          </div>
          {/* 完整度环形指示 */}
          <CompletenessBadge cp={cp} />
        </div>
        {/* 缺失项提示 */}
        {!cp.done && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-[11.5px]"
            style={{ background: 'rgba(245,158,11,0.08)', color: '#92400E', border: '1px solid rgba(245,158,11,0.2)' }}>
            <ClipboardList className="w-3.5 h-3.5 shrink-0" />
            还需填写：<span className="font-semibold">{cp.missing.join('、')}</span>
          </div>
        )}
      </div>

      {/* 表单滚动区 */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {err && (
          <div className="p-3 rounded-xl text-[12px] flex items-center gap-2"
            style={{ background: 'rgba(239,68,68,0.08)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.2)' }}>
            <AlertCircle className="w-3.5 h-3.5" />{err}
          </div>
        )}

        {/* 系统只读信息（默认折叠，强调"填写"为主） */}
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          <button onClick={() => setShowSysRef(s => !s)}
            className="press w-full flex items-center gap-2 px-4 py-2.5"
            style={{ background: 'var(--surface2)' }}>
            <Lock className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
            <span className="text-[12px] font-semibold" style={{ color: 'var(--text)' }}>系统信息（只读）</span>
            <span className="text-[10.5px]" style={{ color: 'var(--muted)' }}>项目基础 · 系统计算金额 · 财年加权</span>
            <ChevronDown className="w-4 h-4 ml-auto transition-transform"
              style={{ color: 'var(--muted)', transform: showSysRef ? 'rotate(180deg)' : 'none' }} />
          </button>
          {showSysRef && (
            <div className="p-4 space-y-4" style={{ borderTop: '1px solid var(--border)' }}>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <KV label="需求部门"   value={f[F.requestDept]} />
                <KV label="立项单号"   value={f[F.projectNo]} />
                <KV label="合同号"     value={f[F.contractNo]} />
                <KV label="中标供应商" value={f[F.supplier]} />
                <KV label="一级品类"   value={f[F.category1]} />
                <KV label="采购组织"   value={f[F.buyerOrg]} />
                <KV label="立项时间"   value={fmtDate(f[F.projectDate])} />
                <KV label="合同结束"   value={fmtDate(f[F.contractEndMax]) || fmtDate(f[F.contractEnd])} />
                {isAdmin && <KV label="采购员" value={`${f[F.buyerName] || ''} ${f[F.buyerJobId] ? '('+f[F.buyerJobId]+')' : ''}`.trim()} />}
              </div>
              {SYSTEM_REF_GROUPS.map(g => (
                <div key={g.title}>
                  <p className="text-[11px] font-bold mb-1.5 flex items-center gap-1.5" style={{ color: 'var(--muted)' }}>
                    {g.title}
                    <span className="text-[9.5px] font-normal opacity-70">· {g.hint}</span>
                  </p>
                  <div className="grid grid-cols-3 gap-3">
                    {g.fields.map(meta => {
                      const raw = fmtCNY(f[meta.name])
                      return (
                        <div key={meta.name} className="rounded-lg px-3 py-2" style={{ background: 'var(--surface2)' }}>
                          <div className="text-[10px] mb-0.5" style={{ color: 'var(--muted)' }}>{meta.label}</div>
                          <div className="text-[13px] font-semibold tabular-nums" style={{ color: 'var(--text)' }}>
                            {raw === '—' ? '—' : `¥${raw}`}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ★ 可编辑填写区（主体） */}
        {EDITABLE_GROUPS.map(g => (
          <FormGroup key={g.title} title={g.title} stars={g.stars}>
            {g.fields.map(meta => (
              <FormField key={meta.name} meta={meta}
                value={draft[meta.name]}
                onChange={v => set(meta.name, v)}
                choices={choices[meta.name] || []}
                refValue={meta.name === F.savingAdjusted
                  ? { sysSaving: num(f[F.saveAmount]), winAmount: num(f[F.winAmount]) }
                  : null}
                required={cp.missing && computeCompleteness({}).total >= 0 && isRequired(meta.name)}
                isMissing={!cp.done && cp.missing.includes(requiredLabel(meta.name))}
              />
            ))}
          </FormGroup>
        ))}

        {/* 附件（只读） */}
        <FormGroup title="附件资料" icon={Paperclip}>
          <AttachBlock label="历史采购价 / 市场平均价" list={getAttachments(record, F.priceAttach)} />
          <AttachBlock label="业务认可的角色截图"       list={getAttachments(record, F.roleAttach)} />
          <AttachBlock label="市场成本分析数据"         list={getAttachments(record, F.marketAttach)} />
          <AttachBlock label="其他附件"                 list={getAttachments(record, F.otherAttach)} />
          {[F.priceAttach, F.roleAttach, F.marketAttach, F.otherAttach].every(fld => getAttachments(record, fld).length === 0) && (
            <p className="text-[11.5px]" style={{ color: 'var(--muted)' }}>暂无附件（如需上传请到原表）</p>
          )}
        </FormGroup>
      </div>

      {/* 底部固定操作栏 */}
      <div className="px-5 py-3 shrink-0 flex items-center gap-3"
        style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
        {savedFlash && (
          <span className="text-[12px] font-medium flex items-center gap-1" style={{ color: '#059669' }}>
            <Check className="w-3.5 h-3.5" />已保存
          </span>
        )}
        <div className="ml-auto flex items-center gap-2.5">
          <button onClick={() => doSave(false)} disabled={saving}
            className="press flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-semibold disabled:opacity-60"
            style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}保存
          </button>
          {hasNextTodo && (
            <button onClick={() => doSave(true)} disabled={saving}
              className="press flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-semibold text-white disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg,#6366F1,#8B5CF6)' }}>
              保存并填下一个<ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// 完整度环形徽章
function CompletenessBadge({ cp }) {
  const color = cp.done ? '#10B981' : '#F59E0B'
  const R = 16, C = 2 * Math.PI * R
  const off = C * (1 - cp.pct / 100)
  return (
    <div className="relative w-12 h-12 shrink-0">
      <svg width="48" height="48" className="-rotate-90">
        <circle cx="24" cy="24" r={R} fill="none" stroke="var(--surface2)" strokeWidth="4" />
        <circle cx="24" cy="24" r={R} fill="none" stroke={color} strokeWidth="4"
          strokeDasharray={C} strokeDashoffset={off} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.4s ease' }} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {cp.done
          ? <Check className="w-5 h-5" style={{ color }} />
          : <span className="text-[11px] font-bold tabular-nums" style={{ color }}>{cp.pct}%</span>}
      </div>
    </div>
  )
}

// 表单分组
function FormGroup({ title, stars = 0, icon: Icon, children }) {
  const starColor = stars >= 3 ? '#F59E0B' : (stars >= 1 ? '#6366F1' : null)
  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        {Icon
          ? <Icon className="w-4 h-4" style={{ color: '#6366F1' }} />
          : starColor && <span className="text-[12px] tracking-tighter" style={{ color: starColor }}>{'★'.repeat(stars)}</span>}
        <h4 className="text-[13px] font-bold" style={{ color: 'var(--text)' }}>{title}</h4>
      </div>
      <div className="space-y-4 pl-0.5">{children}</div>
    </section>
  )
}

// 单个填写字段（始终可编辑）
function FormField({ meta, value, onChange, choices, refValue, isMissing }) {
  const { name, type, label, unit } = meta
  const displayLabel = label || name.replace(/^⭐+/, '').trim()

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-[12.5px] font-medium" style={{ color: 'var(--text)' }}>{displayLabel}</span>
        {unit && <span className="text-[10.5px]" style={{ color: 'var(--muted)' }}>（{unit}）</span>}
        {isMissing && (
          <span className="text-[10px] px-1.5 py-px rounded font-semibold"
            style={{ background: 'rgba(245,158,11,0.12)', color: '#B45309' }}>待填</span>
        )}
      </div>

      {type === 'longText' ? (
        <textarea value={value || ''} onChange={e => onChange(e.target.value)} rows={3}
          className="w-full px-3 py-2 rounded-xl text-[12.5px] outline-none resize-y"
          style={{ background: 'var(--surface2)', color: 'var(--text)',
            border: `1px solid ${isMissing ? 'rgba(245,158,11,0.4)' : 'var(--border)'}` }} />
      ) : type === 'number' ? (
        <NumberField value={value} onChange={onChange} refValue={refValue} isMissing={isMissing} />
      ) : type === 'singleSelect' ? (
        <SingleSelectEditor value={value || ''} onChange={onChange} choices={choices} isMissing={isMissing} />
      ) : type === 'multipleSelect' ? (
        <MultiSelectEditor value={Array.isArray(value) ? value : (value ? [value] : [])} onChange={onChange} choices={choices} />
      ) : (
        <input value={value ?? ''} onChange={e => onChange(e.target.value)}
          className="w-full px-3 py-2 rounded-xl text-[12.5px] outline-none"
          style={{ background: 'var(--surface2)', color: 'var(--text)',
            border: `1px solid ${isMissing ? 'rgba(245,158,11,0.4)' : 'var(--border)'}` }} />
      )}
    </div>
  )
}

// 金额输入 + 系统值实时对比
function NumberField({ value, onChange, refValue, isMissing }) {
  const v = num(value)
  const sys = refValue?.sysSaving || 0
  const win = refValue?.winAmount || 0
  const hasInput = value !== '' && value !== null && value !== undefined
  // 偏离度：填写值 vs 系统参考降本
  const deviation = (hasInput && sys > 0) ? (v - sys) / sys : null
  const bigDeviation = deviation !== null && Math.abs(deviation) > 0.3
  const rate = (hasInput && win > 0) ? v / win : null

  return (
    <div>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px]" style={{ color: 'var(--muted)' }}>¥</span>
        <input type="number" step="any" value={value ?? ''} onChange={e => onChange(e.target.value)}
          placeholder="填写金额"
          className="w-full pl-7 pr-3 py-2 rounded-xl text-[13px] outline-none tabular-nums"
          style={{ background: 'var(--surface2)', color: 'var(--text)',
            border: `1px solid ${bigDeviation ? 'rgba(245,158,11,0.5)' : (isMissing ? 'rgba(245,158,11,0.4)' : 'var(--border)')}` }} />
      </div>
      {refValue && (
        <div className="flex items-center gap-3 flex-wrap mt-1.5 text-[11px]">
          <span style={{ color: 'var(--muted)' }}>
            系统参考降本 <span className="font-semibold tabular-nums" style={{ color: 'var(--text)' }}>¥{fmtCNY(sys)}</span>
          </span>
          {win > 0 && (
            <span style={{ color: 'var(--muted)' }}>
              中标 <span className="font-semibold tabular-nums" style={{ color: 'var(--text)' }}>¥{fmtCNY(win)}</span>
            </span>
          )}
          {rate !== null && (
            <span style={{ color: 'var(--muted)' }}>
              降本率 <span className="font-semibold tabular-nums" style={{ color: '#059669' }}>{fmtPct(rate)}</span>
            </span>
          )}
          {hasInput && sys > 0 && (
            bigDeviation
              ? <span className="font-semibold" style={{ color: '#D97706' }}>
                  ⚠ 与系统值偏离 {deviation > 0 ? '+' : ''}{(deviation * 100).toFixed(0)}%，请核对
                </span>
              : <span className="font-medium" style={{ color: '#059669' }}>✓ 接近系统值</span>
          )}
        </div>
      )}
    </div>
  )
}

function SingleSelectEditor({ value, onChange, choices, isMissing }) {
  return (
    <div className="relative">
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full appearance-none px-3 pr-8 py-2 rounded-xl text-[12.5px] outline-none cursor-pointer"
        style={{ background: 'var(--surface2)', color: value ? 'var(--text)' : 'var(--muted)',
          border: `1px solid ${isMissing ? 'rgba(245,158,11,0.4)' : 'var(--border)'}` }}>
        <option value="">— 请选择 —</option>
        {choices.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
      </select>
      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: 'var(--muted)' }} />
    </div>
  )
}

function MultiSelectEditor({ value, onChange, choices }) {
  const set = new Set(value)
  function toggle(name) {
    const next = new Set(set)
    next.has(name) ? next.delete(name) : next.add(name)
    onChange([...next])
  }
  if (!choices.length) {
    return <div className="text-[11.5px] rounded-xl px-3 py-2" style={{ background: 'var(--surface2)', color: 'var(--muted)' }}>（未加载到选项）</div>
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {choices.map(c => {
        const active = set.has(c.name)
        return (
          <button key={c.name} type="button" onClick={() => toggle(c.name)}
            className="press inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11.5px] font-medium transition-colors"
            style={{
              background: active ? 'rgba(99,102,241,0.12)' : 'var(--surface2)',
              color: active ? '#4F46E5' : 'var(--muted)',
              border: `1px solid ${active ? 'rgba(99,102,241,0.3)' : 'var(--border)'}`,
            }}>
            {active && <Check className="w-3 h-3" />}{c.name}
          </button>
        )
      })}
    </div>
  )
}

function KV({ label, value }) {
  const empty = value === null || value === undefined || value === '' || value === '—'
  return (
    <div className="flex gap-2 text-[12px] leading-relaxed">
      <span className="shrink-0 w-[72px]" style={{ color: 'var(--muted)' }}>{label}</span>
      <span className="flex-1 break-all" style={{ color: empty ? 'var(--muted)' : 'var(--text)' }}>{empty ? '—' : value}</span>
    </div>
  )
}

function AttachBlock({ label, list }) {
  if (!list.length) return null
  return (
    <div>
      <div className="text-[11.5px] font-medium mb-1.5" style={{ color: 'var(--muted)' }}>{label}</div>
      <div className="flex flex-wrap gap-2">
        {list.map((a, i) => (
          <a key={i} href={a.url} target="_blank" rel="noopener noreferrer"
            className="press flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] transition-colors max-w-full"
            style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}
            title={a.name}>
            <Paperclip className="w-3 h-3 shrink-0" style={{ color: 'var(--muted)' }} />
            <span className="truncate max-w-[200px]">{a.name}</span>
          </a>
        ))}
      </div>
    </div>
  )
}

// 极简下拉（列表筛选区复用，支持 block 占满整行）
function MiniSelect({ value, onChange, options, placeholder, icon: Icon, block }) {
  const opts = options.map(o => typeof o === 'string' ? { value: o, label: o } : o)
  const active = !!value
  return (
    <div className={`relative ${block ? 'w-full' : ''}`}>
      {Icon && (
        <Icon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: 'var(--muted)' }} />
      )}
      <select value={value} onChange={e => onChange(e.target.value)}
        className={`appearance-none py-2 pr-7 rounded-lg text-[12px] outline-none cursor-pointer ${Icon ? 'pl-8' : 'pl-3'} ${block ? 'w-full' : ''}`}
        style={{ background: 'var(--surface2)', color: 'var(--text)', fontWeight: 500, border: '1px solid var(--border)' }}>
        {placeholder && <option value="">{placeholder}</option>}
        {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none" style={{ color: 'var(--muted)', opacity: 0.7 }} />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
function ErrorState({ msg, onRetry }) {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="max-w-md w-full rounded-2xl p-6 text-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <AlertCircle className="w-8 h-8 mx-auto mb-3" style={{ color: '#F59E0B' }} />
        <p className="text-[13px] font-semibold mb-1" style={{ color: 'var(--text)' }}>加载失败</p>
        <p className="text-[11.5px] mb-4" style={{ color: 'var(--muted)' }}>{msg}</p>
        <button onClick={onRetry} className="press px-4 py-2 rounded-xl text-[12px] font-semibold text-white"
          style={{ background: 'linear-gradient(135deg,#6366F1,#8B5CF6)' }}>重试</button>
      </div>
    </div>
  )
}

function Empty({ hasData }) {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="text-center">
        <div className="w-16 h-16 mx-auto mb-3 rounded-full flex items-center justify-center" style={{ background: 'var(--surface2)' }}>
          <FileText className="w-7 h-7" style={{ color: 'var(--muted)' }} />
        </div>
        <p className="text-[13px] font-medium mb-1" style={{ color: 'var(--text)' }}>
          {hasData ? '没有符合条件的项目' : '暂无您的成本台账记录'}
        </p>
        <p className="text-[11.5px]" style={{ color: 'var(--muted)' }}>
          {hasData ? '试试调整搜索或筛选条件' : '系统仅显示以您工号登记的采购记录'}
        </p>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// 工具函数
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0 }
function toArr(v) {
  if (Array.isArray(v)) return v
  if (v === null || v === undefined || v === '') return []
  return [v]
}
function pickEditable(fields) {
  const out = {}
  for (const k of EDITABLE) {
    const v = fields[k]
    out[k] = Array.isArray(v) ? [...v] : (v ?? '')
  }
  return out
}
function fmtDate(v) {
  if (!v) return ''
  const d = new Date(v)
  if (!Number.isFinite(d.getTime())) return String(v)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
// 必填字段映射（与 REQUIRED_FIELDS 对齐，用于"待填"高亮）
const REQUIRED_MAP = {
  [F.categoryBig]:    '采购品类',
  [F.role]:           '项目角色',
  [F.saveMethods]:    '核心降本方式',
  [F.savingAdjusted]: 'FY27 调整后降本金额',
  [F.saveMeasures]:   '具体降本举措',
}
function isRequired(name) { return name in REQUIRED_MAP }
function requiredLabel(name) { return REQUIRED_MAP[name] || '' }
