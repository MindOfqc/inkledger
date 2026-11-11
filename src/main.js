import { createApp, watch } from 'vue'
import App from './App.vue'
import { store, loadSample } from './store.js'
import './styles/main.css'

// 主题与 PWA 地址栏色同步：默认日刊（米白旧报纸），夜班为暖棕台灯色
watch(() => store.settings.theme, (t) => {
  const theme = t === 'dark' ? 'dark' : 'light'
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#241c11' : '#f4ecd9')
}, { immediate: true })

// 演示模式：地址带 #demo 且无数据时载入示例（README 在线体验入口）
if (location.hash.includes('demo') && store.txs.length === 0) loadSample()

const app = createApp(App)
app.mount('#app')

// PWA：仅生产构建注册 Service Worker
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {})
  })
}