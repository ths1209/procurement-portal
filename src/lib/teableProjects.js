/**
 * 项目表 — 通过后端代理 /t/projects/*。
 * 表结构在 Teable 端已维护,前端不再负责建字段。
 */

import { api, isApiConfigured } from './api'

export const F = {
  id:          '编号',
  task:        '工作任务(OKR)',
  startDate:   '任务发布时间',
  planDate:    '计划完成时间',
  actualDate:  '实际完成时间',
  progress:    '任务当前进展',
  status:      '完成状态',
  owner:       '责任人',
  ownerJobId:  '责任人工号',
  org:         '采购组织',
  deliverable: '交付成果链接',
  lateReason:  '未及时交付原因分析',
  taskList:    '任务清单(具体任务分解)',
  createdBy:   '创建人邮箱',
  reviewStatus:'审核状态',
  history:     '操作历史',
}

function parseHistory(raw) {
  try { return JSON.parse(raw || '[]') } catch { return [] }
}

function norm(r) {
  const f = r.fields ?? {}
  return {
    _id:         r.id,
    id:          f[F.id]          ?? '',
    task:        f[F.task]        ?? '',
    startDate:   f[F.startDate]   ?? '',
    planDate:    f[F.planDate]    ?? '',
    actualDate:  f[F.actualDate]  ?? '',
    progress:    f[F.progress]    ?? '',
    status:      f[F.status]      ?? '',
    owner:       f[F.owner]       ?? '',
    ownerJobId:  f[F.ownerJobId]  ?? '',
    org:         f[F.org]         ?? '',
    deliverable: f[F.deliverable] ?? '',
    lateReason:  f[F.lateReason]  ?? '',
    taskList:    f[F.taskList]    ?? '',
    createdBy:   f[F.createdBy]   ?? '',
    reviewStatus:f[F.reviewStatus]?? '待审核',
    history:     parseHistory(f[F.history]),
  }
}

function cleanFields(fields) {
  return Object.fromEntries(
    Object.entries(fields).filter(([, v]) => v !== null && v !== undefined && v !== '')
  )
}

export function makeHistoryEntry({ by, action, note }) {
  return { t: new Date().toISOString(), by: by || '系统', a: action, n: note || '' }
}

export const isConfigured = () => isApiConfigured()

/** 兼容旧调用,改为空实现(建字段在 Teable 端一次性完成) */
export async function ensureTableFields() { /* no-op */ }

export async function listProjects() {
  const data = await api.get('/t/projects/records', { take: 200 })
  return (data?.records ?? []).map(norm)
}

export async function createProject(fields, who) {
  const entry = makeHistoryEntry({ by: who, action: '创建项目' })
  const allFields = cleanFields({ ...fields, [F.history]: JSON.stringify([entry]) })
  const data = await api.post('/t/projects/records', { records: [{ fields: allFields }] })
  return norm(data?.records?.[0] ?? {})
}

export async function deleteProject(recordId) {
  await api.del(`/t/projects/records/${recordId}`)
}

export async function updateProject(recordId, fields, historyMeta = null, currentHistory = []) {
  const updates = { ...fields }
  if (historyMeta) {
    const entry = makeHistoryEntry(historyMeta)
    const history = [...(Array.isArray(currentHistory) ? currentHistory : []), entry]
    updates[F.history] = JSON.stringify(history)
  }
  await api.patch('/t/projects/records', { records: [{ id: recordId, fields: cleanFields(updates) }] })
}
