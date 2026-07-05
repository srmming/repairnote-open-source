import { authErrorResponse, hashPassword, normalizedPagePermissions, PAGE_PERMISSION_KEYS, requireStaff } from "@/lib/auth";
import { getRevisionPatch } from "@/lib/data-store";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const staff = await requireAdminStaff();
    return Response.json(await staffList(staff.shopId));
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request) {
  try {
    const currentStaff = await requireAdminStaff();
    const body = await request.json();
    const saved = await upsertStaff(body, currentStaff.shopId);
    return Response.json({
      user: serializeStaff(saved),
      users: await staffList(currentStaff.shopId),
      currentUser: saved.id === currentStaff.id ? serializeStaff(saved) : null,
      _revisionPatch: await getRevisionPatch({ keys: ["users"], shopId: currentStaff.shopId })
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function DELETE(request) {
  try {
    const currentStaff = await requireAdminStaff();
    const body = await request.json();
    const staffId = String(body?.id || "").trim();
    if (!staffId) throwBadRequest("缺少员工");
    if (staffId === currentStaff.id) throwBadRequest("当前登录账号不可删除");

    const existing = await prisma.staff.findFirst({ where: { id: staffId, shopId: currentStaff.shopId } });
    if (!existing) throwNotFound("没有找到员工");
    if (existing.isAdmin) await ensureNotLastAdmin(staffId, currentStaff.shopId);

    await prisma.staff.delete({ where: { id: staffId } });
    return Response.json({ ok: true, users: await staffList(currentStaff.shopId), _revisionPatch: await getRevisionPatch({ keys: ["users"], shopId: currentStaff.shopId }) });
  } catch (error) {
    return authErrorResponse(error);
  }
}

async function requireAdminStaff() {
  const staff = await requireStaff();
  if (!staff.isAdmin) {
    const error = new Error("只有管理员可管理员工");
    error.status = 403;
    throw error;
  }
  return staff;
}

async function upsertStaff(body = {}, shopId) {
  const staffId = String(body.id || "").trim();
  const name = String(body.name || "").trim();
  const username = String(body.username || "").trim();
  const email = String(body.email || "").trim();
  const password = String(body.password || "");
  const isAdmin = Boolean(body.isAdmin);

  if (!name) throwBadRequest("员工姓名不能为空");
  if (!username) throwBadRequest("员工用户名不能为空");

  const existing = staffId ? await prisma.staff.findFirst({ where: { id: staffId, shopId } }) : null;
  if (staffId && !existing) throwNotFound("没有找到员工");
  if (!existing && !password) throwBadRequest("新员工必须设置密码");

  const usernameOwner = await prisma.staff.findUnique({ where: { shopId_username: { shopId, username } } });
  if (usernameOwner && usernameOwner.id !== staffId) throwConflict("员工用户名重复");
  if (existing?.isAdmin && !isAdmin) await ensureNotLastAdmin(staffId, shopId);

  const pagePermissions = isAdmin ? PAGE_PERMISSION_KEYS : normalizedPagePermissions({ pagePermissions: body.pagePermissions });
  const data = { name, username, email, isAdmin, pagePermissions };
  if (password) data.passwordHash = hashPassword(password);

  if (existing) return prisma.staff.update({ where: { id: staffId }, data });
  return prisma.staff.create({ data: { id: staffId || undefined, shopId, ...data, passwordHash: data.passwordHash } });
}

async function ensureNotLastAdmin(staffId, shopId) {
  const adminCount = await prisma.staff.count({ where: { shopId, isAdmin: true } });
  const target = await prisma.staff.findFirst({ where: { id: staffId, shopId }, select: { isAdmin: true } });
  if (target?.isAdmin && adminCount <= 1) throwBadRequest("最后一个管理员不可删除或降级");
}

async function staffList(shopId) {
  const rows = await prisma.staff.findMany({ where: { shopId }, orderBy: { createdAt: "asc" } });
  return rows.map(serializeStaff);
}

function serializeStaff(staff) {
  const { passwordHash, sessionTokenHash, sessionExpiresAt, ...safeStaff } = staff;
  return {
    ...safeStaff,
    pagePermissions: staff.isAdmin ? PAGE_PERMISSION_KEYS : normalizedPagePermissions(staff)
  };
}

function throwBadRequest(message) {
  const error = new Error(message);
  error.status = 400;
  throw error;
}

function throwConflict(message) {
  const error = new Error(message);
  error.status = 409;
  throw error;
}

function throwNotFound(message) {
  const error = new Error(message);
  error.status = 404;
  throw error;
}
