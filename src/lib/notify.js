/**
 * 数环通消息推送 — 通过后端 /notify 代理。
 * 原 Webhook URL(含鉴权 token)不再出现在前端。
 */

import { api, isApiConfigured } from './api'

export async function sendNotify(jobId, content, title = '采购工作门户通知') {
  if (!jobId) return { ok: false, msg: '接收人工号为空' }
  if (!isApiConfigured()) {
    console.log(`[数环通·API 未配置] 工号:${jobId}\n${content}`)
    return { ok: false, msg: 'API 未配置' }
  }
  try {
    await api.post('/notify', { jobId: String(jobId), title, content })
    return { ok: true, msg: `已发送至工号 ${jobId}` }
  } catch (e) {
    console.warn('[数环通] 推送异常:', e.message)
    return { ok: false, msg: e.message }
  }
}

export async function notifyApproved(project) {
  if (!project.ownerJobId) return { ok: false, msg: '该项目未填写责任人工号' }
  const date = project.planDate ? project.planDate.slice(0, 10) : '未设置'
  return sendNotify(
    project.ownerJobId,
    `【项目审核通过】您的项目「${project.task?.slice(0, 30)}」已审核通过。\n计划交付日期:${date},请按期推进。`
  )
}

export async function notifyDeadline(project, daysLeft) {
  if (!project.ownerJobId) return
  await sendNotify(
    project.ownerJobId,
    `【交付提醒】您负责的项目「${project.task?.slice(0, 30)}」距计划交付还剩 ${daysLeft} 个工作日(${project.planDate?.slice(0, 10)}),请及时跟进。`
  )
}

export async function notifyUrge(jobIds, project, sender) {
  const ids = (Array.isArray(jobIds) ? jobIds : String(jobIds).split(/[,,\s]+/))
    .map(s => s.trim()).filter(Boolean)
  if (ids.length === 0) return { ok: false, sent: 0, failed: 0, details: ['工号列表为空'] }

  const content =
    `【催办提醒】${sender || '管理员'} 提醒您跟进项目:\n` +
    `「${project.task?.slice(0, 40) || '—'}」\n` +
    `当前状态:${project.status || '—'}  计划完成:${project.planDate?.slice(0, 10) || '未设置'}\n` +
    `请及时更新进展。`

  const results = await Promise.allSettled(ids.map(id => sendNotify(id, content)))

  let sent = 0, failed = 0
  const details = results.map((r, i) => {
    if (r.status === 'fulfilled' && r.value?.ok) { sent++; return `✓ ${ids[i]}` }
    failed++
    return `✗ ${ids[i]}:${r.value?.msg || r.reason?.message || '失败'}`
  })
  return { ok: sent > 0, sent, failed, details }
}
