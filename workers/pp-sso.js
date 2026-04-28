/**
 * 采购门户 SSO 中转 Worker（pp-sso）
 *
 * 职责：
 *   1. 持有 APP_ID / APP_KEY 两个 secret，不暴露到前端
 *   2. 缓存 ticket（KV，1h50min），避免频繁调用 get_ticket 被限频
 *   3. 收到前端扫码 code，代调 /qrcode/v1/verify 返回脱敏后的用户信息
 *
 * 环境变量（在 Cloudflare Worker 面板配置）：
 *   - APP_ID        secret   100tal 申请的 appid
 *   - APP_KEY       secret   100tal 申请的 appkey
 *   - ALLOW_ORIGINS plain    允许的前端源，逗号分隔
 *                            例："https://ths1209.github.io,http://localhost:5173"
 *
 * KV 绑定：
 *   - SSO_KV        缓存 ticket
 *
 * 路由：
 *   - GET /sso/qr-verify?code=XXX   扫码 code 换用户信息
 *   - GET /sso/verify?token=XXX     账密登录 token 换用户信息
 *   - GET /sso/health               健康检查
 */

const SSO_BASE = 'https://sso.100tal.com'
const TICKET_KEY = 'ticket:v1'
const TICKET_TTL = 6600  // 1h50min，官方 2h 留 10min 余量

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const origin = request.headers.get('Origin') ?? ''
    const corsHeaders = buildCors(origin, env)

    // 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders })
    }

    try {
      if (url.pathname === '/sso/health') {
        return json({ ok: true, time: new Date().toISOString() }, 200, corsHeaders)
      }

      if (url.pathname === '/sso/qr-verify' && request.method === 'GET') {
        const code = url.searchParams.get('code')
        if (!code) return json({ errcode: 400, errmsg: 'code 参数缺失' }, 400, corsHeaders)
        const result = await verifyWithTicket({
          api: `${SSO_BASE}/qrcode/v1/verify`,
          params: { code },
        }, env)
        return json(result, 200, corsHeaders)
      }

      if (url.pathname === '/sso/verify' && request.method === 'GET') {
        const token = url.searchParams.get('token')
        if (!token) return json({ errcode: 400, errmsg: 'token 参数缺失' }, 400, corsHeaders)
        const result = await verifyWithTicket({
          api: `${SSO_BASE}/api/v1/sso/verify`,
          params: { token },
        }, env)
        return json(result, 200, corsHeaders)
      }

      return json({ errcode: 404, errmsg: 'not found' }, 404, corsHeaders)
    } catch (err) {
      return json({ errcode: 500, errmsg: String(err?.message ?? err) }, 500, corsHeaders)
    }
  },
}

/**
 * 带 ticket 的通用校验：拼上 ticket 调用指定上游，ticket 失效自动清缓存重试一次
 * @param {{api: string, params: Record<string,string>}} cfg
 */
async function verifyWithTicket(cfg, env) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const ticket = await getTicket(env, attempt > 0)
    const qs = new URLSearchParams({ ticket, ...cfg.params }).toString()
    const resp = await fetch(`${cfg.api}?${qs}`, { method: 'GET' })
    const body = await resp.json().catch(() => ({}))

    if (isTicketExpired(body) && attempt === 0) {
      await env.SSO_KV.delete(TICKET_KEY)
      continue
    }
    return body
  }
  return { errcode: 500, errmsg: 'ticket 重试后仍失败' }
}

/** 兼容两种 secret 绑定：传统 per-Worker secret（string）和 Secrets Store（异步 .get()） */
async function readSecret(binding) {
  if (binding == null) return ''
  if (typeof binding === 'string') return binding
  if (typeof binding.get === 'function') return await binding.get()
  return String(binding)
}

/** 获取 ticket：命中缓存直返，未命中再调上游并写 KV */
async function getTicket(env, forceRefresh = false) {
  if (!forceRefresh) {
    const cached = await env.SSO_KV.get(TICKET_KEY)
    if (cached) return cached
  }
  const appid  = await readSecret(env.APP_ID)
  const appkey = await readSecret(env.APP_KEY)
  if (!appid || !appkey) {
    throw new Error('APP_ID 或 APP_KEY 未配置')
  }
  const url = `${SSO_BASE}/basic/get_ticket?appid=${encodeURIComponent(appid)}&appkey=${encodeURIComponent(appkey)}`
  const resp = await fetch(url, { method: 'GET' })
  const body = await resp.json().catch(() => ({}))
  if (body.errcode !== 0 || !body.ticket) {
    throw new Error(`get_ticket 失败: ${body.errmsg ?? 'unknown'}`)
  }
  await env.SSO_KV.put(TICKET_KEY, body.ticket, { expirationTtl: TICKET_TTL })
  return body.ticket
}

/** 判断是否 ticket 过期/无效（按常见约定判错码和 errmsg 关键字） */
function isTicketExpired(body) {
  if (!body || body.errcode === 0) return false
  const msg = String(body.errmsg ?? '').toLowerCase()
  return msg.includes('ticket') || msg.includes('expire') || msg.includes('invalid')
}

function buildCors(origin, env) {
  const allow = String(env.ALLOW_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean)
  const ok = allow.includes(origin)
  return {
    'Access-Control-Allow-Origin': ok ? origin : allow[0] ?? '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  }
}

function json(obj, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders },
  })
}
