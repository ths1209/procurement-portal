const BASE = (import.meta.env.VITE_TEABLE_API_BASE ?? '').replace(/\/$/, '')
const TOKEN = import.meta.env.VITE_TEABLE_TOKEN ?? ''
const TID   = import.meta.env.VITE_TEABLE_CONSULTING_TABLE_ID ?? ''

export const C = {
  seq:        '序号',
  question:   '咨询和受理问题（Question）',
  answer:     '咨询建议和反馈（Answer）',
  qType:      '问题类型',
  qStage:     '问题阶段',
  contact:    '对接人',
  dept:       '对接部门',
  handler:    '处理人',
  acceptDate: '受理日期',
  solveDate:  '解决日期',
  status:     'OPEN',
  month:      '受理月份',
}

export const Q_TYPE_OPTS = [
  '执行合规咨询', '供应商管理咨询', '供应商系统咨询',
  '不合规采购事项咨询', '控制建设', '合同环节',
]

export const Q_STAGE_OPTS = [
  '需求环节', '寻源环节', '付款结算', '供应商系统注册初步', '合同环节',
]

export const STATUS_OPTS = ['OPEN', 'CLOSE']

export const Q_TYPE_CFG = {
  '执行合规咨询':     { color: '#6366F1', bg: 'rgba(99,102,241,0.1)'   },
  '供应商管理咨询':   { color: '#0EA5E9', bg: 'rgba(14,165,233,0.1)'   },
  '供应商系统咨询':   { color: '#10B981', bg: 'rgba(16,185,129,0.1)'   },
  '不合规采购事项咨询': { color: '#EF4444', bg: 'rgba(239,68,68,0.1)'  },
  '控制建设':         { color: '#8B5CF6', bg: 'rgba(139,92,246,0.1)'   },
  '合同环节':         { color: '#F59E0B', bg: 'rgba(245,158,11,0.1)'   },
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
    seq:        f[C.seq]        ?? '',
    question:   f[C.question]   ?? '',
    answer:     f[C.answer]     ?? '',
    qType:      f[C.qType]      ?? '',
    qStage:     f[C.qStage]     ?? '',
    contact:    f[C.contact]    ?? '',
    dept:       f[C.dept]       ?? '',
    handler:    f[C.handler]    ?? '',
    acceptDate: f[C.acceptDate] ?? '',
    solveDate:  f[C.solveDate]  ?? '',
    status:     f[C.status]     ?? 'OPEN',
    month:      f[C.month]      ?? '',
  }
}

export function isConfigured() { return !!TID }

export async function listConsulting() {
  if (!TID) return []
  const data = await req(`/table/${TID}/record?take=500&fieldKeyType=name`)
  return (data.records ?? []).map(norm).sort((a, b) => b.acceptDate.localeCompare(a.acceptDate))
}

export async function createRecord(fields) {
  if (!TID) throw new Error('未配置咨询赋能台账数据表')
  return req(`/table/${TID}/record`, {
    method: 'POST',
    body: JSON.stringify({
      records: [{ fields: clean(fields) }],
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
