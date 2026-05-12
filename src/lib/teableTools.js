/**
 * 百宝箱工具表 — 通过后端代理 /t/tools/*。
 */

import { api, isApiConfigured, getToken } from './api'

const BASE = (import.meta.env.VITE_API_BASE ?? import.meta.env.VITE_SSO_WORKER_BASE ?? '').replace(/\/$/, '')

export const FT = {
  name:       '工具名称',
  icon:       '图标',
  desc:       '描述',
  group:      '分组',
  attachment: '附件',
  fileUrl:    '文件链接',
  fileName:   '文件名',
  downloads:  '下载量',
  uploadedBy: '上传人',
  toolType:   '类型',
  toolUrl:    '工具链接',
  status:     '审核状态',
}

let _attachmentFieldId = null

function normTool(r) {
  const f = r.fields ?? {}
  const atts = Array.isArray(f[FT.attachment]) ? f[FT.attachment] : []
  const att  = atts[0] ?? null
  return {
    _id:        r.id,
    name:       f[FT.name]       ?? '',
    icon:       f[FT.icon]       ?? '📎',
    desc:       f[FT.desc]       ?? '',
    group:      f[FT.group]      ?? '采购部通用',
    fileUrl:    att?.presignedUrl ?? f[FT.fileUrl] ?? null,
    fileName:   att?.name        ?? f[FT.fileName] ?? null,
    fileSize:   att?.size        ?? null,
    downloads:  f[FT.downloads]  ?? 0,
    uploadedBy: f[FT.uploadedBy] ?? '',
    hasFile:    !!att,
    toolType:   f[FT.toolType]  ?? '文件工具',
    url:        f[FT.toolUrl]   ?? '',
    status:     f[FT.status]    ?? 'active',
  }
}

function clean(fields) {
  return Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== null && v !== undefined && v !== ''))
}

export const isToolsConfigured = () => isApiConfigured()

/** 建字段已移到后端/Teable 端手动配置,前端 no-op */
export async function ensureToolsFields() { /* no-op */ }

async function getAttachmentFieldId() {
  if (_attachmentFieldId) return _attachmentFieldId
  const fields = await api.get('/t/tools/fields')
  const f = fields.find(x => x.name === FT.attachment && x.type === 'attachment')
  if (!f) throw new Error('tools 表缺少 attachment 字段,请在 Teable 端先建好')
  _attachmentFieldId = f.id
  return _attachmentFieldId
}

export async function listFileTools() {
  const data = await api.get('/t/tools/records', { take: 500, fieldKeyType: 'name' })
  return (data?.records ?? []).map(normTool).filter(t => !t.toolType || t.toolType === '文件工具')
}

export async function listAllTools() {
  const data = await api.get('/t/tools/records', { take: 500, fieldKeyType: 'name' })
  const all = (data?.records ?? []).map(normTool)
  const active = all.filter(t => t.status === 'active' || t.status === '')
  return {
    fileTools: active.filter(t => !t.toolType || t.toolType === '文件工具'),
    urlTools:  active.filter(t => t.toolType === '链接工具'),
    dashItems: active.filter(t => t.toolType === '数据看板'),
    pending:   all.filter(t => t.status === 'pending'),
  }
}

export async function approveTool(recordId, approved) {
  await api.patch('/t/tools/records', {
    records: [{ id: recordId, fields: { [FT.status]: approved ? 'active' : 'rejected' } }],
  })
}

export async function createUrlTool({ name, icon, desc, group, url }, addedBy) {
  const fields = clean({
    [FT.name]:     name,
    [FT.icon]:     icon  || '🔗',
    [FT.desc]:     desc  || '',
    [FT.group]:    group || '采购部通用',
    [FT.toolType]: '链接工具',
    [FT.toolUrl]:  url   || '',
    [FT.uploadedBy]: addedBy || '',
    [FT.status]:   'pending',
  })
  const data = await api.post('/t/tools/records', { fieldKeyType: 'name', typecast: true, records: [{ fields }] })
  return normTool(data?.records?.[0] ?? {})
}

export async function createDashItem({ name, icon, desc, url }, addedBy) {
  const fields = clean({
    [FT.name]:     name,
    [FT.icon]:     icon || '📊',
    [FT.desc]:     desc || '',
    [FT.toolType]: '数据看板',
    [FT.toolUrl]:  url  || '',
    [FT.uploadedBy]: addedBy || '',
    [FT.status]:   'pending',
  })
  const data = await api.post('/t/tools/records', { fieldKeyType: 'name', typecast: true, records: [{ fields }] })
  return normTool(data?.records?.[0] ?? {})
}

async function uploadToRecord(recordId, file) {
  const fieldId = await getAttachmentFieldId()
  const form = new FormData()
  form.append('file', file)
  const token = getToken()
  const res = await fetch(`${BASE}/t/tools/records/${recordId}/attachment/${fieldId}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  })
  if (!res.ok) {
    const b = await res.json().catch(() => ({}))
    throw new Error(b.errmsg ?? b.message ?? `上传失败 ${res.status}`)
  }
  const data = await res.json()
  const atts = data.fields?.[fieldId] ?? []
  return atts[0] ?? null
}

export async function createFileTool({ name, icon, desc, group, fileUrl, fileName, file }, uploadedBy) {
  const fields = clean({
    [FT.name]:       name,
    [FT.icon]:       icon  || '📎',
    [FT.desc]:       desc  || '',
    [FT.group]:      group || '采购部通用',
    [FT.fileUrl]:    fileUrl  || '',
    [FT.fileName]:   fileName || '',
    [FT.downloads]:  0,
    [FT.uploadedBy]: uploadedBy || '',
    [FT.status]:     'pending',
  })
  const data = await api.post('/t/tools/records', { fieldKeyType: 'name', typecast: true, records: [{ fields }] })
  const tool = normTool(data?.records?.[0] ?? {})

  if (file) {
    try {
      const att = await uploadToRecord(tool._id, file)
      if (att?.presignedUrl) {
        tool.fileUrl  = att.presignedUrl
        tool.fileName = att.name
        tool.fileSize = att.size
        tool.hasFile  = true
      }
    } catch (e) {
      console.warn('[tools] 附件上传失败,已保存记录(无附件):', e.message)
    }
  }

  return tool
}

export async function deleteFileTool(recordId) {
  await api.del(`/t/tools/records/${recordId}`)
}

export async function trackDownload(recordId, currentDownloads) {
  try {
    await api.patch('/t/tools/records', {
      records: [{ id: recordId, fields: { [FT.downloads]: (currentDownloads || 0) + 1 } }],
    })
  } catch (e) {
    console.warn('[tools] 更新下载量失败:', e.message)
  }
}
