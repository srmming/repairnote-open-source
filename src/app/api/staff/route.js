import { hashPassword, normalizedPagePermissions, PAGE_PERMISSION_KEYS, parsePagePermissions, revokeStaffSessions, validateEmail, validatePassword, validatePersonName, validateUsername } from "@/lib/auth";
import { badRequest, conflict, errorResponse, forbidden, notFound, readJsonBody, requestIdOf } from "@/lib/api-errors";
import { assertNoPortalOverride, portalJson, requirePortalContext } from "@/lib/portal-context";
import { parseExpectedRevision, withPortalWrite } from "@/lib/portal-write";
import { listPortalUsers } from "@/lib/data-store";
import { serializeMemberUser } from "@/lib/portal-store";
import { securityLog } from "@/lib/system-admin";

// 原员工页：只针对当前门户成员。
// - 新建员工：创建未被使用的全局用户名，并在同一事务中加入当前门户；已存在的用户名冲突，不认领、不改密码、不加入。
// - 修改本门户角色 / 页面权限：只改 PortalMember；最后一位门户管理员不得移除或降级（锁内检查）。
// - 修改姓名 / 用户名 / 邮箱 / 密码属于全局身份：只允许编辑「只属于本门户且不是系统主管理员」的账号；
//   多门户账号与系统主管理账号的全局身份 / 密码由受控应急 CLI 处理（防止门店管理员重置密码接管系统管理）。
// - 删除员工 = 移出当前门户：只删除 PortalMember，不删除全局 Staff。
// - 所有网页写 API 拒绝 isSystemAdmin 字段。

const ALLOWED_KEYS = ["id", "name", "username", "email", "password", "isAdmin", "pagePermissions", "expectedRevision", "updatedAt", "portalId"];

// 已有成员的修改 / 移出必须携带该成员记录读取时的 updatedAt：缺失 400、非法 400、过期 409。
// 门户 revision 会被客户 / 订单等无关操作推进，不能作为员工数据的版本；成员自己的时间戳才能识别“旧权限数据”。
function assertFreshMember(member, expectedUpdatedAt) {
  if (expectedUpdatedAt === undefined || expectedUpdatedAt === null || expectedUpdatedAt === "") throw badRequest("缺少员工版本（updatedAt），请刷新员工列表后重试", "VERSION_REQUIRED");
  const expected = new Date(expectedUpdatedAt);
  if (Number.isNaN(expected.getTime())) throw badRequest("员工版本（updatedAt）格式不正确", "INVALID_VERSION");
  if (expected.getTime() !== member.updatedAt.getTime()) throw conflict("该员工的资料或权限刚被其他人修改，请刷新后重试", "VERSION_CONFLICT");
}

function nextMemberUpdatedAt(member) {
  return new Date(Math.max(Date.now(), member.updatedAt.getTime() + 1));
}
const throwBad = (message) => { throw badRequest(message); };

export async function GET(request) {
  const requestId = requestIdOf(request);
  try {
    const ctx = await requirePortalContext(request, { admin: true });
    return portalJson(ctx, await listPortalUsers(ctx));
  } catch (error) {
    return errorResponse(error, { requestId });
  }
}

