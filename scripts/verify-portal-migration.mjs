#!/usr/bin/env node
// 旧单门户库 → 多门户迁移前后核验。
//   迁移前：node scripts/verify-portal-migration.mjs --before  → 记录行数、金额合计、id/ticket/token 摘要、账号权限快照到 reports/migration-before.json
//   迁移后：node scripts/verify-portal-migration.mjs --after   → 与快照逐项比对：行数、金额、token、归属（全部 default）、成员权限回填、
//            默认门户设置、唯一约束 / 外键存在、Staff 旧列已移除、旧会话已清空、悬空引用；任一失败非零退出。
// 使用 DATABASE_URL（.env）。不修改任何业务数据。
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { loadDotEnv } from "./load-env.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadDotEnv(root);
const mode = process.argv.includes("--after") ? "after" : process.argv.includes("--before") ? "before" : "";
if (!mode) {
  console.error("用法：node scripts/verify-portal-migration.mjs --before | --after");
  process.exit(2);
}
if (!process.env.DATABASE_URL) {
  console.error("✗ 未设置 DATABASE_URL");
  process.exit(2);
}
const reportsDir = path.join(root, "reports");
fs.mkdirSync(reportsDir, { recursive: true });
const snapshotPath = path.join(reportsDir, "migration-before.json");
const prisma = new PrismaClient();
const TABLES = ["Staff", "StaffSession", "Client", "Brand", "Model", "Service", "Part", "Technician", "AttributeGroup", "Attribute", "Repair", "RepairItem", "Payment", "Setting", "BackupSnapshot"];

function digest(rows) {
  return crypto.createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}

async function count(table) {
  const rows = await prisma.$queryRawUnsafe(`SELECT COUNT(*) AS c FROM \`${table}\``);
  return Number(rows[0].c);
}

async function collect() {
  const counts = {};
  for (const table of TABLES) counts[table] = await count(table);
  const money = await prisma.$queryRawUnsafe("SELECT CAST(COALESCE(SUM(budget),0) AS CHAR) AS budget, CAST(COALESCE(SUM(deposit),0) AS CHAR) AS deposit, CAST(COALESCE(SUM(discountAmount),0) AS CHAR) AS discount FROM Repair");
  const items = await prisma.$queryRawUnsafe("SELECT CAST(COALESCE(SUM(qty*price),0) AS CHAR) AS total, CAST(COALESCE(SUM(qty*cost),0) AS CHAR) AS cost FROM RepairItem");
  const payments = await prisma.$queryRawUnsafe("SELECT CAST(COALESCE(SUM(amount),0) AS CHAR) AS total FROM Payment");
  const repairKeys = await prisma.$queryRawUnsafe("SELECT id, ticket, publicToken, clientId, LENGTH(frontPhoto) AS fp, LENGTH(signatureDataUrl) AS sg FROM Repair ORDER BY id");
  const ids = {};
  for (const table of ["Client", "Brand", "Model", "Service", "Part", "Technician", "AttributeGroup", "Attribute", "RepairItem", "Payment", "BackupSnapshot"]) {
    ids[table] = digest(await prisma.$queryRawUnsafe(`SELECT id FROM \`${table}\` ORDER BY id`));
  }
  return { counts, money: money[0], items: items[0], payments: payments[0], repairs: digest(repairKeys.map((r) => ({ ...r, fp: String(r.fp), sg: String(r.sg) }))), ids };
}

