<script setup>
import { ref, watch, onBeforeUnmount } from 'vue'
// 命名空间导入：bootCloud 由云端同步模块（store.js）提供，
// 未就绪时按离线兜底，保证纯本地模式与并行开发期间均可运行
import * as storeModule from './store.js'
import { getToken, getCachedUser } from './lib/api.js'
import HomeView from './components/HomeView.vue'
import StatsView from './components/StatsView.vue'
import SettingsView from './components/SettingsView.vue'
import DashboardView from './components/DashboardView.vue'
import AuthView from './components/AuthView.vue'
import TxEditor from './components/TxEditor.vue'
import AppIcon from './components/AppIcon.vue'
import CatArt from './components/CatArt.vue'
import BrandMark from './components/BrandMark.vue'
import ConfirmDialog from './components/ConfirmDialog.vue'
import GuideTour from './components/GuideTour.vue'
import ProfileView from './components/ProfileView.vue'
import ChatRoomView from './components/ChatRoomView.vue'
import AdminView from './components/AdminView.vue'
import Avatar from './components/Avatar.vue'

const { store, toast, answerConfirm, confirmState, cloudUser, showToast } = storeModule

/* —— 登录闸门 —— */
const authed = ref(false)
const booting = ref(false)
const view = ref('dashboard')
const editing = ref(null)      // null 关闭；{} 新建；{tx} 编辑
let pendingAdd = null          // #add / URL 预填：登录后再补开弹层

/** bootCloud 兜底：模块未提供或异常时按离线处理；15s 超时避免卡在启动页 */
function bootCloudSafe() {
  const boot = storeModule.bootCloud
  if (typeof boot !== 'function') return Promise.resolve({ status: 'offline' })
  return Promise.race([
    Promise.resolve(boot()).catch(() => ({ status: 'offline' })),
    new Promise((resolve) => setTimeout(() => resolve({ status: 'offline' }), 15000))
  ])
}

async function boot() {
  if (!getToken()) { authed.value = false; return }
  booting.value = true
  try {
    const res = await bootCloudSafe()
    authed.value = res?.status !== 'unauthorized'
  } finally {
    booting.value = false
  }
}

async function onAuthed() {
  booting.value = true
  let res
  try {
    res = await bootCloudSafe()
  } finally {
    booting.value = false
  }
  authed.value = res?.status !== 'unauthorized'
}

function onUnauthorized() {
  authed.value = false
  editing.value = null
}
window.addEventListener('meowledger:unauthorized', onUnauthorized)
onBeforeUnmount(() => window.removeEventListener('meowledger:unauthorized', onUnauthorized))

// 设置页主动退出（logoutCloud 会把 sync 重置为 idle 并清 token）：同步落下登录闸门
watch(() => store.sync.status, (s) => {
  if (s === 'idle' && authed.value && !getToken()) {
    authed.value = false
    editing.value = null
  }
})

// 深链：#dashboard / #stats / #chat / #profile / #admin / #settings / #add / #light（可与 #demo 组合）
const hash = location.hash
if (hash.includes('dashboard')) view.value = 'dashboard'
else if (hash.includes('stats')) view.value = 'stats'
else if (hash.includes('chat')) view.value = 'chat'
else if (hash.includes('profile')) view.value = 'profile'
else if (hash.includes('admin')) view.value = 'admin'
else if (hash.includes('settings')) view.value = 'settings'

// URL 预填快速记账:?type=expense&amount=30&payee=xx&note=xx&tag=a,b(#add 与参数可组合)
const prefill = readPrefillParams()
if (prefill) {
  pendingAdd = { tx: prefill }
  // 消费后清掉查询参数,刷新时不重复弹层;hash(#add/#demo 等)保留
  history.replaceState(null, '', location.pathname + location.hash)
} else if (hash.includes('add')) pendingAdd = {}

