<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { cloudUser, showToast } from '../store.js'
import { fetchAdminStats } from '../lib/api.js'
import Avatar from './Avatar.vue'
import AppIcon from './AppIcon.vue'
import CatArt from './CatArt.vue'

/**
 * 编辑部内参 —— 平台运营看板（仅管理员可见，服务端 /api/admin/stats 二次校验）。
 * 汇总注册 / 在线 / 对话 / 数据体量，14 天趋势、地区分布与最近读者名单。
 * 邮箱由服务端脱敏后下发；这里永远拿不到、也不展示任何读者的账目明细。
 */
const emit = defineEmits(['navigate'])

const POLL_MS = 60000
const stats = ref(null)
const loading = ref(true)
const refreshing = ref(false)
const error = ref('')
const forbidden = ref(false)
const auto = ref(true)
const updatedAt = ref(null)
const query = ref('')
const sortBy = ref('created')
const hover = ref(-1)
const hidden = ref([])

let timer = null

/* —— 格式化 —— */
function fmtNum(n) {
  const v = Number(n || 0)
  return v.toLocaleString('zh-CN')
}
function fmtBytes(n) {
  const v = Number(n || 0)
  if (v < 1024) return v + ' B'
  if (v < 1024 * 1024) return (v / 1024).toFixed(1) + ' KB'
  if (v < 1024 * 1024 * 1024) return (v / 1024 / 1024).toFixed(2) + ' MB'
  return (v / 1024 / 1024 / 1024).toFixed(2) + ' GB'
}
function fmtDay(day) {
  const s = String(day || '')
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? Number(m[2]) + '/' + Number(m[3]) : s
}
function fmtDateTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const p = (x) => String(x).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
function ago(iso) {
  if (!iso) return '从未登录'
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return '—'
  const diff = Date.now() - t
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前'
  if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前'
  if (diff < 30 * 86400000) return Math.floor(diff / 86400000) + ' 天前'
  return fmtDateTime(iso)
}
const updatedLabel = computed(() => updatedAt.value
  ? updatedAt.value.toLocaleTimeString('zh-CN', { hour12: false })
  : '—')

/* —— KPI —— */
const totals = computed(() => stats.value?.totals || {})
const kpis = computed(() => {
  const t = totals.value
  return [
    { key: 'users', icon: 'users', label: '注册读者', value: fmtNum(t.users), unit: '位', foot: `今日 +${fmtNum(t.usersToday)} · 本周 +${fmtNum(t.usersWeek)}`, tone: 'gold' },
    { key: 'online', icon: 'pulse', label: '当前在线', value: fmtNum(t.online), unit: '位', foot: '5 分钟内有心跳的读者', tone: 'green', live: true },
    { key: 'chats', icon: 'chat', label: '对话室来信', value: fmtNum(t.chats), unit: '条', foot: `今日 +${fmtNum(t.chatsToday)} 条`, tone: 'blue' },
    { key: 'rows', icon: 'ledger', label: '账目数据行', value: fmtNum(t.dataRows), unit: '行', foot: `今日 +${fmtNum(t.dataToday)} 行`, tone: 'plain' },
    { key: 'bytes', icon: 'wallet', label: '云端占用', value: fmtBytes(t.dataBytes), unit: '', foot: '全部读者的账本正文体积', tone: 'plain' },
    { key: 'places', icon: 'globe', label: '覆盖地区', value: fmtNum((stats.value?.locations || []).length), unit: '处', foot: '按登录 IP 归属地统计（Top 10）', tone: 'red' },
  ]
})

