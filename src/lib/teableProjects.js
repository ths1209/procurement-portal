const API   = (import.meta.env.VITE_TEABLE_API_BASE ?? 'https://app.teable.io').replace(/\/$/, '')
const TOKEN = import.meta.env.VITE_TEABLE_TOKEN
const TID   = import.meta.env.VITE_TEABLE_PROJECTS_TABLE_ID

export const F = {
  id:          '编号',
  task:        '工作任务（OKR）',
  startDate:   '任务发布时间',
  planDate:    '计划完成时间',
  actualDate:  '实际完成时间',
  progress:    '任务当前进展',
  status:      '完成状态',
  owner:       '责任人',
  ownerJobId:  '责任人工号',
  org:         '采购组织',
  deliverable: '交付成果链接',
  lateReason:  '未及时交付原因分析',
  taskList:    '任务清单（具体任务分解）',
  createdBy:   '创建人邮箱',
  reviewStatus:'审核状态',
  history:     '操作历史',
}

const FIELD_DEFS = [
  { name: F.id,          type: 'singleLineText' },
  { name: F.task,        type: 'longText' },
  { name: F.startDate,   type: 'singleLineText' },
  { name: F.planDate,    type: 'singleLineText' },
  { name: F.actualDate,  type: 'singleLineText' },
  { name: F.progress,    type: 'longText' },
  { name: F.status,      type: 'singleSelect',
    options: { choices: [
      { name:'未开始' }, { name:'进行中' }, { name:'已完成' },
      { name:'逾期' },   { name:'暂停' },
    ]}
  },
  { name: F.owner,       type: 'singleLineText' },
  { name: F.ownerJobId,  type: 'singleLineText' },
  { name: F.org,         type: 'singleSelect', options: { choices: [
    { name: '运营分析组' }, { name: '采购稽核组' }, { name: '支付类合作商管理组' },
  ]}},
  { name: F.deliverable, type: 'singleLineText' },
  { name: F.lateReason,  type: 'longText' },
  { name: F.taskList,    type: 'longText' },
  { name: F.createdBy,   type: 'singleLineText' },
  { name: F.reviewStatus,type: 'singleSelect',
    options: { choices: [
      { name:'待审核' }, { name:'已审核' }, { name:'已驳回' },
    ]}
  },
  { name: F.history,     type: 'longText' },
]

async function req(path, init = {}) {
  const res = await fetch(`${API}/api${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
  if (!res.ok) {
    const b = await res.json().catch(() => ({}))
    throw new Error(b.message ?? `API ${res.status}`)
  }
  return res.json()
}

function parseHistory(raw) {
  try { return JSON.parse(raw || '[]') } catch { return [] }
}

function norm(r) {
  const f = r.fields ?? {}
  return {
    _id:         r.id,
    id:          f[F.id]          ?? '',
    task:        f[F.task]        ?? '',
    startDate:   f[F.startDate]   ?? '',
    planDate:    f[F.planDate]    ?? '',
    actualDate:  f[F.actualDate]  ?? '',
    progress:    f[F.progress]    ?? '',
    status:      f[F.status]      ?? '',
    owner:       f[F.owner]       ?? '',
    ownerJobId:  f[F.ownerJobId]  ?? '',
    org:         f[F.org]         ?? '',
    deliverable: f[F.deliverable] ?? '',
    lateReason:  f[F.lateReason]  ?? '',
    taskList:    f[F.taskList]    ?? '',
    createdBy:   f[F.createdBy]   ?? '',
    reviewStatus:f[F.reviewStatus]?? '待审核',
    history:     parseHistory(f[F.history]),
  }
}

function cleanFields(fields) {
  return Object.fromEntries(
    Object.entries(fields).filter(([, v]) => v !== null && v !== undefined && v !== '')
  )
}

/** 生成单条历史记录 entry */
export function makeHistoryEntry({ by, action, note }) {
  return { t: new Date().toISOString(), by: by || '系统', a: action, n: note || '' }
}

export const isConfigured = () => !!TID

export async function ensureTableFields() {
  const existing = await req(`/table/${TID}/field`)
  const existingNames = new Set(existing.map(f => f.name))
  for (const def of FIELD_DEFS) {
    if (!existingNames.has(def.name)) {
      try {
        await req(`/table/${TID}/field`, { method:'POST', body:JSON.stringify(def) })
      } catch (e) {
        console.warn(`[Teable] 创建字段 "${def.name}" 失败:`, e.message)
      }
    }
  }
}

export async function listProjects() {
  if (!TID) return []
  const data = await req(`/table/${TID}/record?take=200`)
  return (data.records ?? []).map(norm)
}

export async function createProject(fields, who) {
  if (!TID) throw new Error('未配置项目表')
  const entry = makeHistoryEntry({ by: who, action: '创建项目' })
  const allFields = cleanFields({ ...fields, [F.history]: JSON.stringify([entry]) })
  const body = { records: [{ fields: allFields }] }
  try {
    const data = await req(`/table/${TID}/record`, { method:'POST', body:JSON.stringify(body) })
    return norm(data.records?.[0])
  } catch (e) {
    if (e.message?.includes('not found')) {
      await ensureTableFields()
      const data = await req(`/table/${TID}/record`, { method:'POST', body:JSON.stringify(body) })
      return norm(data.records?.[0])
    }
    throw e
  }
}

/**
 * @param {string} recordId
 * @param {object} fields - 要更新的字段
 * @param {{ by:string, action:string, note?:string }} historyMeta - 操作人与动作描述
 * @param {Array} currentHistory - 当前历史数组（来自 row.history）
 */
export async function deleteProject(recordId) {
  if (!TID) throw new Error('未配置项目表')
  await req(`/table/${TID}/record/${recordId}`, { method: 'DELETE' })
}

export async function updateProject(recordId, fields, historyMeta = null, currentHistory = []) {
  if (!TID) throw new Error('未配置项目表')
  const updates = { ...fields }
  if (historyMeta) {
    const entry = makeHistoryEntry(historyMeta)
    const history = [...(Array.isArray(currentHistory) ? currentHistory : []), entry]
    updates[F.history] = JSON.stringify(history)
  }
  const body = JSON.stringify({ records: [{ id: recordId, fields: cleanFields(updates) }] })
  try {
    await req(`/table/${TID}/record`, { method: 'PATCH', body })
  } catch (e) {
    if (e.message?.includes('not found')) {
      await ensureTableFields()
      await req(`/table/${TID}/record`, { method: 'PATCH', body })
    } else {
      throw e
    }
  }
}
