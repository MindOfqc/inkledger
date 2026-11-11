/**
 * 手绘多彩图标注册表 —— 「喵账本 MeowLedger」贴纸风
 * 24×24 画布：彩色填充 + 深棕手绘描边（微微歪斜的贝塞尔曲线），跨主题保持一致的贴纸质感。
 * 值为 [tag, attrs] 数组；attrs 里的 fill/stroke 直接落在元素上（presentation attribute 不支持 var()，故用固定色）。
 * 分类与账户数据中的图标字段以 ":name" 引用此表；旧数据里的 emoji 仍按文本渲染。
 */
const S = '#5b4632'          // 描边：铅笔深棕
const W = '#fdf6e8'          // 留白：纸白
const O = '#f29b38'          // 橘黄
const OD = '#d97b1f'         // 深橘
const G = '#3f7d5c'          // 墨绿
const GL = '#7fb08a'         // 浅绿
const R = '#d95f4b'          // 朱砂红
const B = '#5f8faf'          // 湖蓝
const Y = '#f2c94c'          // 邮黄
const P = '#b48ec7'          // 淡紫
const PK = '#e89aa4'         // 猫粉
const T = '#c9a06b'          // 牛皮纸
const stroke = { stroke: S, 'stroke-width': 1.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }
const el = (tag, attrs) => [tag, { ...stroke, ...attrs }]
const line = (d, extra = {}) => el('path', { d, fill: 'none', ...extra })