/* —— 趋势图 —— */
const SERIES = [
  { key: 'register', label: '新注册', color: 'var(--chart-3)', raw: '#3f7d5c' },
  { key: 'login', label: '登录活跃', color: 'var(--chart-2)', raw: '#5f8faf' },
  { key: 'chat', label: '对话来信', color: 'var(--gold-deep)', raw: '#d97b1f' },
]
const W = 720
const H = 240
const PAD = { l: 40, r: 14, t: 16, b: 26 }
const days = computed(() => stats.value?.trend?.days || [])
const visibleSeries = computed(() => SERIES.filter((s) => !hidden.value.includes(s.key)))
function countMap(key) {
  const map = new Map()
  for (const it of stats.value?.trend?.[key] || []) map.set(String(it.day), Number(it.count || 0))
  return map
}
const seriesData = computed(() => SERIES.map((s) => {
  const map = countMap(s.key)
  return { ...s, values: days.value.map((d) => map.get(String(d)) || 0) }
}))
const shown = computed(() => seriesData.value.filter((s) => !hidden.value.includes(s.key)))
const yMax = computed(() => {
  let max = 0
  for (const s of shown.value) for (const v of s.values) max = Math.max(max, v)
  if (max <= 4) return 4
  const step = Math.pow(10, Math.floor(Math.log10(max)))
  return Math.ceil(max / (step / 2)) * (step / 2)
})
const plotW = W - PAD.l - PAD.r
const plotH = H - PAD.t - PAD.b
const xOf = (i) => PAD.l + (days.value.length <= 1 ? plotW / 2 : (i / (days.value.length - 1)) * plotW)
const yOf = (v) => PAD.t + plotH - (v / (yMax.value || 1)) * plotH
function linePath(values) {
  if (!values.length) return ''
  return values.map((v, i) => (i ? 'L' : 'M') + xOf(i).toFixed(1) + ' ' + yOf(v).toFixed(1)).join(' ')
}
function areaPath(values) {
  if (!values.length) return ''
  return linePath(values) + ` L${xOf(values.length - 1).toFixed(1)} ${(PAD.t + plotH).toFixed(1)} L${xOf(0).toFixed(1)} ${(PAD.t + plotH).toFixed(1)} Z`
}
const yTicks = computed(() => [0, 0.25, 0.5, 0.75, 1].map((r) => ({ v: Math.round(yMax.value * r), y: yOf(yMax.value * r) })))
const xLabels = computed(() => days.value.map((d, i) => ({ i, label: fmtDay(d), x: xOf(i) }))
  .filter((it) => days.value.length <= 8 || it.i % 2 === 0 || it.i === days.value.length - 1))
const hoverCols = computed(() => days.value.map((d, i) => ({
  i,
  x: xOf(i) - (plotW / Math.max(1, days.value.length - 1)) / 2,
  w: plotW / Math.max(1, days.value.length - 1),
})))
const hoverInfo = computed(() => {
  const i = hover.value
  if (i < 0 || i >= days.value.length) return null
  return {
    i,
    day: days.value[i],
    left: (xOf(i) / W) * 100,
    rows: shown.value.map((s) => ({ key: s.key, label: s.label, raw: s.raw, value: s.values[i] })),
  }
})
function toggleSeries(key) {
  if (hidden.value.includes(key)) hidden.value = hidden.value.filter((k) => k !== key)
  else if (visibleSeries.value.length > 1) hidden.value = [...hidden.value, key]
  else showToast('至少留一条曲线在图上')
}
const peakDay = computed(() => {
  const chat = seriesData.value.find((s) => s.key === 'chat')
  if (!chat || !chat.values.length) return null
  let bi = 0
  chat.values.forEach((v, i) => { if (v > chat.values[bi]) bi = i })
  return chat.values[bi] > 0 ? { day: fmtDay(days.value[bi]), count: chat.values[bi] } : null
})

/* —— 地区分布 —— */
const places = computed(() => {
  const list = stats.value?.locations || []
  const max = list.reduce((m, it) => Math.max(m, Number(it.count || 0)), 0) || 1
  const sum = list.reduce((m, it) => m + Number(it.count || 0), 0) || 1
  return list.map((it, i) => ({
    location: it.location || '未知',
    count: Number(it.count || 0),
    pct: Math.round((Number(it.count || 0) / max) * 100),
    share: Math.round((Number(it.count || 0) / sum) * 100),
    rank: i + 1,
  }))
})

/* —— 最近读者 —— */
const readers = computed(() => {
  const list = [...(stats.value?.recentUsers || [])]
  const q = query.value.trim().toLowerCase()
  const filtered = q
    ? list.filter((u) => [u.email, u.nickname, u.location].some((f) => String(f || '').toLowerCase().includes(q)))
    : list
  filtered.sort((a, b) => {
    const ka = sortBy.value === 'login' ? a.lastLoginAt : a.createdAt
    const kb = sortBy.value === 'login' ? b.lastLoginAt : b.createdAt
    return (Date.parse(kb || '') || 0) - (Date.parse(ka || '') || 0)
  })
  return filtered
})

