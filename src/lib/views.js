/**
 * 「保存视图」：把常用的筛选 + 排序组合存到 localStorage，一键套用。
 * 刻意不存月份——视图应跨月复用（如「本月大额支出」「所有餐饮」）。
 * 纯函数 + 薄存储层，便于单元测试（可注入 storage）。
 */
const KEY = 'pawpress:views'
export const MAX_VIEWS = 12

/** 从当前筛选状态提取可持久化的视图条件 */
export function viewConditions({ filterType = 'all', filterAccount = 'all', keyword = '', sortBy = 'date-desc' } = {}) {
  return {
    filterType,
    filterAccount,
    keyword: String(keyword || '').trim(),
    sortBy
  }
}

/** 视图的一句话描述（用于副标题展示） */
export function describeView(v, { accountName } = {}) {
  const parts = []
  if (v.filterType === 'expense') parts.push('支出')
  else if (v.filterType === 'income') parts.push('收入')
  else if (v.filterType === 'transfer') parts.push('转账')
  if (v.filterAccount && v.filterAccount !== 'all') parts.push(accountName ? accountName(v.filterAccount) : '指定账户')
  if (v.keyword) parts.push(`「${v.keyword}」`)
  if (!parts.length) return '全部账目'
  const sort = { 'date-desc': '最新在前', 'date-asc': '最早在前', 'amount-desc': '金额↓', 'amount-asc': '金额↑' }[v.sortBy]
  if (sort) parts.push(sort)
  return parts.join(' · ')
}

function defaultStorage() {
  try { return typeof localStorage !== 'undefined' ? localStorage : null } catch { return null }
}

export function loadViews(storage = defaultStorage()) {
  if (!storage) return []
  try {
    const raw = storage.getItem(KEY)
    const arr = raw ? JSON.parse(raw) : []
    if (!Array.isArray(arr)) return []
    return arr.filter((v) => v && v.id && v.name).slice(0, MAX_VIEWS)
  } catch { return [] }
}

export function saveViews(views, storage = defaultStorage()) {
  if (!storage) return
  try { storage.setItem(KEY, JSON.stringify(views.slice(0, MAX_VIEWS))) } catch { /* 存储满时静默 */ }
}

/** 新增视图（同名覆盖），返回新数组；name 为空则抛错 */
export function addView(views, name, conditions, id = String(Date.now())) {
  const trimmed = String(name || '').trim()
  if (!trimmed) throw new Error('视图名称不能为空')
  const view = { id, name: trimmed.slice(0, 20), ...conditions, createdAt: Date.now() }
  const rest = views.filter((v) => v.name !== view.name && v.id !== view.id)
  return [view, ...rest].slice(0, MAX_VIEWS)
}

export function removeView(views, id) {
  return views.filter((v) => v.id !== id)
}