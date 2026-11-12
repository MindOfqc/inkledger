<script setup>
/**
 * 读者登记处：登录 / 注册 / 忘记密码（云端账本入口）
 * 复古报刊 × 卡通猫视觉，复用全局设计变量，日刊 / 夜班双主题通用。
 */
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { store } from '../store.js'
import { login, register, resetPassword, sendCode } from '../lib/api.js'
import AppIcon from './AppIcon.vue'
import CatArt from './CatArt.vue'
import BrandMark from './BrandMark.vue'

const emit = defineEmits(['authed'])

const MODES = [
  { key: 'login', label: '登录' },
  { key: 'register', label: '注册' },
  { key: 'reset', label: '忘记密码' }
]
const mode = ref('login')
const email = ref('')
const password = ref('')
const code = ref('')
const nickname = ref('')
const showPass = ref(false)
const pending = ref('')        // '' | 'submit' | 'code'
const error = ref('')
const notice = ref('')
const devCode = ref('')        // 开发环境直接回显验证码
const countdown = ref(0)
let timer = null

const emailInput = ref(null)
const busy = computed(() => pending.value !== '')
const purpose = computed(() => (mode.value === 'register' ? 'register' : 'reset'))
const submitLabel = computed(() => {
  if (pending.value === 'submit') {
    return mode.value === 'login' ? '登录中…' : mode.value === 'register' ? '注册中…' : '重置中…'
  }
  return mode.value === 'login' ? '登录账本' : mode.value === 'register' ? '注册并登录' : '重置密码'
})

/* —— 报头日期 —— */
const today = new Date()
const WEEK = ['日', '一', '二', '三', '四', '五', '六']
const dateLine = `${today.getFullYear()} 年 ${today.getMonth() + 1} 月 ${today.getDate()} 日 · 星期${WEEK[today.getDay()]}`
const postDate = `${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`

const FEATURES = [
  { icon: 'undo', title: '安心撤销', desc: '删除、清空都能一键撤销，手滑也不怕' },
  { icon: 'upload', title: '账单导入', desc: '微信 / 支付宝 / Excel 账单，一键自动入账' },
  { icon: 'invest', title: '预算看板', desc: '分类预算、月度报表，钱的去向一眼看清' },
  { icon: 'piggy', title: '储蓄目标', desc: '攒钱进度看得见，离愿望更近一步' }
]

function switchMode(m, keepNotice = false) {
  mode.value = m
  error.value = ''
  if (!keepNotice) notice.value = ''
  devCode.value = ''
  password.value = ''
  code.value = ''
  showPass.value = false
}

function validEmail() {
  const v = email.value.trim()
  if (!v) { error.value = '请输入邮箱'; return false }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { error.value = '邮箱格式不正确，请检查一下'; return false }
  return true
}

function startCountdown() {
  countdown.value = 60
  clearInterval(timer)
  timer = setInterval(() => {
    countdown.value -= 1
    if (countdown.value <= 0) clearInterval(timer)
  }, 1000)
}

async function onSendCode() {
  if (busy.value || countdown.value > 0) return
  error.value = ''
  notice.value = ''
  devCode.value = ''
  if (!validEmail()) return
  pending.value = 'code'
  try {
    const res = await sendCode(email.value.trim(), purpose.value)
    notice.value = '验证码已发送，请查收邮件'
    if (res?.devCode) devCode.value = String(res.devCode)
    startCountdown()
  } catch (e) {
    error.value = e?.message || '验证码发送失败，请稍后再试'
  } finally {
    pending.value = ''
  }
}

function onCodeInput() {
  code.value = code.value.replace(/\D/g, '').slice(0, 6)
}

async function onSubmit() {
  if (busy.value) return
  error.value = ''
  notice.value = ''
  if (!validEmail()) return
  if (mode.value !== 'login' && !/^\d{6}$/.test(code.value)) {
    error.value = '请输入 6 位数字验证码'
    return
  }
  if (!password.value) { error.value = '请输入密码'; return }
  if (mode.value !== 'login' && password.value.length < 8) {
    error.value = '密码至少 8 位，再补几个字符吧'
    return
  }
  pending.value = 'submit'
  const mail = email.value.trim()
  try {
    if (mode.value === 'login') {
      await login({ email: mail, password: password.value })
      emit('authed')
    } else if (mode.value === 'register') {
      await register({
        email: mail,
        code: code.value,
        password: password.value,
        nickname: nickname.value.trim() || undefined
      })
      emit('authed')
    } else {
      await resetPassword({ email: mail, code: code.value, password: password.value })
      switchMode('login', true)
      notice.value = '密码已重置，请用新密码登录'
    }
  } catch (e) {
    error.value = e?.message || '操作失败，请稍后再试'
  } finally {
    pending.value = ''
  }
}

