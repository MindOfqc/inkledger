// 喵账本 MeowLedger · 云端 API（Cloudflare Worker + D1）
// 能力：QQ 邮箱验证码注册 / 密码登录 / 找回密码 / 每用户云端账本数据（乐观锁）。
// 本 Worker 独立部署，所有表统一使用 ml_ 前缀，不复用任何其他项目的旧表。
// 鉴权机制与热点雷达一致：PBKDF2-SHA256 10 万次迭代 + 16 字节盐 + 常数时间比较；
// 验证码只存 SHA-256 摘要（60 秒重发间隔、10 分钟有效）；
// 会话为 32 字节随机 base64url 不透明令牌，90 天有效，仅走 Authorization: Bearer。
import { sendVerificationEmail } from "./smtp.js";

const SERVICE_NAME = "meowledger-api";

const PBKDF2_ITERATIONS = 100_000;
const SESSION_DAYS = 90;
const SESSION_TTL_MS = SESSION_DAYS * 86_400_000;
const CODE_TTL_MS = 10 * 60_000;        // 验证码 10 分钟有效
const CODE_SEND_GAP_MS = 60_000;        // 同一邮箱 60 秒内只能发一次

const MAX_BODY_BYTES = 2 * 1024 * 1024; // 请求体上限（账本数据 + 少量信封开销）
const MAX_DATA_CHARS = 1_000_000;       // JSON.stringify(data) 字符上限
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;
const NICKNAME_MAX = 24;
const BIO_MAX_BYTES = 200;             // 个性签名 UTF-8 字节上限
const MAX_AVATAR_BYTES = 64 * 1024;    // 头像 base64 上限（前端压到 96px）
const MAX_CONTENT_CHARS = 500;         // 对话室单条消息字符上限
const CHAT_GAP_MS = 2000;              // 对话室同一用户最小发言间隔
const ONLINE_WINDOW_MS = 5 * 60_000;   // 「在线」判定窗口：最近 5 分钟有心跳
const ADMIN_EMAIL_DEFAULT = "235173498@qq.com";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const JSON_HEADERS = {
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
};

const encoder = new TextEncoder();

const json = (value, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: JSON_HEADERS });

/* ---------------- 统一错误响应：{error, message} + 合适的 HTTP 状态 ---------------- */
const ERRORS = {
  invalid_email: [400, "邮箱格式不正确"],
  invalid_password: [400, "密码至少 8 位"],
  email_taken: [409, "该邮箱已注册"],
  user_not_found: [404, "账号不存在"],
  wrong_password: [401, "密码错误"],
  code_invalid: [400, "验证码不正确"],
  code_expired: [400, "验证码已过期，请重新获取"],
  code_rate_limited: [429, "发送过于频繁，请 60 秒后再试"],
  mail_not_configured: [503, "邮件服务未配置"],
  mail_failed: [502, "验证码邮件发送失败，请稍后再试"],
  unauthorized: [401, "请先登录"],
  forbidden: [403, "没有权限访问"],
  chat_slow_down: [429, "发言太快啦，歇两秒再说"],
  chat_empty: [400, "说点什么吧"],
  invalid_nickname: [400, "昵称不能为空且不超过 24 字"],
  avatar_too_large: [413, "头像过大，请换一张小图"],
  invalid_input: [400, "请求参数不正确"],
  version_conflict: [409, "数据已在其他设备更新"],
  payload_too_large: [413, "数据过大，超出云端存储上限"],
  bad_request: [400, "请求参数不正确"],
  not_found: [404, "接口不存在"],
  server_error: [500, "服务器开小差了，请稍后再试"],
};

function fail(code, extra) {
  const [status, message] = ERRORS[code] || ERRORS.server_error;
  return json({ error: code, message, ...(extra || {}) }, status);
}

/* ---------------- CORS：仅回显受信任来源，不使用 cookie ---------------- */
function isAllowedOrigin(origin) {
  if (!origin) return false;
  let url;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase();

  // 生产前端：https://qoder.website 与 https://*.qoder.website
  if (host === "qoder.website" || host.endsWith(".qoder.website")) {
    return url.protocol === "https:";
  }
  // 公开在线体验：https://mindofqc.github.io（GitHub Pages，见 .github/workflows/deploy-pages.yml）
  // 只放行这一个账号名，避免任意 *.github.io 站点都能带着用户 token 调本 API
  if (host === "mindofqc.github.io") {
    return url.protocol === "https:";
  }
  // 本地开发：http://localhost:* 与 http://127.0.0.1:*
  if (host === "localhost" || host === "127.0.0.1") {
    return url.protocol === "http:";
  }
  return false;
}

