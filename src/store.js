/**
 * 全局状态：本地优先（localStorage），云端账号多端同步（Cloudflare Worker + D1），
 * GitHub 私有仓库保留为备用导出通道
 */
import { reactive, watch } from 'vue'
import { uid, toLocalISO, monthKey, nowDateKey, addDays, addMonths, advanceCycle, CYCLES } from './lib/format.js'
import { monthDistance } from './lib/budget.js'
import { importBill, importRows } from './lib/importer.js'
import { getUser, ensureRepo, readData, writeData } from './lib/github.js'
import { getToken, clearToken, getCachedUser, setCachedUser, fetchData, putData, logout as apiLogout, fetchMe, saveProfile as apiSaveProfile, pingPresence, ApiError } from './lib/api.js'

const KEY = 'inkledger:v1'

/* —— 默认账户：按消费来源 —— */
const seedAccounts = [
  { id: 'acc-wechat', name: '微信零钱', type: 'wechat', initialBalance: 0, importGeneric: true },
  { id: 'acc-alipay', name: '支付宝余额', type: 'alipay', initialBalance: 0, importGeneric: true },
  { id: 'acc-cash', name: '现金', type: 'cash', initialBalance: 0 },
  { id: 'acc-bank', name: '银行卡', type: 'bank', initialBalance: 0 }
].map((a) => ({ ...a, createdAt: Date.now(), updatedAt: Date.now() }))

/* —— 默认分类:keywords 用于账单导入自动归类;icon 为图标注册表键(lib/icons.js) —— */
const seedCategories = [
  ['餐饮', ':food', 'expense', ['美团', '饿了么', '肯德基', '麦当劳', '星巴克', '瑞幸', '餐厅', '面馆', '外卖', '烧烤', '奶茶', '蜜雪', '喜茶', '食品', '食堂', '饭店']],
  ['交通出行', ':transport', 'expense', ['地铁', '公交', '滴滴', '打车', '出租车', '12306', '铁路', '航空', '机票', '高德', '哈啰', '单车', '加油', '停车']],
  ['购物', ':shopping', 'expense', ['淘宝', '天猫', '京东', '拼多多', '苏宁', '唯品会', '超市', '便利店', '711', '全家', '罗森']],
  ['水果生鲜', ':grocery', 'expense', ['买菜', '水果', '生鲜', '叮咚', '盒马', '山姆', '朴朴']],
  ['日用家居', ':household', 'expense', ['日用', '家居', '百货', '保洁', '收纳']],
  ['居住水电', ':housing', 'expense', ['房租', '水费', '电费', '燃气', '物业', '暖气', '宽带', '水电']],
  ['通讯', ':telecom', 'expense', ['话费', '移动', '联通', '电信', '流量', '运营商']],
  ['娱乐影音', ':media', 'expense', ['游戏', 'Steam', '视频会员', '爱奇艺', '腾讯视频', '优酷', 'B站', '哔哩', '电影', '猫眼', '淘票票', 'KTV', '网抑', '网易云']],
  ['数字服务', ':digital', 'expense', ['会员', '订阅', '云服务', 'Apple', 'App Store', '软件', '域名', '服务器']],
  ['服饰美容', ':fashion', 'expense', ['优衣库', 'ZARA', '衣服', '服饰', '美妆', '理发', '护肤', '洗剪吹']],
  ['医疗健康', ':health', 'expense', ['药房', '药店', '医院', '挂号', '体检', '诊所', '医药']],
  ['教育学习', ':education', 'expense', ['教育', '课程', '培训', '书本', '考试', '书店']],
  ['人情往来', ':gifting', 'expense', ['红包', '转账', '份子', '礼物', '随礼']],
  ['宠物', ':pet', 'expense', ['宠物', '猫', '狗', '宠物医院', '猫粮', '狗粮']],
  ['旅行', ':travel', 'expense', ['酒店', '民宿', '旅行', '旅游', '携程', '去哪儿', '飞猪', '景区']],
  ['其他支出', ':other', 'expense', []],
  ['工资薪酬', ':salary', 'income', ['工资', '薪酬', '薪水', '月薪', '奖金', '年终奖']],
  ['兼职外快', ':sidegig', 'income', ['兼职', '外快', '稿费', '劳务']],
  ['理财收益', ':invest', 'income', ['利息', '收益', '分红', '理财', '基金', '股票', '余额宝']],
  ['收到的红包', ':redpacket', 'income', ['红包', '亲属卡', '转账']],
  ['退款返还', ':refund', 'income', ['退款', '退货', '返现', '报销']],
  ['其他收入', ':other', 'income', []]
].map(([name, icon, kind, keywords], i) => ({
  id: `cat-${kind}-${i}`,
  name, icon, kind, keywords,
  isFallback: name.startsWith('其他'),
  createdAt: Date.now(),
  updatedAt: Date.now()
}))

/* 旧版默认 emoji 图标 → 线性图标键:仅当用户未改动过该分类图标时静默升级 */
const ICON_UPGRADE = {
  '餐饮': ['🍜', ':food'], '交通出行': ['🚇', ':transport'], '购物': ['🛒', ':shopping'],
  '水果生鲜': ['🥬', ':grocery'], '日用家居': ['🧻', ':household'], '居住水电': ['🏠', ':housing'],
  '通讯': ['📱', ':telecom'], '娱乐影音': ['🎮', ':media'], '数字服务': ['☁️', ':digital'],
  '服饰美容': ['👔', ':fashion'], '医疗健康': ['💊', ':health'], '教育学习': ['📚', ':education'],
  '人情往来': ['🧧', ':gifting'], '宠物': ['🐾', ':pet'], '旅行': ['🧳', ':travel'],
  '其他支出': ['📌', ':other'], '工资薪酬': ['💰', ':salary'], '兼职外快': ['🧰', ':sidegig'],
  '理财收益': ['📈', ':invest'], '收到的红包': ['🧧', ':redpacket'], '退款返还': ['↩️', ':refund'],
  '其他收入': ['📌', ':other']
}

