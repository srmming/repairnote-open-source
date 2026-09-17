import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";
import { badRequest, forbidden } from "@/lib/api-errors";
import { readPortalHeader } from "@/lib/portal-context";
import { publicOrigin } from "@/lib/request-origin";

// 系统主管理员校验：从有效会话查最新 Staff.isSystemAdmin；不使用登录响应缓存，不调用 requirePortalContext。
// /api/system/* 不带 X-Portal-Id；携带该头返回 400，防止把当前门户当成管理目标。
export async function requireSystemAdmin(request) {
  const staff = await requireStaff();
  const fresh = await prisma.staff.findUnique({ where: { id: staff.id }, select: { id: true, name: true, username: true, isSystemAdmin: true } });
  if (!fresh?.isSystemAdmin) throw forbidden("需要系统主管理员权限", "SYSTEM_ADMIN_REQUIRED");
  const header = readPortalHeader(request);
  if (header !== null) throw badRequest("系统管理接口不接受 X-Portal-Id", "UNEXPECTED_PORTAL_HEADER");
  return Object.freeze({ id: fresh.id, name: fresh.name, username: fresh.username, isSystemAdmin: true });
}

// 系统写接口：Content-Type 必须是 application/json，Origin 必须与 REPAIRNOTE_PUBLIC_ORIGIN 完全一致。
// 不启用跨站带凭据 CORS；只校验 Cookie SameSite 不算完成。
export function requireSystemWriteRequest(request) {
  const contentType = String(request.headers.get("content-type") || "").toLowerCase();
  if (!contentType.startsWith("application/json")) throw badRequest("系统管理写接口要求 Content-Type: application/json", "INVALID_CONTENT_TYPE");
  const expected = publicOrigin();
  const origin = String(request.headers.get("origin") || "").trim();
  if (!expected) {
    console.error("REPAIRNOTE_PUBLIC_ORIGIN 未正确配置，系统管理写接口拒绝所有请求");
    throw forbidden("安全校验失败：服务器未配置允许来源（REPAIRNOTE_PUBLIC_ORIGIN）", "ORIGIN_NOT_ALLOWED");
  }
  if (!origin || origin !== expected) throw forbidden("安全校验失败：请求来源不被允许", "ORIGIN_NOT_ALLOWED");
}

// 结构化服务端安全日志：只记录动作 / 操作者 / 目标 / 旧新状态 / 结果，不记录密码、cookie、账号原行或客户信息。
export function securityLog(event) {
  try {
    console.info(JSON.stringify({ type: "security", at: new Date().toISOString(), ...event }));
  } catch (error) {
    console.warn("securityLog failed:", error?.message || error);
  }
}
