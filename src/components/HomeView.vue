<script setup>
import { ref, computed } from 'vue'
import { store, showToast, monthSummary, accountById, categoryById, budgetStatus, upcomingBills, monthlyFixed, payRecurring, contributeGoal } from '../store.js'
import { fmtMoney, monthKey, monthLabel, addMonths, fmtDay, weekLabel, nowDateKey, dueLabel, daysFromToday, ACCOUNT_META } from '../lib/format.js'
import AppIcon from './AppIcon.vue'
import DataIcon from './DataIcon.vue'
import CatArt from './CatArt.vue'

const emit = defineEmits(['edit'])

const month = ref(monthKey(nowDateKey()))
const filterAccount = ref('all')
const filterType = ref('all')
const keyword = ref('')

const summary = computed(() => monthSummary(month.value))

const budgetRows = computed(() => budgetStatus(month.value))
const budgetTotal = computed(() => budgetRows.value.reduce(
  (acc, b) => ({ amount: acc.amount + b.budget, spent: acc.spent + b.spent }),
  { amount: 0, spent: 0 }
))
const budgetPct = (b) => Math.min(100, (b.spent / b.budget) * 100).toFixed(1)

/** 周期账单:30 天内待缴(当前月视图也顺带展示当月已过的) */
const bills = computed(() => upcomingBills(30))
const fixedMonthly = computed(() => monthlyFixed())
function payBill(id) {
  const tx = payRecurring(id)
  if (tx) showToast(`已入账 ${fmtMoney(tx.amount)} · ${tx.payee}`)
}

/** 储蓄目标:首页最多展示 3 条,完整管理在设置页 */
const goals = computed(() => store.goals.slice(0, 3))
const goalsMore = computed(() => Math.max(0, store.goals.length - 3))
function goalPct(g) {
  return Math.min(100, ((Number(g.saved) || 0) / (Number(g.target) || 1)) * 100).toFixed(1)
}
/** 按目标月倒推每月需存;仅未来且 ≥1 个月时显示 */
function goalMonthlyNeed(g) {
  if (!g.deadline) return null
  const need = (Number(g.target) || 0) - (Number(g.saved) || 0)
  if (need <= 0) return null
  const [y, m] = g.deadline.slice(0, 7).split('-').map(Number)
  const now = new Date()
  const months = (y - now.getFullYear()) * 12 + (m - (now.getMonth() + 1))
  if (months < 1) return null
  return { months, per: need / months }
}
const goalInputs = ref({})
function saveGoalContribution(id) {
  const v = goalInputs.value[id]
  const g = contributeGoal(id, v)
  if (g) showToast(`已存入 ${fmtMoney(v)} · ${g.name}`)
  goalInputs.value[id] = ''
}

const filtered = computed(() => {
  return store.txs
    .filter((t) => monthKey(t.date) === month.value)
    .filter((t) => filterType.value === 'all' || t.type === filterType.value)
    .filter((t) => filterAccount.value === 'all'
      || t.accountId === filterAccount.value
      || t.toAccountId === filterAccount.value)
    .filter((t) => !keyword.value
      || (t.payee + t.note + (t.tags || []).join(' ')).toLowerCase().includes(keyword.value.toLowerCase()))
    .sort((a, b) => b.date.localeCompare(a.date))
})

/** 按日分组 */
const groups = computed(() => {
  const map = new Map()
  for (const t of filtered.value) {
    const day = t.date.slice(0, 10)
    if (!map.has(day)) map.set(day, [])
    map.get(day).push(t)
  }
  return [...map.entries()].map(([day, list]) => ({
    day,
    expense: list.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0),
    income: list.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0),
    list
  }))
})