/* —— 拉取 —— */
async function load({ silent = false } = {}) {
  if (!cloudUser.isAdmin && !stats.value) { forbidden.value = true; loading.value = false; return }
  if (silent) refreshing.value = true
  try {
    const res = await fetchAdminStats()
    stats.value = res
    updatedAt.value = new Date()
    error.value = ''
    forbidden.value = false
  } catch (e) {
    if (e?.code === 'forbidden' || e?.status === 403) forbidden.value = true
    else error.value = e?.message || '看板数据获取失败'
  } finally {
    loading.value = false
    refreshing.value = false
  }
}
function startPoll() {
  clearInterval(timer)
  if (!auto.value) return
  timer = setInterval(() => { if (!document.hidden && !forbidden.value) load({ silent: true }) }, POLL_MS)
}
function onVisible() { if (!document.hidden && auto.value && !forbidden.value) load({ silent: true }) }
watch(auto, (on) => { startPoll(); showToast(on ? '已开启每分钟自动刷新' : '已暂停自动刷新') })
watch(() => cloudUser.isAdmin, (v) => { if (v) { forbidden.value = false; load() } })
onMounted(() => {
  load()
  startPoll()
  document.addEventListener('visibilitychange', onVisible)
})
onBeforeUnmount(() => {
  clearInterval(timer)
  document.removeEventListener('visibilitychange', onVisible)
})
</script>

