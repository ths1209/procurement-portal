/**
 * AI 月报总结模块（OpenAI 兼容接口）
 *
 * 环境变量（.env.local / GitHub Secrets）：
 *   VITE_AI_API_BASE  : API 地址，如 https://api.openai.com/v1（留空则使用占位模式）
 *   VITE_AI_API_KEY   : API Key
 *   VITE_AI_MODEL     : 模型名，默认 gpt-4o
 */

const AI_BASE  = (import.meta.env.VITE_AI_API_BASE ?? '').replace(/\/$/, '')
const AI_KEY   = import.meta.env.VITE_AI_API_KEY  ?? ''
const AI_MODEL = import.meta.env.VITE_AI_MODEL    ?? 'gpt-4o'

/**
 * 根据月报数据生成 AI 总结
 * @param {object} opts
 * @param {number} opts.year
 * @param {number} opts.month
 * @param {object} opts.stats   - { total, byStatus, byOrg, completeRate }
 * @param {Array}  opts.rows    - 项目列表
 * @returns {Promise<string>}   - 生成的文字
 */
export async function generateMonthlySummary({ year, month, stats, rows }) {
  const orgLines = Object.entries(stats.byOrg)
    .map(([o, n]) => `  - ${o}：${n} 项`)
    .join('\n')

  const rowLines = rows.slice(0, 30).map(r =>
    `  - [${r.status || '—'}] ${r.task?.slice(0, 40) || '—'}（负责人：${r.owner || '—'}，计划完成：${r.planDate?.slice(0, 10) || '—'}）`
  ).join('\n')

  const prompt = `你是一位专业的项目管理顾问，请根据以下 ${year} 年 ${month} 月项目进度数据，生成一份简洁、专业的项目月度汇报（150～250字）。

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

  if (!AI_BASE || !AI_KEY) {
    // 占位模式
    await new Promise(r => setTimeout(r, 600))
    return buildPlaceholder(year, month, stats)
  }

  const res = await fetch(`${AI_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${AI_KEY}`,
    },
    body: JSON.stringify({
      model: AI_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 600,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message ?? `AI 接口错误 ${res.status}`)
  }

  const data = await res.json()
  return data.choices?.[0]?.message?.content?.trim() ?? '（AI 返回内容为空）'
}

function buildPlaceholder(year, month, stats) {
  const risk = stats.byStatus['逾期'] > 0 ? `本月存在 ${stats.byStatus['逾期']} 个逾期项目，需重点关注并推动资源保障。` : '本月无逾期项目，整体执行情况良好。'
  return `${year} 年 ${month} 月，采购运营组共推进项目 ${stats.total} 项，其中已完成 ${stats.byStatus['已完成']} 项、进行中 ${stats.byStatus['进行中']} 项，整体完成率为 ${stats.completeRate}%。${risk}

亮点方面，各采购组织积极配合，重点任务整体推进有序。建议关注剩余在途项目的交付节点，强化跨组协作与风险预警机制，确保按期交付。

（本报告由 AI 辅助生成）`
}