export async function POST(request) {
  const requestId = requestIdOf(request);
  try {
    const ctx = await requirePortalContext(request, { admin: true });
    const body = await readJsonBody(request);
    assertNoPortalOverride(ctx, body);
    if (body.isSystemAdmin !== undefined) throw badRequest("不允许通过网页设置系统管理员身份");
    const unknown = Object.keys(body).filter((key) => !ALLOWED_KEYS.includes(key));
    if (unknown.length) throw badRequest(`员工请求包含不允许的字段：${unknown.slice(0, 5).join(", ")}`);
    const staffId = String(body.id || "").trim();
    if (body.isAdmin !== undefined && typeof body.isAdmin !== "boolean") throw badRequest("isAdmin 必须是布尔值");
    const isAdmin = body.isAdmin === true;
    const pagePermissions = isAdmin ? [...PAGE_PERMISSION_KEYS] : parsePagePermissions(body.pagePermissions, throwBad);
    const password = body.password === undefined || body.password === null || body.password === "" ? "" : validatePassword(body.password, throwBad);

    // 新建员工带读取时的门户版本；已有员工的修改用成员记录自身的 updatedAt（见 assertFreshMember）。
    const expectedRevision = staffId ? parseExpectedRevision(body.expectedRevision, { required: false }) : parseExpectedRevision(body.expectedRevision);
    const { result, revision } = await withPortalWrite(ctx, { staffIds: staffId ? [staffId] : [], expectedRevision }, async (tx, { lockedStaff }) => {
      if (!staffId) {
        const name = validatePersonName(body.name, throwBad);
        const username = validateUsername(body.username, throwBad);
        const email = validateEmail(body.email, throwBad);
        if (!password) throw badRequest("新员工必须设置密码");
        const usernameOwner = await tx.staff.findUnique({ where: { username }, select: { id: true } });
        if (usernameOwner) throw conflict("员工用户名已被使用，请换一个用户名", "USERNAME_TAKEN");
        const created = await tx.staff.create({
          data: { name, username, email, passwordHash: hashPassword(password), isSystemAdmin: false, memberships: { create: { portalId: ctx.portalId, isAdmin, pagePermissions } } }
        });
        const member = await tx.portalMember.findUnique({ where: { staffId_portalId: { staffId: created.id, portalId: ctx.portalId } } });
        return { staff: created, member, created: true };
      }

      const locked = lockedStaff.find((row) => row.id === staffId);
      const member = locked ? await tx.portalMember.findUnique({ where: { staffId_portalId: { staffId, portalId: ctx.portalId } } }) : null;
      if (!locked || !member) throw notFound("没有找到员工", "STAFF_NOT_FOUND");
      assertFreshMember(member, body.updatedAt);
      const target = await tx.staff.findUnique({ where: { id: staffId } });

      const name = body.name === undefined ? target.name : validatePersonName(body.name, throwBad);
      const username = body.username === undefined ? target.username : validateUsername(body.username, throwBad);
      const email = body.email === undefined ? target.email : validateEmail(body.email, throwBad);
      const identityChanged = name !== target.name || username !== target.username || email !== target.email || Boolean(password);
      if (identityChanged) {
        const membershipCount = await tx.portalMember.count({ where: { staffId } });
        if (target.isSystemAdmin || membershipCount !== 1) {
          throw forbidden("该账号属于多个门户或是系统主管理员，其姓名、用户名、邮箱和密码不能在门店员工页修改", "IDENTITY_PROTECTED");
        }
        if (username !== target.username) {
          const usernameOwner = await tx.staff.findUnique({ where: { username }, select: { id: true } });
          if (usernameOwner && usernameOwner.id !== staffId) throw conflict("员工用户名重复", "USERNAME_TAKEN");
        }
      }
      if (member.isAdmin && !isAdmin) {
        const adminCount = await tx.portalMember.count({ where: { portalId: ctx.portalId, isAdmin: true } });
        if (adminCount <= 1) throw conflict("最后一个管理员不可删除或降级", "LAST_PORTAL_ADMIN");
      }
      const identityData = identityChanged ? { name, username, email, ...(password ? { passwordHash: hashPassword(password) } : {}) } : null;
      const updatedStaff = identityData ? await tx.staff.update({ where: { id: staffId }, data: identityData }) : target;
      if (password) await revokeStaffSessions(tx, staffId);
      const updatedMember = await tx.portalMember.update({ where: { staffId_portalId: { staffId, portalId: ctx.portalId } }, data: { isAdmin, pagePermissions, updatedAt: nextMemberUpdatedAt(member) } });
      return { staff: updatedStaff, member: updatedMember, created: false, passwordChanged: Boolean(password), identityChanged };
    });

    securityLog({
      action: result.created ? "portal.staff.create" : "portal.staff.update",
      actorStaffId: ctx.staff.id,
      portalId: ctx.portalId,
      targetStaffId: result.staff.id,
      identityChanged: Boolean(result.identityChanged),
      passwordChanged: Boolean(result.passwordChanged),
      to: { isAdmin: result.member.isAdmin, pagePermissions: normalizedPagePermissions(result.member) },
      result: "ok"
    });
    const user = serializeMemberUser(result.staff, result.member);
    return portalJson(ctx, {
      user,
      users: await listPortalUsers(ctx),
      currentUser: user.id === ctx.staff.id ? user : null,
      passwordChanged: Boolean(result.passwordChanged),
      _revision: revision
    });
  } catch (error) {
    return errorResponse(error, { requestId });
  }
}

export async function DELETE(request) {
  const requestId = requestIdOf(request);
  try {
    const ctx = await requirePortalContext(request, { admin: true });
    const body = await readJsonBody(request);
    assertNoPortalOverride(ctx, body);
    const staffId = String(body?.id || "").trim();
    if (!staffId) throw badRequest("缺少员工");
    if (staffId === ctx.staff.id) throw badRequest("当前登录账号不可移出，请由其他管理员操作");

    const expectedRevision = parseExpectedRevision(body.expectedRevision, { required: false });
    const { revision } = await withPortalWrite(ctx, { staffIds: [staffId], expectedRevision }, async (tx) => {
      const member = await tx.portalMember.findUnique({ where: { staffId_portalId: { staffId, portalId: ctx.portalId } } });
      if (!member) throw notFound("没有找到员工", "STAFF_NOT_FOUND");
      assertFreshMember(member, body.updatedAt);
      if (member.isAdmin) {
        const adminCount = await tx.portalMember.count({ where: { portalId: ctx.portalId, isAdmin: true } });
        if (adminCount <= 1) throw conflict("最后一个管理员不可删除或降级", "LAST_PORTAL_ADMIN");
      }
      await tx.portalMember.delete({ where: { staffId_portalId: { staffId, portalId: ctx.portalId } } });
      return true;
    });
    securityLog({ action: "portal.staff.remove", actorStaffId: ctx.staff.id, portalId: ctx.portalId, targetStaffId: staffId, result: "ok" });
    return portalJson(ctx, { ok: true, users: await listPortalUsers(ctx), _revision: revision });
  } catch (error) {
    return errorResponse(error, { requestId });
  }
}
