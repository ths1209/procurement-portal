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
    ssoAccountId: f.ssoAccountId ?? '',      // SSO 账号 UUID（唯一主键）
    ssoWorkcode:  f.ssoWorkcode  ?? '',      // SSO 工号
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
  { name: 'jobId',        type: 'singleLineText' },
  { name: 'ssoAccountId', type: 'singleLineText' },
  { name: 'ssoWorkcode',  type: 'singleLineText' },
]

export async function ensureUserFields() {
  try {
    const existing = await request(`/table/${TID}/field`)
    const fieldMap = Object.fromEntries(existing.map(f => [f.name, f]))
    for (const def of USER_EXTRA_FIELDS) {
      if (!fieldMap[def.name]) {
        // 字段不存在，创建
        await request(`/table/${TID}/field`, {
          method: 'POST',
          body: JSON.stringify(def),
        }).catch(e => console.warn(`[Teable] 创建字段 "${def.name}" 失败:`, e.message))
      } else if (def.type === 'singleSelect' && def.options?.choices) {
        // 字段已存在，检查是否缺少选项，有则追加
        const fld = fieldMap[def.name]
        const existingNames = new Set((fld.options?.choices ?? []).map(c => c.name))
        const missing = def.options.choices.filter(c => !existingNames.has(c.name))
        if (missing.length > 0) {
          const allChoices = [...(fld.options?.choices ?? []), ...missing]
          await request(`/table/${TID}/field/${fld.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ options: { choices: allChoices } }),
          }).catch(e => console.warn(`[Teable] 补全字段 "${def.name}" 选项失败:`, e.message))
        }
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

/** 通过 SSO account_id 查找用户（首选匹配键，SSO 侧保证唯一） */
export async function findUserBySsoId(ssoAccountId) {
  if (!ssoAccountId) return null
  const users = await listUsers()
  return users.find(u => u.ssoAccountId === ssoAccountId) ?? null
}

/**
 * SSO 登录 upsert：
 *   1. 先按 ssoAccountId 命中 → 回写最新 email/name/workcode（不覆盖 role/status/dept）
 *   2. 否则按 email 命中 → 补齐 ssoAccountId / ssoWorkcode，首次 SSO 绑定（保留原 status）
 *   3. 否则按 workcode === jobId 命中 → 同上绑定（保留原 status，避免已激活用户被降回 pending）
 *   4. 仍未命中 → 建新记录，status=pending 等管理员审批
 *
 * ssoUser: { account_id, account, email, name, workcode, yachid }
 * 返回：归一化后的用户对象
 */
export async function upsertSsoUser(ssoUser) {
  const accountId = ssoUser.account_id
  if (!accountId) throw new Error('SSO 返回缺少 account_id')

  const byId = await findUserBySsoId(accountId)
  if (byId) {
    const patch = {}
    if (ssoUser.email    && ssoUser.email    !== byId.email)       patch.email       = ssoUser.email
    if (ssoUser.name     && ssoUser.name     !== byId.displayName) patch.displayName = ssoUser.name
    if (ssoUser.workcode && ssoUser.workcode !== byId.ssoWorkcode) patch.ssoWorkcode = ssoUser.workcode
    if (ssoUser.workcode && !byId.jobId)                            patch.jobId       = ssoUser.workcode
    if (Object.keys(patch).length > 0) {
      await updateUser(byId.uid, patch)
      return { ...byId, ...patch }
    }
    return byId
  }

  // 首次 SSO：用 email 或 workcode 匹配历史账号，直接绑定，保留原 status
  const users = await listUsers()
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
    await updateUser(matched.uid, patch)
    return { ...matched, ...patch }
  }

  const created = await createUser({
    email:        ssoUser.email ?? '',
    displayName:  ssoUser.name ?? ssoUser.account ?? '',
    ssoAccountId: accountId,
    ssoWorkcode:  ssoUser.workcode ?? '',
    jobId:        ssoUser.workcode ?? '',
    role:         'member',
    status:       'pending',
    createdAt:    new Date().toISOString(),
  })
  return created
}
