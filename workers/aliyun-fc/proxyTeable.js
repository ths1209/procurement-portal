/**
 * Teable 代理路由 /t/{tableKey}/*
 *
 * 将原先前端直调的 /api/table/:tid/... 透明转发到 Teable,并在此层做:
 *   1) JWT 校验(复用 auth.requireUser)
 *   2) 表级读写角色检查(authTable)
 *   3) users 表字段白名单(防越权改 role/status/passwordHash)
 *   4) costLedger 行级过滤(仅管理员看全部,其他人按 email 匹配)
 *
 * 路由形态:
 *   GET    /t/:key/records[?take=...&filter=...&viewId=...]
 *   GET    /t/:key/records/:id
 *   POST   /t/:key/records           body = { records: [...] } 或 { fieldKeyType, record: {...} }
 *   PATCH  /t/:key/records/:id       body = { fieldKeyType, typecast, record: {fields} }
 *   PATCH  /t/:key/records           body = { records: [{id, fields}] } 批量
 *   DELETE /t/:key/records/:id
 *   GET    /t/:key/fields
 *   POST   /t/:key/fields
 *   PATCH  /t/:key/fields/:fid
 *   GET    /t/:key/views
 *   POST   /t/:key/records/:rid/attachment/:fid   multipart
 */

const teable = require('./teable')
const auth = require('./auth')

const F_PERM_MEMBERS = '成员权限列'

// ─── 授权矩阵 ───────────────────────────────────────────────────────────────
/**
 * 返回 { read, write, rowFilter, whitelistFields }
 *   read(user)            → boolean   是否允许读
 *   write(user)           → boolean   是否允许写(创建/更新/删除)
 *   rowFilter(user,record)→ boolean   可选,列表结果按行过滤
 *   whitelistFields(user) → Set|null  可选,非空则只允许写入这些字段;null 表不限
 */
function tableAcl(tableKey) {
  const ALL = () => true
  const ADMIN = (u) => u.role === 'admin'
  const OPS = (u) => u.role === 'admin' || u.dept === '采购运营组'

  switch (tableKey) {
    case 'users':
      return {
        read: ADMIN,
        write: ALL, // 但会被字段白名单收紧
        whitelistFields: (u, { targetId }) => {
          if (u.role === 'admin') {
            return new Set([
              'role', 'status', 'dept', 'group', 'okrGroup',
              'jobId', 'email', 'displayName', 'avatar',
            ])
          }
          // 非管理员只能改自己,且字段受限
          if (targetId && targetId !== u.uid) return new Set() // 非自己一律禁
          return new Set(['displayName', 'avatar'])
        },
      }

    case 'costLedger':
      return {
        read: ALL,
        write: OPS,
        rowFilter: (u, record) => {
          if (u.role === 'admin') return true
          const members = record?.fields?.[F_PERM_MEMBERS]
          if (!Array.isArray(members)) return false
          const email = (u.email || '').toLowerCase()
          return members.some(m => String(m?.email || '').toLowerCase() === email)
        },
      }

    case 'projects':
    case 'reviews':
      return { read: ALL, write: OPS }

    case 'tools':
      return {
        read: ALL,
        write: ALL,
        // 删除校验:仅 admin 或"上传人" = 当前用户(displayName / email)可删
        canDeleteRow: (u, record) => {
          if (u.role === 'admin') return true
          const up = record?.fields?.['上传人']
          if (!up) return false
          const me1 = (u.displayName || '').trim()
          const me2 = (u.email || '').trim().toLowerCase()
          const v = String(up).trim()
          return (me1 && v === me1) || (me2 && v.toLowerCase() === me2)
        },
      }

    case 'consulting':
    case 'analytics':
    case 'ai':
    case 'okr':
    case 'aiSummary':
      return { read: ALL, write: ALL }

    default:
      return { read: () => false, write: () => false }
  }
}

// ─── 字段白名单过滤(仅 users 表启用) ──────────────────────────────────────
function applyFieldWhitelist(acl, user, ctx, fields) {
  if (!acl.whitelistFields) return fields
  const allowed = acl.whitelistFields(user, ctx)
  const out = {}
  for (const [k, v] of Object.entries(fields || {})) {
    if (allowed.has(k)) out[k] = v
  }
  return out
}

