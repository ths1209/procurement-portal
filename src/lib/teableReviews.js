import { api, isApiConfigured } from './api'

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

function clean(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== null && v !== undefined && v !== ''))
}

export function isConfigured() { return isApiConfigured() }

export async function listReviews() {
  const data = await api.get('/t/reviews/records', { take: 500, fieldKeyType: 'name' })
  return (data?.records ?? []).map(norm).sort((a, b) => b.reviewDate.localeCompare(a.reviewDate))
}

export async function createReview(fields, addedBy) {
  return api.post('/t/reviews/records', {
    fieldKeyType: 'name',
    records: [{ fields: { ...clean(fields), [F.addedBy]: addedBy } }],
  })
}

export async function updateReview(recordId, fields) {
  return api.patch('/t/reviews/records', {
    fieldKeyType: 'name',
    records: [{ id: recordId, fields: clean(fields) }],
  })
}

export async function deleteReview(recordId) {
  return api.del(`/t/reviews/records/${recordId}`)
}
