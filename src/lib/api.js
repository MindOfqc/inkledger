/**
 * 喵账本云端 API 客户端（Cloudflare Workers 后端）
 * 邮箱 + 密码 + 验证码登录；token 存 localStorage，401 时自动清理并广播登出事件。
 *
 * Node 导入安全：模块顶层不触碰 window / localStorage / navigator / import.meta.env，
 * 全部收敛到函数内并做 typeof 守卫，保证纯 Node 测试可以直接 import 本模块。
 */

// 默认走自定义域名（部分网络封锁 workers.dev），workers.dev 作为备用线路
const DEFAULT_BASE = 'https://meowledger-api.mindofqc.dpdns.org'
export const BACKUP_BASE = 'https://meowledger-api.qixin-study.workers.dev'
const KEY_BASE = 'meowledger:api-base'
const KEY_TOKEN = 'meowledger:auth-token'
const KEY_USER = 'meowledger:auth-user'

/** 安全取 localStorage（Node 无此全局、隐私模式可能抛异常） */
function ls() {
  try {
    if (typeof localStorage !== 'undefined') return localStorage
  } catch { /* ignore */ }
  return null
}

function trimBase(url) {
  return String(url).trim().replace(/\/+$/, '')
}

/* —— 后端地址：localStorage 覆盖 > VITE_API_BASE > 默认 —— */
export function apiBase() {
  const override = ls()?.getItem(KEY_BASE)
  if (override) return trimBase(override)
  const env = import.meta.env?.VITE_API_BASE
  if (env) return trimBase(env)
  return DEFAULT_BASE
}

/** 设置后端地址覆盖；传 null / 空串清除覆盖 */
export function setApiBase(urlOrNull) {
  const store = ls()
  if (!store) return
  try {
    if (urlOrNull == null || String(urlOrNull).trim() === '') store.removeItem(KEY_BASE)
    else store.setItem(KEY_BASE, trimBase(urlOrNull))
  } catch { /* ignore */ }
}

/* —— 登录态持久化 —— */
export function getToken() {
  try { return ls()?.getItem(KEY_TOKEN) || null } catch { return null }
}
export function setToken(t) {
  const store = ls()
  if (!store) return
  try {
    if (t) store.setItem(KEY_TOKEN, String(t))
    else store.removeItem(KEY_TOKEN)
  } catch { /* ignore */ }
}
export function clearToken() { setToken(null) }

export function getCachedUser() {
  try {
    const raw = ls()?.getItem(KEY_USER)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}
export function setCachedUser(u) {
  const store = ls()
  if (!store) return
  try {
    if (u) store.setItem(KEY_USER, JSON.stringify(u))
    else store.removeItem(KEY_USER)
  } catch { /* ignore */ }
}
export function clearCachedUser() { setCachedUser(null) }

/* —— 统一错误：status 为 HTTP 状态码（网络失败为 0），code 为服务端 snake_code —— */
export class ApiError extends Error {
  constructor(message, status = 0, code = '', version) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    if (version !== undefined) this.version = version
  }
}

/** 无服务端 message 时的兜底中文文案 */
function fallbackMessage(status) {
  if (status === 401) return '登录已过期，请重新登录'
  if (status === 403) return '没有权限执行此操作'
  if (status === 404) return '请求的内容不存在'
  if (status === 409) return '数据版本冲突，请刷新后重试'
  if (status === 429) return '操作太频繁，请稍后再试'
  if (status >= 500) return '服务器开小差了，请稍后再试'
  return `请求失败（${status}）`
}

/**
 * 通用请求：JSON 进出，auth 时带 Bearer token。
 * 非 2xx 抛 ApiError；auth 请求遇 401 清登录态并广播 'meowledger:unauthorized'。
 */
export async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const token = auth ? getToken() : null
  if (auth && token) headers.Authorization = `Bearer ${token}`

  let res
  try {
    res = await fetch(apiBase() + path, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {})
    })
  } catch {
    throw new ApiError('网络连接失败，请检查网络后重试', 0, 'network')
  }

  let json = null
  try { json = await res.json() } catch { /* 空响应 / 非 JSON */ }

  if (!res.ok) {
    if (res.status === 401 && auth) {
      clearToken()
      clearCachedUser()
      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new Event('meowledger:unauthorized'))
      }
    }
    const err = new ApiError(
      json?.message || fallbackMessage(res.status),
      res.status,
      json?.error || (res.status === 409 ? 'version_conflict' : '')
    )
    if (json?.version !== undefined) err.version = json.version
    throw err
  }
  return json
}

/* —— 认证 —— */

/** 发送邮箱验证码；开发环境可能返回 { ok:true, devCode } */
export function sendCode(email, purpose) {
  return request('/api/auth/code', { method: 'POST', body: { email, purpose }, auth: false })
}

export async function register({ email, code, password, nickname }) {
  const res = await request('/api/auth/register', {
    method: 'POST',
    body: { email, code, password, nickname },
    auth: false
  })
  if (res?.token) setToken(res.token)
  if (res?.user) setCachedUser(res.user)
  return res
}

export async function login({ email, password }) {
  const res = await request('/api/auth/login', { method: 'POST', body: { email, password }, auth: false })
  if (res?.token) setToken(res.token)
  if (res?.user) setCachedUser(res.user)
  return res
}

export function resetPassword({ email, code, password }) {
  return request('/api/auth/password', { method: 'POST', body: { email, code, password }, auth: false })
}

/** 拉取当前用户并刷新本地缓存 */
export async function fetchMe() {
  const res = await request('/api/auth/me')
  if (res?.user) setCachedUser(res.user)
  return res
}

/** 登出：无论服务端是否成功，本地登录态一律清除 */
export async function logout() {
  try {
    await request('/api/auth/logout', { method: 'POST' })
  } catch { /* 离线 / token 已失效也要登出 */ }
  clearToken()
  clearCachedUser()
}

/* —— 账本数据 —— */

export function fetchData() {
  return request('/api/data')
}

/** 乐观锁写入：baseVersion 不匹配时服务端返回 409（code 'version_conflict'，带最新 version） */
export async function putData(data, baseVersion) {
  try {
    return await request('/api/data', { method: 'PUT', body: { data, baseVersion } })
  } catch (e) {
    if (e instanceof ApiError && e.status === 409 && !e.code) e.code = 'version_conflict'
    throw e
  }
}

/* —— 用户资料 —— */

/** 读取当前用户资料（含头像 / 签名 / 管理员标记） */
export async function fetchProfile() {
  const res = await request('/api/user/profile')
  if (res?.user) setCachedUser(res.user)
  return res
}

/** 保存资料：nickname / avatar / bio，服务端校验后返回最新 user */
export async function saveProfile(patch) {
  const res = await request('/api/user/profile', { method: 'PUT', body: patch })
  if (res?.user) setCachedUser(res.user)
  return res
}

/* —— 在线心跳 —— */

/** 心跳：刷新会话最近在线时间与登录地点（失败静默） */
export function pingPresence() {
  return request('/api/presence', { method: 'POST' })
}

/* —— 对话室 —— */

export function fetchChat(limit = 100) {
  return request(`/api/chat?limit=${limit}`)
}

export function sendChat(content) {
  return request('/api/chat', { method: 'POST', body: { content } })
}

/* —— 管理员平台看板 —— */

export function fetchAdminStats() {
  return request('/api/admin/stats')
}
