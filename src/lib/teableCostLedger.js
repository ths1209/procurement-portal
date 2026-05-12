/**
 * 成本台账 — 通过后端代理 /t/costLedger/*。
 * 行级权限(admin 看全部 / 其他按 email)在后端完成,前端不再做过滤。
 */

import { api, isApiConfigured } from './api'

export const COST_LEDGER_VIEWS = [
  'viw4NKBSKkxIo1kOrlK',
  'viwkfqG1PMtbCdd2y44',
  'viwY9IggKRWjl0IJq3K',
  'viwfmPtBBkW5N99aDNY',
]
export const DEFAULT_VIEW = COST_LEDGER_VIEWS[0]

export const isCostLedgerConfigured = () => isApiConfigured()

export const F = {
  buyerName:      '采购员名称',
  buyerJobId:     '采购员工号',
  buyerOrg:       '采购组织',
  createdBy:      '创建人',
  permMembers:    '成员权限列',

  checkKey:       '检索值',
  projectName:    '项目名称',
  requestDept:    '需求部门(三级)',
  category1:      '一级品类',
  categoryBig:    '⭐⭐⭐采购品类(大类)',
  projectCreated: '立项时间',
  projectNo:      '立项单号',
  sourceNo:       '结项寻源单号',
  approveTime:    '结项授标审批通过时间',
  grantTime:      '授标时间',
  projectDate:    '立项单创建时间',
  contractNo:     '合同号',
  contractStart:  '合同创建时间',
  contractEnd:    '合同结束时间',
  contractEndMax: '合同最晚结束时间',
  supplier:       '中标供应商名称',

  winAmount:      '中标总金额 CNY',
  winAmountRaw:   '中标总金额(元)',
  currentPrice:   '当前采购价',
  saveAmount:     '降本金额(元)',
  saveRate:       '🚩降本率',
  savingAfter:    '🏁核算后降本金额(基于"532"核算后,本财年降本金额)',
  savingAdjusted: '⭐⭐⭐FY27调整后准确的降本金额(核对后合同未来一年周期降本金额)',
  systemSaving:   '系统降本金额 CNY',
  boardAmount:    '【核对列】该项目降本看板展示金额',
  fy28Est:        '⭐⭐⭐FY28预估降本金额(合同预估FY28一年周期降本金额)',
  fy29Est:        '⭐⭐⭐FY29预估降本金额(合同预估FY29一年周期降本金额)',
  fy27Correct:    '⭐FY27核对后降本金额(2.28口径:项目周期与财年重叠时间加权计算后降本金额)',
  fy28Correct:    '⭐FY28预估降本金额(2.28口径:项目周期与财年重叠时间加权计算后降本金额)',
  fy29Correct:    '⭐FY29预估降本金额(2.28口径:项目周期与财年重叠时间加权计算后降本金额)',

  role:           '⭐在项目中的角色',
  roleReason:     '认为是"主导者"角色的原因说明,做了哪些"主导者"的事(原因、降本方式和举措)',
  saveContribution:'在项目中的降本贡献度',
  saveMeasures:   '⭐⭐⭐具体降本举措',
  saveMethods:    '⭐⭐⭐核心降本方式',
  saveMethod:     '成本核算节约方式',
  priceDesc:      '历史采购价 / 市场平均采购价描述',
  remark:         '其他备注',

  priceAttach:    '【附件】历史采购价 / 市场平均采购价',
  roleAttach:     '业务认可"角色"信息的截图',
  marketAttach:   '市场成本分析数据',
  otherAttach:    '附件',
  quoteAttach:    '报价附件',
}

