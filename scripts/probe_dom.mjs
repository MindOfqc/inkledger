/**
 * 无头 Edge + CDP DOM 探针：逐页确认手绘猫插画真实加载、移动视口布局、无横向溢出、无控制台报错。
 * 用法：node scripts/probe_dom.mjs（需先 pnpm build）。独立 user-data-dir，不触碰用户浏览器。
 * 仅开发期验证，不参与构建。Node 22+ 内置 WebSocket/fetch，无额外依赖。
 */
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, rmSync, statSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { tmpdir } from 'node:os'

const root = resolve(import.meta.dirname, '..')
const edge = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
].find((p) => { try { statSync(p); return true } catch { return false } })
if (!edge) throw new Error('未找到 Edge')
if (!existsSync(resolve(root, 'dist/index.html'))) throw new Error('请先 pnpm build')

const PORT = 4199
const CDP = 9222
const base = `http://localhost:${PORT}/`
const preview = spawn(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), 'preview', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'ignore', windowsHide: true })
const profile = resolve(tmpdir(), `pawpress-probe-${Date.now()}`)
mkdirSync(profile, { recursive: true })
const browser = spawn(edge, ['--headless=new', '--disable-gpu', '--no-first-run', '--disable-extensions', `--remote-debugging-port=${CDP}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore', windowsHide: true })
const cleanup = () => { try { browser.kill() } catch {}; try { preview.kill() } catch {}; try { rmSync(profile, { recursive: true, force: true }) } catch {} }
process.on('exit', cleanup)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function waitReady(url, tries = 60) {
  for (let i = 0; i < tries; i++) { try { const r = await fetch(url); if (r.ok) return } catch {}; await sleep(250) }
  throw new Error('未就绪: ' + url)
}

// —— 极简 CDP 客户端 ——
let ws, msgId = 0
const pending = new Map()
const errors = []
function send(method, params = {}) {
  return new Promise((res, rej) => {
    const id = ++msgId
    pending.set(id, { res, rej })
    ws.send(JSON.stringify({ id, method, params }))
  })
}
async function connect() {
  const list = await (await fetch(`http://localhost:${CDP}/json/list`)).json()
  const page = list.find((t) => t.type === 'page')
  if (!page) throw new Error('无 page target')
  ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
  ws.onmessage = (ev) => {
    const m = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString())
    if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result) }
    else if (m.method === 'Runtime.exceptionThrown') errors.push('EXC: ' + (m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || '?'))
    else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('CONSOLE: ' + m.params.args.map((a) => a.value || a.description || '').join(' '))
  }
  await send('Page.enable'); await send('Runtime.enable')
}
async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text))
  return r.result.value
}
async function goto(hash, { w, h, mobile, clearStorage }) {
  errors.length = 0
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: !!mobile })
  if (mobile) await send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' })
  else await send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36 Edg/120.0' })
  await send('Page.navigate', { url: base + hash })
  await sleep(700)
  if (clearStorage) { await evaluate(`localStorage.clear();sessionStorage.clear();`); }
  // 深链处理只在文档加载时执行；同源 hash 切换不会重载，强制整文档重载以模拟真实新访问
  await send('Page.reload', { ignoreCache: false })
  await sleep(1400)
  // 强制 eager + 滚到底触发懒加载，再回顶
  await evaluate(`[...document.querySelectorAll('img.cat-art')].forEach(i=>i.loading='eager');window.scrollTo(0,document.body.scrollHeight);`)
  await sleep(900)
  await evaluate(`window.scrollTo(0,0);`)
  await sleep(350)
  return evaluate(`(() => {
    const cats=[...document.querySelectorAll('img.cat-art')].map(im=>({alt:im.alt,nw:im.naturalWidth,ok:im.complete&&im.naturalWidth>0}));
    const de=document.documentElement;
    const sn=document.querySelector('.sidenav'), tb=document.querySelector('.tabbar');
    return JSON.stringify({
      title:document.title,
      h1:(document.querySelector('.masthead__title')||document.querySelector('h1')||{}).textContent?.trim()||null,
      theme:de.dataset.theme,
      cats, catsOk:cats.every(c=>c.ok), catCount:cats.length,
      overflowX:de.scrollWidth>window.innerWidth+1, scrollW:de.scrollWidth, innerW:window.innerWidth,
      sidenav:sn?getComputedStyle(sn).display:'absent', tabbar:tb?getComputedStyle(tb).display:'absent'
    });
  })()`)
}

