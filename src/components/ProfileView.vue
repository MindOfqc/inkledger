<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { cloudUser, setCloudUser, saveProfile, showToast, store } from '../store.js'
import { fetchProfile } from '../lib/api.js'
import Avatar from './Avatar.vue'
import AppIcon from './AppIcon.vue'
import CatArt from './CatArt.vue'

/**
 * 读者档案 —— 编辑昵称 / 头像 / 个性签名。
 * 头像三选一：上传照片（本地压到 96px WebP/PNG）、内置猫咪贴纸、emoji；全部落成 data:image 或短字符，
 * 由 Worker 存进 Cloudflare D1 的 ml_users.avatar，不依赖任何图床。
 */
const emit = defineEmits(['navigate'])

const NICK_MAX = 24
const BIO_MAX_CHARS = 66
const BIO_MAX_BYTES = 200
const EMOJIS = ['🐱', '😺', '😸', '🐈', '🐈‍⬛', '🐾', '🐟', '🧶', '📖', '☕', '🌻', '💰']
const STICKERS = [
  { key: 'editor', label: '主编' },
  { key: 'wave', label: '招呼' },
  { key: 'reading', label: '读报' },
  { key: 'sleep', label: '打盹' },
  { key: 'savings', label: '存钱' }
]

const byteLen = (s) => new TextEncoder().encode(s).length
const clampBytes = (s, max) => {
  let out = ''
  for (const ch of s) {
    if (byteLen(out + ch) > max) break
    out += ch
  }
  return out
}

/* —— 表单 —— */
const nickname = ref('')
const bio = ref('')
const avatar = ref('')
const avatarTab = ref('sticker')
const saving = ref(false)
const loading = ref(true)
const loadError = ref('')
const processing = ref(false)
const pickerErr = ref('')
const emojiInput = ref('')
const fileInput = ref(null)
const bioInput = ref(null)

const bioBytes = computed(() => byteLen(bio.value))
const nickCount = computed(() => Array.from(nickname.value.trim()).length)
const canSave = computed(() => nickCount.value > 0 && nickCount.value <= NICK_MAX && bioBytes.value <= BIO_MAX_BYTES)
const dirty = computed(() =>
  nickname.value.trim() !== (cloudUser.nickname || '').trim()
  || bio.value.trim() !== (cloudUser.bio || '').trim()
  || avatar.value !== (cloudUser.avatar || '')
)

function fill() {
  nickname.value = cloudUser.nickname || ''
  bio.value = cloudUser.bio || ''
  avatar.value = cloudUser.avatar || ''
  avatarTab.value = String(avatar.value).startsWith('data:image/') ? 'upload' : (avatar.value ? 'emoji' : 'sticker')
}
function reset() { fill(); pickerErr.value = ''; emojiInput.value = '' }

function applyCloud() {
  fill()
  loading.value = false
}
onMounted(async () => {
  fill()
  try {
    const res = await fetchProfile()
    if (res?.user) setCloudUser({ ...res.user, lastLogin: cloudUser.lastLogin })
    loadError.value = ''
  } catch (e) {
    loadError.value = e?.message || '资料读取失败'
  } finally {
    applyCloud()
  }
})
watch(() => cloudUser.loaded, (v) => { if (v && loading.value) applyCloud() })

/* —— 头像：上传压缩 —— */
const stickerSrc = (key) => new URL(`../assets/cats/cat-${key}.webp`, import.meta.url).href

