/**
 * AI 需求池数据层
 * 对应 Teable 表：AI需求池（VITE_TEABLE_AI_TABLE_ID）
 */

const API   = (import.meta.env.VITE_TEABLE_API_BASE ?? '').replace(/\/$/, '')
const TOKEN = import.meta.env.VITE_TEABLE_TOKEN ?? ''
const TID   = import.meta.env.VITE_TEABLE_AI_TABLE_ID ?? ''

// ─── 字段名映射 ───────────────────────────────────────────────────────────────
const FT = {
  scene:       '应用场景',
  asis:        'AS-IS',
  tobe:        'TO-BE',
  roi:         'ROI',
  submitter:   '提交人',
  submittedAt: '提交时间',
  status:      '审核状态',   // pending | approved | rejected
  follower:    '跟进人',
  followStatus:'跟进状态',   // 待跟进 | 跟进中 | 已完成
  urgency:     '优先级',     // 紧急 | 较紧急 | 一般 | 低优先
  history:     '修改历史',
}

export const FOLLOW_STATUS_OPTS = ['待跟进', '跟进中', '已完成']
export const URGENCY_OPTS = ['紧急', '较紧急', '一般', '低优先']

const FIELD_DEFS = [
  { name: FT.scene,       type: 'singleLineText' },
  { name: FT.asis,        type: 'singleLineText' },
  { name: FT.tobe,        type: 'singleLineText' },
  { name: FT.roi,         type: 'singleLineText' },
  { name: FT.submitter,   type: 'singleLineText' },
  { name: FT.submittedAt, type: 'singleLineText' },
  {
    name: FT.status, type: 'singleSelect',
    options: { choices: [
      { name: 'pending',  color: { name: 'grayLight2'  } },
      { name: 'approved', color: { name: 'greenLight2' } },
      { name: 'rejected', color: { name: 'redLight2'   } },
    ]},
  },
  { name: FT.follower, type: 'singleLineText' },
  {
    name: FT.followStatus, type: 'singleSelect',
    options: { choices: [
      { name: '待跟进', color: { name: 'grayLight2'  } },
      { name: '跟进中', color: { name: 'blueLight2'  } },
      { name: '已完成', color: { name: 'greenLight2' } },
    ]},
  },
  {
    name: FT.urgency, type: 'singleSelect',
    options: { choices: [
      { name: '紧急'   },
      { name: '较紧急' },
      { name: '一般'   },
      { name: '低优先' },
    ]},
  },
  { name: FT.history, type: 'longText' },
]