/** 头版一句话点评：随结余/超支/账单变化 */
const editorial = computed(() => {
  const over = budgetRows.value.filter((b) => b.remain < 0)
  const soon = bills.value.filter((b) => daysFromToday(b.nextDate) <= 3)
  if (over.length) return `「${over[0].name}」已超出预算，主编建议先停一停爪子。`
  if (soon.length) return `「${soon[0].name}」快到期了，别忘了留一份小鱼干的钱。`
  if (!store.txs.length) return '本版空白，等你的第一条生活新闻。'
  if (summary.value.net < 0) return '本月支出跑在收入前面，夜班编辑部正在核算。'
  if (summary.value.income && summary.value.net / summary.value.income > 0.4) return '结余可观，主编批准存入猫罐头基金。'
  return '收支平稳，日子照旧过，账照旧记。'
})

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
  if (t.type === 'transfer') return '转账'
  const parts = [categoryById(t.categoryId)?.name, t.note].filter(Boolean)
  return parts.join(' · ')
}
function accountBadge(t) {
  const acc = accountById(t.accountId)
  if (!acc) return ''
  return acc.type === 'wechat' ? '微信' : acc.type === 'alipay' ? '支付宝' : acc.name
}
</script>

<template>
  <!-- 刊号条 -->
  <div class="edition">
    <span class="kicker">头版 · FRONT PAGE</span>
    <div class="monthnav">
      <button class="btn btn--ghost btn--sm" aria-label="上一月" @click="month = addMonths(month, -1)">‹</button>
      <div class="monthnav__label serif">{{ monthLabel(month) }}</div>
      <button class="btn btn--ghost btn--sm" aria-label="下一月" @click="month = addMonths(month, 1)">›</button>
    </div>
    <span class="edition__count num">{{ store.txs.length }} 笔存档</span>
  </div>

  <!-- 头条：本月收支 -->
  <section class="card card--gold overview">
    <span class="tape" style="top: -11px; left: 26px"></span>
    <span class="tape tape--green tape--right" style="top: -9px; right: 30px; width: 74px"></span>
    <div class="overview__item">
      <span class="overview__label"><AppIcon name="salary" :size="15" />收入</span>
      <b class="num amt-in">+{{ fmtMoney(summary.income) }}</b>
    </div>
    <div class="overview__divider"></div>
    <div class="overview__item">
      <span class="overview__label"><AppIcon name="shopping" :size="15" />支出</span>
      <b class="num">{{ fmtMoney(summary.expense) }}</b>
    </div>
    <div class="overview__divider"></div>
    <div class="overview__item">
      <span class="overview__label"><AppIcon name="piggy" :size="15" />结余</span>
      <b class="num" :class="summary.net >= 0 ? 'amt-in' : ''" :style="summary.net < 0 ? 'color: var(--ink-red)' : ''">
        {{ summary.net >= 0 ? '+' : '' }}{{ fmtMoney(summary.net) }}
      </b>
    </div>
    <p class="overview__note pencil-note">{{ editorial }}</p>
  </section>

  <div class="frontpage">
    <!-- 左栏：账目流水 -->
    <div class="frontpage__main">
      <div class="sec-title">生活流水账</div>

      <div class="chips">
        <button
          v-for="ft in [['all', '全部'], ['expense', '支出'], ['income', '收入'], ['transfer', '转账']]" :key="ft[0]"
          class="chip" :class="{ 'chip--on': filterType === ft[0] }" @click="filterType = ft[0]"
        >{{ ft[1] }}</button>
        <span class="chips__gap"></span>
        <button class="chip" :class="{ 'chip--on': filterAccount === 'all' }" @click="filterAccount = 'all'">全部来源</button>
        <button
          v-for="a in store.accounts" :key="a.id"
          class="chip" :class="{ 'chip--on': filterAccount === a.id }"
          @click="filterAccount = a.id"
        ><DataIcon :icon="ACCOUNT_META[a.type]?.icon || ':acc-other'" :size="14" /> {{ a.name }}</button>
      </div>

      <div class="search-wrap">
        <AppIcon name="search" :size="16" class="search-wrap__icon" />
        <input v-model="keyword" class="input search" placeholder="检索旧报：备注 / 商户 / 标签…（按 / 聚焦）" />
      </div>

      <section v-for="g in groups" :key="g.day" class="daygroup">
        <div class="daygroup__head">
          <span class="daygroup__date serif">{{ fmtDay(g.day) }} {{ weekLabel(g.day) }}</span>
          <span class="num daygroup__sum">
            <template v-if="g.expense">支 {{ fmtMoney(g.expense) }}</template>
            <template v-if="g.expense && g.income"> · </template>
            <template v-if="g.income"><span class="amt-in">收 {{ fmtMoney(g.income) }}</span></template>
          </span>
        </div>
        <div class="card list">
          <button v-for="t in g.list" :key="t.id" class="tx" @click="emit('edit', { tx: t })">
            <span class="tx__icon">
              <AppIcon v-if="t.type === 'transfer'" name="transfer" :size="19" />
              <DataIcon v-else :icon="txCategoryIcon(t)" :size="20" />
            </span>
            <span class="tx__body">
              <span class="tx__title">{{ txTitle(t) }}</span>
              <span class="tx__sub">
                <span v-if="accountBadge(t)" class="badge-src">{{ accountBadge(t) }}</span>
                {{ txSub(t) }}
                <span v-for="tag in (t.tags || []).slice(0, 2)" :key="tag" class="tag">#{{ tag }}</span>
              </span>
            </span>
            <span class="tx__amount num" :class="t.type === 'income' ? 'amt-in' : 'amt-out'">
              {{ t.type === 'income' ? '+' : t.type === 'transfer' ? '⇄ ' : '-' }}{{ fmtMoney(t.amount) }}
            </span>
          </button>
        </div>
      </section>

      <div v-if="!groups.length" class="empty card">
        <CatArt variant="sleep" :size="168" class="empty__cat" />
        <p class="empty__title serif">{{ keyword || filterAccount !== 'all' || filterType !== 'all' ? '没翻到符合条件的旧报' : '本月还没有新闻' }}</p>
        <p class="empty__hint">点下面的「记一笔」投一条稿，或在设置里导入微信 / 支付宝账单</p>
        <button class="btn btn--gold btn--ico" style="margin-top: 12px" @click="emit('edit', {})">
          <AppIcon name="pen" :size="16" />记一笔
        </button>
      </div>
    </div>

    <!-- 右栏：预算 / 存钱罐 / 催缴单 -->
    <aside class="frontpage__side">
      <div class="sec-title">编辑部专栏</div>

      <!-- 月度预算 -->
      <section v-if="budgetRows.length" class="card budget">
        <div class="budget__head">
          <span class="budget__title serif"><AppIcon name="wallet" :size="16" />本月口粮预算<template v-if="budgetRows.some((b) => b.carryover)">（含结转）</template></span>
        </div>
        <div class="num budget__sum">已用 {{ fmtMoney(budgetTotal.spent) }} / {{ fmtMoney(budgetTotal.amount) }}</div>
        <div class="budget__bar">
          <i :class="{ 'budget__bar--over': budgetTotal.spent > budgetTotal.amount }"
             :style="{ width: Math.min(100, budgetTotal.spent / budgetTotal.amount * 100).toFixed(1) + '%' }"></i>
        </div>
        <div class="budget__cats">
          <div v-for="b in budgetRows" :key="b.categoryId" class="budget__cat">
            <span class="budget__cat-icon"><DataIcon :icon="b.icon" :size="15" /></span>
            <span class="budget__cat-name">{{ b.name }}<i v-if="b.carryover" class="budget__carry" title="信封结转已启用">结转</i></span>
            <div class="budget__cat-bar">
              <i :class="{ 'budget__bar--over': b.remain < 0 }" :style="{ width: budgetPct(b) + '%' }"></i>
            </div>
            <span class="num budget__cat-val" :class="{ 'budget__cat-val--over': b.remain < 0 }">
              {{ b.remain >= 0 ? '余 ' + fmtMoney(b.remain) : '超 ' + fmtMoney(-b.remain) }}
            </span>
          </div>
        </div>
      </section>

      <!-- 储蓄目标 -->
      <section v-if="goals.length" class="card goals">
        <span class="tape tape--red" style="top: -10px; right: 22px; width: 66px"></span>
        <div class="goals__head">
          <span class="goals__title serif"><AppIcon name="piggy" :size="16" />猫罐头基金</span>
          <CatArt variant="savings" :size="52" class="goals__cat" />
        </div>
        <span class="goals__hint">单独追踪 · 不计入余额<template v-if="goalsMore"> · 还有 {{ goalsMore }} 条在设置页</template></span>
        <div v-for="g in goals" :key="g.id" class="goal">
          <div class="goal__row">
            <b class="goal__name">{{ g.name }}</b>
            <span class="num goal__val"><span class="amt-in">{{ fmtMoney(g.saved) }}</span> / {{ fmtMoney(g.target) }}</span>
          </div>
          <div class="goal__bar"><i :style="{ width: goalPct(g) + '%' }"></i></div>
          <div class="goal__row goal__row--sub">
            <small v-if="goalMonthlyNeed(g)" class="goal__need">每月需存 <span class="num">¥{{ fmtMoney(goalMonthlyNeed(g).per) }}</span> · 还差 {{ goalMonthlyNeed(g).months }} 个月</small>
            <small v-else-if="(Number(g.target) || 0) - (Number(g.saved) || 0) <= 0" class="goal__need goal__need--done">已达成，主编盖了章 ✓</small>
            <small v-else class="goal__need">还差 <span class="num">¥{{ fmtMoney((Number(g.target) || 0) - (Number(g.saved) || 0)) }}</span></small>
            <span class="goal__save">
              <input v-model="goalInputs[g.id]" class="input num goal__input" type="number" inputmode="decimal" min="0" placeholder="存入" :aria-label="`向 ${g.name} 存入金额`" />
              <button class="btn btn--ghost btn--sm" @click="saveGoalContribution(g.id)">存</button>
            </span>
          </div>
        </div>
      </section>

      <!-- 周期账单提醒 -->
      <section v-if="bills.length" class="card bills">
        <div class="bills__head">
          <span class="bills__title serif"><AppIcon name="bell" :size="16" />催缴通知</span>
          <span class="bills__fixed" v-if="fixedMonthly">每月固定 <span class="num">≈¥{{ fmtMoney(fixedMonthly) }}</span></span>
        </div>
        <div v-for="b in bills" :key="b.id" class="bill">
          <span class="bill__main">
            <b>{{ b.name }}</b>
            <small class="num bill__amount">¥{{ fmtMoney(b.amount) }}</small>
          </span>
          <span class="bill__due" :class="{ 'bill__due--over': daysFromToday(b.nextDate) < 0, 'bill__due--soon': daysFromToday(b.nextDate) >= 0 && daysFromToday(b.nextDate) <= 3 }">
            {{ dueLabel(b.nextDate) }} · {{ b.nextDate.slice(5).replace('-', '/') }}
          </span>
          <button class="btn btn--ghost btn--sm" @click="payBill(b.id)">缴账</button>
        </div>
      </section>

      <!-- 编辑部便签 -->
      <section class="memo">
        <span class="tape" style="top: -10px; left: 50%; margin-left: -34px; width: 68px"></span>
        <CatArt variant="wave" :size="76" class="memo__cat" />
        <p class="pencil-note">主编批注：小额也值得记，<br />月底的报表会替你说话。</p>
        <p class="memo__sign">—— 墨墨 · 猫咪编辑部</p>
      </section>
    </aside>
  </div>