function corsHeaders(request) {
  const origin = request.headers.get("origin") || "";
  const headers = {
    "access-control-allow-methods": "GET, POST, PUT, OPTIONS",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
  if (isAllowedOrigin(origin)) headers["access-control-allow-origin"] = origin;
  return headers;
}

function withCors(response, cors) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(cors)) headers.set(key, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/* ---------------- 基础工具 ---------------- */
function toBase64(bytes) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}
function fromBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
function toBase64Url(bytes) {
  return toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function randomBytes(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}
function randomCode() {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return String(n).padStart(6, "0");
}

async function deriveHash(password, salt) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: fromBase64(salt), iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    key,
    256,
  );
  return toBase64(new Uint8Array(bits));
}

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sha256Hex(text) {
  const bits = await crypto.subtle.digest("SHA-256", encoder.encode(text));
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const charLength = (value) => Array.from(value).length;

function validEmail(email) {
  return typeof email === "string" && email.length <= 64 && EMAIL_RE.test(email);
}
function validPassword(password) {
  return (
    typeof password === "string" &&
    password.length >= PASSWORD_MIN &&
    password.length <= PASSWORD_MAX
  );
}
function validCode(code) {
  return typeof code === "string" && /^\d{6}$/.test(code);
}
function cleanNickname(value) {
  if (typeof value !== "string") return "";
  const text = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  if (!text || charLength(text) > NICKNAME_MAX) return "";
  return text;
}
function cleanText(value, maxBytes) {
  const s = (typeof value === "string" ? value : "").replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return encoder.encode(s).length <= maxBytes ? s : "";
}
function cleanAvatar(value) {
  const s = typeof value === "string" ? value.trim() : "";
  if (!s) return "";
  if (s.startsWith("data:image/") && s.length <= MAX_AVATAR_BYTES) return s;
  return cleanText(s, 32); // emoji 或短字符
}

/* 登录地点：优先 Cloudflare 边缘自带的地理信息 */
function locate(request) {
  const cf = request.cf || {};
  const parts = [cf.city, cf.region, cf.country].filter((x) => typeof x === "string" && x);
  const location = parts.length ? parts.join(" · ") : "未知";
  const ip = request.headers.get("cf-connecting-ip") || "";
  return { ip, location };
}

function adminEmails(env) {
  const raw = String(env.ADMIN_EMAIL || ADMIN_EMAIL_DEFAULT);
  return new Set(raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
}
function isAdminRow(env, row) {
  return Number(row.is_admin) === 1 || adminEmails(env).has(String(row.email || "").toLowerCase());
}
function publicUser(env, row) {
  return {
    id: row.id,
    email: row.email,
    nickname: row.nickname,
    avatar: row.avatar || "",
    bio: row.bio || "",
    isAdmin: isAdminRow(env, row),
  };
}

/* 登录日志：失败不阻断登录 */
async function logLogin(env, userId, request) {
  const { ip, location } = locate(request);
  const ua = (request.headers.get("user-agent") || "").slice(0, 200);
  try {
    await env.DB.prepare(
      "INSERT INTO ml_login_logs (id, user_id, ip, location, user_agent, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
      .bind(crypto.randomUUID(), userId, ip, location, ua, new Date().toISOString())
      .run();
  } catch { /* ignore */ }
  return { ip, location };
}

/**
 * 读取并校验 JSON 请求体：content-type、体积、对象形态。
 * 失败时返回 { ok:false, status }，由调用方统一映射为 bad_request / payload_too_large。
 */
async function readBody(request) {
  const type = (request.headers.get("content-type") || "").toLowerCase();
  if (!type.includes("application/json")) return { ok: false, status: 400 };

  const declared = request.headers.get("content-length");
  if (declared !== null && Number(declared) > MAX_BODY_BYTES) {
    return { ok: false, status: 413 };
  }

  let text;
  try {
    text = await request.text();
  } catch {
    return { ok: false, status: 400 };
  }
  if (encoder.encode(text).length > MAX_BODY_BYTES) return { ok: false, status: 413 };

  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { ok: false, status: 400 };
    }
    return { ok: true, body: value };
  } catch {
    return { ok: false, status: 400 };
  }
}

function bodyError(parsed) {
  return parsed.status === 413 ? fail("payload_too_large") : fail("bad_request");
}

function clientIp(request) {
  return request.headers.get("cf-connecting-ip") || "";
}

/* ---------------- 会话 ---------------- */
async function createSession(env, userId, request) {
  const token = toBase64Url(randomBytes(32));
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString();
  const { ip, location } = locate(request);
  const ua = (request.headers.get("user-agent") || "").slice(0, 200);
  await env.DB.prepare(
    "INSERT INTO ml_sessions (token, user_id, created_at, expires_at, last_seen_at, user_agent, ip, location) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(token, userId, now.toISOString(), expiresAt, now.toISOString(), ua, ip, location)
    .run();
  return { token, expiresAt };
}

async function authenticate(env, request) {
  const header = request.headers.get("authorization") || "";
  if (!header.toLowerCase().startsWith("bearer ")) return null;
  const token = header.slice(7).trim();
  if (!token) return null;

  const row = await env.DB.prepare(
    "SELECT s.user_id, s.token, s.expires_at, u.email, u.nickname, u.avatar, u.bio, u.is_admin FROM ml_sessions s JOIN ml_users u ON u.id = s.user_id WHERE s.token = ?",
  )
    .bind(token)
    .first();
  if (!row || Date.parse(row.expires_at) < Date.now()) return null;

  const isAdmin = isAdminRow(env, row);
  return {
    userId: row.user_id,
    token: row.token,
    isAdmin,
    user: { id: row.user_id, email: row.email, nickname: row.nickname, avatar: row.avatar || "", bio: row.bio || "", isAdmin },
  };
}

/* ---------------- 验证码 ---------------- */
async function handleSendCode(request, env) {
  const parsed = await readBody(request);
  if (!parsed.ok) return bodyError(parsed);

  const body = parsed.body;
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!validEmail(email)) return fail("invalid_email");

  const purpose = body.purpose;
  if (purpose !== "register" && purpose !== "reset") return fail("bad_request");

  const exists = await env.DB.prepare("SELECT id FROM ml_users WHERE email = ?")
    .bind(email)
    .first();
  if (purpose === "register" && exists) return fail("email_taken");
  if (purpose === "reset" && !exists) return fail("user_not_found");

  // 同一邮箱 60 秒内只能发一次（注册 / 找回密码共用限制）
  const recent = await env.DB.prepare(
    "SELECT created_at FROM ml_email_codes WHERE email = ? AND created_at >= ?",
  )
    .bind(email, new Date(Date.now() - CODE_SEND_GAP_MS).toISOString())
    .first();
  if (recent) return fail("code_rate_limited");

  const code = randomCode();
  const createdAt = new Date().toISOString();
  const codeHash = await sha256Hex(code);
  await env.DB.prepare(
    "INSERT INTO ml_email_codes (email, purpose, code_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(email, purpose, codeHash, new Date(Date.now() + CODE_TTL_MS).toISOString(), createdAt)
    .run();

  // 开发模式：仅在 ENVIRONMENT=development 且 DEV_RETURN_CODE=1 时直接返回验证码。
  if (env.ENVIRONMENT === "development" && env.DEV_RETURN_CODE === "1") {
    console.log(`[meowledger] dev verification code for ${email} (${purpose}): ${code}`);
    return json({ ok: true, devCode: code });
  }

  try {
    await sendVerificationEmail(env, email, code, purpose);
  } catch (err) {
    // 发送失败时撤销刚写入的验证码，避免用户被 60 秒冷却卡住又收不到邮件。
    try {
      await env.DB.prepare(
        "DELETE FROM ml_email_codes WHERE email = ? AND purpose = ? AND code_hash = ? AND created_at = ?",
      )
        .bind(email, purpose, codeHash, createdAt)
        .run();
    } catch {
      // 清理失败不影响错误响应
    }
    const message = String(err?.message || err);
    if (message.includes("mail_not_configured")) return fail("mail_not_configured");
    console.error("[meowledger] verification mail failed:", message.slice(0, 120));
    return fail("mail_failed");
  }
  return json({ ok: true });
}

/**
 * 校验验证码；consume=true 时标记已用。
 * 返回 { ok:true } 或 { ok:false, error:"code_invalid"|"code_expired" }。
 */
async function verifyCode(env, email, purpose, code, consume) {
  const rows = await env.DB.prepare(
    "SELECT rowid, code_hash, expires_at FROM ml_email_codes WHERE email = ? AND purpose = ? AND used_at IS NULL ORDER BY created_at DESC, rowid DESC LIMIT 5",
  )
    .bind(email, purpose)
    .all();
  const hash = await sha256Hex(String(code));
  const hit = (rows.results || []).find((row) => safeEqual(hash, row.code_hash));
  if (!hit) return { ok: false, error: "code_invalid" };
  if (Date.parse(hit.expires_at) < Date.now()) return { ok: false, error: "code_expired" };
  if (consume) {
    await env.DB.prepare("UPDATE ml_email_codes SET used_at = ? WHERE rowid = ?")
      .bind(new Date().toISOString(), hit.rowid)
      .run();
  }
  return { ok: true };
}

/* ---------------- 注册 / 登录 / 找回密码 ---------------- */
async function handleRegister(request, env) {
  const parsed = await readBody(request);
  if (!parsed.ok) return bodyError(parsed);

  const body = parsed.body;
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!validEmail(email)) return fail("invalid_email");
  if (!validPassword(body.password)) return fail("invalid_password");
  if (!validCode(body.code)) return fail("code_invalid");

  let nickname;
  if (body.nickname !== undefined && typeof body.nickname !== "string") {
    return fail("bad_request");
  }
  if (typeof body.nickname === "string" && body.nickname.trim()) {
    nickname = cleanNickname(body.nickname);
    if (!nickname) return fail("bad_request");
  } else {
    nickname = email.split("@")[0].slice(0, NICKNAME_MAX) || "喵账本用户";
  }

  const exists = await env.DB.prepare("SELECT id FROM ml_users WHERE email = ?")
    .bind(email)
    .first();
  if (exists) return fail("email_taken");
  const checked = await verifyCode(env, email, "register", body.code, false);
  if (!checked.ok) return fail(checked.error);

  const salt = toBase64(randomBytes(16));
  const hash = await deriveHash(body.password, salt);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  const isAdmin = adminEmails(env).has(email) ? 1 : 0;
  try {
    await env.DB.prepare(
      "INSERT INTO ml_users (id, email, nickname, avatar, bio, salt, password_hash, iterations, is_admin, created_at, last_login_at) VALUES (?, ?, ?, '', '', ?, ?, ?, ?, ?, ?)",
    )
      .bind(id, email, nickname, salt, hash, PBKDF2_ITERATIONS, isAdmin, now, now)
      .run();
  } catch {
    return fail("email_taken");
  }

  await verifyCode(env, email, "register", body.code, true);
  const session = await createSession(env, id, request);
  await logLogin(env, id, request);
  return json({ ...session, user: { id, email, nickname, avatar: "", bio: "", isAdmin: !!isAdmin } }, 201);
}

async function handleLogin(request, env) {
  const parsed = await readBody(request);
  if (!parsed.ok) return bodyError(parsed);

  const body = parsed.body;
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!validEmail(email)) return fail("invalid_email");
  if (typeof body.password !== "string" || !body.password) return fail("bad_request");

  const row = await env.DB.prepare(
    "SELECT id, email, nickname, avatar, bio, is_admin, salt, password_hash FROM ml_users WHERE email = ?",
  )
    .bind(email)
    .first();

  // 无论账号是否存在都执行一次 PBKDF2，避免通过响应时间枚举邮箱。
  const salt = row?.salt ?? toBase64(randomBytes(16));
  const hash = await deriveHash(body.password, salt);
  if (!row) return fail("user_not_found");
  if (!safeEqual(hash, row.password_hash)) return fail("wrong_password");

  const now = new Date().toISOString();
  await env.DB.prepare("UPDATE ml_users SET last_login_at = ? WHERE id = ?")
    .bind(now, row.id)
    .run();
  await env.DB.prepare("DELETE FROM ml_sessions WHERE expires_at < ?")
    .bind(new Date(Date.now() - 30 * 86_400_000).toISOString())
    .run();

  const session = await createSession(env, row.id, request);
  await logLogin(env, row.id, request);
  return json({
    ...session,
    user: publicUser(env, row),
  });
}