function toggleTheme() {
  const t = store.settings.theme === 'dark' ? 'light' : 'dark'
  store.settings.theme = t
  document.documentElement.dataset.theme = t
}

onMounted(() => nextTick(() => emailInput.value?.focus()))
onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <div class="auth">
    <!-- 报头_meta -->
    <div class="auth__meta">
      <span>{{ dateLine }}</span>
      <button class="chip" type="button" @click="toggleTheme">
        <AppIcon :name="store.settings.theme === 'dark' ? 'sun' : 'moon'" :size="14" />
        {{ store.settings.theme === 'dark' ? '日刊' : '夜班' }}
      </button>
    </div>

    <!-- 报头 -->
    <header class="auth__masthead">
      <div class="auth__brandrow">
        <BrandMark :size="56" class="auth__brand" />
        <div class="auth__titlebox">
          <h1 class="auth__title">喵账本</h1>
          <p class="auth__motto">一笔一笔，把日子记清楚 · 创刊号</p>
        </div>
        <div class="postmark auth__postmark" aria-hidden="true">
          <span>猫咪账房</span>
          <b>已核对</b>
          <span class="num">{{ postDate }}</span>
        </div>
      </div>
      <div class="news-rule"></div>
    </header>

    <div class="auth__body">
      <!-- 创刊词 -->
      <section class="auth__intro">
        <span class="kicker">创刊词 · EDITOR'S NOTE</span>
        <h2 class="auth__headline headline">把账本装进口袋，<br />把日子过明白。</h2>
        <p class="auth__lede">
          随手记一笔，预算、报表、储蓄目标都替你算好——
          主编墨墨和编辑部全体猫咪，随时待命。
        </p>
        <ul class="auth__features">
          <li v-for="f in FEATURES" :key="f.icon" class="auth__feature">
            <span class="auth__feature-ico"><AppIcon :name="f.icon" :size="22" /></span>
            <span class="auth__feature-text">
              <b>{{ f.title }}</b>
              <small>{{ f.desc }}</small>
            </span>
          </li>
        </ul>
        <div class="auth__intro-cat">
          <CatArt variant="wave" :size="88" />
          <span class="pencil-note pencil-note--u">墨墨已就位，就等你开账喵～</span>
        </div>
      </section>

      <!-- 读者登记卡 -->
      <section class="auth__desk">
        <div class="auth-card">
          <span class="tape" aria-hidden="true"></span>
          <CatArt variant="peek" :size="58" class="auth-card__cat" />
          <span class="kicker">读者登记处 · READER DESK</span>

          <div class="auth-tabs" role="tablist" aria-label="登录方式">
            <button
              v-for="m in MODES" :key="m.key"
              type="button" role="tab"
              class="auth-tab" :class="{ 'auth-tab--on': mode === m.key }"
              :aria-selected="mode === m.key"
              @click="switchMode(m.key)"
            >{{ m.label }}</button>
          </div>

          <form role="tabpanel" :aria-label="MODES.find((m) => m.key === mode)?.label" @submit.prevent="onSubmit">
            <div v-if="error" class="auth-alert" role="alert">
              <AppIcon name="bell" :size="16" />
              <span>{{ error }}</span>
            </div>
            <div v-if="notice" class="auth-alert auth-alert--ok" role="status">
              <AppIcon name="check" :size="16" />
              <span>{{ notice }}</span>
            </div>

            <!-- 邮箱 -->
            <label class="auth-field">
              <span class="auth-field__label">邮箱</span>
              <input
                ref="emailInput" v-model="email" class="input" type="email" name="email"
                autocomplete="email" placeholder="如 miao@example.com" :disabled="busy"
              />
            </label>

            <!-- 验证码（注册 / 重置） -->
            <template v-if="mode !== 'login'">
              <div class="auth-field">
                <span class="auth-field__label">邮箱验证码</span>
                <div class="auth-code-row">
                  <input
                    v-model="code" class="input num" type="text" inputmode="numeric"
                    autocomplete="one-time-code" maxlength="6" placeholder="6 位数字"
                    :disabled="busy" @input="onCodeInput"
                  />
                  <button
                    type="button" class="btn auth-code-btn"
                    :disabled="busy || countdown > 0"
                    @click="onSendCode"
                  >
                    {{ pending === 'code' ? '发送中…' : countdown > 0 ? `${countdown} 秒后重发` : '获取验证码' }}
                  </button>
                </div>
                <button v-if="devCode" type="button" class="auth-devcode" @click="code = devCode">
                  开发环境验证码：<b class="num">{{ devCode }}</b>（点一下自动填入）
                </button>
              </div>
            </template>

            <!-- 密码 -->
            <label class="auth-field">
              <span class="auth-field__label">
                {{ mode === 'login' ? '密码' : mode === 'register' ? '设置密码' : '新密码' }}
                <small v-if="mode !== 'login'">至少 8 位</small>
              </span>
              <span class="auth-pass-wrap">
                <input
                  v-model="password" class="input" :type="showPass ? 'text' : 'password'"
                  :name="mode === 'login' ? 'password' : 'new-password'"
                  :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
                  :placeholder="mode === 'login' ? '输入密码' : '至少 8 位，字母数字都可以'"
                  :disabled="busy"
                />
                <button
                  type="button" class="auth-eye" tabindex="-1"
                  :aria-label="showPass ? '隐藏密码' : '显示密码'"
                  @click="showPass = !showPass"
                ><AppIcon name="eye" :size="17" /></button>
              </span>
            </label>

            <!-- 昵称（注册，选填） -->
            <label v-if="mode === 'register'" class="auth-field">
              <span class="auth-field__label">昵称 <small>选填</small></span>
              <input
                v-model="nickname" class="input" type="text" name="nickname"
                autocomplete="nickname" maxlength="24" placeholder="怎么称呼你？如：铲屎官"
                :disabled="busy"
              />
            </label>

            <button type="submit" class="btn btn--gold auth-submit" :disabled="busy">
              <AppIcon :name="mode === 'login' ? 'paw' : 'stamp'" :size="17" />
              {{ submitLabel }}
            </button>

            <div class="auth-links">
              <template v-if="mode === 'login'">
                <button type="button" class="auth-link" @click="switchMode('register')">还没有账号？注册一个</button>
                <button type="button" class="auth-link" @click="switchMode('reset')">忘记密码？</button>
              </template>
              <button v-else type="button" class="auth-link" @click="switchMode('login')">
                {{ mode === 'register' ? '已有账号？直接登录' : '想起密码了？返回登录' }}
              </button>
            </div>
          </form>
        </div>
      </section>
    </div>

    <footer class="auth__foot">
      <span class="byline">喵账本 MeowLedger · 个人记账 PWA · 猫咪账房编辑部</span>
    </footer>
  </div>