// 登录成功后补开 #add / 预填弹层（未登录时不弹）
watch(authed, (ok) => {
  if (ok && pendingAdd && !editing.value) {
    editing.value = pendingAdd
    pendingAdd = null
  }
})

if (hash.includes('light') && store.settings.theme !== 'light') {
  store.settings.theme = 'light'
  document.documentElement.dataset.theme = 'light'
} else if (hash.includes('dark') && store.settings.theme !== 'dark') {
  store.settings.theme = 'dark'
  document.documentElement.dataset.theme = 'dark'
}

/** PWA 已在运行时点快捷方式(带 #add 导航)也能打开编辑弹层（仅登录后） */
function onHashChange() {
  const h = location.hash
  if (h.includes('add') && authed.value && !editing.value) {
    editing.value = { tx: readPrefillParams() || undefined }
    return
  }
  if (!authed.value) return
  if (h === '#home') view.value = 'home'
  else if (h === '#dashboard') view.value = 'dashboard'
  else if (h === '#stats') view.value = 'stats'
  else if (h === '#chat') view.value = 'chat'
  else if (h === '#profile') view.value = 'profile'
  else if (h === '#admin') view.value = 'admin'
  else if (h === '#settings') view.value = 'settings'
}
window.addEventListener('hashchange', onHashChange)
onBeforeUnmount(() => window.removeEventListener('hashchange', onHashChange))

function readPrefillParams() {
  const q = new URLSearchParams(location.search)
  const type = q.get('type')
  const amount = q.get('amount')
  const payee = q.get('payee')
  const note = q.get('note')
  const tags = q.get('tag')
  if (!amount && !payee && !note && !tags) return null
  const validType = ['expense', 'income', 'transfer'].includes(type) ? type : 'expense'
  const tagList = (tags || '').split(',').map((s) => s.trim()).filter(Boolean)
  // 不带 id:确保 TxEditor 走"新建"而非"更新";amount 保留字符串以兼容算式
  const prefill = { type: validType, tags: tagList }
  if (amount) prefill.amount = amount
  if (payee) prefill.payee = payee
  if (note) prefill.note = note
  return prefill
}
const views = [
  { key: 'dashboard', icon: 'invest', label: '看板' },
  { key: 'home', icon: 'ledger', label: '账目' },
  { key: 'stats', icon: 'stats', label: '统计' },
  { key: 'chat', icon: 'chat', label: '对话室' },
  { key: 'add', icon: 'pen', label: '记一笔' },
  { key: 'settings', icon: 'settings', label: '设置' }
]

/* —— 使用指引：新账号首次进入自动播放，设置页可重看 —— */
const GUIDE_KEY = 'meowledger:guide-done'
const GUIDE_STEPS = [
  { view: 'dashboard', sel: '[data-tour="kpi"]', title: '今日账况一眼清', body: '本月支出、收入、结余与净资产四张卡片，打开账本第一眼就是它们。' },
  { view: 'dashboard', sel: '[data-tour="add"]', title: '随手记一笔', body: '点这里（或按 N 键）开一张记账单：支出、收入、转账都支持，金额还能写算式。' },
  { view: 'dashboard', sel: '[data-tour="budget"]', title: '预算与待办', body: '预算执行进度、近 7 天待还账单和最近流水都在看板下半部分，超支会标红提醒。' },
  { sel: '[data-tour="nav-home"]', title: '账目工作台', body: '全部流水在这里筛选、排序、批量删除，常用筛选可以存成「视图」一键复用。' },
  { sel: '[data-tour="nav-stats"]', title: '统计报表', body: '分类占比、六个月趋势、账户分布与净资产曲线，还能打印成 PDF 报表。' },
  { sel: '[data-tour="nav-settings"]', title: '设置与导入', body: '微信 / 支付宝账单一键导入，预算、分类、储蓄目标都在这里管理；本指引可随时重看。' }
]
const guideOn = ref(false)
let guideTimer = 0

