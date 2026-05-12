/**
 * 数环通推送代理 /notify
 *
 * POST /notify  body = { jobId, title?, content }
 *   - JWT 校验
 *   - 转发到 env.SHUHUAN_WEBHOOK(带 URL 内鉴权 token)
 */

const auth = require('./auth')

async function handle(req, url, env) {
  if (url.pathname !== '/notify' || req.method !== 'POST') {
    throw auth.httpError(404, 'notify 路由未匹配')
  }
  await auth.requireUser(req, env)

  if (!env.SHUHUAN_WEBHOOK) throw auth.httpError(500, 'SHUHUAN_WEBHOOK 未配置')

  const body = await readJson(req)
  const jobId = String(body?.jobId || '').trim()
  const content = String(body?.content || '')
  const title = String(body?.title || '采购工作门户通知')
  if (!jobId) throw auth.httpError(400, 'jobId 必传')
  if (!content) throw auth.httpError(400, 'content 必传')

  const payload = { jobId, title, content }
  const res = await fetch(env.SHUHUAN_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const text = await res.text().catch(() => '')
  if (!res.ok) {
    throw auth.httpError(502, `数环通返回 ${res.status}: ${text.slice(0, 200)}`)
  }
  return { status: 200, body: { ok: true, upstream: text.slice(0, 500) } }
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', c => chunks.push(c))
    req.on('end', () => {
      const s = Buffer.concat(chunks).toString('utf8')
      if (!s) return resolve({})
      try { resolve(JSON.parse(s)) } catch { reject(auth.httpError(400, '请求体不是合法 JSON')) }
    })
    req.on('error', reject)
  })
}

module.exports = { handle }
