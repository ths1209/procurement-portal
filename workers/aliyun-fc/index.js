/**
 * 采购门户 SSO 中转服务（阿里云函数计算 FC · Custom Runtime · Web 模式）
 *
 * 替代原 Cloudflare Worker（workers/pp-sso.js），因 *.workers.dev 在国内被墙。
 *
 * 职责：
 *   1. 持有 APP_ID / APP_KEY，不暴露到前端
 *   2. 内存缓存 ticket（进程级），实例复用时避免频繁调用 get_ticket
 *   3. 代调 /qrcode/v1/verify 和 /api/v1/sso/verify
 *
 * 环境变量（在 FC 函数配置里设置）：
 *   - APP_ID         100tal 申请的 appid
 *   - APP_KEY        100tal 申请的 appkey
 *   - ALLOW_ORIGINS  允许的前端源，逗号分隔
 *                    例："https://ths1209.github.io,http://localhost:5173"
 *   - PORT           监听端口（FC 默认 9000，无需手动设）
 *
 * 路由：
 *   - GET /sso/health               健康检查
 *   - GET /sso/qr-verify?code=XXX   扫码 code 换用户信息
 *   - GET /sso/verify?token=XXX     账密登录 token 换用户信息
 *
 * 注意：
 *   FC 实例冷启动时 ticket 缓存为空，会触发一次 get_ticket；
 *   之后在同一实例内的请求复用内存缓存。ticket 失效会自动清缓存重试一次。
 *   Node 18+ 自带 fetch / URLSearchParams，无需任何依赖。
 */

const http = require('http')

const PORT = Number(process.env.PORT ?? 9000)
const SSO_BASE = 'https://sso.100tal.com'            // verify / ticket / qrcode
const API_BASE = 'https://api.service.100tal.com'    // /cmpts/... 用户详情等
const TICKET_TTL_MS = 6600 * 1000

let ticketCache = { value: '', expiresAt: 0 }

async function getTicket(forceRefresh = false) {
  if (!forceRefresh && ticketCache.value && Date.now() < ticketCache.expiresAt) {
    return ticketCache.value
  }
  const appid = process.env.APP_ID
  const appkey = process.env.APP_KEY
  if (!appid || !appkey) throw new Error('APP_ID 或 APP_KEY 未配置')

  const url = `${SSO_BASE}/basic/get_ticket?appid=${encodeURIComponent(appid)}&appkey=${encodeURIComponent(appkey)}`
  const resp = await fetch(url)
  const body = await resp.json().catch(() => ({}))
  if (body.errcode !== 0 || !body.ticket) {
    throw new Error(`get_ticket 失败: ${body.errmsg ?? 'unknown'}`)
  }
  ticketCache = { value: body.ticket, expiresAt: Date.now() + TICKET_TTL_MS }
  return body.ticket
}

function isTicketExpired(body) {
  if (!body || body.errcode === 0) return false
  const msg = String(body.errmsg ?? '').toLowerCase()
  return msg.includes('ticket') || msg.includes('expire') || msg.includes('invalid')
}

async function verifyWithTicket(api, params) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const ticket = await getTicket(attempt > 0)
    const qs = new URLSearchParams({ ticket, ...params }).toString()
    const resp = await fetch(`${api}?${qs}`)
    const body = await resp.json().catch(() => ({}))
    if (isTicketExpired(body) && attempt === 0) {
      ticketCache = { value: '', expiresAt: 0 }
      continue
    }
    return body
  }
  return { errcode: 500, errmsg: 'ticket 重试后仍失败' }
}

// /api/v1/sso/verify 只返回 6 个基础字段（不含头像），
// 再调 /cmpts/data/account/v2/users 拉完整资料（avatar / dept_info 等）合并回去
async function enrichWithAccountDetail(result) {
  if (result?.errcode !== 0 || !result.data?.account_id) {
    result._debug = { stage: 'skip-precondition', errcode: result?.errcode, hasAccountId: !!result?.data?.account_id }
    return
  }
  try {
    // 单条接口：/cmpts/data/account/v2/user/get?ticket=X&user_type=account_id&user_id=Y
    const detail = await verifyWithTicket(
      `${API_BASE}/cmpts/data/account/v2/user/get`,
      { user_type: 'account_id', user_id: result.data.account_id }
    )
    // 把原始响应直接挂到结果上供前端调试
    result._debug = { stage: 'ok', detail }
    const info = detail?.data
    if (!info) return
    if (info.avatar)    result.data.avatar    = info.avatar
    if (info.dept_info) result.data.dept_info = info.dept_info
  } catch (e) {
    result._debug = { stage: 'error', message: e.message }
  }
}

function buildCors(origin) {
  const allow = String(process.env.ALLOW_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean)
  const ok = allow.includes(origin)
  return {
    'Access-Control-Allow-Origin':  ok ? origin : (allow[0] ?? '*'),
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age':       '86400',
    'Vary':                         'Origin',
  }
}

function sendJson(res, obj, status, cors) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    ...cors,
  })
  res.end(JSON.stringify(obj))
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin ?? ''
  const cors   = buildCors(origin)

  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors)
    res.end()
    return
  }

  const reqUrl = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`)

  try {
    if (reqUrl.pathname === '/sso/health') {
      return sendJson(res, { ok: true, time: new Date().toISOString() }, 200, cors)
    }

    if (reqUrl.pathname === '/sso/qr-verify' && req.method === 'GET') {
      const code = reqUrl.searchParams.get('code')
      if (!code) return sendJson(res, { errcode: 400, errmsg: 'code 参数缺失' }, 400, cors)
      const result = await verifyWithTicket(`${SSO_BASE}/qrcode/v1/verify`, { code })
      return sendJson(res, result, 200, cors)
    }

    if (reqUrl.pathname === '/sso/verify' && req.method === 'GET') {
      const token = reqUrl.searchParams.get('token')
      if (!token) return sendJson(res, { errcode: 400, errmsg: 'token 参数缺失' }, 400, cors)
      const result = await verifyWithTicket(`${SSO_BASE}/api/v1/sso/verify`, { token })
      await enrichWithAccountDetail(result)
      return sendJson(res, result, 200, cors)
    }

    return sendJson(res, { errcode: 404, errmsg: 'not found' }, 404, cors)
  } catch (err) {
    return sendJson(res, { errcode: 500, errmsg: String(err?.message ?? err) }, 500, cors)
  }
})

server.listen(PORT, () => {
  console.log(`[pp-sso] listening on :${PORT}`)
})