function upgradeIcons(categories = []) {
  for (const c of categories) {
    const pair = ICON_UPGRADE[c.name]
    if (pair && c.icon === pair[0]) c.icon = pair[1]
  }
  return categories
}

function defaultState() {
  return {
    txs: [],
    accounts: JSON.parse(JSON.stringify(seedAccounts)),
    categories: JSON.parse(JSON.stringify(seedCategories)),
    budgets: [],
    recurring: [],
    goals: [],
    rules: [],
    settings: {
      theme: 'light',
      github: { token: '', login: '', repo: '' },
      lastSync: null
    },
    sync: { status: 'idle', lastSync: null, version: 0, email: '', error: '' }
  }
}

/** 云同步元信息归一化：上次会话中断的「同步中」不残留；绝不携带 token */
function normalizeSync(s) {
  const base = { status: 'idle', lastSync: null, version: 0, email: '', error: '' }
  if (!s || typeof s !== 'object') return base
  const status = ['idle', 'syncing', 'ok', 'error', 'offline'].includes(s.status) ? s.status : 'idle'
  return {
    status: status === 'syncing' ? 'idle' : status,
    lastSync: typeof s.lastSync === 'string' ? s.lastSync : null,
    version: Number.isFinite(s.version) && s.version >= 0 ? Math.floor(s.version) : 0,
    email: typeof s.email === 'string' ? s.email : '',
    error: typeof s.error === 'string' ? s.error : ''
  }
}

function load() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return defaultState()
    const saved = JSON.parse(raw)
    const base = defaultState()
    return {
      txs: saved.txs || [],
      accounts: saved.accounts?.length ? saved.accounts : base.accounts,
      categories: saved.categories?.length ? upgradeIcons(saved.categories) : base.categories,
      budgets: Array.isArray(saved.budgets) ? saved.budgets : [],
      recurring: Array.isArray(saved.recurring) ? saved.recurring : [],
      goals: Array.isArray(saved.goals) ? saved.goals : [],
      rules: Array.isArray(saved.rules) ? saved.rules : [],
      settings: { ...base.settings, ...saved.settings, github: { ...base.settings.github, ...saved.settings?.github } },
      sync: normalizeSync(saved.sync)
    }
  } catch {
    return defaultState()
  }
}

export const store = reactive({ ...load() })

/* —— 云端用户资料（响应式）：头像 / 昵称 / 签名 / 管理员标记，供资料页、对话室、看板共用 —— */
export const cloudUser = reactive({
  id: '', email: '', nickname: '', avatar: '', bio: '', isAdmin: false, lastLogin: null, loaded: false
})
export function setCloudUser(u) {
  if (!u) {
    cloudUser.id = ''; cloudUser.email = ''; cloudUser.nickname = ''
    cloudUser.avatar = ''; cloudUser.bio = ''; cloudUser.isAdmin = false
    cloudUser.lastLogin = null; cloudUser.loaded = false
    return
  }
  cloudUser.id = u.id || ''
  cloudUser.email = u.email || ''
  cloudUser.nickname = u.nickname || ''
  cloudUser.avatar = u.avatar || ''
  cloudUser.bio = u.bio || ''
  cloudUser.isAdmin = !!u.isAdmin
  if (u.lastLogin !== undefined) cloudUser.lastLogin = u.lastLogin || null
  cloudUser.loaded = true
}
// 启动时先用本地缓存回填，避免资料页 / 对话室首屏空白
setCloudUser(getCachedUser())

export function persist() {
  localStorage.setItem(KEY, JSON.stringify({
    txs: store.txs,
    accounts: store.accounts,
    categories: store.categories,
    budgets: store.budgets,
    recurring: store.recurring,
    goals: store.goals,
    rules: store.rules,
    settings: store.settings,
    sync: store.sync
  }))
}
watch(store, () => {
  persist()
  scheduleAutoPush()
}, { deep: true })

/* —— 轻提示：可携带一个动作按钮（如「撤销」） —— */
export const toast = reactive({ msg: '', ts: 0, action: null, actionLabel: '' })
let toastTimer = null
export function showToast(msg, opts = {}) {
  toast.msg = msg
  toast.ts = Date.now()
  toast.action = typeof opts.action === 'function' ? opts.action : null
  toast.actionLabel = opts.actionLabel || '撤销'
  clearTimeout(toastTimer)
  const duration = opts.duration || (toast.action ? 6500 : 2600)
  toastTimer = setTimeout(() => { toast.msg = ''; toast.action = null }, duration)
}

/* —— 单级撤销：记录「操作级恢复」而非整库快照，避免覆盖撤销前的其它编辑 —— */
const clone = (v) => JSON.parse(JSON.stringify(v))
let undoRestore = null
/** 登记一次可撤销操作；restore 为把数据恢复到操作前的闭包 */
export function setUndo(restore) {
  undoRestore = typeof restore === 'function' ? restore : null
}
export function undoLast() {
  if (!undoRestore) return false
  const restore = undoRestore
  undoRestore = null
  restore()
  toast.msg = ''
  toast.action = null
  clearTimeout(toastTimer)
  showToast('已撤销刚才的操作')
  return true
}
/** 带「撤销」按钮的提示：操作完成后调用 */
export function showUndoToast(msg) {
  showToast(msg, { action: undoLast, actionLabel: '撤销' })
}

