# 喵账本云端 API 部署指引（Cloudflare Worker + D1）

账号、会话、验证码、每用户云端账本数据都跑在独立 Worker `meowledger-api` 上，数据存放在 D1 数据库 `meowledger`（表名统一 `ml_` 前缀）。前端仍是静态 PWA，通过 CORS 访问本 API。

目录：`cloudflare/api`。以下命令都在该目录下执行，统一使用 `npx wrangler@4`。

## 一、准备

- Node.js 20+（推荐 22）
- 一个 Cloudflare 账号
- 一个已开启 SMTP 服务的 QQ 邮箱，并取得**授权码**（不是 QQ 登录密码）

## 二、登录并创建 D1 数据库

```bash
cd cloudflare/api
npx wrangler@4 login
npx wrangler@4 d1 create meowledger
```

命令会输出 `database_id`。打开 [wrangler.toml](./wrangler.toml)，把 `database_id` 一行的 `REPLACE_WITH_D1_ID` 替换成真实值：

```toml
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

> 本地 `wrangler dev` 可以先用占位值；**远程 deploy 前必须替换**。

应用迁移（远程建表）：

```bash
npx wrangler@4 d1 migrations apply meowledger --remote
```

表结构也会在 Worker 首次请求时幂等自动创建（`CREATE TABLE IF NOT EXISTS`），迁移与自检二选一即可，重复执行无副作用。

## 三、配置邮件机密

```bash
npx wrangler@4 secret put MAIL_USER   # QQ 邮箱地址，如 235173498@qq.com
npx wrangler@4 secret put MAIL_PASS   # QQ 邮箱 SMTP 授权码（不是 QQ 密码）
```

可选检查：

```bash
npx wrangler@4 secret list
```

密钥只保存在 Cloudflare，不写入仓库。请勿把授权码写进 `wrangler.toml`、`.dev.vars.example` 或任何源码；本地真实发信用的 `.dev.vars` 已被 `.gitignore` 忽略。

## 四、部署

```bash
npx wrangler@4 deploy
```

线上主线路是自定义域，`workers.dev` 地址作为备用线路（设置页「API 线路」可切换）：

```
https://meowledger-api.mindofqc.dpdns.org          # 默认线路
https://meowledger-api.qixin-study.workers.dev     # 备用线路（账号子域 qixin-study）
```

验证健康检查：

```bash
curl https://meowledger-api.mindofqc.dpdns.org/api/health
# {"ok":true,"service":"meowledger-api"}
```

## 五、前端 API base

前端只需要 Worker **根地址**（不带末尾 `/`、不带 `/api`）：

```ts
"https://meowledger-api.qixin-study.workers.dev"
```

前端请求路径为 `${apiBase}/api/auth/login`、`${apiBase}/api/data` 等。

CORS 白名单（不使用 cookie，登录态只走 `Authorization: Bearer`）：

- `https://mindofqc.github.io`（GitHub Pages 公开体验站，只放行这一个账号名，不用通配 `*.github.io`）
- `https://qoder.website`、`https://*.qoder.website`
- `http://localhost:*`、`http://127.0.0.1:*`（任意端口）

其他来源不会收到 `Access-Control-Allow-Origin`（预检仍返回 204，但浏览器会拦下真实请求）。换前端域名部署时，改 `worker.js` 的 `isAllowedOrigin()` 后重新 `deploy`。

## 六、接口一览

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查 |
| POST | `/api/auth/code` | 发送验证码 `{email, purpose:"register"\|"reset"}` |
| POST | `/api/auth/register` | 注册 `{email, code, password, nickname?}` → `{token, user}` |
| POST | `/api/auth/login` | 登录 `{email, password}` → `{token, user}` |
| POST | `/api/auth/password` | 重置密码 `{email, code, password}`，旧会话全部失效 |
| GET | `/api/auth/me` | 当前用户（Bearer） |
| POST | `/api/auth/logout` | 退出登录（Bearer），删除会话 |
| GET | `/api/data` | 拉取账本（Bearer）→ `{data, version, updatedAt}` |
| PUT | `/api/data` | 上传账本（Bearer）`{data, baseVersion}` → `{version, updatedAt}` |
| GET | `/api/user/profile` | 当前读者资料（Bearer）→ `{user}` |
| PUT | `/api/user/profile` | 改资料（Bearer）`{nickname?, avatar?, bio?}` → `{user}` |
| POST | `/api/presence` | 在线心跳（Bearer），前端每 60 秒一次，用于看板「当前在线」 |
| GET | `/api/chat` | 对话室消息（Bearer）`?limit=100` → `{messages}`，旧→新 |
| POST | `/api/chat` | 发言（Bearer）`{content}` → `{message}` |
| GET | `/api/admin/stats` | 平台看板（Bearer + 管理员）→ `{totals, trend, locations, recentUsers}` |

