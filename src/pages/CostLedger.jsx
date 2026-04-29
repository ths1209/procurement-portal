import { useState, useEffect, useMemo } from 'react'
import {
  Wallet, Search, Loader2, AlertCircle, ExternalLink, X,
  Crown, User, Sparkles, FileText, TrendingDown,
  Calendar, Paperclip, Save, Edit3, SlidersHorizontal,
  Check, ChevronDown, Star, RefreshCw,
} from 'lucide-react'
import { createPortal } from 'react-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  listCostLedger, updateCostLedger, getAttachments, loadFieldChoices,
  fmtCNY, fmtPct, isCostLedgerConfigured, F, EDITABLE, EDITABLE_GROUPS,
} from '../lib/teableCostLedger'

// 角色 → 颜色（柔和色块，非渐变）
const ROLE_STYLE = {
  '主导者':  { bg: 'rgba(239,68,68,0.10)',  color: '#DC2626', icon: Crown,    label: '主导者' },
  '参与者':  { bg: 'rgba(99,102,241,0.10)', color: '#4F46E5', icon: Sparkles, label: '参与者' },
  '支持者':  { bg: 'rgba(14,165,233,0.10)', color: '#0369A1', icon: User,     label: '支持者' },
}
const ROLE_FALLBACK = { bg: 'rgba(100,116,139,0.10)', color: '#475569', icon: User, label: '未分类' }

// 详情抽屉里用渐变
const ROLE_GRADIENT = {
  '主导者': 'linear-gradient(135deg,#F59E0B,#EF4444)',
  '参与者': 'linear-gradient(135deg,#6366F1,#8B5CF6)',
  '支持者': 'linear-gradient(135deg,#0EA5E9,#22D3EE)',
}

const TEABLE_SHARE = 'https://yach-teable.zhiyinlou.com/base/bsezwCnyl2rAB8R4wFT/table/tbl4e5Cuu6nlNw19uqz/viw4NKBSKkxIo1kOrlK'

