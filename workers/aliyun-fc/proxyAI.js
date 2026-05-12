/**
 * AI 代理 /ai/*
 *
 * 路由:
 *   POST /ai/chat     body = { messages, maxTokens?, temperature?, model? }
 *                     → 先调内部 AI(ai-service.tal.com),失败降级 OpenRouter
 *   POST /ai/summary  body = { year, month, stats, rows }
 *                     → 先查 Teable aiSummary 表 key=`${year}-${month}`,未命中调 AI 后写缓存
 */

const auth = require('./auth')
const teable = require('./teable')

async function callInternalAI({ messages, maxTokens = 700, temperature = 0.7, model }, env) {
  if (!env.AI_API_BASE || !env.AI_API_KEY) throw new Error('内部 AI 未配置')
  const res = await fetch(`${env.AI_API_BASE.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.AI_API_KEY}`,
    },
    body: JSON.stringify({
      model: model || env.AI_MODEL || 'claude-sonnet-4.6',
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  })
  const text = await res.text()
  const body = text ? (() => { try { return JSON.parse(text) } catch { return {} } })() : {}
  if (!res.ok) {
    const msg = body?.error?.message || `AI 接口错误 ${res.status}`
    const err = new Error(msg); err.status = res.status
    throw err
  }
  return body.choices?.[0]?.message?.content?.trim() ?? ''
}

const OR_BASE = 'https://openrouter.ai/api/v1'
const OR_FALLBACK_MODELS = [
  'z-ai/glm-4.5-air:free',
  'minimax/minimax-m2.5:free',
  'stepfun/step-3.5-flash:free',
  'meta-llama/llama-3.2-3b-instruct:free',
]

async function callOpenRouter({ messages, maxTokens = 700, temperature = 0.7 }, env) {
  if (!env.OPENROUTER_KEY) throw new Error('OpenRouter 未配置')
  const models = [env.OPENROUTER_MODEL, ...OR_FALLBACK_MODELS].filter(Boolean)
  let lastErr = ''
  for (const model of models) {
    try {
      const res = await fetch(`${OR_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.OPENROUTER_KEY}`,
        },
        body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens }),
      })
      if (res.status === 429 || res.status === 403) { lastErr = `${model} 限速`; continue }
      if (!res.ok) { lastErr = `${model} 错误 ${res.status}`; continue }
      const data = await res.json()
      const text = data.choices?.[0]?.message?.content?.trim()
      if (text) return text
    } catch (e) { lastErr = e.message }
  }
  throw new Error(`OpenRouter 全部模型不可用: ${lastErr}`)
}

async function handleChat(req, env) {
  await auth.requireUser(req, env)
  const body = await readJson(req)
  const messages = body?.messages
  if (!Array.isArray(messages) || messages.length === 0) {
    throw auth.httpError(400, 'messages 必须为非空数组')
  }
  const opts = {
    messages,
    maxTokens: Number(body.maxTokens) || 700,
    temperature: typeof body.temperature === 'number' ? body.temperature : 0.7,
    model: body.model,
  }
  try {
    const text = await callInternalAI(opts, env)
    if (text) return { status: 200, body: { text, provider: 'internal' } }
    throw new Error('内部 AI 返回空')
  } catch (e) {
    try {
      const text = await callOpenRouter(opts, env)
      return { status: 200, body: { text, provider: 'openrouter' } }
    } catch (e2) {
      throw auth.httpError(502, `AI 全部上游失败: ${e.message} / ${e2.message}`)
    }
  }
}

// ─── /ai/summary ────────────────────────────────────────────────────────────
// Teable aiSummary 表字段(需在 Teable 端手动建):
//   key (singleLineText, unique 由业务保证), content (longText),
//   model (singleLineText), createdAt (date 或 ISO 文本)

