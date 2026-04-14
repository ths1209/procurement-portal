/**
 * Teable REST API 客户端
 *
 * 用户表所需字段（在 Teable 中手动创建）：
 * ┌─────────────┬──────────────┬────────────────────────────────────────────────────┐
 * │ 字段名       │ 类型         │ 备注                                               │
 * ├─────────────┼──────────────┼────────────────────────────────────────────────────┤
 * │ email       │ 单行文本     │                                                    │
 * │ displayName │ 单行文本     │                                                    │
 * │ passwordHash│ 长文本       │ bcrypt 哈希，不是明文密码                          │
 * │ role        │ 单选         │ 选项：admin / member                               │
 * │ dept        │ 单选         │ 选项：采购运营组 / 集团采购部                      │
 * │ group       │ 单选         │ 选项：运营分析组 / 采购稽核组 / 供应商管理组       │
 * │ jobId       │ 单行文本     │ 工号，用于权限匹配                                 │
 * │ status      │ 单选         │ 选项：pending / active / disabled                  │
 * │ createdAt   │ 日期         │ 或用单行文本存 ISO 字符串                          │
 * └─────────────┴──────────────┴────────────────────────────────────────────────────┘
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

/** 将 Teable record 对象扁平化，补全权限字段默认值 */
function normalize(record) {
  const f = record.fields ?? {}
  return {
    uid:          record.id,
    email:        f.email        ?? '',
    displayName:  f.displayName  ?? '',
    passwordHash: f.passwordHash ?? '',
    role:         f.role         ?? 'member',
    dept:         f.dept         ?? '',      // '采购运营组' | '集团采购部'
    group:        f.group        ?? '',      // '运营分析组' | '采购稽核组' | '供应商管理组'
    okrGroup:     f.okrGroup     ?? '',      // OKR 负责组：'采购一组'…'采购五组'，非空即为采购经理
    jobId:        f.jobId        ?? '',      // 工号
    status:       f.status       ?? 'pending',
    createdAt:    f.createdAt    ?? '',
  }
}

/** 权限辅助：判断是否属于采购运营组 */
export function isOpsGroup(profile) {
  return profile?.role === 'admin' || profile?.dept === '采购运营组'
}

/** 权限辅助：判断是否属于集团采购部（非运营组普通成员） */
export function isGroupPurchase(profile) {
  return profile?.role !== 'admin' && profile?.dept === '集团采购部'
}

/** 确保用户表存在 dept / group / jobId 字段，不存在则自动创建 */
const USER_EXTRA_FIELDS = [
  { name: 'dept',  type: 'singleSelect', options: { choices: [
    { name: '采购运营组' }, { name: '集团采购部' },
  ]}},
  { name: 'group', type: 'singleSelect', options: { choices: [
    { name: '运营分析组' }, { name: '采购稽核组' }, { name: '供应商管理组' },
  ]}},
  { name: 'okrGroup', type: 'singleSelect', options: { choices: [
    { name: '采购一组' }, { name: '采购二组' }, { name: '采购三组' },
    { name: '采购四组' }, { name: '采购运营组' },
  ]}},
  { name: 'jobId', type: 'singleLineText' },
]

export async function ensureUserFields() {
  try {
    const existing = await request(`/table/${TID}/field`)
    const names = new Set(existing.map(f => f.name))
    for (const def of USER_EXTRA_FIELDS) {
      if (!names.has(def.name)) {
        await request(`/table/${TID}/field`, {
          method: 'POST',
          body: JSON.stringify(def),
        }).catch(e => console.warn(`[Teable] 创建字段 "${def.name}" 失败:`, e.message))
      }
    }
  } catch(e) {
    console.warn('[Teable] ensureUserFields 失败:', e.message)
  }
}

/** 获取所有用户（小团队全量加载后客户端过滤） */
export async function listUsers() {
  const data = await request(`/table/${TID}/record?take=500&fieldKeyType=name`)
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
  const data = await request(`/table/${TID}/record/${uid}?fieldKeyType=name`)
  return normalize(data)
}

/** 创建用户记录 */
export async function createUser(fields) {
  const data = await request(`/table/${TID}/record?fieldKeyType=name`, {
    method: 'POST',
    body: JSON.stringify({ records: [{ fields }] }),
  })
  const r = data.records?.[0]
  return r ? normalize(r) : null
}

/** 更新用户记录（仅传需要修改的字段） */
export async function updateUser(recordId, fields) {
  await request(`/table/${TID}/record?fieldKeyType=name`, {
    method: 'PATCH',
    body: JSON.stringify({ records: [{ id: recordId, fields }] }),
  })
}
