/**
 * AI 需求池 — 通过后端代理 /t/ai/*。
 */

import { api, isApiConfigured } from './api'

const FT = {
  scene:       '应用场景',
  asis:        'AS-IS',
  tobe:        'TO-BE',
  roi:         'ROI',
  submitter:   '提交人',
  submittedAt: '提交时间',
  status:      '审核状态',
  follower:    '跟进人',
  followStatus:'跟进状态',
  urgency:     '优先级',
  history:     '修改历史',
}

export const FOLLOW_STATUS_OPTS = ['待跟进', '跟进中', '已完成']
export const URGENCY_OPTS = ['紧急', '较紧急', '一般', '低优先']

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

export function isAIConfigured() { return isApiConfigured() }

/** 字段在 Teable 端已维护,前端 no-op */
export async function ensureAIFields() { /* no-op */ }

export async function listAI() {
  const data = await api.get('/t/ai/records', { take: 500, fieldKeyType: 'name' })
  const all = (data?.records ?? []).map(norm)
  return {
    approved: all.filter(r => r.status === 'approved'),
    pending:  all.filter(r => r.status === 'pending'),
  }
}

export async function createAI({ scene, asis, tobe, roi, urgency }, submitter) {
  const fields = {
    [FT.scene]:       scene,
    [FT.asis]:        asis,
    [FT.tobe]:        tobe,
    [FT.roi]:         roi,
    [FT.submitter]:   submitter,
    [FT.submittedAt]: new Date().toISOString(),
    [FT.status]:      'pending',
    [FT.followStatus]:'待跟进',
    [FT.history]:     historyLine(submitter, `提交需求${urgency ? `,优先级「${urgency}」` : ''}`),
  }
  if (urgency) fields[FT.urgency] = urgency
  return api.post('/t/ai/records', { fieldKeyType: 'name', records: [{ fields }] })
}

export async function approveAI(id, approved, byUser, currentHistory = '') {
  const action = approved ? '审批通过' : '审批拒绝'
  await api.patch('/t/ai/records', {
    fieldKeyType: 'name',
    records: [{ id, fields: {
      [FT.status]:  approved ? 'approved' : 'rejected',
      [FT.history]: appendHistory(currentHistory, byUser || '管理员', action),
    }}],
  })
}

export async function followAI(id, follower, followStatus, byUser, currentHistory = '') {
  const action = `接手跟进,状态「${followStatus || '待跟进'}」`
  const fields = {
    [FT.follower]: follower,
    [FT.history]:  appendHistory(currentHistory, byUser || follower, action),
  }
  if (followStatus) fields[FT.followStatus] = followStatus
  await api.patch('/t/ai/records', { fieldKeyType: 'name', records: [{ id, fields }] })
}

export async function updateFollowStatus(id, followStatus, byUser, currentHistory = '', prevStatus = '') {
  const action = prevStatus
    ? `跟进状态 ${prevStatus} → ${followStatus}`
    : `跟进状态更新为「${followStatus}」`
  await api.patch('/t/ai/records', {
    fieldKeyType: 'name',
    records: [{ id, fields: {
      [FT.followStatus]: followStatus,
      [FT.history]:      appendHistory(currentHistory, byUser, action),
    }}],
  })
}

export async function updateUrgency(id, urgency, byUser, currentHistory = '', prevUrgency = '') {
  const action = prevUrgency
    ? `优先级 ${prevUrgency || '未设置'} → ${urgency || '未设置'}`
    : `优先级设为「${urgency}」`
  await api.patch('/t/ai/records', {
    fieldKeyType: 'name',
    records: [{ id, fields: {
      [FT.urgency]: urgency,
      [FT.history]: appendHistory(currentHistory, byUser, action),
    }}],
  })
}

export async function deleteAI(id) {
  await api.del(`/t/ai/records/${id}`)
}
