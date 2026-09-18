#!/usr/bin/env node
// 受控运维命令（不是日常门户操作入口；日常新增 / 改名 / 启停 / 分配成员在网页「设置 → 门户管理」完成）：
//   node scripts/portal-admin.mjs bootstrap-system-admin --staff-id <现有管理员ID>   首次指定系统主管理员（或 --from-env 读 REPAIRNOTE_SYSTEM_ADMIN_STAFF_ID）
//   node scripts/portal-admin.mjs check-system-admin                                健康检查：至少一位系统主管理员、每个门户至少一位门户管理员
//   node scripts/portal-admin.mjs reset-password --staff-id <账号ID>                 受控重置密码（隐藏输入，不接受命令行明文），同事务撤销全部会话
//   node scripts/portal-admin.mjs update-identity --staff-id <账号ID> [--name] [--username] [--email]
// 只能由可信宿主机操作者运行；先做数据库备份，命令会记录目标 / 动作 / 结果，不输出密码或哈希。
import path from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline";
import crypto from "node:crypto";
import { PrismaClient, Prisma } from "@prisma/client";
import { loadDotEnv } from "./load-env.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadDotEnv(root);

const DEFAULT_PORTAL_ID = "default";
const args = process.argv.slice(2);
const command = args[0];
const options = parseArgs(args.slice(1));

if (!process.env.DATABASE_URL) {
  console.error("✗ 未设置 DATABASE_URL");
  process.exit(2);
}

const prisma = new PrismaClient();
let exitCode = 0;

try {
  if (command === "bootstrap-system-admin") await bootstrapSystemAdmin();
  else if (command === "check-system-admin") await checkSystemAdmin();
  else if (command === "reset-password") await resetPassword();
  else if (command === "update-identity") await updateIdentity();
  else {
    usage();
    exitCode = 2;
  }
} catch (error) {
  console.error(`✗ ${error?.message || error}`);
  exitCode = 1;
} finally {
  await prisma.$disconnect();
}
process.exit(exitCode);

function usage() {
  console.log(`用法：
  node scripts/portal-admin.mjs bootstrap-system-admin --staff-id <ID> | --from-env
  node scripts/portal-admin.mjs check-system-admin
  node scripts/portal-admin.mjs reset-password --staff-id <ID>
  node scripts/portal-admin.mjs update-identity --staff-id <ID> [--name <姓名>] [--username <用户名>] [--email <邮箱>]`);
}

function parseArgs(list) {
  const result = {};
  for (let index = 0; index < list.length; index += 1) {
    const item = list[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const next = list[index + 1];
    if (next === undefined || next.startsWith("--")) {
      result[key] = true;
    } else {
      result[key] = next;
      index += 1;
    }
  }
  return result;
}

function requireStaffIdOption() {
  const value = String(options["staff-id"] || "").trim();
  if (!value || !/^[A-Za-z0-9_-]{1,64}$/.test(value)) throw new Error("请用 --staff-id 指定合法的账号 ID");
  return value;
}

function log(event) {
  console.log(JSON.stringify({ type: "portal-admin", at: new Date().toISOString(), ...event }));
}

async function lockStaff(tx, ids) {
  const sorted = [...new Set(ids)].sort();
  return tx.$queryRaw(Prisma.sql`SELECT id, username, isSystemAdmin FROM Staff WHERE id IN (${Prisma.join(sorted)}) ORDER BY id FOR UPDATE`);
}

// 仅在尚无系统主管理员时授予指定现有账号；目标在 default 必须为门户管理员。
// 已有系统主管理员且指定的是同一账号 → 幂等成功；指定其他账号 → 失败（不是日常新增系统管理员功能）。
async function bootstrapSystemAdmin() {
  let staffId;
  if (options["from-env"]) {
    staffId = String(process.env.REPAIRNOTE_SYSTEM_ADMIN_STAFF_ID || "").trim();
    if (!staffId) {
      const existing = await prisma.staff.count({ where: { isSystemAdmin: true } });
      if (existing > 0) {
        log({ action: "bootstrap-system-admin", result: "skipped", reason: "already-has-system-admin" });
        console.log("✓ 已存在系统主管理员，未设置 REPAIRNOTE_SYSTEM_ADMIN_STAFF_ID，跳过。");
        return;
      }
      const staffCount = await prisma.staff.count();
      if (staffCount === 0) {
        console.log("✓ 空库：首位管理员将由 prisma db seed 创建并兼任系统主管理员，跳过。");
        return;
      }
      throw new Error("数据库已有账号但没有系统主管理员：请设置 REPAIRNOTE_SYSTEM_ADMIN_STAFF_ID 为真实、已确认的原管理员 Staff ID 后重试");
    }
  } else {
    staffId = requireStaffIdOption();
  }
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(staffId)) throw new Error("REPAIRNOTE_SYSTEM_ADMIN_STAFF_ID 不合法");

  await prisma.$transaction(async (tx) => {
    const allIds = (await tx.staff.findMany({ select: { id: true } })).map((row) => row.id);
    if (!allIds.length) throw new Error("数据库中没有任何账号");
    const locked = await lockStaff(tx, allIds);
    const target = locked.find((row) => row.id === staffId);
    if (!target) throw new Error(`账号 ${staffId} 不存在`);
    const systemAdmins = locked.filter((row) => Boolean(row.isSystemAdmin));
    if (systemAdmins.length) {
      if (systemAdmins.length === 1 && systemAdmins[0].id === staffId) {
        log({ action: "bootstrap-system-admin", targetStaffId: staffId, result: "idempotent" });
        console.log(`✓ ${target.username} 已是唯一的系统主管理员，无需更改。`);
        return;
      }
      throw new Error(`已存在系统主管理员（${systemAdmins.map((row) => row.username).join(", ")}），bootstrap 不用于新增系统管理员`);
    }
    const member = await tx.portalMember.findUnique({ where: { staffId_portalId: { staffId, portalId: DEFAULT_PORTAL_ID } } });
    if (!member?.isAdmin) throw new Error(`账号 ${target.username} 不是默认门户（default）的门户管理员，不能指定为系统主管理员`);
    await tx.staff.update({ where: { id: staffId }, data: { isSystemAdmin: true } });
    log({ action: "bootstrap-system-admin", targetStaffId: staffId, targetUsername: target.username, result: "ok" });
    console.log(`✓ 已把 ${target.username}（${staffId}）设为系统主管理员。`);
  });
}

