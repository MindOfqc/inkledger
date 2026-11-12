-- 0002 · 用户资料 / 对话室 / 登录日志 / 管理员
-- 说明：Worker 的 ensureSchema 也会在首次请求时幂等执行同等变更（含老库 ALTER 补列），
-- 本文件供显式 `npx wrangler d1 migrations apply meowledger --remote` 使用。

ALTER TABLE ml_users ADD COLUMN avatar TEXT NOT NULL DEFAULT '';
ALTER TABLE ml_users ADD COLUMN bio TEXT NOT NULL DEFAULT '';
ALTER TABLE ml_users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ml_sessions ADD COLUMN location TEXT;

CREATE TABLE IF NOT EXISTS ml_login_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  ip TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ml_login_logs_user ON ml_login_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_ml_login_logs_created ON ml_login_logs (created_at);

CREATE TABLE IF NOT EXISTS ml_chat_messages (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  nickname TEXT NOT NULL,
  avatar TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ml_chat_created ON ml_chat_messages (created_at);
CREATE INDEX IF NOT EXISTS idx_ml_chat_user ON ml_chat_messages (user_id);

-- 管理员邮箱兜底（与 wrangler.toml 的 ADMIN_EMAIL 一致）
UPDATE ml_users SET is_admin = 1 WHERE email = '235173498@qq.com';
