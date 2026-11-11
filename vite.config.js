import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// base 用相对路径，保证构建产物在任意子路径下都能部署（Qoder Sites / Cloudflare Pages / 仓库 Pages 等）
export default defineConfig({
  base: './',
  plugins: [vue()],
  // 编辑器/工具原子写入会短暂生成 .xxx.tmpdir 临时目录，Windows 下被锁住时
  // chokidar watch 会抛 EBUSY 直接杀掉 dev server；忽略这些临时产物与文档目录
  server: {
    watch: { ignored: ['**/*.tmp', '**/*.tmpdir/**', '**/.git/**', 'docs/**', 'README.md', 'DEPLOY.md'] }
  },
  build: {
    target: 'es2018',
    chunkSizeWarningLimit: 1200
  }
})