function drawToDataUrl(img, type, quality) {
  const SIDE = 96
  const canvas = document.createElement('canvas')
  canvas.width = SIDE
  canvas.height = SIDE
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  const w = img.naturalWidth || img.width
  const h = img.naturalHeight || img.height
  const side = Math.min(w, h)
  ctx.drawImage(img, (w - side) / 2, (h - side) / 2, side, side, 0, 0, SIDE, SIDE)
  return canvas.toDataURL(type, quality)
}
/** 压到 96×96：优先 WebP，不支持时退回 PNG，保证 ≤64KB 的服务端上限 */
function compress(img) {
  let out = ''
  try { out = drawToDataUrl(img, 'image/webp', 0.82) } catch { /* Safari 旧版不支持 webp 编码 */ }
  if (!out.startsWith('data:image/webp')) out = drawToDataUrl(img, 'image/png')
  if (out.length > 64 * 1024) out = drawToDataUrl(img, 'image/jpeg', 0.7)
  return out
}
function loadBitmap(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片解码失败'))
    img.src = src
  })
}
async function onPickFile(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return
  pickerErr.value = ''
  if (!file.type.startsWith('image/')) { pickerErr.value = '只能选择图片文件（JPG / PNG / WebP / GIF）'; return }
  if (file.size > 8 * 1024 * 1024) { pickerErr.value = '图片超过 8MB，换一张小一点的吧'; return }
  processing.value = true
  let url = ''
  try {
    url = URL.createObjectURL(file)
    const img = await loadBitmap(url)
    const data = compress(img)
    if (data.length > 64 * 1024) throw new Error('压缩后仍然过大，请换一张更简单的图片')
    avatar.value = data
    avatarTab.value = 'upload'
  } catch (err) {
    pickerErr.value = err.message || '图片处理失败'
  } finally {
    if (url) URL.revokeObjectURL(url)
    processing.value = false
  }
}
async function useSticker(key) {
  pickerErr.value = ''
  processing.value = true
  try {
    const img = await loadBitmap(stickerSrc(key))
    avatar.value = compress(img)
    avatarTab.value = 'upload'
  } catch {
    pickerErr.value = '贴纸加载失败，请稍后再试'
  } finally {
    processing.value = false
  }
}
function pickEmoji(e) {
  avatar.value = e
  avatarTab.value = 'emoji'
  emojiInput.value = ''
}
function useCustomEmoji() {
  const v = emojiInput.value.trim()
  if (!v) return
  const first = Array.from(v)[0]
  if (byteLen(v) > 32) { pickerErr.value = '只能用一个表情（最多 32 字节）'; return }
  pickerErr.value = ''
  avatar.value = v
  emojiInput.value = ''
  void first
}
function clearAvatar() { avatar.value = ''; pickerErr.value = '' }

/* —— 签名：emoji 安全的插入与截断 —— */
function appendBio(e) {
  const el = bioInput.value
  const cur = bio.value
  const start = el?.selectionStart ?? cur.length
  const end = el?.selectionEnd ?? cur.length
  const next = clampBytes(cur.slice(0, start) + e + cur.slice(end), BIO_MAX_BYTES)
  bio.value = next
  requestAnimationFrame(() => {
    if (!el) return
    el.focus()
    const pos = Math.min(start + e.length, next.length)
    el.setSelectionRange(pos, pos)
  })
}

/* —— 保存 —— */
const ERR_TEXT = {
  invalid_nickname: '昵称需为 1–24 个字，且不能只有空格',
  avatar_too_large: '头像太大了，换一张更小的图片',
  invalid_input: '内容格式不正确，请检查后重试',
  unauthorized: '登录已过期，请重新登录',
}
async function onSave() {
  if (!canSave.value || saving.value) return
  saving.value = true
  try {
    await saveProfile({ nickname: nickname.value.trim(), bio: bio.value.trim(), avatar: avatar.value })
    showToast('档案已更新，对话室里的你也换新装了喵～')
    fill()
  } catch (e) {
    showToast(ERR_TEXT[e?.code] || ('保存失败：' + (e?.message || '网络异常')))
  } finally {
    saving.value = false
  }
}
function onKeydown(e) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); onSave() }
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

/* —— 档案信息 —— */
const fmtTime = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('zh-CN', { hour12: false })
}
const localTxCount = computed(() => store.txs.length)
</script>