export default function CostLedger() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'

  const [rows,    setRows]    = useState([])
  const [choices, setChoices] = useState({})
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const [picked,  setPicked]  = useState(null)

  const [keyword, setKeyword] = useState('')
  const [role,    setRole]    = useState('')
  const [cat,     setCat]     = useState('')
  const [buyer,   setBuyer]   = useState('')
  const [org,     setOrg]     = useState('')
  const [sort,    setSort]    = useState('saving-desc')

  useEffect(() => { load() }, [profile?.jobId, profile?.role])

  async function load() {
    if (!isCostLedgerConfigured()) {
      setError('未配置成本台账表'); setLoading(false); return
    }
    setLoading(true); setError('')
    try {
      const [data, ch] = await Promise.all([listCostLedger(profile), loadFieldChoices()])
      setRows(data)
      setChoices(ch)
    } catch (e) {
      setError(e.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }

  // 筛选 / 排序
  const roleOpts  = useMemo(() => uniq(rows.map(r => r.fields[F.role])), [rows])
  const catOpts   = useMemo(() => {
    const list = uniq(rows.flatMap(r => toArr(r.fields[F.categoryBig])))
    const hasEmpty = rows.some(r => toArr(r.fields[F.categoryBig]).length === 0)
    return hasEmpty ? ['未确认', ...list] : list
  }, [rows])
  const buyerOpts = useMemo(() => uniq(rows.map(r => r.fields[F.buyerName])), [rows])
  const orgOpts   = useMemo(() => uniq(rows.map(r => r.fields[F.buyerOrg])), [rows])

  const view = useMemo(() => {
    let v = rows.slice()
    const kw = keyword.trim().toLowerCase()
    if (kw) {
      v = v.filter(r => {
        const f = r.fields
        return [f[F.projectName], f[F.supplier], f[F.contractNo], f[F.requestDept], f[F.buyerName]]
          .some(x => String(x || '').toLowerCase().includes(kw))
      })
    }
    if (role)  v = v.filter(r => r.fields[F.role] === role)
    if (cat)   v = v.filter(r => {
      const cats = toArr(r.fields[F.categoryBig])
      return cat === '未确认' ? cats.length === 0 : cats.includes(cat)
    })
    if (buyer) v = v.filter(r => r.fields[F.buyerName] === buyer)
    if (org)   v = v.filter(r => r.fields[F.buyerOrg] === org)
    const k = sort
    v.sort((a, b) => {
      const fa = a.fields, fb = b.fields
      if (k === 'saving-desc') return num(fb[F.savingAdjusted]) - num(fa[F.savingAdjusted])
      if (k === 'rate-desc')   return num(fb[F.saveRate]) - num(fa[F.saveRate])
      if (k === 'amount-desc') return num(fb[F.winAmount]) - num(fa[F.winAmount])
      if (k === 'time-desc')   return new Date(fb[F.projectDate] || 0) - new Date(fa[F.projectDate] || 0)
      return 0
    })
    return v
  }, [rows, keyword, role, cat, buyer, org, sort])

  // 概览统计：按三个角色分别计数
  const stats = useMemo(() => {
    const byRole = { '主导者': 0, '参与者': 0, '支持者': 0 }
    for (const r of rows) {
      const k = r.fields[F.role]
      if (byRole[k] !== undefined) byRole[k] += 1
    }
    return byRole
  }, [rows])

  if (error) {
    return (
      <ErrorState msg={error} onRetry={load} />
    )
  }

  return (
    <div className="flex flex-col gap-4 animate-page-in">
      <Header isAdmin={isAdmin} loading={loading} onReload={load} />

      <StatGrid s={stats} activeRole={role} onRoleClick={setRole} />

      <Toolbar
        keyword={keyword} setKeyword={setKeyword}
        role={role}       setRole={setRole}       roleOpts={roleOpts}
        cat={cat}         setCat={setCat}         catOpts={catOpts}
        buyer={buyer}     setBuyer={setBuyer}     buyerOpts={buyerOpts}
        org={org}         setOrg={setOrg}         orgOpts={orgOpts}
        sort={sort}       setSort={setSort}
        count={view.length}
        isAdmin={isAdmin}
      />

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--muted)' }} />
        </div>
      ) : view.length === 0 ? (
        <Empty hasData={rows.length > 0} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4 stagger">
          {view.map(r => (
            <RecordCard key={r._id} record={r} onOpen={() => setPicked(r)} />
          ))}
        </div>
      )}

      {picked && (
        <DetailDrawer
          record={picked}
          choices={choices}
          onClose={() => setPicked(null)}
          onSaved={upd => { setRows(rs => rs.map(r => r._id === upd._id ? upd : r)); setPicked(upd) }}
          isAdmin={isAdmin}
        />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
function Header({ isAdmin, loading, onReload }) {
  return (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-2">
        <Wallet className="w-5 h-5 shrink-0" style={{ color: '#6366F1' }} strokeWidth={1.75} />
        <div>
          <h1 className="font-semibold text-base leading-tight" style={{ color: 'var(--text)' }}>成本台账</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
            {isAdmin ? '管理员视图 · 全部数据' : '仅显示您作为采购员参与的单据'}
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={onReload} disabled={loading} className="press p-1.5 rounded-lg"
          style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
          <RefreshCw className="w-4 h-4"
            style={{ color: 'var(--muted)', animation: loading ? 'spin 1s linear infinite' : '' }} strokeWidth={1.75} />
        </button>
        <a href={TEABLE_SHARE} target="_blank" rel="noopener noreferrer"
          className="press flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium"
          style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}>
          <ExternalLink className="w-4 h-4" strokeWidth={1.75} />原表
        </a>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
function StatGrid({ s, activeRole, onRoleClick }) {
  const items = [
    { key: '主导者', color: '#DC2626', icon: Crown,    value: s['主导者'] || 0 },
    { key: '参与者', color: '#4F46E5', icon: Sparkles, value: s['参与者'] || 0 },
    { key: '支持者', color: '#0369A1', icon: User,     value: s['支持者'] || 0 },
  ]
  return (
    <div className="grid grid-cols-3 gap-3">
      {items.map(it => {
        const active = activeRole === it.key
        const Icon = it.icon
        return (
          <button key={it.key}
            onClick={() => onRoleClick(active ? '' : it.key)}
            className="card press p-4 text-left relative overflow-hidden"
            style={{
              borderColor: active ? it.color : undefined,
              boxShadow: active ? `0 0 0 2px ${it.color}33, 0 4px 16px ${it.color}22` : undefined,
            }}>
            <div className="flex items-center justify-between mb-2">
              <span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--muted)' }}>
                <Icon className="w-3.5 h-3.5" style={{ color: it.color }} />{it.key}
              </span>
              {active && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                style={{ background: `${it.color}18`, color: it.color }}>已筛选</span>}
            </div>
            <p className="text-2xl font-bold tabular-nums" style={{ color: it.color }}>
              {it.value}<span className="text-xs font-medium ml-1" style={{ color: 'var(--muted)' }}>个</span>
            </p>
          </button>
        )
      })}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
function Toolbar({ keyword, setKeyword, role, setRole, roleOpts,
                   cat, setCat, catOpts, buyer, setBuyer, buyerOpts,
                   org, setOrg, orgOpts, sort, setSort, count, isAdmin }) {
  const hasFilter = role || cat || buyer || org || keyword
  function clearAll() {
    setKeyword(''); setRole(''); setCat(''); setBuyer(''); setOrg('')
  }
  return (
    <div className="flex items-center gap-2 flex-wrap px-1">
      <div className="relative flex-1 min-w-[220px] max-w-[360px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
        <input value={keyword} onChange={e => setKeyword(e.target.value)}
          placeholder="搜索项目 / 供应商 / 合同号 / 采购员"
          className="w-full pl-9 pr-3 py-1.5 rounded-lg text-[13px] outline-none transition-colors"
          style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid transparent' }} />
      </div>

      <MiniSelect value={role} onChange={setRole} placeholder="全部角色" options={roleOpts} />
      <MiniSelect value={cat}  onChange={setCat}  placeholder="全部品类" options={catOpts} />
      {isAdmin && buyerOpts.length > 1 && (
        <MiniSelect value={buyer} onChange={setBuyer} placeholder="全部采购员" options={buyerOpts} />
      )}
      {orgOpts.length > 1 && (
        <MiniSelect value={org} onChange={setOrg} placeholder="全部采购组织" options={orgOpts} />
      )}

      <MiniSelect value={sort} onChange={setSort} options={[
        { value: 'saving-desc', label: '按降本金额' },
        { value: 'rate-desc',   label: '按降本率'   },
        { value: 'amount-desc', label: '按合同金额' },
        { value: 'time-desc',   label: '按时间'     },
      ]} icon={SlidersHorizontal} />

      <div className="flex items-center gap-2 ml-auto text-[11.5px]" style={{ color: 'var(--muted)' }}>
        {hasFilter && (
          <button onClick={clearAll}
            className="press inline-flex items-center gap-1 px-2 py-1 rounded-md transition-colors hover:text-[var(--text)]"
            style={{ color: 'var(--muted)' }}>
            <X className="w-3 h-3" />清空
          </button>
        )}
        <span>共 <span className="font-semibold tabular-nums" style={{ color: 'var(--text)' }}>{count}</span> 条</span>
      </div>
    </div>
  )
}

/**
 * 极简下拉：默认完全透明，hover 显浅底；一旦有值则文字变主色且左侧带小圆点。
 */
function MiniSelect({ value, onChange, options, placeholder, icon: Icon }) {
  const opts = options.map(o => typeof o === 'string' ? { value: o, label: o } : o)
  const active = !!value
  return (
    <div className="relative mini-select" data-active={active ? '1' : '0'}>
      {Icon && !active && (
        <Icon className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: 'var(--muted)' }} />
      )}
      {active && (
        <span className="absolute left-2 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full pointer-events-none"
          style={{ background: '#6366F1' }} />
      )}
      <select value={value} onChange={e => onChange(e.target.value)}
        className={`appearance-none py-1.5 pr-6 rounded-md text-[12.5px] outline-none cursor-pointer transition-colors ${(Icon || active) ? 'pl-6' : 'pl-2.5'}`}
        style={{
          background: 'transparent',
          color: active ? '#4F46E5' : 'var(--text)',
          fontWeight: active ? 600 : 500,
          border: '1px solid transparent',
        }}>
        {placeholder && <option value="">{placeholder}</option>}
        {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none"
        style={{ color: active ? '#6366F1' : 'var(--muted)', opacity: 0.7 }} />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
function RecordCard({ record, onOpen }) {
  const f = record.fields
  const roleKey = f[F.role] || ''
  const roleStyle = ROLE_STYLE[roleKey] || ROLE_FALLBACK
  const RoleIcon = roleStyle.icon

  const saving    = num(f[F.savingAdjusted])
  const winAmount = num(f[F.winAmount])
  const rate      = winAmount > 0 ? saving / winAmount : num(f[F.saveRate])
  const catArr    = toArr(f[F.categoryBig])
  const cat       = catArr[0] || ''
  const catEmpty  = catArr.length === 0
  const attachCount = [F.priceAttach, F.roleAttach, F.marketAttach, F.otherAttach, F.quoteAttach]
    .reduce((s, fld) => s + (Array.isArray(f[fld]) ? f[fld].length : 0), 0)

  return (
    <button onClick={onOpen}
      className="card cost-card text-left w-full rounded-2xl p-5 group">
      {/* 顶部：角色 + 品类 */}
      <div className="flex items-center justify-between mb-4">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-semibold"
          style={{ background: roleStyle.bg, color: roleStyle.color }}>
          <RoleIcon className="w-2.5 h-2.5" />{roleStyle.label}
        </span>
        <span className="text-[10.5px] px-1.5 py-0.5 rounded"
          style={{
            color: catEmpty ? '#F59E0B' : 'var(--muted)',
            background: catEmpty ? 'rgba(245,158,11,0.1)' : 'transparent',
            fontWeight: catEmpty ? 600 : 400,
          }}>
          {catEmpty ? '未确认' : cat}
        </span>
      </div>

      {/* 标识：项目名 + 供应商（固定 2 行高度） */}
      <h3 className="text-[14.5px] font-semibold tracking-tight leading-tight truncate mb-1"
        style={{ color: 'var(--text)' }}>
        {f[F.projectName] || '未命名项目'}
      </h3>
      <p className="text-[11.5px] truncate mb-4" style={{ color: 'var(--muted)' }}>
        {f[F.supplier] || '—'}
      </p>

      {/* 英雄数字：降本金额 */}
      <div className="flex items-baseline gap-1.5 mb-1">
        <span className="text-[26px] font-bold tracking-tight leading-none" style={{ color: '#10B981' }}>
          ¥{fmtCNY(saving)}
        </span>
        <span className="text-[11px]" style={{ color: 'var(--muted)' }}>降本</span>
      </div>
      <p className="text-[11.5px] mb-4" style={{ color: 'var(--muted)' }}>
        降本率 <span className="font-semibold" style={{ color: 'var(--text)' }}>{fmtPct(rate)}</span>
        {' · '}
        合同 <span className="font-semibold" style={{ color: 'var(--text)' }}>¥{fmtCNY(winAmount)}</span>
      </p>

      {/* 弱化 meta */}
      <div className="flex items-center gap-3 text-[10.5px] pt-3"
        style={{ color: 'var(--muted)', borderTop: '1px solid var(--border)' }}>
        <span className="flex items-center gap-1">
          <Calendar className="w-3 h-3" />{fmtDate(f[F.projectDate]) || '—'}
        </span>
        {attachCount > 0 && (
          <span className="flex items-center gap-0.5">
            <Paperclip className="w-3 h-3" />{attachCount}
          </span>
        )}
      </div>
    </button>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
function DetailDrawer({ record, choices, onClose, onSaved, isAdmin }) {
  const f = record.fields
  const [edit, setEdit] = useState(false)
  const [draft, setDraft] = useState(() => pickEditable(f))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  async function save() {
    setSaving(true); setErr('')
    try {
      await updateCostLedger(record._id, draft)
      onSaved({ ...record, fields: { ...record.fields, ...draft } })
      setEdit(false)
    } catch (e) {
      setErr(e.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  function cancel() {
    setDraft(pickEditable(f))
    setEdit(false); setErr('')
  }

  const roleKey = f[F.role] || ''
  const roleStyle = ROLE_STYLE[roleKey] || ROLE_FALLBACK
  const roleGradient = ROLE_GRADIENT[roleKey] || 'linear-gradient(135deg,#64748b,#94a3b8)'
  const RoleIcon = roleStyle.icon
  const rate = num(f[F.winAmount]) > 0 ? num(f[F.savingAdjusted]) / num(f[F.winAmount]) : num(f[F.saveRate])

  return createPortal(
    <div className="fixed inset-0 z-[200] flex" onClick={onClose}
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)' }}>
      <div className="ml-auto w-full max-w-[720px] h-full overflow-y-auto animate-slide-in-right relative"
        onClick={e => e.stopPropagation()}
        style={{ background: 'var(--bg)', boxShadow: '-20px 0 40px rgba(0,0,0,0.2)' }}>

        {/* 顶栏 */}
        <header className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 backdrop-blur-md"
          style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-white shrink-0"
              style={{ background: roleGradient }}>
              <RoleIcon className="w-3 h-3" />{roleStyle.label}
            </span>
            <h2 className="text-[15px] font-bold truncate" style={{ color: 'var(--text)' }}>
              {f[F.projectName] || '项目详情'}
            </h2>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!edit ? (
              <button onClick={() => setEdit(true)}
                className="press flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-medium transition-colors"
                style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}>
                <Edit3 className="w-3.5 h-3.5" />编辑
              </button>
            ) : (
              <>
                <button onClick={cancel} disabled={saving}
                  className="press px-3 py-1.5 rounded-xl text-[12px] font-medium transition-colors"
                  style={{ background: 'var(--surface2)', color: 'var(--muted)' }}>取消</button>
                <button onClick={save} disabled={saving}
                  className="press flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold text-white transition-colors disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg,#6366F1,#8B5CF6)' }}>
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  保存
                </button>
              </>
            )}
            <button onClick={onClose}
              className="press w-8 h-8 flex items-center justify-center rounded-xl"
              style={{ background: 'var(--surface2)', color: 'var(--muted)' }}>
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        {err && (
          <div className="mx-6 mt-4 p-3 rounded-xl text-[12px] flex items-center gap-2"
            style={{ background: 'rgba(239,68,68,0.08)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.2)' }}>
            <AlertCircle className="w-3.5 h-3.5" />{err}
          </div>
        )}

        <div className="p-6 space-y-5">
          {/* 金额大卡 */}
          <div className="rounded-2xl p-5 relative overflow-hidden"
            style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(139,92,246,0.04))', border: '1px solid var(--border)' }}>
            <div className="grid grid-cols-3 gap-4">
              <BigMetric label="中标金额"    value={fmtCNY(f[F.winAmount])}       unit="元" color="var(--text)" />
              <BigMetric label="调整后降本"  value={fmtCNY(f[F.savingAdjusted])}  unit="元" color="#10B981" />
              <BigMetric label="降本率"      value={fmtPct(rate).replace('%','')} unit="%" color="#F59E0B" />
            </div>
          </div>

          {/* 项目只读信息 */}
          <Section title="项目信息" icon={FileText}>
            <KV label="需求部门"   value={f[F.requestDept]} />
            <KV label="立项单号"   value={f[F.projectNo]} />
            <KV label="合同号"     value={f[F.contractNo]} />
            <KV label="中标供应商" value={f[F.supplier]} />
            <KV label="一级品类"   value={f[F.category1]} />
            <KV label="采购组织"   value={f[F.buyerOrg]} />
            <KV label="立项时间"   value={fmtDate(f[F.projectDate])} />
            <KV label="授标时间"   value={fmtDate(f[F.grantTime])} />
            <KV label="合同结束"   value={fmtDate(f[F.contractEndMax]) || f[F.contractEnd]} />
            {isAdmin && <KV label="采购员" value={`${f[F.buyerName] || ''} ${f[F.buyerJobId] ? '('+f[F.buyerJobId]+')' : ''}`.trim()} />}
          </Section>

          {/* 系统计算值（只读） */}
          <Section title="系统计算" icon={TrendingDown}>
            <KV label="核算后降本金额" value={fmtCNY(f[F.savingAfter])} />
            <KV label="系统降本金额"   value={fmtCNY(f[F.systemSaving])} />
          </Section>

          {/* 可编辑：按 ⭐ 分组 */}
          {EDITABLE_GROUPS.map(g => (
            <Section key={g.title} title={g.title} icon={g.stars >= 3 ? Star : (g.stars >= 1 ? Sparkles : Edit3)} stars={g.stars} hint={edit ? '编辑中' : '点击右上角「编辑」修改'}>
              {g.fields.map(meta => (
                <EditableRow key={meta.name} meta={meta}
                  value={edit ? draft[meta.name] : f[meta.name]}
                  onChange={v => setDraft(d => ({ ...d, [meta.name]: v }))}
                  choices={choices[meta.name] || []}
                  edit={edit} />
              ))}
            </Section>
          ))}

          {/* 附件（只读） */}
          <Section title="附件资料" icon={Paperclip}>
            <AttachBlock label="历史采购价 / 市场平均价" list={getAttachments(record, F.priceAttach)} />
            <AttachBlock label="业务认可的角色截图"       list={getAttachments(record, F.roleAttach)} />
            <AttachBlock label="市场成本分析数据"         list={getAttachments(record, F.marketAttach)} />
            <AttachBlock label="其他附件"                 list={getAttachments(record, F.otherAttach)} />
          </Section>
        </div>
      </div>
    </div>,
    document.body
  )
}

function BigMetric({ label, value, unit, color }) {
  return (
    <div>
      <div className="text-[11px] font-medium mb-1" style={{ color: 'var(--muted)' }}>{label}</div>
      <div className="flex items-baseline gap-1">
        <span className="text-[22px] font-bold tracking-tight leading-none" style={{ color }}>{value}</span>
        <span className="text-[11px]" style={{ color: 'var(--muted)' }}>{unit}</span>
      </div>
    </div>
  )
}

function Section({ title, icon: Icon, hint, stars = 0, children }) {
  const starColor = stars >= 3 ? '#F59E0B' : (stars >= 1 ? '#6366F1' : null)
  return (
    <section className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="px-5 py-3 flex items-center gap-2" style={{ borderBottom: '1px solid var(--border)' }}>
        <Icon className="w-3.5 h-3.5" style={{ color: starColor || '#6366F1' }} />
        {stars > 0 && (
          <span className="text-[11px] tracking-tighter" style={{ color: starColor }}>
            {'★'.repeat(stars)}
          </span>
        )}
        <h4 className="text-[12.5px] font-bold" style={{ color: 'var(--text)' }}>{title}</h4>
        {hint && <span className="text-[10.5px] ml-auto" style={{ color: 'var(--muted)' }}>{hint}</span>}
      </div>
      <div className="p-5 space-y-3">
        {children}
      </div>
    </section>
  )
}

// 可编辑行：按字段类型分发（text / longText / number / singleSelect / multipleSelect）
function EditableRow({ meta, value, onChange, choices, edit }) {
  const { name, type, unit } = meta
  // 原始字段名中若带 ⭐⭐⭐ 前缀，提取出来用金色强调
  const starMatch = name.match(/^(⭐+)(.*)$/)
  const starPrefix = starMatch?.[1] || ''
  const rawLabel = (starMatch?.[2] ?? name).trim()

  const labelBlock = (
    <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
      {starPrefix && (
        <span className="text-[11px] tracking-tighter"
          style={{ color: starPrefix.length >= 3 ? '#F59E0B' : '#6366F1' }}>
          {starPrefix}
        </span>
      )}
      <span className="text-[11.5px] font-medium break-all" style={{ color: 'var(--text)', opacity: 0.8 }}>{rawLabel}</span>
      {unit && <span className="text-[10.5px]" style={{ color: 'var(--muted)', opacity: 0.7 }}>（{unit}）</span>}
    </div>
  )

  // 只读展示
  if (!edit) {
    const display = (() => {
      if (value === null || value === undefined || value === '') return '—'
      if (Array.isArray(value)) return value.length ? value.join(' · ') : '—'
      if (type === 'number') return fmtCNY(value)
      return String(value)
    })()
    const isEmpty = display === '—'
    return (
      <div>
        {labelBlock}
        <div className="text-[12.5px] leading-relaxed whitespace-pre-wrap rounded-xl px-3 py-2"
          style={{ background: 'var(--surface2)', color: isEmpty ? 'var(--muted)' : 'var(--text)', minHeight: 38 }}>
          {display}
        </div>
      </div>
    )
  }

  // 编辑态：按类型渲染
  return (
    <div>
      {labelBlock}
      {type === 'longText' ? (
        <textarea value={value || ''} onChange={e => onChange(e.target.value)} rows={3}
          className="w-full px-3 py-2 rounded-xl text-[12.5px] outline-none resize-y"
          style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }} />
      ) : type === 'number' ? (
        <input type="number" step="any" value={value ?? ''} onChange={e => onChange(e.target.value)}
          className="w-full px-3 py-2 rounded-xl text-[12.5px] outline-none tabular-nums"
          style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }} />
      ) : type === 'singleSelect' ? (
        <SingleSelectEditor value={value || ''} onChange={onChange} choices={choices} />
      ) : type === 'multipleSelect' ? (
        <MultiSelectEditor value={Array.isArray(value) ? value : (value ? [value] : [])} onChange={onChange} choices={choices} />
      ) : (
        <input value={value ?? ''} onChange={e => onChange(e.target.value)}
          className="w-full px-3 py-2 rounded-xl text-[12.5px] outline-none"
          style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }} />
      )}
    </div>
  )
}

