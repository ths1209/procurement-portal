/**
 * 成本台账 Teable API 客户端
 * table/tbl4e5Cuu6nlNw19uqz 下多个视图，通过 viewId 让服务端套用 filter/sort/group
 */

const API   = (import.meta.env.VITE_TEABLE_API_BASE ?? '').replace(/\/$/, '')
const TOKEN = import.meta.env.VITE_TEABLE_TOKEN ?? ''

const TABLE_ID = 'tbl4e5Cuu6nlNw19uqz'

// 暴露给 UI 的可编辑视图列表（Tab 顺序）
export const VIEW_TABS = [
  { id: 'viw4NKBSKkxIo1kOrlK', name: 'FY27 增量项目（存在降本）', emoji: '🟢', accent: '#10B981' },
  { id: 'viwkfqG1PMtbCdd2y44', name: 'FY27 增量项目（无降本）',   emoji: '🟢', accent: '#10B981' },
  { id: 'viwY9IggKRWjl0IJq3K', name: '历史延续项目',              emoji: '🔴', accent: '#EF4444' },
  { id: 'viwfmPtBBkW5N99aDNY', name: '手工补充项目',              emoji: '🟡', accent: '#F59E0B' },
]

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

export function classifyField(field) {
  if (field.isComputed) return 'readonly'
  switch (field.type) {
    case 'singleLineText':
    case 'longText':       return 'text'
    case 'number':         return 'number'
    case 'singleSelect':   return 'singleSelect'
    case 'multipleSelect': return 'multipleSelect'
    case 'checkbox':       return 'checkbox'
    default:               return 'readonly'
  }
}

export async function loadView(viewId) {
  const [fieldsRaw, view, recordsResp] = await Promise.all([
    request(`/table/${TABLE_ID}/field`),
    request(`/table/${TABLE_ID}/view/${viewId}`),
    request(`/table/${TABLE_ID}/record?viewId=${viewId}&take=500&fieldKeyType=name`),
  ])

  const columnMeta = view.columnMeta ?? {}
  const fieldById  = Object.fromEntries(fieldsRaw.map(f => [f.id, f]))

  const columns = fieldsRaw
    .map(f => ({ field: f, meta: columnMeta[f.id] ?? {} }))
    .filter(c => !c.meta.hidden)
    .sort((a, b) => (a.meta.order ?? 0) - (b.meta.order ?? 0))
    .map(c => ({
      id:           c.field.id,
      name:         c.field.name,
      type:         c.field.type,
      kind:         classifyField(c.field),
      width:        c.meta.width ?? defaultWidth(c.field),
      options:      c.field.options ?? {},
      description:  c.field.description ?? '',
      isComputed:   !!c.field.isComputed,
      isPrimary:    !!c.field.isPrimary,
      statisticFunc: c.meta.statisticFunc ?? null,
    }))

  const records = (recordsResp.records ?? []).map(r => ({
    id: r.id,
    name: r.name,
    fields: r.fields ?? {},
  }))

  // 将视图的 filter/sort/group 从 fieldId 解析为 fieldName，供 UI 展示
  const sorts = (view.sort?.sortObjs ?? []).map(s => ({
    fieldId:   s.fieldId,
    fieldName: fieldById[s.fieldId]?.name ?? s.fieldId,
    order:     s.order,
  }))
  const groupField = view.group?.[0]
  const group = groupField ? {
    fieldId:   groupField.fieldId,
    fieldName: fieldById[groupField.fieldId]?.name ?? groupField.fieldId,
    order:     groupField.order,
  } : null
  const filterSet = view.filter?.filterSet ?? []
  const filterConjunction = view.filter?.conjunction ?? 'and'
  const filters = filterSet.map(f => ({
    fieldId:   f.fieldId,
    fieldName: fieldById[f.fieldId]?.name ?? f.fieldId,
    operator:  f.operator,
    value:     f.value,
  }))

  const headerLines = view.options?.fieldNameDisplayLines ?? 1

  return { columns, records, view, sorts, group, filters, filterConjunction, headerLines }
}

