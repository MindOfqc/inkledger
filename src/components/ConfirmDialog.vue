<script setup>
import { watch, nextTick, ref } from 'vue'
import { confirmState, answerConfirm } from '../store.js'
import AppIcon from './AppIcon.vue'
import CatArt from './CatArt.vue'

const cancelBtn = ref(null)
// 打开时把焦点移到「取消」，避免回车误触危险操作
watch(() => confirmState.open, async (open) => {
  if (open) {
    await nextTick()
    cancelBtn.value?.focus()
  }
})
function onKeydown(e) {
  if (!confirmState.open) return
  if (e.key === 'Escape') { e.stopPropagation(); answerConfirm(false) }
  else if (e.key === 'Enter') { e.stopPropagation(); answerConfirm(true) }
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
          <p class="pencil-note confirm__hint">别担心，删除后还能在提示里点「撤销」找回来。</p>
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