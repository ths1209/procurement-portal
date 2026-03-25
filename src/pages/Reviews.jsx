import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { RefreshCw, Plus, Search, X, Eye, Pencil, Trash2, Medal, FileText, CalendarClock } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import {
  listReviews, createReview, updateReview, deleteReview,
  isConfigured, F, CONCLUSION_OPTS,
} from '../lib/teableReviews'

const CONCLUSION_CFG = {
  '通过':    { color: '#10B981', bg: 'rgba(16,185,129,0.12)'  },
  '条件通过': { color: '#3B82F6', bg: 'rgba(59,130,246,0.12)'  },
  '不通过':  { color: '#EF4444', bg: 'rgba(239,68,68,0.12)'   },
  '待定':    { color: '#F59E0B', bg: 'rgba(245,158,11,0.12)'  },
}

const EMPTY_FORM = {
  [F.name]: '', [F.code]: '', [F.amount]: '', [F.reviewDate]: '',
  [F.meetingTime]: '', [F.host]: '', [F.attendees]: '',
  [F.conclusion]: '待定', [F.minutes]: '',
}

function Badge({ val }) {
  const cfg = CONCLUSION_CFG[val] ?? { color: '#6B7280', bg: 'rgba(107,114,128,0.1)' }
  return (
    <span style={{ color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.color}30` }}
      className="px-2 py-0.5 rounded text-xs font-medium">
      {val}
    </span>
  )
}

function LabelRow({ label, children }) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-xs" style={{ color: 'var(--muted)' }}>{label}</label>
      {children}
    </div>
  )
}

function Input({ value, onChange, ...rest }) {
  return (
    <input value={value} onChange={e => onChange(e.target.value)}
      className="w-full px-3 py-1.5 rounded-lg text-sm outline-none"
      style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}
      {...rest} />
  )
}

function Textarea({ value, onChange, rows = 4 }) {
  return (
    <textarea value={value} onChange={e => onChange(e.target.value)} rows={rows}
      className="w-full px-3 py-1.5 rounded-lg text-sm outline-none resize-none"
      style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
  )
}

function Select({ value, onChange, options }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="w-full px-3 py-1.5 rounded-lg text-sm outline-none"
      style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}

/* ── 新建/编辑弹窗 ── */
function EditModal({ row, onClose, onSave }) {
  const [form, setForm] = useState(row ? {
    [F.name]: row.name, [F.code]: row.code, [F.amount]: row.amount,
    [F.reviewDate]: row.reviewDate, [F.meetingTime]: row.meetingTime,
    [F.host]: row.host, [F.attendees]: row.attendees,
    [F.conclusion]: row.conclusion, [F.minutes]: row.minutes,
  } : { ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  function set(key, val) { setForm(f => ({ ...f, [key]: val })) }

  async function handleSave() {
    if (!form[F.name]) { setErr('项目名称不能为空'); return }
    setSaving(true); setErr('')
    try { await onSave(form) } catch (e) { setErr(e.message); setSaving(false) }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)' }}>
      <div className="w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] animate-scale-in"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <span className="font-semibold text-sm" style={{ color: 'var(--text)' }}>
            {row ? '编辑评审记录' : '新建评审记录'}
          </span>
          <button onClick={onClose} className="press p-1 rounded hover:opacity-70">
            <X className="w-4 h-4" style={{ color: 'var(--muted)' }} />
          </button>
        </div>
        <div className="p-5 overflow-y-auto flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <LabelRow label="项目名称 *"><Input value={form[F.name]} onChange={v => set(F.name, v)} placeholder="请输入项目名称" /></LabelRow>
            <LabelRow label="项目编号"><Input value={form[F.code]} onChange={v => set(F.code, v)} placeholder="可选" /></LabelRow>
            <LabelRow label="合同金额（万元）"><Input value={form[F.amount]} onChange={v => set(F.amount, v)} placeholder="如：500" type="number" /></LabelRow>
            <LabelRow label="评审结论"><Select value={form[F.conclusion]} onChange={v => set(F.conclusion, v)} options={CONCLUSION_OPTS} /></LabelRow>
            <LabelRow label="评审日期"><Input value={form[F.reviewDate]} onChange={v => set(F.reviewDate, v)} type="date" /></LabelRow>
            <LabelRow label="会议时间"><Input value={form[F.meetingTime]} onChange={v => set(F.meetingTime, v)} placeholder="如：14:00-16:00" /></LabelRow>
            <LabelRow label="主持人"><Input value={form[F.host]} onChange={v => set(F.host, v)} placeholder="请输入主持人姓名" /></LabelRow>
            <LabelRow label="参会人员"><Input value={form[F.attendees]} onChange={v => set(F.attendees, v)} placeholder="多人用逗号分隔" /></LabelRow>
          </div>
          <LabelRow label="会议纪要"><Textarea value={form[F.minutes]} onChange={v => set(F.minutes, v)} rows={6} /></LabelRow>
          {err && <p className="text-xs text-red-400">{err}</p>}
        </div>
        <div className="px-5 py-4 flex justify-end gap-2" style={{ borderTop: '1px solid var(--border)' }}>
          <button onClick={onClose} className="press px-4 py-1.5 rounded-lg text-sm" style={{ color: 'var(--muted)' }}>取消</button>
          <button onClick={handleSave} disabled={saving}
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
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)' }}>
      <div className="w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] animate-scale-in"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4" style={{ color: '#6366F1' }} />
            <span className="font-semibold text-sm" style={{ color: 'var(--text)' }}>{row.name}</span>
            <Badge val={row.conclusion} />
          </div>
          <button onClick={onClose} className="press p-1 rounded hover:opacity-70">
            <X className="w-4 h-4" style={{ color: 'var(--muted)' }} />
          </button>
        </div>
        <div className="p-5 overflow-y-auto flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-3">
            {[
              ['项目编号', row.code], ['合同金额', row.amount ? `${row.amount} 万元` : '—'],
              ['评审日期', row.reviewDate || '—'], ['会议时间', row.meetingTime || '—'],
              ['主持人',   row.host || '—'],       ['参会人员', row.attendees || '—'],
              ['登记人',   row.addedBy || '—'],
            ].map(([l, v]) => (
              <div key={l}>
                <div className="text-xs mb-0.5" style={{ color: 'var(--muted)' }}>{l}</div>
                <div className="text-sm" style={{ color: 'var(--text)' }}>{v}</div>
              </div>
            ))}
          </div>
          {row.minutes && (
            <div>
              <div className="text-xs mb-1.5" style={{ color: 'var(--muted)' }}>会议纪要</div>
              <div className="p-3 rounded-xl text-sm whitespace-pre-wrap leading-relaxed"
                style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}>
                {row.minutes}
              </div>
            </div>
          )}
        </div>
        <div className="px-5 py-4 flex justify-between" style={{ borderTop: '1px solid var(--border)' }}>
          {isAdmin
            ? <button onClick={() => onDelete(row)} className="press text-xs text-red-400 hover:text-red-300 flex items-center gap-1">
                <Trash2 className="w-3.5 h-3.5" /> 删除
              </button>
            : <span />}
          <div className="flex gap-2">
            <button onClick={onClose} className="press px-4 py-1.5 rounded-lg text-sm" style={{ color: 'var(--muted)' }}>关闭</button>
            <button onClick={() => onEdit(row)} className="press px-4 py-1.5 rounded-lg text-sm font-medium"
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

/* ── 主页面 ── */
export default function Reviews() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const configured = isConfigured()

  const [rows, setRows]     = useState([])
  const [loading, setLoad]  = useState(false)
  const [err, setErr]       = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('全部')
  const [editRow, setEdit]  = useState(null)   // null=关闭, false=新建, row=编辑
  const [viewRow, setView]  = useState(null)

  async function load() {
    setLoad(true); setErr('')
    try { setRows(await listReviews()) } catch (e) { setErr(e.message) } finally { setLoad(false) }
  }
  useEffect(() => { load() }, [])

  const shown = useMemo(() => {
    let r = rows
    if (filter !== '全部') r = r.filter(x => x.conclusion === filter)
    if (search) {
      const q = search.toLowerCase()
      r = r.filter(x => x.name.toLowerCase().includes(q) || x.code.toLowerCase().includes(q) || x.host.toLowerCase().includes(q))
    }
    return r
  }, [rows, filter, search])

  const counts = useMemo(() => {
    const c = { total: rows.length }
    CONCLUSION_OPTS.forEach(o => { c[o] = rows.filter(r => r.conclusion === o).length })
    return c
  }, [rows])

  async function handleSave(form) {
    if (editRow && editRow._id) {
      await updateReview(editRow._id, form)
    } else {
      await createReview(form, profile?.displayName ?? profile?.email ?? '')
    }
    setEdit(null)
    await load()
  }

  async function handleDelete(row) {
    if (!confirm(`确认删除项目"${row.name}"的评审记录？`)) return
    try {
      await deleteReview(row._id)
      setView(null)
      await load()
    } catch (e) { alert(e.message) }
  }

  const STAT_CARDS = [
    { label: '全部评审', value: counts.total,    color: '#6366F1' },
    { label: '通过',     value: counts['通过'],   color: '#10B981' },
    { label: '条件通过', value: counts['条件通过'], color: '#3B82F6' },
    { label: '不通过',   value: counts['不通过'], color: '#EF4444' },
  ]

  return (
    <div className="p-5 max-w-6xl mx-auto space-y-5 animate-page-in">
      {/* 页头 */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <Medal className="w-5 h-5" style={{ color: '#6366F1' }} strokeWidth={1.75} />
            <h1 className="font-semibold text-lg" style={{ color: 'var(--text)' }}>百万项目评审</h1>
          </div>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            评审记录管理 · 会议纪要沉淀
            {!configured && <span className="ml-2 text-amber-400">（未配置数据表，请联系管理员）</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={loading}
            className="press p-2 rounded-lg hover:opacity-70"
            style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
            <RefreshCw className="w-4 h-4" style={{ color: 'var(--muted)', animation: loading ? 'spin 1s linear infinite' : '' }} strokeWidth={1.75} />
          </button>
          <button onClick={() => setEdit(false)}
            className="press flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white"
            style={{ background: '#6366F1' }}>
            <Plus className="w-4 h-4" strokeWidth={2} />新建
          </button>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-4 gap-3">
        {STAT_CARDS.map(s => (
          <div key={s.label} className="rounded-xl p-4 flex flex-col gap-1"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <span className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</span>
            <span className="text-xs" style={{ color: 'var(--muted)' }}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* 筛选 + 搜索 */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1.5 flex-wrap">
          {['全部', ...CONCLUSION_OPTS].map(o => (
            <button key={o} onClick={() => setFilter(o)}
              className="px-3 py-1 rounded-full text-xs transition-all"
              style={filter === o
                ? { background: '#6366F1', color: '#fff' }
                : { background: 'var(--surface2)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
              {o}
            </button>
          ))}
        </div>
        <div className="flex-1 min-w-48 relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="搜索项目名、编号、主持人"
            className="w-full pl-8 pr-3 py-1.5 rounded-lg text-sm outline-none"
            style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
        </div>
      </div>

      {/* 表格 */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        {/* 表头 */}
        <div className="grid text-xs px-4 py-2.5"
          style={{ gridTemplateColumns: '1fr 6rem 7rem 5rem 6rem 7rem 6rem', background: 'var(--surface2)', color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
          <span>项目名称</span>
          <span>项目编号</span>
          <span>合同金额</span>
          <span>评审日期</span>
          <span>主持人</span>
          <span>评审结论</span>
          <span className="text-center">操作</span>
        </div>

        {loading && (
          <div className="flex justify-center py-10">
            <div className="w-6 h-6 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
          </div>
        )}
        {!loading && err && (
          <div className="text-center py-10 text-sm text-red-400">{err}</div>
        )}
        {!loading && !err && shown.length === 0 && (
          <div className="text-center py-12 flex flex-col items-center gap-2">
            <CalendarClock className="w-8 h-8" style={{ color: 'var(--muted)' }} strokeWidth={1.25} />
            <p className="text-sm" style={{ color: 'var(--muted)' }}>暂无评审记录</p>
          </div>
        )}
        {!loading && shown.map((row, i) => (
          <div key={row._id} className="grid items-center px-4 py-3 text-sm transition-colors hover:bg-white/[0.02]"
            style={{ gridTemplateColumns: '1fr 6rem 7rem 5rem 6rem 7rem 6rem', borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
            <span className="font-medium truncate pr-2" style={{ color: 'var(--text)' }}>{row.name}</span>
            <span className="text-xs truncate" style={{ color: 'var(--muted)' }}>{row.code || '—'}</span>
            <span className="text-xs" style={{ color: 'var(--muted)' }}>{row.amount ? `${row.amount} 万元` : '—'}</span>
            <span className="text-xs" style={{ color: 'var(--muted)' }}>{row.reviewDate || '—'}</span>
            <span className="text-xs truncate" style={{ color: 'var(--muted)' }}>{row.host || '—'}</span>
            <span><Badge val={row.conclusion} /></span>
            <div className="flex items-center justify-center gap-2">
              <button onClick={() => setView(row)} className="hover:opacity-70 transition-opacity">
                <Eye className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} strokeWidth={1.75} />
              </button>
              <button onClick={() => setEdit(row)} className="hover:opacity-70 transition-opacity">
                <Pencil className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} strokeWidth={1.75} />
              </button>
              {isAdmin && (
                <button onClick={() => handleDelete(row)} className="hover:opacity-70 transition-opacity">
                  <Trash2 className="w-3.5 h-3.5 text-red-400/70" strokeWidth={1.75} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* 弹窗 */}
      {editRow !== null && (
        <EditModal row={editRow || null} onClose={() => setEdit(null)} onSave={handleSave} />
      )}
      {viewRow && (
        <DetailModal row={viewRow} onClose={() => setView(null)}
          onEdit={r => { setView(null); setEdit(r) }}
          onDelete={handleDelete} isAdmin={isAdmin} />
      )}
    </div>
  )
}
