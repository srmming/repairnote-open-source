import { prisma } from "@/lib/prisma";
import { canAccessPage, normalizedPagePermissions, requireStaff } from "@/lib/auth";
import { badRequest, forbidden, jsonResponse } from "@/lib/api-errors";

export const PORTAL_HEADER = "x-portal-id";
const PORTAL_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function isValidPortalId(value) {
  return typeof value === "string" && PORTAL_ID_PATTERN.test(value);
}

export function readPortalHeader(request) {
  const raw = request?.headers?.get?.(PORTAL_HEADER);
  if (raw === null || raw === undefined) return null;
  const value = String(raw).trim();
  return value;
}

function assertAccessSpec(member, permissions, accessSpec) {
  if (!accessSpec || typeof accessSpec !== "object") {
    throw new Error("requirePortalContext 需要明确的 accessSpec（{admin:true} 或 {anyOf:[...]}），不允许默认跳过鉴权");
  }
  if (accessSpec.admin) {
    if (!member.isAdmin) throw forbidden("只有本门户管理员可以执行此操作", "PORTAL_ADMIN_REQUIRED");
    return;
  }
  if (member.isAdmin) return;
  if (Array.isArray(accessSpec.allOf) && accessSpec.allOf.length) {
    if (!accessSpec.allOf.every((key) => canAccessPage({ pagePermissions: permissions }, key))) {
      throw forbidden("没有权限访问这个页面", "PAGE_PERMISSION_REQUIRED");
    }
    return;
  }
  if (Array.isArray(accessSpec.anyOf) && accessSpec.anyOf.length) {
    if (!accessSpec.anyOf.some((key) => canAccessPage({ pagePermissions: permissions }, key))) {
      throw forbidden("没有权限访问这个页面", "PAGE_PERMISSION_REQUIRED");
    }
    return;
  }
  if (accessSpec.member) return;
  throw new Error("requirePortalContext 的 accessSpec 不合法");
}

// 会话 → X-Portal-Id → 门户有效 → 成员关系 → 页面 / 动作权限。
// 门户头只是选择器，不是权限凭证：每次请求都重新校验成员关系；外门户 / 不存在 / 停用一律 403，不泄露存在性。
export async function requirePortalContext(request, accessSpec) {
  const staff = await requireStaff();
  const header = readPortalHeader(request);
  if (header === null || header === "") throw badRequest("缺少门户标识（X-Portal-Id）", "PORTAL_HEADER_REQUIRED");
  if (!isValidPortalId(header)) throw badRequest("门户标识不合法", "PORTAL_HEADER_REQUIRED");
  const [portal, member] = await Promise.all([
    prisma.portal.findUnique({ where: { id: header }, select: { id: true, name: true, isActive: true, revision: true } }),
    prisma.portalMember.findUnique({ where: { staffId_portalId: { staffId: staff.id, portalId: header } } })
  ]);
  if (!portal || !member) throw forbidden("没有权限访问该门户", "PORTAL_ACCESS_DENIED");
  if (!portal.isActive) throw forbidden("该门户已停用", "PORTAL_INACTIVE");
  const permissions = normalizedPagePermissions(member);
  assertAccessSpec(member, permissions, accessSpec);
  return Object.freeze({
    staff,
    portalId: portal.id,
    portal: Object.freeze({ id: portal.id, name: portal.name, isActive: portal.isActive, revision: portal.revision.toString() }),
    member: Object.freeze({ staffId: staff.id, portalId: portal.id, isAdmin: member.isAdmin, pagePermissions: permissions }),
    permissions,
    isAdmin: member.isAdmin,
    accessSpec: Object.freeze({ ...accessSpec }),
    can: (key) => member.isAdmin || permissions.includes(key === "warranties" ? "repairs" : key)
  });
}

// 请求体里的 portalId 只允许等于当前上下文；不一致直接 400，不允许请求体覆盖上下文。
export function assertNoPortalOverride(ctx, body) {
  if (!body || typeof body !== "object") return;
  if (body.portalId !== undefined && body.portalId !== ctx.portalId) {
    throw badRequest("请求中的门户与当前门户不一致", "PORTAL_MISMATCH");
  }
}

export function portalHeaders(ctx, extra = {}) {
  return { "X-Portal-Id": ctx.portalId, ...extra };
}

export function portalJson(ctx, body, init = {}) {
  return jsonResponse(body, init, portalHeaders(ctx));
}

// 供事务内复核：同一 accessSpec 下重新校验成员关系（成员被移出 / 降级后立即失效）。
export function recheckMemberAccess(ctx, member) {
  if (!member) throw forbidden("没有权限访问该门户", "PORTAL_ACCESS_DENIED");
  const permissions = normalizedPagePermissions(member);
  assertAccessSpec(member, permissions, ctx.accessSpec);
  return { ...member, pagePermissions: permissions };
}
