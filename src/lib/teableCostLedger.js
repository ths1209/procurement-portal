/**
 * 成本台账 — Teable 数据层
 * 表结构在 Teable 端已手动维护，此文件仅做查询与部分字段更新，不自动建字段。
 */

const API   = (import.meta.env.VITE_TEABLE_API_BASE ?? '').replace(/\/$/, '')
const TOKEN = import.meta.env.VITE_TEABLE_TOKEN
const TID   = import.meta.env.VITE_TEABLE_COST_LEDGER_TABLE_ID
// 分享视图 viewId：降本金额（公式列）非空 + 采购品类大类可为空（空时在前端显示"未确认"）
const VID   = 'viwJcCBJmpfLU7DclM0'

export const isCostLedgerConfigured = () => !!(TID && TOKEN)

// ── 字段名（与 Teable 侧完全一致） ───────────────────────────────────────────
export const F = {
  // 身份
  buyerName:      '采购员名称',
  buyerJobId:     '采购员工号',
  buyerOrg:       '采购组织',
  createdBy:      '创建人',

  // 项目基础
  checkKey:       '检索值',
  projectName:    '项目名称',
  requestDept:    '需求部门（三级）',
  category1:      '一级品类',
  categoryBig:    '⭐⭐⭐采购品类（大类）',
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

  // 金额与降本
  winAmount:      '中标总金额 CNY',
  winAmountRaw:   '中标总金额（元）',
  currentPrice:   '当前采购价',
  saveAmount:     '降本金额（元）',
  saveRate:       '🚩降本率',
  savingAfter:    '🏁核算后降本金额（基于”532“核算后，本财年降本金额）',
  savingAdjusted: '⭐⭐⭐FY27调整后准确的降本金额（核对后合同未来一年周期降本金额）',
  systemSaving:   '系统降本金额 CNY',
  boardAmount:    '【核对列】该项目降本看板展示金额',
  fy28Est:        '⭐⭐⭐FY28预估降本金额（合同预估FY28一年周期降本金额）',
  fy29Est:        '⭐⭐⭐FY29预估降本金额（合同预估FY29一年周期降本金额）',
  fy27Correct:    '⭐FY27核对后降本金额（2.28口径：项目周期与财年重叠时间加权计算后降本金额）',
  fy28Correct:    '⭐FY28预估降本金额（2.28口径：项目周期与财年重叠时间加权计算后降本金额）',
  fy29Correct:    '⭐FY29预估降本金额（2.28口径：项目周期与财年重叠时间加权计算后降本金额）',

  // 角色与举措
  role:           '⭐在项目中的角色',
  roleReason:     '认为是“主导者”角色的原因说明，做了哪些“主导者”的事(原因、降本方式和举措)',
  saveContribution:'在项目中的降本贡献度',
  saveMeasures:   '⭐⭐⭐具体降本举措',
  saveMethods:    '⭐⭐⭐核心降本方式',
  saveMethod:     '成本核算节约方式',
  priceDesc:      '历史采购价 / 市场平均采购价描述',
  remark:         '其他备注',

  // 附件
  priceAttach:    '【附件】历史采购价 / 市场平均采购价',
  roleAttach:     '业务认可“角色”信息的截图',
  marketAttach:   '市场成本分析数据',
  otherAttach:    '附件',
  quoteAttach:    '报价附件',
}

// 可编辑字段配置：按星级重要性分组，包含类型 / 是否数字 / 多行
// 带 ⭐ 的字段是用户必须填的关键字段
export const EDITABLE_GROUPS = [
  {
    title: '核心降本信息',
    stars: 3,
    fields: [
      { name: F.categoryBig,    type: 'singleSelect',   stars: 3, label: '采购品类（大类）' },
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
      { name: F.fy27Correct,     type: 'text',         stars: 1, label: 'FY27 核对后降本金额（2.28 口径）', unit: '元' },
      { name: F.fy28Correct,     type: 'text',         stars: 1, label: 'FY28 加权降本金额（2.28 口径）', unit: '元' },
      { name: F.fy29Correct,     type: 'text',         stars: 1, label: 'FY29 加权降本金额（2.28 口径）', unit: '元' },
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
    throw new Error(body.message ?? `成本台账 API 错误 ${res.status}`)
  }
  return res.json().catch(() => null)
}

// ── 拉数据 ───────────────────────────────────────────────────────────────────
/**
 * 拉取成本台账数据。普通用户仅返回自己的记录（按工号匹配），管理员拉全部。
 * @param {Object} profile - { jobId, displayName, role }
 */
export async function listCostLedger(profile) {
  if (!TID) return []
  const isAdmin = profile?.role === 'admin'

  // 非管理员必须有工号才能过滤
  if (!isAdmin && !profile?.jobId) return []

  // 用 viewId 让后端应用视图的 filter/sort（FY27 增量降本、降本金额>0、检索值非空）
  let url = `/table/${TID}/record?take=1000&fieldKeyType=name&viewId=${VID}`
  if (!isAdmin) {
    // viewId 之外额外叠加工号过滤
    const filter = {
      conjunction: 'and',
      filterSet: [{ fieldId: F.buyerJobId, operator: 'is', value: String(profile.jobId) }],
    }
    url += `&filter=${encodeURIComponent(JSON.stringify(filter))}`
  }

  const data = await req(url)
  return (data?.records ?? []).map(normalize)
}

function normalize(r) {
  return { _id: r.id, fields: r.fields ?? {} }
}

// ── 读取字段选项（single/multiSelect 专用） ──────────────────────────────────
let _fieldChoicesCache = null
export async function loadFieldChoices() {
  if (_fieldChoicesCache) return _fieldChoicesCache
  if (!TID) return {}
  const list = await req(`/table/${TID}/field`)
  const map = {}
  for (const f of list ?? []) {
    if (f.type === 'singleSelect' || f.type === 'multipleSelect') {
      map[f.name] = (f.options?.choices ?? []).map(c => ({
        name: c.name,
        color: c.color,
      }))
    }
  }
  _fieldChoicesCache = map
  return map
}

// ── 按字段类型规范化待写入值 ─────────────────────────────────────────────────
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
  // text / longText / singleSelect
  return v ?? ''
}

// ── 批量更新（保存整份草稿） ────────────────────────────────────────────────
export async function updateCostLedger(recordId, patch) {
  if (!TID) throw new Error('未配置成本台账表')
  const fields = {}
  for (const [k, v] of Object.entries(patch)) {
    if (EDITABLE.includes(k)) fields[k] = castByType(k, v)
  }
  if (!Object.keys(fields).length) return
  await req(`/table/${TID}/record/${recordId}`, {
    method: 'PATCH',
    body: JSON.stringify({ fieldKeyType: 'name', typecast: true, record: { fields } }),
  })
}

// ── 工具函数：取附件列表 ─────────────────────────────────────────────────────
export function getAttachments(record, fieldName) {
  const v = record?.fields?.[fieldName]
  if (!Array.isArray(v)) return []
  return v.map(a => ({
    name: a.name,
    url:  a.presignedUrl || a.url,
    size: a.size,
    mimetype: a.mimetype,
  }))
}

// ── 金额格式化 ───────────────────────────────────────────────────────────────
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
