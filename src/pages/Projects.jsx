import { useState, useEffect, useMemo } from 'react'
import { Search, RefreshCw, Plus, ChevronDown, ExternalLink, Pencil, CheckCircle, XCircle, ChevronRight, History, FileText, Copy, Check, Sparkles, Loader2 } from 'lucide-react'
import { listProjects, createProject, updateProject, isConfigured, F } from '../lib/teableProjects'
import { notifyApproved } from '../lib/notify'
import { generateMonthlySummary } from '../lib/aiSummary'
import { useAuth } from '../contexts/AuthContext'
import { Modal } from './Dashboard'

const STATUS_CFG = {
  '未开始': { bg:'rgba(100,116,139,0.1)',  color:'#64748B', dot:'#94A3B8' },
  '进行中': { bg:'rgba(99,102,241,0.1)',   color:'#6366F1', dot:'#818CF8' },
  '已完成': { bg:'rgba(16,185,129,0.1)',   color:'#059669', dot:'#10B981' },
  '逾期':   { bg:'rgba(244,63,94,0.1)',    color:'#E11D48', dot:'#F43F5E' },
  '暂停':   { bg:'rgba(245,158,11,0.1)',   color:'#B45309', dot:'#F59E0B' },
}
const REVIEW_CFG = {
  '待审核': { bg:'rgba(245,158,11,0.1)',  color:'#B45309', dot:'#F59E0B' },
  '已审核': { bg:'rgba(16,185,129,0.1)',  color:'#059669', dot:'#10B981' },
  '已驳回': { bg:'rgba(244,63,94,0.1)',   color:'#E11D48', dot:'#F43F5E' },
}
const ORG_CFG = {
  '运营分析组':       { bg:'rgba(14,165,233,0.1)',  color:'#0284C7' },
  '采购稽核组':       { bg:'rgba(16,185,129,0.1)',  color:'#059669' },
  '支付类合作商管理组': { bg:'rgba(245,158,11,0.1)', color:'#B45309' },
}
const STATUS_BAR_CLR = {
  '未开始':'#94A3B8', '进行中':'#6366F1', '已完成':'#10B981', '逾期':'#F43F5E', '暂停':'#F59E0B',
}
const STATUS_COLS = ['全部','未开始','进行中','已完成','逾期','暂停']
const ORG_OPTS    = ['运营分析组', '采购稽核组', '支付类合作商管理组']

