<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import * as echarts from 'echarts/core'
import { PieChart, LineChart, BarChart } from 'echarts/charts'
import { TooltipComponent, LegendComponent, GridComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { store, txsOfMonth, categoryById, accountById, tagsOfMonth } from '../store.js'
import { fmtMoney, fmtPct, monthKey, monthLabel, addMonths, nowDateKey, monthRange, ACCOUNT_META } from '../lib/format.js'
import { netWorthSeries, replayBalances } from '../lib/networth.js'
import AppIcon from './AppIcon.vue'
import CatArt from './CatArt.vue'

echarts.use([PieChart, LineChart, BarChart, TooltipComponent, LegendComponent, GridComponent, CanvasRenderer])

const month = ref(monthKey(nowDateKey()))
const emit = defineEmits(['edit'])

const monthTxs = computed(() => txsOfMonth(month.value))
const stats = computed(() => {
  const [start, end] = monthRange(month.value)
  const days = Math.max(1, monthKey(nowDateKey()) === month.value
    ? Number(nowDateKey().slice(8, 10))
    : new Date(Number(month.value.slice(0, 4)), Number(month.value.slice(5, 7)), 0).getDate())
  let income = 0, expense = 0
  for (const t of monthTxs.value) {
    if (t.type === 'income') income += t.amount
    if (t.type === 'expense') expense += t.amount
  }
  return { income, expense, net: income - expense, avg: expense / days, days, start, end }
})

/** 上月支出与环比(上月为 0 或无数据时不展示) */
const mom = computed(() => {
  let last = 0
  const prevKey = addMonths(month.value, -1)
  for (const t of txsOfMonth(prevKey)) {
    if (t.type === 'expense') last += t.amount
  }
  if (!last) return null
  const cur = stats.value.expense
  const pct = (cur - last) / last
  return { last, pct }
})

const byCategory = computed(() => {
  const map = new Map()
  for (const t of monthTxs.value) {
    if (t.type !== 'expense') continue
    const c = categoryById(t.categoryId)
    const key = c?.name || '未分类'
    map.set(key, (map.get(key) || 0) + t.amount)
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1])
})

const byAccount = computed(() => {
  const map = new Map()
  for (const t of monthTxs.value) {
    if (t.type !== 'expense') continue
    const a = accountById(t.accountId)
    const key = a?.name || '未知来源'
    map.set(key, (map.get(key) || 0) + t.amount)
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1])
})

const trend = computed(() => {
  const keys = []
  for (let i = 5; i >= 0; i--) keys.push(addMonths(month.value, -i))
  const inc = [], exp = []
  for (const k of keys) {
    let i = 0, e = 0
    for (const t of store.txs.filter((t) => monthKey(t.date) === k)) {
      if (t.type === 'income') i += t.amount
      else if (t.type === 'expense') e += t.amount
    }
    inc.push(Math.round(i * 100) / 100)
    exp.push(Math.round(e * 100) / 100)
  }
  return { keys: keys.map(monthLabel), inc, exp }
})

/* —— 年度总览 —— */
const year = ref(nowDateKey().slice(0, 4))
const years = computed(() => {
  const set = new Set([String(new Date().getFullYear())])
  for (const t of store.txs) set.add(t.date.slice(0, 4))
  return [...set].filter((y) => /^\d{4}$/.test(y)).sort().reverse()
})
const yearStats = computed(() => {
  let income = 0, expense = 0
  const activeMonths = new Set()
  const byMonth = Array.from({ length: 12 }, () => ({ i: 0, e: 0 }))
  for (const t of store.txs) {
    if (!t.date.startsWith(year.value)) continue
    const m = Number(t.date.slice(5, 7)) - 1
    if (m < 0 || m > 11) continue
    if (t.type === 'income') { income += t.amount; byMonth[m].i += t.amount; activeMonths.add(m) }
    else if (t.type === 'expense') { expense += t.amount; byMonth[m].e += t.amount; activeMonths.add(m) }
  }
  const r2 = (v) => Math.round(v * 100) / 100
  return {
    income: r2(income), expense: r2(expense), net: r2(income - expense),
    avg: r2(expense / Math.max(1, activeMonths.size)),
    inc: byMonth.map((x) => r2(x.i)), exp: byMonth.map((x) => r2(x.e))
  }
})

