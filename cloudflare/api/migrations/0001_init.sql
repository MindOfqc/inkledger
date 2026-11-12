-- 喵账本 MeowLedger · 账号 / 会话 / 验证码 / 云端账本数据
-- 表名统一使用 ml_ 前缀，与其他项目的旧表完全独立。
-- Worker 首次请求也会幂等执行同样的 DDL；本文件供 `wrangler d1 migrations` 使用。

CREATE TABLE IF NOT EXISTS ml_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  nickname TEXT NOT NULL,
  salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  iterations INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  last_login_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ml_users_created ON ml_users (created_at);

CREATE TABLE IF NOT EXISTS ml_sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT,
  user_agent TEXT,
  ip TEXT
);

CREATE INDEX IF NOT EXISTS idx_ml_sessions_user ON ml_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_ml_sessions_expires ON ml_sessions (expires_at);

-- 邮箱验证码（注册 / 找回密码共用，只存 SHA-256 摘要）
CREATE TABLE IF NOT EXISTS ml_email_codes (
  email TEXT NOT NULL,
  purpose TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ml_email_codes_email ON ml_email_codes (email, purpose);

-- 云端账本数据：每用户一行，data 为整份账本 JSON，version 用于多端乐观锁
CREATE TABLE IF NOT EXISTS ml_data (
  user_id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);