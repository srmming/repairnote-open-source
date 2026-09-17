import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { badRequest, conflict, forbidden, notFound } from "@/lib/api-errors";
import { recheckMemberAccess } from "@/lib/portal-context";

// 每门户一个数据库行写锁（SELECT ... FOR UPDATE），所有业务写入口统一经过这里：
// 锁 Portal 行 → 确认仍有效并重新核对成员权限 → 比较 expectedRevision → 执行写入 → revision + 1 → 提交。
// 涉及全局 Staff 身份 / 成员分配时，先按 ID 排序锁所涉 Staff 行，再锁 Portal 行，最后业务对象（应急命令、员工页与系统管理页同序）。
// mode 默认 business；唯一例外 "backup-metadata" 只用于创建 / 剪枝快照，不递增业务 revision。

const DEADLOCK_RETRIES = 3;
const DEFAULT_TIMEOUT = 60000;

export function parseExpectedRevision(value, { required = true } = {}) {
  if (value === undefined || value === null || value === "") {
    if (required) throw badRequest("缺少 expectedRevision", "REVISION_REQUIRED");
    return undefined;
  }
  const text = String(value).trim();
  if (!/^\d{1,19}$/.test(text)) throw badRequest("expectedRevision 必须是非负十进制字符串", "INVALID_REVISION");
  return text;
}

export function isDeadlockError(error) {
  if (error?.code === "P2034") return true;
  const message = String(error?.message || "");
  return /Deadlock found|Lock wait timeout|1213|1205/.test(message);
}

export async function withDeadlockRetry(run) {
  let attempt = 0;
  for (;;) {
    try {
      return await run();
    } catch (error) {
      attempt += 1;
      if (!isDeadlockError(error) || attempt >= DEADLOCK_RETRIES) throw error;
      await new Promise((resolve) => setTimeout(resolve, 20 * attempt));
    }
  }
}

export async function lockStaffRows(tx, staffIds = []) {
  const ids = [...new Set(staffIds.filter(Boolean))].sort();
  if (!ids.length) return [];
  return tx.$queryRaw(Prisma.sql`SELECT id, username, isSystemAdmin FROM Staff WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`);
}

export async function lockPortalRow(tx, portalId) {
  const rows = await tx.$queryRaw(Prisma.sql`SELECT id, name, isActive, revision FROM Portal WHERE id = ${portalId} FOR UPDATE`);
  const row = rows[0];
  if (!row) return null;
  return { id: row.id, name: row.name, isActive: Boolean(row.isActive), revision: BigInt(row.revision) };
}

export async function withPortalWrite(ctx, options = {}, operation) {
  if (!ctx?.portalId) throw new Error("withPortalWrite 需要已校验的门户上下文");
  const mode = options.mode || "business";
  if (!["business", "backup-metadata"].includes(mode)) throw new Error("withPortalWrite 不支持的 mode");
  const expected = options.expectedRevision === undefined ? undefined : parseExpectedRevision(options.expectedRevision, { required: false });
  const staffIds = Array.isArray(options.staffIds) ? options.staffIds : [];
  const timeout = options.timeout || DEFAULT_TIMEOUT;

  return withDeadlockRetry(() => prisma.$transaction(async (tx) => {
    const lockedStaff = await lockStaffRows(tx, staffIds);
    const portal = await lockPortalRow(tx, ctx.portalId);
    if (!portal) throw forbidden("没有权限访问该门户", "PORTAL_ACCESS_DENIED");
    if (!portal.isActive) throw forbidden("该门户已停用", "PORTAL_INACTIVE");
    const memberRow = await tx.portalMember.findUnique({ where: { staffId_portalId: { staffId: ctx.staff.id, portalId: ctx.portalId } } });
    const member = recheckMemberAccess(ctx, memberRow);
    if (expected !== undefined && expected !== portal.revision.toString()) {
      throw conflict("数据已被其他设备更新，请刷新后重试", "VERSION_CONFLICT");
    }
    const result = await operation(tx, { portal, member, lockedStaff, revision: portal.revision.toString() });
    let revision = portal.revision;
    if (mode === "business") {
      revision = portal.revision + 1n;
      await tx.portal.update({ where: { id: ctx.portalId }, data: { revision } });
    }
    return { result, revision: revision.toString() };
  }, { timeout, maxWait: 10000 }));
}

// 系统管理写：锁系统操作者及相关目标 Staff → 锁路径指定的 Portal → 重查 isSystemAdmin → 比较 expectedRevision →
// 执行元数据 / 成员操作 → 实际发生变更时该门户 revision + 1 → 提交。允许管理停用门户，不要求操作者是成员。
// 只支持元数据和成员写入；不能作为任何订单 / 报表 / 业务恢复函数的鉴权通道。
export async function withSystemPortalWrite(actor, options = {}, operation) {
  if (!actor?.id) throw new Error("withSystemPortalWrite 需要服务端可信 actor");
  const portalId = options.portalId;
  if (!portalId) throw new Error("withSystemPortalWrite 需要 portalId");
  const expected = parseExpectedRevision(options.expectedRevision, { required: options.requireRevision !== false });
  const staffIds = [actor.id, ...(Array.isArray(options.staffIds) ? options.staffIds : [])];

  return withDeadlockRetry(() => prisma.$transaction(async (tx) => {
    const lockedStaff = await lockStaffRows(tx, staffIds);
    const actorRow = lockedStaff.find((row) => row.id === actor.id);
    if (!actorRow || !actorRow.isSystemAdmin) throw forbidden("需要系统主管理员权限", "SYSTEM_ADMIN_REQUIRED");
    const portal = await lockPortalRow(tx, portalId);
    if (!portal) throw notFound("没有找到该门户", "PORTAL_NOT_FOUND");
    if (expected !== undefined && expected !== portal.revision.toString()) {
      throw conflict("门户信息已被更新，请刷新后重试", "VERSION_CONFLICT");
    }
    const outcome = await operation(tx, { portal, lockedStaff, revision: portal.revision.toString() });
    let revision = portal.revision;
    if (outcome?.changed) {
      revision = portal.revision + 1n;
      await tx.portal.update({ where: { id: portalId }, data: { revision } });
    }
    return { result: outcome?.result, changed: Boolean(outcome?.changed), revision: revision.toString(), portal: { ...portal, revision } };
  }, { timeout: DEFAULT_TIMEOUT, maxWait: 10000 }));
}
