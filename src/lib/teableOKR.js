/**
 * OKR 进度报告 — Teable 数据层
 *
 * 需在 Teable 中创建新表，并配置环境变量 VITE_TEABLE_OKR_TABLE_ID
 * 表字段（代码自动创建，无需手动配置）：
 *   recordType  单行文本  'okr_setup' | 'okr_report' | 'okr_periods'
 *   typeKey     单行文本  e.g. 'annual-2026' | 'quarterly-2026-Q1' | 'all' | periodId
 *   group       单行文本  e.g. '采购一组'（reports 专用）
 *   payload     长文本   JSON 字符串
 *   updatedBy   单行文本  操作人
 *   updatedAt   单行文本  ISO 时间戳
 */

const API   = (import.meta.env.VITE_TEABLE_API_BASE ?? '').replace(/\/$/, '')
const TOKEN = import.meta.env.VITE_TEABLE_TOKEN
const TID   = import.meta.env.VITE_TEABLE_OKR_TABLE_ID

async function req(path, init = {}) {
  const res = await fetch(`${API}/api${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  if (res.status === 204) return null
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.message ?? `OKR API 错误 ${res.status}`)
  }
  return res.json().catch(() => null)
}

// ── 字段自动创建 ─────────────────────────────────────────────────────────────
const OKR_FIELDS = [
  { name: 'recordType', type: 'singleLineText' },
  { name: 'typeKey',    type: 'singleLineText' },
  { name: 'group',      type: 'singleLineText' },
  { name: 'payload',    type: 'longText'       },
  { name: 'updatedBy',  type: 'singleLineText' },
  { name: 'updatedAt',  type: 'singleLineText' },
]

export async function ensureOKRFields() {
  if (!TID) return
  try {
    const existing = await req(`/table/${TID}/field`)
    const names = new Set((existing ?? []).map(f => f.name))
    for (const def of OKR_FIELDS) {
      if (!names.has(def.name)) {
        await req(`/table/${TID}/field`, {
          method: 'POST',
          body: JSON.stringify(def),
        }).catch(e => console.warn(`[OKR] 创建字段 "${def.name}" 失败:`, e.message))
      }
    }
  } catch (e) {
    console.warn('[OKR] ensureOKRFields 失败:', e.message)
  }
}

// ── 内存缓存（30s TTL） ───────────────────────────────────────────────────────
let _cache = null
let _cacheAt = 0

async function loadAll(force = false) {
  if (!TID) return []
  const now = Date.now()
  if (!force && _cache && now - _cacheAt < 30000) return _cache
  const data = await req(`/table/${TID}/record?take=500&fieldKeyType=name`)
  _cache = (data?.records ?? []).map(r => ({ _id: r.id, ...(r.fields ?? {}) }))
  _cacheAt = now
  return _cache
}

function invalidate() { _cache = null }

// ── OKR 结构（objectives + KRs） ──────────────────────────────────────────────
// typeKey 格式：'annual-2026' | 'quarterly-2026-Q1'
export async function getOKRSetup(typeKey) {
  const all = await loadAll()
  const rec = all.find(r => r.recordType === 'okr_setup' && r.typeKey === typeKey)
  if (!rec?.payload) return { objectives: [] }
  try { return JSON.parse(rec.payload) } catch { return { objectives: [] } }
}

export async function saveOKRSetup(typeKey, data, byUser) {
  const payload = JSON.stringify(data)
  const all = await loadAll(true)
  const existing = all.find(r => r.recordType === 'okr_setup' && r.typeKey === typeKey)
  const fields = { payload, updatedBy: byUser, updatedAt: new Date().toISOString() }
  if (existing) {
    await req(`/table/${TID}/record?fieldKeyType=name`, {
      method: 'PATCH',
      body: JSON.stringify({ records: [{ id: existing._id, fields }] }),
    })
  } else {
    await req(`/table/${TID}/record?fieldKeyType=name`, {
      method: 'POST',
      body: JSON.stringify({ records: [{ fields: { recordType: 'okr_setup', typeKey, ...fields } }] }),
    })
  }
  invalidate()
}

// ── 双周汇报周期 ───────────────────────────────────────────────────────────────
export async function getPeriods() {
  const all = await loadAll()
  const rec = all.find(r => r.recordType === 'okr_periods')
  if (!rec?.payload) return []
  try { return JSON.parse(rec.payload) } catch { return [] }
}

export async function savePeriods(periods, byUser) {
  const payload = JSON.stringify(periods)
  const all = await loadAll(true)
  const existing = all.find(r => r.recordType === 'okr_periods')
  const fields = { payload, updatedBy: byUser, updatedAt: new Date().toISOString() }
  if (existing) {
    await req(`/table/${TID}/record?fieldKeyType=name`, {
      method: 'PATCH',
      body: JSON.stringify({ records: [{ id: existing._id, fields }] }),
    })
  } else {
    await req(`/table/${TID}/record?fieldKeyType=name`, {
      method: 'POST',
      body: JSON.stringify({ records: [{ fields: { recordType: 'okr_periods', typeKey: 'all', ...fields } }] }),
    })
  }
  invalidate()
}

// ── 各组进度报告 ───────────────────────────────────────────────────────────────
// payload 格式：{ [krId]: { status: 'notstart'|'progress'|'done', content: string } }

export async function getGroupReport(group, periodId) {
  const all = await loadAll()
  const rec = all.find(r => r.recordType === 'okr_report' && r.group === group && r.typeKey === periodId)
  if (!rec?.payload) return {}
  try { return JSON.parse(rec.payload) } catch { return {} }
}

// 返回 { '采购一组': { krId: { status, content } }, ... }
export async function getAllGroupReports(periodId) {
  if (!periodId) return {}
  const all = await loadAll()
  const result = {}
  for (const rec of all) {
    if (rec.recordType === 'okr_report' && rec.typeKey === periodId) {
      try { result[rec.group] = JSON.parse(rec.payload) } catch { result[rec.group] = {} }
    }
  }
  return result
}

export async function saveGroupReport(group, periodId, data, byUser) {
  const payload = JSON.stringify(data)
  const all = await loadAll(true)
  const existing = all.find(r => r.recordType === 'okr_report' && r.group === group && r.typeKey === periodId)
  const fields = { payload, updatedBy: byUser, updatedAt: new Date().toISOString() }
  if (existing) {
    await req(`/table/${TID}/record?fieldKeyType=name`, {
      method: 'PATCH',
      body: JSON.stringify({ records: [{ id: existing._id, fields }] }),
    })
  } else {
    await req(`/table/${TID}/record?fieldKeyType=name`, {
      method: 'POST',
      body: JSON.stringify({ records: [{ fields: { recordType: 'okr_report', typeKey: periodId, group, ...fields } }] }),
    })
  }
  invalidate()
}

// ── 工具函数 ──────────────────────────────────────────────────────────────────
export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

export const OKR_GROUPS = ['采购一组', '采购二组', '采购三组', '采购四组', '采购五组']

export function getFiscalYear(date) {
  const d = date ? new Date(date) : new Date()
  const m = d.getMonth() + 1, y = d.getFullYear()
  const fy = m <= 2 ? y - 1 : y
  let q
  if      (m >= 3  && m <= 5)  q = 'Q1'
  else if (m >= 6  && m <= 8)  q = 'Q2'
  else if (m >= 9  && m <= 11) q = 'Q3'
  else                          q = 'Q4'
  return {
    fy,
    q,
    qk:            `${fy}-${q}`,
    annualKey:     `annual-${fy}`,
    quarterlyKey:  `quarterly-${fy}-${q}`,
    annualLabel:   `${fy} 年度 OKR（${fy}/3/1 ～ ${fy + 1}/2/28）`,
  }
}
