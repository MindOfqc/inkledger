<script setup>
/**
 * 喵账本品牌标识：完整实体橘猫主编抱账本的实体贴纸（AI 手绘生成后抠底）。
 * 与 favicon / PWA 图标共用同一份 master（scripts/gen_icons.py 同源输出），
 * 保证左上角与桌面图标一致。
 */
defineProps({
  size: { type: [Number, String], default: 40 }
})
const src = new URL('../assets/brand-mark.webp', import.meta.url).href
</script>

<template>
  <img
    class="brand-mark"
    :src="src"
    :width="size"
    :height="Math.round(size * 902 / 872)"
    alt=""
    decoding="async"
    draggable="false"
  />
</template>

<style scoped>
.brand-mark {
  display: block;
  flex: none;
  user-select: none;
  -webkit-user-drag: none;
  filter: drop-shadow(0 2px 3px rgba(91, 70, 50, 0.22));
}
</style>