<template>
  <header class="page-head">
    <div class="page-head__text">
      <span class="kicker">读者档案 · PROFILE</span>
      <h1 class="page-head__title serif">读者档案</h1>
      <p class="page-head__note pencil-note">换个头像、写句签名，对话室里的你就有了自己的样子。</p>
    </div>
    <CatArt variant="wave" :size="84" class="page-head__cat" />
  </header>

  <div v-if="loadError" class="notice notice--warn">
    <AppIcon name="bell" :size="16" />
    <span>{{ loadError }}（下面显示的是本机缓存的资料，保存时会重新提交）</span>
  </div>

  <div class="profile">
    <!-- 预览：借书证 -->
    <aside class="profile__side">
      <section class="card card--gold reader-card">
        <span class="tape tape--right reader-card__tape"></span>
        <span class="kicker">MEOWLEDGER READER CARD</span>
        <div class="reader-card__id">
          <Avatar :src="avatar" :name="nickname || cloudUser.nickname || cloudUser.email" :size="86" :admin="cloudUser.isAdmin" />
          <div class="reader-card__name">
            <span v-if="cloudUser.isAdmin" class="badge-admin badge-admin--lg"><AppIcon name="crown" :size="13" />管理员</span>
            <b class="serif">{{ nickname.trim() || '未署名的读者' }}</b>
            <small>{{ cloudUser.email || '—' }}</small>
          </div>
        </div>
        <p class="reader-card__bio" :class="{ 'reader-card__bio--empty': !bio.trim() }">
          {{ bio.trim() || '还没有签名，写一句让别的读者认识你。' }}
        </p>
        <div class="news-rule news-rule--thin"></div>
        <dl class="reader-card__meta">
          <div><dt><AppIcon name="mail" :size="13" />登录邮箱</dt><dd class="num">{{ cloudUser.email || '—' }}</dd></div>
          <div><dt><AppIcon name="pin" :size="13" />最近登录地</dt><dd>{{ cloudUser.lastLogin?.location || '未知' }}</dd></div>
          <div><dt><AppIcon name="clock" :size="13" />最近登录</dt><dd class="num">{{ fmtTime(cloudUser.lastLogin?.at) }}</dd></div>
          <div><dt><AppIcon name="ledger" :size="13" />本机流水</dt><dd class="num">{{ localTxCount }} 笔</dd></div>
        </dl>
        <span class="pencil-note reader-card__note">档案存在 Cloudflare 云端，换设备登录也还是你。</span>
      </section>

      <button class="btn btn--ghost btn--ico profile__jump" @click="emit('navigate', 'chat')">
        <AppIcon name="chat" :size="16" />去对话室看看新形象
      </button>
    </aside>

    <!-- 编辑 -->
    <section class="card profile__form">
      <div class="sec-title sec-title--ico"><AppIcon name="edit" :size="16" />编辑资料</div>

      <div class="field">
        <label class="field__label" for="pf-nick">昵称 <em>{{ nickCount }} / {{ NICK_MAX }}</em></label>
        <input
          id="pf-nick"
          v-model="nickname"
          class="input"
          :maxlength="NICK_MAX"
          placeholder="对话室里显示的名字"
          autocomplete="nickname"
        />
        <span v-if="nickCount > NICK_MAX || (nickname.length && !nickCount)" class="field__err">昵称需要 1–{{ NICK_MAX }} 个字</span>
      </div>

      <div class="field">
        <span class="field__label">头像 <em>{{ avatar ? '已选择' : '默认首字母' }}</em></span>
        <div class="chips avatar-tabs">
          <button class="chip" :class="{ 'chip--on': avatarTab === 'upload' }" @click="avatarTab = 'upload'">
            <AppIcon name="camera" :size="14" />上传照片
          </button>
          <button class="chip" :class="{ 'chip--on': avatarTab === 'sticker' }" @click="avatarTab = 'sticker'">
            <AppIcon name="cat" :size="14" />猫咪贴纸
          </button>
          <button class="chip" :class="{ 'chip--on': avatarTab === 'emoji' }" @click="avatarTab = 'emoji'">
            <AppIcon name="smile" :size="14" />表情
          </button>
        </div>

        <div v-if="avatarTab === 'upload'" class="avatar-pane">
          <button class="avatar-drop" :disabled="processing" @click="fileInput?.click()">
            <Avatar v-if="avatar.startsWith('data:image/')" :src="avatar" :name="nickname" :size="72" />
            <AppIcon v-else name="upload" :size="30" />
            <span class="avatar-drop__text">
              <b>{{ processing ? '正在压缩…' : '点击选择图片' }}</b>
              <small>自动裁成方图并压缩到 96×96，最大 8MB</small>
            </span>
          </button>
          <input ref="fileInput" type="file" accept="image/*" class="sr-only" @change="onPickFile" />
        </div>

        <div v-else-if="avatarTab === 'sticker'" class="avatar-pane">
          <div class="sticker-grid">
            <button
              v-for="s in STICKERS"
              :key="s.key"
              class="sticker"
              :disabled="processing"
              @click="useSticker(s.key)"
            >
              <CatArt :variant="s.key" :size="54" />
              <span>{{ s.label }}</span>
            </button>
          </div>
          <p class="hint">选一张墨墨贴纸当头像，它会和照片一样被压成 96×96 存进云端。</p>
        </div>

        <div v-else class="avatar-pane">
          <div class="emoji-grid">
            <button v-for="e in EMOJIS" :key="e" class="emoji-cell" :class="{ 'emoji-cell--on': avatar === e }" @click="pickEmoji(e)">{{ e }}</button>
          </div>
          <div class="row emoji-custom">
            <input v-model="emojiInput" class="input" placeholder="也可以粘贴一个你喜欢的表情" @keydown.enter.prevent="useCustomEmoji" />
            <button class="btn btn--sm" @click="useCustomEmoji">用它</button>
          </div>
        </div>

        <span v-if="pickerErr" class="field__err">{{ pickerErr }}</span>
        <div class="row avatar-actions">
          <span class="hint">当前头像会在对话室、平台看板与这张借书证上同步生效。</span>
          <button v-if="avatar" class="btn btn--sm btn--ghost btn--ico" @click="clearAvatar">
            <AppIcon name="trash" :size="14" />恢复默认
          </button>
        </div>
      </div>

      <div class="field">
        <label class="field__label" for="pf-bio">个性签名 <em>{{ Array.from(bio).length }} / {{ BIO_MAX_CHARS }} 字 · {{ bioBytes }} / {{ BIO_MAX_BYTES }} 字节</em></label>
        <textarea
          id="pf-bio"
          ref="bioInput"
          :value="bio"
          class="input bio-input"
          rows="3"
          placeholder="一句话介绍自己，比如：靠记账攒猫罐头钱的设计师"
          @input="bio = clampBytes($event.target.value, BIO_MAX_BYTES)"
        ></textarea>
        <div class="chips bio-emoji">
          <button v-for="e in ['🐱', '🐾', '☕', '🌻', '💰', '📖']" :key="e" class="chip chip--emoji" @click="appendBio(e)">{{ e }}</button>
        </div>
        <span class="hint">中文按 3 字节计算，超出 {{ BIO_MAX_BYTES }} 字节的部分会自动截断。</span>
      </div>

      <div class="news-rule news-rule--thin"></div>
      <div class="row profile__actions">
        <button class="btn btn--gold btn--ico" :disabled="!canSave || saving || !dirty" @click="onSave">
          <AppIcon name="check" :size="16" />{{ saving ? '保存中…' : (dirty ? '保存档案' : '已是最新') }}
        </button>
        <button class="btn btn--ghost btn--ico" :disabled="!dirty || saving" @click="reset">
          <AppIcon name="undo" :size="15" />还原
        </button>
        <span class="status">{{ dirty ? '有未保存的修改 · Ctrl/⌘ + S 快速保存' : '资料已同步到 Cloudflare 云端' }}</span>
      </div>
    </section>
  </div>