let exitCode = 0;
try {
  if (mode === "before") {
    const base = await collect();
    const staff = await prisma.$queryRawUnsafe("SELECT id, username, isAdmin, pagePermissions FROM Staff ORDER BY id");
    const setting = await prisma.$queryRawUnsafe("SELECT id, value FROM Setting");
    // MariaDB 的 JSON 列经原始 SQL 返回字符串，MySQL 返回对象：统一解析后再存
    const jsonValue = (value) => (typeof value === "string" ? JSON.parse(value) : value);
    const snapshot = { at: new Date().toISOString(), ...base, staff: staff.map((row) => ({ id: row.id, username: row.username, isAdmin: Boolean(row.isAdmin), pagePermissions: jsonValue(row.pagePermissions) })), settingMain: jsonValue(setting.find((row) => row.id === "main")?.value ?? null) };
    fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));
    console.log(`✓ 已记录迁移前快照：${path.relative(root, snapshotPath)}`);
    console.log(JSON.stringify(snapshot.counts));
  } else {
    if (!fs.existsSync(snapshotPath)) throw new Error("缺少 reports/migration-before.json，请先在迁移前运行 --before");
    const before = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
    const after = await collect();
    const problems = [];
    for (const table of TABLES) {
      const expected = table === "StaffSession" ? 0 : before.counts[table];
      if (after.counts[table] !== expected) problems.push(`${table} 行数 ${after.counts[table]} ≠ 预期 ${expected}`);
    }
    for (const [key, value] of Object.entries(before.money)) if (after.money[key] !== value) problems.push(`Repair 金额合计 ${key}: ${after.money[key]} ≠ ${value}`);
    for (const [key, value] of Object.entries(before.items)) if (after.items[key] !== value) problems.push(`RepairItem 合计 ${key}: ${after.items[key]} ≠ ${value}`);
    if (after.payments.total !== before.payments.total) problems.push(`Payment 合计 ${after.payments.total} ≠ ${before.payments.total}`);
    if (after.repairs !== before.repairs) problems.push("Repair 的 id / ticket / publicToken / 客户 / 照片 / 签名摘要发生变化");
    for (const [table, hash] of Object.entries(before.ids)) if (after.ids[table] !== hash) problems.push(`${table} 的 id 集合发生变化`);

    // 归属：全部业务行 portalId = default
    for (const table of ["Client", "Brand", "Model", "Service", "Part", "Technician", "AttributeGroup", "Attribute", "Repair", "BackupSnapshot"]) {
      const rows = await prisma.$queryRawUnsafe(`SELECT COUNT(*) AS c FROM \`${table}\` WHERE portalId <> 'default' OR portalId IS NULL`);
      if (Number(rows[0].c)) problems.push(`${table} 有 ${rows[0].c} 行未归属 default`);
    }
    const portal = await prisma.portal.findUnique({ where: { id: "default" } });
    if (before.counts.Staff > 0 && !portal) problems.push("默认门户 default 不存在");
    if (portal && !portal.isActive) problems.push("默认门户应为启用状态");
    const setting = await prisma.setting.findUnique({ where: { portalId: "default" } });
    const settingValue = typeof setting?.value === "string" ? JSON.parse(setting.value) : setting?.value;
    if (before.settingMain && JSON.stringify(settingValue) !== JSON.stringify(before.settingMain)) problems.push("默认门户设置与迁移前 main 不一致");

    // 成员权限回填 + 系统主管理员
    const members = await prisma.portalMember.findMany({ where: { portalId: "default" } });
    const memberById = new Map(members.map((m) => [m.staffId, m]));
    for (const staff of before.staff) {
      const member = memberById.get(staff.id);
      if (!member) { problems.push(`员工 ${staff.username} 未加入默认门户`); continue; }
      if (member.isAdmin !== staff.isAdmin) problems.push(`员工 ${staff.username} 的门户管理员角色与迁移前不一致`);
      if (JSON.stringify(member.pagePermissions) !== JSON.stringify(staff.pagePermissions)) problems.push(`员工 ${staff.username} 的页面权限与迁移前不一致`);
    }
    if (members.length !== before.staff.length) problems.push(`默认门户成员数 ${members.length} ≠ 旧员工数 ${before.staff.length}`);
    const systemAdmins = await prisma.staff.findMany({ where: { isSystemAdmin: true }, select: { id: true, username: true } });
    const expectedSystemAdmin = String(process.env.REPAIRNOTE_SYSTEM_ADMIN_STAFF_ID || "").trim();
    if (before.staff.length > 0) {
      if (systemAdmins.length !== 1) problems.push(`系统主管理员数量应为 1，实际 ${systemAdmins.length}`);
      else if (expectedSystemAdmin && systemAdmins[0].id !== expectedSystemAdmin) problems.push(`系统主管理员应为 ${expectedSystemAdmin}，实际 ${systemAdmins[0].id}`);
      else {
        const wasAdmin = before.staff.find((s) => s.id === systemAdmins[0].id)?.isAdmin;
        if (!wasAdmin) problems.push("系统主管理员原本不是管理员");
      }
    }

    // 结构：旧列移除、唯一约束 / 外键存在、旧会话清空
    const staffColumns = (await prisma.$queryRaw`SELECT column_name AS name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'Staff'`).map((r) => String(r.name));
    if (staffColumns.includes("isAdmin") || staffColumns.includes("pagePermissions")) problems.push("Staff 旧列 isAdmin / pagePermissions 未移除");
    if (!staffColumns.includes("isSystemAdmin")) problems.push("Staff 缺少 isSystemAdmin");
    const indexes = (await prisma.$queryRaw`SELECT DISTINCT index_name AS name FROM information_schema.statistics WHERE table_schema = DATABASE()`).map((r) => String(r.name));
    for (const name of ["Repair_portalId_ticket_key", "Repair_publicToken_key", "Brand_portalId_name_key", "Technician_portalId_name_key", "AttributeGroup_portalId_name_key", "Client_portalId_id_key", "BackupSnapshot_portalId_kind_autoDay_key", "Portal_creationKey_key"]) {
      if (!indexes.includes(name)) problems.push(`缺少唯一键 / 索引 ${name}`);
    }
    for (const name of ["Repair_ticket_key", "Brand_name_key", "Technician_name_key", "AttributeGroup_name_key"]) if (indexes.includes(name)) problems.push(`旧全局唯一键 ${name} 仍存在`);
    const fks = (await prisma.$queryRaw`SELECT constraint_name AS name FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND constraint_type = 'FOREIGN KEY'`).map((r) => String(r.name));
    for (const name of ["Repair_portalId_clientId_fkey", "Model_portalId_brandId_fkey", "Attribute_portalId_groupId_fkey", "Setting_portalId_fkey", "PortalMember_staffId_fkey", "PortalMember_portalId_fkey"]) if (!fks.includes(name)) problems.push(`缺少外键 ${name}`);
    const sessions = await prisma.staffSession.count();
    if (sessions) problems.push(`旧会话未清空（${sessions}）`);
    const dangling = await prisma.$queryRaw`SELECT COUNT(*) AS c FROM Repair r WHERE r.sourceRepairId <> '' AND NOT EXISTS (SELECT 1 FROM Repair s WHERE s.id = r.sourceRepairId AND s.portalId = r.portalId)`;
    if (Number(dangling[0].c)) problems.push(`存在 ${dangling[0].c} 条跨门户 / 悬空的保修来源引用`);

    const report = { at: new Date().toISOString(), before: before.counts, after: after.counts, systemAdmins, problems };
    fs.writeFileSync(path.join(reportsDir, "migration-after.json"), JSON.stringify(report, null, 2));
    if (problems.length) {
      console.error("✗ 迁移核验未通过：\n  - " + problems.join("\n  - "));
      exitCode = 1;
    } else {
      console.log(`✓ 迁移核验通过：${TABLES.length} 张表行数一致、金额 / token / id 一致、全部归属 default、成员权限回填一致、系统主管理员 ${systemAdmins.map((s) => s.username).join(",")}、旧会话已清空。`);
    }
  }
} catch (error) {
  console.error(`✗ ${error?.message || error}`);
  exitCode = 1;
} finally {
  await prisma.$disconnect();
}
process.exit(exitCode);
