const API   = (import.meta.env.VITE_TEABLE_API_BASE ?? 'https://app.teable.io').replace(/\/$/, '')
const TOKEN = import.meta.env.VITE_TEABLE_TOKEN
const TID   = import.meta.env.VITE_TEABLE_TOOLS_TABLE_ID

export const FT = {
  name:       '工具名称',
  icon:       '图标',
  desc:       '描述',
  group:      '分组',
  attachment: '附件',        // attachment 类型字段，存实际文件
  fileUrl:    '文件链接',    // 备用：外部链接
  fileName:   '文件名',
  downloads:  '下载量',
  uploadedBy: '上传人',
}

const FIELD_DEFS = [
  { name: FT.icon,       type: 'singleLineText' },
  { name: FT.desc,       type: 'singleLineText' },
  { name: FT.group,      type: 'singleSelect', options: { choices: [
    { name: '采购部通用' }, { name: '运营分析组' },
    { name: '稽核组' },    { name: '支付类合作社管理组' },
  ]}},
  { name: FT.attachment, type: 'attachment' },
  { name: FT.fileUrl,    type: 'singleLineText' },
  { name: FT.fileName,   type: 'singleLineText' },
  { name: FT.downloads,  type: 'number', options: { precision: 0 } },
  { name: FT.uploadedBy, type: 'singleLineText' },
]

// 缓存附件字段 ID（避免每次上传都查询字段列表）
let _attachmentFieldId = null

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

function normTool(r) {
  const f = r.fields ?? {}
  // 优先用 attachment 字段里的 presignedUrl，其次用文件链接字段
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
  }
}

function clean(fields) {
  return Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== null && v !== undefined && v !== ''))
}

export const isToolsConfigured = () => !!(TID && TOKEN)

export async function ensureToolsFields() {
  const existing = await req(`/table/${TID}/field`)
  const existingNames = new Set(existing.map(f => f.name))
  for (const def of FIELD_DEFS) {
    if (!existingNames.has(def.name)) {
      try {
        await req(`/table/${TID}/field`, { method: 'POST', body: JSON.stringify(def) })
      } catch (e) {
        console.warn(`[Teable] 创建字段 "${def.name}" 失败:`, e.message)
      }
    }
  }
  _attachmentFieldId = null  // 重置缓存
}

async function getAttachmentFieldId() {
  if (_attachmentFieldId) return _attachmentFieldId
  const fields = await req(`/table/${TID}/field`)
  const f = fields.find(x => x.name === FT.attachment && x.type === 'attachment')
  if (!f) {
    // 自动创建
    const created = await req(`/table/${TID}/field`, { method: 'POST', body: JSON.stringify({ name: FT.attachment, type: 'attachment' }) })
    _attachmentFieldId = created.id
  } else {
    _attachmentFieldId = f.id
  }
  return _attachmentFieldId
}

export async function listFileTools() {
  if (!TID) return []
  const data = await req(`/table/${TID}/record?take=500&fieldKeyType=name`)
  return (data.records ?? []).map(normTool)
}

/** 上传文件到指定记录的附件字段 */
async function uploadToRecord(recordId, file) {
  const fieldId = await getAttachmentFieldId()
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${API}/api/table/${TID}/record/${recordId}/${fieldId}/uploadAttachment`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}` },
    body: form,
  })
  if (!res.ok) {
    const b = await res.json().catch(() => ({}))
    throw new Error(b.message ?? `上传失败 ${res.status}`)
  }
  const data = await res.json()
  // 响应是更新后的记录，attachment 字段是数组
  const atts = data.fields?.[fieldId] ?? []
  return atts[0] ?? null  // { presignedUrl, name, size, mimetype, ... }
}

/** 创建文件工具（支持直接上传文件 或 粘贴外链） */
export async function createFileTool({ name, icon, desc, group, fileUrl, fileName, file }, uploadedBy) {
  if (!TID) throw new Error('未配置工具表 VITE_TEABLE_TOOLS_TABLE_ID')

  const fields = clean({
    [FT.name]:       name,
    [FT.icon]:       icon  || '📎',
    [FT.desc]:       desc  || '',
    [FT.group]:      group || '采购部通用',
    [FT.fileUrl]:    fileUrl  || '',
    [FT.fileName]:   fileName || '',
    [FT.downloads]:  0,
    [FT.uploadedBy]: uploadedBy || '',
  })

  let data
  try {
    data = await req(`/table/${TID}/record`, { method: 'POST', body: JSON.stringify({ records: [{ fields }] }) })
  } catch (e) {
    if (e.message?.includes('not found')) {
      await ensureToolsFields()
      data = await req(`/table/${TID}/record`, { method: 'POST', body: JSON.stringify({ records: [{ fields }] }) })
    } else { throw e }
  }

  const tool = normTool(data.records?.[0])

  // 如果传入了 file 对象，上传到 Teable 附件字段
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
      console.warn('[Teable] 附件上传失败，已保存记录（无附件）:', e.message)
    }
  }

  return tool
}

export async function deleteFileTool(recordId) {
  if (!TID) throw new Error('未配置工具表')
  await req(`/table/${TID}/record/${recordId}`, { method: 'DELETE' })
}

export async function trackDownload(recordId, currentDownloads) {
  if (!TID) return
  try {
    await req(`/table/${TID}/record`, {
      method: 'PATCH',
      body: JSON.stringify({ records: [{ id: recordId, fields: { [FT.downloads]: (currentDownloads || 0) + 1 } }] }),
    })
  } catch (e) {
    console.warn('[Teable] 更新下载量失败:', e.message)
  }
}
