import crypto from "crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

const COOKIE_NAME = "repairnote_session";
const SESSION_DAYS = 7;
export const PAGE_PERMISSION_KEYS = [
  "repairs",
  "clients",
  "categories",
  "modules",
  "services",
  "attributes",
  "technicians",
  "reports",
  "finance",
  "settings",
  "backup"
];


function secureCookieEnabled() {
  if (process.env.REPAIRNOTE_COOKIE_SECURE === "false") return false;
  if (process.env.REPAIRNOTE_COOKIE_SECURE === "true") return true;
  return process.env.NODE_ENV === "production";
}

export function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  if (!stored || !stored.includes(":")) return false;
  const [salt, hash] = stored.split(":");
  const candidate = hashPassword(password, salt).split(":")[1];
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(candidate, "hex"));
}

export function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function createSession(staff) {
  const staffRow = typeof staff === "string" ? await prisma.staff.findUnique({ where: { id: staff } }) : staff;
  if (!staffRow?.shopId) throw new Error("STAFF_SHOP_MISSING");
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const tokenHash = hashToken(token);
  const staffId = staffRow.id;
  const shopId = staffRow.shopId;
  await prisma.$transaction([
    prisma.staffSession.deleteMany({
      where: { staffId, expiresAt: { lte: new Date() } }
    }),
    prisma.staffSession.create({
      data: { staffId, shopId, tokenHash, expiresAt }
    }),
    prisma.staff.update({
      where: { id: staffId },
      data: { sessionTokenHash: tokenHash, sessionExpiresAt: expiresAt }
    })
  ]);
  await setSessionCookie(token, expiresAt);
}

async function setSessionCookie(token, expiresAt) {
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookieEnabled(),
    path: "/",
    expires: expiresAt
  });
}

export async function clearSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (token) {
    await prisma.staffSession.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
  jar.delete(COOKIE_NAME);
}

export async function getCurrentStaff() {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const tokenHash = hashToken(token);
  const session = await prisma.staffSession.findUnique({
    where: { tokenHash },
    include: { staff: { select: { id: true, shopId: true, name: true, username: true, email: true, isAdmin: true, pagePermissions: true } } }
  });
  if (session?.expiresAt > new Date()) return session.staff;

  if (session) {
    await prisma.staffSession.delete({ where: { id: session.id } });
    return null;
  }

  return prisma.staff.findFirst({
    where: { sessionTokenHash: tokenHash, sessionExpiresAt: { gt: new Date() } },
    select: { id: true, shopId: true, name: true, username: true, email: true, isAdmin: true, pagePermissions: true }
  });
}

export async function requireStaff() {
  const staff = await getCurrentStaff();
  if (!staff) {
    const error = new Error("UNAUTHORIZED");
    error.status = 401;
    throw error;
  }
  return staff;
}

export function normalizedPagePermissions(staff) {
  if (staff?.isAdmin) return PAGE_PERMISSION_KEYS;
  const rawPermissions = Array.isArray(staff?.pagePermissions) ? staff.pagePermissions : [];
  const permissions = rawPermissions.map((key) => key === "warranties" ? "repairs" : key).filter((key) => PAGE_PERMISSION_KEYS.includes(key));
  return [...new Set(permissions)];
}

export function canAccessPage(staff, key) {
  if (!staff) return false;
  if (staff.isAdmin) return true;
  return normalizedPagePermissions(staff).includes(key);
}

export async function requirePageAccess(key) {
  const staff = await requireStaff();
  if (!canAccessPage(staff, key)) {
    const error = new Error("没有权限访问这个页面");
    error.status = 403;
    throw error;
  }
  return staff;
}

export async function requireAnyPageAccess(keys = PAGE_PERMISSION_KEYS) {
  const staff = await requireStaff();
  if (!staff.isAdmin && !keys.some((key) => canAccessPage(staff, key))) {
    const error = new Error("没有权限访问这个页面");
    error.status = 403;
    throw error;
  }
  return staff;
}

export function authErrorResponse(error) {
  if (error?.status === 401) {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }
  if (error?.status === 400) {
    return Response.json({ error: error.message || "请求格式不正确" }, { status: 400 });
  }
  if (error?.status === 403) {
    return Response.json({ error: error.message || "没有权限" }, { status: 403 });
  }
  if (error?.status === 409) {
    return Response.json({ error: error.message || "数据已被更新，请刷新后重试" }, { status: 409 });
  }
  if (error?.status === 404) {
    return Response.json({ error: error.message || "没有找到数据" }, { status: 404 });
  }
  return Response.json({ error: error?.message || "服务器错误" }, { status: 500 });
}