async function handleResetPassword(request, env) {
  const parsed = await readBody(request);
  if (!parsed.ok) return bodyError(parsed);

  const body = parsed.body;
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!validEmail(email)) return fail("invalid_email");
  if (!validPassword(body.password)) return fail("invalid_password");
  if (!validCode(body.code)) return fail("code_invalid");
  const checked = await verifyCode(env, email, "reset", body.code, false);
  if (!checked.ok) return fail(checked.error);

  const row = await env.DB.prepare("SELECT id FROM ml_users WHERE email = ?")
    .bind(email)
    .first();
  if (!row) return fail("user_not_found");

  const salt = toBase64(randomBytes(16));
  const hash = await deriveHash(body.password, salt);
  await env.DB.prepare(
    "UPDATE ml_users SET salt = ?, password_hash = ?, iterations = ? WHERE id = ?",
  )
    .bind(salt, hash, PBKDF2_ITERATIONS, row.id)
    .run();
  await verifyCode(env, email, "reset", body.code, true);
  // 重置密码后让所有旧会话失效
  await env.DB.prepare("DELETE FROM ml_sessions WHERE user_id = ?").bind(row.id).run();
  return json({ ok: true });
}

async function handleMe(request, env) {
  const auth = await authenticate(env, request);
  if (!auth) return fail("unauthorized");
  const last = await env.DB.prepare(
    "SELECT ip, location, created_at FROM ml_login_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 1",
  )
    .bind(auth.userId)
    .first();
  return json({
    user: {
      ...auth.user,
      lastLogin: last ? { ip: last.ip, location: last.location || "未知", at: last.created_at } : null,
    },
  });
}

