/**
 * SSO 上游封装(从原 index.js 抽离)
 *
 * 职责:持有 APP_ID/APP_KEY 的 ticket,代调 100tal SSO 的 verify 接口,
 * 并附加拉取账号详情(avatar / dept_info)。
 */

const SSO_BASE = 'https://sso.100tal.com'
const API_BASE = 'https://api.service.100tal.com'
const TICKET_TTL_MS = 6600 * 1000

let ticketCache = { value: '', expiresAt: 0 }

async function getTicket(env, forceRefresh = false) {
  if (!forceRefresh && ticketCache.value && Date.now() < ticketCache.expiresAt) {
    return ticketCache.value
  }
  const appid = env.APP_ID
  const appkey = env.APP_KEY
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

async function verifyWithTicket(api, params, env) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const ticket = await getTicket(env, attempt > 0)
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

async function enrichWithAccountDetail(result, env) {
  if (result?.errcode !== 0 || !result.data?.account_id) return
  try {
    const detail = await verifyWithTicket(
      `${API_BASE}/cmpts/data/account/v2/user/get`,
      { user_type: 'account_id', user_id: result.data.account_id },
      env
    )
    const info = detail?.data
    if (!info) return
    if (info.avatar)    result.data.avatar    = info.avatar
    if (info.thumb)     result.data.thumb     = info.thumb
    if (info.dept_info) result.data.dept_info = info.dept_info
  } catch (_) {
    // 静默失败,avatar 是次要信息
  }
}

module.exports = { SSO_BASE, verifyWithTicket, enrichWithAccountDetail }
