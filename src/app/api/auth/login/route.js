import { createSession, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const attempts = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 8;

export async function POST(request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  const { username, password } = await request.json();
  const key = `${ip}:${String(username || "").toLowerCase()}`;
  if (tooManyAttempts(key)) {
    return Response.json({ error: "登录失败次数过多，请稍后再试" }, { status: 429 });
  }
  const staff = await prisma.staff.findUnique({ where: { username: String(username || "") } });
  if (!staff || !verifyPassword(password || "", staff.passwordHash)) {
    recordFailedAttempt(key);
    return Response.json({ error: "账号或密码不正确" }, { status: 401 });
  }
  attempts.delete(key);
  await createSession(staff.id);
  return Response.json({ user: { id: staff.id, name: staff.name, username: staff.username, email: staff.email, isAdmin: staff.isAdmin, pagePermissions: staff.pagePermissions } });
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
  const item = attempts.get(key);
  if (!item || item.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  item.count += 1;
}
