/**
 * OKR 进度报告 — 通过后端代理 /t/okr/*。
 * 附件上传走 /t/okr/records/:rid/attachment/:fid。
 */

import { api, isApiConfigured, getToken } from './api'

const BASE = (import.meta.env.VITE_API_BASE ?? import.meta.env.VITE_SSO_WORKER_BASE ?? '').replace(/\/$/, '')

// ── 字段自动建字段已移到后端,前端 no-op ──
export async function ensureOKRFields() { /* no-op */ }

// ── 内存缓存(30s TTL) ───────────────────────────────────────────────────────
let _cache = null
let _cacheAt = 0

async function loadAll(force = false) {
  if (!isApiConfigured()) return []
  const now = Date.now()
  if (!force && _cache && now - _cacheAt < 30000) return _cache
  const data = await api.get('/t/okr/records', { take: 500, fieldKeyType: 'name' })
  _cache = (data?.records ?? []).map(r => ({ _id: r.id, ...(r.fields ?? {}) }))
  _cacheAt = now
  return _cache
}

function invalidate() { _cache = null }

// ── OKR 结构(objectives + KRs) ──────────────────────────────────────────────
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
    await api.patch('/t/okr/records', { fieldKeyType: 'name', records: [{ id: existing._id, fields }] })
  } else {
    await api.post('/t/okr/records', {
      fieldKeyType: 'name',
      records: [{ fields: { recordType: 'okr_setup', typeKey, ...fields } }],
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
    await api.patch('/t/okr/records', { fieldKeyType: 'name', records: [{ id: existing._id, fields }] })
  } else {
    await api.post('/t/okr/records', {
      fieldKeyType: 'name',
      records: [{ fields: { recordType: 'okr_periods', typeKey: 'all', ...fields } }],
    })
  }
  invalidate()
}

// ── 各组进度报告 ───────────────────────────────────────────────────────────────
export async function getGroupReport(group, periodId) {
  const all = await loadAll()
  const rec = all.find(r => r.recordType === 'okr_report' && r.group === group && r.typeKey === periodId)
  if (!rec?.payload) return {}
  try { return JSON.parse(rec.payload) } catch { return {} }
}

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
    await api.patch('/t/okr/records', { fieldKeyType: 'name', records: [{ id: existing._id, fields }] })
  } else {
    await api.post('/t/okr/records', {
      fieldKeyType: 'name',
      records: [{ fields: { recordType: 'okr_report', typeKey: periodId, group, ...fields } }],
    })
  }
  invalidate()
}

export async function getAllPeriodsReports() {
  const all = await loadAll()
  const result = {}
  for (const rec of all) {
    if (rec.recordType === 'okr_report') {
      const pid = rec.typeKey
      if (!result[pid]) result[pid] = {}
      try { result[pid][rec.group] = JSON.parse(rec.payload) } catch { result[pid][rec.group] = {} }
    }
  }
  return result
}

// ── 填写日志 ──────────────────────────────────────────────────────────────────
export async function appendHistory(periodId, group, entry) {
  const key = `history-${periodId}-${group}`
  const all = await loadAll(true)
  const existing = all.find(r => r.recordType === 'okr_history' && r.typeKey === key)
  let entries = []
  if (existing?.payload) {
    try { entries = JSON.parse(existing.payload) } catch {}
  }
  entries.push(entry)
  const payload = JSON.stringify(entries)
  const fields = { payload, updatedBy: entry.user, updatedAt: new Date().toISOString() }
  if (existing) {
    await api.patch('/t/okr/records', { fieldKeyType: 'name', records: [{ id: existing._id, fields }] })
  } else {
    await api.post('/t/okr/records', {
      fieldKeyType: 'name',
      records: [{ fields: { recordType: 'okr_history', typeKey: key, group, ...fields } }],
    })
  }
  invalidate()
}

export async function getHistory({ group, periodId } = {}) {
  const all = await loadAll()
  const recs = all.filter(r => {
    if (r.recordType !== 'okr_history') return false
    if (group && r.group !== group) return false
    if (periodId && !r.typeKey.includes(periodId)) return false
    return true
  })
  const entries = []
  for (const rec of recs) {
    try {
      const parsed = JSON.parse(rec.payload)
      const arr = Array.isArray(parsed) ? parsed : [parsed]
      entries.push(...arr.map(e => ({ group: rec.group, ...e })))
    } catch {}
  }
  return entries.sort((a, b) => (b.ts || '').localeCompare(a.ts || ''))
}

// ── 附件上传 ──────────────────────────────────────────────────────────────────
let _attachFid = null
async function getAttachFid() {
  if (_attachFid) return _attachFid
  const fields = await api.get('/t/okr/fields')
  const f = (fields ?? []).find(x => x.name === 'attachment' && x.type === 'attachment')
  if (!f) throw new Error('OKR 表缺少 attachment 字段,请在 Teable 端先建好')
  _attachFid = f.id
  return _attachFid
}

async function getReportRecordId(group, periodId) {
  const all = await loadAll(true)
  const existing = all.find(r => r.recordType === 'okr_report' && r.group === group && r.typeKey === periodId)
  if (existing) return existing._id
  const data = await api.post('/t/okr/records', {
    fieldKeyType: 'name',
    records: [{ fields: {
      recordType: 'okr_report', typeKey: periodId, group,
      payload: '{}', updatedAt: new Date().toISOString(),
    }}],
  })
  invalidate()
  return data?.records?.[0]?.id
}

export async function getKRAttachments(group, periodId) {
  const all = await loadAll()
  const rec = all.find(r => r.recordType === 'okr_report' && r.group === group && r.typeKey === periodId)
  const atts = Array.isArray(rec?.attachment) ? rec.attachment : []
  return atts.map(a => {
    const idx = (a.name || '').indexOf('__')
    const krId       = idx >= 0 ? a.name.slice(0, idx)  : ''
    const displayName = idx >= 0 ? a.name.slice(idx + 2) : a.name
    return { ...a, krId, displayName }
  })
}

export async function uploadKRAttachment(group, periodId, krId, file) {
  if (!isApiConfigured()) throw new Error('API 未配置')
  const [recordId, fieldId] = await Promise.all([
    getReportRecordId(group, periodId),
    getAttachFid(),
  ])
  const renamed = new File([file], `${krId}__${file.name}`, { type: file.type })
  const form = new FormData()
  form.append('file', renamed)
  const token = getToken()
  const res = await fetch(`${BASE}/t/okr/records/${recordId}/attachment/${fieldId}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  })
  if (!res.ok) {
    const b = await res.json().catch(() => ({}))
    throw new Error(b.errmsg ?? b.message ?? `附件上传失败 ${res.status}`)
  }
  invalidate()
  return getKRAttachments(group, periodId)
}

export async function deleteKRAttachment(group, periodId, keepTokens) {
  const all = await loadAll(true)
  const rec = all.find(r => r.recordType === 'okr_report' && r.group === group && r.typeKey === periodId)
  if (!rec) return
  const fieldId = await getAttachFid()
  await api.patch('/t/okr/records', {
    records: [{ id: rec._id, fields: { [fieldId]: keepTokens.map(t => ({ token: t })) } }],
  })
  invalidate()
  return getKRAttachments(group, periodId)
}

// ── 工具 ──────────────────────────────────────────────────────────────────────
export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

export const OKR_GROUPS = ['采购一组', '采购二组', '采购三组', '采购四组', '采购运营组']

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
    annualLabel:   `${fy} 年度 OKR(${fy}/3/1 ~ ${fy + 1}/2/28)`,
  }
}