// ─── 路由分发 ───────────────────────────────────────────────────────────────
async function handle(req, url, env) {
  // /t/:key/... 剩余 path
  const parts = url.pathname.split('/').filter(Boolean) // ['t', key, ...]
  const tableKey = parts[1]
  const rest = parts.slice(2) // 不含 t/:key

  if (!tableKey || !teable.TABLE_ENV_KEYS[tableKey]) {
    throw auth.httpError(404, `未知表: ${tableKey}`)
  }

  const { user } = await auth.requireUser(req, env)
  const acl = tableAcl(tableKey)

  const sub = rest[0]
  const id  = rest[1]

  // ── records ──────────────────────────────────────────────────────────────
  if (sub === 'records') {
    // POST /t/:key/records/:rid/attachment/:fid → 附件上传
    if (rest[2] === 'attachment' && rest[3] && req.method === 'POST') {
      if (!acl.write(user)) throw auth.httpError(403, '无权限写入')
      return handleAttachment(req, tableKey, rest[1], rest[3], env)
    }

    if (req.method === 'GET' && !id) {
      if (!acl.read(user)) throw auth.httpError(403, '无权限读取')
      const query = Object.fromEntries(url.searchParams.entries())
      const data = await teable.getRecords(tableKey, query, env)
      if (acl.rowFilter && Array.isArray(data?.records)) {
        data.records = data.records.filter(r => acl.rowFilter(user, r))
      }
      return json(200, data)
    }

    if (req.method === 'GET' && id) {
      if (!acl.read(user)) throw auth.httpError(403, '无权限读取')
      const query = Object.fromEntries(url.searchParams.entries())
      const data = await teable.getRecord(tableKey, id, env, query)
      if (acl.rowFilter && !acl.rowFilter(user, data)) throw auth.httpError(403, '无权限读取该记录')
      return json(200, data)
    }

    if (req.method === 'POST' && !id) {
      if (!acl.write(user)) throw auth.httpError(403, '无权限创建')
      const body = await readJson(req)
      // 兼容两种形态:{records:[{fields}]} / {record:{fields}}
      if (Array.isArray(body?.records)) {
        body.records = body.records.map(r => ({
          ...r,
          fields: applyFieldWhitelist(acl, user, { targetId: null }, r.fields),
        }))
      } else if (body?.record?.fields) {
        body.record.fields = applyFieldWhitelist(acl, user, { targetId: null }, body.record.fields)
      }
      const data = await teable.createRecord(tableKey, body, env)
      return json(200, data)
    }

    if (req.method === 'PATCH' && id) {
      if (!acl.write(user)) throw auth.httpError(403, '无权限更新')
      const body = await readJson(req)
      if (body?.record?.fields) {
        body.record.fields = applyFieldWhitelist(acl, user, { targetId: id }, body.record.fields)
      } else if (body?.fields) {
        body.fields = applyFieldWhitelist(acl, user, { targetId: id }, body.fields)
      }
      const data = await teable.patchRecord(tableKey, id, body, env)
      if (tableKey === 'users') teable.invalidateUserCache(id)
      return json(200, data)
    }

    if (req.method === 'PATCH' && !id) {
      if (!acl.write(user)) throw auth.httpError(403, '无权限更新')
      const body = await readJson(req)
      if (Array.isArray(body?.records)) {
        body.records = body.records.map(r => ({
          ...r,
          fields: applyFieldWhitelist(acl, user, { targetId: r.id }, r.fields),
        }))
        if (tableKey === 'users') body.records.forEach(r => teable.invalidateUserCache(r.id))
      }
      const data = await teable.patchRecord(tableKey, null, body, env)
      return json(200, data)
    }

    if (req.method === 'DELETE' && id) {
      if (!acl.write(user)) throw auth.httpError(403, '无权限删除')
      if (acl.canDeleteRow) {
        const record = await teable.getRecord(tableKey, id, env)
        if (!acl.canDeleteRow(user, record)) throw auth.httpError(403, '只能删除自己上传的记录')
      }
      const data = await teable.deleteRecord(tableKey, id, env)
      if (tableKey === 'users') teable.invalidateUserCache(id)
      return json(200, data ?? { ok: true })
    }
  }

  // ── fields ───────────────────────────────────────────────────────────────
  if (sub === 'fields') {
    if (req.method === 'GET') {
      if (!acl.read(user)) throw auth.httpError(403, '无权限读取')
      return json(200, await teable.listFields(tableKey, env))
    }
    if (req.method === 'POST') {
      if (user.role !== 'admin') throw auth.httpError(403, '仅管理员可建字段')
      const body = await readJson(req)
      return json(200, await teable.createField(tableKey, body, env))
    }
    if (req.method === 'PATCH' && id) {
      if (user.role !== 'admin') throw auth.httpError(403, '仅管理员可改字段')
      const body = await readJson(req)
      return json(200, await teable.patchField(tableKey, id, body, env))
    }
  }

  // ── views ────────────────────────────────────────────────────────────────
  if (sub === 'views' && req.method === 'GET') {
    if (!acl.read(user)) throw auth.httpError(403, '无权限读取')
    return json(200, await teable.listViews(tableKey, env))
  }

  throw auth.httpError(405, `方法未支持: ${req.method} ${url.pathname}`)
}

async function handleAttachment(req, tableKey, recordId, fieldId, env) {
  // 收集原始 body,把 multipart 透传到 Teable
  const buf = await readRaw(req)
  const contentType = req.headers['content-type'] || req.headers['Content-Type']
  if (!contentType) throw auth.httpError(400, '缺少 Content-Type')
  if (!env.TEABLE_TOKEN) throw auth.httpError(500, 'TEABLE_TOKEN 未配置')
  const tid = teable.resolveTid(tableKey, env)
  const base = (env.TEABLE_API_BASE || 'https://app.teable.io').replace(/\/$/, '')
  const res = await fetch(
    `${base}/api/table/${tid}/record/${recordId}/${fieldId}/uploadAttachment`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.TEABLE_TOKEN}`,
        'Content-Type': contentType,
      },
      body: buf,
    }
  )
  const text = await res.text()
  const body = text ? (() => { try { return JSON.parse(text) } catch { return { raw: text } } })() : null
  if (!res.ok) {
    const err = auth.httpError(res.status, body?.message ?? `上传失败 ${res.status}`)
    throw err
  }
  return json(200, body)
}

// ─── 工具 ───────────────────────────────────────────────────────────────────
function json(status, body) {
  return { status, body }
}

async function readJson(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body
  const buf = await readRaw(req)
  if (!buf || !buf.length) return {}
  try { return JSON.parse(buf.toString('utf8')) } catch { throw auth.httpError(400, '请求体不是合法 JSON') }
}

function readRaw(req) {
  if (Buffer.isBuffer(req.rawBody)) return Promise.resolve(req.rawBody)
  if (typeof req.rawBody === 'string') return Promise.resolve(Buffer.from(req.rawBody))
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', c => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

module.exports = { handle }