function SingleSelectEditor({ value, onChange, choices }) {
  return (
    <div className="relative">
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full appearance-none px-3 pr-8 py-2 rounded-xl text-[12.5px] outline-none cursor-pointer"
        style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}>
        <option value="">— 请选择 —</option>
        {choices.map(c => (
          <option key={c.name} value={c.name}>{c.name}</option>
        ))}
      </select>
      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: 'var(--muted)' }} />
    </div>
  )
}

function MultiSelectEditor({ value, onChange, choices }) {
  const set = new Set(value)
  function toggle(name) {
    const next = new Set(set)
    if (next.has(name)) next.delete(name); else next.add(name)
    onChange([...next])
  }
  if (!choices.length) {
    return (
      <div className="text-[11.5px] rounded-xl px-3 py-2"
        style={{ background: 'var(--surface2)', color: 'var(--muted)' }}>
        （未加载到选项）
      </div>
    )
  }
  return (
    <div className="flex flex-wrap gap-1.5 rounded-xl p-2"
      style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
      {choices.map(c => {
        const active = set.has(c.name)
        return (
          <button key={c.name} type="button" onClick={() => toggle(c.name)}
            className="press inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11.5px] font-medium transition-colors"
            style={{
              background: active ? 'rgba(99,102,241,0.12)' : 'var(--surface)',
              color: active ? '#4F46E5' : 'var(--muted)',
              border: `1px solid ${active ? 'rgba(99,102,241,0.3)' : 'var(--border)'}`,
            }}>
            {active && <Check className="w-3 h-3" />}
            {c.name}
          </button>
        )
      })}
    </div>
  )
}