async function handleLogout(request, env) {
  const auth = await authenticate(env, request);
  if (auth) {
    await env.DB.prepare("DELETE FROM ml_sessions WHERE token = ?").bind(auth.token).run();
  }
  return new Response(null, { status: 204 });
}

/* ---------------- 云端账本数据（每用户一行，乐观锁） ---------------- */
async function handleGetData(request, env) {
  const auth = await authenticate(env, request);
  if (!auth) return fail("unauthorized");

  const row = await env.DB.prepare(
    "SELECT data, version, updated_at FROM ml_data WHERE user_id = ?",
  )
    .bind(auth.userId)
    .first();
  if (!row) return json({ data: null, version: 0, updatedAt: null });

  let data = null;
  try {
    data = JSON.parse(row.data);
  } catch {
    data = null;
  }
  return json({ data, version: Number(row.version), updatedAt: row.updated_at });
}

async function handlePutData(request, env) {
  const auth = await authenticate(env, request);
  if (!auth) return fail("unauthorized");

  const parsed = await readBody(request);
  if (!parsed.ok) return bodyError(parsed);

  const body = parsed.body;
  const data = body.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return fail("bad_request");
  const baseVersion = body.baseVersion;
  if (!Number.isInteger(baseVersion) || baseVersion < 0) return fail("bad_request");

  let serialized;
  try {
    serialized = JSON.stringify(data);
  } catch {
    return fail("bad_request");
  }
  if (serialized.length > MAX_DATA_CHARS) return fail("payload_too_large");

  const row = await env.DB.prepare("SELECT version FROM ml_data WHERE user_id = ?")
    .bind(auth.userId)
    .first();
  const current = row ? Number(row.version) : 0;
  if (current !== baseVersion) return fail("version_conflict", { version: current });

  const now = new Date().toISOString();
  const nextVersion = baseVersion + 1;
  if (!row) {
    try {
      await env.DB.prepare(
        "INSERT INTO ml_data (user_id, data, version, updated_at) VALUES (?, ?, ?, ?)",
      )
        .bind(auth.userId, serialized, nextVersion, now)
        .run();
    } catch {
      // 并发首写：另一台设备已抢先插入，按版本冲突处理。
      const again = await env.DB.prepare("SELECT version FROM ml_data WHERE user_id = ?")
        .bind(auth.userId)
        .first();
      return fail("version_conflict", { version: again ? Number(again.version) : 1 });
    }
  } else {
    // 条件更新兜底并发写入：只有版本仍等于 baseVersion 时才落库。
    const result = await env.DB.prepare(
      "UPDATE ml_data SET data = ?, version = ?, updated_at = ? WHERE user_id = ? AND version = ?",
    )
      .bind(serialized, nextVersion, now, auth.userId, baseVersion)
      .run();
    if (!result.meta?.changes) {
      const again = await env.DB.prepare("SELECT version FROM ml_data WHERE user_id = ?")
        .bind(auth.userId)
        .first();
      return fail("version_conflict", { version: again ? Number(again.version) : current });
    }
  }
  return json({ version: nextVersion, updatedAt: now });
}

