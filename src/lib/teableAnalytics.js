/**
 * 网站访问统计 — 通过后端代理 /t/analytics/*。
 * API 未配置时降级 localStorage(仅本机可见)。
 */

import { api, isApiConfigured } from './api'

const LS_KEY = 'pp_analytics'

export const PAGE_NAMES = {
  '/dashboard':  '百宝箱',
  '/ai-wishes':  'AI需求池',
  '/okr-report': 'OKR进度报告',
  '/projects':   '项目进度',
  '/reviews':    '百万项目评审',
  '/consulting': '咨询赋能台账',
  '/admin':      '用户管理',
}

function today() { return new Date().toISOString().slice(0, 10) }

export async function trackVisit({ userId, displayName, page }) {
  const pageName = PAGE_NAMES[page] ?? page
  const date = today()
  const visitedAt = new Date().toISOString()

  if (isApiConfigured()) {
    api.post('/t/analytics/records', {
      fieldKeyType: 'name',
      records: [{ fields: { 用户ID: userId, 姓名: displayName, 页面: pageName, 日期: date, 访问时间: visitedAt } }],
    }).catch(() => {})
    return
  }

  try {
    const raw = localStorage.getItem(LS_KEY)
    const store = raw ? JSON.parse(raw) : {}
    if (!store[date]) store[date] = { pv: 0, uvSet: [], pages: {} }
    store[date].pv++
    if (!store[date].uvSet.includes(userId)) store[date].uvSet.push(userId)
    store[date].pages[pageName] = (store[date].pages[pageName] ?? 0) + 1
    const keys = Object.keys(store).sort()
    if (keys.length > 90) delete store[keys[0]]
    localStorage.setItem(LS_KEY, JSON.stringify(store))
  } catch {}
}

export async function loadAnalytics() {
  if (isApiConfigured()) return loadFromApi()
  return loadFromLocalStorage()
}

async function loadFromApi() {
  const PAGE = 500
  let skip = 0
  let all = []
  try {
    while (true) {
      const data = await api.get('/t/analytics/records', { take: PAGE, skip, fieldKeyType: 'name' })
      const records = data?.records ?? []
      all = all.concat(records.map(r => ({
        userId:    r.fields['用户ID'] ?? '',
        name:      r.fields['姓名'] ?? '',
        page:      r.fields['页面'] ?? '',
        date:      r.fields['日期'] ?? '',
        visitedAt: r.fields['访问时间'] ?? '',
      })))
      if (records.length < PAGE) break
      skip += PAGE
    }
  } catch (e) {
    console.warn('[analytics] 拉取失败:', e.message)
  }
  return buildStats(all)
}

function loadFromLocalStorage() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    const store = raw ? JSON.parse(raw) : {}
    const all = []
    for (const [date, d] of Object.entries(store)) {
      d.uvSet?.forEach(uid => {
        all.push({ userId: uid, name: uid, page: '', date, visitedAt: date })
      })
      for (const [page, cnt] of Object.entries(d.pages ?? {})) {
        for (let i = 0; i < cnt; i++) {
          all.push({ userId: '', name: '', page, date, visitedAt: date })
        }
      }
    }
    return buildStats(all)
  } catch {
    return buildStats([])
  }
}

function buildStats(all) {
  const todayStr = today()
  const cutoff30 = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10)

  // 近 30 天(用于趋势图 + 今日/本月卡片)
  const byDate = {}
  // 全量(用于自定义日期筛选),按需扩展时间窗口
  const byDateAll = {}
  for (const r of all) {
    if (!r.date) continue
    if (!byDateAll[r.date]) byDateAll[r.date] = { pv: 0, uvSet: new Set() }
    byDateAll[r.date].pv++
    if (r.userId) byDateAll[r.date].uvSet.add(r.userId)

    if (r.date < cutoff30) continue
    if (!byDate[r.date]) byDate[r.date] = { pv: 0, uvSet: new Set() }
    byDate[r.date].pv++
    if (r.userId) byDate[r.date].uvSet.add(r.userId)
  }

  const trend = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10)
    const entry = byDate[d]
    trend.push({
      date: d,
      label: `${+d.slice(5, 7)}/${+d.slice(8, 10)}`,
      pv: entry?.pv ?? 0,
      uv: entry?.uvSet?.size ?? 0,
    })
  }

  const pageMap = {}
  for (const r of all) {
    if (!r.page) continue
    pageMap[r.page] = (pageMap[r.page] ?? 0) + 1
  }
  const pageRank = Object.entries(pageMap)
    .sort(([, a], [, b]) => b - a)
    .map(([page, pv]) => ({ page, pv }))

  const todayEntry = byDate[todayStr]
  const todayPV = todayEntry?.pv ?? 0
  const todayUV = todayEntry?.uvSet?.size ?? 0

  const monthPfx = todayStr.slice(0, 7)
  let monthPV = 0, monthUVSet = new Set()
  for (const [date, d] of Object.entries(byDate)) {
    if (!date.startsWith(monthPfx)) continue
    monthPV += d.pv
    d.uvSet.forEach(u => monthUVSet.add(u))
  }

  // byDate 全量(JSON-safe),供前端按自定义日期范围聚合
  const byDateFlat = Object.fromEntries(
    Object.entries(byDateAll).map(([d, v]) => [d, { pv: v.pv, uids: [...v.uvSet] }])
  )

  return { trend, pageRank, todayPV, todayUV, monthPV, monthUV: monthUVSet.size, byDate: byDateFlat }
}