function guideDoneFor(uid) {
  try { return !!JSON.parse(localStorage.getItem(GUIDE_KEY) || '{}')[uid] } catch { return false }
}
function markGuideDone() {
  const uid = getCachedUser()?.id || 'anon'
  try {
    const m = JSON.parse(localStorage.getItem(GUIDE_KEY) || '{}')
    m[uid] = true
    localStorage.setItem(GUIDE_KEY, JSON.stringify(m))
  } catch { /* 隐私模式等场景忽略 */ }
}
function maybeStartGuide() {
  const u = getCachedUser()
  if (!u || guideDoneFor(u.id)) return
  clearTimeout(guideTimer)
  guideTimer = setTimeout(() => {
    if (authed.value && !editing.value) guideOn.value = true
  }, 700)
}
function onGuideDone() {
  markGuideDone()
  guideOn.value = false
}
function onStartGuide() {
  editing.value = null
  guideOn.value = true
}
window.addEventListener('meowledger:start-guide', onStartGuide)
onBeforeUnmount(() => {
  window.removeEventListener('meowledger:start-guide', onStartGuide)
  clearTimeout(guideTimer)
})
watch(authed, (ok) => { if (ok) maybeStartGuide() })

function switchTo(key) {
  if (key === 'add') { editing.value = {}; return }
  // 平台看板是主编专版：非管理员即便手输 #admin 也只落到提示，不发请求
  if (key === 'admin' && !cloudUser?.isAdmin) {
    showToast('平台看板只对管理员开放')
    return
  }
  view.value = key
}

/** 报头读者证：昵称优先，未起名时退回邮箱前缀 */
const meLabel = () => {
  const n = cloudUser?.nickname
  if (n) return n
  const mail = cloudUser?.email || ''
  return mail ? mail.split('@')[0] : '我的资料'
}
// 管理员身份在登录后才由云端下发；若身份被撤销，正停留在看板则退回对话室
watch(() => cloudUser?.isAdmin, (isAdmin, was) => {
  if (was && !isAdmin && view.value === 'admin') view.value = 'chat'
})
function setTheme(t) {
  store.settings.theme = t
  document.documentElement.dataset.theme = t
}

/* —— 报头日期（记账核对日） —— */
const today = new Date()
const WEEK = ['日', '一', '二', '三', '四', '五', '六']
const dateLine = `${today.getFullYear()} 年 ${today.getMonth() + 1} 月 ${today.getDate()} 日 · 星期${WEEK[today.getDay()]}`
const postDate = `${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`

/* —— 键盘快捷键:输入框内不触发;N 记一笔、/ 聚焦搜索、Esc 关弹层（登录后才生效） —— */
function onKeydown(e) {
  const tag = document.activeElement?.tagName
  const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.activeElement?.isContentEditable
  if (e.key === 'Escape') {
    if (confirmState.open) { answerConfirm(false); return }
    if (editing.value) { editing.value = null; document.activeElement?.blur?.() }
    return
  }
  if (!authed.value || typing || e.ctrlKey || e.metaKey || e.altKey) return
  if (e.key === 'n' || e.key === 'N') { editing.value = {}; return }
  if (e.key === '/') {
    if (view.value !== 'home') view.value = 'home'
    e.preventDefault()
    requestAnimationFrame(() => document.querySelector('input.search')?.focus())
  }
}
window.addEventListener('keydown', onKeydown)
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

boot()
</script>