</template>

<style scoped>
.auth {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 1060px;
  min-height: 100dvh;
  margin: 0 auto;
  padding: 14px 16px calc(18px + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
}

/* —— 报头 —— */
.auth__meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  font-family: var(--font-serif);
  font-size: 11.5px;
  letter-spacing: 1px;
  color: var(--text-dim);
  border-bottom: 1px solid var(--line-strong);
  padding-bottom: 6px;
}
.auth__masthead { text-align: center; padding: 18px 0 0; animation: fadeDown 0.4s ease; }
.auth__brandrow { display: flex; align-items: center; justify-content: center; gap: 16px; padding-bottom: 12px; }
.auth__brand { transform: rotate(-3deg); }
.auth__titlebox { min-width: 0; }
.auth__title {
  font-family: var(--font-serif);
  font-weight: 900;
  font-size: clamp(30px, 6vw, 44px);
  letter-spacing: 8px;
  text-indent: 8px;
  margin: 0;
  line-height: 1.15;
  color: var(--text);
}
.auth__motto { font-family: var(--font-hand); font-size: 13px; color: var(--text-dim); margin: 4px 0 0; }
.auth__postmark { flex: none; }

/* —— 主体分栏 —— */
.auth__body {
  display: grid;
  grid-template-areas: 'card' 'intro';
  gap: 26px;
  margin-top: 24px;
  align-items: start;
}
.auth__intro { grid-area: intro; }
.auth__desk { grid-area: card; padding-top: 26px; }
@media (min-width: 900px) {
  .auth__body { grid-template-areas: 'intro card'; grid-template-columns: 1fr 400px; gap: 44px; margin-top: 34px; }
}