</template>

<style scoped>
.edition {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  border-bottom: 1px solid var(--line); padding-bottom: 8px; margin-bottom: 16px;
}
.edition__count { font-size: 11.5px; color: var(--text-faint); white-space: nowrap; }
.monthnav { display: flex; align-items: center; justify-content: center; gap: 8px; }
.monthnav__label { font-size: 16px; font-weight: 700; letter-spacing: 2px; min-width: 104px; text-align: center; }
.monthnav .btn { padding: 2px 11px; font-size: 17px; line-height: 1.3; }

.overview {
  position: relative;
  display: flex; flex-wrap: wrap; align-items: stretch;
  padding: 18px 16px 14px; margin-bottom: 6px;
}
.overview__item { flex: 1; min-width: 88px; display: flex; flex-direction: column; gap: 6px; align-items: center; }
.overview__label { font-size: 12px; color: var(--text-dim); letter-spacing: 2px; display: inline-flex; align-items: center; gap: 5px; }
.overview__item b { font-size: clamp(16px, 2.4vw, 21px); font-weight: 700; font-family: var(--font-serif); }
.overview__divider { width: 1px; background: var(--gold-line); opacity: 0.6; }
.overview__note {
  flex-basis: 100%; text-align: center; margin: 12px 0 0;
  border-top: 1px dashed var(--gold-line); padding-top: 9px;
}

