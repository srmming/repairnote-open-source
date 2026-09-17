import { prisma } from "@/lib/prisma";
import { normalizedPagePermissions } from "@/lib/auth";

export const DEFAULT_PORTAL_ID = "default";

// 本人有效成员关系对应的门户（只返回启用的门户及本门户权限；不含其他成员和业务数据）。
export async function listStaffPortals(staffId) {
  const memberships = await prisma.portalMember.findMany({
    where: { staffId, portal: { isActive: true } },
    include: { portal: { select: { id: true, name: true, createdAt: true } } }
  });
  return memberships
    .sort((a, b) => a.portal.createdAt - b.portal.createdAt || a.portal.id.localeCompare(b.portal.id))
    .map((membership) => ({
      id: membership.portal.id,
      name: membership.portal.name,
      isAdmin: membership.isAdmin,
      pagePermissions: normalizedPagePermissions(membership)
    }));
}

export function serializeMemberUser(staff, member) {
  return {
    id: staff.id,
    name: staff.name,
    username: staff.username,
    email: staff.email,
    isAdmin: Boolean(member?.isAdmin),
    pagePermissions: normalizedPagePermissions(member)
  };
}