/* ---------------- 用户资料 ---------------- */
async function handleProfile(request, env) {
  const auth = await authenticate(env, request);
  if (!auth) return fail("unauthorized");
  if (request.method === "PUT") {
    const parsed = await readBody(request);
    if (!parsed.ok) return bodyError(parsed);
    const body = parsed.body;
    const nickname = body.nickname !== undefined ? cleanNickname(body.nickname) : auth.user.nickname;
    if (body.nickname !== undefined && !nickname) return fail("invalid_nickname");
    let avatar = auth.user.avatar || "";
    if (body.avatar !== undefined) {
      const cleaned = cleanAvatar(body.avatar);
      if (body.avatar && !cleaned) return fail("avatar_too_large");
      avatar = cleaned;
    }
    const bio = body.bio !== undefined ? cleanText(body.bio, BIO_MAX_BYTES) : (auth.user.bio || "");
    await env.DB.prepare("UPDATE ml_users SET nickname = ?, avatar = ?, bio = ? WHERE id = ?")
      .bind(nickname, avatar, bio, auth.userId)
      .run();
  }
  const row = await env.DB.prepare("SELECT id, email, nickname, avatar, bio, is_admin FROM ml_users WHERE id = ?")
    .bind(auth.userId)
    .first();
  return json({ user: publicUser(env, row) });
}

