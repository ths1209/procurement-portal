/**
 * GitHub Actions 任务：服务端调用 AI 生成月报，写入 ai-summaries/{year}-{month}.json
 *
 * 环境变量（GitHub Secrets）：
 *   YEAR / MONTH                      年份 / 月份（workflow_dispatch 输入）
 *   VITE_TEABLE_API_BASE              Teable 地址
 *   VITE_TEABLE_TOKEN                 Teable Token
 *   VITE_TEABLE_PROJECTS_TABLE_ID     项目表 ID
 *   VITE_AI_API_BASE                  AI 接口地址（http:// 在服务端没有限制）
 *   VITE_AI_API_KEY                   AI Key
 *   VITE_AI_MODEL                     模型名
 */

const fs   = require('fs')
const path = require('path')

const TEABLE_API = (process.env.VITE_TEABLE_API_BASE ?? '').replace(/\/$/, '')
const TEABLE_TOK = process.env.VITE_TEABLE_TOKEN ?? ''
const TID        = process.env.VITE_TEABLE_PROJECTS_TABLE_ID ?? ''
const AI_BASE    = (process.env.VITE_AI_API_BASE ?? '').replace(/\/$/, '')
const AI_KEY     = process.env.VITE_AI_API_KEY ?? ''
const AI_MODEL   = process.env.VITE_AI_MODEL   ?? 'claude-sonnet-4.6'
const YEAR       = parseInt(process.env.YEAR,  10)
const MONTH      = parseInt(process.env.MONTH, 10)

const ORG_OPTS    = ['运营分析组', '采购稽核组', '支付类合作商管理组']
const STATUS_KEYS = ['已完成', '进行中', '逾期', '未开始', '暂停']

// ─── Teable ───────────────────────────────────────────────────────────────────

async function fetchProjects() {
  const res = await fetch(
    `${TEABLE_API}/api/table/${TID}/record?take=500&fieldKeyType=name`,
    { headers: { Authorization: `Bearer ${TEABLE_TOK}` } }
  )
  if (!res.ok) throw new Error(`Teable ${res.status}`)
  const data = await res.json()
  return (data.records ?? []).map(r => {
    const f = r.fields ?? {}
    return {
      task:      f['工作任务（OKR）']  ?? '',
      planDate:  f['计划完成时间']     ?? '',
      startDate: f['任务发布时间']     ?? '',
      status:    f['完成状态']         ?? '',
      owner:     f['责任人']           ?? '',
      org:       f['采购组织']         ?? '',
    }
  })
}

// ─── 主逻辑 ───────────────────────────────────────────────────────────────────

async function main() {
  if (!YEAR || !MONTH) throw new Error('需要 YEAR 和 MONTH 环境变量')
  if (!TEABLE_API || !TID)  throw new Error('Teable 环境变量未配置')

  console.log(`生成 ${YEAR}年${MONTH}月 AI 月报…`)

  const all = await fetchProjects()
  const rows = all.filter(r => {
    const d = r.planDate || r.startDate
    if (!d) return false
    const pd = new Date(d)
    return pd.getFullYear() === YEAR && pd.getMonth() + 1 === MONTH
  })

  const total = rows.length
  const byStatus = Object.fromEntries(STATUS_KEYS.map(s => [s, rows.filter(r => r.status === s).length]))
  const byOrg    = Object.fromEntries(ORG_OPTS.map(o  => [o, rows.filter(r => r.org === o).length]))
  const completeRate = total > 0 ? Math.round(byStatus['已完成'] / total * 100) : 0

  const orgLines = Object.entries(byOrg)
    .map(([o, n]) => `  - ${o}：${n} 项`).join('\n')
  const rowLines = rows.slice(0, 30)
    .map(r => `  - [${r.status || '—'}] ${(r.task || '—').slice(0, 40)}（${r.owner || '—'}，${(r.planDate || '—').slice(0, 10)}）`)
    .join('\n')

  const prompt = `你是一位专业的项目管理顾问，请根据以下 ${YEAR} 年 ${MONTH} 月项目进度数据，生成一份简洁、专业的项目月度汇报（150～250字）。

## 数据摘要
- 本月项目总数：${total}
- 已完成：${byStatus['已完成']}  进行中：${byStatus['进行中']}  逾期：${byStatus['逾期']}  未开始：${byStatus['未开始']}
- 完成率：${completeRate}%

## 按采购组织分布
${orgLines}

## 项目明细（部分）
${rowLines}

## 要求
1. 语言正式、简洁，适合向领导汇报
2. 指出本月亮点和潜在风险
3. 提出 1～2 条改进建议
4. 最后一行单独注明：（本报告由 AI 辅助生成）`

  let text
  let aiOk = false
  if (AI_BASE && AI_KEY) {
    try {
      console.log(`调用 AI：${AI_BASE}`)
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 30000)
      const res = await fetch(`${AI_BASE}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${AI_KEY}` },
        body: JSON.stringify({
          model: AI_MODEL,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          max_tokens: 600,
        }),
      })
      clearTimeout(timer)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error?.message ?? `AI 接口错误 ${res.status}`)
      }
      const data = await res.json()
      text = data.choices?.[0]?.message?.content?.trim() ?? '（AI 返回内容为空）'
      aiOk = true
      console.log('✅ AI 调用成功')
    } catch (e) {
      console.warn(`⚠️  AI 调用失败（${e.message}），降级为占位内容`)
    }
  }

  if (!aiOk) {
    const risk = byStatus['逾期'] > 0
      ? `本月存在 ${byStatus['逾期']} 个逾期项目，需重点关注并推动资源保障。`
      : '本月无逾期项目，整体执行情况良好。'
    text = `${YEAR} 年 ${MONTH} 月，采购运营组共推进项目 ${total} 项，其中已完成 ${byStatus['已完成']} 项、进行中 ${byStatus['进行中']} 项，整体完成率为 ${completeRate}%。${risk}\n\n亮点方面，各采购组织积极配合，重点任务整体推进有序。建议关注剩余在途项目的交付节点，强化跨组协作与风险预警机制，确保按期交付。\n\n（本报告由 AI 辅助生成，AI 服务本次不可达）`
  }

  const dir  = path.join(process.cwd(), 'ai-summaries')
  const file = path.join(dir, `${YEAR}-${MONTH}.json`)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(file, JSON.stringify({ year: YEAR, month: MONTH, text, generatedAt: new Date().toISOString() }, null, 2))
  console.log(`✅ 已写入 ${file}`)
}

main().catch(e => { console.error('❌', e.message); process.exit(1) })
