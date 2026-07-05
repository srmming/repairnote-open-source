import { prisma } from "@/lib/prisma";
import { getBootstrapData, syncFromClientData } from "@/lib/data-store";
import { DEFAULT_SHOP_ID } from "@/lib/shop";
import { validateBusinessDataShape } from "@/lib/data-validation";

const MAX_BACKUPS = 60;

export async function createBackupSnapshot({ kind = "manual", reason = "", staff = null, data = null } = {}) {
  const shopId = staff?.shopId || DEFAULT_SHOP_ID;
  const sourceData = data && !hasUnloadedRepairs(data) ? data : await getBootstrapData({ shopId, includeRepairItems: true });
  const payload = JSON.parse(JSON.stringify(sourceData));
  const cleanData = validateBusinessDataShape(payload, "备份数据");
  const snapshot = await prisma.backupSnapshot.create({
    data: {
      kind,
      shopId,
      reason,
      data: cleanData,
      counts: backupCounts(cleanData),
      createdBy: staff?.name || staff?.username || ""
    },
    select: backupSelect()
  });
  await pruneOldBackups(shopId);
  return snapshot;
}

export async function ensureDailyAutoBackup({ staff = null, data = null } = {}) {
  const shopId = staff?.shopId || DEFAULT_SHOP_ID;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const existing = await prisma.backupSnapshot.findFirst({
    where: { shopId, kind: "auto", createdAt: { gte: today } },
    select: { id: true }
  });
  if (existing) return null;
  if (data && hasUnloadedRepairs(data)) return null;
  return createBackupSnapshot({ kind: "auto", reason: "每日自动备份", staff, data });
}

export async function listBackupSnapshots(staff) {
  return prisma.backupSnapshot.findMany({
    where: { shopId: staff?.shopId || DEFAULT_SHOP_ID },
    orderBy: { createdAt: "desc" },
    take: MAX_BACKUPS,
    select: backupSelect()
  });
}

export async function getBackupSnapshot(id, staff) {
  const snapshot = await prisma.backupSnapshot.findFirst({ where: { id, shopId: staff?.shopId || DEFAULT_SHOP_ID } });
  if (!snapshot) {
    const error = new Error("没有找到这份备份");
    error.status = 404;
    throw error;
  }
  return snapshot;
}

export async function restoreBackupSnapshot(id, staff) {
  const snapshot = await getBackupSnapshot(id, staff);
  await createBackupSnapshot({ kind: "safety", reason: "恢复前自动备份", staff });
  const cleanData = validateBusinessDataShape(snapshot.data, "历史备份");
  return syncFromClientData(cleanData, { shopId: staff?.shopId || DEFAULT_SHOP_ID });
}

export function backupFileName(snapshot) {
  const stamp = snapshot.createdAt instanceof Date ? snapshot.createdAt.toISOString() : new Date(snapshot.createdAt).toISOString();
  return `repairnote-backup-${stamp.replace(/[:.]/g, "-")}`;
}

function backupCounts(data) {
  return {
    clients: data.clients?.length || 0,
    repairs: data.repairs?.length || 0,
    payments: (data.repairs || []).reduce((sum, repair) => sum + (Array.isArray(repair.payments) ? repair.payments.length : 0), 0),
    brands: data.brands?.length || 0,
    models: data.models?.length || 0,
    services: data.services?.length || 0,
    parts: data.parts?.length || 0,
    users: data.users?.length || 0
  };
}

function backupSelect() {
  return {
    id: true,
    kind: true,
    reason: true,
    counts: true,
    createdBy: true,
    createdAt: true
  };
}

async function pruneOldBackups(shopId) {
  const old = await prisma.backupSnapshot.findMany({
    where: { shopId },
    orderBy: { createdAt: "desc" },
    skip: MAX_BACKUPS,
    select: { id: true }
  });
  if (!old.length) return;
  await prisma.backupSnapshot.deleteMany({ where: { shopId, id: { in: old.map((item) => item.id) } } });
}

function hasUnloadedRepairs(data) {
  return (data.repairs || []).some((repair) => repair?.itemsLoaded === false);
}
