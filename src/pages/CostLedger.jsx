import { useState, useEffect, useMemo } from 'react'
import {
  Wallet, Search, Loader2, AlertCircle, ExternalLink, X,
  Crown, User, Sparkles, FileText, TrendingDown, Package,
  Calendar, Building2, Paperclip, Save, Edit3, SlidersHorizontal,
  ArrowDownAZ, ArrowUpAZ, TrendingUp,
} from 'lucide-react'
import { createPortal } from 'react-dom'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import {
  listCostLedger, updateCostLedger, getAttachments,
  fmtCNY, fmtPct, isCostLedgerConfigured, F, EDITABLE,
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

const TEABLE_SHARE = 'https://yach-teable.zhiyinlou.com/share/shrlzdx0BtJxMDu0294/view'

export default function CostLedger() {
  const { dark } = useTheme()
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'

  const [rows,    setRows]    = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const [picked,  setPicked]  = useState(null)

  const [keyword, setKeyword] = useState('')
  const [role,    setRole]    = useState('')
  const [cat,     setCat]     = useState('')
  const [sort,    setSort]    = useState('saving-desc')

  useEffect(() => { load() }, [profile?.jobId, profile?.role])

  async function load() {
    if (!isCostLedgerConfigured()) {
      setError('未配置成本台账表'); setLoading(false); return
    }
    setLoading(true); setError('')
    try {
      const data = await listCostLedger(profile)
      setRows(data)
    } catch (e) {
      setError(e.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }

  // 筛选 / 排序
  const roleOpts = useMemo(() => uniq(rows.map(r => r.fields[F.role])), [rows])
  const catOpts  = useMemo(() => uniq(rows.flatMap(r => toArr(r.fields[F.categoryBig]))), [rows])

  const view = useMemo(() => {
    let v = rows.slice()
    const kw = keyword.trim().toLowerCase()
    if (kw) {
      v = v.filter(r => {
        const f = r.fields
        return [f[F.projectName], f[F.supplier], f[F.contractNo], f[F.requestDept]]
          .some(x => String(x || '').toLowerCase().includes(kw))
      })
    }
    if (role) v = v.filter(r => r.fields[F.role] === role)
    if (cat)  v = v.filter(r => toArr(r.fields[F.categoryBig]).includes(cat))
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
  }, [rows, keyword, role, cat, sort])

  // 概览统计
  const stats = useMemo(() => {
    const total = rows.length
    const totalSaving = rows.reduce((s, r) => s + num(r.fields[F.savingAdjusted]), 0)
    const totalWin    = rows.reduce((s, r) => s + num(r.fields[F.winAmount]), 0)
    const avgRate     = totalWin > 0 ? totalSaving / totalWin : 0
    const leadCount   = rows.filter(r => r.fields[F.role] === '主导者').length
    return { total, totalSaving, avgRate, leadCount }
  }, [rows])

  if (error) {
    return (
      <ErrorState msg={error} onRetry={load} />
    )
  }

  return (
    <div className="space-y-5 pb-6">
      {/* 标题 + 概览 */}
      <Header isAdmin={isAdmin} />

      <StatGrid s={stats} dark={dark} />

      {/* 过滤工具栏 */}
      <Toolbar
        keyword={keyword} setKeyword={setKeyword}
        role={role}       setRole={setRole}       roleOpts={roleOpts}
        cat={cat}         setCat={setCat}         catOpts={catOpts}
        sort={sort}       setSort={setSort}
        count={view.length}
      />

      {/* 列表区 */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--muted)' }} />
        </div>
      ) : view.length === 0 ? (
        <Empty hasData={rows.length > 0} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4">
          {view.map(r => (
            <RecordCard key={r._id} record={r} onOpen={() => setPicked(r)} />
          ))}
        </div>
      )}

      {/* 详情抽屉 */}
      {picked && (
        <DetailDrawer
          record={picked}
          onClose={() => setPicked(null)}
          onSaved={upd => { setRows(rs => rs.map(r => r._id === upd._id ? upd : r)); setPicked(upd) }}
          isAdmin={isAdmin}
        />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
function Header({ isAdmin }) {
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 shadow-lg"
          style={{ background: 'linear-gradient(135deg,#6366F1,#8B5CF6)', boxShadow: '0 8px 20px -8px rgba(99,102,241,0.5)' }}>
          <Wallet className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-[20px] font-bold tracking-tight" style={{ color: 'var(--text)' }}>成本台账</h1>
          <p className="text-[12px] mt-0.5" style={{ color: 'var(--muted)' }}>
            {isAdmin ? '管理员视图 · 全部数据' : '仅显示您作为采购员参与的单据'}
          </p>
        </div>
      </div>
      <a href={TEABLE_SHARE} target="_blank" rel="noopener noreferrer"
        className="press flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12px] font-medium transition-colors"
        style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}>
        <ExternalLink className="w-3.5 h-3.5" />原表
      </a>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
function StatGrid({ s, dark }) {
  const items = [
    { label: '单据总数',    value: s.total,                     unit: '笔',  color: '#6366F1', icon: FileText },
    { label: '累计降本金额', value: fmtCNY(s.totalSaving),       unit: '元',  color: '#10B981', icon: TrendingDown },
    { label: '平均降本率',   value: fmtPct(s.avgRate).replace('%',''), unit: '%', color: '#F59E0B', icon: TrendingUp },
    { label: '主导项目数',   value: s.leadCount,                 unit: '笔',  color: '#EF4444', icon: Crown },
  ]
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {items.map(it => (
        <div key={it.label} className="rounded-2xl p-4 relative overflow-hidden"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="absolute -right-6 -top-6 w-20 h-20 rounded-full opacity-[0.08]"
            style={{ background: it.color }} />
          <div className="flex items-center gap-2 text-[11px] font-medium mb-2" style={{ color: 'var(--muted)' }}>
            <it.icon className="w-3.5 h-3.5" style={{ color: it.color }} />{it.label}
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-[22px] font-bold tracking-tight leading-none" style={{ color: 'var(--text)' }}>{it.value}</span>
            <span className="text-[11px]" style={{ color: 'var(--muted)' }}>{it.unit}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
function Toolbar({ keyword, setKeyword, role, setRole, roleOpts, cat, setCat, catOpts, sort, setSort, count }) {
  return (
    <div className="rounded-2xl p-3 flex items-center gap-2.5 flex-wrap"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
        <input value={keyword} onChange={e => setKeyword(e.target.value)}
          placeholder="搜索项目 / 供应商 / 合同号…"
          className="w-full pl-9 pr-3 py-2 rounded-xl text-[13px] outline-none transition-colors"
          style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid transparent' }} />
      </div>

      <Select value={role} onChange={setRole} placeholder="全部角色" options={roleOpts} />
      <Select value={cat}  onChange={setCat}  placeholder="全部品类" options={catOpts} />

      <Select value={sort} onChange={setSort} options={[
        { value: 'saving-desc', label: '按降本金额' },
        { value: 'rate-desc',   label: '按降本率'   },
        { value: 'amount-desc', label: '按合同金额' },
        { value: 'time-desc',   label: '按时间'     },
      ]} icon={SlidersHorizontal} />

      <div className="text-[11px] ml-auto px-2" style={{ color: 'var(--muted)' }}>
        共 <span className="font-semibold" style={{ color: 'var(--text)' }}>{count}</span> 条
      </div>
    </div>
  )
}

function Select({ value, onChange, options, placeholder, icon: Icon }) {
  const opts = options.map(o => typeof o === 'string' ? { value: o, label: o } : o)
  return (
    <div className="relative">
      {Icon && <Icon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: 'var(--muted)' }} />}
      <select value={value} onChange={e => onChange(e.target.value)}
        className={`appearance-none py-2 pr-7 ${Icon ? 'pl-8' : 'pl-3'} rounded-xl text-[12.5px] outline-none cursor-pointer`}
        style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid transparent' }}>
        {placeholder && <option value="">{placeholder}</option>}
        {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
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
  const cat       = toArr(f[F.categoryBig])[0]
  const attachCount = [F.priceAttach, F.roleAttach, F.marketAttach, F.otherAttach, F.quoteAttach]
    .reduce((s, fld) => s + (Array.isArray(f[fld]) ? f[fld].length : 0), 0)

  return (
    <button onClick={onOpen}
      className="card text-left w-full rounded-2xl p-5">
      {/* 顶部：角色 + 品类 */}
      <div className="flex items-center justify-between mb-4">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-semibold"
          style={{ background: roleStyle.bg, color: roleStyle.color }}>
          <RoleIcon className="w-2.5 h-2.5" />{roleStyle.label}
        </span>
        {cat && (
          <span className="text-[10.5px]" style={{ color: 'var(--muted)' }}>{cat}</span>
        )}
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
function DetailDrawer({ record, onClose, onSaved, isAdmin }) {
  const f = record.fields
  const [edit, setEdit] = useState(false)
  const [draft, setDraft] = useState(() => pick(f, EDITABLE))
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
    setDraft(pick(f, EDITABLE))
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

          {/* 基本信息 */}
          <Section title="项目信息" icon={FileText}>
            <KV label="需求部门"       value={f[F.requestDept]} />
            <KV label="立项单号"       value={f[F.projectNo]} />
            <KV label="合同号"         value={f[F.contractNo]} />
            <KV label="中标供应商"     value={f[F.supplier]} />
            <KV label="一级品类"       value={f[F.category1]} />
            <KV label="采购品类(大类)" value={toArr(f[F.categoryBig]).join(' / ')} />
            <KV label="采购组织"       value={f[F.buyerOrg]} />
            {isAdmin && <KV label="采购员" value={`${f[F.buyerName] || ''} ${f[F.buyerJobId] ? '('+f[F.buyerJobId]+')' : ''}`.trim()} />}
          </Section>

          {/* 时间信息 */}
          <Section title="时间节点" icon={Calendar}>
            <KV label="立项时间"       value={fmtDate(f[F.projectDate])} />
            <KV label="授标时间"       value={fmtDate(f[F.grantTime])} />
            <KV label="结项审批通过"   value={f[F.approveTime]} />
            <KV label="合同开始"       value={f[F.contractStart]} />
            <KV label="合同结束"       value={fmtDate(f[F.contractEndMax]) || f[F.contractEnd]} />
          </Section>

          {/* 降本明细 */}
          <Section title="降本明细" icon={TrendingDown}>
            <KV label="核算后降本金额" value={fmtCNY(f[F.savingAfter])} />
            <KV label="系统降本金额"   value={fmtCNY(f[F.systemSaving])} />
            <KV label="FY27 核对"     value={fmtCNY(f[F.fy27Correct])} />
            <KV label="FY28 预估"     value={fmtCNY(f[F.fy28Est])} />
            <KV label="FY28 加权"     value={fmtCNY(f[F.fy28Correct])} />
            <KV label="FY29 预估"     value={fmtCNY(f[F.fy29Est])} />
            <KV label="FY29 加权"     value={fmtCNY(f[F.fy29Correct])} />
            <KV label="核心降本方式"   value={toArr(f[F.saveMethods]).map(m => (
              <span key={m} className="inline-block mr-1 mb-1 px-2 py-0.5 rounded-md text-[10.5px]"
                style={{ background: 'rgba(99,102,241,0.1)', color: '#6366F1' }}>{m}</span>
            ))} />
            <KV label="成本核算节约方式" value={f[F.saveMethod]} />
          </Section>

          {/* 可编辑区 */}
          <Section title="角色说明与降本举措" icon={Sparkles} hint="以下字段可编辑">
            <EditableField label="主导角色原因说明" name={F.roleReason}
              value={edit ? draft[F.roleReason] : f[F.roleReason]}
              onChange={v => setDraft(d => ({ ...d, [F.roleReason]: v }))}
              edit={edit} multiline />
            <EditableField label="在项目中的降本贡献度" name={F.saveContribution}
              value={edit ? draft[F.saveContribution] : f[F.saveContribution]}
              onChange={v => setDraft(d => ({ ...d, [F.saveContribution]: v }))}
              edit={edit} />
            <EditableField label="具体降本举措" name={F.saveMeasures}
              value={edit ? draft[F.saveMeasures] : f[F.saveMeasures]}
              onChange={v => setDraft(d => ({ ...d, [F.saveMeasures]: v }))}
              edit={edit} multiline />
            <EditableField label="历史采购价 / 市场平均价描述" name={F.priceDesc}
              value={edit ? draft[F.priceDesc] : f[F.priceDesc]}
              onChange={v => setDraft(d => ({ ...d, [F.priceDesc]: v }))}
              edit={edit} multiline />
            <EditableField label="其他备注" name={F.remark}
              value={edit ? draft[F.remark] : f[F.remark]}
              onChange={v => setDraft(d => ({ ...d, [F.remark]: v }))}
              edit={edit} multiline />
          </Section>

          {/* 附件 */}
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

function Section({ title, icon: Icon, hint, children }) {
  return (
    <section className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="px-5 py-3 flex items-center gap-2" style={{ borderBottom: '1px solid var(--border)' }}>
        <Icon className="w-3.5 h-3.5" style={{ color: '#6366F1' }} />
        <h4 className="text-[12.5px] font-bold" style={{ color: 'var(--text)' }}>{title}</h4>
        {hint && <span className="text-[10.5px] ml-auto" style={{ color: 'var(--muted)' }}>{hint}</span>}
      </div>
      <div className="p-5 space-y-3">
        {children}
      </div>
    </section>
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

function EditableField({ label, value, onChange, edit, multiline }) {
  return (
    <div>
      <div className="text-[11.5px] font-medium mb-1.5" style={{ color: 'var(--muted)' }}>{label}</div>
      {edit ? (
        multiline ? (
          <textarea value={value || ''} onChange={e => onChange(e.target.value)} rows={3}
            className="w-full px-3 py-2 rounded-xl text-[12.5px] outline-none resize-y"
            style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }} />
        ) : (
          <input value={value || ''} onChange={e => onChange(e.target.value)}
            className="w-full px-3 py-2 rounded-xl text-[12.5px] outline-none"
            style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }} />
        )
      ) : (
        <div className="text-[12.5px] leading-relaxed whitespace-pre-wrap rounded-xl px-3 py-2"
          style={{ background: 'var(--surface2)', color: value ? 'var(--text)' : 'var(--muted)', minHeight: 38 }}>
          {value || '—'}
        </div>
      )}
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
function pick(obj, keys) {
  const out = {}; for (const k of keys) out[k] = obj[k] ?? ''
  return out
}
function fmtDate(v) {
  if (!v) return ''
  const d = new Date(v)
  if (!Number.isFinite(d.getTime())) return String(v)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