export default function Projects() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [rows,    setRows]    = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [search,  setSearch]  = useState('')
  const [filter,  setFilter]  = useState('全部')
  const [orgFilter, setOrgFilter] = useState('全部')
  const [expanded, setExp]    = useState(null)
  const [formRow, setFormRow] = useState(null)
  const [historyRow, setHistoryRow] = useState(null)
  const [reportOpen, setReportOpen] = useState(false)
  const [showGantt, setShowGantt] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true); setError(null)
    try { setRows(await listProjects()) } catch(e) { setError(e.message) } finally { setLoading(false) }
  }

  async function handleReview(row, status) {
    try {
      await updateProject(
        row._id,
        { [F.reviewStatus]: status },
        { by: profile?.email, action: status === '已审核' ? '审核通过' : '审核驳回', note: '' },
        row.history
      )
      // 审核通过时触发数环通通知并给出反馈
      if (status === '已审核') {
        const result = await notifyApproved(row)
        if (result) {
          if (result.ok) alert(`✅ 审核通过\n数环通通知：${result.msg}`)
          else alert(`✅ 审核通过\n⚠️ 数环通通知未发送：${result.msg}`)
        }
      }
      load()
    } catch(e) { alert('操作失败：'+e.message) }
  }

  const shown = useMemo(() => rows.filter(r =>
    (filter === '全部' || r.status === filter) &&
    (orgFilter === '全部' || r.org === orgFilter) &&
    (!search || r.task?.includes(search) || r.owner?.includes(search) || r.id?.includes(search) || r.ownerJobId?.includes(search))
  ), [rows, search, filter, orgFilter])

  const counts = useMemo(() => {
    const base = orgFilter === '全部' ? rows : rows.filter(r => r.org === orgFilter)
    const c = { '全部': base.length }
    Object.keys(STATUS_CFG).forEach(s => { c[s] = base.filter(r => r.status === s).length })
    return c
  }, [rows, orgFilter])

  if (!isConfigured()) return (
    <div className="max-w-lg space-y-4 animate-page-in">
      <h2 className="text-xl font-bold" style={{ color:'var(--text)' }}>项目进度</h2>
      <div className="card p-7 text-center">
        <div className="text-5xl mb-3">⚙️</div>
        <h3 className="font-semibold mb-2" style={{ color:'var(--text)' }}>项目表未配置</h3>
        <pre className="text-xs p-3 rounded-xl text-left" style={{ background:'var(--surface2)', color:'var(--muted)', border:'1px solid var(--border)' }}>
{`VITE_TEABLE_PROJECTS_TABLE_ID=tblGO47wMm51IEBRFpq`}
        </pre>
      </div>
    </div>
  )

  return (
    <div className="space-y-4 animate-page-in">
      {/* 页头 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold" style={{ color:'var(--text)' }}>项目进度</h2>
          <p className="text-sm mt-0.5" style={{ color:'var(--muted)' }}>实时跟踪团队任务状态</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button onClick={load} disabled={loading}
            className="press flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium disabled:opacity-50"
            style={{ background:'var(--surface)', border:'1px solid var(--border)', color:'var(--muted)' }}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading?'animate-spin':''}`} />刷新
          </button>
          <button onClick={() => setReportOpen(true)}
            className="press flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium"
            style={{ background:'var(--surface)', border:'1px solid var(--border)', color:'var(--muted)' }}>
            <FileText className="w-3.5 h-3.5" /> 月报
          </button>
          <button onClick={() => setFormRow({})}
            className="press flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold text-white"
            style={{ background:'#6366F1' }}>
            <Plus className="w-4 h-4" /> 新建项目
          </button>
        </div>
      </div>

      {/* 甘特图概览 */}
      {!loading && rows.length > 0 && (
        <div className="card overflow-hidden">
          <button className="w-full flex items-center justify-between px-4 py-3 text-left"
            onClick={() => setShowGantt(v => !v)}
            style={{ borderBottom: showGantt ? '1px solid var(--border)' : 'none' }}>
            <span className="text-sm font-semibold" style={{ color:'var(--text)' }}>项目时间轴概览</span>
            <ChevronRight className={`w-4 h-4 transition-transform duration-200 ${showGantt?'rotate-90':''}`}
              style={{ color:'var(--muted)' }} />
          </button>
          {showGantt && <GanttChart rows={rows} />}
        </div>
      )}

      {/* 采购组织筛选 */}
      <div className="flex flex-wrap gap-2">
        {['全部', ...ORG_OPTS].map(o => {
          const active = orgFilter === o
          const cfg = ORG_CFG[o]
          return (
            <button key={o} onClick={() => setOrgFilter(o)}
              className="press flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold"
              style={active
                ? { background: cfg?.color ?? '#6366F1', color:'#fff' }
                : { background:'var(--surface)', color:'var(--text)', border:'1px solid var(--border)' }
              }>
              {o === '全部' ? '🏢 全部组织' : o}
            </button>
          )
        })}
      </div>

      {/* 完成状态筛选 */}
      <div className="flex flex-wrap gap-2">
        {STATUS_COLS.map(s => {
          const active = filter === s
          const cfg = STATUS_CFG[s]
          return (
            <button key={s} onClick={() => setFilter(s)}
              className="press flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold"
              style={active
                ? { background:'#6366F1', color:'#fff' }
                : { background:'var(--surface)', color:'var(--text)', border:'1px solid var(--border)' }
              }>
              {cfg && <span className="w-1.5 h-1.5 rounded-full" style={{ background:active?'rgba(255,255,255,0.55)':cfg.dot }} />}
              {s}
              <span style={{ color:active?'rgba(255,255,255,0.55)':'var(--muted)' }}>{counts[s]??0}</span>
            </button>
          )
        })}
      </div>

      {/* 搜索 */}
      <div className="relative max-w-xs">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color:'var(--muted)', opacity:0.55 }} />
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="搜索任务、责任人、工号…"
          className="field pl-10" />
      </div>

      {/* 表格 */}
      {error ? (
        <div className="card p-8 text-center">
          <p className="text-sm" style={{ color:'#F43F5E' }}>加载失败：{error}</p>
          <button onClick={load} className="press mt-3 text-xs text-indigo-500 hover:opacity-70 font-medium">重试</button>
        </div>
      ) : loading ? (
        <div className="card p-16 flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 animate-spin"
            style={{ borderColor:'rgba(99,102,241,0.15)', borderTopColor:'#6366F1' }} />
          <p className="text-sm" style={{ color:'var(--muted)' }}>加载中…</p>
        </div>
      ) : shown.length===0 ? (
        <div className="card p-16 text-center">
          <p className="text-4xl mb-3">📋</p>
          <p className="text-sm" style={{ color:'var(--muted)' }}>暂无数据{search && `（搜索：${search}）`}</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth:1200 }}>
              <thead>
                <tr style={{ borderBottom:'1px solid var(--border)', background:'var(--surface2)' }}>
                  {['编号','工作任务','发布时间','计划完成','实际完成','当前进展','状态','审核','采购组织','责任人','交付成果','操作'].map((h,i)=>(
                    <th key={h} className={`px-3.5 py-3 text-left text-[11px] font-semibold tracking-wide whitespace-nowrap ${i===11?'text-right':''}`}
                      style={{ color:'var(--muted)', minWidth:i===1?200:i===5?160:i===11?120:i===10?100:80 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map(row => (
                  <Row key={row._id} row={row} isAdmin={isAdmin} userEmail={profile?.email}
                    open={expanded===row._id} onToggle={() => setExp(expanded===row._id ? null : row._id)}
                    onEdit={() => setFormRow(row)}
                    onReview={handleReview}
                    onHistory={() => setHistoryRow(row)} />
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2.5 text-[11px] font-medium" style={{ borderTop:'1px solid var(--border)', color:'var(--muted)' }}>
            {shown.length} 条{shown.length<rows.length ? ` / 共 ${rows.length} 条` : ''}
          </div>
        </div>
      )}

      {/* 历史记录弹窗 */}
      {historyRow && <HistoryModal row={historyRow} onClose={() => setHistoryRow(null)} />}

      {/* 月报弹窗 */}
      {reportOpen && <MonthlyReport rows={rows} onClose={() => setReportOpen(false)} />}

      {/* 新建/编辑弹窗 */}
      {formRow !== null && (
        <ProjectForm initial={formRow} userEmail={profile?.email} userName={profile?.displayName}
          isAdmin={isAdmin}
          onClose={() => setFormRow(null)}
          onSave={async fields => {
            if (formRow._id) {
              await updateProject(
                formRow._id, fields,
                { by: profile?.email, action: '编辑项目' },
                formRow.history || []
              )
            } else {
              await createProject(fields, profile?.email)
            }
            setFormRow(null); load()
          }} />
      )}
    </div>
  )
}

// ─── 甘特图 ────────────────────────────────────────────────────────────────────
function GanttChart({ rows }) {
  const today = new Date(); today.setHours(0,0,0,0)
  const winStart = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  const winEnd   = new Date(today.getFullYear(), today.getMonth() + 4, 0)
  const totalMs  = winEnd - winStart

  function toPct(dateStr) {
    if (!dateStr) return null
    const ms = new Date(dateStr) - winStart
    return Math.max(0, Math.min(100, (ms / totalMs) * 100))
  }

  const months = []
  let m = new Date(winStart.getFullYear(), winStart.getMonth(), 1)
  while (m <= winEnd) {
    months.push({ pct: toPct(m), label: `${m.getMonth()+1}月` })
    m = new Date(m.getFullYear(), m.getMonth()+1, 1)
  }

  const todayPct = toPct(today)
  const items = rows
    .filter(r => r.startDate)
    .sort((a,b) => new Date(a.startDate) - new Date(b.startDate))
    .slice(0, 14)

  if (items.length === 0) return (
    <div className="px-4 py-6 text-center text-sm" style={{ color:'var(--muted)' }}>暂无项目日期数据</div>
  )

  const LABEL_W = 72
  return (
    <div className="px-4 pt-2 pb-4">
      <div className="flex flex-wrap gap-3 mb-3">
        {Object.entries(STATUS_BAR_CLR).map(([s,c]) => (
          <span key={s} className="flex items-center gap-1.5 text-[10px]" style={{ color:'var(--muted)' }}>
            <span className="w-2.5 h-2 rounded-sm inline-block" style={{ background:c, opacity:0.75 }} />{s}
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-[10px]" style={{ color:'var(--muted)' }}>
          <span className="inline-block w-px h-3 border-l-2 border-dashed" style={{ borderColor:'#6366F1', opacity:0.6 }} />今日
        </span>
      </div>
      <div className="flex mb-1" style={{ paddingLeft: LABEL_W }}>
        <div className="flex-1 relative h-4">
          {months.map((mo,i) => (
            <span key={i} className="absolute text-[10px] font-medium"
              style={{ left:`${mo.pct}%`, transform:'translateX(-50%)', color:'var(--muted)' }}>
              {mo.label}
            </span>
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        {items.map(row => {
          const s = toPct(row.startDate)
          const rawEnd = row.actualDate || row.planDate
          const fallbackEnd = new Date(new Date(row.startDate).getTime() + 14*24*3600*1000)
          const e = toPct(rawEnd || fallbackEnd)
          const clr = STATUS_BAR_CLR[row.status] || '#94A3B8'
          const left  = Math.min(s, e ?? s)
          const width = Math.max(Math.abs((e??s) - s), 0.8)
          return (
            <div key={row._id} className="flex items-center gap-0" style={{ height:22 }}>
              <div className="text-[10px] truncate text-right pr-2 shrink-0"
                style={{ width:LABEL_W, color:'var(--muted)' }} title={row.task}>
                {row.id || row.task?.slice(0,6) || '—'}
              </div>
              <div className="flex-1 relative h-4 rounded" style={{ background:'var(--surface2)' }}>
                {months.map((mo,i) => (
                  <div key={i} className="absolute top-0 bottom-0 w-px"
                    style={{ left:`${mo.pct}%`, background:'var(--border)' }} />
                ))}
                <div className="absolute top-0 bottom-0 w-0.5"
                  style={{ left:`${todayPct}%`, background:'#6366F1', opacity:0.55, zIndex:2 }} />
                <div className="absolute top-1 h-2 rounded-sm"
                  style={{ left:`${left}%`, width:`${width}%`, background:clr, opacity:0.8, zIndex:1 }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── 表格行 ────────────────────────────────────────────────────────────────────
function Row({ row, isAdmin, userEmail, open, onToggle, onEdit, onReview, onHistory }) {
  const sc  = STATUS_CFG[row.status]  ?? { bg:'rgba(100,116,139,0.1)', color:'#64748B', dot:'#94A3B8' }
  const rc  = REVIEW_CFG[row.reviewStatus] ?? REVIEW_CFG['待审核']
  const oc  = ORG_CFG[row.org]
  const canEdit = isAdmin || row.createdBy === userEmail

  return (
    <>
      <tr className="transition-colors cursor-pointer"
        style={{ background: open ? 'rgba(99,102,241,0.04)' : 'transparent', borderBottom:'1px solid var(--border)' }}
        onMouseEnter={e => { if(!open) e.currentTarget.style.background='var(--surface2)' }}
        onMouseLeave={e => { if(!open) e.currentTarget.style.background='transparent' }}
        onClick={onToggle}>
        <td className="px-3.5 py-3">
          <div className="flex items-center gap-1.5">
            <ChevronDown className={`w-3 h-3 shrink-0 transition-transform duration-200 ${open?'rotate-180':''}`} style={{ color:'var(--muted)', opacity:0.45 }} />
            <span className="font-mono text-xs" style={{ color:'var(--muted)' }}>{row.id||'—'}</span>
          </div>
        </td>
        <td className="px-3.5 py-3">
          <p className="font-medium text-[13px] line-clamp-2 max-w-[200px]" style={{ color:'var(--text)' }}>{row.task||'—'}</p>
        </td>
        <td className="px-3.5 py-3"><DateCell v={row.startDate} /></td>
        <td className="px-3.5 py-3"><DateCell v={row.planDate} /></td>
        <td className="px-3.5 py-3"><DateCell v={row.actualDate} /></td>
        <td className="px-3.5 py-3">
          <p className="text-[12px] line-clamp-2 max-w-[150px]" style={{ color:'var(--muted)' }}>{row.progress||'—'}</p>
        </td>
        <td className="px-3.5 py-3">
          {row.status ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap"
              style={{ background:sc.bg, color:sc.color }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background:sc.dot }} />{row.status}
            </span>
          ) : <span style={{ color:'var(--muted)', opacity:0.35 }}>—</span>}
        </td>
        <td className="px-3.5 py-3">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap"
            style={{ background:rc.bg, color:rc.color }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background:rc.dot }} />
            {row.reviewStatus||'待审核'}
          </span>
        </td>
        <td className="px-3.5 py-3">
          {oc ? (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap"
              style={{ background:oc.bg, color:oc.color }}>
              {row.org}
            </span>
          ) : <span style={{ color:'var(--muted)', opacity:0.35 }}>—</span>}
        </td>
        <td className="px-3.5 py-3">
          <div>
            <span className="text-[12px] font-medium whitespace-nowrap" style={{ color:'var(--text)' }}>{row.owner||'—'}</span>
            {row.ownerJobId && (
              <p className="text-[10px] font-mono mt-0.5" style={{ color:'var(--muted)' }}>{row.ownerJobId}</p>
            )}
          </div>
        </td>
        <td className="px-3.5 py-3" onClick={e=>e.stopPropagation()}>
          {row.deliverable?.startsWith('http') ? (
            <a href={row.deliverable} target="_blank" rel="noopener noreferrer"
              className="press inline-flex items-center gap-1 text-[11px] font-medium text-indigo-500 hover:opacity-70">
              查看 <ExternalLink className="w-3 h-3" />
            </a>
          ) : <span className="text-[11px]" style={{ color:'var(--muted)', opacity:0.45 }}>{row.deliverable||'—'}</span>}
        </td>
        <td className="px-3.5 py-3 text-right" onClick={e=>e.stopPropagation()}>
          <div className="flex items-center justify-end gap-1.5">
            <button onClick={onHistory}
              className="press flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-medium"
              style={{ background:'var(--surface2)', color:'var(--muted)', border:'1px solid var(--border)' }}
              title="查看操作历史">
              <History className="w-3 h-3" />
            </button>
            {canEdit && (
              <button onClick={onEdit}
                className="press flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-medium"
                style={{ background:'rgba(99,102,241,0.08)', color:'#6366F1', border:'1px solid rgba(99,102,241,0.15)' }}>
                <Pencil className="w-3 h-3" /> 编辑
              </button>
            )}
            {isAdmin && row.reviewStatus==='待审核' && (
              <>
                <button onClick={() => onReview(row,'已审核')}
                  className="press flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-medium"
                  style={{ background:'rgba(16,185,129,0.1)', color:'#059669', border:'1px solid rgba(16,185,129,0.2)' }}>
                  <CheckCircle className="w-3 h-3" /> 批准
                </button>
                <button onClick={() => onReview(row,'已驳回')}
                  className="press flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-medium"
                  style={{ background:'rgba(244,63,94,0.08)', color:'#E11D48', border:'1px solid rgba(244,63,94,0.15)' }}>
                  <XCircle className="w-3 h-3" /> 驳回
                </button>
              </>
            )}
          </div>
        </td>
      </tr>

      {open && (
        <tr>
          <td colSpan={12} className="px-6 py-4 animate-fade-in" style={{ background:'rgba(99,102,241,0.02)', borderBottom:'1px solid var(--border)' }}>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {[['工作任务（OKR）',row.task],['当前进展',row.progress],['任务清单',row.taskList],['逾期原因',row.lateReason]]
                .filter(([,v])=>v).map(([l,v])=>(
                <div key={l} className="rounded-xl p-3.5" style={{ background:'var(--surface)', border:'1px solid var(--border)' }}>
                  <p className="text-[10px] font-bold tracking-widest uppercase mb-1.5" style={{ color:'var(--muted)' }}>{l}</p>
                  <p className="text-[13px] whitespace-pre-wrap leading-relaxed" style={{ color:'var(--text)' }}>{v}</p>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ─── 新建/编辑表单 ─────────────────────────────────────────────────────────────
function ProjectForm({ initial, userEmail, userName, isAdmin, onClose, onSave }) {
  const isNew = !initial._id
  const [saving, setSaving] = useState(false)
  const [f, setF] = useState({
    [F.id]:          initial.id          || '',
    [F.task]:        initial.task        || '',
    [F.startDate]:   initial.startDate   || new Date().toISOString().slice(0,10),
    [F.planDate]:    initial.planDate    || '',
    [F.actualDate]:  initial.actualDate  || '',
    [F.progress]:    initial.progress    || '',
    [F.status]:      initial.status      || '未开始',
    [F.owner]:       initial.owner       || userName || '',
    [F.ownerJobId]:  initial.ownerJobId  || '',
    [F.org]:         initial.org         || '',
    [F.deliverable]: initial.deliverable || '',
    [F.lateReason]:  initial.lateReason  || '',
    [F.taskList]:    initial.taskList    || '',
    [F.createdBy]:   initial.createdBy   || userEmail || '',
    [F.reviewStatus]:initial.reviewStatus|| '待审核',
  })

  async function submit(e) {
    e.preventDefault(); setSaving(true)
    try { await onSave(f) } catch(err) { alert('保存失败：'+err.message) } finally { setSaving(false) }
  }

  return (
    <Modal title={isNew ? '新建项目' : '编辑项目'} onClose={onClose}>
      <form onSubmit={submit} className="p-5 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <L req>编号</L>
            <input required value={f[F.id]} onChange={e=>setF(p=>({...p,[F.id]:e.target.value}))} placeholder="如 P-001" className="field" />
          </div>
          <div>
            <L req>采购组织</L>
            <select required value={f[F.org]} onChange={e=>setF(p=>({...p,[F.org]:e.target.value}))} className="field">
              <option value="">请选择</option>
              {ORG_OPTS.map(o=><option key={o}>{o}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <L req>责任人</L>
            <input required value={f[F.owner]} onChange={e=>setF(p=>({...p,[F.owner]:e.target.value}))} className="field" />
          </div>
          <div>
            <L req>责任人工号</L>
            <input required value={f[F.ownerJobId]} onChange={e=>setF(p=>({...p,[F.ownerJobId]:e.target.value}))}
              placeholder="用于消息推送" className="field" />
          </div>
        </div>
        <div>
          <L req>工作任务（OKR）</L>
          <textarea value={f[F.task]} onChange={e=>setF(p=>({...p,[F.task]:e.target.value}))} required rows={3}
            className="field resize-none" placeholder="请描述本次任务目标" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <L req>任务发布时间</L>
            <input type="date" required value={f[F.startDate]?.slice(0,10)||''}
              onChange={e=>setF(p=>({...p,[F.startDate]:e.target.value}))} className="field" />
          </div>
          <div>
            <L req>计划完成时间</L>
            <input type="date" required value={f[F.planDate]?.slice(0,10)||''}
              onChange={e=>setF(p=>({...p,[F.planDate]:e.target.value}))} className="field" />
          </div>
        </div>
        <div>
          <L>实际完成时间</L>
          <input type="date" value={f[F.actualDate]?.slice(0,10)||''}
            onChange={e=>setF(p=>({...p,[F.actualDate]:e.target.value}))} className="field" />
        </div>
        <div>
          <L>当前进展</L>
          <textarea value={f[F.progress]} onChange={e=>setF(p=>({...p,[F.progress]:e.target.value}))} rows={2}
            className="field resize-none" placeholder="当前阶段进展情况" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <L>完成状态</L>
            <select value={f[F.status]} onChange={e=>setF(p=>({...p,[F.status]:e.target.value}))} className="field">
              {['未开始','进行中','已完成','逾期','暂停'].map(s=><option key={s}>{s}</option>)}
            </select>
          </div>
          {isAdmin && !isNew && (
            <div>
              <L>审核状态</L>
              <select value={f[F.reviewStatus]} onChange={e=>setF(p=>({...p,[F.reviewStatus]:e.target.value}))} className="field">
                {['待审核','已审核','已驳回'].map(s=><option key={s}>{s}</option>)}
              </select>
            </div>
          )}
        </div>
        <div>
          <L>交付成果链接</L>
          <input value={f[F.deliverable]} onChange={e=>setF(p=>({...p,[F.deliverable]:e.target.value}))} placeholder="https://..." className="field" />
        </div>
        <div>
          <L>任务清单（具体任务分解）</L>
          <textarea value={f[F.taskList]} onChange={e=>setF(p=>({...p,[F.taskList]:e.target.value}))} rows={3}
            className="field resize-none" placeholder="列出具体子任务" />
        </div>
        <div>
          <L>未及时交付原因分析</L>
          <textarea value={f[F.lateReason]} onChange={e=>setF(p=>({...p,[F.lateReason]:e.target.value}))} rows={2}
            className="field resize-none" />
        </div>

        {isNew && (
          <div className="rounded-xl px-3 py-2.5 text-xs" style={{ background:'rgba(99,102,241,0.06)', color:'var(--muted)', border:'1px solid rgba(99,102,241,0.12)' }}>
            提交后将进入管理员审核流程，审核通过后正式生效。
          </div>
        )}

        <div className="flex gap-2.5 pt-1 pb-1">
          <button type="button" onClick={onClose}
            className="press flex-1 py-2.5 text-sm font-semibold rounded-xl"
            style={{ background:'var(--surface2)', color:'var(--muted)' }}>取消</button>
          <button type="submit" disabled={saving}
            className="press flex-1 py-2.5 text-sm font-semibold text-white rounded-xl disabled:opacity-60"
            style={{ background:'#6366F1' }}>
            {saving ? '提交中…' : isNew ? '提交审核' : '保存'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ─── 月报弹窗 ─────────────────────────────────────────────────────────────────
function MonthlyReport({ rows, onClose }) {
  const now = new Date()
  const [year,  setYear]  = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [copied, setCopied] = useState(false)
  const [aiText,    setAiText]    = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError,   setAiError]   = useState('')
  const [aiProgress, setAiProgress] = useState('')

  // 切换月份时清空 AI 内容
  function changeDate(newYear, newMonth) {
    setYear(newYear); setMonth(newMonth); setAiText(''); setAiError('')
  }

  async function handleAiSummary() {
    setAiLoading(true); setAiError(''); setAiText(''); setAiProgress('')
    try {
      const text = await generateMonthlySummary({
        year, month, stats, rows: monthRows,
        onProgress: msg => setAiProgress(msg),
      })
      setAiText(text)
    } catch(e) {
      setAiError('AI 生成失败：' + e.message)
    } finally {
      setAiLoading(false); setAiProgress('')
    }
  }

  // 按计划完成时间筛选本月项目
  const monthRows = useMemo(() => rows.filter(r => {
    const d = r.planDate || r.startDate
    if (!d) return false
    const pd = new Date(d)
    return pd.getFullYear() === year && pd.getMonth() + 1 === month
  }), [rows, year, month])

  const stats = useMemo(() => {
    const total = monthRows.length
    const byStatus = {}
    Object.keys(STATUS_CFG).forEach(s => { byStatus[s] = monthRows.filter(r => r.status === s).length })
    const byOrg = {}
    ORG_OPTS.forEach(o => { byOrg[o] = monthRows.filter(r => r.org === o).length })
    const completeRate = total > 0 ? Math.round(byStatus['已完成'] / total * 100) : 0
    return { total, byStatus, byOrg, completeRate }
  }, [monthRows])

  function buildText() {
    const lines = [
      `# ${year}年${month}月 项目月报`,
      `生成时间：${new Date().toLocaleString('zh-CN')}`,
      '',
      '## 📊 总览',
      `- 本月项目总数：${stats.total}`,
      `- 已完成：${stats.byStatus['已完成']}  进行中：${stats.byStatus['进行中']}  逾期：${stats.byStatus['逾期']}  未开始：${stats.byStatus['未开始']}`,
      `- 完成率：${stats.completeRate}%`,
      '',
      '## 🏢 按采购组织',
      ...ORG_OPTS.map(o => `- ${o}：${stats.byOrg[o]} 项`),
      '',
      '## 📋 项目明细',
      `${'编号'.padEnd(8)}${'状态'.padEnd(6)}${'组织'.padEnd(12)}${'责任人'.padEnd(8)}计划完成  工作任务`,
      ...monthRows.map(r =>
        `${(r.id||'—').padEnd(8)}${(r.status||'—').padEnd(6)}${(r.org||'—').padEnd(12)}${(r.owner||'—').padEnd(8)}${(r.planDate||'—').slice(0,10)}  ${r.task?.slice(0,30)||'—'}`
      ),
    ]
    return lines.join('\n')
  }

  async function copyText() {
    try {
      await navigator.clipboard.writeText(buildText())
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { alert('复制失败，请手动选取') }
  }

  const months = Array.from({length:12}, (_,i) => i+1)
  const years  = [now.getFullYear()-1, now.getFullYear(), now.getFullYear()+1]

  return (
    <Modal title="📋 项目月报" onClose={onClose}>
      <div className="p-5 space-y-4">
        {/* 月份选择 */}
        <div className="flex items-center gap-2">
          <select value={year} onChange={e=>changeDate(+e.target.value, month)} className="field flex-1">
            {years.map(y=><option key={y}>{y}</option>)}
          </select>
          <select value={month} onChange={e=>changeDate(year, +e.target.value)} className="field flex-1">
            {months.map(m=><option key={m} value={m}>{m}月</option>)}
          </select>
          <button onClick={copyText}
            className="press flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold shrink-0"
            style={{ background: copied ? 'rgba(16,185,129,0.1)' : 'rgba(99,102,241,0.08)',
                     color: copied ? '#059669' : '#6366F1',
                     border: `1px solid ${copied ? 'rgba(16,185,129,0.2)' : 'rgba(99,102,241,0.15)'}` }}>
            {copied ? <><Check className="w-3.5 h-3.5" />已复制</> : <><Copy className="w-3.5 h-3.5" />复制</>}
          </button>
        </div>

        {monthRows.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-4xl mb-2">📭</p>
            <p className="text-sm" style={{ color:'var(--muted)' }}>{year}年{month}月暂无项目数据</p>
          </div>
        ) : (
          <>
            {/* 统计卡片 */}
            <div className="grid grid-cols-4 gap-2">
              {[
                { label:'总计', val: stats.total,                   clr:'#6366F1' },
                { label:'已完成', val: stats.byStatus['已完成'],    clr:'#10B981' },
                { label:'进行中', val: stats.byStatus['进行中'],    clr:'#818CF8' },
                { label:'逾期', val: stats.byStatus['逾期'],        clr:'#F43F5E' },
              ].map(s => (
                <div key={s.label} className="rounded-xl p-3 text-center"
                  style={{ background:'var(--surface2)', border:'1px solid var(--border)' }}>
                  <p className="text-2xl font-bold" style={{ color:s.clr }}>{s.val}</p>
                  <p className="text-[11px] mt-0.5" style={{ color:'var(--muted)' }}>{s.label}</p>
                </div>
              ))}
            </div>

            {/* 完成率进度条 */}
            <div>
              <div className="flex justify-between text-[11px] mb-1.5" style={{ color:'var(--muted)' }}>
                <span>完成率</span><span>{stats.completeRate}%</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background:'var(--surface2)' }}>
                <div className="h-full rounded-full transition-all duration-500"
                  style={{ width:`${stats.completeRate}%`, background:'linear-gradient(90deg,#6366F1,#10B981)' }} />
              </div>
            </div>

            {/* 按组织分布 */}
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold" style={{ color:'var(--muted)' }}>按采购组织</p>
              {ORG_OPTS.map(o => {
                const n = stats.byOrg[o]
                const pct = stats.total > 0 ? Math.round(n / stats.total * 100) : 0
                const cfg = ORG_CFG[o]
                return (
                  <div key={o} className="flex items-center gap-2">
                    <span className="text-[11px] w-28 shrink-0" style={{ color:'var(--muted)' }}>{o}</span>
                    <div className="flex-1 h-1.5 rounded-full" style={{ background:'var(--surface2)' }}>
                      <div className="h-full rounded-full" style={{ width:`${pct}%`, background: cfg?.color ?? '#94A3B8' }} />
                    </div>
                    <span className="text-[11px] w-5 text-right shrink-0 font-medium" style={{ color:'var(--text)' }}>{n}</span>
                  </div>
                )
              })}
            </div>

            {/* 项目列表 */}
            <div className="rounded-xl overflow-hidden" style={{ border:'1px solid var(--border)' }}>
              <div className="px-3 py-2" style={{ background:'var(--surface2)', borderBottom:'1px solid var(--border)' }}>
                <p className="text-[11px] font-semibold" style={{ color:'var(--muted)' }}>项目明细（{monthRows.length}项）</p>
              </div>
              <div className="divide-y" style={{ divideColor:'var(--border)', maxHeight:240, overflowY:'auto' }}>
                {monthRows.map(r => {
                  const sc = STATUS_CFG[r.status] ?? STATUS_CFG['未开始']
                  return (
                    <div key={r._id} className="flex items-center gap-2 px-3 py-2">
                      <span className="text-[10px] font-mono w-12 shrink-0" style={{ color:'var(--muted)' }}>{r.id||'—'}</span>
                      <span className="flex-1 text-[12px] truncate" style={{ color:'var(--text)' }}>{r.task||'—'}</span>
                      <span className="text-[10px] shrink-0" style={{ color:'var(--muted)' }}>{r.owner||''}</span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0"
                        style={{ background:sc.bg, color:sc.color }}>{r.status||'—'}</span>
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
              style={{ background:'linear-gradient(135deg,rgba(99,102,241,0.12),rgba(139,92,246,0.12))',
                       color:'#7C3AED', border:'1px solid rgba(139,92,246,0.2)' }}>
              {aiLoading
                ? <><Loader2 className="w-4 h-4 animate-spin" />{aiProgress || 'AI 生成中…'}</>
                : <><Sparkles className="w-4 h-4" />AI 一键总结</>}
            </button>
            {aiError && (
              <p className="text-[12px] text-center" style={{ color:'#F43F5E' }}>{aiError}</p>
            )}
            {aiText && (
              <div className="rounded-xl p-4 space-y-2"
                style={{ background:'rgba(139,92,246,0.05)', border:'1px solid rgba(139,92,246,0.15)' }}>
                <div className="flex items-center gap-1.5 mb-2">
                  <Sparkles className="w-3.5 h-3.5" style={{ color:'#7C3AED' }} />
                  <span className="text-[11px] font-semibold" style={{ color:'#7C3AED' }}>AI 生成汇报</span>
                </div>
                <p className="text-[13px] leading-relaxed whitespace-pre-wrap" style={{ color:'var(--text)' }}>{aiText}</p>
                <button onClick={() => { navigator.clipboard.writeText(aiText); setCopied(true); setTimeout(()=>setCopied(false),2000) }}
                  className="press flex items-center gap-1.5 text-[11px] font-medium mt-1"
                  style={{ color:'var(--muted)' }}>
                  {copied ? <><Check className="w-3 h-3 text-green-500" />已复制</> : <><Copy className="w-3 h-3" />复制此内容</>}
                </button>
              </div>
            )}
          </div>
        )}

        <button onClick={onClose}
          className="press w-full py-2.5 text-sm font-semibold rounded-xl"
          style={{ background:'var(--surface2)', color:'var(--muted)' }}>关闭</button>
      </div>
    </Modal>
  )
}

// ─── 历史记录弹窗 ─────────────────────────────────────────────────────────────
function HistoryModal({ row, onClose }) {
  const entries = Array.isArray(row.history) ? [...row.history].reverse() : []

  const ACTION_STYLE = {
    '创建项目':  { bg:'rgba(99,102,241,0.1)',  color:'#6366F1',  dot:'#818CF8' },
    '编辑项目':  { bg:'rgba(14,165,233,0.1)',  color:'#0284C7',  dot:'#38BDF8' },
    '审核通过':  { bg:'rgba(16,185,129,0.1)',  color:'#059669',  dot:'#10B981' },
    '审核驳回':  { bg:'rgba(244,63,94,0.1)',   color:'#E11D48',  dot:'#F43F5E' },
  }

  function fmtTime(iso) {
    if (!iso) return '—'
    const d = new Date(iso)
    return d.toLocaleString('zh-CN', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' })
  }

  return (
    <Modal title={`操作历史 · ${row.id || row.task?.slice(0,12) || '—'}`} onClose={onClose}>
      <div className="p-5">
        {entries.length === 0 ? (
          <div className="text-center py-8">
            <History className="w-8 h-8 mx-auto mb-2 opacity-20" style={{ color:'var(--muted)' }} />
            <p className="text-sm" style={{ color:'var(--muted)' }}>暂无操作记录</p>
          </div>
        ) : (
          <div className="relative">
            <div className="absolute left-[7px] top-2 bottom-2 w-px" style={{ background:'var(--border)' }} />
            <div className="space-y-4">
              {entries.map((e, i) => {
                const cfg = ACTION_STYLE[e.a] ?? { bg:'rgba(100,116,139,0.1)', color:'#64748B', dot:'#94A3B8' }
                return (
                  <div key={i} className="flex gap-3.5">
                    <div className="w-3.5 h-3.5 rounded-full shrink-0 mt-0.5 z-10 ring-2"
                      style={{ background:cfg.dot, ringColor:'var(--surface)' }} />
                    <div className="flex-1 min-w-0 pb-1">
                      <div className="flex items-center flex-wrap gap-2 mb-1">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold"
                          style={{ background:cfg.bg, color:cfg.color }}>
                          {e.a || '操作'}
                        </span>
                        <span className="text-[11px] font-mono" style={{ color:'var(--muted)' }}>{fmtTime(e.t)}</span>
                      </div>
                      <p className="text-[12px]" style={{ color:'var(--text)', opacity:0.65 }}>
                        {e.by || '未知用户'}
                        {e.n ? <span style={{ color:'var(--muted)' }}>：{e.n}</span> : ''}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
        <div className="mt-4 pt-3" style={{ borderTop:'1px solid var(--border)' }}>
          <button onClick={onClose}
            className="press w-full py-2.5 text-sm font-semibold rounded-xl"
            style={{ background:'var(--surface2)', color:'var(--muted)' }}>关闭</button>
        </div>
      </div>
    </Modal>
  )
}

function DateCell({ v }) {
  return <span className="text-[11px] font-mono whitespace-nowrap" style={{ color:'var(--muted)' }}>{v ? String(v).slice(0,10) : '—'}</span>
}
function L({ children, req }) {
  return <label className="block text-xs font-semibold mb-1.5" style={{ color:'var(--text)', opacity:0.65 }}>{children}{req&&<span className="text-red-500 ml-0.5">*</span>}</label>
}
