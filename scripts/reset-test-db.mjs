#!/usr/bin/env node
// 清空测试库全部数据（保留结构与迁移记录）。只允许以 _test 结尾的库，且必须 REPAIRNOTE_ALLOW_DESTRUCTIVE_TESTS=true。
import { PrismaClient } from "@prisma/client";

const url = process.env.REPAIRNOTE_TEST_DATABASE_URL || process.env.DATABASE_URL || "";
if (!url || !/_test(\?|$)/.test(new URL(url).pathname) || process.env.REPAIRNOTE_ALLOW_DESTRUCTIVE_TESTS !== "true") {
  console.error("✗ 只能清空以 _test 结尾的测试库，且需要 REPAIRNOTE_ALLOW_DESTRUCTIVE_TESTS=true");
  process.exit(2);
}
const prisma = new PrismaClient({ datasources: { db: { url } } });
await prisma.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 0");
for (const table of ["Payment", "RepairItem", "Repair", "Attribute", "AttributeGroup", "Model", "Brand", "Part", "Service", "Technician", "Client", "BackupSnapshot", "Setting", "PortalMember", "Portal", "StaffSession", "Staff"]) {
  await prisma.$executeRawUnsafe(`DELETE FROM \`${table}\``);
}
await prisma.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 1");
await prisma.$disconnect();
console.log("✓ 测试库已清空");