const topCat = computed(() => byCategory.value.slice(0, 10))
const maxCat = computed(() => topCat.value[0]?.[1] || 1)

/* —— 标签排行(当月支出,多标签分别计入) —— */
const topTags = computed(() => tagsOfMonth(month.value).slice(0, 10))
const maxTag = computed(() => topTags.value[0]?.amount || 1)

/* —— 净值走势:历史点按月末重放;当前总资产与 balanceOf 同口径(全量、不截断) —— */
const netWorth = computed(() => {
  const points = netWorthSeries(store.txs, store.accounts, month.value)
  const balances = replayBalances(store.txs, store.accounts, null)
  let current = 0
  for (const v of balances.values()) current += v
  return { points, current: Math.round(current * 100) / 100 }
})

function printReport() {
  window.print()
}

/* —— 图表：报刊色板 —— */
const pieEl = ref(null)
const lineEl = ref(null)
const barEl = ref(null)
const yearEl = ref(null)
const netEl = ref(null)
let charts = []
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim()

function renderCharts() {
  charts.forEach((c) => c.dispose())
  charts = []
  const axis = { color: css('--text-dim'), fontSize: 11 }
  const split = css('--line')
  const palette = Array.from({ length: 8 }, (_, i) => css(`--chart-${i + 1}`))
  const tip = {
    backgroundColor: css('--card'),
    borderColor: css('--line-strong'),
    textStyle: { color: css('--text'), fontSize: 12 }
  }

  if (pieEl.value) {
    const chart = echarts.init(pieEl.value)
    chart.setOption({
      tooltip: { trigger: 'item', formatter: '{b}<br/>¥{c}（{d}%）', ...tip },
      series: [{
        type: 'pie', radius: ['56%', '80%'], center: ['50%', '50%'],
        itemStyle: { borderRadius: 5, borderColor: css('--card'), borderWidth: 2 },
        label: { color: css('--text-dim'), fontSize: 11 },
        labelLine: { lineStyle: { color: css('--line-strong') } },
        data: byCategory.value.map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }))
      }],
      color: palette
    })
    charts.push(chart)
  }
  if (lineEl.value) {
    const chart = echarts.init(lineEl.value)
    chart.setOption({
      tooltip: { trigger: 'axis', ...tip },
      legend: { data: ['收入', '支出'], textStyle: { color: css('--text-dim') }, top: 0 },
      grid: { left: 8, right: 12, top: 32, bottom: 0, containLabel: true },
      xAxis: { type: 'category', data: trend.value.keys, axisLabel: { ...axis, interval: 2 } },
      yAxis: { type: 'value', axisLabel: axis, splitLine: { lineStyle: { color: split } } },
      series: [
        { name: '收入', type: 'line', smooth: true, symbolSize: 6, data: trend.value.inc, itemStyle: { color: css('--chart-2') }, lineStyle: { width: 2.5 }, areaStyle: { opacity: 0.12 } },
        { name: '支出', type: 'line', smooth: true, symbolSize: 6, data: trend.value.exp, itemStyle: { color: css('--chart-3') }, lineStyle: { width: 2.5, type: 'dashed' }, areaStyle: { opacity: 0.08 } }
      ]
    })
    charts.push(chart)
  }
  if (barEl.value) {
    const chart = echarts.init(barEl.value)
    chart.setOption({
      tooltip: { trigger: 'axis', ...tip },
      grid: { left: 8, right: 30, top: 8, bottom: 0, containLabel: true },
      xAxis: { type: 'value', axisLabel: { show: false }, splitLine: { lineStyle: { color: split } } },
      yAxis: { type: 'category', data: byAccount.value.map((x) => x[0]).reverse(), axisLabel: axis },
      series: [{
        type: 'bar', barWidth: 13, itemStyle: { borderRadius: 6, color: css('--chart-1') },
        label: { show: true, position: 'right', color: css('--text-faint'), fontSize: 10.5, formatter: (p) => fmtMoney(p.value) },
        data: byAccount.value.map((x) => Math.round(x[1] * 100) / 100).reverse()
      }]
    })
    charts.push(chart)
  }
  if (yearEl.value) {
    const chart = echarts.init(yearEl.value)
    chart.setOption({
      tooltip: { trigger: 'axis', ...tip },
      legend: { data: ['收入', '支出'], textStyle: { color: css('--text-dim') }, top: 0 },
      grid: { left: 8, right: 12, top: 32, bottom: 0, containLabel: true },
      xAxis: { type: 'category', data: Array.from({ length: 12 }, (_, i) => `${i + 1}月`), axisLabel: axis },
      yAxis: { type: 'value', axisLabel: axis, splitLine: { lineStyle: { color: split } } },
      series: [
        { name: '收入', type: 'bar', barWidth: 8, itemStyle: { borderRadius: 4, color: css('--chart-2') }, data: yearStats.value.inc },
        { name: '支出', type: 'bar', barWidth: 8, itemStyle: { borderRadius: 4, color: css('--chart-3'), opacity: 0.88 }, data: yearStats.value.exp }
      ]
    })
    charts.push(chart)
  }
  if (netEl.value) {
    const chart = echarts.init(netEl.value)
    const pts = netWorth.value.points
    chart.setOption({
      tooltip: { trigger: 'axis', valueFormatter: (v) => '¥' + fmtMoney(v), ...tip },
      grid: { left: 8, right: 12, top: 16, bottom: 0, containLabel: true },
      xAxis: { type: 'category', data: pts.map((p) => p.month), axisLabel: { ...axis, formatter: (v) => v.slice(2) } },
      yAxis: { type: 'value', axisLabel: axis, splitLine: { lineStyle: { color: split } } },
      series: [{
        name: '净值', type: 'line', smooth: true, symbolSize: 5, data: pts.map((p) => p.total),
        itemStyle: { color: css('--chart-2') }, lineStyle: { width: 2.5 }, areaStyle: { opacity: 0.12 }
      }]
    })
    charts.push(chart)
  }
}