function defaultWidth(field) {
  switch (field.type) {
    case 'longText':     return 280
    case 'number':       return 140
    case 'singleSelect': return 140
    case 'multipleSelect': return 220
    case 'attachment':   return 180
    default:             return 180
  }
}

export async function updateCell(recordId, fieldName, value) {
  await request(`/table/${TABLE_ID}/record?fieldKeyType=name`, {
    method: 'PATCH',
    body: JSON.stringify({ records: [{ id: recordId, fields: { [fieldName]: value } }] }),
  })
}

// Teable 选项色 → 前景 + 背景
const COLOR_PALETTE = {
  // Light2 系列（淡底）
  redLight2:     { bg: '#FEE2E2', fg: '#B91C1C' },
  orangeLight2:  { bg: '#FFEDD5', fg: '#C2410C' },
  yellowLight2:  { bg: '#FEF3C7', fg: '#B45309' },
  yellowLight1:  { bg: '#FEF9C3', fg: '#A16207' },
  greenLight2:   { bg: '#D1FAE5', fg: '#047857' },
  tealLight2:    { bg: '#CCFBF1', fg: '#0F766E' },
  cyanLight2:    { bg: '#CFFAFE', fg: '#0E7490' },
  blueLight2:    { bg: '#DBEAFE', fg: '#1D4ED8' },
  purpleLight2:  { bg: '#EDE9FE', fg: '#6D28D9' },
  pinkLight2:    { bg: '#FCE7F3', fg: '#BE185D' },
  grayLight2:    { bg: '#F3F4F6', fg: '#4B5563' },
  // 纯色系列
  red:           { bg: '#FECACA', fg: '#991B1B' },
  orange:        { bg: '#FED7AA', fg: '#9A3412' },
  yellow:        { bg: '#FDE68A', fg: '#92400E' },
  green:         { bg: '#A7F3D0', fg: '#065F46' },
  teal:          { bg: '#99F6E4', fg: '#115E59' },
  tealBright:    { bg: '#5EEAD4', fg: '#134E4A' },
  blue:          { bg: '#BFDBFE', fg: '#1E40AF' },
  purple:        { bg: '#DDD6FE', fg: '#5B21B6' },
  pink:          { bg: '#FBCFE8', fg: '#9D174D' },
  gray:          { bg: '#E5E7EB', fg: '#374151' },
}

export function pillColors(color) {
  return COLOR_PALETTE[color] ?? { bg: 'rgba(99,102,241,0.12)', fg: '#4F46E5' }
}

/** 数字 / 货币 / 百分比格式化 */
export function formatNumber(value, options = {}) {
  if (value == null || Number.isNaN(value)) return ''
  const fmt = options.formatting
  if (!fmt) return String(value)
  const p = fmt.precision ?? 2
  if (fmt.type === 'percent') {
    return (value * 100).toFixed(p) + '%'
  }
  if (fmt.type === 'currency') {
    return '¥' + value.toLocaleString('en-US', { minimumFractionDigits: p, maximumFractionDigits: p })
  }
  // decimal
  return value.toLocaleString('en-US', { minimumFractionDigits: p, maximumFractionDigits: p })
}

/** 字段名是否表示金额（用于决定 ¥ 前缀） */
export function looksLikeCurrency(name) {
  return /金额|CNY|元|费用|成本|价/i.test(name || '')
}

export const OPERATOR_LABELS = {
  is: '=', isNot: '≠',
  contains: '包含', doesNotContain: '不包含',
  isEmpty: '为空', isNotEmpty: '非空',
  isGreater: '>', isLess: '<',
  isGreaterEqual: '≥', isLessEqual: '≤',
  isOnOrAfter: '≥', isOnOrBefore: '≤',
  isWithIn: '范围',
  hasAnyOf: '含任一', hasAllOf: '全含', isAnyOf: '∈', isNoneOf: '∉',
}

export function formatFilterValue(value) {
  if (value == null) return ''
  if (Array.isArray(value)) return value.join(' / ')
  if (typeof value === 'object') {
    if (value.exactDate) return String(value.exactDate).slice(0, 10)
    return JSON.stringify(value)
  }
  return String(value)
}