/* —— 主题化确认框：全局单例，返回 Promise<boolean> —— */
export const confirmState = reactive({
  open: false, title: '', message: '', confirmLabel: '确定', cancelLabel: '取消', danger: false
})
let confirmResolve = null
export function askConfirm(opts = {}) {
  // 若已有未决确认，先按取消收尾，避免悬挂的 Promise
  if (confirmResolve) confirmResolve(false)
  confirmState.title = opts.title || '请确认'
  confirmState.message = opts.message || ''
  confirmState.confirmLabel = opts.confirmLabel || '确定'
  confirmState.cancelLabel = opts.cancelLabel || '取消'
  confirmState.danger = !!opts.danger
  confirmState.open = true
  return new Promise((resolve) => { confirmResolve = resolve })
}
export function answerConfirm(ok) {
  if (!confirmState.open) return
  confirmState.open = false
  const resolve = confirmResolve
  confirmResolve = null
  if (resolve) resolve(!!ok)
}

/* —— 交易 —— */
export function addTx(tx) {
  const item = { ...tx, id: tx.id || uid(), updatedAt: Date.now() }
  store.txs.push(item)
  return item
}
export function updateTx(id, patch) {
  const t = store.txs.find((t) => t.id === id)
  if (t) Object.assign(t, patch, { updatedAt: Date.now() })
}
export function removeTx(id) {
  const i = store.txs.findIndex((t) => t.id === id)
  if (i < 0) return false
  const removed = clone(store.txs[i])
  store.txs.splice(i, 1)
  setUndo(() => {
    if (!store.txs.some((t) => t.id === removed.id)) {
      store.txs.splice(Math.min(i, store.txs.length), 0, removed)
    }
  })
  return true
}
/** 批量删除：一次撤销整批 */
export function removeTxs(ids) {
  const idSet = new Set(ids)
  const removed = []
  store.txs.forEach((t, i) => { if (idSet.has(t.id)) removed.push({ i, item: clone(t) }) })
  if (!removed.length) return 0
  store.txs = store.txs.filter((t) => !idSet.has(t.id))
  setUndo(() => {
    for (const { i, item } of removed) {
      if (!store.txs.some((t) => t.id === item.id)) {
        store.txs.splice(Math.min(i, store.txs.length), 0, item)
      }
    }
  })
  return removed.length
}
export function existingSourceKeys() {
  return new Set(store.txs.map((t) => t.sourceKey).filter(Boolean))
}

/* —— 账户 —— */
export function upsertAccount(acc) {
  const i = store.accounts.findIndex((a) => a.id === acc.id)
  const item = { ...acc, updatedAt: Date.now() }
  if (i >= 0) store.accounts[i] = item
  else store.accounts.push({ ...item, id: acc.id || uid(), createdAt: Date.now() })
}
export function removeAccount(id) {
  if (store.txs.some((t) => t.accountId === id)) {
    showToast('该账户下仍有账目，无法删除')
    return false
  }
  const i = store.accounts.findIndex((a) => a.id === id)
  if (i < 0) return false
  const removed = clone(store.accounts[i])
  store.accounts.splice(i, 1)
  setUndo(() => {
    if (!store.accounts.some((a) => a.id === removed.id)) {
      store.accounts.splice(Math.min(i, store.accounts.length), 0, removed)
    }
  })
  return true
}

/* —— 分类 —— */
export function upsertCategory(cat) {
  const i = store.categories.findIndex((c) => c.id === cat.id)
  const item = { ...cat, updatedAt: Date.now() }
  if (i >= 0) store.categories[i] = item
  else store.categories.push({ ...item, id: cat.id || uid(), createdAt: Date.now() })
}
export function removeCategory(id) {
  if (store.txs.some((t) => t.categoryId === id)) {
    showToast('该分类下仍有账目，无法删除')
    return false
  }
  const i = store.categories.findIndex((c) => c.id === id)
  if (i < 0) return false
  const cat = clone(store.categories[i])
  const budgets = clone(store.budgets.filter((b) => b.id === id))
  const rules = clone(store.rules.filter((r) => r.categoryId === id))
  store.categories.splice(i, 1)
  store.budgets = store.budgets.filter((b) => b.id !== id)
  store.rules = store.rules.filter((r) => r.categoryId !== id)
  setUndo(() => {
    if (!store.categories.some((c) => c.id === cat.id)) {
      store.categories.splice(Math.min(i, store.categories.length), 0, cat)
    }
    for (const b of budgets) if (!store.budgets.some((x) => x.id === b.id)) store.budgets.push(b)
    for (const r of rules) if (!store.rules.some((x) => x.id === r.id)) store.rules.push(r)
  })
  return true
}/* —— 预算:分类月度预算(b.id 即 categoryId,amount 为每月额度) —— */
export function setBudget(categoryId, amount) {
  const v = Math.max(0, Math.round((Number(amount) || 0) * 100) / 100)
  const i = store.budgets.findIndex((b) => b.id === categoryId)
  if (!v) {
    if (i >= 0) store.budgets.splice(i, 1)
    return
  }
  const prev = i >= 0 ? store.budgets[i] : {}
  // 保留 carryover/startMonth 等扩展字段,改额度不重置结转基线
  const item = { ...prev, id: categoryId, amount: v, updatedAt: Date.now() }
  if (i >= 0) store.budgets[i] = item
  else store.budgets.push(item)
}
/** 信封结转开关:启用即以当月为基线;停用回到单月口径 */
export function toggleCarryover(categoryId, on) {
  const b = store.budgets.find((x) => x.id === categoryId)
  if (!b) return
  if (on) {
    b.carryover = true
    b.startMonth = monthKey(nowDateKey())
  } else {
    delete b.carryover
    delete b.startMonth
  }
  b.updatedAt = Date.now()
}
export const budgetOf = (categoryId) => store.budgets.find((b) => b.id === categoryId)?.amount || 0