// ─── 工具函数 ─────────────────────────────────────────────────────────────────
async function req(path, init = {}) {
  const res = await fetch(`${API}/api${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  if (!res.ok) {
    const b = await res.json().catch(() => ({}))
    throw new Error(b.message ?? `API ${res.status}`)
  }
  if (res.status === 204) return null
  return res.json().catch(() => null)
}

function norm(r) {
  const f = r.fields ?? {}
  return {
    _id:         r.id,
    scene:       f[FT.scene]       ?? '',
    asis:        f[FT.asis]        ?? '',
    tobe:        f[FT.tobe]        ?? '',
    roi:         f[FT.roi]         ?? '',
    submitter:   f[FT.submitter]   ?? '',
    submittedAt: f[FT.submittedAt] ?? '',
    status:      f[FT.status]      ?? 'pending',
    follower:    f[FT.follower]    ?? '',
    followStatus:f[FT.followStatus]?? '待跟进',
    urgency:     f[FT.urgency]     ?? '',
    history:     f[FT.history]     ?? '',
  }
}

function historyLine(byUser, action) {
  const now = new Date()
  const ts = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`
  return `${ts} | ${byUser} | ${action}`
}

function appendHistory(current, byUser, action) {
  const line = historyLine(byUser, action)
  return current ? `${current}\n${line}` : line
}

// ─── 公开 API ─────────────────────────────────────────────────────────────────
export function isAIConfigured() { return !!TID }

export async function ensureAIFields() {
  if (!TID) return
  const existing = await req(`/table/${TID}/field`)
  const names = new Set(existing.map(f => f.name))
  for (const def of FIELD_DEFS) {
    if (!names.has(def.name)) {
      try { await req(`/table/${TID}/field`, { method:'POST', body: JSON.stringify(def) }) }
      catch (e) { console.warn(`[teableAI] 创建字段 "${def.name}" 失败:`, e.message) }
    }
  }
}

export async function listAI() {
  if (!TID) return { approved: [], pending: [] }
  const data = await req(`/table/${TID}/record?take=500&fieldKeyType=name`)
  const all = (data.records ?? []).map(norm)
  return {
    approved: all.filter(r => r.status === 'approved'),
    pending:  all.filter(r => r.status === 'pending'),
  }
}

export async function createAI({ scene, asis, tobe, roi, urgency }, submitter) {
  if (!TID) throw new Error('未配置 AI 需求池表')
  const fields = {
    [FT.scene]:       scene,
    [FT.asis]:        asis,
    [FT.tobe]:        tobe,
    [FT.roi]:         roi,
    [FT.submitter]:   submitter,
    [FT.submittedAt]: new Date().toISOString(),
    [FT.status]:      'pending',
    [FT.followStatus]:'待跟进',
    [FT.history]:     historyLine(submitter, `提交需求${urgency ? `，优先级「${urgency}」` : ''}`),
  }
  if (urgency) fields[FT.urgency] = urgency
  return req(`/table/${TID}/record?fieldKeyType=name`, {
    method: 'POST',
    body: JSON.stringify({ records: [{ fields }] }),
  })
}

export async function approveAI(id, approved, byUser, currentHistory = '') {
  if (!TID) throw new Error('未配置 AI 需求池表')
  const action = approved ? '审批通过' : '审批拒绝'
  await req(`/table/${TID}/record?fieldKeyType=name`, {
    method: 'PATCH',
    body: JSON.stringify({
      records: [{ id, fields: {
        [FT.status]:  approved ? 'approved' : 'rejected',
        [FT.history]: appendHistory(currentHistory, byUser || '管理员', action),
      }}],
    }),
  })
}

export async function followAI(id, follower, followStatus, byUser, currentHistory = '') {
  if (!TID) throw new Error('未配置 AI 需求池表')
  const action = `接手跟进，状态「${followStatus || '待跟进'}」`
  const fields = {
    [FT.follower]:    follower,
    [FT.history]:     appendHistory(currentHistory, byUser || follower, action),
  }
  if (followStatus) fields[FT.followStatus] = followStatus
  await req(`/table/${TID}/record?fieldKeyType=name`, {
    method: 'PATCH',
    body: JSON.stringify({ records: [{ id, fields }] }),
  })
}

export async function updateFollowStatus(id, followStatus, byUser, currentHistory = '', prevStatus = '') {
  if (!TID) throw new Error('未配置 AI 需求池表')
  const action = prevStatus
    ? `跟进状态 ${prevStatus} → ${followStatus}`
    : `跟进状态更新为「${followStatus}」`
  await req(`/table/${TID}/record?fieldKeyType=name`, {
    method: 'PATCH',
    body: JSON.stringify({
      records: [{ id, fields: {
        [FT.followStatus]: followStatus,
        [FT.history]:      appendHistory(currentHistory, byUser, action),
      }}],
    }),
  })
}

export async function updateUrgency(id, urgency, byUser, currentHistory = '', prevUrgency = '') {
  if (!TID) throw new Error('未配置 AI 需求池表')
  const action = prevUrgency
    ? `优先级 ${prevUrgency || '未设置'} → ${urgency || '未设置'}`
    : `优先级设为「${urgency}」`
  await req(`/table/${TID}/record?fieldKeyType=name`, {
    method: 'PATCH',
    body: JSON.stringify({
      records: [{ id, fields: {
        [FT.urgency]: urgency,
        [FT.history]: appendHistory(currentHistory, byUser, action),
      }}],
    }),
  })
}

export async function deleteAI(id) {
  if (!TID) throw new Error('未配置 AI 需求池表')
  await req(`/table/${TID}/record`, {
    method: 'DELETE',
    body: JSON.stringify({ recordIds: [id] }),
  })
}
