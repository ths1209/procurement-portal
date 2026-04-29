/**
 * 自动在 Teable 中创建 OKR 进度报告表
 * 运行：node create-okr-table.js
 */

const API   = 'https://yach-teable.zhiyinlou.com'
const TOKEN = 'teable_accjMXNkVAyeF4haDkI_G71KKPsM85G5d2KKRxVE7wZYOBlx0ddnDFqa7b2IaTA='
// 通过现有的用户表来定位所在的 base
const KNOWN_TABLE = 'tblWmSldyOQUmZ732N7'

const HEADERS = {
  Authorization: `Bearer ${TOKEN}`,
  'Content-Type': 'application/json',
}

async function req(path, init = {}) {
  const res = await fetch(`${API}/api${path}`, { ...init, headers: { ...HEADERS, ...(init.headers ?? {}) } })
  const text = await res.text()
  if (!res.ok) throw new Error(`${res.status} ${path} — ${text.slice(0, 200)}`)
  return text ? JSON.parse(text) : null
}

async function main() {
  console.log('🔍 查找 OKR 表所在的 base...')

  // 1. 列出所有 spaces
  const spaces = await req('/space')
  const spaceList = Array.isArray(spaces) ? spaces : (spaces?.spaces ?? spaces?.data ?? [])
  console.log(`   找到 ${spaceList.length} 个 space`)

  let targetBaseId = null

  // 2. 遍历每个 space 的 base，找包含已知表的那个
  for (const space of spaceList) {
    const sid = space.id ?? space.spaceId
    let bases = []
    try {
      const r = await req(`/space/${sid}/base`)
      bases = Array.isArray(r) ? r : (r?.bases ?? r?.data ?? [])
    } catch { continue }

    for (const base of bases) {
      const bid = base.id ?? base.baseId
      try {
        const r = await req(`/base/${bid}/table`)
        const tables = Array.isArray(r) ? r : (r?.tables ?? r?.data ?? [])
        if (tables.some(t => (t.id ?? t.tableId) === KNOWN_TABLE)) {
          console.log(`   ✅ 找到目标 base: ${bid} (${base.name ?? bid})`)
          targetBaseId = bid
          break
        }
      } catch { continue }
    }
    if (targetBaseId) break
  }

  if (!targetBaseId) {
    // 兜底：直接从已知表获取 baseId
    try {
      const t = await req(`/table/${KNOWN_TABLE}`)
      targetBaseId = t?.baseId ?? t?.base?.id
      if (targetBaseId) console.log(`   ✅ 从表元信息获取 base: ${targetBaseId}`)
    } catch {}
  }

  if (!targetBaseId) {
    console.error('❌ 未能定位 base，请手动指定 baseId')
    process.exit(1)
  }

  // 3. 创建 OKR 表
  console.log('\n📋 创建 OKR 进度报告表...')
  const createRes = await req(`/base/${targetBaseId}/table`, {
    method: 'POST',
    body: JSON.stringify({
      name: 'OKR进度报告',
    }),
  })
  const tableId = createRes?.id ?? createRes?.tableId ?? createRes?.data?.id
  if (!tableId) {
    console.error('❌ 创建表失败，响应：', createRes)
    process.exit(1)
  }
  console.log(`   ✅ 表已创建，ID: ${tableId}`)

  // 4. 创建字段
  console.log('\n🔧 创建字段...')
  const fields = [
    { name: 'recordType', type: 'singleLineText' },
    { name: 'typeKey',    type: 'singleLineText' },
    { name: 'group',      type: 'singleLineText' },
    { name: 'payload',    type: 'longText'       },
    { name: 'updatedBy',  type: 'singleLineText' },
    { name: 'updatedAt',  type: 'singleLineText' },
  ]

  for (const f of fields) {
    try {
      await req(`/table/${tableId}/field`, { method: 'POST', body: JSON.stringify(f) })
      console.log(`   ✅ 字段: ${f.name}`)
    } catch (e) {
      console.log(`   ⚠️  字段 ${f.name} 创建失败（可能已存在）: ${e.message}`)
    }
  }

  // 5. 更新 .env.local
  console.log('\n📝 更新 .env.local...')
  const fs = await import('fs')
  const envPath = '.env.local'
  let env = fs.readFileSync(envPath, 'utf-8')
  env = env.replace(/^VITE_TEABLE_OKR_TABLE_ID=.*$/m, `VITE_TEABLE_OKR_TABLE_ID=${tableId}`)
  fs.writeFileSync(envPath, env)
  console.log(`   ✅ .env.local 已更新`)

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ 完成！

  OKR 表 ID：${tableId}

  已自动写入 .env.local
  还需要在 GitHub Secrets 中添加：
  VITE_TEABLE_OKR_TABLE_ID = ${tableId}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`)
}

main().catch(e => {
  console.error('❌ 出错：', e.message)
  process.exit(1)
})