/* 报纸分栏 */
.frontpage { display: flex; flex-direction: column; }
.frontpage__side { order: -1; }
.frontpage__main { min-width: 0; }
@media (min-width: 1000px) {
  .frontpage {
    display: grid;
    grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
    gap: 26px;
    align-items: start;
  }
  .frontpage__side { order: 0; position: relative; }
  .frontpage__side::before {
    content: ''; position: absolute; left: -13px; top: 8px; bottom: 8px;
    border-left: 1px solid var(--line);
  }
  .frontpage__main > .sec-title, .frontpage__side > .sec-title { margin-top: 14px; }
}

.budget { padding: 15px 16px; margin-bottom: 14px; display: flex; flex-direction: column; gap: 9px; }
.budget__head { display: flex; align-items: baseline; justify-content: space-between; }
.budget__title { font-size: 14px; font-weight: 700; letter-spacing: 1px; color: var(--text); display: inline-flex; align-items: center; gap: 6px; }
.budget__sum { font-size: 12px; color: var(--text-faint); }
.budget__bar { height: 9px; border-radius: 5px; background: var(--card-2); border: 1px solid var(--line); overflow: hidden; }
.budget__bar i { display: block; height: 100%; background: linear-gradient(90deg, var(--gold), var(--gold-deep)); transition: width 0.3s; }
.budget__bar--over { background: linear-gradient(90deg, var(--ink-red), #a63c28) !important; }
.budget__cats { display: flex; flex-direction: column; gap: 8px; }
.budget__cat { display: grid; grid-template-columns: 18px 66px 1fr 84px; align-items: center; gap: 7px; }
.budget__cat-icon { display: flex; }
.budget__cat-name { font-size: 12.5px; color: var(--text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.budget__cat-bar { height: 6px; border-radius: 3px; background: var(--card-2); overflow: hidden; }
.budget__cat-bar i { display: block; height: 100%; border-radius: 3px; background: linear-gradient(90deg, var(--gold), var(--gold-deep)); }
.budget__cat-val { font-size: 11.5px; text-align: right; color: var(--text-faint); }
.budget__cat-val--over { color: var(--ink-red); font-weight: 600; }
.budget__carry {
  font-style: normal; font-size: 10px; color: var(--accent-ink);
  border: 1px solid var(--gold-line); border-radius: 4px; padding: 0 4px; margin-left: 4px;
}

.goals { position: relative; padding: 15px 16px; margin-bottom: 14px; display: flex; flex-direction: column; gap: 8px; }
.goals__head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.goals__title { font-size: 14px; font-weight: 700; letter-spacing: 1px; display: inline-flex; align-items: center; gap: 6px; }
.goals__cat { margin: -10px -4px -6px 0; transform: rotate(4deg); }
.goals__hint { font-size: 11px; color: var(--text-faint); }
.goal { display: flex; flex-direction: column; gap: 5px; padding-top: 9px; border-top: 1px dashed var(--line); }
.goal:first-of-type { border-top: none; padding-top: 2px; }
.goal__row { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.goal__name { font-size: 13.5px; font-weight: 600; }
.goal__val { font-size: 12.5px; color: var(--text-dim); }
.goal__bar { height: 8px; border-radius: 4px; background: var(--card-2); border: 1px solid var(--line); overflow: hidden; }
.goal__bar i { display: block; height: 100%; background: linear-gradient(90deg, var(--ink-green), #5c9c72); }
.goal__row--sub { justify-content: space-between; }
.goal__need { font-size: 11.5px; color: var(--text-faint); }
.goal__need--done { color: var(--ink-green); font-weight: 600; }
.goal__save { display: inline-flex; align-items: center; gap: 6px; }
.goal__input { width: 78px; padding: 4px 8px; font-size: 12.5px; text-align: right; }

.bills { padding: 15px 16px; margin-bottom: 14px; display: flex; flex-direction: column; gap: 2px; }
.bills__head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 6px; flex-wrap: wrap; }
.bills__title { font-size: 14px; font-weight: 700; letter-spacing: 1px; display: inline-flex; align-items: center; gap: 6px; }
.bills__fixed { font-size: 11.5px; color: var(--text-faint); }
.bills__fixed .num { color: var(--text-dim); }
.bill { display: flex; align-items: center; gap: 9px; padding: 7px 0; border-top: 1px dashed var(--line); }
.bill__main { flex: 1; min-width: 0; display: flex; align-items: baseline; gap: 8px; }
.bill__main b { font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bill__amount { font-size: 12px; color: var(--text-dim); }
.bill__due { flex: none; font-size: 11.5px; color: var(--text-faint); }
.bill__due--soon { color: var(--accent-ink); font-weight: 600; }
.bill__due--over { color: var(--ink-red); font-weight: 600; }

.memo {
  position: relative; margin: 20px 0 8px; padding: 16px 16px 12px;
  background: var(--card-2);
  border: 1px dashed var(--line-strong);
  border-radius: var(--radius-s);
  transform: rotate(-0.6deg);
  display: flex; flex-direction: column; align-items: center; gap: 4px;
}
.memo__cat { margin: -4px 0 2px; transform: rotate(-2deg); }
.memo .pencil-note { text-align: center; line-height: 1.75; margin: 4px 0 0; }
.memo__sign { font-family: var(--font-serif); font-size: 11px; color: var(--text-faint); margin: 2px 0 0; letter-spacing: 1px; }

.chips { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 10px; scrollbar-width: none; }
.chips::-webkit-scrollbar { display: none; }
.chips__gap { flex: none; width: 1px; background: var(--line-strong); margin: 4px 2px; }
.search-wrap { position: relative; margin: 2px 0 18px; }
.search-wrap .search { padding-left: 38px; }
.search-wrap__icon {
  position: absolute; left: 12px; top: 50%; transform: translateY(-50%);
  pointer-events: none;
}

.daygroup { margin-bottom: 18px; }
.daygroup__head {
  display: flex; justify-content: space-between; align-items: center;
  font-size: 12.5px; color: var(--text-dim); padding: 0 4px 7px;
  border-bottom: 1px solid var(--line);
  margin-bottom: 7px;
}
.daygroup__date { font-weight: 700; letter-spacing: 1px; }
.daygroup__sum { color: var(--text-faint); font-size: 12px; }

.list { padding: 4px 6px; }
.tx {
  display: flex; align-items: center; gap: 12px; width: 100%;
  padding: 10px; background: none; border: none; border-radius: var(--radius-s);
  cursor: pointer; color: var(--text); font-family: inherit; text-align: left;
  transition: background 0.12s, transform 0.12s;
}
.tx + .tx { border-top: 1px dotted var(--line); }
.tx:hover { background: var(--card-2); transform: translateX(2px); }
.tx__icon {
  width: 38px; height: 38px; border-radius: 11px; flex: none;
  display: flex; align-items: center; justify-content: center; font-size: 18px;
  background: var(--card-2); border: 1px solid var(--line);
}
.tx__body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.tx__title { font-size: 14.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tx__sub { font-size: 12px; color: var(--text-faint); display: flex; align-items: center; gap: 6px; min-width: 0; white-space: nowrap; overflow: hidden; }
.tx__amount { font-size: 15.5px; font-weight: 700; flex: none; font-family: var(--font-serif); }

.empty { text-align: center; padding: 30px 20px 34px; color: var(--text-dim); }
.empty__cat { margin: 0 auto 10px; }
.empty__title { font-size: 17px; font-weight: 700; letter-spacing: 2px; margin: 6px 0 4px; color: var(--text); }
.empty p { margin: 4px 0; }
.empty__hint { font-size: 12.5px; color: var(--text-faint); }
.empty .btn { justify-content: center; }

@media (min-width: 900px) {
  .chips { flex-wrap: wrap; }
}
@media (max-width: 479px) {
  .edition__count { display: none; }
  .budget__cat { grid-template-columns: 18px 58px 1fr 78px; }
}
</style>