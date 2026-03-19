// 导航卡片配置 —— 在此处添加/修改工具链接
// color 支持: blue | green | purple | orange | teal | rose

export const navCards = [
  {
    id: 'ai-tools',
    title: 'AI 产出工具',
    description: '集成主流 AI 助手，快速生成采购文案、分析报告与供应商评估',
    icon: '🤖',
    color: 'blue',
    links: [
      { label: 'Claude',   url: 'https://claude.ai' },
      { label: 'ChatGPT',  url: 'https://chat.openai.com' },
      { label: 'Gemini',   url: 'https://gemini.google.com' },
    ],
  },
  {
    id: 'project-tracker',
    title: '项目进度表',
    description: '实时跟踪采购项目状态、里程碑节点与负责人分配',
    icon: '📋',
    color: 'green',
    links: [
      { label: '主进度表',     url: '#' },
      { label: 'Q3 项目跟踪', url: '#' },
    ],
  },
  {
    id: 'dashboards',
    title: '数据看板',
    description: '采购金额、供应商绩效、库存周转率等核心指标可视化',
    icon: '📊',
    color: 'purple',
    links: [
      { label: '采购总览',   url: '#' },
      { label: '供应商分析', url: '#' },
      { label: '成本分析',   url: '#' },
    ],
  },
  {
    id: 'doc-center',
    title: '文件管理中心',
    description: '合同模板、询价单、验收报告等采购文件集中归档',
    icon: '📁',
    color: 'orange',
    links: [
      { label: '合同模板库', url: '#' },
      { label: '表单下载',   url: '#' },
    ],
  },
  {
    id: 'supplier',
    title: '供应商管理',
    description: '供应商档案、资质审核记录与评分体系',
    icon: '🏭',
    color: 'teal',
    links: [
      { label: '供应商名录', url: '#' },
      { label: '审核记录',   url: '#' },
    ],
  },
  {
    id: 'internal',
    title: '内部协作',
    description: '团队公告、会议纪要、培训资料等内部资源',
    icon: '💬',
    color: 'rose',
    links: [
      { label: '团队公告',   url: '#' },
      { label: '知识库',     url: '#' },
    ],
  },
]

export const colorMap = {
  blue:   { bg: 'bg-blue-50',   icon: 'bg-blue-100 text-blue-600',   btn: 'text-blue-600 hover:bg-blue-50',   border: 'border-blue-100' },
  green:  { bg: 'bg-green-50',  icon: 'bg-green-100 text-green-600', btn: 'text-green-600 hover:bg-green-50', border: 'border-green-100' },
  purple: { bg: 'bg-purple-50', icon: 'bg-purple-100 text-purple-600',btn: 'text-purple-600 hover:bg-purple-50',border: 'border-purple-100' },
  orange: { bg: 'bg-orange-50', icon: 'bg-orange-100 text-orange-600',btn: 'text-orange-600 hover:bg-orange-50',border: 'border-orange-100' },
  teal:   { bg: 'bg-teal-50',   icon: 'bg-teal-100 text-teal-600',   btn: 'text-teal-600 hover:bg-teal-50',   border: 'border-teal-100' },
  rose:   { bg: 'bg-rose-50',   icon: 'bg-rose-100 text-rose-600',   btn: 'text-rose-600 hover:bg-rose-50',   border: 'border-rose-100' },
}
