<script setup>
import { watch, nextTick, ref } from 'vue'
import { confirmState, answerConfirm } from '../store.js'
import AppIcon from './AppIcon.vue'
import CatArt from './CatArt.vue'

const cancelBtn = ref(null)
let lastFocused = null
// 打开时记录触发元素并把焦点移到「取消」，避免回车误触危险操作；关闭后归还焦点
watch(() => confirmState.open, async (open) => {
  if (open) {
    lastFocused = document.activeElement
    await nextTick()
    cancelBtn.value?.focus()
  } else if (lastFocused && typeof lastFocused.focus === 'function') {
    const el = lastFocused
    lastFocused = null
    el.focus()
  }
})
function onKeydown(e) {
  if (!confirmState.open) return
  if (e.key === 'Escape') { e.stopPropagation(); answerConfirm(false); return }
  if (e.key === 'Enter') {
    // 回车激活当前焦点按钮：默认焦点在「取消」→ 取消；Tab 到「确定」→ 确认。
    // 显式处理并阻止原生激活，避免焦点竞态下误触危险操作。
    e.preventDefault()
    e.stopPropagation()
    const confirmBtn = document.querySelector('.confirm__actions .btn--danger-solid, .confirm__actions .btn--gold')
    answerConfirm(document.activeElement === confirmBtn)
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="confirm">
      <div
        v-if="confirmState.open"
        class="overlay overlay--confirm"
        @click.self="answerConfirm(false)"
        @keydown="onKeydown"
      >
        <div class="sheet sheet--confirm" role="alertdialog" aria-modal="true" :aria-label="confirmState.title">
          <CatArt variant="reading" :size="56" class="confirm__cat" />
          <h3 class="sheet__title confirm__title">{{ confirmState.title }}</h3>
          <p v-if="confirmState.message" class="confirm__message">{{ confirmState.message }}</p>
          <div class="confirm__actions">
            <button ref="cancelBtn" class="btn" @click="answerConfirm(false)">{{ confirmState.cancelLabel }}</button>
            <button class="btn" :class="confirmState.danger ? 'btn--danger-solid' : 'btn--gold'" @click="answerConfirm(true)">
              <AppIcon v-if="confirmState.danger" name="trash" :size="16" />
              {{ confirmState.confirmLabel }}
            </button>
          </div>
          <p class="pencil-note confirm__hint">请确认后再继续；支持撤销的操作，完成后可以在提示条里点「撤销」。</p>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.confirm__cat { margin: 0 auto 6px; transform: rotate(-3deg); }
.confirm__title { text-align: center; }
.confirm__message {
  margin: 10px 0 0;
  text-align: center;
  color: var(--text-dim);
  font-size: 14px;
  line-height: 1.7;
}
.confirm__actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  margin-top: 20px;
}
.confirm__actions .btn { min-width: 108px; justify-content: center; }
.confirm__hint { margin-top: 14px; text-align: center; font-size: 12px; }
.confirm-enter-active, .confirm-leave-active { transition: opacity 0.18s ease; }
.confirm-enter-active .sheet, .confirm-leave-active .sheet { transition: transform 0.18s ease, opacity 0.18s ease; }
.confirm-enter-from, .confirm-leave-to { opacity: 0; }
.confirm-enter-from .sheet, .confirm-leave-to .sheet { transform: translateY(12px) scale(0.98); opacity: 0; }
</style>