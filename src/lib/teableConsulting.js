const BASE = (import.meta.env.VITE_TEABLE_API_BASE ?? '').replace(/\/$/, '')
const TOKEN = import.meta.env.VITE_TEABLE_TOKEN ?? ''
const TID   = import.meta.env.VITE_TEABLE_CONSULTING_TABLE_ID ?? ''

export const C = {
  type:         '类型',
  date:         '日期',
  addedBy:      '登记人',
  title:        '主题/名称',
  beneficiary:  '受益组织',
  headcount:    '参与人数',
  trainer:      '讲师',
  toolName:     '工具名称',
  usageRate:    '使用率',
  direction:    '咨询方向',
  outcome:      '效果/结论',
  landed:       '落地情况',
  remark:       '备注',
}

export const TYPE_OPTS    = ['培训赋能', '项目赋能', '工具赋能', '咨询赋能']
export const LANDED_OPTS  = ['已落地', '推进中', '未落地']

export const TYPE_CFG = {
  '培训赋能': { color: '#8B5CF6', bg: 'rgba(139,92,246,0.12)' },
  '项目赋能': { color: '#3B82F6', bg: 'rgba(59,130,246,0.12)' },
  '工具赋能': { color: '#10B981', bg: 'rgba(16,185,129,0.12)' },
  '咨询赋能': { color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
}

async function req(path, init = {}) {
  const res = await fetch(`${BASE}/api${path}`, {
    ...init,
    headers: {
      Authorization:  `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message ?? `请求失败 ${res.status}`)
  }
  if (res.status === 204) return null
  return res.json()
}

function norm(r) {
  const f = r.fields ?? {}
  return {
    _id:        r.id,
    type:       f[C.type]        ?? '',
    date:       f[C.date]        ?? '',
    addedBy:    f[C.addedBy]     ?? '',
    title:      f[C.title]       ?? '',
    beneficiary:f[C.beneficiary] ?? '',
    headcount:  f[C.headcount]   ?? '',
    trainer:    f[C.trainer]     ?? '',
    toolName:   f[C.toolName]    ?? '',
    usageRate:  f[C.usageRate]   ?? '',
    direction:  f[C.direction]   ?? '',
    outcome:    f[C.outcome]     ?? '',
    landed:     f[C.landed]      ?? '',
    remark:     f[C.remark]      ?? '',
  }
}

export function isConfigured() { return !!TID }

export async function listConsulting() {
  if (!TID) return []
  const data = await req(`/table/${TID}/record?take=500&fieldKeyType=name`)
  return (data.records ?? []).map(norm).sort((a, b) => b.date.localeCompare(a.date))
}

export async function createRecord(fields, addedBy) {
  if (!TID) throw new Error('未配置咨询赋能台账数据表')
  return req(`/table/${TID}/record`, {
    method: 'POST',
    body: JSON.stringify({
      records: [{ fields: { ...clean(fields), [C.addedBy]: addedBy } }],
      fieldKeyType: 'name',
    }),
  })
}

export async function updateRecord(recordId, fields) {
  if (!TID) throw new Error('未配置咨询赋能台账数据表')
  return req(`/table/${TID}/record`, {
    method: 'PATCH',
    body: JSON.stringify({
      records: [{ id: recordId, fields: clean(fields) }],
      fieldKeyType: 'name',
    }),
  })
}

export async function deleteRecord(recordId) {
  if (!TID) throw new Error('未配置咨询赋能台账数据表')
  return req(`/table/${TID}/record/${recordId}`, { method: 'DELETE' })
}

function clean(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== null && v !== undefined && v !== ''))
}
