import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Plus, ExternalLink, Eye, X, BarChart3, Package, Download, Upload } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { listFileTools, createFileTool, deleteFileTool, trackDownload, isToolsConfigured } from '../lib/teableTools'

const GRADS = ['#6366F1','#0EA5E9','#10B981','#F59E0B','#8B5CF6','#14B8A6','#F97316','#EC4899']

const GROUPS = ['采购部通用', '运营分析组', '稽核组', '支付类合作商管理组']

const GROUP_CFG = {
  '采购部通用':        { emoji:'🏢', color:'#6366F1', bg:'rgba(99,102,241,0.07)'  },
  '运营分析组':        { emoji:'📊', color:'#0EA5E9', bg:'rgba(14,165,233,0.07)'  },
  '稽核组':            { emoji:'🔍', color:'#10B981', bg:'rgba(16,185,129,0.07)'  },
  '支付类合作商管理组': { emoji:'💳', color:'#F59E0B', bg:'rgba(245,158,11,0.07)' },
}

const DEFAULT_AI = [
  { id:'1', icon:'🤖', name:'Claude',   desc:'Anthropic AI，文案分析与长文写作首选',  url:'https://claude.ai',          group:'采购部通用' },
  { id:'2', icon:'💬', name:'ChatGPT',  desc:'OpenAI GPT-4o，通用对话与代码生成',    url:'https://chat.openai.com',    group:'采购部通用' },
  { id:'3', icon:'🔍', name:'DeepSeek', desc:'国产大模型，深度推理与复杂任务出色',   url:'https://chat.deepseek.com',  group:'采购部通用' },
  { id:'4', icon:'✨', name:'Gemini',   desc:'Google AI，多模态与超长上下文处理',    url:'https://gemini.google.com',  group:'采购部通用' },
]
const DEFAULT_DASH = [
  { id:'1', icon:'📊', name:'采购总览看板', desc:'核心采购指标实时大屏', url:'#', g:4 },
  { id:'2', icon:'📈', name:'供应商分析',   desc:'供应商绩效与评分可视化', url:'#', g:5 },
]

function useLocal(key, def) {
  const [items, set] = useState(() => { try { return JSON.parse(localStorage.getItem(key)) ?? def } catch { return def } })
  const save = v => { set(v); localStorage.setItem(key, JSON.stringify(v)) }
  return {
    items,
    add: x => save([...items, { id: Date.now()+'', ...x }]),
    del: id => save(items.filter(i => i.id !== id)),
  }
}