</template>

<style scoped>
.notice {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  border-radius: var(--radius-s);
  border: 1px dashed var(--gold-line);
  background: var(--gold-soft);
  color: var(--text-dim);
  font-size: 12.5px;
  margin-bottom: 12px;
}
.profile { display: grid; grid-template-columns: 1fr; gap: 16px; align-items: start; }
@media (min-width: 900px) {
  .profile { grid-template-columns: 320px minmax(0, 1fr); }
  .profile__side { position: sticky; top: 20px; }
}
.profile__side { display: flex; flex-direction: column; gap: 10px; }
.profile__jump { justify-content: center; }

/* 借书证 */
.reader-card { position: relative; padding-top: 20px; }
.reader-card__tape { top: -10px; right: 18px; }
.reader-card__id { display: flex; align-items: center; gap: 14px; margin: 12px 0 10px; }
.reader-card__name { min-width: 0; display: flex; flex-direction: column; gap: 4px; align-items: flex-start; }
.reader-card__name b { font-size: 18px; letter-spacing: 1px; word-break: break-word; }
.reader-card__name small { color: var(--text-faint); font-size: 12px; word-break: break-all; }
.reader-card__bio {
  font-family: var(--font-hand);
  font-size: 14px;
  line-height: 1.75;
  color: var(--text);
  margin: 0 0 12px;
  padding: 8px 10px;
  border-left: 3px solid var(--gold-line);
  background: var(--card-2);
  border-radius: 0 var(--radius-s) var(--radius-s) 0;
  word-break: break-word;
  white-space: pre-wrap;
}
.reader-card__bio--empty { color: var(--text-faint); }
.reader-card__meta { margin: 12px 0 0; display: flex; flex-direction: column; gap: 7px; }
.reader-card__meta > div { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; font-size: 12.5px; }
.reader-card__meta dt { display: inline-flex; align-items: center; gap: 5px; color: var(--text-faint); flex: none; }
.reader-card__meta dd { margin: 0; color: var(--text-dim); text-align: right; word-break: break-all; }
.reader-card__note { margin-top: 12px; font-size: 11.5px; }

