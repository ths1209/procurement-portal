/**
 * AI 月报总结 — 通过后端 /ai/summary 代理。
 * 后端带 Teable 缓存(同 year-month 命中则直接返回),未命中才调上游 AI。
 */

import { api, isApiConfigured } from './api'

/**
 * @param {{ year, month, stats, rows, force?, onProgress?: (msg:string)=>void }} opts
 * @returns {Promise<string>}
 */
export async function generateMonthlySummary({ year, month, stats, rows, force = false, onProgress = () => {} }) {
  if (!isApiConfigured()) {
    onProgress('API 未配置,生成占位汇报…')
    return buildPlaceholder(year, month, stats)
  }
  onProgress('AI 分析中…')
  try {
    const { text, cached } = await api.post('/ai/summary', { year, month, stats, rows, force })
    if (cached) onProgress('读取缓存结果')
    return text || buildPlaceholder(year, month, stats)
  } catch (e) {
    console.warn('[AI] /ai/summary 失败,降级占位汇报:', e.message)
    onProgress('AI 失败,返回占位汇报')
    return buildPlaceholder(year, month, stats)
  }
}

function buildPlaceholder(year, month, stats) {
  const overdue = stats?.byStatus?.['逾期'] ?? 0
  const risk = overdue > 0
    ? `本月存在 ${overdue} 个逾期项目,需重点关注并推动资源保障。`
    : '本月无逾期项目,整体执行情况良好。'
  return `${year} 年 ${month} 月,采购运营组共推进项目 ${stats?.total ?? 0} 项,其中已完成 ${stats?.byStatus?.['已完成'] ?? 0} 项、进行中 ${stats?.byStatus?.['进行中'] ?? 0} 项,整体完成率为 ${stats?.completeRate ?? 0}%。${risk}

亮点方面,各采购组织积极配合,重点任务整体推进有序。建议关注剩余在途项目的交付节点,强化跨组协作与风险预警机制,确保按期交付。

(本报告由 AI 辅助生成)`
}
