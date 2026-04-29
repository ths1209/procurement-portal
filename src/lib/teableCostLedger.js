/**
 * 成本台账 Teable API 客户端
 * 对应视图：yach-teable · table/tbl4e5Cuu6nlNw19uqz · view/viw4NKBSKkxIo1kOrlK
 * 通过 viewId 让 Teable 服务端套用视图的 filter/sort，前端只负责渲染和写回
 */

const API   = (import.meta.env.VITE_TEABLE_API_BASE ?? '').replace(/\/$/, '')
const TOKEN = import.meta.env.VITE_TEABLE_TOKEN ?? ''

const TABLE_ID = 'tbl4e5Cuu6nlNw19uqz'
const VIEW_ID  = 'viw4NKBSKkxIo1kOrlK'

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
  if (res.status === 204) return null
  return res.json()
}

// 类型分类：决定网格里走哪种渲染/编辑器
export function classifyField(field) {
  if (field.isComputed) return 'readonly'
  switch (field.type) {
    case 'singleLineText':
    case 'longText':
      return 'text'
    case 'number':
      return 'number'
    case 'singleSelect':
      return 'singleSelect'
    case 'multipleSelect':
      return 'multipleSelect'
    case 'checkbox':
      return 'checkbox'
    case 'date':
      return 'date'
    case 'attachment':
    case 'link':
    case 'formula':
    case 'rollup':
    case 'lookup':
    case 'createdTime':
    case 'lastModifiedTime':
    case 'autoNumber':
    case 'user':
    case 'createdBy':
    case 'lastModifiedBy':
      return 'readonly'
    default:
      return 'readonly'
  }
}

export async function loadCostLedger() {
  const [fieldsRaw, view, recordsResp] = await Promise.all([
    request(`/table/${TABLE_ID}/field`),
    request(`/table/${TABLE_ID}/view/${VIEW_ID}`),
    request(`/table/${TABLE_ID}/record?viewId=${VIEW_ID}&take=500&fieldKeyType=name`),
  ])

  const fieldById = Object.fromEntries(fieldsRaw.map(f => [f.id, f]))
  const columnMeta = view.columnMeta ?? {}

  // 按视图 columnMeta 的 order 排列并过滤 hidden
  const columns = fieldsRaw
    .map(f => ({
      field: f,
      meta:  columnMeta[f.id] ?? {},
    }))
    .filter(c => !c.meta.hidden)
    .sort((a, b) => (a.meta.order ?? 0) - (b.meta.order ?? 0))
    .map(c => ({
      id:       c.field.id,
      name:     c.field.name,
      type:     c.field.type,
      kind:     classifyField(c.field),
      width:    c.meta.width ?? 160,
      options:  c.field.options ?? {},
      description: c.field.description ?? '',
      isComputed: !!c.field.isComputed,
      isPrimary:  !!c.field.isPrimary,
    }))

  const records = (recordsResp.records ?? []).map(r => ({
    id:     r.id,
    name:   r.name,
    fields: r.fields ?? {},
  }))

  return { columns, records, view, fieldById }
}

/** 写回单个字段（按字段名） */
export async function updateCell(recordId, fieldName, value) {
  await request(`/table/${TABLE_ID}/record?fieldKeyType=name`, {
    method: 'PATCH',
    body: JSON.stringify({ records: [{ id: recordId, fields: { [fieldName]: value } }] }),
  })
}
