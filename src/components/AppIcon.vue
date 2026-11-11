<script setup>
/**
 * 手绘多彩图标：24×24 贴纸风，彩色填充 + 深棕描边。
 * 颜色固定在注册表元素上（presentation attribute 不支持 var()），跨主题保持一致。
 */
import { computed, h } from 'vue'
import { ICONS } from '../lib/icons.js'

const props = defineProps({
  name: { type: String, required: true },
  size: { type: [Number, String], default: 20 },
  strokeWidth: { type: [Number, String], default: 1.5 }
})

const vnode = computed(() =>
  h('svg', {
    class: 'app-icon',
    width: props.size,
    height: props.size,
    viewBox: '0 0 24 24',
    fill: 'none',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true'
  }, (ICONS[props.name] || []).map(([tag, attrs]) => h(tag, attrs)))
)
</script>

<template>
  <component :is="vnode" />
</template>