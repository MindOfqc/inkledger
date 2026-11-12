<script setup>
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'

/**
 * 读者头像 —— 三种来源统一渲染：
 *   1. data:image/*  上传 / 内置贴纸压缩后的图片
 *   2. 短字符        emoji 头像
 *   3. 空            昵称首字 + 由昵称派生的固定底色（同一个人永远是同一个颜色）
 * admin=true 时叠加金色描边与王冠徽记，对话室 / 看板 / 资料页共用同一套身份视觉。
 */
const props = defineProps({
  src: { type: String, default: '' },
  name: { type: String, default: '' },
  size: { type: [Number, String], default: 40 },
  admin: { type: Boolean, default: false },
  crown: { type: Boolean, default: true },
  square: { type: Boolean, default: false }
})

/* 深底色 + 纸白字，日刊 / 夜班双主题都保证 4.5:1 以上对比 */
const PALETTE = ['#b06010', '#2f6a49', '#9c3a26', '#41698a', '#7a4f80', '#8a6f14', '#357a72', '#835536']

const px = computed(() => Math.min(240, Math.max(16, Number(props.size) || 40)))
const kind = computed(() => {
  const s = String(props.src || '').trim()
  if (s.startsWith('data:image/')) return 'image'
  if (s) return 'emoji'
  return 'initial'
})
const initial = computed(() => {
  const n = String(props.name || '').trim()
  return n ? Array.from(n)[0].toUpperCase() : '喵'
})
const tone = computed(() => {
  const seed = String(props.name || '') + '|' + String(props.src || '').slice(0, 48)
  let h = 0
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) % 100000
  return PALETTE[h % PALETTE.length]
})
const crownSize = computed(() => Math.max(12, Math.round(px.value * 0.44)))
const style = computed(() => ({
  '--av': px.value + 'px',
  '--av-bg': tone.value,
  '--av-font': Math.round(px.value * 0.46) + 'px',
  '--av-emoji': Math.round(px.value * 0.6) + 'px'
}))
</script>

<template>
  <span class="avatar" :class="{ 'avatar--admin': admin, 'avatar--square': square }" :style="style">
    <img
      v-if="kind === 'image'"
      class="avatar__img"
      :src="src"
      :alt="(name || '读者') + '的头像'"
      :width="px"
      :height="px"
      loading="lazy"
      decoding="async"
      draggable="false"
    />
    <span v-else-if="kind === 'emoji'" class="avatar__emoji" aria-hidden="true">{{ src }}</span>
    <span v-else class="avatar__initial" aria-hidden="true">{{ initial }}</span>
    <span v-if="admin && crown" class="avatar__crown" title="管理员">
      <AppIcon name="crown" :size="crownSize" />
    </span>
  </span>
</template>

<style scoped>
.avatar {
  position: relative;
  flex: none;
  width: var(--av);
  height: var(--av);
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: visible;
  background: var(--av-bg);
  border: 1.5px solid var(--line-strong);
  box-shadow: 0 2px 5px rgba(91, 70, 50, 0.18);
  user-select: none;
}
.avatar--square { border-radius: var(--radius-s); }
.avatar--admin {
  border-color: var(--gold-deep);
  box-shadow: 0 0 0 2px var(--gold-soft), 0 0 0 3px var(--gold-line), 0 3px 8px rgba(160, 90, 20, 0.28);
}
.avatar__img,
.avatar__emoji,
.avatar__initial {
  width: 100%;
  height: 100%;
  border-radius: inherit;
  overflow: hidden;
}
.avatar__img { object-fit: cover; display: block; background: var(--card-2); }
.avatar__emoji {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--av-emoji);
  line-height: 1;
  background: var(--card-2);
}
.avatar__initial {
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-serif);
  font-weight: 800;
  font-size: var(--av-font);
  color: #fdf6e8;
  letter-spacing: 0;
}
.avatar__crown {
  position: absolute;
  right: -14%;
  bottom: -12%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1px;
  border-radius: 50%;
  background: var(--card);
  border: 1px solid var(--gold-line);
  box-shadow: 0 1px 3px rgba(91, 70, 50, 0.25);
  transform: rotate(8deg);
}
</style>
