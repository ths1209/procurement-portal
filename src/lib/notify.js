/**
 * 数环通消息推送模块
 *
 * 环境变量（在 .env.local 和 GitHub Secrets 中配置）：
 *   VITE_SHUHUAN_WEBHOOK : 数环通工作流触发 URL（包含鉴权 token，不要提交到 git）
 *
 * 请求格式（POST JSON）：
 *   { "jobId": "工号", "content": "消息内容" }
 */

const WEBHOOK = import.meta.env.VITE_SHUHUAN_WEBHOOK ?? ''

/**
 * 发送数环通推送
 * @param {string} jobId   接收人工号
 * @param {string} content 消息正文
 */
/**
 * @returns {Promise<{ok:boolean, msg:string}>}
 */
export async function sendNotify(jobId, content) {
  if (!jobId) return { ok: false, msg: '接收人工号为空' }
  if (!WEBHOOK) {
    console.log(`[数环通·未配置] 工号:${jobId}\n${content}`)
    return { ok: false, msg: '数环通未配置' }
  }
  try {
    // 使用 no-cors + text/plain 绕过 CORS 预检，服务器照常收到 JSON 字符串
    await fetch(WEBHOOK, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ jobId, title: '采购工作门户通知', content }),
    })
    console.log(`[数环通] 请求已发送 → 工号:${jobId}`)
    return { ok: true, msg: `已发送至工号 ${jobId}` }
  } catch (e) {
    console.warn('[数环通] 推送异常:', e.message)
    return { ok: false, msg: e.message }
  }
}

/** 项目审核通过通知 */
export async function notifyApproved(project) {
  if (!project.ownerJobId) return { ok: false, msg: '该项目未填写责任人工号' }
  const date = project.planDate ? project.planDate.slice(0, 10) : '未设置'
  return sendNotify(
    project.ownerJobId,
    `【项目审核通过】您的项目「${project.task?.slice(0, 30)}」已审核通过。\n计划交付日期：${date}，请按期推进。`
  )
}

/** 项目交付期限临近通知（3 或 1 个工作日） */
export async function notifyDeadline(project, daysLeft) {
  if (!project.ownerJobId) return
  await sendNotify(
    project.ownerJobId,
    `【交付提醒】您负责的项目「${project.task?.slice(0, 30)}」距计划交付还剩 ${daysLeft} 个工作日（${project.planDate?.slice(0, 10)}），请及时跟进。`
  )
}

/**
 * 催办通知 —— 支持多个工号（逗号/空格分隔或数组）
 * @param {string|string[]} jobIds  工号列表
 * @param {object} project          项目对象
 * @param {string} sender           催办人名称
 * @returns {Promise<{ok:boolean, sent:number, failed:number, details:string[]}>}
 */
export async function notifyUrge(jobIds, project, sender) {
  const ids = (Array.isArray(jobIds) ? jobIds : String(jobIds).split(/[,，\s]+/))
    .map(s => s.trim()).filter(Boolean)
  if (ids.length === 0) return { ok: false, sent: 0, failed: 0, details: ['工号列表为空'] }

  const content =
    `【催办提醒】${sender || '管理员'} 提醒您跟进项目：\n` +
    `「${project.task?.slice(0, 40) || '—'}」\n` +
    `当前状态：${project.status || '—'}  计划完成：${project.planDate?.slice(0, 10) || '未设置'}\n` +
    `请及时更新进展。`

  const results = await Promise.allSettled(ids.map(id => sendNotify(id, content)))

  let sent = 0, failed = 0
  const details = results.map((r, i) => {
    if (r.status === 'fulfilled' && r.value?.ok) { sent++; return `✓ ${ids[i]}` }
    failed++
    return `✗ ${ids[i]}：${r.value?.msg || r.reason?.message || '失败'}`
  })
  return { ok: sent > 0, sent, failed, details }
}
