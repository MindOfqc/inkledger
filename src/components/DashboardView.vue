<script setup>
/**
 * 看板 —— 打开账本的第一眼：今日收支、预算执行、趋势与待办。
 * 无 props，直接读全局 store；跳转沿用 App 的 hash 深链约定，
 * 同时向外 emit('navigate' / 'edit')，两种接线方式都能工作。
 */
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import * as echarts from 'echarts/core'
import { BarChart } from 'echarts/charts'
import { TooltipComponent, LegendComponent, GridComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import {
  store, monthSummary, txsOfMonth, budgetStatus, balanceOf,
  upcomingBills, monthlyFixed, accountById, categoryById,
  payRecurring, showUndoToast
} from '../store.js'
import {
  fmtMoney, fmtPct, monthKey, monthLabel, addMonths, addDays,
  nowDateKey, fmtDay, dueLabel, daysFromToday, ACCOUNT_META
} from '../lib/format.js'
import { replayBalances } from '../lib/networth.js'
import { sortTxs } from '../lib/ledger.js'
import AppIcon from './AppIcon.vue'
import DataIcon from './DataIcon.vue'
import CatArt from './CatArt.vue'

echarts.use([BarChart, TooltipComponent, LegendComponent, GridComponent, CanvasRenderer])

const emit = defineEmits(['edit', 'navigate'])

const month = monthKey(nowDateKey())

/* —— 导航：emit 优先，同时写 hash 兜底（App 的 #add / 视图深链约定） —— */
function go(target) {
  emit('navigate', target)
  const h = '#' + target
  // hash 已相同时先清掉，保证 hashchange 每次都触发
  if (location.hash === h) history.replaceState(null, '', location.pathname + location.search)
  location.hash = h
}
/** 记一笔：与 HomeView 相同走 edit 事件，再触发 App 的 #add 深链兜底 */
function openEditor() {
  emit('edit', {})
  if (location.hash.includes('add')) history.replaceState(null, '', location.pathname + location.search)
  location.hash = '#add'
}

/* —— 报头日期与问候 —— */
const now = new Date()
const WEEK = ['日', '一', '二', '三', '四', '五', '六']
const dateLine = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 · 周${WEEK[now.getDay()]}`
const hour = now.getHours()
const greeting = hour < 5 ? '夜深了' : hour < 11 ? '早上好' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : '晚上好'

/* —— KPI —— */
const monthTxs = computed(() => txsOfMonth(month))
const summary = computed(() => monthSummary(month))
const counts = computed(() => {
  let inc = 0, exp = 0
  for (const t of monthTxs.value) {
    if (t.type === 'income') inc += 1
    else if (t.type === 'expense') exp += 1
  }
  return { inc, exp }
})
/** 净资产：与 balanceOf 同口径（全量重放，含信用卡负债） */
const netWorth = computed(() => {
  const balances = replayBalances(store.txs, store.accounts, null)
  let sum = 0
  for (const v of balances.values()) sum += v
  return Math.round(sum * 100) / 100
})
/** 支出环比：上月为 0 或无数据时不展示 */
const mom = computed(() => {
  let last = 0
  for (const t of txsOfMonth(addMonths(month, -1))) {
    if (t.type === 'expense') last += t.amount
  }
  if (!last) return null
  return { pct: (summary.value.expense - last) / last }
})

/* —— 预算执行（budgetStatus 已按紧张程度排序，含信封结转口径） —— */
const allBudgets = computed(() => budgetStatus(month))
const budgetRows = computed(() => allBudgets.value.slice(0, 5))
const budgetMore = computed(() => Math.max(0, allBudgets.value.length - 5))
const budgetPct = (b) => (b.budget > 0 ? Math.min(100, (b.spent / b.budget) * 100) : 0).toFixed(1)

/* —— 本月分类 Top5（占当月总支出的份额） —— */
const topCats = computed(() => {
  const map = new Map()
  let total = 0
  for (const t of monthTxs.value) {
    if (t.type !== 'expense') continue
    total += t.amount
    const c = categoryById(t.categoryId)
    const key = c?.id || 'uncategorized'
    if (!map.has(key)) map.set(key, { name: c?.name || '未分类', icon: c?.icon || ':other', amount: 0 })
    map.get(key).amount += t.amount
  }
  const rows = [...map.values()].sort((a, b) => b.amount - a.amount).slice(0, 5)
  const max = rows[0]?.amount || 1
  return rows.map((r) => ({ ...r, share: total > 0 ? r.amount / total : 0, bar: (r.amount / max) * 100 }))
})

/* —— 账户余额 —— */
const accounts = computed(() => store.accounts.map((a) => ({
  id: a.id,
  name: a.name,
  type: a.type,
  meta: ACCOUNT_META[a.type] || ACCOUNT_META.other,
  balance: Math.round(balanceOf(a.id) * 100) / 100
})))
const hasCredit = computed(() => store.accounts.some((a) => a.type === 'credit'))

/* —— 近 7 天待还 —— */
const bills = computed(() => upcomingBills(7))
const fixedMonthly = computed(() => monthlyFixed())
function payBill(id) {
  const tx = payRecurring(id)
  if (tx) showUndoToast(`已入账 ${fmtMoney(tx.amount)} · ${tx.payee}`)
}

/* —— 最近流水（最新 8 笔） —— */
const recent = computed(() => sortTxs(store.txs, 'date-desc').slice(0, 8))
const todayKey = nowDateKey()
const yesterdayKey = addDays(todayKey, -1)
function txDateLabel(t) {
  const day = String(t.date).slice(0, 10)
  if (day === todayKey) return '今天'
  if (day === yesterdayKey) return '昨天'
  return fmtDay(t.date)
}
function txCategoryIcon(t) {
  return categoryById(t.categoryId)?.icon || ':other'
}
function txTitle(t) {
  if (t.type === 'transfer') {
    const from = accountById(t.accountId)?.name || '?'
    const to = accountById(t.toAccountId)?.name || '?'
    return `${from} → ${to}`
  }
  return t.payee || categoryById(t.categoryId)?.name || '账目'
}
function txSub(t) {
  const date = txDateLabel(t)
  if (t.type === 'transfer') return `${date} · 转账`
  const parts = [categoryById(t.categoryId)?.name, t.note].filter(Boolean)
  return [date, ...parts].join(' · ')
}

/* —— 墨墨批注：随预算 / 账单 / 结余变化的一句话 —— */
const editorial = computed(() => {
  if (!store.txs.length) return '账本还空着，记下第一笔，墨墨帮你盯着。'
  const over = allBudgets.value.filter((b) => b.remain < 0)
  if (over.length) return `「${over[0].name}」已超出预算，先停一停爪子喵。`
  const soon = bills.value.filter((b) => daysFromToday(b.nextDate) <= 3)
  if (soon.length) return `「${soon[0].name}」快到期了，记得留一份小鱼干的钱。`
  if (summary.value.net < 0) return '本月支出跑在收入前面，接下来悠着点花。'
  if (summary.value.income && summary.value.net / summary.value.income > 0.4) return '结余可观，可以考虑存进猫罐头基金。'
  return '收支平稳，日子照旧过，账照旧记。'
})

/* —— 近 6 个月收支趋势：紧凑柱状图，报刊色板 —— */
const trend = computed(() => {
  const keys = []
  for (let i = 5; i >= 0; i--) keys.push(addMonths(month, -i))
  const sums = new Map(keys.map((k) => [k, { inc: 0, exp: 0 }]))
  for (const t of store.txs) {
    const s = sums.get(monthKey(t.date))
    if (!s) continue
    if (t.type === 'income') s.inc += t.amount
    else if (t.type === 'expense') s.exp += t.amount
  }
  const r2 = (v) => Math.round(v * 100) / 100
  return {
    keys,
    labels: keys.map((k) => `${Number(k.slice(5, 7))}月`),
    inc: keys.map((k) => r2(sums.get(k).inc)),
    exp: keys.map((k) => r2(sums.get(k).exp))
  }
})
const trendEmpty = computed(() => trend.value.inc.every((v) => !v) && trend.value.exp.every((v) => !v))

const trendEl = ref(null)
let chart = null
let ro = null
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim()

function renderChart() {
  if (!trendEl.value) return
  chart?.dispose()
  chart = echarts.init(trendEl.value)
  const t = trend.value
  const axis = { color: css('--text-dim'), fontSize: 10.5 }
  const tip = {
    backgroundColor: css('--card'),
    borderColor: css('--line-strong'),
    textStyle: { color: css('--text'), fontSize: 12 }
  }
  chart.setOption({
    animation: false, // 克制动效：数据 / 主题变化时不做重排动画
    tooltip: {
      trigger: 'axis',
      ...tip,
      formatter: (ps) => {
        const i = ps[0]?.dataIndex ?? 0
        const lines = ps.map((p) => `${p.marker}${p.seriesName} ¥${fmtMoney(p.value)}`)
        return `${monthLabel(t.keys[i])}<br/>${lines.join('<br/>')}`
      }
    },
    legend: { data: ['收入', '支出'], textStyle: { color: css('--text-dim'), fontSize: 11 }, top: 0, itemWidth: 14, itemHeight: 8 },
    grid: { left: 8, right: 12, top: 30, bottom: 0, containLabel: true },
    xAxis: {
      type: 'category', data: t.labels,
      axisLabel: { ...axis, interval: 0 },
      axisTick: { show: false },
      axisLine: { lineStyle: { color: css('--line-strong') } }
    },
    yAxis: {
      type: 'value',
      axisLabel: { ...axis, formatter: (v) => (Math.abs(v) >= 10000 ? `${+(v / 10000).toFixed(1)}万` : v) },
      splitLine: { lineStyle: { color: css('--line') } }
    },
    series: [
      { name: '收入', type: 'bar', barWidth: 9, itemStyle: { borderRadius: 4, color: css('--chart-2') }, data: t.inc },
      { name: '支出', type: 'bar', barWidth: 9, itemStyle: { borderRadius: 4, color: css('--chart-3'), opacity: 0.9 }, data: t.exp }
    ]
  })
}

onMounted(async () => {
  await nextTick()
  renderChart()
  ro = new ResizeObserver(() => chart?.resize())
  if (trendEl.value?.parentElement) ro.observe(trendEl.value.parentElement)
})
onBeforeUnmount(() => { ro?.disconnect(); chart?.dispose(); chart = null })
watch([trend, () => store.settings.theme], renderChart)
</script>

<template>
  <!-- 报头：今日头版 -->
  <header class="dash-head">
    <div class="dash-head__meta">
      <span class="kicker">今日账况 · DAILY BRIEF</span>
      <span class="dash-head__date num">{{ dateLine }}</span>
    </div>
    <div class="dash-head__main">
      <div class="dash-head__text">
        <h1 class="dash-head__title serif">喵账本 · 看板</h1>
        <p class="dash-head__hi">{{ greeting }}，欢迎回到账房</p>
      </div>
      <CatArt variant="reading" :size="68" class="dash-head__cat" />
      <button class="btn btn--gold btn--ico dash-head__add" data-tour="add" @click="openEditor">
        <AppIcon name="pen" :size="16" />记一笔
      </button>
    </div>
    <div class="news-rule news-rule--thin"></div>
  </header>

  <!-- KPI：本月支出 / 收入 / 结余 / 净资产 -->
  <section class="kpis" data-tour="kpi">
    <div class="card kpi kpi--out">
      <span class="kpi__label"><AppIcon name="shopping" :size="14" />本月支出</span>
      <b class="num kpi__val">{{ fmtMoney(summary.expense) }}</b>
      <small class="kpi__sub num">
        {{ counts.exp }} 笔<template v-if="mom"> · <span :class="mom.pct > 0 ? 'kpi__up' : 'kpi__down'">{{ mom.pct > 0 ? '▲' : '▼' }}{{ fmtPct(Math.abs(mom.pct)) }}</span> 较上月</template>
      </small>
    </div>
    <div class="card kpi kpi--in">
      <span class="kpi__label"><AppIcon name="salary" :size="14" />本月收入</span>
      <b class="num kpi__val amt-in">+{{ fmtMoney(summary.income) }}</b>
      <small class="kpi__sub num">{{ counts.inc }} 笔</small>
    </div>
    <div class="card kpi kpi--net">
      <span class="kpi__label"><AppIcon name="piggy" :size="14" />本月结余</span>
      <b class="num kpi__val" :class="summary.net >= 0 ? 'amt-in' : 'kpi__neg'">
        {{ summary.net >= 0 ? '+' : '' }}{{ fmtMoney(summary.net) }}
      </b>
      <small class="kpi__sub">收入 − 支出</small>
    </div>
    <div class="card kpi kpi--asset">
      <span class="kpi__label"><AppIcon name="wallet" :size="14" />净资产</span>
      <b class="num kpi__val" :class="{ kpi__neg: netWorth < 0 }">{{ fmtMoney(netWorth) }}</b>
      <small class="kpi__sub num">{{ store.accounts.length }} 个账户合计</small>
    </div>
  </section>

  <div class="dash-brief">
    <p class="pencil-note"><AppIcon name="paw" :size="14" />墨墨批注：{{ editorial }}</p>
  </div>

  <!-- 预算执行 -->
  <div data-tour="budget">
  <div class="sec-title">预算执行</div>
  <section v-if="budgetRows.length" class="card dash-budget">
    <div v-for="b in budgetRows" :key="b.categoryId" class="brow">
      <span class="brow__icon"><DataIcon :icon="b.icon" :size="15" /></span>
      <span class="brow__name" :title="b.name">{{ b.name }}<i v-if="b.carryover" class="brow__carry" title="信封结转已启用">结转</i></span>
      <div class="brow__mid">
        <div
          class="brow__bar" role="progressbar" aria-valuemin="0" aria-valuemax="100"
          :aria-valuenow="Number(budgetPct(b))" :aria-label="`${b.name}预算执行`"
        >
          <i :class="{ 'brow__bar--over': b.remain < 0 }" :style="{ width: budgetPct(b) + '%' }"></i>
        </div>
        <small class="brow__frac num">已用 {{ fmtMoney(b.spent) }} / {{ fmtMoney(b.budget) }}</small>
      </div>
      <span class="num brow__val" :class="{ 'brow__val--over': b.remain < 0 }">
        {{ b.remain >= 0 ? '余 ' + fmtMoney(b.remain) : '超 ' + fmtMoney(-b.remain) }}
      </span>
    </div>
    <p v-if="budgetMore" class="dash-note num">另有 {{ budgetMore }} 项预算，完整执行见「账目」页</p>
  </section>
  <section v-else class="card dash-empty">
    <p class="dash-empty__title">本月还没有设置预算</p>
    <p class="dash-empty__hint">给常花的分类定个额度，墨墨帮你盯着爪子</p>
    <button class="btn btn--ghost btn--sm btn--ico" @click="go('settings')">
      <AppIcon name="settings" :size="14" />去设置预算
    </button>
  </section>
  </div>

  <!-- 近 6 个月收支趋势 -->
  <div class="sec-title">近 6 个月收支趋势</div>
  <section class="card dash-chart-card">
    <div ref="trendEl" class="dash-chart"></div>
    <p v-if="trendEmpty" class="pencil-note dash-chart__note">近六个月还没有账目，记下第一笔就能看到趋势</p>
    <p v-else class="pencil-note dash-chart__note">绿柱是收入，红柱是支出——两根柱子离得越开，结余越充足。</p>
  </section>

  <!-- 分类 Top5 / 账户余额 -->
  <div class="dash-duo">
    <div class="dash-duo__col">
      <div class="sec-title">本月分类 Top5</div>
      <section class="card dash-cats">
        <div v-for="(c, i) in topCats" :key="c.name" class="cat-rank">
          <span class="cat-rank__no serif num">{{ i + 1 }}</span>
          <span class="cat-rank__icon"><DataIcon :icon="c.icon" :size="16" /></span>
          <span class="cat-rank__name" :title="c.name">{{ c.name }}</span>
          <div
            class="cat-rank__bar" role="progressbar" aria-valuemin="0" aria-valuemax="100"
            :aria-valuenow="Number(c.bar.toFixed(1))" :aria-label="`${c.name}支出占比`"
          >
            <i :style="{ width: c.bar.toFixed(1) + '%' }"></i>
          </div>
          <span class="cat-rank__val num">{{ fmtMoney(c.amount) }}<small>占 {{ fmtPct(c.share) }}</small></span>
        </div>
        <div v-if="!topCats.length" class="dash-empty">
          <p class="dash-empty__title">本月还没有支出</p>
          <p class="dash-empty__hint">记一笔后，这里会列出花得最多的分类</p>
        </div>
      </section>
    </div>
    <div class="dash-duo__col">
      <div class="sec-title">账户余额</div>
      <section class="card dash-accounts">
        <div v-for="a in accounts" :key="a.id" class="acc-row">
          <span class="acc-row__icon"><DataIcon :icon="a.meta.icon" :size="17" /></span>
          <span class="acc-row__name">{{ a.name }}<small>{{ a.meta.label }}</small></span>
          <span class="num acc-row__bal" :class="{ 'acc-row__bal--neg': a.balance < 0 }">{{ fmtMoney(a.balance) }}</span>
        </div>
        <div v-if="!accounts.length" class="dash-empty">
          <p class="dash-empty__title">还没有账户</p>
          <button class="btn btn--ghost btn--sm" @click="go('settings')">去设置添加</button>
        </div>
        <p v-if="hasCredit" class="dash-note">信用卡负余额为待还负债，已计入净资产</p>
      </section>
    </div>
  </div>

  <!-- 近 7 天待还 -->
  <div class="sec-title">近 7 天待还</div>
  <section class="card dash-bills">
    <template v-if="bills.length">
      <div class="dash-bills__head">
        <span class="dash-bills__count num">{{ bills.length }} 笔待缴</span>
        <span v-if="fixedMonthly" class="dash-note">每月固定 ≈¥{{ fmtMoney(fixedMonthly) }}</span>
      </div>
      <div v-for="b in bills" :key="b.id" class="bill-row">
        <span class="bill-row__main">
          <b :title="b.name">{{ b.name }}</b>
          <small class="num">¥{{ fmtMoney(b.amount) }}</small>
        </span>
        <span
          class="bill-row__due num"
          :class="{
            'bill-row__due--over': daysFromToday(b.nextDate) < 0,
            'bill-row__due--soon': daysFromToday(b.nextDate) >= 0 && daysFromToday(b.nextDate) <= 3
          }"
        >{{ dueLabel(b.nextDate) }} · {{ b.nextDate.slice(5).replace('-', '/') }}</span>
        <button class="btn btn--ghost btn--sm" @click="payBill(b.id)">缴账</button>
      </div>
    </template>
    <div v-else class="dash-empty">
      <CatArt variant="sleep" :size="96" />
      <p class="dash-empty__title">暂无待还账单</p>
      <p class="dash-empty__hint">七天之内没有要缴的账单，安心喵～</p>
    </div>
  </section>

  <!-- 最近流水 -->
  <div class="sec-title">最近流水</div>
  <section class="card dash-recent">
    <button v-for="t in recent" :key="t.id" class="tx-mini" @click="emit('edit', { tx: t })">
      <span class="tx-mini__icon">
        <AppIcon v-if="t.type === 'transfer'" name="transfer" :size="17" />
        <DataIcon v-else :icon="txCategoryIcon(t)" :size="17" />
      </span>
      <span class="tx-mini__body">
        <span class="tx-mini__title">{{ txTitle(t) }}</span>
        <span class="tx-mini__sub">{{ txSub(t) }}</span>
      </span>
      <span
        class="tx-mini__amt num"
        :class="t.type === 'income' ? 'amt-in' : t.type === 'transfer' ? 'tx-mini__amt--transfer' : 'tx-mini__amt--out'"
      >{{ t.type === 'income' ? '+' : t.type === 'transfer' ? '⇄ ' : '-' }}{{ fmtMoney(t.amount) }}</span>
    </button>
    <div v-if="!recent.length" class="dash-empty">
      <CatArt variant="sleep" :size="110" />
      <p class="dash-empty__title">还没有账目</p>
      <p class="dash-empty__hint">点「记一笔」记下第一笔，或在设置里导入微信 / 支付宝账单</p>
      <button class="btn btn--gold btn--sm btn--ico" @click="openEditor">
        <AppIcon name="pen" :size="14" />记一笔
      </button>
    </div>
    <button v-if="recent.length" class="dash-more" @click="go('home')">查看全部账目 ›</button>
  </section>
</template>

<style scoped>
/* —— 报头 —— */
.dash-head { margin-bottom: 4px; }
.dash-head__meta {
  display: flex; justify-content: space-between; align-items: baseline;
  gap: 10px; flex-wrap: wrap;
  border-bottom: 1px solid var(--line-strong); padding-bottom: 6px;
  font-family: var(--font-serif);
}
.dash-head__meta .kicker { letter-spacing: 2px; }
.dash-head__date { font-size: 11.5px; letter-spacing: 1px; color: var(--text-dim); white-space: nowrap; }
.dash-head__main { display: flex; align-items: center; gap: 12px; padding: 12px 0 10px; }
.dash-head__text { flex: 1; min-width: 0; }
.dash-head__title {
  font-size: clamp(19px, 4.6vw, 26px); font-weight: 900;
  letter-spacing: 3px; margin: 0; line-height: 1.25; color: var(--text);
}
.dash-head__hi { font-size: 12px; color: var(--text-faint); margin: 3px 0 0; }
.dash-head__cat { flex: none; width: 64px; transform: rotate(-2deg); }
.dash-head__add { flex: none; }

/* —— KPI：375px 下 2×2，桌面一行四张 —— */
.kpis { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 14px; }
@media (min-width: 900px) { .kpis { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
.kpi {
  display: flex; flex-direction: column; gap: 6px;
  padding: 13px 14px; min-width: 0;
  border-top: 3px solid var(--gold-line);
}
.kpi--out { border-top-color: var(--ink-red); }
.kpi--in { border-top-color: var(--ink-green); }
.kpi--net { border-top-color: var(--gold); }
.kpi--asset { border-top-color: var(--chart-4); }
.kpi__label {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 11.5px; letter-spacing: 1.5px; color: var(--text-dim);
}
.kpi__val {
  font-size: clamp(15px, 4.4vw, 20px); font-family: var(--font-serif); font-weight: 700;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.kpi--out .kpi__val { color: var(--ink-red); }
.kpi__neg { color: var(--ink-red); }
.kpi__sub { font-size: 11px; color: var(--text-faint); }
.kpi__up { color: var(--ink-red); }
.kpi__down { color: var(--ink-green); }

.dash-brief { display: flex; justify-content: center; margin-top: 12px; }
.dash-brief .pencil-note {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 12.5px; text-align: center; margin: 0;
}

/* —— 预算执行 —— */
.dash-budget { display: flex; flex-direction: column; gap: 10px; padding: 14px 16px; }
.brow { display: grid; grid-template-columns: 18px 72px minmax(0, 1fr) 86px; align-items: center; gap: 8px; }
.brow__icon { display: flex; }
.brow__name { font-size: 12.5px; color: var(--text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.brow__carry {
  font-style: normal; font-size: 10px; color: var(--accent-ink);
  border: 1px solid var(--gold-line); border-radius: 4px; padding: 0 3px; margin-left: 4px;
}
.brow__mid { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.brow__bar { height: 7px; border-radius: 4px; background: var(--card-2); border: 1px solid var(--line); overflow: hidden; }
.brow__bar i { display: block; height: 100%; background: linear-gradient(90deg, var(--gold), var(--gold-deep)); transition: width 0.3s; }
.brow__bar--over { background: linear-gradient(90deg, var(--ink-red), #a63c28) !important; }
.brow__frac { font-size: 10px; color: var(--text-faint); text-align: right; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.brow__val { font-size: 11.5px; text-align: right; color: var(--text-dim); white-space: nowrap; }
.brow__val--over { color: var(--ink-red); font-weight: 600; }

/* —— 趋势图 —— */
.dash-chart-card { padding: 10px 8px 8px; }
.dash-chart { width: 100%; height: 210px; }
.dash-chart__note { display: block; text-align: center; margin: 4px 8px 2px; font-size: 12px; }

/* —— 双栏：桌面并排，移动堆叠 —— */
.dash-duo { display: block; }
@media (min-width: 1000px) {
  .dash-duo { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 0 22px; align-items: start; }
}
.dash-duo__col { min-width: 0; }

/* —— 分类 Top5 —— */
.dash-cats { display: flex; flex-direction: column; gap: 11px; padding: 14px 16px; }
.cat-rank { display: grid; grid-template-columns: 18px 20px 64px minmax(0, 1fr) 92px; align-items: center; gap: 8px; }
.cat-rank__no { font-size: 13px; font-weight: 700; color: var(--accent-ink); text-align: center; }
.cat-rank__icon { display: flex; }
.cat-rank__name { font-size: 12.5px; color: var(--text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cat-rank__bar { height: 8px; background: var(--card-2); border: 1px solid var(--line); border-radius: 5px; overflow: hidden; }
.cat-rank__bar i { display: block; height: 100%; background: linear-gradient(90deg, var(--chart-1), var(--gold-deep)); transition: width 0.3s; }
.cat-rank__val { font-size: 12.5px; text-align: right; display: flex; flex-direction: column; gap: 1px; }
.cat-rank__val small { font-size: 10px; color: var(--text-faint); }

/* —— 账户余额 —— */
.dash-accounts { display: flex; flex-direction: column; padding: 8px 16px; }
.acc-row { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-top: 1px dashed var(--line); }
.acc-row:first-child { border-top: none; }
.acc-row__icon {
  width: 32px; height: 32px; flex: none;
  display: flex; align-items: center; justify-content: center;
  background: var(--card-2); border: 1px solid var(--line); border-radius: 9px;
}
.acc-row__name { flex: 1; min-width: 0; font-size: 13.5px; display: flex; flex-direction: column; overflow: hidden; }
.acc-row__name small { font-size: 11px; color: var(--text-faint); }
.acc-row__bal { font-size: 14px; font-weight: 600; font-family: var(--font-serif); flex: none; }
.acc-row__bal--neg { color: var(--ink-red); }

.dash-note { font-size: 11px; color: var(--text-faint); margin: 8px 0 2px; }
.dash-bills__head .dash-note { margin: 0; }

/* —— 待还账单 —— */
.dash-bills { padding: 12px 16px; display: flex; flex-direction: column; gap: 2px; }
.dash-bills__head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; margin-bottom: 4px; flex-wrap: wrap; }
.dash-bills__count { font-size: 11.5px; color: var(--text-faint); }
.bill-row { display: flex; align-items: center; gap: 9px; padding: 8px 0; border-top: 1px dashed var(--line); }
.bill-row__main { flex: 1; min-width: 0; display: flex; align-items: baseline; gap: 8px; }
.bill-row__main b { font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bill-row__main small { font-size: 12px; color: var(--text-dim); flex: none; }
.bill-row__due { flex: none; font-size: 11.5px; color: var(--text-faint); }
.bill-row__due--soon { color: var(--accent-ink); font-weight: 600; }
.bill-row__due--over { color: var(--ink-red); font-weight: 600; }

/* —— 最近流水 —— */
.dash-recent { padding: 6px 8px; }
.tx-mini {
  display: flex; align-items: center; gap: 10px; width: 100%; min-width: 0;
  padding: 9px 8px; background: none; border: none; border-radius: var(--radius-s);
  cursor: pointer; color: var(--text); font-family: inherit; text-align: left;
  transition: background 0.12s;
}
.tx-mini + .tx-mini { border-top: 1px dotted var(--line); }
.tx-mini:hover { background: var(--card-2); }
.tx-mini__icon {
  width: 34px; height: 34px; flex: none;
  display: flex; align-items: center; justify-content: center;
  background: var(--card-2); border: 1px solid var(--line); border-radius: 10px;
}
.tx-mini__body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.tx-mini__title { font-size: 13.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tx-mini__sub { font-size: 11px; color: var(--text-faint); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tx-mini__amt { flex: none; font-size: 14px; font-weight: 700; font-family: var(--font-serif); }
.tx-mini__amt--out { color: var(--ink-red); }
.tx-mini__amt--transfer { color: var(--text-faint); }
.dash-more {
  display: block; width: 100%; margin-top: 4px; padding: 9px 8px 7px;
  background: none; border: none; border-top: 1px dashed var(--line-strong);
  color: var(--accent-ink); font-family: var(--font-serif); font-size: 12.5px; letter-spacing: 2px;
  cursor: pointer; transition: color 0.15s;
}
.dash-more:hover { color: var(--gold-deep); }

/* —— 空态 —— */
.dash-empty { display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center; padding: 18px 12px; }
.dash-empty__title { font-size: 14px; font-weight: 600; color: var(--text-dim); margin: 0; }
.dash-empty__hint { font-size: 12px; color: var(--text-faint); margin: 0; }
.dash-empty .btn { margin-top: 6px; }

/* —— 375px 收紧 —— */
@media (max-width: 479px) {
  .dash-head__cat { width: 52px; }
  .dash-head__title { font-size: 18px; letter-spacing: 2px; }
  .dash-head__add { padding: 8px 12px; font-size: 13px; }
  .dash-chart { height: 190px; }
  .brow { grid-template-columns: 16px 62px minmax(0, 1fr) 78px; gap: 6px; }
  .cat-rank { grid-template-columns: 16px 18px 58px minmax(0, 1fr) 84px; gap: 6px; }
}
</style>