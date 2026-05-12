/**
 * 用户表客户端 — 通过后端代理 /t/users/* 访问,前端不再直连 Teable。
 *
 * 保留原模块导出签名,页面组件零改动。
 * upsertSsoUser / 注册 / 改密 这类敏感路径走 /auth/*,不在此文件。
 */

import { api, isApiConfigured } from './api'

export const isConfigured = () => isApiConfigured()

export function isOpsGroup(profile) {
  return profile?.role === 'admin' || profile?.dept === '采购运营组'
}

export function isGroupPurchase(profile) {
  return profile?.role !== 'admin' && profile?.dept === '集团采购部'
}

function normalize(record) {
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

/** users 表字段建库由后端/Teable 端负责,前端保留 no-op 以兼容调用方 */
export async function ensureUserFields() { /* no-op,已移至后端统一管理 */ }

export async function listUsers() {
  const data = await api.get('/t/users/records', { take: 500, fieldKeyType: 'name' })
  const records = (data?.records ?? []).map(normalize)
  return records.sort((a, b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0
    return tb - ta
  })
}

export async function findUserByEmail(email) {
  const users = await listUsers()
  return users.find(u => u.email?.toLowerCase() === String(email || '').toLowerCase()) ?? null
}

export async function findUserById(uid) {
  const data = await api.get(`/t/users/records/${uid}`, { fieldKeyType: 'name' })
  return data ? normalize(data) : null
}

/** 管理员创建用户(admin 专用) */
export async function createUser(fields) {
  const data = await api.post('/t/users/records', { fieldKeyType: 'name', records: [{ fields }] })
  const r = data?.records?.[0]
  return r ? normalize(r) : null
}

export async function updateUser(recordId, fields) {
  await api.patch('/t/users/records', { fieldKeyType: 'name', records: [{ id: recordId, fields }] })
}

export async function findUserBySsoId(ssoAccountId) {
  if (!ssoAccountId) return null
  const users = await listUsers()
  return users.find(u => u.ssoAccountId === ssoAccountId) ?? null
}

/**
 * SSO upsert 已移至后端 /auth/sso-finalize,前端不再直接调用。
 * 兼容残留引用:抛错提示走新路径。
 */
export async function upsertSsoUser(_ssoUser) {
  throw new Error('upsertSsoUser 已由后端 /auth/sso-finalize 处理,请改用 AuthContext.ssoLogin / ssoTokenLogin')
}
