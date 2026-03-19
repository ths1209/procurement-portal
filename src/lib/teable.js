/**
 * Teable REST API 客户端
 *
 * 用户表所需字段（在 Teable 中手动创建）：
 * ┌─────────────┬──────────────┬────────────────────────────┐
 * │ 字段名       │ 类型         │ 备注                        │
 * ├─────────────┼──────────────┼────────────────────────────┤
 * │ email       │ 单行文本     │                             │
 * │ displayName │ 单行文本     │                             │
 * │ passwordHash│ 长文本       │ bcrypt 哈希，不是明文密码    │
 * │ role        │ 单选         │ 选项：admin / member        │
 * │ status      │ 单选         │ 选项：pending / active / disabled │
 * │ createdAt   │ 日期         │ 或用单行文本存 ISO 字符串   │
 * └─────────────┴──────────────┴────────────────────────────┘
 */

const API   = (import.meta.env.VITE_TEABLE_API_BASE ?? 'https://app.teable.io').replace(/\/$/, '')
const TOKEN = import.meta.env.VITE_TEABLE_TOKEN
const TID   = import.meta.env.VITE_TEABLE_USERS_TABLE_ID

async function request(path, init = {}) {
  const res = await fetch(`${API}/api${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.message ?? `Teable API 错误 ${res.status}`)
  }
  return res.json()
}

/** 将 Teable record 对象扁平化 */
function normalize(record) {
  return { uid: record.id, ...record.fields }
}

/** 获取所有用户（小团队全量加载后客户端过滤） */
export async function listUsers() {
  const data = await request(`/table/${TID}/record?take=500`)
  const records = (data.records ?? []).map(normalize)
  // 按创建时间倒序
  return records.sort((a, b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0
    return tb - ta
  })
}

/** 通过 email 查找单个用户 */
export async function findUserByEmail(email) {
  const users = await listUsers()
  return users.find(u => u.email?.toLowerCase() === email.toLowerCase()) ?? null
}

/** 通过 recordId 查找单个用户 */
export async function findUserById(uid) {
  const data = await request(`/table/${TID}/record/${uid}`)
  return normalize(data)
}

/** 创建用户记录 */
export async function createUser(fields) {
  const data = await request(`/table/${TID}/record`, {
    method: 'POST',
    body: JSON.stringify({ records: [{ fields }] }),
  })
  const r = data.records?.[0]
  return r ? normalize(r) : null
}

/** 更新用户记录（仅传需要修改的字段） */
export async function updateUser(recordId, fields) {
  await request(`/table/${TID}/record`, {
    method: 'PATCH',
    body: JSON.stringify({ records: [{ id: recordId, fields }] }),
  })
}