export default function Dashboard() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const ai   = useLocal('pp_ai',   DEFAULT_AI)
  const dash = useLocal('pp_dash', DEFAULT_DASH)
  const [addGroup,  setAddGroup]  = useState(null)
  const [preview,   setPreview]   = useState(null)
  const [fileTools, setFileTools] = useState([])

  useEffect(() => { loadFileTools() }, [])

  async function loadFileTools() {
    if (!isToolsConfigured()) return
    try { setFileTools(await listFileTools()) } catch(e) { console.error('[teableTools]', e) }
  }

  async function handleDownload(tool) {
    if (!tool.fileUrl) return
    window.open(tool.fileUrl, '_blank')
    const next = (tool.downloads || 0) + 1
    setFileTools(prev => prev.map(t => t._id === tool._id ? { ...t, downloads: next } : t))
    trackDownload(tool._id, tool.downloads)
  }

  async function handleDelFile(id) {
    try { await deleteFileTool(id); setFileTools(prev => prev.filter(t => t._id !== id)) }
    catch(e) { alert('删除失败：' + e.message) }
  }

  const now = new Date()
  const date = now.toLocaleDateString('zh-CN', { month:'long', day:'numeric', weekday:'long' })
  const totalTools = ai.items.length + fileTools.length

  return (
    <div className="space-y-6 animate-page-in">

      {/* 欢迎横幅 */}
      <div className="relative overflow-hidden rounded-2xl p-6 lg:p-8"
        style={{ background:'linear-gradient(135deg,#0A0F1E,#12103A,#071428)' }}>
        <div className="absolute inset-0 opacity-35"
          style={{ backgroundImage:'radial-gradient(rgba(99,102,241,0.12) 1px, transparent 1px)', backgroundSize:'24px 24px' }} />
        <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-5">
          <div>
            <p className="text-xs mb-1.5" style={{ color:'rgba(255,255,255,0.35)' }}>{date}</p>
            <h2 className="text-[22px] font-bold text-white">你好，{profile?.displayName || '同学'} 👋</h2>
            <p className="text-sm mt-1" style={{ color:'rgba(255,255,255,0.35)' }}>采购运营组工作门户 · 所有工具一站直达</p>
          </div>
          <div className="flex gap-3">
            {[
              { n: totalTools,        l:'百宝箱',   icon:<Package className="w-4 h-4"/>  },
              { n: dash.items.length, l:'业务看板', icon:<BarChart3 className="w-4 h-4"/> },
            ].map(s => (
              <div key={s.l} className="flex flex-col items-center px-5 py-3 rounded-2xl"
                style={{ background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ color:'rgba(255,255,255,0.35)' }}>{s.icon}</div>
                <span className="text-2xl font-bold text-white mt-1">{s.n}</span>
                <span className="text-[11px] mt-0.5" style={{ color:'rgba(255,255,255,0.3)' }}>{s.l}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 百宝箱 */}
      <Section
        title="百宝箱" sub="团队工具一站直达，按组快速查找"
        icon={<Package className="w-4 h-4" />} iconBg="rgba(99,102,241,0.12)" iconClr="#6366F1">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {GROUPS.map(group => (
            <GroupPanel key={group} group={group}
              urlTools={ai.items.filter(t => (t.group ?? '采购部通用') === group)}
              fileTools={fileTools.filter(t => t.group === group)}
              isAdmin={isAdmin}
              onAdd={() => setAddGroup(group)}
              onDelUrl={id => ai.del(id)}
              onDelFile={handleDelFile}
              onDownload={handleDownload}
            />
          ))}
        </div>
      </Section>

      {/* 业务数据赋能 */}
      <Section
        title="业务数据赋能" sub="一键直达各业务数据看板，支持窗口预览"
        icon={<BarChart3 className="w-4 h-4" />} iconBg="rgba(14,165,233,0.12)" iconClr="#0EA5E9"
        onAdd={() => setAddGroup('__dash__')}>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 stagger">
          {dash.items.map(d => <DashCard key={d.id} item={d} isAdmin={isAdmin} onDel={() => dash.del(d.id)} onPrev={() => setPreview(d.url)} />)}
          <AddCard label="添加看板" onClick={() => setAddGroup('__dash__')} />
        </div>
      </Section>

      {/* 添加工具弹窗 */}
      {addGroup && addGroup !== '__dash__' && (
        <AddToolModal group={addGroup} onClose={() => setAddGroup(null)}
          onSaveUrl={x => { ai.add(x); setAddGroup(null) }}
          onSaveFile={async meta => {
            await createFileTool(meta, profile?.email)
            await loadFileTools()
            setAddGroup(null)
          }}
        />
      )}

      {/* 添加看板弹窗 */}
      {addGroup === '__dash__' && (
        <AddDashModal onClose={() => setAddGroup(null)}
          onSave={x => { dash.add({ ...x, g: dash.items.length % GRADS.length }); setAddGroup(null) }} />
      )}

      {preview && <PreviewModal url={preview} onClose={() => setPreview(null)} />}
    </div>
  )
}

// ─── Section 带图标面板头 ──────────────────────────────────────────────────────
function Section({ title, sub, icon, iconBg, iconClr, onAdd, children }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-4 py-3 rounded-2xl"
        style={{ background:'var(--surface)', border:'1px solid var(--border)' }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background:iconBg, color:iconClr }}>
            {icon}
          </div>
          <div>
            <h3 className="font-semibold text-[14px] leading-none" style={{ color:'var(--text)' }}>{title}</h3>
            <p className="text-[11px] mt-1" style={{ color:'var(--muted)' }}>{sub}</p>
          </div>
        </div>
        {onAdd && (
          <button onClick={onAdd}
            className="press flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-indigo-500 shrink-0"
            style={{ background:'rgba(99,102,241,0.08)', border:'1px solid rgba(99,102,241,0.12)' }}>
            <Plus className="w-3.5 h-3.5" /> 添加
          </button>
        )}
      </div>
      {children}
    </div>
  )
}

