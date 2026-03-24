const BASE = (import.meta.env.VITE_TEABLE_API_BASE ?? '').replace(/\/$/, '')
const TOKEN = import.meta.env.VITE_TEABLE_TOKEN ?? ''
const TID   = import.meta.env.VITE_TEABLE_REVIEWS_TABLE_ID ?? ''

export const F = {
  name:        '项目名称',
  code:        '项目编号',
  amount:      '合同金额',
  reviewDate:  '评审日期',
  meetingTime: '会议时间',
  host:        '主持人',
  attendees:   '参会人员',
  conclusion:  '评审结论',
  minutes:     '会议纪要',
  addedBy:     '登记人',
}

export const CONCLUSION_OPTS = ['通过', '条件通过', '不通过', '待定']

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
    _id:         r.id,
    name:        f[F.name]        ?? '',
    code:        f[F.code]        ?? '',
    amount:      f[F.amount]      ?? '',
    reviewDate:  f[F.reviewDate]  ?? '',
    meetingTime: f[F.meetingTime] ?? '',
    host:        f[F.host]        ?? '',
    attendees:   f[F.attendees]   ?? '',
    conclusion:  f[F.conclusion]  ?? '待定',
    minutes:     f[F.minutes]     ?? '',
    addedBy:     f[F.addedBy]     ?? '',
  }
}

export function isConfigured() { return !!TID }

export async function listReviews() {
  if (!TID) return []
  const data = await req(`/table/${TID}/record?take=500&fieldKeyType=name`)
  return (data.records ?? []).map(norm).sort((a, b) => b.reviewDate.localeCompare(a.reviewDate))
}

export async function createReview(fields, addedBy) {
  if (!TID) throw new Error('未配置百万项目评审数据表')
  return req(`/table/${TID}/record`, {
    method: 'POST',
    body: JSON.stringify({
      records: [{ fields: { ...clean(fields), [F.addedBy]: addedBy } }],
      fieldKeyType: 'name',
    }),
  })
}

export async function updateReview(recordId, fields) {
  if (!TID) throw new Error('未配置百万项目评审数据表')
  return req(`/table/${TID}/record`, {
    method: 'PATCH',
    body: JSON.stringify({
      records: [{ id: recordId, fields: clean(fields) }],
      fieldKeyType: 'name',
    }),
  })
}

export async function deleteReview(recordId) {
  if (!TID) throw new Error('未配置百万项目评审数据表')
  return req(`/table/${TID}/record/${recordId}`, { method: 'DELETE' })
}

function clean(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== null && v !== undefined && v !== ''))
}
