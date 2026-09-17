import { prisma } from "@/lib/prisma";
import { badRequest, notFound } from "@/lib/api-errors";
import { getBootstrapData, replaceBusinessData, requireCtx } from "@/lib/data-store";
import { cleanBusinessBackupData, validateBusinessDataShape } from "@/lib/data-validation";
import { parseExpectedRevision, withPortalWrite } from "@/lib/portal-write";
import { DEFAULT_PORTAL_ID } from "@/lib/portal-store";

// 业务备份只包含一个门户：formatVersion 2 + sourcePortalId + 业务数据 + 计数。
// 不包含 Staff / PortalMember / StaffSession / isSystemAdmin / 密码哈希 / 账号权限，也不恢复 Portal 管理元数据。
export const BACKUP_FORMAT_VERSION = 2;
export const MAX_BACKUPS_PER_PORTAL = 60;
export const AUTO_BACKUP_TIME_ZONE = "Europe/Madrid";

// 自动备份业务日：显式使用 Europe/Madrid 格式化，不依赖服务器默认时区（含夏令时转换日）。
export function businessDay(date = new Date(), timeZone = AUTO_BACKUP_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

// 一致快照：在同一个事务里读取当前门户业务数据，避免多个查询拼出半新半旧的数据。
export async function exportPortalBusinessData(ctx, db) {
  const portalId = requireCtx(ctx);
  const read = async (tx) => {
    const data = await getBootstrapData(ctx, { db: tx, includeRepairs: true, includeClients: true, includeRepairItems: true, includeUsers: false });
    const { users, portal, portalId: _portalId, _revision, ...business } = data;
    return { formatVersion: BACKUP_FORMAT_VERSION, sourcePortalId: portalId, sourcePortalName: portal.name, exportedAt: new Date().toISOString(), ...business };
  };
  if (db) return read(db);
  return prisma.$transaction(read, { timeout: 120000 });
}

export function backupCounts(data) {
  return {
    clients: data.clients?.length || 0,
    repairs: data.repairs?.length || 0,
    payments: (data.repairs || []).reduce((sum, repair) => sum + (Array.isArray(repair.payments) ? repair.payments.length : 0), 0),
    brands: data.brands?.length || 0,
    models: data.models?.length || 0,
    services: data.services?.length || 0,
    parts: data.parts?.length || 0
  };
}

function backupSelect() {
  return { id: true, kind: true, reason: true, counts: true, createdBy: true, createdAt: true };
}

// 在门户写事务内创建快照（安全快照与恢复共用同一事务）。
export async function createBackupSnapshotInTx(ctx, tx, { kind = "manual", reason = "", autoDay = null } = {}) {
  const portalId = requireCtx(ctx);
  const payload = JSON.parse(JSON.stringify(await exportPortalBusinessData(ctx, tx)));
  const cleanData = validateBusinessDataShape(payload, "备份数据");
  const snapshot = await tx.backupSnapshot.create({
    data: {
      portalId,
      kind,
      reason,
      autoDay: kind === "auto" ? autoDay : null,
      data: cleanData,
      counts: backupCounts(cleanData),
      createdBy: ctx.staff?.name || ctx.staff?.username || ""
    },
    select: backupSelect()
  });
  await pruneOldBackups(ctx, tx);
  return snapshot;
}

// 手动 / 自动备份：backup-metadata 模式（范围、成员、事务检查照做，但不递增业务 revision）。
export async function createBackupSnapshot(ctx, { kind = "manual", reason = "", autoDay = null } = {}) {
  const { result } = await withPortalWrite(ctx, { mode: "backup-metadata", timeout: 120000 }, (tx) => createBackupSnapshotInTx(ctx, tx, { kind, reason, autoDay }));
  return result;
}

// 当天首次使用时触发；(portalId, kind, autoDay) 唯一约束保证并发只写入一份，冲突视为已存在。
export async function ensureDailyAutoBackup(ctx) {
  const portalId = requireCtx(ctx);
  const autoDay = businessDay();
  const existing = await prisma.backupSnapshot.findUnique({ where: { portalId_kind_autoDay: { portalId, kind: "auto", autoDay } }, select: { id: true } });
  if (existing) return { created: false, id: existing.id };
  try {
    const snapshot = await createBackupSnapshot(ctx, { kind: "auto", reason: "每日自动备份", autoDay });
    return { created: true, id: snapshot.id };
  } catch (error) {
    if (error?.code === "P2002") return { created: false, id: null };
    throw error;
  }
}

export async function listBackupSnapshots(ctx) {
  const portalId = requireCtx(ctx);
  return prisma.backupSnapshot.findMany({
    where: { portalId },
    orderBy: { createdAt: "desc" },
    take: MAX_BACKUPS_PER_PORTAL,
    select: backupSelect()
  });
}

export async function getBackupSnapshot(ctx, id, db = prisma) {
  const portalId = requireCtx(ctx);
  const snapshot = await db.backupSnapshot.findFirst({ where: { id: String(id || ""), portalId } });
  if (!snapshot) throw notFound("没有找到这份备份", "BACKUP_NOT_FOUND");
  return snapshot;
}

// 检查备份归属：新格式 sourcePortalId 必须等于当前门户；旧无门户格式只允许默认门户显式确认后导入。
export function assertBackupBelongsToPortal(ctx, data, { legacyConfirmed = false, source = "备份文件" } = {}) {
  const portalId = requireCtx(ctx);
  if (!data || typeof data !== "object") throw badRequest(`${source}格式不正确`);
  const sourcePortalId = data.sourcePortalId;
  if (sourcePortalId !== undefined && sourcePortalId !== null && sourcePortalId !== "") {
    if (String(sourcePortalId) !== portalId) throw badRequest(`${source}来自其他门户，不能恢复到当前门户`, "BACKUP_PORTAL_MISMATCH");
    return { legacy: false };
  }
  if (portalId !== DEFAULT_PORTAL_ID) throw badRequest(`${source}没有门户标记，只能由默认门户导入`, "LEGACY_BACKUP_DEFAULT_ONLY");
  if (!legacyConfirmed) throw badRequest("这是升级前的旧格式备份，请确认后再导入到默认门户", "LEGACY_BACKUP_CONFIRMATION_REQUIRED");
  return { legacy: true };
}

// 恢复：当前门户写锁内检查 expectedRevision → 安全快照 → 校验 → 只删除和重建该门户业务数据 → revision + 1。
export async function restoreBackupSnapshot(ctx, id, expectedRevision) {
  const portalId = requireCtx(ctx);
  parseExpectedRevision(expectedRevision);
  const { revision } = await withPortalWrite(ctx, { expectedRevision, timeout: 300000 }, async (tx) => {
    const snapshot = await getBackupSnapshot(ctx, id, tx);
    const raw = snapshot.data && typeof snapshot.data === "object" ? snapshot.data : {};
    if (raw.sourcePortalId !== undefined && raw.sourcePortalId !== null && String(raw.sourcePortalId) !== portalId) {
      throw badRequest("这份备份来自其他门户，不能恢复到当前门户", "BACKUP_PORTAL_MISMATCH");
    }
    const cleanData = cleanBusinessBackupData(validateBusinessDataShape(raw, "历史备份"));
    await createBackupSnapshotInTx(ctx, tx, { kind: "safety", reason: "恢复前自动备份" });
    await replaceBusinessData(ctx, tx, cleanData, { stampAt: new Date() });
    return true;
  });
  const bootstrap = await getBootstrapData(ctx);
  return { ...bootstrap, _revision: revision };
}

export function backupFileName(snapshot) {
  const stamp = snapshot.createdAt instanceof Date ? snapshot.createdAt.toISOString() : new Date(snapshot.createdAt).toISOString();
  return `repairnote-backup-${stamp.replace(/[:.]/g, "-")}`;
}

// 保留数按门户：每门户最多 60 份（auto / manual / safety 统一计入，按创建时间保留最新的）。
async function pruneOldBackups(ctx, db) {
  const portalId = requireCtx(ctx);
  const old = await db.backupSnapshot.findMany({
    where: { portalId },
    orderBy: { createdAt: "desc" },
    skip: MAX_BACKUPS_PER_PORTAL,
    select: { id: true }
  });
  if (!old.length) return;
  await db.backupSnapshot.deleteMany({ where: { portalId, id: { in: old.map((item) => item.id) } } });
}

// 历史快照 / 下载输出时同样清洗身份字段，不只处理用户新上传的文件。
export function snapshotDataForDownload(ctx, snapshot) {
  const portalId = requireCtx(ctx);
  const raw = snapshot.data && typeof snapshot.data === "object" ? snapshot.data : {};
  const { formatVersion, sourcePortalId, sourcePortalName, exportedAt, ...rest } = raw;
  return { formatVersion: BACKUP_FORMAT_VERSION, sourcePortalId: portalId, sourcePortalName: ctx.portal?.name || "", exportedAt: exportedAt || snapshot.createdAt?.toISOString?.() || "", ...cleanBusinessBackupData(rest) };
}