function KV({ label, value }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div className="flex gap-4 text-[12.5px] leading-relaxed">
      <span className="shrink-0 w-[110px]" style={{ color: 'var(--muted)' }}>{label}</span>
      <span className="flex-1 break-all" style={{ color: 'var(--text)' }}>{value}</span>
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

// ═══════════════════════════════════════════════════════════════════════════════
function ErrorState({ msg, onRetry }) {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="max-w-md w-full rounded-2xl p-6 text-center"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <AlertCircle className="w-8 h-8 mx-auto mb-3" style={{ color: '#F59E0B' }} />
        <p className="text-[13px] font-semibold mb-1" style={{ color: 'var(--text)' }}>加载失败</p>
        <p className="text-[11.5px] mb-4" style={{ color: 'var(--muted)' }}>{msg}</p>
        <button onClick={onRetry}
          className="press px-4 py-2 rounded-xl text-[12px] font-semibold text-white"
          style={{ background: 'linear-gradient(135deg,#6366F1,#8B5CF6)' }}>
          重试
        </button>
      </div>
    </div>
  )
}

function Empty({ hasData }) {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="text-center">
        <div className="w-16 h-16 mx-auto mb-3 rounded-full flex items-center justify-center"
          style={{ background: 'var(--surface2)' }}>
          <FileText className="w-7 h-7" style={{ color: 'var(--muted)' }} />
        </div>
        <p className="text-[13px] font-medium mb-1" style={{ color: 'var(--text)' }}>
          {hasData ? '没有符合条件的单据' : '暂无您的成本台账记录'}
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
function uniq(arr) { return [...new Set(arr.filter(Boolean))] }
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