// ─── 分组面板 ─────────────────────────────────────────────────────────────────
function GroupPanel({ group, urlTools, fileTools, isAdmin, onAdd, onDelUrl, onDelFile, onDownload }) {
  const cfg = GROUP_CFG[group] ?? { emoji:'📁', color:'#64748B', bg:'rgba(100,116,139,0.07)' }
  const total = urlTools.length + fileTools.length

  return (
    <div className="card overflow-hidden">
      {/* 分组头 */}
      <div className="flex items-center justify-between px-3.5 py-2.5"
        style={{ borderBottom:'1px solid var(--border)', background:cfg.bg }}>
        <div className="flex items-center gap-2">
          <span className="text-sm select-none">{cfg.emoji}</span>
          <span className="font-semibold text-[13px]" style={{ color:cfg.color }}>{group}</span>
          <span className="text-[11px] px-1.5 py-0.5 rounded-full font-medium"
            style={{ background:'rgba(0,0,0,0.06)', color:cfg.color }}>
            {total}
          </span>
        </div>
        <button onClick={onAdd}
          className="press flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold"
          style={{ background:'rgba(99,102,241,0.08)', color:'#6366F1', border:'1px solid rgba(99,102,241,0.12)' }}>
          <Plus className="w-3 h-3" /> 添加
        </button>
      </div>

      {/* 工具列表 */}
      <div>
        {urlTools.map(t => (
          <ToolRow key={t.id} icon={t.icon} name={t.name} desc={t.desc}
            isAdmin={isAdmin} onDel={() => onDelUrl(t.id)}
            action={
              <a href={t.url} target="_blank" rel="noopener noreferrer"
                className="press flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-white shrink-0"
                style={{ background:'#6366F1' }}>
                打开 <ExternalLink className="w-3 h-3" />
              </a>
            }
          />
        ))}
        {fileTools.map(t => (
          <ToolRow key={t._id} icon={t.icon} name={t.name}
            desc={t.desc || t.fileName}
            isAdmin={isAdmin} onDel={() => onDelFile(t._id)}
            badge={t.downloads > 0 ? `↓ ${t.downloads}` : null}
            action={
              <button onClick={() => onDownload(t)}
                className="press flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold shrink-0"
                style={{ background:'rgba(16,185,129,0.1)', color:'#059669', border:'1px solid rgba(16,185,129,0.2)' }}>
                <Download className="w-3 h-3" /> 下载
              </button>
            }
          />
        ))}
        {total === 0 && (
          <div className="px-4 py-5 text-center">
            <p className="text-[12px]" style={{ color:'var(--muted)', opacity:0.45 }}>暂无工具，点击右上角添加</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── 工具行（列表样式）────────────────────────────────────────────────────────
function ToolRow({ icon, name, desc, isAdmin, onDel, action, badge }) {
  return (
    <div className="flex items-center gap-3 px-3.5 py-2.5 group transition-colors"
      style={{ borderBottom:'1px solid var(--border)' }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface2)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
      <span className="text-xl shrink-0 select-none w-7 text-center">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium truncate" style={{ color:'var(--text)' }}>{name}</p>
        {desc && <p className="text-[11px] truncate" style={{ color:'var(--muted)' }}>{desc}</p>}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {badge && <span className="text-[10px] font-medium" style={{ color:'var(--muted)' }}>{badge}</span>}
        {isAdmin && (
          <button onClick={onDel}
            className="press w-5 h-5 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/10"
            style={{ color:'var(--muted)' }}
            onMouseEnter={e => { e.currentTarget.style.color = '#F43F5E' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)' }}>
            <X className="w-3 h-3" />
          </button>
        )}
        {action}
      </div>
    </div>
  )
}

// ─── DashCard ─────────────────────────────────────────────────────────────────
function DashCard({ item, isAdmin, onDel, onPrev }) {
  const clr = GRADS[item.g ?? 4]
  return (
    <div className="card hover-lift group flex flex-col overflow-hidden">
      <div className="relative h-14 flex items-center justify-center" style={{ background:`${clr}18` }}>
        <span className="text-3xl select-none">{item.icon}</span>
        {isAdmin && (
          <button onClick={onDel}
            className="press absolute top-1.5 right-1.5 w-5 h-5 rounded-full items-center justify-center bg-black/10 hover:bg-red-500/20 opacity-0 group-hover:opacity-100 hidden group-hover:flex"
            style={{ color:'var(--muted)' }}>
            <X className="w-2.5 h-2.5" />
          </button>
        )}
      </div>
      <div className="flex flex-col flex-1 p-3 gap-2">
        <div>
          <p className="font-semibold text-[13px] leading-tight" style={{ color:'var(--text)' }}>{item.name}</p>
          <p className="text-[11px] mt-0.5 line-clamp-2 leading-relaxed" style={{ color:'var(--muted)' }}>{item.desc}</p>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <button onClick={onPrev}
            className="press flex items-center justify-center gap-1 py-1.5 rounded-xl text-[11px] font-semibold text-indigo-500"
            style={{ background:'rgba(99,102,241,0.08)', border:'1px solid rgba(99,102,241,0.12)' }}>
            <Eye className="w-3 h-3" /> 预览
          </button>
          <a href={item.url} target="_blank" rel="noopener noreferrer"
            className="press flex items-center justify-center gap-1 py-1.5 rounded-xl text-[11px] font-semibold text-white"
            style={{ background:'#6366F1' }}>
            打开 <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </div>
  )
}

function AddCard({ label, onClick }) {
  return (
    <button onClick={onClick}
      className="press flex flex-col items-center justify-center rounded-2xl gap-2 group min-h-[148px]"
      style={{ border:'1.5px dashed rgba(99,102,241,0.22)', background:'rgba(99,102,241,0.03)' }}>
      <div className="w-9 h-9 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform"
        style={{ background:'rgba(99,102,241,0.1)' }}>
        <Plus className="w-4 h-4 text-indigo-400 group-hover:text-indigo-500" />
      </div>
      <span className="text-[11px] font-medium text-indigo-400/60 group-hover:text-indigo-500 transition-colors">{label}</span>
    </button>
  )
}

// ─── 添加工具弹窗 ─────────────────────────────────────────────────────────────
function AddToolModal({ group, onClose, onSaveUrl, onSaveFile }) {
  const [type,    setType]    = useState('url')
  const [f,       setF]       = useState({ icon:'🔗', name:'', desc:'', url:'', group, fileUrl:'', fileName:'' })
  const [file,    setFile]    = useState(null)       // 本地选择的 File 对象
  const [useLink, setUseLink] = useState(false)      // 切换到粘贴链接模式
  const [saving,  setSaving]  = useState(false)
  const fileRef = useRef()
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))

  function onFileChange(e) {
    const picked = e.target.files?.[0]
    if (!picked) return
    setFile(picked)
    setUseLink(false)
    if (!f.name) set('name', picked.name.replace(/\.[^.]+$/, ''))
    set('icon', '📎')
  }

  async function submit(e) {
    e.preventDefault(); setSaving(true)
    try {
      if (type === 'url') {
        onSaveUrl(f)
      } else {
        // 文件模式：有 File 对象则上传；否则用链接
        await onSaveFile({ ...f, file: (!useLink && file) ? file : undefined })
      }
    } catch(err) { alert('保存失败：' + err.message); setSaving(false) }
  }

  const fileReady = type === 'file' && ((!useLink && file) || (useLink && f.fileUrl))

  return (
    <Modal title="添加工具" onClose={onClose}>
      <form onSubmit={submit} className="p-5 space-y-4">
        {/* 分组 */}
        <div>
          <L>所属分组</L>
          <select value={f.group} onChange={e => set('group', e.target.value)} className="field">
            {GROUPS.map(g => <option key={g}>{g}</option>)}
          </select>
        </div>

        {/* 类型切换 */}
        <div className="flex p-1 rounded-xl gap-1" style={{ background:'var(--surface2)' }}>
          {[['url','🔗 链接工具'], ['file','📎 文件资料']].map(([t, l]) => (
            <button key={t} type="button" onClick={() => { setType(t); setFile(null); setUseLink(false) }}
              className={`press flex-1 py-2 text-sm font-medium rounded-[10px] transition-all duration-200 ${type===t?'text-white':''}`}
              style={type===t ? { background:'#6366F1' } : { color:'var(--muted)' }}>
              {l}
            </button>
          ))}
        </div>

        {/* 图标 + 名称 */}
        <div className="flex gap-3">
          <div className="w-[68px] shrink-0">
            <L>图标</L>
            <input value={f.icon} onChange={e => set('icon', e.target.value)} className="field text-center text-2xl p-2" />
          </div>
          <div className="flex-1">
            <L>名称 *</L>
            <input value={f.name} onChange={e => set('name', e.target.value)} placeholder="工具 / 文件名称" required className="field" />
          </div>
        </div>

        {/* 网址 或 文件上传/链接 */}
        {type === 'url' ? (
          <div>
            <L>网址 *</L>
            <input value={f.url} onChange={e => set('url', e.target.value)} placeholder="https://..." required type="url" className="field" />
          </div>
        ) : (
          <div className="space-y-2">
            {!useLink ? (
              <>
                <L>上传文件</L>
                <input ref={fileRef} type="file" className="hidden" onChange={onFileChange} />
                <button type="button" onClick={() => fileRef.current?.click()}
                  className="press w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium"
                  style={{ border:'1.5px dashed var(--border)',
                           color: file ? 'var(--text)' : 'var(--muted)',
                           background: file ? 'var(--surface2)' : 'transparent' }}>
                  <Upload className="w-4 h-4 shrink-0" />
                  {file ? file.name : '点击选择文件'}
                </button>
                {file && <p className="text-[11px]" style={{ color:'var(--muted)' }}>{(file.size/1024).toFixed(1)} KB</p>}
                <button type="button" onClick={() => setUseLink(true)}
                  className="text-[11px] underline" style={{ color:'var(--muted)' }}>
                  改为粘贴外部链接
                </button>
              </>
            ) : (
              <>
                <L>文件分享链接 *</L>
                <input value={f.fileUrl} onChange={e => set('fileUrl', e.target.value)}
                  placeholder="https://..." required type="url" className="field" />
                <p className="text-[11px]" style={{ color:'var(--muted)' }}>飞书云盘 / 阿里云盘 / OneDrive 分享链接</p>
                <button type="button" onClick={() => setUseLink(false)}
                  className="text-[11px] underline" style={{ color:'var(--muted)' }}>
                  改为直接上传文件
                </button>
              </>
            )}
          </div>
        )}

        {/* 描述 */}
        <div>
          <L>描述（选填）</L>
          <input value={f.desc} onChange={e => set('desc', e.target.value)} placeholder="简单描述用途或内容" className="field" />
        </div>

        <div className="flex gap-2.5 pt-1">
          <button type="button" onClick={onClose}
            className="press flex-1 py-2.5 text-sm font-semibold rounded-xl"
            style={{ background:'var(--surface2)', color:'var(--muted)' }}>取消</button>
          <button type="submit" disabled={saving || (type === 'file' && !fileReady)}
            className="press flex-1 py-2.5 text-sm font-semibold text-white rounded-xl disabled:opacity-60"
            style={{ background:'#6366F1' }}>
            {saving ? (file && !useLink ? '上传中…' : '保存中…') : '保存'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ─── 添加看板弹窗 ─────────────────────────────────────────────────────────────
function AddDashModal({ onClose, onSave }) {
  const [f, setF] = useState({ icon:'📊', name:'', desc:'', url:'' })
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  return (
    <Modal title="添加数据看板" onClose={onClose}>
      <form onSubmit={e => { e.preventDefault(); if(f.name && f.url) onSave(f) }} className="p-5 space-y-4">
        <div className="flex gap-3">
          <div className="w-[68px] shrink-0">
            <L>图标</L>
            <input value={f.icon} onChange={e => set('icon', e.target.value)} className="field text-center text-2xl p-2" />
          </div>
          <div className="flex-1">
            <L>名称 *</L>
            <input value={f.name} onChange={e => set('name', e.target.value)} placeholder="看板名称" required className="field" />
          </div>
        </div>
        <div>
          <L>网址 *</L>
          <input value={f.url} onChange={e => set('url', e.target.value)} placeholder="https://..." required type="url" className="field" />
        </div>
        <div>
          <L>描述（选填）</L>
          <input value={f.desc} onChange={e => set('desc', e.target.value)} placeholder="简单描述" className="field" />
        </div>
        <div className="flex gap-2.5 pt-1">
          <button type="button" onClick={onClose}
            className="press flex-1 py-2.5 text-sm font-semibold rounded-xl"
            style={{ background:'var(--surface2)', color:'var(--muted)' }}>取消</button>
          <button type="submit"
            className="press flex-1 py-2.5 text-sm font-semibold text-white rounded-xl"
            style={{ background:'#6366F1' }}>保存</button>
        </div>
      </form>
    </Modal>
  )
}

// ─── 预览弹窗 ─────────────────────────────────────────────────────────────────
function PreviewModal({ url, onClose }) {
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 lg:p-8 animate-fade-in"
      style={{ background:'rgba(0,0,0,0.75)', backdropFilter:'blur(10px)' }}
      onClick={onClose}>
      <div className="w-full max-w-5xl rounded-2xl overflow-hidden animate-scale-in flex flex-col shadow-2xl"
        style={{ height:'88vh', background:'var(--surface)', border:'1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 py-3 shrink-0" style={{ borderBottom:'1px solid var(--border)' }}>
          <button onClick={onClose}
            className="press flex items-center justify-center w-7 h-7 rounded-lg shrink-0 transition-colors"
            style={{ background:'rgba(244,63,94,0.1)', color:'#E11D48', border:'1px solid rgba(244,63,94,0.2)' }}>
            <X className="w-3.5 h-3.5" />
          </button>
          <div className="flex-1 flex justify-center">
            <div className="px-3 py-1 rounded-lg text-[11px] font-mono truncate max-w-sm"
              style={{ background:'var(--surface2)', color:'var(--muted)', border:'1px solid var(--border)' }}>
              {url}
            </div>
          </div>
          <a href={url} target="_blank" rel="noopener noreferrer"
            className="press flex items-center justify-center w-7 h-7 rounded-lg shrink-0"
            style={{ background:'var(--surface2)', color:'var(--muted)' }}>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
        <iframe src={url} className="flex-1 w-full border-0" title="预览" />
      </div>
      <p className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[11px]"
        style={{ color:'rgba(255,255,255,0.3)' }}>点击空白处或按 Esc 关闭</p>
    </div>,
    document.body
  )
}

// ─── 通用弹窗（Portal，导出供 Projects.jsx 使用）──────────────────────────────
export function Modal({ title, onClose, children }) {
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return createPortal(
    <div className="fixed inset-0 z-[200] overflow-y-auto animate-fade-in"
      style={{ background:'rgba(0,0,0,0.5)', backdropFilter:'blur(8px)' }}
      onClick={onClose}>
      <div className="flex min-h-full items-center justify-center p-4"
        onClick={e => e.stopPropagation()}>
        <div className="w-full max-w-md rounded-2xl shadow-2xl animate-scale-in"
          style={{ background:'var(--surface)', border:'1px solid var(--border)' }}>
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom:'1px solid var(--border)' }}>
            <h3 className="font-semibold text-[15px]" style={{ color:'var(--text)' }}>{title}</h3>
            <button onClick={onClose}
              className="press w-7 h-7 flex items-center justify-center rounded-xl"
              style={{ background:'var(--surface2)', color:'var(--muted)' }}>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {children}
        </div>
      </div>
    </div>,
    document.body
  )
}

function L({ children }) {
  return <label className="block text-xs font-semibold mb-1.5" style={{ color:'var(--muted)' }}>{children}</label>
}