/** 某月各分类预算执行情况(信封口径见 lib/budget.js;按剩余比例升序,最紧张的在前) */
export function budgetStatus(mKey) {
  // 先按 分类 聚合当月支出,避免三层循环
  const spentBy = new Map()
  for (const t of txsOfMonth(mKey)) {
    if (t.type !== 'expense' || !t.categoryId) continue
    if (!spentBy.has(t.categoryId)) spentBy.set(t.categoryId, 0)
    spentBy.set(t.categoryId, spentBy.get(t.categoryId) + t.amount)
  }
  // 窗口累计(信封用):分类 → Map(月 → 支出),一次遍历全部账目
  const windowSpent = new Map()
  for (const b of store.budgets) {
    if (b.carryover && b.startMonth) {
      const cat = categoryById(b.id)
      if (cat && cat.kind === 'expense') windowSpent.set(b.id, new Map())
    }
  }
  if (windowSpent.size) {
    for (const t of store.txs) {
      if (t.type !== 'expense' || !t.categoryId) continue
      const map = windowSpent.get(t.categoryId)
      if (!map) continue
      const b = store.budgets.find((x) => x.id === t.categoryId)
      if (!b?.startMonth || monthKey(t.date) < b.startMonth) continue
      const m = monthKey(t.date)
      map.set(m, (map.get(m) || 0) + t.amount)
    }
  }
  const rows = []
  for (const b of store.budgets) {
    const cat = categoryById(b.id)
    if (!cat || cat.kind !== 'expense') continue
    const spentM = spentBy.get(b.id) || 0
    let eff
    if (b.carryover && b.startMonth) {
      const map = windowSpent.get(b.id) || new Map()
      // 与 lib/budget.js 的 envelopeOf 同口径:窗口内逐月累计 + 当月
      const months = monthDistance(b.startMonth, mKey)
      if (months <= 1) {
        eff = { budget: b.amount, spent: spentM, months: 1 }
      } else {
        let windowSpentSum = 0
        let cur = b.startMonth
        for (let i = 0; i < months - 1; i++) {
          windowSpentSum += map.get(cur) || 0
          cur = addMonths(cur, 1)
        }
        eff = { budget: b.amount * months, spent: windowSpentSum + spentM, months }
      }
    } else {
      eff = { budget: b.amount, spent: spentM, months: 1 }
    }
    rows.push({
      categoryId: b.id, name: cat.name, icon: cat.icon,
      budget: eff.budget, spent: eff.spent, remain: eff.budget - eff.spent,
      carryover: !!(b.carryover && b.startMonth) && eff.months > 1
    })
  }
  // 按剩余比例升序;额度为 0 的脏数据兜底排最后
  return rows.sort((a, b) => (a.budget > 0 ? a.remain / a.budget : 1) - (b.budget > 0 ? b.remain / b.budget : 1))
}

/* —— 周期账单/订阅:cycle 为 monthly | quarterly | yearly,nextDate 为 'YYYY-MM-DD' —— */
export function upsertRecurring(r) {
  const i = store.recurring.findIndex((x) => x.id === r.id)
  const item = { active: true, ...r, updatedAt: Date.now() }
  if (i >= 0) store.recurring[i] = item
  else store.recurring.push({ ...item, id: r.id || uid(), createdAt: Date.now() })
}
export function removeRecurring(id) {
  const i = store.recurring.findIndex((r) => r.id === id)
  if (i < 0) return false
  const removed = clone(store.recurring[i])
  store.recurring.splice(i, 1)
  setUndo(() => {
    if (!store.recurring.some((r) => r.id === removed.id)) {
      store.recurring.splice(Math.min(i, store.recurring.length), 0, removed)
    }
  })
  return true
}

/** 待缴账单:active 且 30 天内到期(含逾期),按到期日排序 */
export function upcomingBills(days = 30) {
  const today = nowDateKey()
  return store.recurring
    .filter((r) => r.active && r.nextDate <= addDays(today, days))
    .sort((a, b) => a.nextDate.localeCompare(b.nextDate))
}

/** 活跃周期账单折算的每月固定支出 */
export function monthlyFixed() {
  let sum = 0
  for (const r of store.recurring) {
    if (!r.active) continue
    sum += r.amount * (CYCLES[r.cycle]?.perMonth || 1)
  }
  return Math.round(sum * 100) / 100
}

/** 一键缴账:入账一笔并推进 nextDate(顺带追平逾期周期) */
export function payRecurring(id) {
  const r = store.recurring.find((x) => x.id === id)
  if (!r) return null
  const cat = categoryById(r.categoryId) || store.categories.find((c) => c.isFallback && c.kind === 'expense')
  const acc = accountById(r.accountId) || store.accounts[0]
  const tx = {
    id: uid(),
    type: 'expense',
    amount: r.amount,
    categoryId: cat?.id || null,
    accountId: acc?.id || null,
    date: toLocalISO(),
    payee: r.name,
    note: '周期账单',
    tags: [],
    source: 'recurring',
    updatedAt: Date.now()
  }
  store.txs.push(tx)
  const prevNext = r.nextDate
  let next = r.nextDate
  while (next <= nowDateKey()) next = advanceCycle(next, r.cycle)
  r.nextDate = next
  r.updatedAt = Date.now()
  setUndo(() => {
    store.txs = store.txs.filter((t) => t.id !== tx.id)
    const cur = store.recurring.find((x) => x.id === id)
    if (cur) { cur.nextDate = prevNext; cur.updatedAt = Date.now() }
  })
  return tx
}