<template>
  <!-- 启动闸门：有 token 时先同步云端，避免登录页闪烁 -->
  <div v-if="booting" class="boot">
    <CatArt variant="reading" :size="96" class="boot__cat" />
    <p class="boot__text">正在打开账本…</p>
    <span class="pencil-note">墨墨正在核对今天的账目喵</span>
  </div>

  <!-- 未登录：整页读者登记处 -->
  <AuthView v-else-if="!authed" @authed="onAuthed" />

  <!-- 已登录：账本工作台 -->
  <template v-else>
    <!-- 桌面：账本工作台 -->
    <nav class="sidenav">
      <button type="button" class="sidenav__brand" aria-label="喵账本 MeowLedger，回到账目首页" @click="switchTo('home')">
        <em><BrandMark :size="44" /></em>喵账本
      </button>
      <div class="sidenav__sub">MeowLedger · 个人记账</div>
      <button
        v-for="v in views.filter((v) => v.key !== 'add')"
        :key="v.key"
        class="sidenav__item"
        :class="{ 'sidenav__item--on': view === v.key }"
        :data-tour="'nav-' + v.key"
        @click="switchTo(v.key)"
      >
        <span class="sidenav__ico"><AppIcon :name="v.icon" :size="18" /></span>{{ v.label }}
      </button>
      <button
        class="sidenav__item"
        :class="{ 'sidenav__item--on': view === 'profile' }"
        @click="switchTo('profile')"
      >
        <span class="sidenav__ico"><AppIcon name="user" :size="18" /></span>我的资料
      </button>
      <button
        v-if="cloudUser?.isAdmin"
        class="sidenav__item sidenav__item--admin"
        :class="{ 'sidenav__item--on': view === 'admin' }"
        @click="switchTo('admin')"
      >
        <span class="sidenav__ico"><AppIcon name="shield" :size="18" /></span>平台看板
        <span class="sidenav__crown"><AppIcon name="crown" :size="13" /></span>
      </button>
      <button class="sidenav__item" @click="switchTo('add')">
        <span class="sidenav__ico"><AppIcon name="pen" :size="18" /></span>记一笔
      </button>
      <div class="sidenav__foot">
        <CatArt variant="wave" :size="72" />
        <span class="pencil-note">今天也要好好记账喵～</span>
        <button
          class="sidenav__item"
          style="width: 100%"
          @click="setTheme(store.settings.theme === 'dark' ? 'light' : 'dark')"
        >
          <span class="sidenav__ico"><AppIcon :name="store.settings.theme === 'dark' ? 'sun' : 'moon'" :size="18" /></span>
          {{ store.settings.theme === 'dark' ? '日刊模式' : '夜班模式' }}
        </button>
      </div>
    </nav>

    <main class="shell">
      <!-- 报头 -->
      <header class="masthead">
        <div class="masthead__meta">
          <span>{{ dateLine }}</span>
          <span class="masthead__issue">MeowLedger · 个人记账 PWA</span>
          <button
            class="chip masthead__theme"
            @click="setTheme(store.settings.theme === 'dark' ? 'light' : 'dark')"
          >
            <AppIcon :name="store.settings.theme === 'dark' ? 'sun' : 'moon'" :size="14" />
            {{ store.settings.theme === 'dark' ? '日刊' : '夜班' }}
          </button>
          <span class="masthead__me">
            <button
              v-if="cloudUser?.isAdmin"
              class="chip masthead__desk"
              :class="{ 'chip--on': view === 'admin' }"
              title="平台数据看板（管理员）"
              @click="switchTo('admin')"
            >
              <AppIcon name="shield" :size="14" />看板
            </button>
            <button
              class="chip masthead__reader"
              :class="{ 'chip--on': view === 'profile' }"
              title="编辑我的头像与个人资料"
              @click="switchTo('profile')"
            >
              <Avatar
                :src="cloudUser?.avatar"
                :name="cloudUser?.nickname || cloudUser?.email"
                :size="22"
                :admin="cloudUser?.isAdmin"
                :crown="false"
              />
              <span class="masthead__reader-name">{{ meLabel() }}</span>
              <span v-if="cloudUser?.isAdmin" class="badge-admin"><AppIcon name="crown" :size="11" />主编</span>
            </button>
          </span>
        </div>
        <div class="masthead__main">
          <CatArt variant="editor" :size="104" class="masthead__cat" />
          <div class="masthead__center">
            <h1 class="masthead__title">喵账本</h1>
            <p class="masthead__motto">一笔一笔，把日子记清楚 · 记账助手 墨墨</p>
          </div>
          <div class="postmark" aria-hidden="true">
            <span>猫咪账房</span>
            <b>已核对</b>
            <span class="num">{{ postDate }}</span>
          </div>
        </div>
        <div class="news-rule"></div>
      </header>

      <DashboardView v-if="view === 'dashboard'" @navigate="switchTo($event)" @edit="editing = $event" />
      <HomeView v-else-if="view === 'home'" @edit="editing = $event" />
      <StatsView v-else-if="view === 'stats'" @edit="editing = $event" />
      <ChatRoomView v-else-if="view === 'chat'" @navigate="switchTo($event)" />
      <ProfileView v-else-if="view === 'profile'" @navigate="switchTo($event)" />
      <AdminView v-else-if="view === 'admin'" @navigate="switchTo($event)" />
      <SettingsView v-else @navigate="switchTo($event)" />
    </main>

    <!-- 移动：底部栏，记一笔是橘色邮票钮 -->
    <nav class="tabbar">
      <button
        v-for="v in views"
        :key="v.key"
        class="tabbar__item"
        :class="{
          'tabbar__item--on': (v.key === 'add') ? false : view === v.key,
          'tabbar__item--gold': v.key === 'add'
        }"
        :data-tour="'nav-' + v.key"
        @click="switchTo(v.key)"
      >
        <span class="tabbar__icon"><AppIcon :name="v.icon" :size="v.key === 'add' ? 24 : 21" /></span>
        <span>{{ v.label }}</span>
      </button>
    </nav>
  </template>

  <TxEditor v-if="authed && editing" :init="editing.tx" @close="editing = null" />

  <Transition name="toast">
    <div v-if="toast.msg" class="toast" :key="toast.ts" role="status">
      <span class="toast__msg num">{{ toast.msg }}</span>
      <button v-if="toast.action" class="toast__action" @click="toast.action && toast.action()">
        <AppIcon name="undo" :size="15" />{{ toast.actionLabel }}
      </button>
    </div>
  </Transition>

  <ConfirmDialog />

  <GuideTour v-if="guideOn && authed" :steps="GUIDE_STEPS" @done="onGuideDone" @navigate="switchTo" />
