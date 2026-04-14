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
  { name: 'attachment', type: 'attachment'     },
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

// ── 全周期报告（用于总览） ──────────────────────────────────────────────────────
// 返回 { periodId: { group: { krId: { status, content } } } }
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

// ── 填写日志 ───────────────────────────────────────────────────────────────────
// payload: JSON 数组，每条条目：{ ts, user, periodId, periodLabel, changes: [...] }

export async function appendHistory(periodId, group, entry) {
  if (!TID) return
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
    await req(`/table/${TID}/record?fieldKeyType=name`, {
      method: 'PATCH',
      body: JSON.stringify({ records: [{ id: existing._id, fields }] }),
    })
  } else {
    await req(`/table/${TID}/record?fieldKeyType=name`, {
      method: 'POST',
      body: JSON.stringify({ records: [{ fields: { recordType: 'okr_history', typeKey: key, group, ...fields } }] }),
    })
  }
  invalidate()
}

// 返回所有日志条目（倒序），可按 group / periodId 过滤
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
      // 从 Teable 字段补充 group（向后兼容旧数据）
      entries.push(...arr.map(e => ({ group: rec.group, ...e })))
    } catch {}
  }
  return entries.sort((a, b) => (b.ts || '').localeCompare(a.ts || ''))
}

// ── 附件上传（同百宝箱模式，上传到 okr_report 记录的 attachment 字段） ────────

let _attachFid = null

async function getAttachFid() {
  if (_attachFid) return _attachFid
  const fields = await req(`/table/${TID}/field`)
  const f = (fields ?? []).find(x => x.name === 'attachment' && x.type === 'attachment')
  if (!f) {
    const created = await req(`/table/${TID}/field`, {
      method: 'POST',
      body: JSON.stringify({ name: 'attachment', type: 'attachment' }),
    })
    _attachFid = created.id
  } else {
    _attachFid = f.id
  }
  return _attachFid
}

/** 获取（或创建）指定组-周期的 okr_report 记录 ID */
async function getReportRecordId(group, periodId) {
  const all = await loadAll(true)
  const existing = all.find(r => r.recordType === 'okr_report' && r.group === group && r.typeKey === periodId)
  if (existing) return existing._id
  const data = await req(`/table/${TID}/record?fieldKeyType=name`, {
    method: 'POST',
    body: JSON.stringify({ records: [{ fields: {
      recordType: 'okr_report', typeKey: periodId, group,
      payload: '{}', updatedAt: new Date().toISOString(),
    }}] }),
  })
  invalidate()
  return data.records?.[0]?.id
}

/** 获取某组-周期的所有附件（已按 krId__ 前缀打包）
 *  返回 [{ token, name, displayName, size, mimetype, presignedUrl, krId }] */
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

/** 上传一个文件到指定 KR，文件名自动前缀 krId__
 *  成功后返回该组-周期最新附件列表（已解析） */
export async function uploadKRAttachment(group, periodId, krId, file) {
  if (!TID) throw new Error('未配置 VITE_TEABLE_OKR_TABLE_ID')
  const [recordId, fieldId] = await Promise.all([
    getReportRecordId(group, periodId),
    getAttachFid(),
  ])
  const renamedFile = new File([file], `${krId}__${file.name}`, { type: file.type })
  const form = new FormData()
  form.append('file', renamedFile)
  const res = await fetch(`${API}/api/table/${TID}/record/${recordId}/${fieldId}/uploadAttachment`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}` },
    body: form,
  })
  if (!res.ok) {
    const b = await res.json().catch(() => ({}))
    throw new Error(b.message ?? `附件上传失败 ${res.status}`)
  }
  invalidate()
  return getKRAttachments(group, periodId)
}

/** 删除指定附件（保留其余 token）
 *  keepTokens: 需要保留的 token 数组 */
export async function deleteKRAttachment(group, periodId, keepTokens) {
  if (!TID) return
  const all = await loadAll(true)
  const rec = all.find(r => r.recordType === 'okr_report' && r.group === group && r.typeKey === periodId)
  if (!rec) return
  const fieldId = await getAttachFid()
  await req(`/table/${TID}/record`, {
    method: 'PATCH',
    body: JSON.stringify({
      records: [{ id: rec._id, fields: { [fieldId]: keepTokens.map(t => ({ token: t })) } }],
    }),
  })
  invalidate()
  return getKRAttachments(group, periodId)
}

// ── 工具函数 ──────────────────────────────────────────────────────────────────
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
    annualLabel:   `${fy} 年度 OKR（${fy}/3/1 ～ ${fy + 1}/2/28）`,
  }
}