<template>
  <header class="page-head">
    <div class="page-head__text">
      <span class="kicker">编辑部内参 · NEWSROOM</span>
      <h1 class="page-head__title serif">平台数据看板</h1>
      <p class="page-head__note pencil-note">读者规模、对话热度与数据体量的一页速览。邮箱已脱敏，账目明细永不出库。</p>
    </div>
    <CatArt variant="editor" :size="84" class="page-head__cat" />
  </header>

  <!-- 非管理员 -->
  <section v-if="forbidden" class="card">
    <div class="empty-state">
      <CatArt variant="sleep" :size="128" />
      <p class="empty-state__title">这一版只送编辑部</p>
      <p class="empty-state__note">平台看板仅对管理员开放。若你确为主编，请用管理员邮箱重新登录后再进来。</p>
      <div class="gate-actions">
        <button class="btn btn--gold btn--ico" @click="emit('navigate', 'dashboard')">
          <AppIcon name="invest" :size="15" />回到我的看板
        </button>
        <button class="btn btn--ghost btn--ico" @click="emit('navigate', 'chat')">
          <AppIcon name="chat" :size="15" />去对话室
        </button>
      </div>
    </div>
  </section>

  <template v-else>
    <!-- 工具条 -->
    <div class="toolbar">
      <span class="toolbar__seal"><AppIcon name="shield" :size="14" />主编专阅</span>
      <span class="toolbar__time num">
        <i v-if="auto" class="dot" aria-hidden="true"></i>
        {{ refreshing ? '正在取版…' : '截稿 ' + updatedLabel }}
      </span>
      <div class="toolbar__acts">
        <button class="chip" :class="{ 'chip--on': auto }" @click="auto = !auto">
          <AppIcon name="clock" :size="13" />{{ auto ? '自动刷新 · 1 分钟' : '自动刷新已停' }}
        </button>
        <button class="btn btn--sm btn--ico" :disabled="refreshing" @click="load({ silent: true })">
          <AppIcon name="sync" :size="14" />{{ refreshing ? '取版中…' : '立即刷新' }}
        </button>
      </div>
    </div>

    <div v-if="error" class="notice">
      <AppIcon name="bell" :size="16" />
      <span>{{ error }}</span>
      <button class="btn btn--sm" @click="load()">重试</button>
    </div>

    <!-- KPI -->
    <div v-if="loading" class="kpis">
      <div v-for="i in 6" :key="i" class="kpi">
        <span class="skeleton" style="width: 52%; height: 13px"></span>
        <span class="skeleton" style="width: 70%; height: 30px; margin-top: 10px"></span>
        <span class="skeleton" style="width: 86%; height: 11px; margin-top: 10px"></span>
      </div>
    </div>
    <div v-else class="kpis">
      <article v-for="k in kpis" :key="k.key" class="kpi" :class="'kpi--' + k.tone">
        <div class="kpi__top">
          <span class="kpi__ico"><AppIcon :name="k.icon" :size="16" /></span>
          <span class="kpi__label">{{ k.label }}</span>
          <i v-if="k.live" class="dot dot--kpi" aria-hidden="true"></i>
        </div>
        <p class="kpi__value num">{{ k.value }}<small v-if="k.unit">{{ k.unit }}</small></p>
        <p class="kpi__foot">{{ k.foot }}</p>
      </article>
    </div>

    <!-- 趋势 -->
    <div class="sec-title sec-title--ico"><AppIcon name="pulse" :size="16" />近 14 天走势</div>
    <section class="card chart-card">
      <div class="chart-head">
        <div class="legend">
          <button
            v-for="s in SERIES"
            :key="s.key"
            class="legend__item"
            :class="{ 'legend__item--off': hidden.includes(s.key) }"
            @click="toggleSeries(s.key)"
          >
            <i class="legend__swatch" :style="{ background: s.color }"></i>{{ s.label }}
          </button>
        </div>
        <span v-if="peakDay" class="chart-peak pencil-note">来信最多：{{ peakDay.day }}（{{ peakDay.count }} 条）</span>
      </div>

      <div v-if="loading" class="skeleton" style="height: 240px; border-radius: 10px"></div>
      <div v-else-if="!days.length" class="empty">暂无趋势数据</div>
      <div v-else class="chart-wrap" @mouseleave="hover = -1">
        <svg :viewBox="`0 0 ${W} ${H}`" class="chart" role="img" aria-label="近 14 天注册、登录与对话趋势">
          <defs>
            <linearGradient v-for="s in SERIES" :id="'grad-' + s.key" :key="s.key" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" :stop-color="s.raw" stop-opacity="0.28" />
              <stop offset="100%" :stop-color="s.raw" stop-opacity="0.02" />
            </linearGradient>
          </defs>
          <g class="grid">
            <line v-for="t in yTicks" :key="'y' + t.v" :x1="PAD.l" :x2="W - PAD.r" :y1="t.y" :y2="t.y" />
          </g>
          <g class="axis">
            <text v-for="t in yTicks" :key="'yl' + t.v" :x="PAD.l - 8" :y="t.y + 4" text-anchor="end">{{ t.v }}</text>
            <text v-for="t in xLabels" :key="'xl' + t.i" :x="t.x" :y="H - 8" text-anchor="middle">{{ t.label }}</text>
          </g>
          <g v-for="s in shown" :key="s.key">
            <path :d="areaPath(s.values)" :fill="`url(#grad-${s.key})`" />
            <path :d="linePath(s.values)" fill="none" :stroke="s.color" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" />
            <circle
              v-for="(v, i) in s.values"
              :key="i"
              :cx="xOf(i)" :cy="yOf(v)"
              :r="hover === i ? 4.2 : 2.6"
              :fill="s.color"
              stroke="var(--card)"
              stroke-width="1.4"
            />
          </g>
          <line
            v-if="hoverInfo"
            class="crosshair"
            :x1="xOf(hoverInfo.i)" :x2="xOf(hoverInfo.i)"
            :y1="PAD.t" :y2="PAD.t + plotH"
          />
          <rect
            v-for="c in hoverCols"
            :key="'h' + c.i"
            :x="c.x" :y="PAD.t" :width="c.w" :height="plotH"
            fill="transparent"
            @mouseenter="hover = c.i"
            @touchstart.passive="hover = c.i"
          />
        </svg>
        <div
          v-if="hoverInfo"
          class="tip"
          :style="{ left: hoverInfo.left + '%', transform: 'translateX(' + (hoverInfo.left > 70 ? '-92%' : hoverInfo.left < 22 ? '-8%' : '-50%') + ')' }"
        >
          <b class="num">{{ hoverInfo.day }}</b>
          <span v-for="r in hoverInfo.rows" :key="r.key" class="tip__row">
            <i :style="{ background: r.raw }"></i>{{ r.label }}<em class="num">{{ r.value }}</em>
          </span>
        </div>
      </div>
      <p class="hint chart-note">点击图例可单独查看某条曲线；把鼠标（或手指）移到图上可读出当日明细。</p>
    </section>

    <div class="cols">
      <!-- 地区 -->
      <section class="card places">
        <div class="sec-title sec-title--ico"><AppIcon name="pin" :size="16" />读者都在哪儿</div>
        <div v-if="loading"><span v-for="i in 6" :key="i" class="skeleton place-skeleton"></span></div>
        <div v-else-if="!places.length" class="empty">暂无登录地点记录</div>
        <ol v-else class="place-list">
          <li v-for="p in places" :key="p.location" class="place">
            <span class="place__rank num" :class="{ 'place__rank--top': p.rank <= 3 }">{{ p.rank }}</span>
            <div class="place__body">
              <div class="place__line">
                <span class="place__name">{{ p.location }}</span>
                <span class="place__count num">{{ p.count }} 位 · {{ p.share }}%</span>
              </div>
              <div class="place__bar"><i :style="{ width: p.pct + '%' }"></i></div>
            </div>
          </li>
        </ol>
        <p class="hint">按登录会话的 IP 归属地聚合，仅显示前 10 处；未知表示请求未携带地理信息。</p>
      </section>

      <!-- 最近读者 -->
      <section class="card readers">
        <div class="sec-title sec-title--ico"><AppIcon name="users" :size="16" />最近读者名单</div>
        <div class="readers__tools">
          <div class="search-wrap">
            <AppIcon name="search" :size="15" />
            <input v-model="query" class="input readers__search" placeholder="搜索昵称 / 邮箱 / 地区" />
          </div>
          <select v-model="sortBy" class="select readers__sort">
            <option value="created">按注册时间</option>
            <option value="login">按最近登录</option>
          </select>
        </div>
        <div v-if="loading"><span v-for="i in 5" :key="i" class="skeleton reader-skeleton"></span></div>
        <div v-else-if="!readers.length" class="empty">{{ query ? '没有匹配的读者' : '暂无读者记录' }}</div>
        <div v-else class="readers__scroll">
          <table class="rtable">
            <thead>
              <tr>
                <th>读者</th>
                <th>注册</th>
                <th>最近登录</th>
                <th class="rtable__place">登录地</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(u, i) in readers" :key="u.email + '-' + i">
                <td>
                  <div class="reader">
                    <Avatar :src="u.avatar" :name="u.nickname || u.email" :size="30" :crown="false" />
                    <div class="reader__text">
                      <b>{{ u.nickname || '未起名读者' }}</b>
                      <small class="num">{{ u.email }}</small>
                    </div>
                  </div>
                </td>
                <td class="num">{{ fmtDateTime(u.createdAt) }}</td>
                <td>
                  <span class="num">{{ fmtDateTime(u.lastLoginAt) }}</span>
                  <small class="reader__ago">{{ ago(u.lastLoginAt) }}</small>
                </td>
                <td class="rtable__place">{{ u.location || '未知' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="hint">最多展示最近 20 位读者；邮箱由服务端脱敏，看板不提供任何账目内容。</p>
      </section>
    </div>

    <!-- 快捷入口 -->
    <section class="card card--gold desk">
      <div class="desk__text">
        <b class="serif">主编工作台</b>
        <p class="pencil-note">在对话室发一条公告，你的发言会带金章高亮；也可以顺手校订自己的读者证。</p>
      </div>
      <div class="desk__acts">
        <button class="btn btn--gold btn--ico" @click="emit('navigate', 'chat')">
          <AppIcon name="send" :size="15" />去对话室发公告
        </button>
        <button class="btn btn--ghost btn--ico" @click="emit('navigate', 'profile')">
          <AppIcon name="user" :size="15" />编辑我的资料
        </button>
      </div>
    </section>
  </template>
</template>

<style scoped>
/* 工具条 */
.toolbar {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 9px 12px; margin-bottom: 14px;
  border: 1px dashed var(--line-strong);
  border-radius: var(--radius-m);
  background: var(--card-2);
}
.toolbar__seal {
  display: inline-flex; align-items: center; gap: 5px;
  font-family: var(--font-serif); font-size: 12px; letter-spacing: 1px;
  color: #33230e;
  background: linear-gradient(135deg, var(--gold), var(--gold-deep));
  padding: 2px 9px; border-radius: 4px;
  transform: rotate(-1deg);
}
.toolbar__time { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-faint); flex: 1; }
.toolbar__acts { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.dot { width: 7px; height: 7px; border-radius: 50%; background: var(--ink-green); box-shadow: 0 0 0 3px var(--ink-green-soft); animation: beat 2.4s ease-in-out infinite; }
@keyframes beat { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
.notice { display: flex; align-items: center; gap: 8px; padding: 10px 12px; margin-bottom: 12px; border-radius: var(--radius-s); font-size: 12.5px; color: var(--text-dim); background: var(--ink-red-soft); border: 1px solid var(--line); }
.notice > span { flex: 1; }
.gate-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }

/* KPI */
.kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 6px; }
.kpi {
  position: relative;
  padding: 13px 14px 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius-m);
  background: var(--card);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
  transition: transform 0.16s ease, box-shadow 0.16s ease;
}
.kpi:hover { transform: translateY(-2px); box-shadow: var(--shadow); }
.kpi::before { content: ''; position: absolute; inset: 0 auto 0 0; width: 4px; background: var(--line-strong); }
.kpi--gold::before { background: linear-gradient(180deg, var(--gold), var(--gold-deep)); }
.kpi--green::before { background: var(--ink-green); }
.kpi--blue::before { background: var(--chart-2); }
.kpi--red::before { background: var(--ink-red); }
.kpi--gold { background: linear-gradient(135deg, var(--gold-soft), var(--card) 62%); border-color: var(--gold-line); }
.kpi__top { display: flex; align-items: center; gap: 6px; }
.kpi__ico { display: inline-flex; color: var(--text-dim); }
.kpi__label { font-size: 12px; color: var(--text-dim); letter-spacing: 0.5px; flex: 1; }
.dot--kpi { width: 6px; height: 6px; }
.kpi__value { margin: 8px 0 4px; font-size: 27px; font-weight: 800; line-height: 1.1; color: var(--text); letter-spacing: -0.5px; }
.kpi__value small { font-size: 12px; font-weight: 600; color: var(--text-faint); margin-left: 4px; letter-spacing: 0; }
.kpi__foot { margin: 0; font-size: 11.5px; color: var(--text-faint); line-height: 1.6; }