/* —— 储蓄目标:纯进度追踪,不计入账户余额与总资产 —— */
export function upsertGoal(g) {
  const i = store.goals.findIndex((x) => x.id === g.id)
  const item = {
    ...g,
    target: Math.max(0, Math.round((Number(g.target) || 0) * 100) / 100),
    saved: Math.max(0, Math.round((Number(g.saved) || 0) * 100) / 100),
    updatedAt: Date.now()
  }
  if (i >= 0) store.goals[i] = item
  else store.goals.push({ ...item, id: g.id || uid(), createdAt: Date.now() })
}
export function removeGoal(id) {
  const i = store.goals.findIndex((g) => g.id === id)
  if (i < 0) return false
  const removed = clone(store.goals[i])
  store.goals.splice(i, 1)
  setUndo(() => {
    if (!store.goals.some((g) => g.id === removed.id)) {
      store.goals.splice(Math.min(i, store.goals.length), 0, removed)
    }
  })
  return true
}
/** 存入:仅累加目标进度,不影响账户余额;仅接受正数 */
export function contributeGoal(id, amount) {
  const g = store.goals.find((x) => x.id === id)
  if (!g) return null
  const v = Math.round((Number(amount) || 0) * 100) / 100
  if (!(v > 0)) return null
  const prevSaved = g.saved
  g.saved = Math.round(((Number(g.saved) || 0) + v) * 100) / 100
  g.updatedAt = Date.now()
  setUndo(() => {
    const cur = store.goals.find((x) => x.id === id)
    if (cur) { cur.saved = prevSaved; cur.updatedAt = Date.now() }
  })
  return g
}

/** 标签排行:当月支出按标签聚合(一笔多标签分别计入);含笔数 */
export function tagsOfMonth(mKey) {
  const map = new Map()
  for (const t of txsOfMonth(mKey)) {
    if (t.type !== 'expense') continue
    const tags = (t.tags || []).map((s) => String(s).trim()).filter(Boolean)
    if (!tags.length) continue
    for (const tag of tags) {
      if (!map.has(tag)) map.set(tag, { amount: 0, count: 0 })
      map.get(tag).amount += t.amount
      map.get(tag).count += 1
    }
  }
  return [...map.entries()].map(([tag, v]) => ({ tag, ...v })).sort((a, b) => b.amount - a.amount)
}

/** 全库标签频次(标签输入自动补全用,Top N) */
export function allTags(topN = 30) {
  const freq = new Map()
  for (const t of store.txs) {
    for (const tag of (t.tags || []).map((s) => String(s).trim()).filter(Boolean)) {
      freq.set(tag, (freq.get(tag) || 0) + 1)
    }
  }
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, topN).map(([tag]) => tag)
}

/* —— 查询 —— */
export const accountById = (id) => store.accounts.find((a) => a.id === id)
export const categoryById = (id) => store.categories.find((c) => c.id === id)

export function txsOfMonth(mKey) {
  return store.txs.filter((t) => monthKey(t.date) === mKey)
}

export function monthSummary(mKey) {
  let income = 0, expense = 0
  for (const t of txsOfMonth(mKey)) {
    if (t.type === 'income') income += t.amount
    else if (t.type === 'expense') expense += t.amount
  }
  return { income, expense, net: income - expense }
}

/** 账户余额 = 初始 + 收入 - 支出 + 转入 - 转出 */
export function balanceOf(accountId) {
  const acc = accountById(accountId)
  if (!acc) return 0
  let v = Number(acc.initialBalance) || 0
  for (const t of store.txs) {
    if (t.type === 'income' && t.accountId === accountId) v += t.amount
    else if (t.type === 'expense' && t.accountId === accountId) v -= t.amount
    else if (t.type === 'transfer') {
      if (t.accountId === accountId) v -= t.amount
      else if (t.toAccountId === accountId) v += t.amount
    }
  }
  return v
}

/* —— 账单导入 —— */
export function importFromText(text) {
  const res = importBill(text, {
    accounts: store.accounts,
    categories: store.categories,
    rules: store.rules,
    existingKeys: existingSourceKeys()
  })
  for (const a of res.createdAccounts) store.accounts.push(a)
  store.txs.push(...res.txs)
  return res
}

/** xlsx 等结构化行数组的导入入口 */
export function importFromRows(rows) {
  const res = importRows(rows, {
    accounts: store.accounts,
    categories: store.categories,
    rules: store.rules,
    existingKeys: existingSourceKeys()
  })
  for (const a of res.createdAccounts) store.accounts.push(a)
  store.txs.push(...res.txs)
  return res
}

/* —— 数据管理 —— */
export function exportJSON() {
  return JSON.stringify({
    app: 'inkledger', version: 1, exportedAt: new Date().toISOString(),
    txs: store.txs, accounts: store.accounts, categories: store.categories,
    budgets: store.budgets, recurring: store.recurring, goals: store.goals, rules: store.rules
  }, null, 2)
}
/** 整库快照（导入 / 清空这类全量替换用，撤销即整体还原） */
function snapshotAll() {
  return clone({
    txs: store.txs, accounts: store.accounts, categories: store.categories,
    budgets: store.budgets, recurring: store.recurring, goals: store.goals, rules: store.rules
  })
}
function restoreAll(snap) {
  store.txs = snap.txs
  store.accounts = snap.accounts
  store.categories = snap.categories
  store.budgets = snap.budgets
  store.recurring = snap.recurring
  store.goals = snap.goals
  store.rules = snap.rules
}
export function importJSON(text) {
  const data = JSON.parse(text)
  if (!Array.isArray(data.txs) || !Array.isArray(data.accounts)) throw new Error('文件格式不正确')
  const snap = snapshotAll()
  store.txs = data.txs
  store.accounts = data.accounts
  store.categories = data.categories?.length ? data.categories : defaultState().categories
  store.budgets = (Array.isArray(data.budgets) ? data.budgets : []).filter((b) => Number(b?.amount) > 0)
  store.recurring = Array.isArray(data.recurring) ? data.recurring : []
  store.goals = Array.isArray(data.goals) ? data.goals : []
  store.rules = Array.isArray(data.rules) ? data.rules : []
  setUndo(() => restoreAll(snap))
  showUndoToast('数据已导入')
}
export function clearAll() {
  const snap = snapshotAll()
  const base = defaultState()
  store.txs = []
  store.accounts = base.accounts
  store.categories = base.categories
  store.budgets = []
  store.recurring = []
  store.goals = []
  store.rules = []
  setUndo(() => restoreAll(snap))
  showUndoToast('已清空全部账目')
}

