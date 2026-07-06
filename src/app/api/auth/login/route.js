import { createSession, hashPassword, PAGE_PERMISSION_KEYS, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureDefaultShop, requireActiveShopBySlug, shopSlugFromRequest } from "@/lib/shop";

const attempts = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 8;

export async function POST(request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  const { username, password } = await request.json();
  const cleanUsername = String(username || "").trim();
  const cleanPassword = String(password || "");
  await ensureDefaultShop();
  const shop = await requireActiveShopBySlug(shopSlugFromRequest(request));
  const key = `${ip}:${shop.slug}:${cleanUsername.toLowerCase()}`;
  if (tooManyAttempts(key)) {
    return Response.json({ error: "登录失败次数过多，请稍后再试" }, { status: 429 });
  }
  const staff = await prisma.staff.findUnique({ where: { shopId_username: { shopId: shop.id, username: cleanUsername } } });
  if (!staff || !verifyPassword(password || "", staff.passwordHash)) {
    const staffCount = await prisma.staff.count({ where: { shopId: shop.id } });
    if (staffCount === 0) return createFirstAdmin(shop.id, cleanUsername, cleanPassword);
    recordFailedAttempt(key);
    return Response.json({ error: "账号或密码不正确" }, { status: 401 });
  }
  attempts.delete(key);
  await createSession(staff);
  return Response.json({ user: { id: staff.id, shopId: staff.shopId, name: staff.name, username: staff.username, email: staff.email, isAdmin: staff.isAdmin, pagePermissions: staff.pagePermissions } });
}

async function createFirstAdmin(shopId, username, password) {
  if (username.length < 2) return Response.json({ error: "账号至少 2 个字符" }, { status: 400 });
  if (password.length < 8) return Response.json({ error: "密码至少 8 个字符" }, { status: 400 });
  try {
    const staff = await prisma.staff.create({
      data: {
        shopId,
        name: username,
        username,
        email: "",
        passwordHash: hashPassword(password),
        isAdmin: true,
        pagePermissions: PAGE_PERMISSION_KEYS
      }
    });
    await createSession(staff);
    return Response.json({ user: { id: staff.id, shopId: staff.shopId, name: staff.name, username: staff.username, email: staff.email, isAdmin: staff.isAdmin, pagePermissions: staff.pagePermissions } });
  } catch {
    return Response.json({ error: "初始化管理员失败，请刷新后重试" }, { status: 409 });
  }
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
