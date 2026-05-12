import { api, isApiConfigured } from './api'

export const C = {
  seq:        '序号',
  question:   '咨询和受理问题(Question)',
  answer:     '咨询建议和反馈(Answer)',
  qType:      '问题类型',
  qStage:     '问题阶段',
  contact:    '对接人',
  dept:       '对接部门',
  handler:    '处理人',
  acceptDate: '受理日期',
  solveDate:  '解决日期',
  status:     '事项状态',
  month:      '受理月份',
  tags:       '标签',
}

export const Q_TYPE_OPTS = [
  '控制建设', '执行优化', '立项策略咨询', '执行合规咨询', '不合规采购事项咨询',
  '供应商管理咨询', '供应商系统咨询', '供应商资质咨询', '供应商评估咨询', '供应商对账咨询',
  '授权管理咨询', '自采管理咨询', '知客垂询支持', '电商运营支持',
  '采购系统咨询', '合同管理支持', '费控管理支持',
  '高职流程审批咨询', '目录商品上架咨询', '询证函支持', '需求管理咨询',
  '数据咨询',
]

export const Q_STAGE_OPTS = [
  '制度及系统建设', '需求环节', '寻源环节', '合同环节', '订单环节',
  '验收环节', '付款结算',
  '供应商系统注册环节', '供应商系统认证环节', '供应商系统退出环节',
  '供应商立项审批环节', '供应商评估环节', '供应商对账环节',
  '授权前咨询环节', '授权提交环节', '授权后指引环节',
  '自采要求答疑', '知客垂询日常答疑', '数据日常对接答疑',
  '京东平台使用', '得力平台使用',
  '采购系统权限管理', '采购系统操作指引',
  '合同启用流程', '合同履约咨询', '预付款项咨询',
  '在途未指付款问题', '未完结订单操作指引',
  '目录上架步骤指引', '询证函流程审批', '需求订单调差环节',
]

export const STATUS_OPTS = ['OPEN', 'IN PROCESS', 'PENDING', 'CLOSE']

export const Q_TYPE_CFG = {
  '控制建设':         { color: '#8B5CF6', bg: 'rgba(139,92,246,0.1)'  },
  '执行优化':         { color: '#6366F1', bg: 'rgba(99,102,241,0.1)'  },
  '立项策略咨询':     { color: '#0EA5E9', bg: 'rgba(14,165,233,0.1)'  },
  '执行合规咨询':     { color: '#6366F1', bg: 'rgba(99,102,241,0.1)'  },
  '不合规采购事项咨询': { color: '#EF4444', bg: 'rgba(239,68,68,0.1)' },
  '供应商管理咨询':   { color: '#0EA5E9', bg: 'rgba(14,165,233,0.1)'  },
  '供应商系统咨询':   { color: '#10B981', bg: 'rgba(16,185,129,0.1)'  },
  '供应商资质咨询':   { color: '#14B8A6', bg: 'rgba(20,184,166,0.1)'  },
  '供应商评估咨询':   { color: '#06B6D4', bg: 'rgba(6,182,212,0.1)'   },
  '供应商对账咨询':   { color: '#3B82F6', bg: 'rgba(59,130,246,0.1)'  },
  '授权管理咨询':     { color: '#F59E0B', bg: 'rgba(245,158,11,0.1)'  },
  '自采管理咨询':     { color: '#F97316', bg: 'rgba(249,115,22,0.1)'  },
  '知客垂询支持':     { color: '#EC4899', bg: 'rgba(236,72,153,0.1)'  },
  '电商运营支持':     { color: '#E11D48', bg: 'rgba(225,29,72,0.1)'   },
  '采购系统咨询':     { color: '#10B981', bg: 'rgba(16,185,129,0.1)'  },
  '合同管理支持':     { color: '#6366F1', bg: 'rgba(99,102,241,0.1)'  },
  '费控管理支持':     { color: '#8B5CF6', bg: 'rgba(139,92,246,0.1)'  },
  '高职流程审批咨询': { color: '#0EA5E9', bg: 'rgba(14,165,233,0.1)'  },
  '目录商品上架咨询': { color: '#10B981', bg: 'rgba(16,185,129,0.1)'  },
  '询证函支持':       { color: '#F59E0B', bg: 'rgba(245,158,11,0.1)'  },
  '需求管理咨询':     { color: '#6366F1', bg: 'rgba(99,102,241,0.1)'  },
  '数据咨询':         { color: '#06B6D4', bg: 'rgba(6,182,212,0.1)'   },
}

function norm(r) {
  const f = r.fields ?? {}
  return {
    _id:        r.id,
    seq:        f[C.seq]        ?? '',
    question:   f[C.question]   ?? '',
    answer:     f[C.answer]     ?? '',
    qType:      f[C.qType]      ?? '',
    qStage:     f[C.qStage]     ?? '',
    contact:    f[C.contact]    ?? '',
    dept:       f[C.dept]       ?? '',
    handler:    f[C.handler]    ?? '',
    acceptDate: f[C.acceptDate] ?? '',
    solveDate:  f[C.solveDate]  ?? '',
    status:     f[C.status]     ?? 'OPEN',
    month:      f[C.month]      ?? '',
    tags:       f[C.tags]       ?? '',
  }
}

function clean(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== null && v !== undefined && v !== ''))
}

export function isConfigured() { return isApiConfigured() }

export async function listConsulting() {
  const PAGE = 500
  let skip = 0
  let all = []
  while (true) {
    const data = await api.get('/t/consulting/records', { take: PAGE, skip, fieldKeyType: 'name' })
    const records = data?.records ?? []
    all = all.concat(records.map(norm))
    if (records.length < PAGE) break
    skip += PAGE
  }
  return all.sort((a, b) => b.acceptDate.localeCompare(a.acceptDate))
}

export async function createRecord(fields) {
  return api.post('/t/consulting/records', {
    fieldKeyType: 'name',
    records: [{ fields: clean(fields) }],
  })
}

export async function updateRecord(recordId, fields) {
  return api.patch('/t/consulting/records', {
    fieldKeyType: 'name',
    records: [{ id: recordId, fields: clean(fields) }],
  })
}

export async function deleteRecord(recordId) {
  return api.del(`/t/consulting/records/${recordId}`)
}