export const ICONS = {
  /* —— 导航 / 界面 —— */
  // 报纸：折页 + 报头 + 分栏文字线 + 橘色小方块照片位
  "ledger": [
    el('path', { d: 'M4.6 3.4c5-.5 10-.4 14.8.1.4 5.8.3 11.4-.1 17-5 .6-9.8.5-14.6-.1-.5-5.7-.5-11.3-.1-17Z', fill: W }),
    el('path', { d: 'M4.6 3.4c5-.5 10-.4 14.8.1l.1 3.2c-5-.5-10-.5-14.9-.1Z', fill: O }),
    line('M7.2 10.2c2.6-.3 5.2-.3 7.6 0M7.2 13c2.6-.2 5.2-.2 7.6 0M7.2 15.8c2.6-.2 5.2-.2 7.6 0', { 'stroke-width': 1.2 }),
    el('rect', { x: 16.2, y: 9.6, width: 2.6, height: 3.4, rx: .6, fill: GL, 'stroke-width': 1.2 })
  ],
  // 图表：三根彩柱 + 手绘上升折线
  "stats": [
    line('M3.4 20.6c5.8.3 11.6.3 17.2 0', { 'stroke-width': 1.6 }),
    el('rect', { x: 5, y: 12.5, width: 3.6, height: 8, rx: 1.2, fill: O }),
    el('rect', { x: 10.2, y: 8.5, width: 3.6, height: 12, rx: 1.2, fill: G }),
    el('rect', { x: 15.4, y: 10.5, width: 3.6, height: 10, rx: 1.2, fill: B }),
    line('M4.6 8.8C8 6.8 11 7.6 13.4 5.2c1.6-1.4 3.4-1.6 5.6-1', { stroke: R, 'stroke-width': 1.6 }),
    el('circle', { cx: 19.4, cy: 4, r: 1.3, fill: R, 'stroke-width': 1.2 })
  ],
  // 铅笔：斜放的橘杆铅笔，正在写一笔
  "pen": [
    el('path', { d: 'm5 19 .9-3.8L16.3 4.6c.9-.9 2.3-.9 3.1 0 .9.9.9 2.3 0 3.1L9 18.2 5 19Z', fill: O }),
    el('path', { d: 'm14.8 6.2 3 3 1.6-1.5c.9-.9.9-2.3 0-3.1-.9-.9-2.3-.9-3.1 0Z', fill: PK }),
    el('path', { d: 'M5.9 15.2 9 18.2 5 19Z', fill: W }),
    line('M4 21.6c3.6.2 7 .2 10.4 0', { 'stroke-width': 1.3, stroke: OD })
  ],
  // 齿轮：墨绿手绘齿轮 + 橘色轴心
  "settings": [
    el('path', { d: 'M10.7 2.8h2.7l.5 2.3c.7.2 1.3.5 1.9.9l2.2-.9 1.9 1.9-.9 2.2c.4.6.7 1.2.9 1.9l2.3.5v2.7l-2.3.5c-.2.7-.5 1.3-.9 1.9l.9 2.2-1.9 1.9-2.2-.9c-.6.4-1.2.7-1.9.9l-.5 2.3h-2.7l-.5-2.3c-.7-.2-1.3-.5-1.9-.9l-2.2.9-1.9-1.9.9-2.2c-.4-.6-.7-1.2-.9-1.9l-2.3-.5v-2.7l2.3-.5c.2-.7.5-1.3.9-1.9l-.9-2.2 1.9-1.9 2.2.9c.6-.4 1.2-.7 1.9-.9Z', fill: G }),
    el('circle', { cx: 12, cy: 12.4, r: 3.2, fill: Y })
  ],
  // 太阳：橘黄圆 + 歪歪的光芒
  "sun": [
    el('circle', { cx: 12, cy: 12, r: 4.6, fill: Y }),
    el('circle', { cx: 12, cy: 12, r: 2.4, fill: O, 'stroke-width': 1.2 }),
    line('M12 2.6v2.4M12 19v2.4M2.6 12H5M19 12h2.4M5.2 5.2l1.7 1.7M17.1 17.1l1.7 1.7M18.8 5.2l-1.7 1.7M6.9 17.1l-1.7 1.7', { stroke: OD, 'stroke-width': 1.6 })
  ],
  // 月亮：夜里编辑部台灯下的弯月 + 星星
  "moon": [
    el('path', { d: 'M13.2 3.4c-4.6.6-8 4.4-8 9 0 4.8 3.8 8.6 8.4 8.6 3.2 0 6-1.8 7.4-4.4-5.4.8-9.8-3.2-9.8-8.4 0-1.8.7-3.4 2-4.8Z', fill: B }),
    el('path', { d: 'm18.4 4.6.7 1.7 1.7.7-1.7.7-.7 1.7-.7-1.7-1.7-.7 1.7-.7Z', fill: Y, 'stroke-width': 1.2 })
  ],
  // 放大镜：湖蓝镜片
  "search": [
    el('circle', { cx: 10.6, cy: 10.6, r: 6.4, fill: '#cfe3ef' }),
    line('M7.6 9.4c.6-1.6 2-2.6 3.6-2.6', { stroke: '#ffffff', 'stroke-width': 1.6 }),
    line('m15.4 15.6 4.8 4.8', { 'stroke-width': 2.4 })
  ],
  // 转账：一橘一绿两支对开的箭头
  "transfer": [
    el('path', { d: 'M7.8 3.4 4 7l3.8 3.6V8.4h11.4V5.6H7.8Z', fill: O }),
    el('path', { d: 'm16.2 20.6 3.8-3.6-3.8-3.6v2.2H4.8v2.8h11.4Z', fill: G })
  ],
  /* —— 支出分类 —— */
  // 餐饮：一碗冒热气的猫饭（鱼形小鱼干插在上面）
  "food": [
    el('path', { d: 'M4 12.4c5.4-.7 10.6-.7 16 0-.2 4.4-3.6 7.8-8 7.8s-7.8-3.4-8-7.8Z', fill: R }),
    el('path', { d: 'M4 12.4c5.4-.7 10.6-.7 16 0l-.1 1.6c-5.2-.6-10.6-.6-15.8 0Z', fill: W, 'stroke-width': 1.2 }),
    el('path', { d: 'M13.6 4.6c1.8-.4 3.6.2 4.6 1.6-1 1.4-2.8 2-4.6 1.6l-1.4 1-.4-1.6c-.6-.6-.6-1.4 0-2l.4-1.6Z', fill: B, 'stroke-width': 1.3 }),
    el('path', { d: 'm18.2 6.2 1.8-1.2v2.4Z', fill: B, 'stroke-width': 1.2 }),
    line('M7.6 9.6c-.4-1 .4-1.6 0-2.6M10.4 9.4c-.4-1 .4-1.6 0-2.6', { 'stroke-width': 1.2 })
  ],
  // 交通：小巴士
  "transport": [
    el('path', { d: 'M4 6.6c5.2-.6 10.8-.6 16 0 .3 3.6.3 7 0 10.4-5.2.6-10.8.6-16 0-.3-3.4-.3-7 0-10.4Z', fill: O }),
    el('path', { d: 'M6 8.4c1.8-.2 3.4-.2 5-.1v4H6Z', fill: '#cfe3ef', 'stroke-width': 1.2 }),
    el('path', { d: 'M13 8.3c1.6-.1 3.2-.1 5 .1v4h-5Z', fill: '#cfe3ef', 'stroke-width': 1.2 }),
    el('circle', { cx: 7.6, cy: 18.6, r: 1.9, fill: S }),
    el('circle', { cx: 16.4, cy: 18.6, r: 1.9, fill: S }),
    line('M4.4 15.2h15.2', { 'stroke-width': 1.2 })
  ],
  // 购物：手提袋 + 爱心
  "shopping": [
    el('path', { d: 'M5.4 8.4c4.4-.5 8.8-.5 13.2 0l1 11.4c-5 .7-10.2.7-15.2 0Z', fill: P }),
    line('M8.6 10.6V7c0-2 1.5-3.6 3.4-3.6S15.4 5 15.4 7v3.6', { 'stroke-width': 1.6 }),
    el('path', { d: 'M12 16.8s-2.6-1.6-2.6-3.2c0-.9.7-1.6 1.5-1.6.5 0 .9.2 1.1.6.2-.4.6-.6 1.1-.6.8 0 1.5.7 1.5 1.6 0 1.6-2.6 3.2-2.6 3.2Z', fill: R, 'stroke-width': 1.2 })
  ],
  // 生鲜：胡萝卜
  "grocery": [
    el('path', { d: 'M10 8.6c1.8-1.2 4-1 5.4.4 1.4 1.4 1.6 3.6.4 5.4-2.6 3.8-6.4 6-10.6 6.4.4-4.2 2.2-8.6 4.8-12.2Z', fill: O }),
    line('M8.4 12.6l2 2M6.8 16l1.6 1.6', { stroke: OD, 'stroke-width': 1.3 }),
    el('path', { d: 'M14.4 7.4c.2-2 1.4-3.6 3.4-4.2.2 1.2 0 2.4-.6 3.4 1.2-.4 2.4-.4 3.6.2-.8 1.8-2.6 2.8-4.6 2.6Z', fill: G })
  ],
  // 居家：沙发
  "household": [
    el('path', { d: 'M6 10V7.4c0-1.2 1-2.2 2.2-2.2h7.6c1.2 0 2.2 1 2.2 2.2V10', fill: GL }),
    el('path', { d: 'M4.2 10.2c1 0 1.8.8 1.8 1.8v1.6h12V12c0-1 .8-1.8 1.8-1.8s1.8.8 1.8 1.8v4.6c0 1-.8 1.8-1.8 1.8H4.2c-1 0-1.8-.8-1.8-1.8V12c0-1 .8-1.8 1.8-1.8Z', fill: G }),
    line('M5.4 18.6v1.8M18.6 18.6v1.8', { 'stroke-width': 1.6 })
  ],
  // 住房：小屋 + 烟囱
  "housing": [
    el('path', { d: 'm3.6 11 8.4-7 8.4 7', fill: 'none', 'stroke-width': 1.8 }),
    el('path', { d: 'M5.8 9.6V19c4.2.5 8.2.5 12.4 0V9.6L12 4.6Z', fill: W }),
    el('path', { d: 'm3.6 11 8.4-7 8.4 7-1.4 1.6L12 6.6l-7 6Z', fill: R }),
    el('rect', { x: 10, y: 13.4, width: 4, height: 5.8, rx: 1, fill: O }),
    el('rect', { x: 15.2, y: 3.6, width: 2.2, height: 3.4, rx: .5, fill: T, 'stroke-width': 1.2 })
  ],
  // 通讯：手机 + 信号
  "telecom": [
    el('rect', { x: 7, y: 3, width: 10, height: 18, rx: 2.4, fill: B }),
    el('rect', { x: 9, y: 6, width: 6, height: 9.4, rx: 1, fill: '#cfe3ef', 'stroke-width': 1.2 }),
    line('M10.8 18.4h2.4', { stroke: W, 'stroke-width': 1.6 }),
    el('path', { d: 'm12.6 8.4 1.2 2.2 2.2.4-1.6 1.7.3 2.3-2.1-1-2.1 1 .3-2.3-1.6-1.7 2.2-.4Z', fill: Y, 'stroke-width': 1 })
  ],
  // 娱乐：游戏手柄
  "media": [
    el('path', { d: 'M7.4 7.2h9.2c2.6 0 4.6 2 4.6 4.6 0 2.4-.6 4.8-1.6 6.6-.7 1.2-2.3 1.4-3.3.4l-1.7-1.7c-.4-.4-.9-.6-1.4-.6h-2.4c-.5 0-1 .2-1.4.6l-1.7 1.7c-1 1-2.6.8-3.3-.4-1-1.8-1.6-4.2-1.6-6.6 0-2.6 2-4.6 4.6-4.6Z', fill: P }),
    line('M8.6 10.4v3.6M6.8 12.2h3.6', { stroke: W, 'stroke-width': 1.6 }),
    el('circle', { cx: 15.2, cy: 13, r: 1.1, fill: Y, 'stroke-width': 1.1 }),
    el('circle', { cx: 17.6, cy: 11, r: 1.1, fill: R, 'stroke-width': 1.1 })
  ],
  // 数码：云朵下载
  "digital": [
    el('path', { d: 'M7 17.4c-2.4 0-4.2-1.8-4.2-4.2 0-2.2 1.7-4 3.9-4.2.7-2.6 3-4.4 5.7-4.4 3 0 5.5 2.2 5.9 5.1 1.7.4 2.9 1.9 2.9 3.7 0 2.2-1.8 4-4 4Z', fill: B }),
    line('M12 10.6v7.2m0 0-2.6-2.6m2.6 2.6 2.6-2.6', { stroke: W, 'stroke-width': 1.8 })
  ],
  // 服饰：T 恤
  "fashion": [
    el('path', { d: 'm9 4.4-5 2 1.2 3.8 2.2-.6V19c3.1.5 6.1.5 9.2 0V9.6l2.2.6L20 6.4l-5-2c-.3 1.4-1.5 2.4-3 2.4s-2.7-1-3-2.4Z', fill: PK }),
    el('path', { d: 'M12 12.6s-2-1.2-2-2.4c0-.7.5-1.2 1.1-1.2.4 0 .7.2.9.5.2-.3.5-.5.9-.5.6 0 1.1.5 1.1 1.2 0 1.2-2 2.4-2 2.4Z', fill: R, 'stroke-width': 1.1 })
  ],
  // 医疗：胶囊 + 十字
  "health": [
    el('rect', { x: 3.2, y: 9.2, width: 17.6, height: 8.4, rx: 4.2, fill: W, transform: 'rotate(-32 12 13.4)' }),
    el('path', { d: 'M8.2 17.9a4.2 4.2 0 0 1-1.3-5.8l2.3-3.5a4.2 4.2 0 0 1 5.8-1.3Z', fill: R, transform: 'rotate(0)' }),
    line('M16 15.6v4M14 17.6h4', { stroke: G, 'stroke-width': 1.7 })
  ],
  // 教育：翻开的书
  "education": [
    el('path', { d: 'M12 6.4C10 4.9 7.4 4.4 4 4.8v13c3.4-.4 6 .1 8 1.6 2-1.5 4.6-2 8-1.6v-13c-3.4-.4-6 .1-8 1.6Z', fill: W }),
    el('path', { d: 'M12 6.4C10 4.9 7.4 4.4 4 4.8v13c3.4-.4 6 .1 8 1.6Z', fill: '#f7e3bd' }),
    line('M12 6.4v13', { 'stroke-width': 1.4 }),
    line('M6.4 8.6c1.4-.1 2.6 0 3.8.4M6.4 11.6c1.4-.1 2.6 0 3.8.4M13.8 9c1.2-.4 2.4-.5 3.8-.4M13.8 12c1.2-.4 2.4-.5 3.8-.4', { 'stroke-width': 1.1, stroke: T })
  ],
  // 人情：礼物盒
  "gifting": [
    el('rect', { x: 4.4, y: 10.4, width: 15.2, height: 9.4, rx: 1.4, fill: R }),
    el('rect', { x: 3.4, y: 7, width: 17.2, height: 3.6, rx: 1.2, fill: O }),
    line('M12 7v12.8', { stroke: Y, 'stroke-width': 2 }),
    el('path', { d: 'M12 6.8C10.8 4.6 9.4 3.4 7.8 3.8c-1.2.3-1.6 1.8-.8 2.6.8.8 2.6.8 5 .4Zm0 0c1.2-2.2 2.6-3.4 4.2-3 1.2.3 1.6 1.8.8 2.6-.8.8-2.6.8-5 .4Z', fill: Y, 'stroke-width': 1.3 })
  ],
  // 宠物：猫爪印
  "pet": [
    el('ellipse', { cx: 12, cy: 15.4, rx: 4.6, ry: 3.8, fill: PK }),
    el('ellipse', { cx: 5.8, cy: 10.2, rx: 1.9, ry: 2.4, fill: O, transform: 'rotate(-18 5.8 10.2)' }),
    el('ellipse', { cx: 10, cy: 6.8, rx: 1.9, ry: 2.5, fill: G, transform: 'rotate(-6 10 6.8)' }),
    el('ellipse', { cx: 14.4, cy: 6.8, rx: 1.9, ry: 2.5, fill: B, transform: 'rotate(6 14.4 6.8)' }),
    el('ellipse', { cx: 18.4, cy: 10.4, rx: 1.9, ry: 2.4, fill: Y, transform: 'rotate(18 18.4 10.4)' })
  ],
  // 旅行：行李箱
  "travel": [
    el('rect', { x: 4, y: 7.6, width: 16, height: 12, rx: 2.4, fill: O }),
    line('M9 7.4V5.6c0-.9.7-1.6 1.6-1.6h2.8c.9 0 1.6.7 1.6 1.6v1.8', { 'stroke-width': 1.6 }),
    line('M8.4 8v11.2M15.6 8v11.2', { stroke: OD, 'stroke-width': 1.5 }),
    el('circle', { cx: 12, cy: 13.4, r: 2, fill: Y, 'stroke-width': 1.2 })
  ],
  // 其他：标签
  "other": [
    el('path', { d: 'M11.8 3.2H5.4c-1.2 0-2.2 1-2.2 2.2v6.4c0 .6.2 1.1.6 1.5l8 8c.9.9 2.3.9 3.1 0l6.3-6.3c.9-.9.9-2.3 0-3.1l-8-8c-.4-.4-.9-.7-1.4-.7Z', fill: T }),
    el('circle', { cx: 7.6, cy: 7.6, r: 1.5, fill: W, 'stroke-width': 1.3 }),
    line('m11 12 4 4M13.4 9.6l4 4', { stroke: W, 'stroke-width': 1.3 })
  ],
  /* —— 收入分类 —— */
  // 工资：钱袋 ¥
  "salary": [
    el('path', { d: 'M9.4 6.8 8 4.2c2.6-1 5.4-1 8 0l-1.4 2.6c3.2 1.6 5.2 4.6 5.2 8 0 3.4-2.4 5.6-7.8 5.6s-7.8-2.2-7.8-5.6c0-3.4 2-6.4 5.2-8Z', fill: Y }),
    el('path', { d: 'M9.4 6.8c1.7-.5 3.5-.5 5.2 0', fill: 'none', 'stroke-width': 1.3 }),
    line('M9.8 11.4l2.2 2.8 2.2-2.8M12 14.2v3.4M9.9 15.4h4.2', { stroke: S, 'stroke-width': 1.5 })
  ],
  // 副业：小铺面
  "sidegig": [
    el('path', { d: 'M4.6 10.2h14.8V19c-5 .6-9.8.6-14.8 0Z', fill: W }),
    el('path', { d: 'M3.4 6.4 5 3.6h14l1.6 2.8c.5 1.4-.4 3-2 3-1 0-1.9-.6-2.2-1.5-.3.9-1.2 1.5-2.2 1.5s-1.9-.6-2.2-1.5c-.3.9-1.2 1.5-2.2 1.5s-1.9-.6-2.2-1.5c-.3.9-1.2 1.5-2.2 1.5-1.6 0-2.5-1.6-2-3Z', fill: R }),
    el('rect', { x: 9.8, y: 13, width: 4.4, height: 6.2, rx: .8, fill: G })
  ],
  // 投资：上扬的箭头
  "invest": [
    el('path', { d: 'm3.4 16.6 5.4-5.6 3.6 3.4 6.6-7', fill: 'none', stroke: G, 'stroke-width': 2 }),
    el('path', { d: 'M14.6 6.8h5v5l-1.8-1.7-1.5 1.6-1.7-1.6 1.7-1.7Z', fill: G }),
    el('circle', { cx: 5.2, cy: 19.4, r: 1.6, fill: Y, 'stroke-width': 1.2 }),
    el('circle', { cx: 10, cy: 19.6, r: 1.6, fill: O, 'stroke-width': 1.2 }),
    el('circle', { cx: 14.8, cy: 19.4, r: 1.6, fill: R, 'stroke-width': 1.2 })
  ],
  // 红包
  "redpacket": [
    el('rect', { x: 5.4, y: 3.4, width: 13.2, height: 17.2, rx: 2, fill: R }),
    el('path', { d: 'M5.4 5.4c4.4 2.6 8.8 2.6 13.2 0', fill: 'none', 'stroke-width': 1.3 }),
    el('circle', { cx: 12, cy: 10.6, r: 3, fill: Y }),
    line('M10.8 10.6h2.4M12 9.4v2.4', { stroke: S, 'stroke-width': 1.2 })
  ],
  // 退款：回转箭头 + 硬币
  "refund": [
    el('path', { d: 'M8.8 12.6 4.6 8.4l4.2-4.2v2.6h5.4c3.2 0 5.8 2.6 5.8 5.8s-2.6 5.8-5.8 5.8H9.6v-3h4.6c1.6 0 2.8-1.2 2.8-2.8s-1.2-2.8-2.8-2.8H8.8Z', fill: G }),
    el('circle', { cx: 7, cy: 18.2, r: 3, fill: Y, 'stroke-width': 1.3 }),
    line('M7 16.8v2.8M5.9 17.6h2.2', { stroke: S, 'stroke-width': 1.1 })
  ],
  /* —— 账户 —— */
  // 微信：绿色对话气泡
  "wechat": [
    el('path', { d: 'M12 3.6c-5 0-9 3.4-9 7.6 0 2.4 1.3 4.5 3.3 5.9L5.4 20l3.4-1.6c1 .3 2.1.4 3.2.4 5 0 9-3.4 9-7.6s-4-7.6-9-7.6Z', fill: '#69b76b' }),
    el('circle', { cx: 8.8, cy: 10.4, r: 1.1, fill: W, stroke: 'none' }),
    el('circle', { cx: 15.2, cy: 10.4, r: 1.1, fill: W, stroke: 'none' }),
    line('M9 13.6c1.9 1.2 4.1 1.2 6 0', { stroke: W, 'stroke-width': 1.4 })
  ],
  // 支付宝：蓝色圆角方 + 支字笔意
  "alipay": [
    el('rect', { x: 3.4, y: 3.4, width: 17.2, height: 17.2, rx: 4.4, fill: '#4d9fd6' }),
    line('M6.8 8.4h10.4M12 5.8v5.4M6.6 17.6c3.8-.6 7-2.4 9-5.2-2.4-.8-4.8-1-7-.4-1.6.5-2.4 1.6-2 2.8.4 1.1 1.9 1.6 3.6 1.2 2.6-.6 4.9-2.2 6.4-4.4', { stroke: W, 'stroke-width': 1.5 })
  ],
  // 现金：纸币
  "cash": [
    el('rect', { x: 2.8, y: 6.4, width: 18.4, height: 11.2, rx: 1.8, fill: GL }),
    el('circle', { cx: 12, cy: 12, r: 3, fill: W, 'stroke-width': 1.3 }),
    line('M12 10.6v2.8M10.9 11.4h2.2', { stroke: S, 'stroke-width': 1.1 }),
    line('M5.6 9.4v5.2M18.4 9.4v5.2', { stroke: G, 'stroke-width': 1.3 })
  ],
  // 银行：小楼
  "bank": [
    el('path', { d: 'M12 3 3.6 8h16.8Z', fill: R }),
    el('rect', { x: 4.8, y: 8, width: 14.4, height: 10.4, fill: W }),
    line('M7.6 9.6v7M12 9.6v7M16.4 9.6v7', { stroke: T, 'stroke-width': 1.8 }),
    el('rect', { x: 3.4, y: 18.4, width: 17.2, height: 2.4, rx: 1, fill: T })
  ],
  // 信用卡
  "credit": [
    el('rect', { x: 2.8, y: 5.4, width: 18.4, height: 13.2, rx: 2.2, fill: O }),
    el('rect', { x: 2.8, y: 8.2, width: 18.4, height: 2.8, fill: S, stroke: 'none' }),
    el('rect', { x: 5.4, y: 13.4, width: 4.4, height: 2.6, rx: .8, fill: Y, 'stroke-width': 1.1 }),
    line('M12.6 14.8h5.6', { stroke: W, 'stroke-width': 1.4 })
  ],
  // 其他账户：包裹盒
  "acc-other": [
    el('path', { d: 'M12 3 3.8 7.4v9.2L12 21l8.2-4.4V7.4Z', fill: T }),
    el('path', { d: 'M3.8 7.4 12 11.8l8.2-4.4', fill: 'none', 'stroke-width': 1.4 }),
    line('M12 11.8V21', { 'stroke-width': 1.4 }),
    el('path', { d: 'm7.6 5.4 8.4 4.4v3l-2-.9v-3L7.6 5.4Z', fill: Y, 'stroke-width': 1.1 })
  ],
  /* —— 品牌与助手 —— */
  // 猫头：记账助手墨墨（大头 Q 版，高光圆眼 + 腮红）
  "cat": [
    el('path', { d: 'M5.4 8.6 4.2 2.8l4.6 2.8Z', fill: O }),
    el('path', { d: 'm18.6 8.6 1.2-5.8-4.6 2.8Z', fill: O }),
    el('path', { d: 'M5.6 7.2 5 4.4l2.4 1.4Z', fill: PK, 'stroke-width': 1 }),
    el('path', { d: 'm18.4 7.2 .6-2.8-2.4 1.4Z', fill: PK, 'stroke-width': 1 }),
    el('ellipse', { cx: 12, cy: 13.4, rx: 8.6, ry: 7.4, fill: O }),
    line('M10.4 6.6c.2.7.2 1.3 0 1.9M12 6.3c.1.8.1 1.5 0 2.2M13.6 6.6c-.2.7-.2 1.3 0 1.9', { stroke: OD, 'stroke-width': 1.2 }),
    el('circle', { cx: 8.6, cy: 12.8, r: 1.5, fill: S, stroke: 'none' }),
    el('circle', { cx: 15.4, cy: 12.8, r: 1.5, fill: S, stroke: 'none' }),
    el('circle', { cx: 9.15, cy: 12.25, r: .55, fill: W, stroke: 'none' }),
    el('circle', { cx: 15.95, cy: 12.25, r: .55, fill: W, stroke: 'none' }),
    el('ellipse', { cx: 6.4, cy: 15.6, rx: 1.3, ry: .75, fill: PK, opacity: .6, stroke: 'none' }),
    el('ellipse', { cx: 17.6, cy: 15.6, rx: 1.3, ry: .75, fill: PK, opacity: .6, stroke: 'none' }),
    el('path', { d: 'M10.9 15.6h2.2l-1.1 1.5Z', fill: PK, 'stroke-width': 1.1 }),
    line('M12 17.1c-.4.8-1.2 1.2-2.1 1M12 17.1c.4.8 1.2 1.2 2.1 1M2.6 13.8l2.6.4M2.8 16.6l2.5-.6M21.4 13.8l-2.6.4M21.2 16.6l-2.5-.6', { 'stroke-width': 1.1 })
  ],
  // 爪印（单色简版，导航点缀）
  "paw": [
    el('ellipse', { cx: 12, cy: 15.8, rx: 4.2, ry: 3.4, fill: O }),
    el('circle', { cx: 6.4, cy: 10.6, r: 1.8, fill: O }),
    el('circle', { cx: 10.2, cy: 7.4, r: 1.8, fill: O }),
    el('circle', { cx: 14.2, cy: 7.4, r: 1.8, fill: O }),
    el('circle', { cx: 17.8, cy: 10.8, r: 1.8, fill: O })
  ],
  // 铃铛：账单提醒
  "bell": [
    el('path', { d: 'M12 3.4c.9 0 1.6.7 1.6 1.6v.6c2.8.7 4.8 3.2 4.8 6.2v3.4l1.8 2.6H3.8l1.8-2.6v-3.4c0-3 2-5.5 4.8-6.2V5c0-.9.7-1.6 1.6-1.6Z', fill: Y }),
    el('path', { d: 'M9.8 19.4a2.2 2.2 0 0 0 4.4 0Z', fill: O }),
    line('M8.6 9.4c.4-1.2 1.4-2 2.6-2.3', { stroke: W, 'stroke-width': 1.3 })
  ],
  // 日历
  "calendar": [
    el('rect', { x: 3.6, y: 5, width: 16.8, height: 15.4, rx: 2.2, fill: W }),
    el('path', { d: 'M3.6 7.2c0-1.2 1-2.2 2.2-2.2h12.4c1.2 0 2.2 1 2.2 2.2v2.4H3.6Z', fill: R }),
    line('M8 3v3.4M16 3v3.4', { 'stroke-width': 1.7 }),
    el('rect', { x: 6.6, y: 12, width: 3, height: 2.6, rx: .7, fill: O, 'stroke-width': 1.1 }),
    el('rect', { x: 10.6, y: 12, width: 3, height: 2.6, rx: .7, fill: GL, 'stroke-width': 1.1 }),
    el('rect', { x: 14.6, y: 12, width: 3, height: 2.6, rx: .7, fill: B, 'stroke-width': 1.1 }),
    el('rect', { x: 6.6, y: 15.8, width: 3, height: 2.6, rx: .7, fill: P, 'stroke-width': 1.1 })
  ],
  // 同步：双循环箭头
  "sync": [
    el('path', { d: 'M19.4 12c0 4.1-3.3 7.4-7.4 7.4-2.5 0-4.7-1.2-6-3.1l2.4-1.6c.8 1.1 2.1 1.8 3.6 1.8 2.4 0 4.4-2 4.4-4.5h-2.2l3.6-4.2 3.6 4.2Z', fill: G }),
    el('path', { d: 'M4.6 12c0-4.1 3.3-7.4 7.4-7.4 2.5 0 4.7 1.2 6 3.1l-2.4 1.6c-.8-1.1-2.1-1.8-3.6-1.8-2.4 0-4.4 2-4.4 4.5h2.2l-3.6 4.2L2.6 12Z', fill: B })
  ],
  // GitHub：章鱼猫剪影（多彩化处理为墨绿圆牌）
  "github": [
    el('circle', { cx: 12, cy: 12, r: 8.8, fill: G }),
    el('path', { d: 'M9.2 19c.4-.1.6-.4.6-.7v-1.5c-2.3.5-2.9-1-2.9-1-.4-1-.9-1.3-.9-1.3-.8-.5.1-.5.1-.5.8.1 1.3.9 1.3.9.8 1.3 2 .9 2.5.7.1-.6.3-.9.5-1.2-1.9-.2-3.8-.9-3.8-4.1 0-.9.3-1.7.9-2.3-.1-.2-.4-1.1.1-2.2 0 0 .7-.2 2.3.9a7.8 7.8 0 0 1 4.2 0c1.6-1.1 2.3-.9 2.3-.9.5 1.1.2 2 .1 2.2.6.6.9 1.4.9 2.3 0 3.2-1.9 3.9-3.8 4.1.3.3.6.8.6 1.6v2.3c0 .3.2.6.6.7', fill: W, 'stroke-width': 1 })
  ],
  // 下载
  "download": [
    el('path', { d: 'M10.4 3.6h3.2v7h3l-4.6 5-4.6-5h3Z', fill: B }),
    line('M4.4 18.6c5 .5 10.2.5 15.2 0', { 'stroke-width': 1.8 })
  ],
  // 上传
  "upload": [
    el('path', { d: 'M10.4 15.6h3.2v-7h3l-4.6-5-4.6 5h3Z', fill: G }),
    line('M4.4 18.6c5 .5 10.2.5 15.2 0', { 'stroke-width': 1.8 })
  ],
  // 清空：垃圾桶
  "trash": [
    el('path', { d: 'M5.6 7.4h12.8l-.9 12c-.1 1-1 1.8-2 1.8H8.5c-1 0-1.9-.8-2-1.8Z', fill: R }),
    el('rect', { x: 4, y: 4.6, width: 16, height: 2.8, rx: 1.2, fill: O }),
    line('M9.4 4.4V3.6c0-.7.6-1.2 1.2-1.2h2.8c.7 0 1.2.5 1.2 1.2v.8', { 'stroke-width': 1.4 }),
    line('M9.4 10.6v6.4M12 10.6v6.4M14.6 10.6v6.4', { stroke: W, 'stroke-width': 1.3 })
  ],
  // 加号
  "plus": [
    el('circle', { cx: 12, cy: 12, r: 8.8, fill: O }),
    line('M12 7.8v8.4M7.8 12h8.4', { stroke: W, 'stroke-width': 2.2 })
  ],
  // 关闭
  "close": [
    el('circle', { cx: 12, cy: 12, r: 8.8, fill: W }),
    line('m8.8 8.8 6.4 6.4m0-6.4-6.4 6.4', { stroke: R, 'stroke-width': 2 })
  ],
  // 勾选
  "check": [
    el('circle', { cx: 12, cy: 12, r: 8.8, fill: G }),
    line('m7.6 12.4 3 3 5.8-6.4', { stroke: W, 'stroke-width': 2.2 })
  ],
  // 打印
  "print": [
    el('rect', { x: 6.4, y: 3.4, width: 11.2, height: 5, fill: W }),
    el('path', { d: 'M4.4 8.4h15.2c1 0 1.8.8 1.8 1.8v5c0 1-.8 1.8-1.8 1.8h-2.2v-3H6.6v3H4.4c-1 0-1.8-.8-1.8-1.8v-5c0-1 .8-1.8 1.8-1.8Z', fill: B }),
    el('rect', { x: 6.6, y: 13.4, width: 10.8, height: 7.2, fill: W }),
    line('M9 16.4h6M9 18.4h4.4', { stroke: T, 'stroke-width': 1.2 }),
    el('circle', { cx: 18, cy: 11, r: .9, fill: Y, 'stroke-width': 1 })
  ],
  // 标签页
  "tag": [
    el('path', { d: 'M11.8 3.2H5.4c-1.2 0-2.2 1-2.2 2.2v6.4c0 .6.2 1.1.6 1.5l8 8c.9.9 2.3.9 3.1 0l6.3-6.3c.9-.9.9-2.3 0-3.1l-8-8c-.4-.4-.9-.7-1.4-.7Z', fill: GL }),
    el('circle', { cx: 7.6, cy: 7.6, r: 1.5, fill: W, 'stroke-width': 1.3 })
  ],
  // 钱包
  "wallet": [
    el('path', { d: 'M3.6 7.2c0-1.2 1-2.2 2.2-2.2h11.6c1 0 1.8.8 1.8 1.8v1.4H5.8c-1.2 0-2.2-.4-2.2-1Z', fill: T }),
    el('rect', { x: 3.6, y: 7.6, width: 16.8, height: 11.8, rx: 2, fill: O }),
    el('path', { d: 'M15.4 11.6h5v4h-5c-1.1 0-2-.9-2-2s.9-2 2-2Z', fill: Y }),
    el('circle', { cx: 15.6, cy: 13.6, r: .9, fill: S, stroke: 'none' })
  ],
  // 小鱼干
  "fish": [
    el('path', { d: 'M4.4 12c2.2-3.2 5.4-4.8 8.8-4.8 2.8 0 5.2 1.6 6.4 4.8-1.2 3.2-3.6 4.8-6.4 4.8-3.4 0-6.6-1.6-8.8-4.8Z', fill: B }),
    el('path', { d: 'm19.6 12 2.8-3v6Z', fill: B }),
    el('circle', { cx: 8.2, cy: 11.2, r: .9, fill: S, stroke: 'none' }),
    line('M12.4 8.6c1 2.2 1 4.6 0 6.8', { stroke: W, 'stroke-width': 1.3 })
  ],
  // 毛线球
  "yarn": [
    el('circle', { cx: 11, cy: 12, r: 7.6, fill: PK }),
    line('M4.6 9.4c4-1.6 8.4-1.4 12 .8M4.4 13.6c3.6-2.4 8-2.8 12-1M7 18.4c1.6-3.8 4.8-6.6 8.8-7.6', { stroke: S, 'stroke-width': 1.1 }),
    line('M17.8 15.8c1.6 1 2.8 2.6 3.4 4.6', { stroke: R, 'stroke-width': 1.5 })
  ],
  // 信封
  "mail": [
    el('rect', { x: 3, y: 5.4, width: 18, height: 13.2, rx: 2, fill: W }),
    el('path', { d: 'm3.6 6.4 8.4 6.6 8.4-6.6', fill: 'none', 'stroke-width': 1.5 }),
    el('circle', { cx: 12, cy: 12.6, r: 2, fill: R, 'stroke-width': 1.2 })
  ],
  // 邮票
  "stamp": [
    el('path', { d: 'M4 4h16v16H4Z', fill: W, 'stroke-dasharray': '2.4 1.6' }),
    el('rect', { x: 6.6, y: 6.6, width: 10.8, height: 10.8, fill: GL, 'stroke-width': 1.2 }),
    el('path', { d: 'M9 13.8 8.6 11l2.2 1.3c1-.3 2-.3 3 0L16 11l-.4 2.8c.4.6.6 1.2.6 1.9 0 1.8-1.8 3-4.2 3s-4.2-1.2-4.2-3c0-.7.2-1.3.6-1.9Z', fill: O, 'stroke-width': 1.1, transform: 'translate(0 -2.6)' })
  ],
  // 铃铛静音态无需；编辑（小铅笔）
  "edit": [
    el('path', { d: 'm5 19 .9-3.8L16.3 4.6c.9-.9 2.3-.9 3.1 0 .9.9.9 2.3 0 3.1L9 18.2 5 19Z', fill: B }),
    el('path', { d: 'M5.9 15.2 9 18.2 5 19Z', fill: W })
  ],
  // 眼睛（查看）
  "eye": [
    el('path', { d: 'M2.6 12C5 7.8 8.3 5.7 12 5.7s7 2.1 9.4 6.3c-2.4 4.2-5.7 6.3-9.4 6.3s-7-2.1-9.4-6.3Z', fill: W }),
    el('circle', { cx: 12, cy: 12, r: 3.2, fill: B }),
    el('circle', { cx: 12, cy: 12, r: 1.3, fill: S, stroke: 'none' })
  ],
  // 存钱罐（目标）
  "piggy": [
    el('path', { d: 'M6.4 8.2 5 5.8c1-.4 2.2-.2 3 .5 1.2-.5 2.6-.8 4-.8 4.6 0 8.2 2.9 8.2 6.6 0 1.9-1 3.6-2.6 4.8l-.4 2.5h-2.6l-.4-1.4c-.7.1-1.4.2-2.2.2-.7 0-1.4-.1-2.1-.2l-.4 1.4H6.9l-.4-2.5c-1.6-1.2-2.6-2.9-2.6-4.8 0-1.5.6-2.9 1.7-4Z', fill: PK }),
    el('circle', { cx: 8.6, cy: 11, r: .9, fill: S, stroke: 'none' }),
    line('M10.6 6.9c1.4-.4 2.9-.4 4.4 0', { stroke: S, 'stroke-width': 1.6 }),
    el('path', { d: 'M20.2 10.4c1 .2 1.6 1 1.4 2-.1.7-.7 1.2-1.4 1.3', fill: 'none', 'stroke-width': 1.3 })
  ],
  // 撤销（回转箭头 + 墨绿弧）
  "undo": [
    el('path', { d: 'M8.2 5.4 4.4 9.1l3.8 3.7', fill: 'none', stroke: G, 'stroke-width': 1.8 }),
    el('path', { d: 'M4.8 9.1h9.4a5.6 5.6 0 0 1 0 11.2H8.6', fill: 'none', stroke: G, 'stroke-width': 1.8 }),
    el('circle', { cx: 8.2, cy: 5.4, r: 1.15, fill: O, 'stroke-width': 1.2 })
  ],
  // 排序（三条递减速线 + 下箭头）
  "sort": [
    line('M4 6.4h11', { stroke: B, 'stroke-width': 1.8 }),
    line('M4 11h8', { stroke: G, 'stroke-width': 1.8 }),
    line('M4 15.6h5', { stroke: O, 'stroke-width': 1.8 }),
    el('path', { d: 'M17.4 5.2v13m0 0-2.7-2.8m2.7 2.8 2.7-2.8', fill: 'none', stroke: S, 'stroke-width': 1.7 })
  ],
  // 书签 / 保存视图（缎带书签 + 星点）
  "bookmark": [
    el('path', { d: 'M7 4.2h10c.6 0 1 .4 1 1v14.6l-6-3.6-6 3.6V5.2c0-.6.4-1 1-1Z', fill: Y }),
    el('path', { d: 'M12 7.4l.9 1.9 2 .3-1.5 1.4.4 2-1.8-1-1.8 1 .4-2-1.5-1.4 2-.3Z', fill: OD, 'stroke-width': 1.1 })
  ],
  // 勾选框 / 批量选择（方框 + 对勾）
  "select": [
    el('rect', { x: 4, y: 4, width: 16, height: 16, rx: 4, fill: W }),
    el('path', { d: 'm8 12.2 2.8 2.8L16.4 9', fill: 'none', stroke: G, 'stroke-width': 2 })
  ]
}

/** 数据图标字段是否为注册表键(如 ":food") */
export function parseIconKey(icon) {
  if (typeof icon !== 'string' || !icon.startsWith(':')) return null
  const key = icon.slice(1)
  return key in ICONS ? key : null
}

/** 分类图标可选列表(分类编辑器图标选择器用,顺序即展示顺序) */
export const CATEGORY_ICON_KEYS = [
  'food', 'transport', 'shopping', 'grocery', 'household', 'housing', 'telecom',
  'media', 'digital', 'fashion', 'health', 'education', 'gifting', 'pet', 'travel',
  'salary', 'sidegig', 'invest', 'redpacket', 'refund', 'other'
]