/* —— 合并（同步用）：按 id 合并，updatedAt 新者胜 —— */
export function mergeCloud(local, cloud) {
  if (!cloud) return {
    txs: local.txs, accounts: local.accounts, categories: local.categories,
    budgets: local.budgets || [], recurring: local.recurring || [], goals: local.goals || [], rules: local.rules || []
  }
  const mergeArr = (a = [], b = []) => {
    const map = new Map()
    for (const item of [...a, ...b]) {
      const prev = map.get(item.id)
      if (!prev || (item.updatedAt || 0) >= (prev.updatedAt || 0)) map.set(item.id, item)
    }
    return [...map.values()]
  }
  return {
    txs: mergeArr(local.txs, cloud.txs),
    accounts: mergeArr(local.accounts, cloud.accounts),
    categories: mergeArr(local.categories, cloud.categories),
    budgets: mergeArr(local.budgets || [], cloud.budgets || []),
    recurring: mergeArr(local.recurring || [], cloud.recurring || []),
    goals: mergeArr(local.goals || [], cloud.goals || []),
    rules: mergeArr(local.rules || [], cloud.rules || [])
  }
}

/* —— 云端同步（Cloudflare Worker + D1）：本地优先，云端做多端中继 —— */

/** 业务数据指纹：只有数据真正变化才调度自动推送，sync 元信息写入不会引发推送循环 */
function dataSignature() {
  return JSON.stringify([store.txs, store.accounts, store.categories, store.budgets, store.recurring, store.goals, store.rules])
}
let lastDataSig = dataSignature()
let suppressDepth = 0   // >0 时（启动同步 / 应用远端数据）暂停自动推送
let pushTimer = null    // 自动推送防抖定时器（约 2s）
let syncBusy = false    // 启动 / 手动 / 自动同步互斥，避免并发 PUT

function hasToken() {
  try { return !!getToken() } catch { return false }
}

/** 错误归类：offline（网络不通）/ unauthorized（401）/ error（其它） */
function classifyError(e) {
  if (e instanceof ApiError) {
    if (e.status === 0 || e.code === 'network') return 'offline'
    if (e.status === 401) return 'unauthorized'
    return 'error'
  }
  if (e instanceof TypeError) return 'offline' // fetch 原生网络异常兜底
  if (e?.status === 0 || e?.code === 'network') return 'offline'
  if (e?.status === 401) return 'unauthorized'
  return 'error'
}
const isConflict = (e) => e?.status === 409 || e?.code === 'version_conflict'

/** 失败时统一落 sync 状态，返回归类结果 */
function failSync(e) {
  const kind = classifyError(e)
  if (kind === 'offline') {
    store.sync.status = 'offline'
    store.sync.error = '网络已断开，改动已保存在本机'
  } else if (kind === 'unauthorized') {
    store.sync.status = 'error'
    store.sync.error = '登录已过期，请重新登录'
  } else {
    store.sync.status = 'error'
    store.sync.error = e?.message || '同步失败，请稍后重试'
  }
  return kind
}

/** 云端载荷：与 exportJSON 同构；GitHub PAT 仅留在本机，绝不进入云端数据库 */
function cloudPayload() {
  const payload = JSON.parse(exportJSON())
  // 防御性剥离：即便未来导出结构带上 settings，token 也不上云
  if (payload.settings?.github?.token) payload.settings.github.token = ''
  return payload
}

function localSnapshot() {
  return {
    txs: store.txs, accounts: store.accounts, categories: store.categories,
    budgets: store.budgets, recurring: store.recurring, goals: store.goals, rules: store.rules
  }
}

/** 应用合并结果：与 importJSON 相同的赋值方式，但静默、不登记撤销；
 *  只写业务数组，settings（含本机 GitHub Token）永不被云端覆盖 */
function applyRemote(data) {
  suppressDepth++
  try {
    store.txs = Array.isArray(data.txs) ? data.txs : []
    store.accounts = Array.isArray(data.accounts) ? data.accounts : []
    store.categories = data.categories?.length ? data.categories : defaultState().categories
    store.budgets = Array.isArray(data.budgets) ? data.budgets : []
    store.recurring = Array.isArray(data.recurring) ? data.recurring : []
    store.goals = Array.isArray(data.goals) ? data.goals : []
    store.rules = Array.isArray(data.rules) ? data.rules : []
    persist()
    lastDataSig = dataSignature()
  } finally {
    suppressDepth--
  }
}

/** 乐观锁推送：409 冲突则 拉取→合并→应用→落盘 后重试，最多 3 次 */
async function pushWithRetry(baseVersion) {
  let base = Number(baseVersion) || 0
  store.sync.status = 'syncing'
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const resp = await putData(cloudPayload(), base)
      store.sync.version = Number(resp?.version) || base + 1
      store.sync.status = 'ok'
      store.sync.lastSync = new Date().toISOString()
      store.sync.error = ''
      lastDataSig = dataSignature()
      return 'ok'
    } catch (e) {
      if (isConflict(e)) {
        try {
          const remote = await fetchData()
          base = Number(remote?.version) || 0
          if (remote?.data) applyRemote(mergeCloud(localSnapshot(), remote.data))
          store.sync.version = base
          continue
        } catch (e2) {
          return failSync(e2)
        }
      }
      return failSync(e)
    }
  }
  store.sync.status = 'error'
  store.sync.error = '同步冲突，请稍后重试'
  return 'error'
}

