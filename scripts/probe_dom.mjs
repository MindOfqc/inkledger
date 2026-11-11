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

// —— 真实交互助手：CDP 派发鼠标 / 键盘事件，走 Vue 真实事件链路 ——
const rectOf = async (selector) => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`)
async function clickSel(selector) {
  const p = await rectOf(selector)
  if (!p) throw new Error('click: 未找到 ' + selector)
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 })
  await sleep(200)
}
async function setSelect(selector, value) {
  await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('change', { bubbles: true })); })()`)
  await sleep(250)
}
async function setInput(selector, value) {
  await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('input', { bubbles: true })); })()`)
  await sleep(200)
}
async function pressKey(key, code, vk) {
  const base = { key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk }
  await send('Input.dispatchKeyEvent', { type: 'keyDown', ...base })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base })
  await sleep(280)
}
const countTx = () => evaluate(`document.querySelectorAll('.tx').length`)
const archiveCount = () => evaluate(`(() => { const m = (document.querySelector('.edition__count') || {}).textContent || ''; return parseInt(m, 10) || 0; })()`)
const toastHasUndo = () => evaluate(`!!document.querySelector('.toast__action')`)
const confirmOpen = () => evaluate(`!!document.querySelector('.overlay--confirm')`)

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

/* ===== 真实交互验证（桌面 · 全新示例数据，基线确定） ===== */
await goto('#demo', { ...desk, clearStorage: true })
const N0 = await archiveCount()
check('交互基线 有存档', N0 > 0, `${N0} 笔`)

// 1) 实时排序：金额降序后首行金额 ≥ 次行
await setSelect('.list-controls select', 'amount-desc')
const amts = await evaluate(`[...document.querySelectorAll('.tx__amount')].slice(0, 2).map(e => parseFloat(e.textContent.replace(/[^\\d.]/g, '')) || 0)`)
check('排序 金额降序生效', amts.length === 2 && amts[0] >= amts[1], amts.join(' / '))
await setSelect('.list-controls select', 'date-desc')

// 2) 保存视图：筛选支出 + 金额降序 → 收藏 → 重置 → 套用
await evaluate(`[...document.querySelectorAll('.chips .chip')].find(c => c.textContent.trim() === '支出').click()`)
await sleep(200)
await setSelect('.list-controls select', 'amount-desc')
await evaluate(`[...document.querySelectorAll('.list-controls .chip')].find(c => c.textContent.includes('保存视图')).click()`)
await sleep(200)
await setInput('.saved-view__input', '大额支出')
await evaluate(`document.querySelector('.saved-view--form .btn--gold').click()`)
await sleep(250)
check('保存视图 收藏成功', await evaluate(`!!document.querySelector('.saved-view__apply')`))
// 重置筛选后套用
await evaluate(`[...document.querySelectorAll('.chips .chip')].find(c => c.textContent.trim() === '全部').click()`)
await sleep(150)
await setSelect('.list-controls select', 'date-desc')
await evaluate(`document.querySelector('.saved-view__apply').click()`)
await sleep(300)
const viewState = await evaluate(`(() => ({ type: [...document.querySelectorAll('.chips .chip')].find(c => c.classList.contains('chip--on'))?.textContent.trim(), sort: document.querySelector('.list-controls select').value }))()`)
check('保存视图 套用恢复筛选', viewState.type === '支出', JSON.stringify(viewState))
check('保存视图 套用恢复排序', viewState.sort === 'amount-desc', viewState.sort)
// 移除视图（确认框）
await evaluate(`document.querySelector('.saved-view__del').click()`)
await sleep(250)
check('移除视图 弹出确认框', await confirmOpen())
await evaluate(`document.querySelector('.confirm__actions .btn--danger-solid').click()`)
await sleep(300)
check('移除视图 确认后消失', !(await evaluate(`!!document.querySelector('.saved-view__apply')`)))
// 还原全部筛选
await evaluate(`[...document.querySelectorAll('.chips .chip')].find(c => c.textContent.trim() === '全部').click()`)
await sleep(150)
await setSelect('.list-controls select', 'date-desc')

// 3) 批量选择删除 + 撤销
await evaluate(`[...document.querySelectorAll('.list-controls .chip')].find(c => c.textContent.includes('批量选择')).click()`)
await sleep(250)
check('批量 进入选择模式', await evaluate(`!!document.querySelector('.bulk-bar')`))
await evaluate(`document.querySelector('.bulk-bar__all input').click()`)
await sleep(250)
const selCount = await evaluate(`document.querySelectorAll('.tx-row--sel').length`)
check('批量 全选命中', selCount > 0, `${selCount} 笔`)
await evaluate(`document.querySelector('.bulk-bar .btn--danger').click()`)
await sleep(250)
check('批量删除 弹出确认框', await confirmOpen())
await evaluate(`document.querySelector('.confirm__actions .btn--danger-solid').click()`)
await sleep(350)
const N1 = await archiveCount()
check('批量删除 存档减少', N1 === N0 - selCount, `${N0} → ${N1}`)
check('批量删除 提示带撤销', await toastHasUndo())
await evaluate(`document.querySelector('.toast__action').click()`)
await sleep(350)
const N2 = await archiveCount()
check('批量撤销 存档恢复', N2 === N0, `${N1} → ${N2}`)

// 4) 投稿单删除单笔 + 撤销
await evaluate(`document.querySelector('.tx').click()`)
await sleep(350)
check('投稿单 编辑弹层打开', await evaluate(`!!document.querySelector('.overlay .sheet')`))
await evaluate(`document.querySelector('.overlay .sheet .actions .btn--danger').click()`)
await sleep(250)
check('投稿单删除 弹出确认框', await confirmOpen())
// 焦点默认落在「取消」
const focusedCancel = await evaluate(`document.activeElement === document.querySelector('.confirm__actions .btn')`)
check('确认框 焦点默认在取消', focusedCancel)
// 焦点在取消时按回车 = 取消，绝不触发危险操作
await pressKey('Enter', 'Enter', 13)
await sleep(250)
check('确认框 取消态回车不确认', !(await confirmOpen()))
check('回车取消后存档未变', (await archiveCount()) === N0)
check('回车取消后投稿单仍在', await evaluate(`!!document.querySelector('.overlay .sheet')`))
// 重新打开，Esc 取消确认
await evaluate(`document.querySelector('.overlay .sheet .actions .btn--danger').click()`)
await sleep(250)
await pressKey('Escape', 'Escape', 27)
await sleep(250)
check('确认框 Esc 取消', !(await confirmOpen()))
check('Esc 取消后投稿单仍在', await evaluate(`!!document.querySelector('.overlay .sheet')`))
// 再次删除：Tab 到「确定」再回车才确认
await evaluate(`document.querySelector('.overlay .sheet .actions .btn--danger').click()`)
await sleep(250)
await pressKey('Tab', 'Tab', 9)
await sleep(120)
const focusedConfirm = await evaluate(`document.activeElement === document.querySelector('.confirm__actions .btn--danger-solid')`)
check('确认框 Tab 移到确定', focusedConfirm)
await pressKey('Enter', 'Enter', 13)
await sleep(350)
check('确认框 确定态回车确认', !(await confirmOpen()))
const N3 = await archiveCount()
check('投稿单删除 存档减一', N3 === N0 - 1, `${N0} → ${N3}`)
check('投稿单删除 提示带撤销', await toastHasUndo())
await evaluate(`document.querySelector('.toast__action').click()`)
await sleep(350)
check('投稿单撤销 存档恢复', (await archiveCount()) === N0)

// 5) 新建投稿（算式金额）端到端
await evaluate(`[...document.querySelectorAll('.tabbar__item, .sidenav__item')].find(b => b.textContent.includes('记一笔'))?.click()`)
await sleep(350)
check('新建 投稿单打开', await evaluate(`!!document.querySelector('.overlay .sheet')`))
await setInput('.amount-box__input', '12+8')
await evaluate(`document.querySelector('.amount-box__input').dispatchEvent(new Event('blur'))`)
await sleep(200)
const normAmt = await evaluate(`document.querySelector('.amount-box__input').value`)
check('新建 算式金额归一', normAmt === '20' || normAmt === '20.00', normAmt)
await evaluate(`document.querySelector('.overlay .sheet .actions .btn--gold').click()`)
await sleep(350)
check('新建 投稿入账存档加一', (await archiveCount()) === N0 + 1)
// 删除刚建的投稿以回到基线（不撤销）
await evaluate(`document.querySelector('.tx').click()`)
await sleep(300)
await evaluate(`document.querySelector('.overlay .sheet .actions .btn--danger').click()`)
await sleep(200)
await evaluate(`document.querySelector('.confirm__actions .btn--danger-solid').click()`)
await sleep(300)
check('端到端 回到基线存档', (await archiveCount()) === N0, `${await archiveCount()}`)
check('交互全程无报错', errors.length === 0, errors.join(' | '))

// 6) 移动视口批量条不溢出
r = MEASURE(await goto('#demo', mob))
await evaluate(`[...document.querySelectorAll('.list-controls .chip')].find(c => c.textContent.includes('批量选择')).click()`)
await sleep(300)
check('移动 批量条无横向溢出', await evaluate(`document.documentElement.scrollWidth <= window.innerWidth + 1`))
check('移动 批量条可见', await evaluate(`!!document.querySelector('.bulk-bar')`))

cleanup()
console.log(fail === 0 ? '\nALL DOM PROBES OK' : `\n${fail} 项失败`)
process.exit(fail === 0 ? 0 : 1)