/* 趋势 */
.chart-card { padding: 14px; }
.chart-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-bottom: 8px; }
.legend { display: flex; gap: 6px; flex-wrap: wrap; }
.legend__item {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 4px 10px; border-radius: 999px;
  border: 1px solid var(--line-strong); background: var(--card-2);
  font-family: inherit; font-size: 12px; color: var(--text-dim); cursor: pointer;
  transition: opacity 0.15s, border-color 0.15s, background 0.15s;
}
.legend__item:hover { border-color: var(--gold-line); background: var(--gold-soft); }
.legend__item--off { opacity: 0.42; text-decoration: line-through; }
.legend__swatch { width: 10px; height: 10px; border-radius: 3px; }
.chart-peak { font-size: 12px; margin: 0; }
.chart-wrap { position: relative; }
.chart { width: 100%; height: auto; display: block; overflow: visible; touch-action: pan-y; }
.grid line { stroke: var(--line); stroke-width: 1; stroke-dasharray: 3 4; }
.axis text { fill: var(--text-faint); font-size: 10px; font-family: var(--font-sans); }
.crosshair { stroke: var(--gold-deep); stroke-width: 1; stroke-dasharray: 4 3; opacity: 0.7; }
.tip {
  position: absolute; top: 6px;
  min-width: 132px;
  padding: 7px 10px;
  border: 1px solid var(--gold-line);
  border-radius: 8px;
  background: var(--card);
  box-shadow: var(--shadow);
  pointer-events: none;
  font-size: 11.5px;
  z-index: 2;
}
.tip b { display: block; font-size: 12px; color: var(--text); margin-bottom: 4px; }
.tip__row { display: flex; align-items: center; gap: 6px; color: var(--text-dim); line-height: 1.9; }
.tip__row i { width: 8px; height: 8px; border-radius: 2px; flex: none; }
.tip__row em { margin-left: auto; font-style: normal; font-weight: 700; color: var(--text); }
.chart-note { margin: 8px 0 0; }

