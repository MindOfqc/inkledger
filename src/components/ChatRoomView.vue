<script setup>
import { ref, computed, nextTick, onMounted, onBeforeUnmount, watch } from 'vue'
import { cloudUser, showToast } from '../store.js'
import { fetchChat, sendChat } from '../lib/api.js'
import Avatar from './Avatar.vue'
import AppIcon from './AppIcon.vue'
import CatArt from './CatArt.vue'

/**
 * 读者对话室 —— 全站读者共用的一间聊天室（数据落在 Cloudflare D1 ml_chat_messages）。
 * 15 秒轮询增量拉取；管理员发言带金箔高亮与「主编」印章；本人发言靠右贴纸色。
 * 服务端另有 2 秒发言冷却与 500 字上限，前端同步给出可见的倒计时与字数。
 */
const emit = defineEmits(['navigate'])

const MAX_CHARS = 500
const COOLDOWN_MS = 2000
const POLL_MS = 15000
const QUICK = ['🐱', '👋', '🎉', '💰', '🐾', '☕', '😹', '👍']

const messages = ref([])
const online = ref(0)
const draft = ref('')
const loading = ref(true)
const sending = ref(false)
const loadError = ref('')
const refreshing = ref(false)
const listEl = ref(null)
const inputEl = ref(null)
const atBottom = ref(true)
const unseen = ref(0)
const cooldown = ref(0)
const lastRefresh = ref(null)

let pollTimer = null
let coolTimer = null

/* —— 文本 / 时间 —— */
const chars = computed(() => Array.from(draft.value).length)
const overLimit = computed(() => chars.value > MAX_CHARS)
const canSend = computed(() => !!draft.value.trim() && !overLimit.value && !sending.value && cooldown.value <= 0)
const coolLabel = computed(() => (cooldown.value > 0 ? (cooldown.value / 1000).toFixed(1) + 's' : ''))
const adminCount = computed(() => new Set(messages.value.filter((m) => m.isAdmin).map((m) => m.userId)).size)
const peopleCount = computed(() => new Set(messages.value.map((m) => m.userId)).size)
const refreshLabel = computed(() => lastRefresh.value
  ? lastRefresh.value.toLocaleTimeString('zh-CN', { hour12: false })
  : '—')

