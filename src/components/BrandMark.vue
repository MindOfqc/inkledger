<script setup>
/**
 * 喵账本品牌标识：橘猫探头 + 墨绿账本 + 金币铅笔的手绘多彩徽章。
 * 与 favicon / PWA 图标共用同一份 SVG 源，保证左上角与桌面图标一致。
 */
defineProps({
  size: { type: [Number, String], default: 40 }
})
const src = new URL('../assets/brand-mark.svg', import.meta.url).href
</script>

<template>
  <img
    class="brand-mark"
    :src="src"
    :width="size"
    :height="size"
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