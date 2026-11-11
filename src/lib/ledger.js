/**
 * 账目流水的纯函数：筛选 / 排序 / 按日分组。
 * 不依赖 Vue 与 localStorage，便于单元测试与复用。
 */
import { monthKey } from './format.js'

/** 排序选项（key 即持久化到「保存视图」里的值） */
export const SORT_OPTIONS = [
  { key: 'date-desc', label: '最新在前' },
  { key: 'date-asc', label: '最早在前' },
  { key: 'amount-desc', label: '金额从高到低' },
  { key: 'amount-asc', label: '金额从低到高' }
]
const SORT_KEYS = new Set(SORT_OPTIONS.map((s) => s.key))

/**
 * 按月份 / 类型 / 账户 / 关键词筛选（不排序）。
 * @param {Array} txs 账目数组
 * @param {{month?:string,type?:string,account?:string,keyword?:string}} f
 */
export function filterTxs(txs, f = {}) {
  const { month, type = 'all', account = 'all', keyword = '' } = f
  const kw = String(keyword || '').trim().toLowerCase()
  return txs.filter((t) => {
    if (month && monthKey(t.date) !== month) return false
    if (type !== 'all' && t.type !== type) return false
    if (account !== 'all' && t.accountId !== account && t.toAccountId !== account) return false
    if (kw) {
      const hay = (String(t.payee || '') + String(t.note || '') + (t.tags || []).join(' ')).toLowerCase()
      if (!hay.includes(kw)) return false
    }
    return true
  })
}

/** 稳定排序：主键之外按日期倒序、再按 id 兜底，保证同值顺序确定 */
export function sortTxs(txs, sortBy = 'date-desc') {
  const key = SORT_KEYS.has(sortBy) ? sortBy : 'date-desc'
  const byDateDesc = (a, b) => String(b.date).localeCompare(String(a.date))
  const cmp = {
    'date-desc': byDateDesc,
    'date-asc': (a, b) => String(a.date).localeCompare(String(b.date)),
    'amount-desc': (a, b) => (b.amount - a.amount) || byDateDesc(a, b),
    'amount-asc': (a, b) => (a.amount - b.amount) || byDateDesc(a, b)
  }[key]
  return [...txs].sort((a, b) => cmp(a, b) || String(a.id).localeCompare(String(b.id)))
}

/** 按日分组（保持传入顺序），并汇总当日收 / 支 */
export function groupByDay(txs) {
  const map = new Map()
  for (const t of txs) {
    const day = String(t.date).slice(0, 10)
    if (!map.has(day)) map.set(day, [])
    map.get(day).push(t)
  }
  return [...map.entries()].map(([day, list]) => ({
    day,
    expense: list.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0),
    income: list.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0),
    list
  }))
}