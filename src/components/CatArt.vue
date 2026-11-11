<script setup>
import { computed } from 'vue'

/**
 * 主编吉祥物「墨墨」—— 完整全身手绘水彩插画（透明 WebP 贴纸）。
 * variant:
 *   editor / reading  端坐读报（报头主角）
 *   sleep             蜷卧打盹（空态）
 *   wave / peek       挥手打招呼（侧栏 / 便签 / 设置 / 署名）
 *   savings           抱着猫罐头存钱罐（储蓄目标）
 * size = 显示宽度(px)，高度按各姿势原始比例自适应，双主题通用。
 */
const props = defineProps({
  variant: { type: String, default: 'editor' },
  size: { type: [Number, String], default: 120 }
})

// 各姿势原始像素尺寸（用于 intrinsic 宽高，避免布局抖动）
const POSES = {
  editor: { file: 'editor', w: 583, h: 640, alt: '主编墨墨端坐读报' },
  reading: { file: 'reading', w: 383, h: 456, alt: '墨墨读报' },
  sleep: { file: 'sleep', w: 477, h: 371, alt: '墨墨蜷在报纸上打盹' },
  wave: { file: 'wave', w: 375, h: 432, alt: '墨墨挥手打招呼' },
  peek: { file: 'wave', w: 375, h: 432, alt: '墨墨探头挥手' },
  savings: { file: 'savings', w: 414, h: 462, alt: '墨墨抱着猫罐头存钱罐' }
}

const pose = computed(() => POSES[props.variant] || POSES.editor)
const src = computed(() => new URL(`../assets/cats/cat-${pose.value.file}.webp`, import.meta.url).href)
const width = computed(() => Number(props.size) || 120)
const height = computed(() => Math.round(width.value * pose.value.h / pose.value.w))
</script>

<template>
  <img
    class="cat-art"
    :src="src"
    :alt="pose.alt"
    :width="width"
    :height="height"
    loading="lazy"
    decoding="async"
    draggable="false"
  />
</template>

<style scoped>
.cat-art {
  display: block;
  flex: none;
  height: auto;
  user-select: none;
  -webkit-user-drag: none;
  filter: drop-shadow(0 2px 4px rgba(91, 70, 50, 0.22));
}
</style>