let ro = null
onMounted(async () => {
  await nextTick()
  renderCharts()
  ro = new ResizeObserver(() => charts.forEach((c) => c.resize()))
  ;[pieEl, lineEl, barEl, yearEl, netEl].forEach((r) => r.value && ro.observe(r.value.parentElement))
})
onBeforeUnmount(() => { ro?.disconnect(); charts.forEach((c) => c.dispose()) })
watch([month, year, () => store.settings.theme, netWorth, topTags, yearStats], renderCharts)

</script>

<template>
  <header class="head">
    <div>
      <span class="kicker">数据副刊 · DATA SUPPLEMENT</span>
      <h1 class="head__title serif">统计副刊</h1>
    </div>
    <button class="btn btn--ghost btn--sm btn--ico head__print" @click="printReport">
      <AppIcon name="print" :size="16" />打印本期
    </button>
  </header>
  <p class="print-only print-title serif">爪爪日报 · {{ monthLabel(month) }} 数据副刊</p>

  <div class="monthnav">
    <button class="btn btn--ghost btn--sm" aria-label="上一月" @click="month = addMonths(month, -1)">‹</button>
    <div class="monthnav__label serif">{{ monthLabel(month) }}</div>
    <button class="btn btn--ghost btn--sm" aria-label="下一月" @click="month = addMonths(month, 1)">›</button>
  </div>

  <section class="tiles">
    <div class="card tile">
      <span>总支出</span>
      <b class="num">{{ fmtMoney(stats.expense) }}</b>
      <small v-if="mom" class="num tile__mom" :class="mom.pct > 0 ? 'tile__mom--up' : 'tile__mom--down'">
        {{ mom.pct > 0 ? '▲' : '▼' }} {{ fmtPct(Math.abs(mom.pct)) }} 较上月
      </small>
    </div>
    <div class="card tile"><span>总收入</span><b class="num amt-in">+{{ fmtMoney(stats.income) }}</b></div>
    <div class="card tile"><span>结余</span><b class="num" :style="stats.net < 0 ? 'color: var(--ink-red)' : ''">{{ fmtMoney(stats.net) }}</b></div>
    <div class="card tile"><span>日均支出</span><b class="num">{{ fmtMoney(stats.avg) }}</b></div>
  </section>

  <div class="duo">
    <div class="duo__col">
      <div class="sec-title">支出分类占比</div>
      <section class="card chart-card">
        <div ref="pieEl" class="chart chart--pie"></div>
        <p v-if="!byCategory.length" class="chart-empty pencil-note">本月还没有支出新闻可排版</p>
      </section>
    </div>
    <div class="duo__col">
      <div class="sec-title">近六个月收支趋势</div>
      <section class="card chart-card">
        <div ref="lineEl" class="chart chart--line"></div>
        <p class="chart-note pencil-note">实线是收入，虚线是支出——两条线离得越开，猫粮越充足。</p>
      </section>
    </div>
  </div>

  <div class="duo">
    <div class="duo__col">
      <div class="sec-title">消费来源分布</div>
      <section class="card chart-card">
        <div ref="barEl" class="chart chart--bar"></div>
        <p v-if="!byAccount.length" class="chart-empty pencil-note">暂无来源数据</p>
      </section>
    </div>
    <div class="duo__col">
      <div class="sec-title">分类排行</div>
      <section class="card ranks">
        <div v-for="[name, v] in topCat" :key="name" class="rank">
          <span class="rank__name">{{ name }}</span>
          <div class="rank__bar"><i :style="{ width: (v / maxCat * 100).toFixed(1) + '%' }"></i></div>
          <span class="rank__val num">{{ fmtMoney(v) }}</span>
        </div>
        <p v-if="!topCat.length" class="rank--empty">本月暂无支出</p>
      </section>
    </div>
  </div>

  <div class="sec-title">标签排行</div>
  <section class="card ranks">
    <div v-for="t in topTags" :key="t.tag" class="rank">
      <span class="rank__name">#{{ t.tag }}</span>
      <div class="rank__bar rank__bar--tag"><i :style="{ width: (t.amount / maxTag * 100).toFixed(1) + '%' }"></i></div>
      <span class="rank__val num">{{ fmtMoney(t.amount) }}<small class="rank__count">· {{ t.count }}笔</small></span>
    </div>
    <p v-if="!topTags.length" class="rank--empty">本月支出未使用标签</p>
    <p v-if="topTags.length" class="rank--note">一笔支出含多个标签时分别计入各标签,合计可能大于当月总支出</p>
  </section>

  <div class="sec-title">年度总览</div>
  <section class="card chart-card">
    <div class="year-chips">
      <button
        v-for="y in years" :key="y"
        class="chip" :class="{ 'chip--on': year === y }" @click="year = y"
      >{{ y }}年</button>
    </div>
    <div class="year-tiles">
      <div class="yt"><span>总支出</span><b class="num">{{ fmtMoney(yearStats.expense) }}</b></div>
      <div class="yt"><span>总收入</span><b class="num amt-in">+{{ fmtMoney(yearStats.income) }}</b></div>
      <div class="yt"><span>结余</span><b class="num" :style="yearStats.net < 0 ? 'color: var(--ink-red)' : ''">{{ fmtMoney(yearStats.net) }}</b></div>
      <div class="yt"><span>月均支出</span><b class="num">{{ fmtMoney(yearStats.avg) }}</b></div>
    </div>
    <div ref="yearEl" class="chart chart--year"></div>
  </section>

  <div class="sec-title">资产走势</div>
  <section class="card chart-card">
    <div class="nw-head">
      <div class="yt yt--left"><span>当前总资产</span><b class="num amt-in">¥{{ fmtMoney(netWorth.current) }}</b></div>
      <small class="nw-note">按各账户余额推算 · 含负债(信用卡负余额)</small>
    </div>
    <div ref="netEl" class="chart chart--net"></div>
  </section>

  <div class="stats-sign">
    <CatArt variant="wave" :size="66" class="stats-sign__cat" />
    <p class="pencil-note">—— 本期数据由猫咪编辑部核算，误差以你的账本为准 ——</p>
  </div>