/** 自动推送入口（防抖定时器调用） */
async function pushCloud() {
  if (!hasToken() || syncBusy || suppressDepth > 0) return false
  syncBusy = true
  try {
    store.sync.error = ''
    return (await pushWithRetry(store.sync.version)) === 'ok'
  } finally {
    syncBusy = false
  }
}

/** 数据变化后调度一次防抖自动推送；未登录 / 抑制中 / 离线时不调度 */
function scheduleAutoPush() {
  if (suppressDepth > 0 || !hasToken() || store.sync.status === 'offline') return
  const sig = dataSignature()
  if (sig === lastDataSig) return
  lastDataSig = sig
  clearTimeout(pushTimer)
  pushTimer = setTimeout(() => { pushTimer = null; pushCloud() }, 2000)
}

/** 启动同步：登录校验 → 拉取 → 合并应用 → 推送。App.vue 启动时调用一次 */
export async function bootCloud() {
  if (!hasToken()) return { status: 'unauthorized' }
  syncBusy = true
  suppressDepth++
  try {
    store.sync.status = 'syncing'
    store.sync.error = ''
    const me = await fetchMe()
    const user = me?.user || getCachedUser() || {}
    store.sync.email = user.email || ''
    setCloudUser(user)
    startPresence()
    const remote = await fetchData()
    const base = Number(remote?.version) || 0
    if (remote?.data) {
      applyRemote(mergeCloud(localSnapshot(), remote.data))
    }
    const r = await pushWithRetry(base)
    if (r === 'ok') return { status: 'ok' }
    if (r === 'unauthorized') return { status: 'unauthorized' }
    return { status: 'offline' }
  } catch (e) {
    const kind = failSync(e)
    return { status: kind === 'unauthorized' ? 'unauthorized' : 'offline' }
  } finally {
    suppressDepth--
    syncBusy = false
    scheduleAutoPush()
  }
}

/** 手动同步：拉取→合并→应用→落盘→推送；未登录或同步进行中返回 false */
export async function syncNow() {
  if (!hasToken() || syncBusy) return false
  syncBusy = true
  suppressDepth++
  clearTimeout(pushTimer)
  pushTimer = null
  try {
    store.sync.status = 'syncing'
    store.sync.error = ''
    const remote = await fetchData()
    const base = Number(remote?.version) || 0
    if (remote?.data) applyRemote(mergeCloud(localSnapshot(), remote.data))
    return (await pushWithRetry(base)) === 'ok'
  } catch (e) {
    failSync(e)
    return false
  } finally {
    suppressDepth--
    syncBusy = false
    scheduleAutoPush()
  }
}

/** 退出云端账号：清登录态与 sync 元信息，本机账目完整保留（离线缓存） */
export async function logoutCloud() {
  clearTimeout(pushTimer)
  pushTimer = null
  try { await apiLogout() } catch { /* 服务端失败也要退出 */ }
  try { clearToken() } catch { /* ignore */ }
  stopPresence()
  setCloudUser(null)
  store.sync = { status: 'idle', lastSync: null, version: 0, email: '', error: '' }
  lastDataSig = dataSignature()
}

/** 保存个人资料：成功后同步响应式 cloudUser 与本地缓存 */
export async function saveProfile(patch) {
  const res = await apiSaveProfile(patch)
  if (res?.user) {
    setCloudUser({ ...res.user, lastLogin: cloudUser.lastLogin })
    setCachedUser(res.user)
  }
  return res
}

/* —— 在线心跳：每 60 秒上报一次，刷新会话最近在线时间与登录地点 —— */
let presenceTimer = null
export function startPresence() {
  if (typeof window === 'undefined' || presenceTimer) return
  const beat = () => { if (hasToken()) pingPresence().catch(() => {}) }
  beat()
  presenceTimer = setInterval(beat, 60_000)
}
export function stopPresence() {
  if (presenceTimer) { clearInterval(presenceTimer); presenceTimer = null }
}

/* 恢复联网时自动补一次全量同步（Node / 测试环境无 window，跳过） */
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('online', () => {
    if (!hasToken()) return
    // 若恰有同步在途，稍后重试，避免恢复联网后的第一次同步被互斥挡掉
    if (syncBusy) setTimeout(() => { if (hasToken() && !syncBusy) syncNow() }, 1500)
    else syncNow()
  })
}

/* —— GitHub 同步（备用导出通道） —— */
export function defaultRepoName(login) {
  return `${login}-inkledger-data`
}

export async function syncToGitHub() {
  const { token, login, repo } = store.settings.github
  if (!token) throw new Error('请先在设置中填写 GitHub Token')
  const who = await getUser(token)
  const owner = login || who.login
  const repoName = repo || defaultRepoName(owner)
  await ensureRepo(token, owner, repoName)

  const cloud = await readData(token, owner, repoName)
  const merged = mergeCloud(
    { txs: store.txs, accounts: store.accounts, categories: store.categories, budgets: store.budgets, recurring: store.recurring, goals: store.goals, rules: store.rules },
    cloud.data
  )
  store.txs = merged.txs
  store.accounts = merged.accounts
  store.categories = merged.categories
  store.budgets = merged.budgets
  store.recurring = merged.recurring
  store.goals = merged.goals
  store.rules = merged.rules

  await writeData(token, owner, repoName, {
    app: 'inkledger', version: 1, syncedAt: new Date().toISOString(),
    txs: merged.txs, accounts: merged.accounts, categories: merged.categories,
    budgets: merged.budgets, recurring: merged.recurring, goals: merged.goals, rules: merged.rules
  }, cloud.sha)

  store.settings.github = { token, login: owner, repo: repoName }
  store.settings.lastSync = new Date().toISOString()
  return { login: owner, repo: repoName, created: !!cloud.data }
}


