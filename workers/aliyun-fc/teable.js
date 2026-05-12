/**
 * Teable 上游封装
 *
 * 所有对 Teable REST 的调用在此集中,保留原前端字段名以便最小化业务逻辑迁移。
 * 同时提供 users 表专用 helper(findByEmail / upsertSsoUser / getUserByIdCached)
 * 和通用 record/field/view/attachment 方法,供 proxyTeable.js 调用。
 */

// ─── 表名 → env.TEABLE_*_TABLE_ID 映射 ──────────────────────────────────────
const TABLE_ENV_KEYS = {
  users:       'TEABLE_USERS_TABLE_ID',
  projects:    'TEABLE_PROJECTS_TABLE_ID',
  tools:       'TEABLE_TOOLS_TABLE_ID',
  consulting:  'TEABLE_CONSULTING_TABLE_ID',
  analytics:   'TEABLE_ANALYTICS_TABLE_ID',
  ai:          'TEABLE_AI_TABLE_ID',
  okr:         'TEABLE_OKR_TABLE_ID',
  costLedger:  'TEABLE_COST_LEDGER_TABLE_ID',
  reviews:     'TEABLE_REVIEWS_TABLE_ID',
  aiSummary:   'TEABLE_AI_SUMMARY_TABLE_ID',
}

function resolveTid(tableKey, env) {
  const envKey = TABLE_ENV_KEYS[tableKey]
  if (!envKey) throw new Error(`未知表: ${tableKey}`)
  const tid = env[envKey]
  if (!tid) throw new Error(`${envKey} 未配置`)
  return tid
}

function apiBase(env) {
  const base = env.TEABLE_API_BASE || 'https://app.teable.io'
  return base.replace(/\/$/, '')
}