/* —— 创刊词 —— */
.auth__headline {
  font-size: clamp(22px, 3.4vw, 30px);
  line-height: 1.5;
  margin: 8px 0 10px;
  letter-spacing: 1px;
}
.auth__lede { color: var(--text-dim); font-size: 14px; line-height: 1.9; margin: 0 0 18px; max-width: 46ch; }
.auth__features { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; }
@media (min-width: 640px) and (max-width: 899px) {
  .auth__features { grid-template-columns: 1fr 1fr; }
}
.auth__feature { display: flex; align-items: flex-start; gap: 12px; }
.auth__feature-ico {
  flex: none;
  width: 40px; height: 40px;
  display: flex; align-items: center; justify-content: center;
  background: var(--card-2);
  border: 1px dashed var(--line-strong);
  border-radius: var(--radius-s);
}
.auth__feature-text { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.auth__feature-text b { font-size: 14px; color: var(--text); letter-spacing: 1px; }
.auth__feature-text small { font-size: 12.5px; color: var(--text-dim); line-height: 1.6; }
.auth__intro-cat { display: flex; align-items: flex-end; gap: 12px; margin-top: 22px; }
.auth__intro-cat .cat-art { transform: rotate(-3deg); }

/* —— 登记卡 —— */
.auth-card {
  position: relative;
  background: var(--card);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-l);
  padding: 24px 20px 20px;
  box-shadow: var(--shadow);
  animation: pop 0.25s ease;
}
.auth-card .tape { top: -11px; left: 50%; margin-left: -46px; }
.auth-card__cat { position: absolute; top: -36px; right: 12px; transform: rotate(6deg); }
.auth-card > .kicker { display: block; margin-bottom: 2px; }

.auth-tabs {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  border-bottom: 3px double var(--line-strong);
  margin: 10px 0 16px;
}
.auth-tab {
  position: relative;
  border: none; background: none;
  font-family: var(--font-serif);
  font-size: 15px; font-weight: 700; letter-spacing: 2px;
  color: var(--text-faint);
  padding: 8px 0 10px;
  cursor: pointer;
  transition: color 0.15s;
}
.auth-tab:hover { color: var(--text-dim); }
.auth-tab--on { color: var(--accent-ink); }
.auth-tab--on::after {
  content: '';
  position: absolute;
  left: 14%; right: 14%; bottom: -3px;
  height: 3px;
  background: var(--gold);
}

/* —— 表单 —— */
.auth-field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 13px; }
.auth-field__label {
  display: flex; justify-content: space-between; align-items: baseline;
  font-size: 12px; color: var(--text-dim); letter-spacing: 1px;
}
.auth-field__label small { color: var(--text-faint); letter-spacing: 0; }
.auth-code-row { display: flex; gap: 8px; }
.auth-code-row .input { flex: 1; min-width: 0; }
.auth-code-btn { flex: none; width: 112px; font-size: 13px; padding: 9px 6px; white-space: nowrap; }
.auth-devcode {
  align-self: flex-start;
  border: none; background: none; padding: 0;
  font-family: var(--font-hand);
  font-size: 12.5px; color: var(--pencil);
  cursor: pointer;
  text-decoration: underline wavy var(--gold-line);
  text-underline-offset: 3px;
}
.auth-devcode b { color: var(--accent-ink); }
.auth-pass-wrap { position: relative; display: block; }
.auth-pass-wrap .input { padding-right: 42px; }
.auth-eye {
  position: absolute; right: 5px; top: 50%; transform: translateY(-50%);
  border: none; background: none;
  color: var(--text-faint);
  padding: 7px; display: flex; cursor: pointer;
}
.auth-eye:hover { color: var(--accent-ink); }

.auth-alert {
  display: flex; align-items: flex-start; gap: 8px;
  border: 1px solid var(--ink-red);
  background: var(--ink-red-soft);
  color: var(--ink-red);
  border-radius: var(--radius-s);
  padding: 8px 12px;
  font-size: 13px; line-height: 1.6;
  margin-bottom: 13px;
}
.auth-alert .app-icon { margin-top: 2px; }
.auth-alert--ok { border-color: var(--ink-green); background: var(--ink-green-soft); color: var(--ink-green); }

.auth-submit {
  width: 100%;
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  padding: 11px 16px;
  font-size: 15px;
  margin-top: 4px;
}
.auth-links { display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; margin-top: 13px; }
.auth-link {
  border: none; background: none; padding: 2px 0;
  color: var(--accent-ink);
  font-size: 13px; font-family: inherit; cursor: pointer;
  text-decoration: underline dotted var(--gold-line);
  text-underline-offset: 3px;
}
.auth-link:hover { color: var(--gold-deep); }

.auth__foot { margin-top: auto; padding-top: 28px; text-align: center; }

/* —— 小屏（≤639px）：报头收紧，登记卡优先 —— */
@media (max-width: 639px) {
  .auth__postmark { display: none; }
  .auth__brandrow { gap: 12px; }
  .auth__brand { width: 46px; }
  .auth__title { letter-spacing: 6px; text-indent: 6px; }
  .auth-card { padding: 22px 16px 18px; }
  .auth-card__cat { top: -32px; right: 8px; }
  .auth__intro-cat { justify-content: center; }
}
@media (max-width: 374px) {
  .auth-code-btn { width: 96px; font-size: 12px; }
}
</style>