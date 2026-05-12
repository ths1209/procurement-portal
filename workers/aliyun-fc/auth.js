/**
 * 认证与 JWT 模块
 *
 * 职责:
 *   1. HS256 JWT 签发 / 验证 (手写,不引 jsonwebtoken 依赖)
 *   2. /auth/* 路由 handler:login / register / sso-finalize / me / change-password / logout
 *   3. requireUser() 中间件:供其他代理模块复用
 *
 * JWT payload: { uid, ssoAccountId, role, status, iat, exp }
 * 签名密钥: env.JWT_SECRET (必需,32 字节以上随机字符串)
 */

const crypto = require('crypto')
const bcrypt = require('bcryptjs')
const teable = require('./teable')
const { SSO_BASE, verifyWithTicket, enrichWithAccountDetail } = require('./sso')

const TOKEN_TTL_SEC = 12 * 3600 // 12h

// ─── JWT ─────────────────────────────────────────────────────────────────────

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
}
function b64urlDecode(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/')
  while (s.length % 4) s += '='
  return Buffer.from(s, 'base64')
}
function hmac(secret, data) {
  return crypto.createHmac('sha256', secret).update(data).digest()
}

function signJwt(payload, secret, ttlSec = TOKEN_TTL_SEC) {
  const header = { alg: 'HS256', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const fullPayload = { ...payload, iat: now, exp: now + ttlSec }
  const head = b64url(JSON.stringify(header))
  const body = b64url(JSON.stringify(fullPayload))
  const sig  = b64url(hmac(secret, `${head}.${body}`))
  return `${head}.${body}.${sig}`
}

function verifyJwt(token, secret) {
  if (!token || typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [head, body, sig] = parts
  const expect = b64url(hmac(secret, `${head}.${body}`))
  // 时序恒定比较
  if (expect.length !== sig.length) return null
  if (!crypto.timingSafeEqual(Buffer.from(expect), Buffer.from(sig))) return null
  let payload
  try { payload = JSON.parse(b64urlDecode(body).toString('utf8')) } catch { return null }
  const now = Math.floor(Date.now() / 1000)
  if (payload.exp && payload.exp < now) return null
  return payload
}

// ─── User session helpers ───────────────────────────────────────────────────

function sanitizeProfile(raw) {
  return {
    uid:          raw.uid,
    email:        raw.email,
    displayName:  raw.displayName,
    role:         raw.role,
    status:       raw.status,
    dept:         raw.dept,
    group:        raw.group,
    okrGroup:     raw.okrGroup,
    jobId:        raw.jobId,
    ssoAccountId: raw.ssoAccountId,
    ssoWorkcode:  raw.ssoWorkcode,
    avatar:       raw.avatar,
    createdAt:    raw.createdAt,
  }
}

function tokenFromUser(u, env) {
  return signJwt({
    uid:          u.uid,
    ssoAccountId: u.ssoAccountId || '',
    role:         u.role,
    status:       u.status,
  }, env.JWT_SECRET)
}

/**
 * 从 Authorization header 解析 JWT,返回 { payload, token } 或抛 401。
 * 注意不做 Teable 二次校验,如果需要最新 role/status,调 loadCurrentUser()。
 */
function requireJwt(req, env) {
  if (!env.JWT_SECRET) throw httpError(500, 'JWT_SECRET 未配置')
  const h = req.headers.authorization || req.headers.Authorization || ''
  const m = /^Bearer\s+(.+)$/i.exec(h)
  if (!m) throw httpError(401, '未登录')
  const payload = verifyJwt(m[1].trim(), env.JWT_SECRET)
  if (!payload) throw httpError(401, 'token 无效或已过期')
  return { payload, token: m[1].trim() }
}

/**
 * 结合 Teable 最新 users 记录,返回完整 profile。
 * 30s 缓存见 teable.getUserByIdCached。若状态变为 disabled 抛 401。
 */
async function loadCurrentUser(payload, env) {
  if (!payload?.uid) throw httpError(401, 'token 缺少 uid')
  const u = await teable.getUserByIdCached(payload.uid, env)
  if (!u) throw httpError(401, '用户不存在')
  if (u.status === 'disabled') throw httpError(401, '账号已被停用')
  return u
}

/** 供其他模块调用的统一入口:校验 JWT + 拉最新 profile */
async function requireUser(req, env) {
  const { payload, token } = requireJwt(req, env)
  const user = await loadCurrentUser(payload, env)
  return { user, payload, token }
}

function httpError(status, message) {
  const e = new Error(message)
  e.status = status
  return e
}

// ─── 路由 handler ────────────────────────────────────────────────────────────

async function handleLogin(body, env) {
  const email    = String(body?.email || '').trim().toLowerCase()
  const password = String(body?.password || '')
  if (!email || !password) throw httpError(400, '参数缺失')

  const user = await teable.findUserByEmail(email, env)
  if (!user) throw httpError(401, '账号或密码错误')
  const ok = await bcrypt.compare(password, user.passwordHash || '')
  if (!ok) throw httpError(401, '账号或密码错误')
  if (user.status === 'disabled') throw httpError(403, '账号已被停用')

  const token = tokenFromUser(user, env)
  return { token, profile: sanitizeProfile(user) }
}

async function handleRegister(body, env) {
  const email = String(body?.email || '').trim().toLowerCase()
  const password = String(body?.password || '')
  const displayName = String(body?.displayName || '').trim()
  if (!email || !password || !displayName) throw httpError(400, '参数缺失')
  if (password.length < 6) throw httpError(400, '密码至少 6 位')

  const existing = await teable.findUserByEmail(email, env)
  if (existing) throw httpError(409, '该邮箱已注册')

  const passwordHash = await bcrypt.hash(password, 10)
  const fields = {
    email,
    displayName,
    passwordHash,
    role:      'member',
    status:    'pending',
    createdAt: new Date().toISOString(),
  }
  if (body?.jobId) fields.jobId = String(body.jobId)
  if (body?.dept)  fields.dept  = String(body.dept)
  if (body?.group) fields.group = String(body.group)

  await teable.createUser(fields, env)
  return { ok: true }
}

async function handleSsoFinalize(body, env) {
  const code = body?.code ? String(body.code) : ''
  const token = body?.token ? String(body.token) : ''
  if (!code && !token) throw httpError(400, 'code 或 token 必须提供一个')

  let ssoResult
  if (code) {
    ssoResult = await verifyWithTicket(`${SSO_BASE}/qrcode/v1/verify`, { code }, env)
  } else {
    ssoResult = await verifyWithTicket(`${SSO_BASE}/api/v1/sso/verify`, { token }, env)
    await enrichWithAccountDetail(ssoResult, env)
  }
  if (ssoResult.errcode !== 0 || !ssoResult.data) {
    throw httpError(401, `SSO 校验失败: ${ssoResult.errmsg || '未知错误'}`)
  }
  const user = await teable.upsertSsoUser(ssoResult.data, env)
  if (!user) throw httpError(500, 'SSO upsert 失败')
  if (user.status === 'disabled') throw httpError(403, '账号已被停用')

  const tok = tokenFromUser(user, env)
  return { token: tok, profile: sanitizeProfile(user) }
}

async function handleMe(req, env) {
  const { user, payload } = await requireUser(req, env)
  // 续期:剩余不足 30 分钟则重新签发
  const now = Math.floor(Date.now() / 1000)
  const remain = (payload.exp || 0) - now
  const resp = { profile: sanitizeProfile(user) }
  if (remain < 30 * 60) resp.token = tokenFromUser(user, env)
  return resp
}

async function handleChangePassword(req, body, env) {
  const { user } = await requireUser(req, env)
  const cur = String(body?.currentPassword || '')
  const nxt = String(body?.newPassword || '')
  if (!cur || !nxt) throw httpError(400, '参数缺失')
  if (nxt.length < 6) throw httpError(400, '新密码至少 6 位')

  const ok = await bcrypt.compare(cur, user.passwordHash || '')
  if (!ok) throw httpError(401, '当前密码错误')

  const hash = await bcrypt.hash(nxt, 10)
  await teable.updateUserFields(user.uid, { passwordHash: hash }, env)
  teable.invalidateUserCache(user.uid)
  return { ok: true }
}

module.exports = {
  signJwt,
  verifyJwt,
  requireJwt,
  requireUser,
  tokenFromUser,
  sanitizeProfile,
  httpError,
  handleLogin,
  handleRegister,
  handleSsoFinalize,
  handleMe,
  handleChangePassword,
}