/* —— 自动归类规则:导入与手动记账时优先于关键词打分 —— */
export function upsertRule(r) {
  const i = store.rules.findIndex((x) => x.id === r.id)
  const item = { ...r, match: String(r.match || '').trim(), updatedAt: Date.now() }
  if (i >= 0) store.rules[i] = item
  else store.rules.push({ ...item, id: r.id || uid(), createdAt: Date.now() })
}
export function removeRule(id) {
  const i = store.rules.findIndex((r) => r.id === id)
  if (i < 0) return false
  const removed = clone(store.rules[i])
  store.rules.splice(i, 1)
  setUndo(() => {
    if (!store.rules.some((r) => r.id === removed.id)) {
      store.rules.splice(Math.min(i, store.rules.length), 0, removed)
    }
  })
  return true
}
export function toggleRule(id, on) {
  const r = store.rules.find((x) => x.id === id)
  if (!r) return
  r.enabled = !!on
  r.updatedAt = Date.now()  // 开关变更也刷新时间戳,保证同步合并新者胜
}

/* —— 示例数据（演示用） —— */
export function loadSample() {
  const cat = (name) => store.categories.find((c) => c.name === name)?.id
  const acc = (name) => store.accounts.find((a) => a.name === name)?.id
  const payees = {
    '餐饮': [['美团平台商户', '午餐'], ['瑞幸咖啡', '生椰拿铁'], ['麦当劳', '套餐']],
    '交通出行': [['地铁乘车码', '通勤'], ['滴滴出行', '快车']],
    '购物': [['京东平台商户', '日用品'], ['拼多多商户', '收纳盒']],
    '水果生鲜': [['盒马鲜生', '水果']],
    '娱乐影音': [['哔哩哔哩', '大会员'], ['猫眼电影', '电影票']],
    '居住水电': [['国家电网', '电费'], ['自来水公司', '水费']]
  }
  const txs = []
  const now = new Date()
  for (let m = 2; m >= 0; m--) {
    const d = new Date(now.getFullYear(), now.getMonth() - m, 1)
    const days = m === 0 ? now.getDate() : 28
    for (let day = 1; day <= days; day += 1) {
      if (Math.random() < 0.55) {
        const cName = Object.keys(payees)[Math.floor(Math.random() * Object.keys(payees).length)]
        const [payee, item] = payees[cName][Math.floor(Math.random() * payees[cName].length)]
        const dt = new Date(d.getFullYear(), d.getMonth(), day, 9 + Math.floor(Math.random() * 12), Math.floor(Math.random() * 60))
        if (dt > now) continue
        txs.push({
          id: uid(),
          type: 'expense',
          amount: Math.round((5 + Math.random() * 160) * 100) / 100,
          categoryId: cat(cName),
          accountId: Math.random() < 0.6 ? acc('微信零钱') : acc('支付宝余额'),
          date: toLocalISO(dt),
          payee, note: item, tags: ['示例'],
          source: 'manual', updatedAt: Date.now()
        })
      }
    }
    // 每月工资
    txs.push({
      id: uid(), type: 'income', amount: 18500,
      categoryId: cat('工资薪酬'), accountId: acc('银行卡'),
      date: toLocalISO(new Date(d.getFullYear(), d.getMonth(), 10, 10, 0)),
      payee: '工资', note: '月薪', tags: ['示例'], source: 'manual', updatedAt: Date.now()
    })
  }
  store.txs.push(...txs)
  // 演示预算:让首页预算卡片有内容可看
  const demoBudgets = { '餐饮': 1200, '交通出行': 300, '购物': 500, '居住水电': 600, '娱乐影音': 200 }
  for (const [name, amount] of Object.entries(demoBudgets)) {
    const id = store.categories.find((c) => c.name === name)?.id
    if (id) setBudget(id, amount)
  }
  // 演示周期账单:相对今天错开,保证近期总有待缴项
  const demoRecurring = [
    ['视频会员', 25, 'monthly', '娱乐影音', 2],
    ['手机话费', 39, 'monthly', '通讯', 9],
    ['云服务器', 138, 'yearly', '数字服务', 21]
  ]
  for (const [name, amount, cycle, catName, inDays] of demoRecurring) {
    upsertRecurring({
      id: uid(), name, amount, cycle, active: true,
      categoryId: store.categories.find((c) => c.name === catName)?.id || null,
      accountId: acc('微信零钱') || store.accounts[0]?.id,
      nextDate: addDays(nowDateKey(), inDays)
    })
  }
  // 演示储蓄目标
  upsertGoal({ id: uid(), name: '旅行基金', target: 8000, saved: 5200, deadline: addMonths(monthKey(nowDateKey()), 5) + '-01' })
  upsertGoal({ id: uid(), name: '新手机', target: 6000, saved: 1500, deadline: addMonths(monthKey(nowDateKey()), 8) + '-01' })
  // 演示自动归类规则
  const demoRules = [
    ['美团', '餐饮'], ['滴滴', '交通出行'], ['盒马', '水果生鲜'], ['steam', '娱乐影音']
  ]
  for (const [match, catName] of demoRules) {
    upsertRule({
      id: uid(), match, enabled: true,
      categoryId: store.categories.find((c) => c.name === catName)?.id || null
    })
  }
  showToast(`已生成 ${txs.length} 笔示例账目，可在设置中一键清空`)
}
