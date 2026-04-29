/**
 * 成本台账填报指引
 * 将 MD 里的填写要求沉淀成结构化数据，供填报模式 UI 消费
 * key = 字段关键字（用于 includes 匹配 Teable 字段名，后期字段名微调也能匹配）
 */

export const TIER = {
  CORE:     { id: 'core',     label: '核心必填', stars: '⭐⭐⭐', color: '#EF4444', bg: 'rgba(239,68,68,0.08)' },
  REQUIRED: { id: 'required', label: '2.28口径', stars: '⭐',     color: '#F59E0B', bg: 'rgba(245,158,11,0.08)' },
  OPTIONAL: { id: 'optional', label: '选填',     stars: '',      color: '#64748B', bg: 'rgba(100,116,139,0.08)' },
}

/**
 * 指引规则 —— 按关键字匹配 Teable 字段名
 * 顺序即展示顺序
 */
const GUIDES = [
  {
    match: ['采购品类'],
    tier: 'core',
    hint: '项目一级品类之上，基于项目实际情况填写。',
    note: '仅采购经理可变更选项枚举值',
  },
  {
    match: ['调整后', '降本金额'],
    tier: 'core',
    hint: '项目未来一年周期的降本金额。',
    rules: [
      '签订 1 年周期合同 → 金额全量填写',
      '签订 3 年周期合同 → 金额 / 3',
    ],
    referenceField: '降本金额 CNY',
    note: '若系统降本金额已准确，本列可暂不填写；等季度/年度确认后更新。未填写将使用系统降本金额做过程性展示。',
  },
  {
    match: ['FY28', '预估降本'],
    tier: 'core',
    hint: '合同预估 FY28 一年周期降本金额。',
    rules: ['填写逻辑与"调整后降本金额"一致，关注统计周期 (FY28) 是否需进行一年周期降本额统计。'],
  },
  {
    match: ['FY29', '预估降本'],
    tier: 'core',
    hint: '合同预估 FY29 一年周期降本金额。',
    rules: ['填写逻辑与"调整后降本金额"一致，关注统计周期 (FY29) 是否需进行一年周期降本额统计。'],
  },
  {
    match: ['核心降本方式'],
    tier: 'core',
    hint: '采购降本的机会点，选择最主要的一种方式。',
    note: '可按需新增选项',
  },
  {
    match: ['具体降本举措'],
    tier: 'core',
    hint: '降本的具体举措，简单描述如何实现降本、使用了哪些方式方法或工具。',
  },

  {
    match: ['FY27', '核对后降本'],
    tier: 'required',
    hint: '本财年 (FY27) 降本金额，2.28 口径：合同在本财年内的实际有效时间占比加权。',
    formula: '本财年降本金额 = 一年期降本 × (min(合同结束, 财年结束) − max(合同生效, 财年开始)) / (财年结束 − 财年开始)',
    note: '跨年度项目需按合同与财年重叠区间加权核算',
  },
  {
    match: ['FY28', '核对后降本'],
    tier: 'required',
    hint: 'FY28 口径核对后降本，按合同与 FY28 重叠情况加权。',
    formula: '同 FY27 公式，替换为 FY28 起止',
  },
  {
    match: ['FY29', '核对后降本'],
    tier: 'required',
    hint: 'FY29 口径核对后降本，按合同与 FY29 重叠情况加权。',
    formula: '同 FY27 公式，替换为 FY29 起止',
  },

  {
    match: ['在项目中的角色'],
    tier: 'optional',
    hint: '依据项目降本角色填写，填写后会在台账按角色分组。',
  },
  {
    match: ['市场成本分析'],
    tier: 'optional',
    hint: '针对市场成本做简要分析。',
  },
  {
    match: ['历史采购价', '描述'],
    tier: 'optional',
    hint: '项目的历史 / 市场采购价描述。',
    note: '已配置 AI 功能，可通过附件 AI 提取自动分析。AI 分析内容会覆盖原有填写内容。',
  },
  {
    match: ['历史采购价', '附件'],
    tier: 'optional',
    hint: '项目历史 / 市场采购价相关附件，可为历史合同报价单或其他支撑性材料。',
  },
  {
    match: ['主导者'],
    tier: 'optional',
    hint: '若角色选择"主导者"，填写支撑性描述。',
  },
  {
    match: ['业务认可', '角色', '截图'],
    tier: 'optional',
    hint: '上传业务认可项目角色的支撑性附件。',
  },
  {
    match: ['其他备注'],
    tier: 'optional',
    hint: '项目的其他特殊情况。',
  },
]

/** 返回 Teable 字段名对应的指引规则，未命中返回 null */
export function guideFor(fieldName) {
  if (!fieldName) return null
  for (const g of GUIDES) {
    if (g.match.every(k => fieldName.includes(k))) return g
  }
  return null
}

/**
 * 按 tier 分组 part3 需填写字段，剩余（未命中指引）归为 part1 系统字段
 * 输入：Teable 的 columns 数组
 */
export function splitFieldsByTier(columns) {
  const groups = { core: [], required: [], optional: [], system: [] }
  for (const col of columns) {
    const g = guideFor(col.name)
    if (g) groups[g.tier].push({ col, guide: g })
    else   groups.system.push({ col, guide: null })
  }
  return groups
}

/** 判断字段是否已填 */
export function isFilled(col, value) {
  if (value == null || value === '') return false
  if (Array.isArray(value) && value.length === 0) return false
  if (typeof value === 'number' && value === 0 && /降本/.test(col.name)) return false
  return true
}

/** 计算某分组的完成度 */
export function tierProgress(fieldsWithGuide, record) {
  const total = fieldsWithGuide.length
  let filled = 0
  for (const { col } of fieldsWithGuide) {
    if (isFilled(col, record.fields?.[col.name])) filled++
  }
  return { filled, total }
}

/** 时间要求（底部小提示） */
export const TIME_REQUIREMENTS = [
  { icon: '📆', label: '周度',   text: '授标在本周的单据，周五 18:00 前完成金额确认填报' },
  { icon: '📊', label: '季度',   text: '每季度结束前完成本季度降本数据核对' },
  { icon: '🏁', label: '年度',   text: '财年结束前完成年度降本数据终盘' },
  { icon: '🔄', label: '数据同步', text: 'T+1 凌晨同步，当日授标数据次日才会出现' },
]
