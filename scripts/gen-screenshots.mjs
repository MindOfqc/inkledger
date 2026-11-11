/**
 * 用 Edge headless 重拍 docs/ 界面预览截图（基于已构建的 dist，经 vite preview 提供）。
 * 用法：node scripts/gen-screenshots.mjs
 * 仅开发期使用，不参与构建。不触碰用户正在使用的浏览器窗口（独立 user-data-dir）。
 */
import { spawnSync, spawn } from 'node:child_process'
import { mkdirSync, rmSync, statSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { tmpdir } from 'node:os'

const root = resolve(import.meta.dirname, '..')
const edgeCandidates = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
]
const edge = edgeCandidates.find((p) => { try { statSync(p); return true } catch { return false } })
if (!edge) throw new Error('未找到 Edge，无法截图')
if (!existsSync(resolve(root, 'dist/index.html'))) throw new Error('请先 pnpm build 生成 dist/')

const PORT = 4199
const base = `http://localhost:${PORT}/`
const docs = resolve(root, 'docs')
mkdirSync(docs, { recursive: true })

// 启动 vite preview（独立进程，拍完即杀）
const preview = spawn(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), 'preview', '--port', String(PORT), '--strictPort'], {
  cwd: root, stdio: 'ignore', windowsHide: true
})
const cleanup = () => { try { preview.kill() } catch {} }
process.on('exit', cleanup)

// 等 preview 就绪
async function waitReady() {
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(base); if (r.ok) return } catch {}
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error('vite preview 未在 10s 内就绪')
}

const shots = [
  { name: 'hero-desktop.png', hash: '#demo', w: 1440, h: 900 },
  { name: 'desktop-stats.png', hash: '#demo/stats', w: 1440, h: 900 },
  { name: 'desktop-settings.png', hash: '#demo/settings', w: 1440, h: 900 },
  { name: 'light-home.png', hash: '#demo', w: 1440, h: 900, dark: true },
  { name: 'mobile-home.png', hash: '#demo', w: 390, h: 844, mobile: true },
  { name: 'mobile-editor.png', hash: '#demo/add', w: 390, h: 844, mobile: true }
]

async function shoot({ name, hash, w, h, mobile, dark }) {
  const out = resolve(docs, name)
  const profile = resolve(tmpdir(), `inkledger-shot-${name}-${Date.now()}`)
  mkdirSync(profile, { recursive: true })
  // 夜班主题：用 #dark 深链（与 #light 对称），App.vue 启动时据此切暗
  const url = base + hash + (dark ? '/dark' : '')
  const args = [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--disable-extensions', '--force-device-scale-factor=1',
    `--user-data-dir=${profile}`, `--window-size=${w},${h}`,
    '--virtual-time-budget=6000', `--screenshot=${out}`, url
  ]
  if (mobile) args.push('--user-agent=Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1')
  const r = spawnSync(edge, args, { stdio: 'ignore', timeout: 60000 })
  rmSync(profile, { recursive: true, force: true })
  if (!existsSync(out) || statSync(out).size < 5000) throw new Error(`${name} 截图失败（exit ${r.status}）`)
  console.log(`✓ ${name} (${(statSync(out).size / 1024).toFixed(1)} KB, ${w}×${h})`)
}

await waitReady()
for (const s of shots) await shoot(s)
cleanup()
console.log('全部截图完成 → docs/')