`PUT /api/data` 使用乐观锁：云端当前版本（无数据时为 0）必须等于 `baseVersion`，否则返回 `409 version_conflict` 并附带云端 `version`，前端应先拉取合并再重试。`data` 必须是 JSON 对象，序列化后超过 1,000,000 字符返回 `413 payload_too_large`。

所有错误统一为 `{error:"<snake_code>", message:"<简短中文>"}`。

### 资料 / 对话室 / 管理员

- **资料**：`nickname` ≤ 24 字节，`bio` ≤ 200 字节（按 UTF-8 字节裁剪、去控制字符）；`avatar` 只接受 `data:image/...` 内联图且 ≤ 64 KB，超限返回 `avatar_too_large`，昵称清洗后为空返回 `invalid_nickname`。头像与签名直接存 `ml_users.avatar` / `ml_users.bio`，不占用对象存储。
- **对话室**：`content` ≤ 500 字符且 ≤ 4000 UTF-8 字节（超出返回 `invalid_input`），空消息返回 `chat_empty`；同一条会话上一条发言不足 2 秒返回 `chat_too_fast`（429）。消息落 `ml_chat_messages`，读取时按当前 `ml_users` 的昵称 / 头像 / 管理员标记回填，改名换头像后历史消息同步更新。
- **管理员**：`wrangler.toml` 的 `[vars] ADMIN_EMAIL` 支持逗号分隔多个邮箱，命中的账号在注册 / 登录时自动 `is_admin=1`，也可直接改库：

  ```bash
  npx wrangler@4 d1 execute meowledger --remote --command "UPDATE ml_users SET is_admin=1 WHERE email='someone@example.com'"
  ```

  非管理员访问 `/api/admin/stats` 返回 `403 forbidden`；前端同时隐藏入口。看板只回聚合数据与脱敏邮箱（前 2 位 + `***`），不返回密码哈希、会话 token 与任何账本内容。
- **在线与地区**：登录 / 心跳把 Cloudflare 边缘的 `cf.city / cf.region / cf.country` 与 `cf-connecting-ip` 写入 `ml_sessions.location`，登录另记 `ml_login_logs`；「当前在线」按最近 5 分钟有心跳的会话去重计数。

## 七、本地开发

```bash
cd cloudflare/api
cp .dev.vars.example .dev.vars   # Windows 可手动复制
npx wrangler@4 dev               # 默认 http://127.0.0.1:8787
```

开发模式规则：仅当 `ENVIRONMENT=development` 且 `DEV_RETURN_CODE=1`（`.dev.vars.example` 默认如此）时，`POST /api/auth/code` 不发送邮件，响应额外返回 `{"ok":true,"devCode":"123456"}` 并打印到终端。生产环境（`ENVIRONMENT=production`）绝不会返回 `devCode`；部署时不要把 `DEV_RETURN_CODE` 写进 `[vars]`。

本地 D1 由 wrangler 自动创建并持久化在 `.wrangler/` 下，首次请求会自动建表。需要清空本地库时可删除 `.wrangler/` 后重启。

## 八、常用排查

```bash
npx wrangler@4 tail                                        # 实时日志
npx wrangler@4 d1 execute meowledger --remote --command "SELECT COUNT(*) FROM ml_users"
npx wrangler@4 d1 execute meowledger --local  --command "SELECT COUNT(*) FROM ml_users"
```

- `mail_not_configured`：未配置 `MAIL_USER` / `MAIL_PASS`。
- `mail_failed`：SMTP 连接、认证或收件人校验失败，检查 QQ 邮箱授权码与发信频率。
- `code_rate_limited`：同一邮箱 60 秒内重复获取验证码。
- `code_expired`：验证码超过 10 分钟有效期，重新获取。
- `version_conflict`：账本已在其他设备更新，先 `GET /api/data` 合并后再上传。
- `avatar_too_large`：头像不是内联 `data:image/` 或超过 64 KB，前端已自动压到 96×96（WebP，不支持时退回 PNG）。
- `chat_too_fast`：两条发言间隔不足 2 秒。
- `forbidden`：账号不是管理员，却请求了 `/api/admin/stats`。