// ─── 通用请求 ───────────────────────────────────────────────────────────────
async function request(path, init = {}, env) {
  if (!env.TEABLE_TOKEN) throw new Error('TEABLE_TOKEN 未配置')
  const res = await fetch(`${apiBase(env)}/api${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.TEABLE_TOKEN}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  if (res.status === 204) return null
  const text = await res.text()
  const body = text ? (() => { try { return JSON.parse(text) } catch { return { raw: text } } })() : null
  if (!res.ok) {
    const msg = body?.message ?? `Teable API 错误 ${res.status}`
    const err = new Error(msg)
    err.status = res.status
    err.upstream = body
    throw err
  }
  return body
}

// ─── users 表归一化 ─────────────────────────────────────────────────────────
function normalizeUser(record) {
  const f = record.fields ?? {}
  return {
    uid:          record.id,
    email:        f.email        ?? '',
    displayName:  f.displayName  ?? '',
    passwordHash: f.passwordHash ?? '',
    role:         f.role         ?? 'member',
    dept:         f.dept         ?? '',
    group:        f.group        ?? '',
    okrGroup:     f.okrGroup     ?? '',
    jobId:        f.jobId        ?? '',
    ssoAccountId: f.ssoAccountId ?? '',
    ssoWorkcode:  f.ssoWorkcode  ?? '',
    avatar:       f.avatar       ?? '',
    status:       f.status       ?? 'pending',
    createdAt:    f.createdAt    ?? '',
  }
}

// ─── users 表操作 ───────────────────────────────────────────────────────────
async function listUsers(env) {
  const tid = resolveTid('users', env)
  const data = await request(`/table/${tid}/record?take=500&fieldKeyType=name`, {}, env)
  return (data?.records ?? []).map(normalizeUser)
}

async function findUserByEmail(email, env) {
  if (!email) return null
  const users = await listUsers(env)
  const lower = email.toLowerCase()
  return users.find(u => (u.email || '').toLowerCase() === lower) ?? null
}

async function findUserBySsoId(ssoAccountId, env) {
  if (!ssoAccountId) return null
  const users = await listUsers(env)
  return users.find(u => u.ssoAccountId === ssoAccountId) ?? null
}

async function findUserById(uid, env) {
  const tid = resolveTid('users', env)
  const data = await request(`/table/${tid}/record/${uid}?fieldKeyType=name`, {}, env)
  return data ? normalizeUser(data) : null
}

async function createUser(fields, env) {
  const tid = resolveTid('users', env)
  const data = await request(`/table/${tid}/record?fieldKeyType=name`, {
    method: 'POST',
    body: JSON.stringify({ records: [{ fields }] }),
  }, env)
  const r = data?.records?.[0]
  return r ? normalizeUser(r) : null
}

async function updateUserFields(uid, patch, env) {
  const tid = resolveTid('users', env)
  await request(`/table/${tid}/record?fieldKeyType=name`, {
    method: 'PATCH',
    body: JSON.stringify({ records: [{ id: uid, fields: patch }] }),
  }, env)
  invalidateUserCache(uid)
}

async function upsertSsoUser(ssoUser, env) {
  const accountId = ssoUser.account_id
  if (!accountId) throw new Error('SSO 返回缺少 account_id')

  const avatar = ssoUser.thumb ?? ssoUser.avatar ?? ''

  // 1) 按 ssoAccountId 命中
  const byId = await findUserBySsoId(accountId, env)
  if (byId) {
    const patch = {}
    if (ssoUser.email    && ssoUser.email    !== byId.email)       patch.email       = ssoUser.email
    if (ssoUser.name     && ssoUser.name     !== byId.displayName) patch.displayName = ssoUser.name
    if (ssoUser.workcode && ssoUser.workcode !== byId.ssoWorkcode) patch.ssoWorkcode = ssoUser.workcode
    if (ssoUser.workcode && !byId.jobId)                            patch.jobId       = ssoUser.workcode
    if (avatar           && avatar           !== byId.avatar)      patch.avatar      = avatar
    if (Object.keys(patch).length > 0) {
      await updateUserFields(byId.uid, patch, env)
      return { ...byId, ...patch }
    }
    return byId
  }

  // 2) 按 email/workcode 绑定历史账号
  const users = await listUsers(env)
  const email = (ssoUser.email ?? '').toLowerCase()
  const workcode = String(ssoUser.workcode ?? '').trim()

  const matched =
    (email    && users.find(u => u.email?.toLowerCase() === email && !u.ssoAccountId)) ||
    (workcode && users.find(u => String(u.jobId ?? '').trim() === workcode && !u.ssoAccountId))

  if (matched) {
    const patch = { ssoAccountId: accountId }
    if (workcode && workcode !== matched.ssoWorkcode) patch.ssoWorkcode = workcode
    if (workcode && !matched.jobId)                   patch.jobId       = workcode
    if (ssoUser.email && !matched.email)              patch.email       = ssoUser.email
    if (ssoUser.name  && !matched.displayName)        patch.displayName = ssoUser.name
    if (avatar       && avatar        !== matched.avatar) patch.avatar  = avatar
    await updateUserFields(matched.uid, patch, env)
    return { ...matched, ...patch }
  }

  // 3) 新建
  return createUser({
    email:        ssoUser.email ?? '',
    displayName:  ssoUser.name ?? ssoUser.account ?? '',
    ssoAccountId: accountId,
    ssoWorkcode:  ssoUser.workcode ?? '',
    jobId:        ssoUser.workcode ?? '',
    avatar,
    role:         'member',
    status:       'pending',
    createdAt:    new Date().toISOString(),
  }, env)
}

// ─── users 进程内缓存(30s TTL) ──────────────────────────────────────────────
const USER_CACHE_TTL_MS = 30 * 1000
const userCache = new Map() // uid → { user, expiresAt }

async function getUserByIdCached(uid, env) {
  const hit = userCache.get(uid)
  if (hit && Date.now() < hit.expiresAt) return hit.user
  const user = await findUserById(uid, env)
  userCache.set(uid, { user, expiresAt: Date.now() + USER_CACHE_TTL_MS })
  return user
}

function invalidateUserCache(uid) {
  if (uid) userCache.delete(uid)
  else userCache.clear()
}

// ─── 通用 record 方法 ──────────────────────────────────────────────────────
async function getRecords(tableKey, query, env) {
  const tid = resolveTid(tableKey, env)
  const qs = buildQueryString({ fieldKeyType: 'name', take: 500, ...(query || {}) })
  return request(`/table/${tid}/record${qs}`, {}, env)
}

async function getRecord(tableKey, id, env, query) {
  const tid = resolveTid(tableKey, env)
  const qs = buildQueryString({ fieldKeyType: 'name', ...(query || {}) })
  return request(`/table/${tid}/record/${id}${qs}`, {}, env)
}

async function createRecord(tableKey, body, env) {
  const tid = resolveTid(tableKey, env)
  return request(`/table/${tid}/record?fieldKeyType=name`, {
    method: 'POST',
    body: JSON.stringify(body),
  }, env)
}

async function patchRecord(tableKey, id, body, env) {
  const tid = resolveTid(tableKey, env)
  // 两种调用形式:patch 单条 /record/:id 或 批量 /record
  if (id) {
    return request(`/table/${tid}/record/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }, env)
  }
  return request(`/table/${tid}/record`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  }, env)
}

