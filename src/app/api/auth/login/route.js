import { createSession, IDENTITY_SELECT, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { badRequest, errorResponse, jsonResponse, readJsonBody, requestIdOf } from "@/lib/api-errors";

// 进程内登录限流：按 IP + 用户名 记录 10 分钟内失败次数，容量有上限并淘汰过期项。
// 多进程 / 多实例部署不共享这张表：部署入口（反向代理）需要另行提供跨进程限流，见 docs/多门户升级与运维说明.md。
const attempts = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 8;
const MAX_TRACKED_KEYS = 5000;
const MAX_USERNAME_LENGTH = 64;
const MAX_PASSWORD_LENGTH = 128;

export async function POST(request) {
  const requestId = requestIdOf(request);
  try {
    const ip = clientIp(request);
    const body = await readJsonBody(request);
    if (typeof body.username !== "string" || typeof body.password !== "string") throw badRequest("账号和密码必须是文本", "INVALID_INPUT");
    const username = body.username.trim();
    const password = body.password;
    if (!username || !password) throw badRequest("请输入账号和密码", "INVALID_INPUT");
    if (username.length > MAX_USERNAME_LENGTH || password.length > MAX_PASSWORD_LENGTH) throw badRequest("账号或密码过长", "INVALID_INPUT");
    const key = `${ip}:${username.toLowerCase()}`;
    if (tooManyAttempts(key)) {
      return jsonResponse({ error: "登录失败次数过多，请稍后再试", code: "TOO_MANY_ATTEMPTS", requestId }, { status: 429 });
    }
    const staff = await prisma.staff.findUnique({ where: { username }, select: { ...IDENTITY_SELECT, passwordHash: true } });
    if (!staff || !verifyPassword(password, staff.passwordHash)) {
      recordFailedAttempt(key);
      return jsonResponse({ error: "账号或密码不正确", code: "INVALID_CREDENTIALS", requestId }, { status: 401 });
    }
    attempts.delete(key);
    await createSession(staff.id);
    const { passwordHash, ...identity } = staff;
    return jsonResponse({ user: identity });
  } catch (error) {
    return errorResponse(error, { requestId });
  }
}

function clientIp(request) {
  // 只有部署在可信反向代理后、且代理覆盖客户端头时，这个值才可信；部署核查见运维说明 R04。
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

function pruneExpired(now) {
  for (const [key, item] of attempts) {
    if (item.resetAt <= now) attempts.delete(key);
  }
  if (attempts.size <= MAX_TRACKED_KEYS) return;
  // 仍超容量：淘汰最早到期的一批，避免不同用户名无限新增
  const sorted = [...attempts.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt);
  for (const [key] of sorted.slice(0, attempts.size - MAX_TRACKED_KEYS)) attempts.delete(key);
}

function tooManyAttempts(key) {
  const item = attempts.get(key);
  if (!item) return false;
  if (item.resetAt <= Date.now()) {
    attempts.delete(key);
    return false;
  }
  return item.count >= MAX_ATTEMPTS;
}

function recordFailedAttempt(key) {
  const now = Date.now();
  if (attempts.size >= MAX_TRACKED_KEYS) pruneExpired(now);
  const item = attempts.get(key);
  if (!item || item.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  item.count += 1;
}
