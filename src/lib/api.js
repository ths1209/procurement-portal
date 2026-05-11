/**
 * 统一后端 API 客户端
 *
 * 职责:
 *   - 拼接 VITE_API_BASE(= 阿里云 FC URL)
 *   - 自动附加 Authorization: Bearer <localStorage.pp_jwt>
 *   - 统一错误处理:401 清 token 并广播登出事件,其他状态抛 Error
 *
 * 约定:成功返回 JSON(GET/POST/PATCH/DELETE),上传用 uploadForm()。
 */

const BASE = (import.meta.env.VITE_API_BASE ?? import.meta.env.VITE_SSO_WORKER_BASE ?? '').replace(/\/$/, '')
const JWT_KEY = 'pp_jwt'

export function getToken() { return localStorage.getItem(JWT_KEY) || '' }
export function setToken(t) {
  if (t) localStorage.setItem(JWT_KEY, t)
  else   localStorage.removeItem(JWT_KEY)
}
export function clearToken() { localStorage.removeItem(JWT_KEY) }

function qs(params) {
  if (!params) return ''
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue
    if (Array.isArray(v)) v.forEach(x => sp.append(k, String(x)))
    else if (typeof v === 'object') sp.append(k, JSON.stringify(v))
    else sp.append(k, String(v))
  }
  const s = sp.toString()
  return s ? `?${s}` : ''
}

async function request(method, path, { params, body, form, headers } = {}) {
  if (!BASE) throw new Error('VITE_API_BASE 未配置')
  const url = `${BASE}${path}${qs(params)}`
  const init = {
    method,
    headers: {
      ...(form ? {} : { 'Content-Type': 'application/json' }),
      ...(headers || {}),
    },
  }
  const token = getToken()
  if (token) init.headers.Authorization = `Bearer ${token}`
  if (form) init.body = form
  else if (body !== undefined) init.body = JSON.stringify(body)

  const res = await fetch(url, init)
  const text = await res.text()
  const data = text ? (() => { try { return JSON.parse(text) } catch { return { raw: text } } })() : null

  if (!res.ok) {
    if (res.status === 401) {
      clearToken()
      window.dispatchEvent(new CustomEvent('pp:unauthorized'))
    }
    const msg = data?.errmsg ?? data?.message ?? `API ${res.status}`
    const err = new Error(msg)
    err.status = res.status
    err.body = data
    throw err
  }
  return data
}

export const api = {
  get:   (path, params)       => request('GET',    path, { params }),
  post:  (path, body, params) => request('POST',   path, { body, params }),
  patch: (path, body, params) => request('PATCH',  path, { body, params }),
  del:   (path, params)       => request('DELETE', path, { params }),
  uploadForm: (path, form)    => request('POST',   path, { form }),
}

export const isApiConfigured = () => !!BASE