async function deleteRecord(tableKey, id, env) {
  const tid = resolveTid(tableKey, env)
  return request(`/table/${tid}/record/${id}`, { method: 'DELETE' }, env)
}

// ─── field/view ────────────────────────────────────────────────────────────
async function listFields(tableKey, env) {
  const tid = resolveTid(tableKey, env)
  return request(`/table/${tid}/field`, {}, env)
}

async function listViews(tableKey, env) {
  const tid = resolveTid(tableKey, env)
  return request(`/table/${tid}/view`, {}, env)
}

async function createField(tableKey, body, env) {
  const tid = resolveTid(tableKey, env)
  return request(`/table/${tid}/field`, {
    method: 'POST',
    body: JSON.stringify(body),
  }, env)
}

async function patchField(tableKey, fieldId, body, env) {
  const tid = resolveTid(tableKey, env)
  return request(`/table/${tid}/field/${fieldId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  }, env)
}

// ─── 附件上传(multipart,透传 FormData) ────────────────────────────────────
async function uploadAttachment(tableKey, recordId, fieldId, formData, env) {
  if (!env.TEABLE_TOKEN) throw new Error('TEABLE_TOKEN 未配置')
  const tid = resolveTid(tableKey, env)
  const res = await fetch(
    `${apiBase(env)}/api/table/${tid}/record/${recordId}/${fieldId}/uploadAttachment`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.TEABLE_TOKEN}` },
      body: formData,
    }
  )
  const text = await res.text()
  const body = text ? (() => { try { return JSON.parse(text) } catch { return { raw: text } } })() : null
  if (!res.ok) {
    const err = new Error(body?.message ?? `上传失败 ${res.status}`)
    err.status = res.status
    throw err
  }
  return body
}

// ─── 工具 ───────────────────────────────────────────────────────────────────
function buildQueryString(obj) {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === '') continue
    if (Array.isArray(v)) v.forEach(x => params.append(k, String(x)))
    else if (typeof v === 'object') params.append(k, JSON.stringify(v))
    else params.append(k, String(v))
  }
  const s = params.toString()
  return s ? `?${s}` : ''
}

module.exports = {
  // 表映射
  TABLE_ENV_KEYS,
  resolveTid,
  // users
  listUsers,
  findUserByEmail,
  findUserBySsoId,
  findUserById,
  createUser,
  updateUserFields,
  upsertSsoUser,
  getUserByIdCached,
  invalidateUserCache,
  normalizeUser,
  // 通用
  getRecords,
  getRecord,
  createRecord,
  patchRecord,
  deleteRecord,
  listFields,
  listViews,
  createField,
  patchField,
  uploadAttachment,
  // 原始 request
  request,
}