async function checkSystemAdmin() {
  const problems = [];
  const systemAdmins = await prisma.staff.count({ where: { isSystemAdmin: true } });
  if (systemAdmins < 1) problems.push("没有任何系统主管理员");
  const portals = await prisma.portal.findMany({ select: { id: true, name: true, isActive: true, _count: { select: { members: true } } } });
  for (const portal of portals) {
    const admins = await prisma.portalMember.count({ where: { portalId: portal.id, isAdmin: true } });
    if (admins < 1) problems.push(`门户 ${portal.id}（${portal.name}）没有门户管理员`);
    const setting = await prisma.setting.findUnique({ where: { portalId: portal.id }, select: { portalId: true } });
    if (!setting) problems.push(`门户 ${portal.id}（${portal.name}）缺少设置行`);
  }
  const summary = { systemAdmins, portals: portals.length, activePortals: portals.filter((portal) => portal.isActive).length };
  log({ action: "check-system-admin", ...summary, problems });
  if (problems.length) {
    console.error(`✗ 检查未通过：\n  - ${problems.join("\n  - ")}`);
    exitCode = 1;
    return;
  }
  console.log(`✓ 系统主管理员 ${systemAdmins} 位；门户 ${portals.length} 个（启用 ${summary.activePortals}），每个门户都有管理员。`);
}

function readHiddenInput(prompt) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
      reject(new Error("reset-password 需要在交互式终端里运行（隐藏输入），不接受命令行明文密码"));
      return;
    }
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const originalWrite = rl._writeToOutput;
    rl._writeToOutput = function writeToOutput(text) {
      if (text.includes(prompt)) originalWrite.call(rl, prompt);
    };
    rl.question(prompt, (answer) => {
      rl._writeToOutput = originalWrite;
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

async function resetPassword() {
  const staffId = requireStaffIdOption();
  const target = await prisma.staff.findUnique({ where: { id: staffId }, select: { id: true, username: true } });
  if (!target) throw new Error(`账号 ${staffId} 不存在`);
  const first = await readHiddenInput(`为账号 ${target.username} 输入新密码：`);
  const second = await readHiddenInput("再次输入新密码：");
  if (first !== second) throw new Error("两次输入不一致");
  if (first.length < 8 || first.length > 128) throw new Error("密码长度必须在 8–128 位之间");
  await prisma.$transaction(async (tx) => {
    await lockStaff(tx, [staffId]);
    await tx.staff.update({ where: { id: staffId }, data: { passwordHash: hashPassword(first), sessionTokenHash: null, sessionExpiresAt: null } });
    await tx.staffSession.deleteMany({ where: { staffId } });
  });
  log({ action: "reset-password", targetStaffId: staffId, targetUsername: target.username, sessionsRevoked: true, result: "ok" });
  console.log(`✓ 已重置 ${target.username} 的密码并撤销其全部登录会话。`);
}

async function updateIdentity() {
  const staffId = requireStaffIdOption();
  const patch = {};
  if (options.name !== undefined) {
    const name = String(options.name).trim();
    if (!name || name.length > 80 || /[ -]/.test(name)) throw new Error("姓名不合法（1–80 个字符）");
    patch.name = name;
  }
  if (options.username !== undefined) {
    const username = String(options.username).trim();
    if (!username || username.length > 64 || /[ -]/.test(username)) throw new Error("用户名不合法（1–64 个字符）");
    patch.username = username;
  }
  if (options.email !== undefined) {
    const email = String(options.email).trim();
    if (email.length > 191 || /[ -\s]/.test(email)) throw new Error("邮箱不合法");
    patch.email = email;
  }
  if (options["is-system-admin"] !== undefined || options.isSystemAdmin !== undefined) throw new Error("update-identity 不接受 isSystemAdmin");
  if (!Object.keys(patch).length) throw new Error("至少提供 --name / --username / --email 之一");
  await prisma.$transaction(async (tx) => {
    const locked = await lockStaff(tx, [staffId]);
    if (!locked.length) throw new Error(`账号 ${staffId} 不存在`);
    if (patch.username) {
      const owner = await tx.staff.findUnique({ where: { username: patch.username }, select: { id: true } });
      if (owner && owner.id !== staffId) throw new Error("用户名已被其他账号使用");
    }
    await tx.staff.update({ where: { id: staffId }, data: { ...patch, sessionTokenHash: null, sessionExpiresAt: null } });
    await tx.staffSession.deleteMany({ where: { staffId } });
  });
  log({ action: "update-identity", targetStaffId: staffId, fields: Object.keys(patch), sessionsRevoked: true, result: "ok" });
  console.log(`✓ 已更新账号 ${staffId} 的全局资料（${Object.keys(patch).join(", ")}）并撤销其会话。`);
}