</template>

<style scoped>
.head { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
.head__title { font-size: 24px; font-weight: 900; letter-spacing: 5px; margin: 2px 0 0; }
.head__print { flex: none; }
.monthnav { display: flex; align-items: center; justify-content: center; gap: 10px; margin-bottom: 16px; }
.monthnav__label { font-size: 16px; font-weight: 700; letter-spacing: 2px; min-width: 104px; text-align: center; }
.monthnav .btn { padding: 2px 11px; font-size: 17px; line-height: 1.3; }

.tiles { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
@media (min-width: 900px) { .tiles { grid-template-columns: repeat(4, 1fr); } }
.tile { display: flex; flex-direction: column; gap: 7px; padding: 14px 16px; border-top: 3px solid var(--gold-line); }
.tile span { font-size: 12px; color: var(--text-dim); letter-spacing: 2px; }
.tile b { font-size: 18px; font-family: var(--font-serif); }
.tile__mom { font-size: 11.5px; color: var(--text-faint); }
.tile__mom--up { color: var(--ink-red); }
.tile__mom--down { color: var(--ink-green); }

.duo { display: block; }
@media (min-width: 1000px) {
  .duo { display: grid; grid-template-columns: 1fr 1fr; gap: 0 22px; align-items: start; }
}
.duo__col { min-width: 0; }

.chart-card { padding: 10px 6px; }
.chart { width: 100%; }
.chart--pie { height: 290px; }
.chart--line { height: 252px; }
.chart--bar { height: max(150px, calc(v-bind('byAccount.length') * 36px)); }
.chart-empty { text-align: center; margin: -6px 0 10px; }
.chart-note { text-align: center; margin: 2px 8px 8px; font-size: 12px; }

.ranks { display: flex; flex-direction: column; gap: 12px; }
.rank { display: grid; grid-template-columns: 74px 1fr 92px; align-items: center; gap: 12px; }
.rank__name { font-size: 13px; color: var(--text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rank__bar { height: 9px; background: var(--card-2); border: 1px solid var(--line); border-radius: 5px; overflow: hidden; }
.rank__bar i { display: block; height: 100%; background: linear-gradient(90deg, var(--chart-1), var(--gold-deep)); }
.rank__bar--tag i { background: linear-gradient(90deg, var(--chart-4), #4a7a99); }
.rank__val { font-size: 13px; text-align: right; }
.rank--empty { color: var(--text-faint); text-align: center; margin: 8px 0; font-size: 13px; }

.year-chips { display: flex; gap: 8px; padding: 6px 10px 14px; flex-wrap: wrap; }
.year-tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; padding: 0 10px 14px; }
.yt { display: flex; flex-direction: column; gap: 4px; align-items: center; }
.yt--left { align-items: flex-start; }
.yt span { font-size: 11px; color: var(--text-faint); letter-spacing: 1px; }
.yt b { font-size: 14px; font-family: var(--font-serif); }
.chart--year { height: 230px; }
.chart--net { height: 210px; }
.nw-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; padding: 6px 10px 10px; flex-wrap: wrap; }
.nw-note { font-size: 11px; color: var(--text-faint); }
.rank__count { color: var(--text-faint); font-size: 11px; margin-left: 4px; }
.rank--note { color: var(--text-faint); font-size: 11.5px; margin: 10px 0 2px; }
.stats-sign { display: flex; flex-direction: column; align-items: center; gap: 2px; text-align: center; margin: 26px 0 8px; font-size: 12px; }
.stats-sign__cat { transform: rotate(-3deg); }
.stats-sign .pencil-note { margin: 0; }
@media (max-width: 479px) {
  .year-tiles { grid-template-columns: repeat(2, 1fr); gap: 12px; }
  .rank { grid-template-columns: 64px 1fr 84px; gap: 8px; }
}
</style>