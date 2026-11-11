<script setup>
import { ref } from 'vue'
import { store, toast } from './store.js'
import HomeView from './components/HomeView.vue'
import StatsView from './components/StatsView.vue'
import SettingsView from './components/SettingsView.vue'
import TxEditor from './components/TxEditor.vue'
import AppIcon from './components/AppIcon.vue'
import CatArt from './components/CatArt.vue'

const view = ref('home')
const editing = ref(null)      // null 关闭；{} 新建；{tx} 编辑

// 深链：#stats / #settings / #add / #light（可与 #demo 组合，如 #demo/light/stats）
const hash = location.hash
if (hash.includes('stats')) view.value = 'stats'
else if (hash.includes('settings')) view.value = 'settings'

// URL 预填快速记账:?type=expense&amount=30&payee=xx&note=xx&tag=a,b(#add 与参数可组合)
const prefill = readPrefillParams()
if (prefill) {
  editing.value = { tx: prefill }
  // 消费后清掉查询参数,刷新时不重复弹层;hash(#add/#demo 等)保留
  history.replaceState(null, '', location.pathname + location.hash)
} else if (hash.includes('add')) editing.value = {}
if (hash.includes('light') && store.settings.theme !== 'light') {
  store.settings.theme = 'light'
  document.documentElement.dataset.theme = 'light'
} else if (hash.includes('dark') && store.settings.theme !== 'dark') {
  store.settings.theme = 'dark'
  document.documentElement.dataset.theme = 'dark'
}

/** PWA 已在运行时点快捷方式(带 #add 导航)也能打开编辑弹层 */
window.addEventListener('hashchange', () => {
  if (location.hash.includes('add') && !editing.value) {
    editing.value = { tx: readPrefillParams() || undefined }
  }
})

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
  { key: 'home', icon: 'ledger', label: '账目' },
  { key: 'stats', icon: 'stats', label: '统计' },
  { key: 'add', icon: 'pen', label: '记一笔' },
  { key: 'settings', icon: 'settings', label: '设置' }
]

function switchTo(key) {
  if (key === 'add') { editing.value = {}; return }
  view.value = key
}
function setTheme(t) {
  store.settings.theme = t
  document.documentElement.dataset.theme = t
}

/* —— 报头日期与期号 —— */
const today = new Date()
const WEEK = ['日', '一', '二', '三', '四', '五', '六']
const dateLine = `${today.getFullYear()} 年 ${today.getMonth() + 1} 月 ${today.getDate()} 日 · 星期${WEEK[today.getDay()]}`
const issueNo = Math.floor((today - new Date(2024, 0, 1)) / 86400000) + 1
const postDate = `${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`

/* —— 键盘快捷键:输入框内不触发;N 记一笔、/ 聚焦搜索、Esc 关弹层 —— */
window.addEventListener('keydown', (e) => {
  const tag = document.activeElement?.tagName
  const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.activeElement?.isContentEditable
  if (e.key === 'Escape') {
    if (editing.value) { editing.value = null; document.activeElement?.blur?.() }
    return
  }
  if (typing || e.ctrlKey || e.metaKey || e.altKey) return
  if (e.key === 'n' || e.key === 'N') { editing.value = {}; return }
  if (e.key === '/') {
    if (view.value !== 'home') view.value = 'home'
    e.preventDefault()
    requestAnimationFrame(() => document.querySelector('input.search')?.focus())
  }
})
</script>

<template>
  <!-- 桌面：编辑部 desk -->
  <nav class="sidenav">
    <div class="sidenav__brand"><em><AppIcon name="cat" :size="28" /></em>爪爪日报</div>
    <div class="sidenav__sub">PawPress · 猫咪生活报</div>
    <button
      v-for="v in views.filter((v) => v.key !== 'add')"
      :key="v.key"
      class="sidenav__item"
      :class="{ 'sidenav__item--on': view === v.key }"
      @click="switchTo(v.key)"
    >
      <span class="sidenav__ico"><AppIcon :name="v.icon" :size="18" /></span>{{ v.label }}
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
        <span class="masthead__issue">总第 {{ issueNo }} 期 · 今日更新</span>
        <button
          class="chip masthead__theme"
          @click="setTheme(store.settings.theme === 'dark' ? 'light' : 'dark')"
        >
          <AppIcon :name="store.settings.theme === 'dark' ? 'sun' : 'moon'" :size="14" />
          {{ store.settings.theme === 'dark' ? '日刊' : '夜班' }}
        </button>
      </div>
      <div class="masthead__main">
        <CatArt variant="editor" :size="104" class="masthead__cat" />
        <div class="masthead__center">
          <h1 class="masthead__title">爪爪日报</h1>
          <p class="masthead__motto">每一笔开销，都是生活的一条新闻 · 主编 墨墨</p>
        </div>
        <div class="postmark" aria-hidden="true">
          <span>猫咪编辑部</span>
          <b>审讫</b>
          <span class="num">{{ postDate }}</span>
        </div>
      </div>
      <div class="news-rule"></div>
    </header>

    <HomeView v-if="view === 'home'" @edit="editing = $event" />
    <StatsView v-else-if="view === 'stats'" @edit="editing = $event" />
    <SettingsView v-else />
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
      @click="switchTo(v.key)"
    >
      <span class="tabbar__icon"><AppIcon :name="v.icon" :size="v.key === 'add' ? 24 : 21" /></span>
      <span>{{ v.label }}</span>
    </button>
  </nav>

  <TxEditor v-if="editing" :init="editing.tx" @close="editing = null" />

  <div v-if="toast.msg" class="toast num" :key="toast.ts">{{ toast.msg }}</div>
</template>

<style scoped>
.masthead__center { min-width: 0; }
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
</style>