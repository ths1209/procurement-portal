/**
 * GitHub Actions 定时任务：检查项目交付期限，触发数环通通知
 *
 * 运行环境：Node.js（GitHub Actions Ubuntu 环境）
 * 触发条件：每个工作日早 9:00（北京时间），见 .github/workflows/notify.yml
 *
 * 所需环境变量（在 GitHub Secrets 中配置）：
 *   VITE_TEABLE_API_BASE          Teable 地址
 *   VITE_TEABLE_TOKEN             Teable Token
 *   VITE_TEABLE_PROJECTS_TABLE_ID 项目表 ID
 *   VITE_SHUHUAN_API              数环通推送接口（TODO: 填入真实地址）
 *   VITE_SHUHUAN_TOKEN            数环通鉴权 Token（可选）
 */

const https = require('https')

const TEABLE_API  = (process.env.VITE_TEABLE_API_BASE ?? '').replace(/\/$/, '')
const TOKEN       = process.env.VITE_TEABLE_TOKEN ?? ''
const TID         = process.env.VITE_TEABLE_PROJECTS_TABLE_ID ?? ''
const NOTIFY_URL  = process.env.VITE_SHUHUAN_WEBHOOK ?? ''

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

/** 计算从 today 出发，经过 n 个工作日后的日期 */
function addWorkingDays(today, n) {
  const d = new Date(today)
  let added = 0
  while (added < n) {
    d.setDate(d.getDate() + 1)
    const dow = d.getDay()
    if (dow !== 0 && dow !== 6) added++
  }
  return d
}

/** 格式化日期为 YYYY-MM-DD */
function fmt(date) {
  return date.toISOString().slice(0, 10)
}

/** 简单 HTTPS 请求 */
function httpReq(url, opts, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const options = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: opts.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...opts.headers,
        ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
      },
    }
    const req = https.request(options, res => {
      let data = ''
      res.on('data', c => (data += c))
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }) }
        catch { resolve({ status: res.statusCode, body: data }) }
      })
    })
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

// ─── Teable 项目列表 ──────────────────────────────────────────────────────────

async function fetchProjects() {
  const url = `${TEABLE_API}/api/table/${TID}/record?take=500&fieldKeyType=name`
  const res = await httpReq(url, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  })
  if (res.status !== 200) throw new Error(`Teable 请求失败: ${res.status}`)
  return (res.body.records ?? []).map(r => {
    const f = r.fields ?? {}
    return {
      id:         f['编号']       ?? '',
      task:       f['工作任务（OKR）'] ?? '',
      planDate:   f['计划完成时间']  ?? '',
      owner:      f['责任人']      ?? '',
      ownerJobId: f['责任人工号']   ?? '',
      status:     f['完成状态']    ?? '',
    }
  })
}

// ─── 数环通推送 ───────────────────────────────────────────────────────────────

async function sendNotify(jobId, content) {
  if (!jobId) return
  if (!NOTIFY_URL) {
    // 占位：接口未配置时打印日志
    console.log(`[Notify·占位] → 工号:${jobId}\n${content}\n`)
    return
  }
  try {
    const body = JSON.stringify({ jobId, title: '采购运营门户通知', content })
    const res = await httpReq(NOTIFY_URL, {
      method: 'POST',
      headers: {},
    }, body)
    console.log(`[Notify] 工号:${jobId} → ${res.status}`)
  } catch (e) {
    console.warn(`[Notify] 推送失败 工号:${jobId}:`, e.message)
  }
}

// ─── 主逻辑 ───────────────────────────────────────────────────────────────────

async function main() {
  if (!TEABLE_API || !TOKEN || !TID) {
    console.error('缺少 Teable 环境变量，退出')
    process.exit(1)
  }

  const today  = new Date(); today.setHours(0, 0, 0, 0)
  const in1day = fmt(addWorkingDays(today, 1))
  const in3day = fmt(addWorkingDays(today, 3))

  console.log(`今日: ${fmt(today)}  1工作日后: ${in1day}  3工作日后: ${in3day}`)

  const projects = await fetchProjects()
  console.log(`共加载 ${projects.length} 个项目`)

  let sent = 0
  for (const p of projects) {
    // 跳过已完成/暂停的项目
    if (p.status === '已完成' || p.status === '暂停') continue
    // 跳过没有工号或计划时间的项目
    if (!p.ownerJobId || !p.planDate) continue

    const planDate = p.planDate.slice(0, 10)

    if (planDate === in3day) {
      const msg = `【交付提醒】您负责的项目「${p.task.slice(0, 30)}」距计划交付还剩 3 个工作日（${planDate}），请及时跟进。`
      await sendNotify(p.ownerJobId, msg)
      sent++
    } else if (planDate === in1day) {
      const msg = `【紧急提醒】您负责的项目「${p.task.slice(0, 30)}」明日（${planDate}）即为计划交付日，请确认完成情况。`
      await sendNotify(p.ownerJobId, msg)
      sent++
    }
  }

  console.log(`本次推送 ${sent} 条通知`)
}

main().catch(e => { console.error(e); process.exit(1) })