const MEASURE = (s) => JSON.parse(s)
let fail = 0
function check(label, cond, extra = '') { console.log(`[${cond ? 'ok' : 'FAIL'}] ${label}${extra ? ' · ' + extra : ''}`); if (!cond) fail++ }

await waitReady(base); await waitReady(`http://localhost:${CDP}/json/version`)
await connect()

// 桌面各页（#demo 有数据）
const desk = { w: 1440, h: 900, mobile: false }
let r = MEASURE(await goto('#demo', desk))
check('桌面首页 标题', r.title.includes('爪爪日报'), r.title)
check('桌面首页 报头猫加载', r.cats.some((c) => c.alt.includes('端坐读报') && c.ok))
check('桌面首页 全部猫加载', r.catsOk, `${r.catCount} 只: ` + r.cats.map((c) => c.alt).join('/'))
check('桌面首页 无横向溢出', !r.overflowX, `scrollW=${r.scrollW} innerW=${r.innerW}`)
check('桌面首页 侧栏可见', r.sidenav !== 'none' && r.sidenav !== 'absent', r.sidenav)
check('桌面首页 无报错', errors.length === 0, errors.join(' | '))

r = MEASURE(await goto('#demo/stats', desk))
check('统计副刊 署名猫加载', r.cats.some((c) => c.ok), `${r.catCount} 只`)
check('统计副刊 无横向溢出', !r.overflowX)
check('统计副刊 无报错', errors.length === 0, errors.join(' | '))

r = MEASURE(await goto('#demo/settings', desk))
check('编辑部设置 头图猫加载', r.cats.some((c) => c.ok), `${r.catCount} 只`)
check('编辑部设置 无横向溢出', !r.overflowX)
check('编辑部设置 无报错', errors.length === 0, errors.join(' | '))

r = MEASURE(await goto('#demo/add', desk))
check('投稿单 读报猫加载', r.cats.some((c) => c.alt.includes('读报') && c.ok), `${r.catCount} 只`)
check('投稿单 无横向溢出', !r.overflowX)
check('投稿单 无报错', errors.length === 0, errors.join(' | '))

// 空态首页（清空 localStorage → 无账目 → 蜷睡猫）
r = MEASURE(await goto('#light', { ...desk, clearStorage: true }))
check('空态首页 蜷睡猫加载', r.cats.some((c) => c.alt.includes('打盹') && c.ok), r.cats.map((c) => c.alt).join('/'))
check('空态首页 无报错', errors.length === 0, errors.join(' | '))

// 移动视口
const mob = { w: 390, h: 844, mobile: true }
r = MEASURE(await goto('#demo', mob))
check('移动首页 报头猫加载', r.cats.some((c) => c.alt.includes('端坐读报') && c.ok))
check('移动首页 侧栏隐藏', r.sidenav === 'none', r.sidenav)
check('移动首页 底栏可见', r.tabbar === 'flex', r.tabbar)
check('移动首页 无横向溢出', !r.overflowX, `scrollW=${r.scrollW} innerW=${r.innerW}`)
check('移动首页 无报错', errors.length === 0, errors.join(' | '))

r = MEASURE(await goto('#demo/add', mob))
check('移动投稿单 读报猫加载', r.cats.some((c) => c.alt.includes('读报') && c.ok))
check('移动投稿单 无横向溢出', !r.overflowX, `scrollW=${r.scrollW} innerW=${r.innerW}`)
check('移动投稿单 无报错', errors.length === 0, errors.join(' | '))

// 夜班主题
r = MEASURE(await goto('#demo/dark', desk))
check('夜班主题生效', r.theme === 'dark', r.theme)
check('夜班首页 报头猫加载', r.cats.some((c) => c.alt.includes('端坐读报') && c.ok))

cleanup()
console.log(fail === 0 ? '\nALL DOM PROBES OK' : `\n${fail} 项失败`)
process.exit(fail === 0 ? 0 : 1)