export const EDITABLE_GROUPS = [
  {
    title: '核心降本信息',
    stars: 3,
    fields: [
      { name: F.categoryBig,    type: 'singleSelect',   stars: 3, label: '采购品类(大类)' },
      { name: F.saveMethods,    type: 'multipleSelect', stars: 3, label: '核心降本方式' },
      { name: F.savingAdjusted, type: 'number',         stars: 3, label: 'FY27 调整后准确降本金额', unit: '元' },
      { name: F.saveMeasures,   type: 'longText',       stars: 3, label: '具体降本举措' },
      { name: F.fy28Est,        type: 'text',           stars: 3, label: 'FY28 预估降本金额', unit: '元' },
      { name: F.fy29Est,        type: 'text',           stars: 3, label: 'FY29 预估降本金额', unit: '元' },
    ],
  },
  {
    title: '角色与加权核对',
    stars: 1,
    fields: [
      { name: F.role,            type: 'singleSelect', stars: 1, label: '在项目中的角色' },
      { name: F.fy27Correct,     type: 'text',         stars: 1, label: 'FY27 核对后降本金额(2.28 口径)', unit: '元' },
      { name: F.fy28Correct,     type: 'text',         stars: 1, label: 'FY28 加权降本金额(2.28 口径)', unit: '元' },
      { name: F.fy29Correct,     type: 'text',         stars: 1, label: 'FY29 加权降本金额(2.28 口径)', unit: '元' },
      { name: F.roleReason,      type: 'longText',     stars: 0, label: '主导角色原因说明' },
      { name: F.saveContribution,type: 'text',         stars: 0, label: '在项目中的降本贡献度' },
    ],
  },
  {
    title: '补充说明',
    stars: 0,
    fields: [
      { name: F.priceDesc, type: 'longText', stars: 0, label: '历史采购价 / 市场平均价描述' },
      { name: F.remark,    type: 'longText', stars: 0, label: '其他备注' },
    ],
  },
]

export const EDITABLE = EDITABLE_GROUPS.flatMap(g => g.fields.map(f => f.name))
export const FIELD_META = Object.fromEntries(
  EDITABLE_GROUPS.flatMap(g => g.fields).map(f => [f.name, f])
)

function normalize(r) {
  return { _id: r.id, fields: r.fields ?? {} }
}

export async function listCostLedger(_profile, viewId = DEFAULT_VIEW) {
  if (!isApiConfigured()) return []
  const data = await api.get('/t/costLedger/records', {
    take: 1000,
    fieldKeyType: 'name',
    viewId: viewId || DEFAULT_VIEW,
  })
  return (data?.records ?? []).map(normalize)
}

let _viewsCache = null
export async function loadViews() {
  if (_viewsCache) return _viewsCache
  if (!isApiConfigured()) return []
  const list = await api.get('/t/costLedger/views')
  const byId = Object.fromEntries((list ?? []).map(v => [v.id, v]))
  const ordered = COST_LEDGER_VIEWS.map(id => byId[id] ? { id, name: byId[id].name } : { id, name: id })
  _viewsCache = ordered
  return ordered
}

let _fieldChoicesCache = null
export async function loadFieldChoices() {
  if (_fieldChoicesCache) return _fieldChoicesCache
  if (!isApiConfigured()) return {}
  const list = await api.get('/t/costLedger/fields')
  const map = {}
  for (const f of list ?? []) {
    if (f.type === 'singleSelect' || f.type === 'multipleSelect') {
      map[f.name] = (f.options?.choices ?? []).map(c => ({ name: c.name, color: c.color }))
    }
  }
  _fieldChoicesCache = map
  return map
}

function castByType(name, v) {
  const meta = FIELD_META[name]
  if (!meta) return v ?? ''
  if (meta.type === 'number') {
    if (v === '' || v === null || v === undefined) return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  if (meta.type === 'multipleSelect') {
    if (Array.isArray(v)) return v.filter(Boolean)
    if (v === '' || v === null || v === undefined) return []
    return [v]
  }
  return v ?? ''
}

export async function updateCostLedger(recordId, patch) {
  const fields = {}
  for (const [k, v] of Object.entries(patch)) {
    if (EDITABLE.includes(k)) fields[k] = castByType(k, v)
  }
  if (!Object.keys(fields).length) return
  await api.patch(`/t/costLedger/records/${recordId}`, {
    fieldKeyType: 'name',
    typecast: true,
    record: { fields },
  })
}

export function getAttachments(record, fieldName) {
  const v = record?.fields?.[fieldName]
  if (!Array.isArray(v)) return []
  return v.map(a => ({ name: a.name, url: a.presignedUrl || a.url, size: a.size, mimetype: a.mimetype }))
}

export function fmtCNY(n) {
  if (n === null || n === undefined || n === '') return '—'
  const num = Number(n)
  if (!Number.isFinite(num)) return String(n)
  if (Math.abs(num) >= 1e8) return (num / 1e8).toFixed(2) + ' 亿'
  if (Math.abs(num) >= 1e4) return (num / 1e4).toFixed(2) + ' 万'
  return num.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
}

export function fmtPct(n) {
  if (n === null || n === undefined || n === '') return '—'
  const num = Number(n)
  if (!Number.isFinite(num)) return String(n)
  const pct = num <= 1 ? num * 100 : num
  return pct.toFixed(1) + '%'
}