/* 两栏 */
.cols { display: grid; grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr); gap: 14px; align-items: start; margin-top: 6px; }
.cols .sec-title { margin-top: 0; }
.hint { font-size: 11.5px; color: var(--text-faint); line-height: 1.75; margin: 10px 0 0; }

/* 地区 */
.place-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 9px; }
.place { display: flex; gap: 9px; align-items: flex-start; }
.place__rank {
  flex: none; width: 20px; height: 20px; margin-top: 1px;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 5px; border: 1px solid var(--line-strong);
  font-size: 11px; font-weight: 700; color: var(--text-faint); background: var(--card-2);
}
.place__rank--top { color: #33230e; border-color: var(--gold-deep); background: linear-gradient(135deg, var(--gold), var(--gold-deep)); }
.place__body { flex: 1; min-width: 0; }
.place__line { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.place__name { font-size: 13px; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.place__count { font-size: 11px; color: var(--text-faint); flex: none; }
.place__bar { height: 7px; margin-top: 4px; border-radius: 4px; background: var(--card-2); border: 1px solid var(--line); overflow: hidden; }
.place__bar i {
  display: block; height: 100%;
  background: repeating-linear-gradient(135deg, var(--gold) 0 5px, var(--gold-deep) 5px 10px);
  transition: width 0.5s cubic-bezier(0.22, 1, 0.36, 1);
}
.place-skeleton { display: block; height: 30px; border-radius: 6px; margin-bottom: 9px; }

/* 读者表 */
.readers__tools { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
.search-wrap { position: relative; flex: 1; min-width: 180px; display: flex; align-items: center; }
.search-wrap > .app-icon { position: absolute; left: 9px; color: var(--text-faint); pointer-events: none; }
.readers__search { padding-left: 30px; width: 100%; }
.readers__sort { flex: none; width: auto; }
.readers__scroll {
  max-height: 340px; overflow: auto; overscroll-behavior: contain;
  border: 1px solid var(--line); border-radius: var(--radius-s);
  scrollbar-width: thin; scrollbar-color: var(--gold-line) var(--card-2);
}
.readers__scroll::-webkit-scrollbar { width: 10px; height: 10px; }
.readers__scroll::-webkit-scrollbar-track { background: var(--card-2); }
.readers__scroll::-webkit-scrollbar-thumb { background: var(--gold-line); border: 2px solid var(--card-2); border-radius: 6px; }
.readers__scroll::-webkit-scrollbar-thumb:hover { background: var(--gold-deep); }
.rtable { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.rtable th {
  position: sticky; top: 0; z-index: 1;
  text-align: left; font-weight: 600; font-size: 11.5px; letter-spacing: 0.5px;
  color: var(--text-faint); background: var(--card-2);
  padding: 8px 10px; border-bottom: 1px solid var(--line-strong); white-space: nowrap;
}
.rtable td { padding: 8px 10px; border-bottom: 1px dashed var(--line); color: var(--text-dim); vertical-align: middle; }
.rtable tbody tr:last-child td { border-bottom: 0; }
.rtable tbody tr:hover td { background: var(--gold-soft); }
.reader { display: flex; align-items: center; gap: 8px; min-width: 0; }
.reader__text { min-width: 0; display: flex; flex-direction: column; }
.reader__text b { font-size: 12.5px; color: var(--text); font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 150px; }
.reader__text small { font-size: 10.5px; color: var(--text-faint); }
.reader__ago { display: block; font-size: 10.5px; color: var(--text-faint); }
.reader-skeleton { display: block; height: 40px; border-radius: 6px; margin-bottom: 8px; }

/* 主编工作台 */
.desk { display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap; margin-top: 14px; }
.desk__text { min-width: 220px; flex: 1; }
.desk__text b { font-size: 15px; letter-spacing: 1px; color: var(--text); }
.desk__text p { margin: 4px 0 0; }
.desk__acts { display: flex; gap: 8px; flex-wrap: wrap; }

@media (max-width: 899px) {
  .kpis { grid-template-columns: repeat(2, 1fr); }
  .cols { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 639px) {
  .kpis { gap: 9px; }
  .kpi { padding: 11px 12px 10px; }
  .kpi__value { font-size: 23px; }
  .rtable__place { display: none; }
  .reader__text b { max-width: 110px; }
  .toolbar__acts { width: 100%; }
  .chart-card { padding: 12px 10px; }
  .desk__acts .btn { flex: 1; justify-content: center; }
}
</style>