const URL_RE = /(https?:\/\/[^\s<>"'）】]+)/g
function segments(text) {
  const out = []
  let last = 0
  for (const m of String(text).matchAll(URL_RE)) {
    if (m.index > last) out.push({ type: 'text', value: text.slice(last, m.index) })
    out.push({ type: 'link', value: m[0] })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ type: 'text', value: text.slice(last) })
  return out.length ? out : [{ type: 'text', value: text }]
}
const dayKey = (iso) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}
function dayLabel(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const today = new Date()
  const yest = new Date(today.getTime() - 86400000)
  if (dayKey(iso) === dayKey(today.toISOString())) return '今天'
  if (dayKey(iso) === dayKey(yest.toISOString())) return '昨天'
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`
}
function clockOf(iso) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
}
/** 在相邻消息之间插入日期分隔与「同一人连续发言」标记 */
const rows = computed(() => {
  const out = []
  let prev = null
  for (const m of messages.value) {
    const dk = dayKey(m.createdAt)
    if (!prev || dayKey(prev.createdAt) !== dk) out.push({ kind: 'day', id: 'day-' + dk + '-' + m.id, label: dayLabel(m.createdAt) })
    const grouped = !!prev
      && prev.userId === m.userId
      && dayKey(prev.createdAt) === dk
      && Date.parse(m.createdAt) - Date.parse(prev.createdAt) < 5 * 60000
    out.push({ kind: 'msg', id: m.id, msg: m, grouped, mine: m.userId === cloudUser.id })
    prev = m
  }
  return out
})

/* —— 滚动 —— */
function nearBottom() {
  const el = listEl.value
  if (!el) return true
  return el.scrollHeight - el.scrollTop - el.clientHeight < 90
}
function scrollToBottom(smooth = false) {
  const el = listEl.value
  if (!el) return
  el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
  unseen.value = 0
  atBottom.value = true
}
function onScroll() {
  atBottom.value = nearBottom()
  if (atBottom.value) unseen.value = 0
}

/* —— 拉取 —— */
async function load({ silent = false } = {}) {
  if (silent) refreshing.value = true
  const stick = nearBottom()
  const prevLast = messages.value[messages.value.length - 1]?.id
  try {
    const res = await fetchChat(120)
    const next = Array.isArray(res?.messages) ? res.messages : []
    online.value = Number(res?.online ?? 0)
    const added = prevLast ? next.findIndex((m) => m.id === prevLast) : -1
    const fresh = prevLast && added >= 0 ? next.length - added - 1 : (prevLast ? next.length : 0)
    messages.value = next
    loadError.value = ''
    lastRefresh.value = new Date()
    if (!silent) {
      await nextTick()
      scrollToBottom()
    } else if (fresh > 0) {
      if (stick) { await nextTick(); scrollToBottom(true) }
      else unseen.value += fresh
    }
  } catch (e) {
    if (!silent || !messages.value.length) loadError.value = e?.message || '对话室连接失败'
  } finally {
    loading.value = false
    refreshing.value = false
  }
}

/* —— 发送 —— */
const ERR_TEXT = {
  chat_slow_down: '说得太快啦，缓两秒再发',
  chat_empty: '先写点什么再发吧',
  invalid_input: '这条太长了，最多 500 字',
  unauthorized: '登录已过期，请重新登录后再发言',
}
function startCooldown() {
  cooldown.value = COOLDOWN_MS
  clearInterval(coolTimer)
  coolTimer = setInterval(() => {
    cooldown.value = Math.max(0, cooldown.value - 100)
    if (cooldown.value <= 0) clearInterval(coolTimer)
  }, 100)
}
async function onSend() {
  const content = draft.value.trim()
  if (!content || sending.value || cooldown.value > 0) return
  if (Array.from(content).length > MAX_CHARS) { showToast('一条最多 500 字，分两条说吧'); return }
  sending.value = true
  startCooldown()
  try {
    const res = await sendChat(content)
    draft.value = ''
    if (res?.message) {
      if (!messages.value.some((m) => m.id === res.message.id)) messages.value = [...messages.value, res.message]
    }
    await nextTick()
    scrollToBottom(true)
    inputEl.value?.focus()
    void load({ silent: true })
  } catch (e) {
    showToast(ERR_TEXT[e?.code] || ('发送失败：' + (e?.message || '网络异常')))
    if (e?.code === 'chat_slow_down') startCooldown()
  } finally {
    sending.value = false
  }
}
function onComposerKey(e) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); onSend() }
}
function addQuick(q) {
  const el = inputEl.value
  const cur = draft.value
  const start = el?.selectionStart ?? cur.length
  const end = el?.selectionEnd ?? cur.length
  draft.value = cur.slice(0, start) + q + cur.slice(end)
  nextTick(() => {
    if (!el) return
    el.focus()
    const pos = start + q.length
    el.setSelectionRange(pos, pos)
  })
}

/* —— 生命周期：轮询 + 页面可见时立即补拉 —— */
function startPoll() {
  clearInterval(pollTimer)
  pollTimer = setInterval(() => { if (!document.hidden) load({ silent: true }) }, POLL_MS)
}
function onVisible() { if (!document.hidden) load({ silent: true }) }
onMounted(() => {
  load()
  startPoll()
  document.addEventListener('visibilitychange', onVisible)
})
onBeforeUnmount(() => {
  clearInterval(pollTimer)
  clearInterval(coolTimer)
  document.removeEventListener('visibilitychange', onVisible)
})
watch(() => cloudUser.id, () => { if (cloudUser.id) load({ silent: true }) })
</script>

<template>
  <header class="page-head">
    <div class="page-head__text">
      <span class="kicker">读者来信 · CHAT ROOM</span>
      <h1 class="page-head__title serif">读者对话室</h1>
      <p class="page-head__note pencil-note">记账路上的同好都在这间屋子里，聊聊省钱心得，也聊聊猫。</p>
    </div>
    <CatArt variant="reading" :size="84" class="page-head__cat" />
  </header>

  <section class="card chat">
    <!-- 室规 / 状态条 -->
    <div class="chat__bar">
      <div class="chat__who">
        <span class="chip chip--on chat__online">
          <i class="dot" aria-hidden="true"></i>{{ online }} 位在线
        </span>
        <span class="chip chat__stat"><AppIcon name="users" :size="13" />{{ peopleCount }} 位发过言</span>
        <span v-if="adminCount" class="chip chat__stat chat__stat--admin">
          <AppIcon name="crown" :size="13" />{{ adminCount }} 位主编在场
        </span>
      </div>
      <div class="chat__tools">
        <span class="chat__sync num">{{ refreshing ? '正在取新信件…' : '更新于 ' + refreshLabel }}</span>
        <button class="btn btn--sm btn--ghost btn--ico" :disabled="refreshing" @click="load({ silent: true })">
          <AppIcon name="sync" :size="14" />刷新
        </button>
      </div>
    </div>

    <div class="chat__notice">
      <AppIcon name="shield" :size="15" />
      <span>友善发言，别贴账号密码与账单隐私。带 <span class="badge-admin"><AppIcon name="crown" :size="11" />主编</span> 金章的是平台管理员。</span>
      <button class="chat__notice-link" @click="emit('navigate', 'profile')">
        <AppIcon name="edit" :size="13" />改我的头像与昵称
      </button>
    </div>

    <div v-if="loadError && !messages.length" class="notice notice--warn">
      <AppIcon name="bell" :size="16" />
      <span>{{ loadError }}</span>
      <button class="btn btn--sm" @click="load()">重试</button>
    </div>

    <!-- 消息流 -->
    <div class="chat__scroll-wrap">
      <div ref="listEl" class="chat__list" @scroll.passive="onScroll">
        <template v-if="loading">
          <div v-for="i in 5" :key="i" class="msg-skeleton" :class="{ 'msg-skeleton--mine': i % 3 === 0 }">
            <span class="skeleton msg-skeleton__av"></span>
            <span class="skeleton msg-skeleton__body" :style="{ width: 38 + (i * 9) % 40 + '%' }"></span>
          </div>
        </template>

        <div v-else-if="!messages.length" class="empty-state">
          <CatArt variant="sleep" :size="128" />
          <p class="empty-state__title">屋子还很安静</p>
          <p class="empty-state__note">墨墨在报纸上打盹。发第一句话，把这间对话室叫醒吧 —— 比如今天你省下了哪一笔。</p>
          <button class="btn btn--gold btn--ico" @click="inputEl?.focus()">
            <AppIcon name="pen" :size="15" />写第一句
          </button>
        </div>

        <template v-else>
          <div class="chat__opening">
            <span>· 对话室开张 · 只保留最近 120 条来信 ·</span>
          </div>
          <template v-for="row in rows" :key="row.id">
            <div v-if="row.kind === 'day'" class="chat__day"><span>{{ row.label }}</span></div>
            <article
              v-else
              class="msg"
              :class="{
                'msg--mine': row.mine,
                'msg--admin': row.msg.isAdmin,
                'msg--grouped': row.grouped
              }"
            >
              <div class="msg__avatar">
                <Avatar
                  v-if="!row.grouped"
                  :src="row.msg.avatar"
                  :name="row.msg.nickname"
                  :size="38"
                  :admin="row.msg.isAdmin"
                />
                <span v-else class="msg__avatar-gap num">{{ clockOf(row.msg.createdAt) }}</span>
              </div>
              <div class="msg__main">
                <div v-if="!row.grouped" class="msg__head">
                  <span v-if="row.msg.isAdmin" class="badge-admin"><AppIcon name="crown" :size="11" />主编</span>
                  <b class="msg__name">{{ row.msg.nickname || '匿名读者' }}</b>
                  <span v-if="row.mine" class="msg__self">我</span>
                  <span class="msg__time num">{{ clockOf(row.msg.createdAt) }}</span>
                </div>
                <div class="msg__bubble">
                  <template v-for="(seg, si) in segments(row.msg.content)" :key="si">
                    <a v-if="seg.type === 'link'" :href="seg.value" target="_blank" rel="noopener noreferrer nofollow">{{ seg.value }}</a>
                    <template v-else>{{ seg.value }}</template>
                  </template>
                </div>
              </div>
            </article>
          </template>
        </template>
      </div>

      <Transition name="fade">
        <button v-if="!atBottom && !loading" class="chat__tobottom" @click="scrollToBottom(true)">
          <AppIcon name="sort" :size="14" />
          {{ unseen ? unseen + ' 条新来信' : '回到最新' }}
        </button>
      </Transition>
    </div>

    <!-- 撰写区 -->
    <div class="composer">
      <Avatar :src="cloudUser.avatar" :name="cloudUser.nickname || cloudUser.email" :size="38" :admin="cloudUser.isAdmin" />
      <div class="composer__body">
        <div class="composer__meta">
          <span class="composer__name">
            <span v-if="cloudUser.isAdmin" class="badge-admin"><AppIcon name="crown" :size="11" />主编</span>
            {{ cloudUser.nickname || cloudUser.email || '我' }}
          </span>
          <span class="composer__count num" :class="{ 'composer__count--over': overLimit }">{{ chars }} / {{ MAX_CHARS }}</span>
        </div>
        <textarea
          ref="inputEl"
          v-model="draft"
          class="input composer__input"
          rows="2"
          placeholder="说点什么…（Enter 发送 · Shift + Enter 换行）"
          @keydown="onComposerKey"
        ></textarea>
        <div class="composer__foot">
          <div class="composer__quick">
            <button v-for="q in QUICK" :key="q" class="quick" :title="'插入 ' + q" @click="addQuick(q)">{{ q }}</button>
          </div>
          <button class="btn btn--gold btn--ico composer__send" :disabled="!canSend" @click="onSend">
            <AppIcon name="send" :size="16" />
            {{ sending ? '寄出中…' : (cooldown > 0 ? '稍等 ' + coolLabel : '寄出') }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.chat { padding: 0; overflow: hidden; display: flex; flex-direction: column; }

/* 状态条 */
.chat__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  padding: 12px 14px;
  border-bottom: 1px solid var(--line);
  background: var(--card-2);
}
.chat__who { display: flex; gap: 7px; flex-wrap: wrap; align-items: center; }
.chat__stat { cursor: default; font-size: 12px; }
.chat__stat--admin { border-color: var(--gold-line); color: var(--accent-ink); background: var(--gold-soft); }
.chat__online { cursor: default; font-size: 12px; }
.dot {
  width: 7px; height: 7px; border-radius: 50%;
  background: var(--ink-green);
  box-shadow: 0 0 0 3px var(--ink-green-soft);
  animation: beat 2.4s ease-in-out infinite;
}
@keyframes beat { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
.chat__tools { display: flex; align-items: center; gap: 9px; }
.chat__sync { font-size: 11.5px; color: var(--text-faint); }

.chat__notice {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 8px 14px;
  font-size: 12px;
  color: var(--text-dim);
  border-bottom: 1px dashed var(--line-strong);
  background:
    linear-gradient(90deg, var(--gold-soft), transparent 70%),
    var(--card);
}
.chat__notice > span { flex: 1; min-width: 200px; line-height: 1.7; }
.chat__notice-link {
  display: inline-flex; align-items: center; gap: 5px;
  border: 0; background: none; padding: 0;
  color: var(--accent-ink);
  font-family: inherit; font-size: 12px; font-weight: 600;
  cursor: pointer;
  text-decoration: underline wavy var(--gold-line);
  text-underline-offset: 3px;
}
.notice { display: flex; align-items: center; gap: 8px; padding: 10px 14px; font-size: 12.5px; color: var(--text-dim); background: var(--gold-soft); }
.notice > span { flex: 1; }

/* 消息流 */
.chat__scroll-wrap { position: relative; }
.chat__list {
  height: clamp(320px, 52vh, 560px);
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  background:
    repeating-linear-gradient(180deg, transparent 0 27px, var(--line) 27px 28px),
    var(--card);
  background-attachment: local;
  scrollbar-color: var(--gold-line) transparent;
}
.chat__list::-webkit-scrollbar { width: 10px; }
.chat__list::-webkit-scrollbar-track { background: var(--card-2); }
.chat__list::-webkit-scrollbar-thumb { background: var(--gold-line); border: 2px solid var(--card-2); border-radius: 6px; }
.chat__list::-webkit-scrollbar-thumb:hover { background: var(--gold-deep); }
.chat__opening { text-align: center; font-family: var(--font-serif); font-size: 11px; letter-spacing: 2px; color: var(--text-faint); padding: 2px 0 6px; }
.chat__day { display: flex; align-items: center; gap: 10px; margin: 6px 0 2px; }
.chat__day::before, .chat__day::after { content: ''; flex: 1; height: 1px; background: var(--line-strong); }
.chat__day span {
  font-family: var(--font-serif);
  font-size: 11px;
  letter-spacing: 2px;
  color: var(--text-faint);
  border: 1px dashed var(--line-strong);
  border-radius: 999px;
  padding: 1px 10px;
  background: var(--card);
}

.msg { display: flex; gap: 10px; align-items: flex-start; animation: msgIn 0.22s ease; }
@keyframes msgIn { from { opacity: 0; transform: translateY(6px); } }
.msg--grouped { margin-top: -6px; }
.msg__avatar { flex: none; width: 38px; display: flex; justify-content: center; padding-top: 2px; }
.msg__avatar-gap { font-size: 9.5px; color: transparent; padding-top: 4px; }
.msg--grouped:hover .msg__avatar-gap { color: var(--text-faint); }
.msg__main { min-width: 0; max-width: min(660px, 82%); display: flex; flex-direction: column; gap: 4px; }
.msg__head { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.msg__name { font-size: 13px; font-weight: 700; color: var(--text-dim); font-family: var(--font-serif); letter-spacing: 0.5px; }
.msg__time { font-size: 11px; color: var(--text-faint); }
.msg__self {
  font-size: 10px; padding: 0 5px; border-radius: 4px;
  border: 1px solid var(--line-strong); color: var(--text-faint);
}
.msg__bubble {
  position: relative;
  padding: 9px 12px;
  border-radius: 3px 12px 12px 12px;
  border: 1px solid var(--line);
  background: var(--card);
  box-shadow: var(--shadow-sm);
  font-size: 14px;
  line-height: 1.72;
  color: var(--text);
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: anywhere;
}
.msg__bubble a { color: var(--accent-ink); text-decoration: underline; text-underline-offset: 2px; }

/* 本人：靠右的橘色便签 */
.msg--mine { flex-direction: row-reverse; }
.msg--mine .msg__main { align-items: flex-end; }
/* 靠右对齐但不镜像：金章必须始终排在昵称前面 */
.msg--mine .msg__head { justify-content: flex-end; }
.msg--mine .msg__bubble {
  border-radius: 12px 3px 12px 12px;
  border-color: var(--gold-line);
  background: linear-gradient(180deg, var(--gold-soft), var(--card));
}

/* 管理员：金箔高亮 + 双线金框 + 左侧金标 */
.msg--admin .msg__name { color: var(--accent-ink); }
.msg--admin .msg__bubble {
  border: 1px solid var(--gold-deep);
  background:
    linear-gradient(135deg, var(--gold-soft) 0%, transparent 42%),
    linear-gradient(180deg, var(--card), var(--card-2));
  box-shadow: var(--glow), inset 3px 0 0 var(--gold-deep);
  padding-left: 14px;
}
.msg--admin .msg__bubble::after {
  content: '主编来信';
  position: absolute;
  top: -9px; right: 10px;
  font-family: var(--font-serif);
  font-size: 9.5px;
  letter-spacing: 1.5px;
  padding: 0 6px;
  color: #33230e;
  background: linear-gradient(135deg, var(--gold), var(--gold-deep));
  border-radius: 3px;
  transform: rotate(-1.5deg);
  box-shadow: 0 1px 3px rgba(160, 90, 20, 0.3);
}
.msg--admin.msg--mine .msg__bubble::after { right: auto; left: 10px; }

/* 骨架 */
.msg-skeleton { display: flex; gap: 10px; align-items: center; }
.msg-skeleton--mine { flex-direction: row-reverse; }
.msg-skeleton__av { width: 38px; height: 38px; border-radius: 50%; flex: none; }
.msg-skeleton__body { height: 40px; border-radius: 10px; }

.chat__tobottom {
  position: absolute;
  left: 50%;
  bottom: 12px;
  transform: translateX(-50%);
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 14px;
  border-radius: 999px;
  border: 1px solid var(--gold-deep);
  background: var(--card);
  color: var(--accent-ink);
  font-family: inherit; font-size: 12.5px; font-weight: 700;
  cursor: pointer;
  box-shadow: var(--shadow);
}
.chat__tobottom:hover { background: var(--gold-soft); }

/* 撰写区 */
.composer {
  display: flex;
  gap: 10px;
  padding: 12px 14px calc(12px + env(safe-area-inset-bottom));
  border-top: 3px double var(--line-strong);
  background: var(--card-2);
}
.composer__body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.composer__meta { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.composer__name { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 600; color: var(--text-dim); min-width: 0; }
.composer__count { font-size: 11.5px; color: var(--text-faint); flex: none; }
.composer__count--over { color: var(--ink-red); font-weight: 700; }
.composer__input { resize: vertical; min-height: 58px; max-height: 200px; line-height: 1.7; font-family: inherit; background: var(--card); }
.composer__foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.composer__quick { display: flex; gap: 4px; flex-wrap: wrap; }
.quick {
  width: 30px; height: 30px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--card);
  font-size: 16px; line-height: 1;
  cursor: pointer;
  transition: transform 0.12s, border-color 0.12s, background 0.12s;
}
.quick:hover { transform: translateY(-2px) rotate(-4deg); border-color: var(--gold-line); background: var(--gold-soft); }
.composer__send { flex: none; min-width: 108px; justify-content: center; }
.composer__send:disabled { opacity: 0.55; cursor: not-allowed; filter: grayscale(0.25); }

@media (max-width: 639px) {
  .chat__list { height: clamp(280px, 46vh, 460px); padding: 12px 10px; }
  .msg__main { max-width: 84%; }
  .composer { padding: 10px; }
  .composer > .avatar { display: none; }
  .composer__send { min-width: 92px; }
  .chat__sync { display: none; }
}
</style>