async function findSummaryByKey(key, env) {
  try {
    const data = await teable.getRecords('aiSummary', {
      filter: JSON.stringify({
        conjunction: 'and',
        filterSet: [{ fieldId: 'key', operator: 'is', value: key }],
      }),
      fieldKeyType: 'name',
      take: 1,
    }, env)
    const r = data?.records?.[0]
    if (!r) return null
    return {
      key: r.fields?.key,
      content: r.fields?.content || '',
      model: r.fields?.model || '',
      createdAt: r.fields?.createdAt || '',
    }
  } catch (e) {
    // 老 Teable 可能不支持 filter 语法,降级全量扫
    try {
      const data = await teable.getRecords('aiSummary', { take: 200 }, env)
      const r = (data?.records ?? []).find(x => x.fields?.key === key)
      if (!r) return null
      return {
        key: r.fields?.key,
        content: r.fields?.content || '',
        model: r.fields?.model || '',
        createdAt: r.fields?.createdAt || '',
      }
    } catch { return null }
  }
}

async function saveSummary(key, content, model, env) {
  try {
    await teable.createRecord('aiSummary', {
      fieldKeyType: 'name',
      records: [{ fields: { key, content, model, createdAt: new Date().toISOString() } }],
    }, env)
  } catch (e) {
    console.warn('[aiSummary] 写缓存失败:', e.message)
  }
}

function buildSummaryPrompt(year, month, stats, rows) {
  const orgLines = Object.entries(stats?.byOrg || {}).map(([o, n]) => `  - ${o}: ${n} 项`).join('\n')
  const rowLines = (rows || []).slice(0, 30).map(r =>
    `  - [${r.status || '—'}] ${(r.task || '—').slice(0, 40)}(${r.owner || '—'}, ${(r.planDate || '').slice(0, 10) || '—'})`
  ).join('\n')
  return `你是一位专业的项目管理顾问,请根据以下 ${year} 年 ${month} 月项目进度数据,生成一份简洁、专业的项目月度汇报(150~250字)。

## 数据摘要
- 本月项目总数: ${stats?.total ?? 0}
- 已完成: ${stats?.byStatus?.['已完成'] ?? 0}  进行中: ${stats?.byStatus?.['进行中'] ?? 0}  逾期: ${stats?.byStatus?.['逾期'] ?? 0}  未开始: ${stats?.byStatus?.['未开始'] ?? 0}
- 完成率: ${stats?.completeRate ?? 0}%

## 按采购组织分布
${orgLines}

## 项目明细(部分)
${rowLines}

## 要求
1. 语言正式、简洁,适合向领导汇报
2. 指出本月亮点和潜在风险
3. 提出 1~2 条改进建议
4. 最后一行单独注明:(本报告由 AI 辅助生成)`
}

async function handleSummary(req, env) {
  await auth.requireUser(req, env)
  const body = await readJson(req)
  const year = Number(body?.year)
  const month = Number(body?.month)
  if (!year || !month) throw auth.httpError(400, 'year / month 必传')

  const key = `${year}-${month}`

  // 缓存命中(force=true 时跳过)
  if (!body?.force) {
    const cached = await findSummaryByKey(key, env)
    if (cached && cached.content) {
      return { status: 200, body: { text: cached.content, cached: true, model: cached.model } }
    }
  }

  const prompt = buildSummaryPrompt(year, month, body.stats, body.rows)
  const messages = [{ role: 'user', content: prompt }]
  const opts = { messages, maxTokens: 600, temperature: 0.7 }

  let text = ''
  let model = env.AI_MODEL || 'claude-sonnet-4.6'
  try {
    text = await callInternalAI(opts, env)
  } catch (e) {
    try {
      text = await callOpenRouter(opts, env)
      model = env.OPENROUTER_MODEL || OR_FALLBACK_MODELS[0]
    } catch (e2) {
      throw auth.httpError(502, `AI 全部上游失败: ${e.message} / ${e2.message}`)
    }
  }

  if (text) await saveSummary(key, text, model, env)
  return { status: 200, body: { text, cached: false, model } }
}

async function handle(req, url, env) {
  if (url.pathname === '/ai/chat' && req.method === 'POST') return handleChat(req, env)
  if (url.pathname === '/ai/summary' && req.method === 'POST') return handleSummary(req, env)
  throw auth.httpError(404, 'ai 路由未匹配')
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', c => chunks.push(c))
    req.on('end', () => {
      const s = Buffer.concat(chunks).toString('utf8')
      if (!s) return resolve({})
      try { resolve(JSON.parse(s)) } catch (e) { reject(auth.httpError(400, '请求体不是合法 JSON')) }
    })
    req.on('error', reject)
  })
}

module.exports = { handle }
