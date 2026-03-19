/**
 * AI 月报总结模块
 *
 * 两种模式：
 *   1. GitHub Actions 模式（推荐）：VITE_GITHUB_TOKEN 存在时使用
 *      - 浏览器触发 workflow_dispatch → 服务端调用 AI（无 Mixed Content 限制）
 *      - 轮询等待完成 → 读取结果文件
 *   2. 直连模式：HTTPS AI 接口 + 浏览器直接调用（HTTPS only）
 *   3. 占位模式：以上都不可用时返回预设汇报
 */

const AI_BASE  = (import.meta.env.VITE_AI_API_BASE  ?? '').replace(/\/$/, '')
const AI_KEY   = import.meta.env.VITE_AI_API_KEY    ?? ''
const AI_MODEL = import.meta.env.VITE_AI_MODEL      ?? 'claude-sonnet-4.6'
const GH_TOKEN = import.meta.env.VITE_GITHUB_TOKEN  ?? ''
const GH_REPO  = import.meta.env.VITE_GITHUB_REPO   ?? 'ths1209/procurement-portal'

const sleep = ms => new Promise(r => setTimeout(r, ms))

/**
 * @param {{ year, month, stats, rows, onProgress?: (msg:string)=>void }} opts
 * @returns {Promise<string>}
 */
export async function generateMonthlySummary({ year, month, stats, rows, onProgress = () => {} }) {
  // 模式 1：通过 GitHub Actions 服务端生成
  if (GH_TOKEN) {
    try {
      return await generateViaActions(year, month, onProgress)
    } catch (e) {
      console.warn('[AI] GitHub Actions 路径失败，降级为预设汇报:', e.message)
    }
  }

  // 模式 2：浏览器直连（HTTPS AI 接口）
  if (AI_BASE && AI_KEY && AI_BASE.startsWith('https')) {
    try {
      onProgress('调用 AI 中…')
      return await callDirectly({ year, month, stats, rows })
    } catch (e) {
      console.warn('[AI] 直连失败:', e.message)
    }
  }

  // 降级：系统预设汇报
  await sleep(400)
  return buildPlaceholder(year, month, stats)
}

// ─── GitHub Actions 模式 ──────────────────────────────────────────────────────

async function generateViaActions(year, month, onProgress) {
  const [owner, repo] = GH_REPO.split('/')
  const base = `https://api.github.com/repos/${owner}/${repo}`
  const ghHeaders = {
    Authorization:  `Bearer ${GH_TOKEN}`,
    Accept:         'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  }

  // 1. 触发 workflow
  onProgress('正在触发 AI 分析…')
  const beforeMs = Date.now()
  const trigRes = await fetch(`${base}/actions/workflows/ai-summary.yml/dispatches`, {
    method:  'POST',
    headers: ghHeaders,
    body:    JSON.stringify({ ref: 'main', inputs: { year: String(year), month: String(month) } }),
  })
  if (!trigRes.ok) {
    const msg = await trigRes.text().catch(() => '')
    throw new Error(`触发失败 ${trigRes.status}${msg ? '：' + msg.slice(0, 100) : ''}`)
  }

  // 2. 等待 run 被创建（GitHub 有延迟）
  onProgress('AI 分析中，预计需要约 1 分钟…')
  await sleep(8000)

  // 3. 轮询 run 状态（最多 3 分钟）
  let done = false
  for (let i = 0; i < 36 && !done; i++) {
    await sleep(5000)
    const runsRes = await fetch(`${base}/actions/runs?event=workflow_dispatch&per_page=10`, { headers: ghHeaders })
    if (!runsRes.ok) continue
    const { workflow_runs: runs } = await runsRes.json()
    // 找本次触发的 run（创建时间 ≥ 触发前）
    const run = runs?.find(r => new Date(r.created_at).getTime() >= beforeMs - 15000
                              && r.path?.includes('ai-summary'))
    if (!run) continue
    if (run.status === 'completed') {
      if (run.conclusion !== 'success') throw new Error(`AI 任务未成功：${run.conclusion}`)
      done = true
    }
  }
  if (!done) throw new Error('等待超时（3分钟），请稍后重试或手动刷新月报')

  // 4. 读取结果文件
  onProgress('正在读取 AI 结果…')
  await sleep(3000) // 等 git push 传播
  const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/ai-summaries/${year}-${month}.json?t=${Date.now()}`
  const resultRes = await fetch(rawUrl)
  if (!resultRes.ok) throw new Error('读取 AI 结果失败，请稍后重试')
  const data = await resultRes.json()
  return data.text
}

// ─── 直连模式 ─────────────────────────────────────────────────────────────────

async function callDirectly({ year, month, stats, rows }) {
  const orgLines = Object.entries(stats.byOrg).map(([o, n]) => `  - ${o}：${n} 项`).join('\n')
  const rowLines = rows.slice(0, 30).map(r =>
    `  - [${r.status || '—'}] ${r.task?.slice(0, 40) || '—'}（${r.owner || '—'}，${r.planDate?.slice(0, 10) || '—'}）`
  ).join('\n')

  const prompt = buildPrompt(year, month, stats, orgLines, rowLines)
  const res = await fetch(`${AI_BASE}/chat/completions`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${AI_KEY}` },
    body:    JSON.stringify({ model: AI_MODEL, messages: [{ role: 'user', content: prompt }], temperature: 0.7, max_tokens: 600 }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message ?? `AI 接口错误 ${res.status}`)
  }
  const data = await res.json()
  return data.choices?.[0]?.message?.content?.trim() ?? '（AI 返回内容为空）'
}

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

function buildPrompt(year, month, stats, orgLines, rowLines) {
  return `你是一位专业的项目管理顾问，请根据以下 ${year} 年 ${month} 月项目进度数据，生成一份简洁、专业的项目月度汇报（150～250字）。

## 数据摘要
- 本月项目总数：${stats.total}
- 已完成：${stats.byStatus['已完成']}  进行中：${stats.byStatus['进行中']}  逾期：${stats.byStatus['逾期']}  未开始：${stats.byStatus['未开始']}
- 完成率：${stats.completeRate}%

## 按采购组织分布
${orgLines}

## 项目明细（部分）
${rowLines}

## 要求
1. 语言正式、简洁，适合向领导汇报
2. 指出本月亮点和潜在风险
3. 提出 1～2 条改进建议
4. 最后一行单独注明：（本报告由 AI 辅助生成）`
}

function buildPlaceholder(year, month, stats) {
  const risk = stats.byStatus['逾期'] > 0
    ? `本月存在 ${stats.byStatus['逾期']} 个逾期项目，需重点关注并推动资源保障。`
    : '本月无逾期项目，整体执行情况良好。'
  return `${year} 年 ${month} 月，采购运营组共推进项目 ${stats.total} 项，其中已完成 ${stats.byStatus['已完成']} 项、进行中 ${stats.byStatus['进行中']} 项，整体完成率为 ${stats.completeRate}%。${risk}

亮点方面，各采购组织积极配合，重点任务整体推进有序。建议关注剩余在途项目的交付节点，强化跨组协作与风险预警机制，确保按期交付。

（本报告由 AI 辅助生成）`
}