/* 表单 */
.profile__form .sec-title { margin-top: 0; }
.field { display: flex; flex-direction: column; gap: 7px; margin-bottom: 18px; }
.field__label { font-size: 12.5px; color: var(--text-dim); letter-spacing: 1px; display: flex; justify-content: space-between; gap: 10px; }
.field__label em { font-style: normal; color: var(--text-faint); font-size: 11.5px; letter-spacing: 0; }
.field__err { color: var(--ink-red); font-size: 12px; }
.hint { color: var(--text-faint); font-size: 12px; line-height: 1.7; margin: 0; }
.row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.chips { display: flex; gap: 7px; flex-wrap: wrap; }
.status { font-size: 12px; color: var(--text-faint); }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }

.avatar-tabs { margin-bottom: 4px; }
.avatar-pane {
  border: 1px dashed var(--line-strong);
  border-radius: var(--radius-m);
  padding: 12px;
  background: var(--card-2);
}
.avatar-drop {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px;
  border: 1px dashed var(--gold-line);
  border-radius: var(--radius-s);
  background: var(--card);
  color: var(--text-dim);
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  transition: background 0.15s, border-color 0.15s;
}
.avatar-drop:hover { background: var(--gold-soft); border-color: var(--gold-deep); }
.avatar-drop:disabled { cursor: progress; opacity: 0.7; }
.avatar-drop__text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.avatar-drop__text b { font-size: 14px; color: var(--text); }
.avatar-drop__text small { font-size: 11.5px; color: var(--text-faint); }
.sticker-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; }
@media (max-width: 479px) { .sticker-grid { grid-template-columns: repeat(3, 1fr); } }
.sticker {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 4px;
  border: 1px solid var(--line);
  border-radius: var(--radius-s);
  background: var(--card);
  color: var(--text-dim);
  font-family: inherit;
  font-size: 11.5px;
  cursor: pointer;
  transition: all 0.15s;
}
.sticker:hover { border-color: var(--gold-line); background: var(--gold-soft); transform: translateY(-2px); }
.sticker:disabled { opacity: 0.6; cursor: progress; }
.emoji-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 7px; }
.emoji-cell {
  aspect-ratio: 1;
  border: 1px solid var(--line);
  border-radius: var(--radius-s);
  background: var(--card);
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
  transition: all 0.15s;
}
.emoji-cell:hover { border-color: var(--gold-line); transform: translateY(-2px); }
.emoji-cell--on { border-color: var(--gold-deep); background: var(--gold-soft); box-shadow: var(--glow); }
.emoji-custom { margin-top: 10px; }
.emoji-custom .input { flex: 1; min-width: 160px; }
.avatar-actions { justify-content: space-between; margin-top: 8px; }
.avatar-actions .hint { flex: 1; min-width: 180px; }
.bio-input { resize: vertical; min-height: 76px; font-family: inherit; line-height: 1.7; }
.bio-emoji { margin-top: 2px; }
.chip--emoji { font-size: 15px; padding: 2px 9px; }
.profile__actions { margin-top: 14px; }
.profile__actions .status { flex: 1; min-width: 180px; text-align: right; }
@media (max-width: 639px) {
  .profile__actions .status { text-align: left; }
}
</style>