/* ---------------- 在线心跳 ---------------- */
async function handlePresence(request, env) {
  const auth = await authenticate(env, request);
  if (!auth) return fail("unauthorized");
  const { ip, location } = locate(request);
  await env.DB.prepare("UPDATE ml_sessions SET last_seen_at = ?, ip = ?, location = ? WHERE token = ?")
    .bind(new Date().toISOString(), ip, location, auth.token)
    .run();
  return json({ ok: true });
}

/* ---------------- 对话室 ---------------- */
async function chatList(request, env, url) {
  const auth = await authenticate(env, request);
  if (!auth) return fail("unauthorized");
  const limitRaw = url.searchParams.get("limit");
  let limit = 100;
  if (limitRaw && /^\d+$/.test(limitRaw)) limit = Math.min(200, Math.max(1, Number(limitRaw)));
  const admins = adminEmails(env);
  const result = await env.DB.prepare(
    "SELECT c.id, c.user_id, c.nickname, c.avatar, c.content, c.created_at, u.email, u.is_admin, u.nickname AS live_nickname, u.avatar AS live_avatar FROM ml_chat_messages c LEFT JOIN ml_users u ON u.id = c.user_id ORDER BY c.created_at DESC LIMIT ?",
  )
    .bind(limit)
    .all();
  const messages = (result.results || []).reverse().map((r) => ({
    id: r.id,
    userId: r.user_id,
    // 昵称与头像实时跟随读者档案：改了资料，历史来信里的形象也一起换装
    nickname: r.live_nickname || r.nickname,
    avatar: r.live_avatar || r.avatar || "",
    content: r.content,
    createdAt: r.created_at,
    isAdmin: Number(r.is_admin) === 1 || admins.has(String(r.email || "").toLowerCase()),
  }));
  const now = new Date();
  const onlineRow = await env.DB.prepare(
    "SELECT COUNT(DISTINCT user_id) AS c FROM ml_sessions WHERE expires_at > ? AND COALESCE(last_seen_at, created_at) >= ?",
  )
    .bind(now.toISOString(), new Date(now.getTime() - ONLINE_WINDOW_MS).toISOString())
    .first();
  return json({ messages, online: Number(onlineRow?.c ?? 0), now: now.toISOString() });
}

