/**
 * 采购门户后端(阿里云 FC · Custom Runtime · Web 模式)
 *
 * 路由分发入口:
 *   /sso/*               保留:SSO 扫码/账密校验(公开)
 *   /auth/*              登录/注册/改密/当前用户/SSO 绑定(JWT 签发)
 *   /t/:key/*            Teable 代理(JWT 必需)
 *   /ai/*                AI 对话与月报摘要(JWT 必需)
 *   /notify              数环通推送(JWT 必需)
 *
 * 所有密钥通过 FC 环境变量注入;前端只拿 JWT,不再接触任何上游密钥。
 *
 * 依赖:bcryptjs(纯 JS);Node 18+ 自带 fetch / URLSearchParams / crypto。
 */

const http = require('http')

const auth = require('./auth')
const sso = require('./sso')
const proxyTeable = require('./proxyTeable')
const proxyAI = require('./proxyAI')
const proxyNotify = require('./proxyNotify')

const PORT = Number(process.env.PORT ?? 9000)

// ─── CORS ───────────────────────────────────────────────────────────────────
function buildCors(origin, env) {
  const allow = String(env.ALLOW_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean)
  const ok = origin && allow.includes(origin)
  return {
    'Access-Control-Allow-Origin':  ok ? origin : (allow[0] ?? '*'),
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', c => chunks.push(c))
    req.on('end', () => {
      const s = Buffer.concat(chunks).toString('utf8')
      if (!s) return resolve({})
      try { resolve(JSON.parse(s)) } catch { reject(Object.assign(new Error('请求体不是合法 JSON'), { status: 400 })) }
    })
    req.on('error', reject)
  })
}

// ─── 主服务 ─────────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const env = process.env
  const origin = req.headers.origin ?? ''
  const cors = buildCors(origin, env)

  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors)
    res.end()
    return
  }

  const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`)

  try {
    // ─── /sso/* (保留,原样) ───────────────────────────────────────────────
    if (url.pathname === '/sso/health') {
      return sendJson(res, { ok: true, time: new Date().toISOString() }, 200, cors)
    }
    if (url.pathname === '/sso/qr-verify' && req.method === 'GET') {
      const code = url.searchParams.get('code')
      if (!code) return sendJson(res, { errcode: 400, errmsg: 'code 参数缺失' }, 400, cors)
      const result = await sso.verifyWithTicket(`${sso.SSO_BASE}/qrcode/v1/verify`, { code }, env)
      return sendJson(res, result, 200, cors)
    }
    if (url.pathname === '/sso/verify' && req.method === 'GET') {
      const token = url.searchParams.get('token')
      if (!token) return sendJson(res, { errcode: 400, errmsg: 'token 参数缺失' }, 400, cors)
      const result = await sso.verifyWithTicket(`${sso.SSO_BASE}/api/v1/sso/verify`, { token }, env)
      await sso.enrichWithAccountDetail(result, env)
      return sendJson(res, result, 200, cors)
    }

    // ─── /auth/* ──────────────────────────────────────────────────────────
    if (url.pathname === '/auth/login' && req.method === 'POST') {
      const body = await readJsonBody(req)
      const out = await auth.handleLogin(body, env)
      return sendJson(res, out, 200, cors)
    }
    if (url.pathname === '/auth/register' && req.method === 'POST') {
      const body = await readJsonBody(req)
      const out = await auth.handleRegister(body, env)
      return sendJson(res, out, 200, cors)
    }
    if (url.pathname === '/auth/sso-finalize' && req.method === 'POST') {
      const body = await readJsonBody(req)
      const out = await auth.handleSsoFinalize(body, env)
      return sendJson(res, out, 200, cors)
    }
    if (url.pathname === '/auth/me' && req.method === 'GET') {
      req.headers.authorization = req.headers.authorization ?? req.headers.Authorization
      // 将 Node 小写 header 适配 auth.requireJwt
      const reqShim = { headers: req.headers }
      const out = await auth.handleMe(reqShim, env)
      return sendJson(res, out, 200, cors)
    }
    if (url.pathname === '/auth/change-password' && req.method === 'POST') {
      const body = await readJsonBody(req)
      const reqShim = { headers: req.headers }
      const out = await auth.handleChangePassword(reqShim, body, env)
      return sendJson(res, out, 200, cors)
    }
    if (url.pathname === '/auth/logout' && req.method === 'POST') {
      // JWT 无状态,服务端无需撤销;前端丢弃即可
      return sendJson(res, { ok: true }, 200, cors)
    }

    // ─── /t/* ─────────────────────────────────────────────────────────────
    if (url.pathname.startsWith('/t/')) {
      // proxyTeable 内部也调 auth.requireUser,它直接读 req.headers
      const out = await proxyTeable.handle(req, url, env)
      return sendJson(res, out.body, out.status, cors)
    }

    // ─── /ai/* ────────────────────────────────────────────────────────────
    if (url.pathname.startsWith('/ai/')) {
      const out = await proxyAI.handle(req, url, env)
      return sendJson(res, out.body, out.status, cors)
    }

    // ─── /notify ──────────────────────────────────────────────────────────
    if (url.pathname === '/notify') {
      const out = await proxyNotify.handle(req, url, env)
      return sendJson(res, out.body, out.status, cors)
    }

    return sendJson(res, { errcode: 404, errmsg: 'not found' }, 404, cors)
  } catch (err) {
    const status = err?.status && Number.isInteger(err.status) ? err.status : 500
    const msg = String(err?.message ?? err)
    if (status >= 500) console.error('[pp-api] error:', msg, err?.stack)
    return sendJson(res, { errcode: status, errmsg: msg }, status, cors)
  }
})

server.listen(PORT, () => {
  console.log(`[pp-api] listening on :${PORT}`)
})
