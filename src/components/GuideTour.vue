<script setup>
/**
 * 使用指引：spotlight 高亮 + 报纸风介绍卡。
 * 步骤由父组件传入（sel / view / title / body），缺失目标的步骤自动跳过。
 */
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import CatArt from './CatArt.vue'

const props = defineProps({ steps: { type: Array, required: true } })
const emit = defineEmits(['done', 'navigate'])

const idx = ref(0)
const spot = ref(null)          // 高亮框位置
const cardPos = ref({ top: 0, left: 0 })
const arrow = ref({ left: 0, side: 'top' })
const cardEl = ref(null)
const step = computed(() => props.steps[idx.value])
const last = computed(() => idx.value === props.steps.length - 1)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const PAD = 6

function visibleTarget(sel) {
  return [...document.querySelectorAll(sel)].find((el) => {
    const r = el.getBoundingClientRect()
    return r.width > 4 && r.height > 4
  }) || null
}

function measure() {
  const el = visibleTarget(step.value.sel)
  if (!el || !cardEl.value) return
  const r = el.getBoundingClientRect()
  spot.value = {
    top: `${r.top - PAD}px`,
    left: `${r.left - PAD}px`,
    width: `${r.width + PAD * 2}px`,
    height: `${r.height + PAD * 2}px`
  }
  const cw = cardEl.value.offsetWidth
  const ch = cardEl.value.offsetHeight
  const vw = window.innerWidth
  const vh = window.innerHeight
  const gap = 14
  let side = 'top'                       // 卡片在目标下方，箭头朝上
  let top = r.bottom + PAD + gap
  if (top + ch > vh - 10) {
    side = 'bottom'                      // 放不下则翻到目标上方
    top = r.top - PAD - gap - ch
  }
  top = Math.max(10, Math.min(top, vh - ch - 10))
  const left = Math.max(10, Math.min(r.left + r.width / 2 - cw / 2, vw - cw - 10))
  cardPos.value = { top: `${top}px`, left: `${left}px` }
  arrow.value = {
    side,
    left: Math.max(18, Math.min(r.left + r.width / 2 - left, cw - 18))
  }
}

async function go(i) {
  idx.value = i
  const s = props.steps[i]
  if (s.view) emit('navigate', s.view)
  await nextTick()
  await sleep(120)
  const el = visibleTarget(s.sel)
  if (!el) {
    if (!last.value) return go(i + 1)
    return finish()
  }
  el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  await sleep(340)
  await nextTick()
  measure()
  cardEl.value?.focus({ preventScroll: true })
}

function next() { last.value ? finish() : go(idx.value + 1) }
function prev() { if (idx.value > 0) go(idx.value - 1) }
function finish() { emit('done') }

function onKey(e) {
  if (e.key === 'Escape') { e.preventDefault(); finish() }
  else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); next() }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); prev() }
}
let raf = 0
function onMove() {
  cancelAnimationFrame(raf)
  raf = requestAnimationFrame(measure)
}

onMounted(() => {
  window.addEventListener('keydown', onKey)
  window.addEventListener('resize', onMove)
  window.addEventListener('scroll', onMove, true)
  go(0)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('resize', onMove)
  window.removeEventListener('scroll', onMove, true)
  cancelAnimationFrame(raf)
})
</script>

<template>
  <div class="tour" role="dialog" aria-modal="true" :aria-label="`使用指引 ${idx + 1} / ${steps.length}`">
    <div class="tour__block" @click.stop></div>
    <div v-if="spot" class="tour__spot" :style="spot"></div>
    <div ref="cardEl" class="tour__card" :class="{ 'tour__card--ready': spot }" :style="cardPos" tabindex="-1">
      <span class="tour__arrow" :class="`tour__arrow--${arrow.side}`" :style="{ left: arrow.left + 'px' }"></span>
      <div class="tour__head">
        <span class="tour__kicker">使用指引 · {{ idx + 1 }} / {{ steps.length }}</span>
        <CatArt variant="reading" :size="40" class="tour__cat" />
      </div>
      <h3 class="tour__title">{{ step.title }}</h3>
      <p class="tour__body">{{ step.body }}</p>
      <div class="tour__dots" aria-hidden="true">
        <i v-for="(s, i) in steps" :key="i" :class="{ on: i === idx }"></i>
      </div>
      <div class="tour__actions">
        <button type="button" class="btn btn--ghost tour__skip" @click="finish">跳过</button>
        <span class="tour__spacer"></span>
        <button v-if="idx > 0" type="button" class="btn btn--ghost" @click="prev">上一步</button>
        <button type="button" class="btn btn--gold" @click="next">{{ last ? '开始记账' : '下一步' }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tour { position: fixed; inset: 0; z-index: 300; }
.tour__block { position: absolute; inset: 0; }
.tour__spot {
  position: fixed;
  border: 2px solid var(--gold);
  border-radius: var(--radius-m);
  box-shadow: 0 0 0 9999px var(--scrim), var(--glow);
  pointer-events: none;
  transition: top .25s ease, left .25s ease, width .25s ease, height .25s ease;
}
.tour__card {
  position: fixed;
  width: min(340px, calc(100vw - 24px));
  background: var(--card);
  border: 1.5px solid var(--line-strong);
  border-radius: var(--radius-m);
  box-shadow: var(--shadow);
  padding: 14px 16px 12px;
  outline: none;
  opacity: 0;
  transition: top .25s ease, left .25s ease, opacity .2s ease;
}
.tour__card--ready { opacity: 1; }
.tour__arrow {
  position: absolute;
  width: 12px; height: 12px;
  background: var(--card);
  border-left: 1.5px solid var(--line-strong);
  border-top: 1.5px solid var(--line-strong);
  transform: translateX(-50%) rotate(45deg);
}
.tour__arrow--top { top: -7px; }
.tour__arrow--bottom { bottom: -7px; transform: translateX(-50%) rotate(225deg); }
.tour__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
.tour__kicker {
  font-size: 11px;
  letter-spacing: 2px;
  color: var(--accent-ink);
  font-weight: 700;
  padding-top: 4px;
}
.tour__cat { flex: none; margin-top: -6px; }
.tour__title {
  font-family: var(--font-serif);
  font-size: 17px;
  font-weight: 700;
  color: var(--text);
  margin: 2px 0 6px;
  letter-spacing: 1px;
}
.tour__body {
  font-size: 13px;
  line-height: 1.75;
  color: var(--text-dim);
  margin: 0 0 10px;
}
.tour__dots { display: flex; gap: 5px; margin-bottom: 10px; }
.tour__dots i {
  width: 6px; height: 6px;
  border-radius: 4px;
  background: var(--line-strong);
  transition: width .2s ease, background .2s ease;
}
.tour__dots i.on { width: 18px; background: var(--gold-deep); }
.tour__actions { display: flex; align-items: center; gap: 8px; }
.tour__spacer { flex: 1; }
.tour__skip { color: var(--text-faint); }
@media (max-width: 479px) {
  .tour__card { padding: 12px 14px 10px; }
  .tour__title { font-size: 16px; }
}
</style>