async function chatCreate(request, env) {
  const auth = await authenticate(env, request);
  if (!auth) return fail("unauthorized");
  const parsed = await readBody(request);
  if (!parsed.ok) return bodyError(parsed);
  const content = typeof parsed.body?.content === "string" ? parsed.body.content.replace(/\r\n?/g, "\n").trim() : "";
  if (!content) return fail("chat_empty");
  if (charLength(content) > MAX_CONTENT_CHARS || encoder.encode(content).length > 4000) return fail("invalid_input");
  const last = await env.DB.prepare(
    "SELECT created_at FROM ml_chat_messages WHERE user_id = ? ORDER BY created_at DESC LIMIT 1",
  )
    .bind(auth.userId)
    .first();
  if (last && Date.now() - Date.parse(last.created_at) < CHAT_GAP_MS) return fail("chat_slow_down");

  const row = await env.DB.prepare("SELECT nickname, avatar FROM ml_users WHERE id = ?").bind(auth.userId).first();
  const msg = {
    id: crypto.randomUUID(),
    userId: auth.userId,
    nickname: row?.nickname || auth.user.nickname,
    avatar: row?.avatar || "",
    content,
    createdAt: new Date().toISOString(),
    isAdmin: auth.isAdmin,
  };
  await env.DB.prepare(
    "INSERT INTO ml_chat_messages (id, user_id, nickname, avatar, content, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(msg.id, msg.userId, msg.nickname, msg.avatar, msg.content, msg.createdAt)
    .run();
  return json({ message: msg }, 201);
}

/* ---------------- 管理员统计（平台看板） ---------------- */
async function countOf(env, sql, ...binds) {
  const row = await env.DB.prepare(sql).bind(...binds).first();
  return Number(row?.c ?? 0);
}
function maskEmail(email) {
  const [name, domain] = String(email || "").split("@");
  if (!domain) return "***";
  const head = name.slice(0, Math.min(2, name.length));
  return `${head}***@${domain}`;
}
async function handleAdminStats(request, env) {
  const auth = await authenticate(env, request);
  if (!auth) return fail("unauthorized");
  if (!auth.isAdmin) return fail("forbidden");

  const now = new Date();
  const nowIso = now.toISOString();
  const today = nowIso.slice(0, 10);
  const day14 = new Date(now.getTime() - 13 * 86_400_000).toISOString().slice(0, 10);
  const onlineSince = new Date(now.getTime() - ONLINE_WINDOW_MS).toISOString();

  const [usersTotal, usersToday, usersWeek, online, chatsTotal, chatsToday, dataRows, dataBytes, dataToday] = await Promise.all([
    countOf(env, "SELECT COUNT(*) AS c FROM ml_users"),
    countOf(env, "SELECT COUNT(*) AS c FROM ml_users WHERE substr(created_at,1,10) >= ?", today),
    countOf(env, "SELECT COUNT(*) AS c FROM ml_users WHERE created_at >= ?", new Date(now.getTime() - 7 * 86_400_000).toISOString()),
    countOf(env, "SELECT COUNT(DISTINCT user_id) AS c FROM ml_sessions WHERE expires_at > ? AND COALESCE(last_seen_at, created_at) >= ?", nowIso, onlineSince),
    countOf(env, "SELECT COUNT(*) AS c FROM ml_chat_messages"),
    countOf(env, "SELECT COUNT(*) AS c FROM ml_chat_messages WHERE substr(created_at,1,10) >= ?", today),
    countOf(env, "SELECT COUNT(*) AS c FROM ml_data"),
    env.DB.prepare("SELECT COALESCE(SUM(LENGTH(data)),0) AS c FROM ml_data").first(),
    countOf(env, "SELECT COUNT(*) AS c FROM ml_data WHERE substr(updated_at,1,10) >= ?", today),
  ]);

  const days = Array.from({ length: 14 }, (_, i) =>
    new Date(now.getTime() - (13 - i) * 86_400_000).toISOString().slice(0, 10),
  );
  const trendQuery = async (table, col) => {
    const res = await env.DB.prepare(
      `SELECT substr(${col},1,10) AS d, COUNT(*) AS c FROM ${table} WHERE ${col} >= ? GROUP BY d`,
    )
      .bind(`${day14}T00:00:00.000Z`)
      .all();
    const map = {};
    for (const r of res.results || []) map[r.d] = Number(r.c);
    return days.map((d) => ({ day: d, count: map[d] || 0 }));
  };
  const [regTrend, loginTrend, chatTrend] = await Promise.all([
    trendQuery("ml_users", "created_at"),
    trendQuery("ml_login_logs", "created_at"),
    trendQuery("ml_chat_messages", "created_at"),
  ]);

  const locRes = await env.DB.prepare(
    "SELECT COALESCE(NULLIF(location,''),'未知') AS location, COUNT(*) AS c FROM ml_login_logs GROUP BY location ORDER BY c DESC LIMIT 10",
  ).all();
  const recentUsers = await env.DB.prepare(
    "SELECT u.email, u.nickname, u.created_at, u.last_login_at, (SELECT location FROM ml_login_logs l WHERE l.user_id = u.id ORDER BY created_at DESC LIMIT 1) AS location FROM ml_users u ORDER BY u.created_at DESC LIMIT 20",
  ).all();

  return json({
    now: nowIso,
    totals: {
      users: usersTotal, usersToday, usersWeek, online,
      chats: chatsTotal, chatsToday,
      dataRows, dataBytes: Number(dataBytes?.c ?? 0), dataToday,
    },
    trend: { days, register: regTrend, login: loginTrend, chat: chatTrend },
    locations: (locRes.results || []).map((r) => ({ location: r.location, count: Number(r.c) })),
    recentUsers: (recentUsers.results || []).map((r) => ({
      email: maskEmail(r.email),
      nickname: r.nickname,
      createdAt: r.created_at,
      lastLoginAt: r.last_login_at,
      location: r.location || "未知",
    })),
  });
}

/* ---------------- Schema 自检（首次请求幂等建表，免手动迁移） ---------------- */
let schemaReady = false;
async function ensureSchema(env) {
  if (schemaReady) return;
  const statements = [
    "CREATE TABLE IF NOT EXISTS ml_users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, nickname TEXT NOT NULL, avatar TEXT NOT NULL DEFAULT '', bio TEXT NOT NULL DEFAULT '', salt TEXT NOT NULL, password_hash TEXT NOT NULL, iterations INTEGER NOT NULL, is_admin INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, last_login_at TEXT NOT NULL)",
    "CREATE INDEX IF NOT EXISTS idx_ml_users_created ON ml_users (created_at)",
    "CREATE TABLE IF NOT EXISTS ml_sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, last_seen_at TEXT, user_agent TEXT, ip TEXT, location TEXT)",
    "CREATE INDEX IF NOT EXISTS idx_ml_sessions_user ON ml_sessions (user_id)",
    "CREATE INDEX IF NOT EXISTS idx_ml_sessions_expires ON ml_sessions (expires_at)",
    "CREATE TABLE IF NOT EXISTS ml_email_codes (email TEXT NOT NULL, purpose TEXT NOT NULL, code_hash TEXT NOT NULL, expires_at TEXT NOT NULL, used_at TEXT, created_at TEXT NOT NULL)",
    "CREATE INDEX IF NOT EXISTS idx_ml_email_codes_email ON ml_email_codes (email, purpose)",
    "CREATE TABLE IF NOT EXISTS ml_data (user_id TEXT PRIMARY KEY, data TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS ml_login_logs (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, ip TEXT NOT NULL DEFAULT '', location TEXT NOT NULL DEFAULT '', user_agent TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL)",
    "CREATE INDEX IF NOT EXISTS idx_ml_login_logs_user ON ml_login_logs (user_id)",
    "CREATE INDEX IF NOT EXISTS idx_ml_login_logs_created ON ml_login_logs (created_at)",
    "CREATE TABLE IF NOT EXISTS ml_chat_messages (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, nickname TEXT NOT NULL, avatar TEXT NOT NULL DEFAULT '', content TEXT NOT NULL, created_at TEXT NOT NULL)",
    "CREATE INDEX IF NOT EXISTS idx_ml_chat_created ON ml_chat_messages (created_at)",
    "CREATE INDEX IF NOT EXISTS idx_ml_chat_user ON ml_chat_messages (user_id)",
  ];
  for (const sql of statements) await env.DB.prepare(sql).run();
  // 老库补列：CREATE TABLE IF NOT EXISTS 不会给已存在的表加列，逐条 ALTER 并吞掉「列已存在」错误。
  const alters = [
    "ALTER TABLE ml_users ADD COLUMN avatar TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE ml_users ADD COLUMN bio TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE ml_users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE ml_sessions ADD COLUMN location TEXT",
  ];
  for (const sql of alters) { try { await env.DB.prepare(sql).run(); } catch { /* 列已存在 */ } }
  // 管理员邮箱兜底：确保配置的管理员账号拥有 is_admin 标记。
  for (const email of adminEmails(env)) {
    try { await env.DB.prepare("UPDATE ml_users SET is_admin = 1 WHERE email = ?").bind(email).run(); } catch { /* ignore */ }
  }
  schemaReady = true;
}

/* ---------------- 路由 ---------------- */
async function route(request, env) {
  const url = new URL(request.url);
  const p = url.pathname;
  const m = request.method;

  if (p === "/api/health" && m === "GET") {
    return json({ ok: true, service: SERVICE_NAME });
  }

  if (!p.startsWith("/api/")) return fail("not_found");
  if (!env.DB) return json({ error: "server_error", message: "数据库未绑定" }, 503);

  await ensureSchema(env);

  if (p === "/api/auth/code" && m === "POST") return handleSendCode(request, env);
  if (p === "/api/auth/register" && m === "POST") return handleRegister(request, env);
  if (p === "/api/auth/login" && m === "POST") return handleLogin(request, env);
  if (p === "/api/auth/password" && m === "POST") return handleResetPassword(request, env);
  if (p === "/api/auth/me" && m === "GET") return handleMe(request, env);
  if (p === "/api/auth/logout" && m === "POST") return handleLogout(request, env);
  if (p === "/api/data" && m === "GET") return handleGetData(request, env);
  if (p === "/api/data" && m === "PUT") return handlePutData(request, env);
  if (p === "/api/user/profile" && (m === "PUT" || m === "GET")) return handleProfile(request, env);
  if (p === "/api/presence" && m === "POST") return handlePresence(request, env);
  if (p === "/api/chat" && m === "GET") return chatList(request, env, url);
  if (p === "/api/chat" && m === "POST") return chatCreate(request, env);
  if (p === "/api/admin/stats" && m === "GET") return handleAdminStats(request, env);

  return fail("not_found");
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    let response;
    try {
      response = await route(request, env);
    } catch (err) {
      // 仅服务端日志保留细节；响应只返回稳定 code，避免泄露 SQL / 密钥。
      console.error("[meowledger] unhandled error:", String(err?.message || err).slice(0, 200));
      response = fail("server_error");
    }
    return withCors(response, cors);
  },
};