</template>

<style scoped>
.masthead__center { min-width: 0; }
.masthead__meta { flex-wrap: wrap; row-gap: 6px; }
.masthead__me { display: inline-flex; align-items: center; gap: 6px; margin-left: auto; }
.masthead__reader { display: inline-flex; align-items: center; gap: 6px; max-width: 220px; padding: 3px 10px 3px 4px; }
.masthead__reader-name {
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: 12px; font-weight: 600; max-width: 96px;
}
.masthead__desk { display: inline-flex; align-items: center; gap: 5px; }
.sidenav__item--admin { position: relative; color: var(--accent-ink); }
.sidenav__crown { margin-left: auto; display: inline-flex; opacity: 0.85; }
.masthead__issue { white-space: nowrap; }
@media (max-width: 639px) {
  .postmark { display: none; }
  .masthead__issue { display: none; }
  .masthead__cat { width: 72px; }
  .masthead__main { gap: 12px; }
  .masthead__title { letter-spacing: 6px; text-indent: 6px; }
}
@media (min-width: 900px) {
  .masthead__theme { display: none; }
}

/* —— 启动页：云端同步中 —— */
.boot {
  position: relative;
  z-index: 1;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 24px;
  text-align: center;
}
.boot__cat { animation: bootBob 1.8s ease-in-out infinite; }
.boot__text {
  font-family: var(--font-serif);
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 3px;
  color: var(--text);
  margin: 0;
}
@keyframes bootBob {
  0%, 100% { transform: translateY(0) rotate(-2deg); }
  50% { transform: translateY(-7px) rotate(2deg); }
}
</style>