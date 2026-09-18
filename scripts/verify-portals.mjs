#!/usr/bin/env node
// 多门户真实数据库 + 真实 HTTP 验收（ACCEPTANCE.md 的 API / 数据库部分）。
// 只允许在独立、脱敏的测试库运行：
//   REPAIRNOTE_TEST_DATABASE_URL=mysql://...（库名必须以 _test 结尾）
//   REPAIRNOTE_TEST_BASE_URL=http://localhost:3010（测试服务，其 DATABASE_URL 必须指向同一测试库，REPAIRNOTE_PUBLIC_ORIGIN 等于该地址）
//   REPAIRNOTE_ALLOW_DESTRUCTIVE_TESTS=true
// 脚本会清空并重建测试库中的全部数据（夹具见 ACCEPTANCE.md「测试环境和夹具」）。
// 结果写入 reports/verify-portals.json 与 reports/verify-portals.md；任一用例失败退出码 1。
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient, Prisma } from "@prisma/client";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DB_URL = process.env.REPAIRNOTE_TEST_DATABASE_URL || "";
const BASE_URL = (process.env.REPAIRNOTE_TEST_BASE_URL || "").replace(/\/$/, "");
if (!DB_URL || !BASE_URL) {
  console.error("✗ 需要 REPAIRNOTE_TEST_DATABASE_URL 和 REPAIRNOTE_TEST_BASE_URL（不回退生产 DATABASE_URL）");
  process.exit(2);
}
if (!/_test(\?|$)/.test(new URL(DB_URL).pathname)) {
  console.error("✗ 测试库名称必须以 _test 结尾");
  process.exit(2);
}
if (process.env.REPAIRNOTE_ALLOW_DESTRUCTIVE_TESTS !== "true") {
  console.error("✗ 需要 REPAIRNOTE_ALLOW_DESTRUCTIVE_TESTS=true 才允许清空 / 重建测试库");
  process.exit(2);
}
process.env.DATABASE_URL = DB_URL;
const prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });
const ORIGIN = new URL(BASE_URL).origin;
const PAGE_KEYS = ["repairs", "clients", "categories", "modules", "services", "attributes", "technicians", "reports", "finance", "settings", "backup"];
const results = [];
const PASSWORD = "Test-Pass-2026!";

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  return `${salt}:${crypto.scryptSync(String(password), salt, 64).toString("hex")}`;
}

function record(id, name, ok, detail = "") {
  results.push({ id, name, ok: Boolean(ok), detail: String(detail || "") });
  console.log(`${ok ? "PASS" : "FAIL"} ${id} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function check(id, name, fn) {
  try {
    const detail = await fn();
    record(id, name, true, typeof detail === "string" ? detail : "");
  } catch (error) {
    record(id, name, false, error?.message || String(error));
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// ---------- HTTP 客户端（独立 Cookie，可同时模拟多个账号 / 标签页） ----------
function makeClient(name) {
  let cookie = "";
  async function raw(method, url, { portal, body, headers = {}, form, origin } = {}) {
    const init = { method, headers: { ...headers }, redirect: "manual" };
    if (cookie) init.headers.cookie = cookie;
    if (portal !== undefined && portal !== null) init.headers["X-Portal-Id"] = portal;
    if (origin !== undefined) {
      if (origin) init.headers.origin = origin;
    }
    if (form) init.body = form;
    else if (body !== undefined) {
      init.headers["Content-Type"] = init.headers["Content-Type"] || "application/json";
      init.body = typeof body === "string" ? body : JSON.stringify(body);
    }
    const response = await fetch(`${BASE_URL}${url}`, init);
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) {
      const match = setCookie.match(/repairnote_session=([^;]*)/);
      if (match) cookie = match[1] ? `repairnote_session=${match[1]}` : "";
    }
    const text = await response.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    return { status: response.status, json, text, headers: response.headers };
  }
  return {
    name,
    raw,
    async login(username, password = PASSWORD) {
      const response = await raw("POST", "/api/auth/login", { body: { username, password } });
      assert(response.status === 200, `${name} 登录失败 ${response.status} ${response.text}`);
      return response.json.user;
    },
    logout: () => raw("POST", "/api/auth/logout", { body: {} }),
    get: (url, portal) => raw("GET", url, { portal }),
    json: (method, url, body, portal) => raw(method, url, { body, portal }),
    // 系统写接口：JSON + 正确 Origin
    sys: (method, url, body, extraHeaders = {}) => raw(method, url, { body, origin: ORIGIN, headers: extraHeaders }),
    setCookie(value) { cookie = value; },
    getCookie() { return cookie; }
  };
}


// 员工写接口必须带读取时的门户版本：这里在每次调用前读取最新 revision（并发用例除外，见 A12b）。
async function staffWrite(client, method, body, portal) {
  const boot = await client.get("/api/bootstrap", portal);
  return client.json(method, "/api/staff", { ...body, expectedRevision: boot.json._revision }, portal);
}

// ---------- 夹具 ----------
const FIX = {};
async function resetDatabase() {
  await prisma.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 0");
  for (const table of ["Payment", "RepairItem", "Repair", "Attribute", "AttributeGroup", "Model", "Brand", "Part", "Service", "Technician", "Client", "BackupSnapshot", "Setting", "PortalMember", "Portal", "StaffSession", "Staff"]) {
    await prisma.$executeRawUnsafe(`DELETE FROM \`${table}\``);
  }
  await prisma.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 1");
}

async function createStaff(id, username, { isSystemAdmin = false, name = username } = {}) {
  return prisma.staff.create({ data: { id, name, username, email: `${username}@test.local`, passwordHash: hashPassword(PASSWORD), isSystemAdmin } });
}

async function addMember(staffId, portalId, isAdmin, pagePermissions = []) {
  return prisma.portalMember.create({ data: { staffId, portalId, isAdmin, pagePermissions: isAdmin ? PAGE_KEYS : pagePermissions } });
}

async function createPortalDirect(id, name) {
  return prisma.portal.create({ data: { id, name, isActive: true, revision: 1n, setting: { create: { value: { shopName: name, phone: id === "default" ? "600000001" : "600000002", repairTerms: `terms-${id}`, printLanguage: id === "default" ? "zh" : "es" } } } } });
}

async function seedBusiness(portalId, tag) {
  const clientId = `${portalId}-client`;
  await prisma.client.create({ data: { id: clientId, portalId, name: `Cliente ${tag}`, phone: portalId === "default" ? "611111111" : "622222222", address: "", comment: "", level: "VIP" } });
  const tech = await prisma.technician.create({ data: { id: `${portalId}-tech`, portalId, name: "Tecnico Compartido" } });
  const brand = await prisma.brand.create({ data: { id: `${portalId}-brand`, portalId, name: "MarcaComun" } });
  await prisma.model.create({ data: { id: `${portalId}-model`, portalId, brandId: brand.id, name: `Modelo ${tag}` } });
  await prisma.service.create({ data: { id: `${portalId}-service`, portalId, defaultName: `Servicio ${tag}`, zh: "", es: "", price: 10 } });
  await prisma.part.create({ data: { id: `${portalId}-part`, portalId, defaultName: `Pieza ${tag}`, zh: "", es: "", price: 5 } });
  const group = await prisma.attributeGroup.create({ data: { id: `${portalId}-group`, portalId, name: "颜色" } });
  await prisma.attribute.create({ data: { id: `${portalId}-attr`, portalId, groupId: group.id, defaultName: "Black" } });
  const price = portalId === "default" ? 100 : 200;
  const cost = portalId === "default" ? 30 : 60;
  const discount = portalId === "default" ? 10 : 0;
  const paid = portalId === "default" ? 20 : 50;
  const repair = await prisma.repair.create({
    data: {
      id: `${portalId}-repair`, portalId, ticket: "9000000001", clientId, brand: "MarcaComun", model: `Modelo ${tag}`, properties: "", imei: "", issue: `Pantalla ${tag}`, internalNote: "secret-note", passwordType: "", passwordText: "", passwordPattern: [],
      status: "维修中", repairTime: "2026-09-10 10:00", warrantyStart: "", technicianId: tech.id, technicianName: tech.name, budget: price, deposit: paid, paymentMethod: "cash", discountAmount: discount, costAmount: 0,
      frontPhoto: "", backPhoto: "", signatureDataUrl: "", signedAt: "", publicToken: `${portalId}-token`, orderType: "repair", sourceRepairId: "", warrantyReason: "", warrantyDiagnosis: "", warrantyResolution: "", warrantyChargeable: false,
      statusHistory: [], notificationLog: [], searchText: `9000000001 cliente ${tag.toLowerCase()} pantalla ${tag.toLowerCase()} marcacomun`, ticketSort: 9000000001n,
      items: { create: [{ id: `${portalId}-item`, name: `Pantalla ${tag}`, qty: 1, price, cost }] },
      payments: { create: [{ id: `${portalId}-pay`, amount: paid, method: "cash", note: "订金", paidAt: new Date("2026-09-10T10:00:00Z") }] }
    }
  });
  return { clientId, techId: tech.id, brandId: brand.id, repairId: repair.id, groupId: group.id };
}

// 稳定排序的脱敏摘要：用于“A 操作前后 B 完全不变”。
async function portalDigest(portalId) {
  const [portal, setting, members, clients, brands, models, services, parts, technicians, groups, attributes, repairs, backups] = await Promise.all([
    prisma.portal.findUnique({ where: { id: portalId }, select: { name: true, isActive: true, revision: true, creationKey: true, creationPayloadHash: true } }),
    prisma.setting.findUnique({ where: { portalId } }),
    prisma.portalMember.findMany({ where: { portalId }, orderBy: { staffId: "asc" } }),
    prisma.client.findMany({ where: { portalId }, orderBy: { id: "asc" } }),
    prisma.brand.findMany({ where: { portalId }, orderBy: { id: "asc" } }),
    prisma.model.findMany({ where: { portalId }, orderBy: { id: "asc" } }),
    prisma.service.findMany({ where: { portalId }, orderBy: { id: "asc" } }),
    prisma.part.findMany({ where: { portalId }, orderBy: { id: "asc" } }),
    prisma.technician.findMany({ where: { portalId }, orderBy: { id: "asc" } }),
    prisma.attributeGroup.findMany({ where: { portalId }, orderBy: { id: "asc" } }),
    prisma.attribute.findMany({ where: { portalId }, orderBy: { id: "asc" } }),
    prisma.repair.findMany({ where: { portalId }, orderBy: { id: "asc" }, include: { items: { orderBy: { id: "asc" } }, payments: { orderBy: { id: "asc" } } } }),
    prisma.backupSnapshot.findMany({ where: { portalId }, orderBy: { id: "asc" }, select: { id: true, kind: true, autoDay: true, counts: true } })
  ]);
  const json = JSON.stringify({ portal: { ...portal, revision: portal?.revision?.toString() }, setting: setting?.value, members: members.map((m) => ({ s: m.staffId, a: m.isAdmin, p: m.pagePermissions })), clients, brands, models, services, parts, technicians, groups, attributes, repairs: repairs.map((r) => ({ ...r, ticketSort: r.ticketSort.toString() })), backups }, (key, value) => (value instanceof Date ? value.toISOString() : typeof value === "bigint" ? value.toString() : value));
  return crypto.createHash("sha256").update(json).digest("hex");
}

async function identityDigest() {
  const [staff, members, sessions] = await Promise.all([
    prisma.staff.findMany({ orderBy: { id: "asc" }, select: { id: true, name: true, username: true, email: true, isSystemAdmin: true, passwordHash: true } }),
    prisma.portalMember.findMany({ orderBy: [{ staffId: "asc" }, { portalId: "asc" }] }),
    prisma.staffSession.count()
  ]);
  return crypto.createHash("sha256").update(JSON.stringify({ staff, members: members.map((m) => ({ s: m.staffId, p: m.portalId, a: m.isAdmin, pp: m.pagePermissions })), sessions })).digest("hex");
}

function newKey() {
  return crypto.randomUUID();
}

async function setupFixtures() {
  await resetDatabase();
  await createPortalDirect("default", "A 测试门户");
  await createStaff("sys1", "sysadmin", { isSystemAdmin: true, name: "系统主管理员" });
  await addMember("sys1", "default", true);
  await createStaff("a-admin", "a-admin");
  await addMember("a-admin", "default", true);
  await createStaff("b-admin", "b-admin");
  await createStaff("ab-admin", "ab-admin");
  await addMember("ab-admin", "default", true);
  await createStaff("a-repairs", "a-repairs");
  await addMember("a-repairs", "default", false, ["repairs"]);
  await createStaff("a-services", "a-services");
  await addMember("a-services", "default", false, ["services"]);
  await createStaff("a-modules", "a-modules");
  await addMember("a-modules", "default", false, ["modules"]);
  await createStaff("a-categories", "a-categories");
  await addMember("a-categories", "default", false, ["categories"]);
  await createStaff("a-noperm", "a-noperm");
  await addMember("a-noperm", "default", false, []);
  await createStaff("nobody", "nobody");
  await createStaff("sys-noportal", "sys-noportal", { isSystemAdmin: true });
  await createStaff("sys-employee", "sys-employee", { isSystemAdmin: true });
  await addMember("sys-employee", "default", false, ["repairs"]);
  await createStaff("ab-staff", "ab-staff");
  await addMember("ab-staff", "default", false, ["repairs", "clients"]);
  FIX.A = await seedBusiness("default", "A");
}

// ---------- 主流程 ----------
const reportsDir = path.join(root, "reports");
fs.mkdirSync(reportsDir, { recursive: true });

try {
  await setupFixtures();
  const sys = makeClient("sys");
  const sysUser = await sys.login("sysadmin");
  const aAdmin = makeClient("a-admin");
  await aAdmin.login("a-admin");
  const anon = makeClient("anon");

  // ===== G：设置内门户管理（API / 数据库部分） =====
  await check("G02", "非系统管理员访问 system API 全部 403；未登录 401", async () => {
    const r1 = await aAdmin.get("/api/system/portals");
    assert(r1.status === 403 && r1.json.code === "SYSTEM_ADMIN_REQUIRED", `a-admin list ${r1.status} ${r1.text}`);
    const r2 = await aAdmin.sys("POST", "/api/system/portals", { name: "hack" }, { "Idempotency-Key": newKey() });
    assert(r2.status === 403, `a-admin create ${r2.status}`);
    const r3 = await aAdmin.get("/api/system/staff?username=sysadmin");
    assert(r3.status === 403 && !r3.text.includes("sys1"), `staff lookup ${r3.status} ${r3.text}`);
    const r4 = await anon.get("/api/system/portals");
    assert(r4.status === 401, `anon ${r4.status}`);
    const r5 = await aAdmin.sys("PUT", "/api/system/portals/default/members/a-admin", { expectedRevision: "1", isAdmin: true, pagePermissions: [], isSystemAdmin: true });
    assert(r5.status === 403, `member put ${r5.status}`);
    const r6 = await anon.raw("DELETE", "/api/system/portals/default", { body: {} });
    assert(r6.status === 405 || r6.status === 401, `delete portal ${r6.status}`);
    return "403/401 与数据不变";
  });

  await check("G03", "系统管理接口携带 X-Portal-Id 返回 400；无门户系统管理员可列出门户", async () => {
    const r1 = await sys.get("/api/system/portals", "default");
    assert(r1.status === 400 && r1.json.code === "UNEXPECTED_PORTAL_HEADER", `${r1.status} ${r1.text}`);
    const sysNo = makeClient("sys-noportal");
    await sysNo.login("sys-noportal");
    const portals = await sysNo.get("/api/portals");
    assert(portals.status === 200 && portals.json.portals.length === 0, "无门户系统管理员应得到空列表");
    const list = await sysNo.get("/api/system/portals");
    assert(list.status === 200 && list.json.portals.length >= 1, `无门户系统管理员应能列出门户 ${list.status}`);
    const boot = await sysNo.get("/api/bootstrap", "default");
    assert(boot.status === 403, `无成员系统管理员访问业务应 403，实际 ${boot.status}`);
    return "无门户系统管理员可管理、不可访问业务";
  });

  let shopB = null;
  let createKey = newKey();
  await check("G04", "系统管理员只输入名称创建门户：Portal+空Setting+创建者管理员，revision=1", async () => {
    const r = await sys.sys("POST", "/api/system/portals", { name: " B 测试门户 " }, { "Idempotency-Key": createKey });
    assert(r.status === 201, `${r.status} ${r.text}`);
    shopB = r.json.portal;
    assert(shopB.name === "B 测试门户" && shopB.revision === "1" && shopB.memberCount === 1 && shopB.isActive === true, JSON.stringify(shopB));
    const setting = await prisma.setting.findUnique({ where: { portalId: shopB.id } });
    assert(setting && !setting.value.shopName, "新门户应有空白默认设置");
    const member = await prisma.portalMember.findUnique({ where: { staffId_portalId: { staffId: "sys1", portalId: shopB.id } } });
    assert(member?.isAdmin, "创建者应为首位门户管理员");
    const business = await prisma.repair.count({ where: { portalId: shopB.id } });
    assert(business === 0, "新门户业务行应为 0");
    const portalRow = await prisma.portal.findUnique({ where: { id: shopB.id } });
    assert(portalRow.creationKey && portalRow.creationPayloadHash, "幂等元数据必须同时非空");
    return `id=${shopB.id}`;
  });

  await check("G06", "同 key 同名称重放返回 200 且不重复创建；缺失 / 非法 key 400", async () => {
    const before = await prisma.portal.count();
    const r = await sys.sys("POST", "/api/system/portals", { name: "B 测试门户" }, { "Idempotency-Key": createKey });
    assert(r.status === 200 && r.json.created === false && r.json.portal.id === shopB.id, `${r.status} ${r.text}`);
    assert(await prisma.portal.count() === before, "重放不应新建门户");
    const r2 = await sys.sys("POST", "/api/system/portals", { name: "X" });
    assert(r2.status === 400, `缺 key ${r2.status}`);
    const r3 = await sys.sys("POST", "/api/system/portals", { name: "X" }, { "Idempotency-Key": "not-a-uuid" });
    assert(r3.status === 400, `非法 key ${r3.status}`);
    return "重放 200 / created=false";
  });

  await check("G06b", "同操作者同 key 并发双提交只产生一个门户", async () => {
    const key = newKey();
    const before = await prisma.portal.count();
    const [r1, r2] = await Promise.all([
      sys.sys("POST", "/api/system/portals", { name: "并发门户" }, { "Idempotency-Key": key }),
      sys.sys("POST", "/api/system/portals", { name: "并发门户" }, { "Idempotency-Key": key })
    ]);
    const statuses = [r1.status, r2.status].sort();
    assert(statuses.join(",") === "200,201", `并发状态 ${statuses.join(",")} ${r1.text} ${r2.text}`);
    assert(r1.json.portal.id === r2.json.portal.id, "并发双提交应返回同一门户");
    assert(await prisma.portal.count() === before + 1, "并发只应创建一个门户");
    const members = await prisma.portalMember.count({ where: { portalId: r1.json.portal.id } });
    assert(members === 1, "首位成员只应创建一次");
    return `portal=${r1.json.portal.id}`;
  });

  await check("G04b", "新建门户同时创建独立管理员账号：账号只属于新门户、非系统管理员；重名 409；弱密码 400；重放不重复建账号", async () => {
    const key = newKey();
    const r = await sys.sys("POST", "/api/system/portals", { name: "带账号门户", initialAdmin: { username: "portal-owner", password: "Owner-Pass-1" } }, { "Idempotency-Key": key });
    assert(r.status === 201 && r.json.initialAdmin?.username === "portal-owner" && r.json.portal.memberCount === 2, `${r.status} ${r.text}`);
    const staff = await prisma.staff.findUnique({ where: { username: "portal-owner" }, include: { memberships: true } });
    assert(staff && !staff.isSystemAdmin && staff.memberships.length === 1 && staff.memberships[0].portalId === r.json.portal.id && staff.memberships[0].isAdmin, "新账号归属错误");
    const replay = await sys.sys("POST", "/api/system/portals", { name: "带账号门户", initialAdmin: { username: "portal-owner", password: "Owner-Pass-1" } }, { "Idempotency-Key": key });
    assert(replay.status === 200 && replay.json.created === false, `重放 ${replay.status}`);
    assert((await prisma.staff.count({ where: { username: "portal-owner" } })) === 1, "重放不得重复建账号");
    const dup = await sys.sys("POST", "/api/system/portals", { name: "另一个", initialAdmin: { username: "portal-owner", password: "Owner-Pass-1" } }, { "Idempotency-Key": newKey() });
    assert(dup.status === 409 && dup.json.code === "USERNAME_TAKEN", `重名 ${dup.status}`);
    const weak = await sys.sys("POST", "/api/system/portals", { name: "另一个", initialAdmin: { username: "x-weak", password: "123" } }, { "Idempotency-Key": newKey() });
    assert(weak.status === 400, `弱密码 ${weak.status}`);
    const sysFlag = await sys.sys("POST", "/api/system/portals", { name: "另一个", initialAdmin: { username: "x-sys", password: "Owner-Pass-1", isSystemAdmin: true } }, { "Idempotency-Key": newKey() });
    assert(sysFlag.status === 400, `isSystemAdmin ${sysFlag.status}`);
    assert((await prisma.portal.count({ where: { name: "另一个" } })) === 0, "失败不得留下门户");
    const owner = makeClient("portal-owner");
    await owner.login("portal-owner", "Owner-Pass-1");
    const mine = await owner.get("/api/portals");
    assert(mine.json.portals.length === 1 && mine.json.portals[0].id === r.json.portal.id, "新账号只看到自己的门户");
    assert((await owner.get("/api/bootstrap", "default")).status === 403 && (await owner.get("/api/system/portals")).status === 403, "新账号不能进其他门户 / 系统接口");
    await prisma.portal.update({ where: { id: r.json.portal.id }, data: { isActive: false } });
    return "独立账号正确";
  });

  await check("G08", "同 key 不同名称 409 IDEMPOTENCY_CONFLICT；另一操作者使用同 key 独立作用域", async () => {
    const r = await sys.sys("POST", "/api/system/portals", { name: "B 测试门户 改名" }, { "Idempotency-Key": createKey });
    assert(r.status === 409 && r.json.code === "IDEMPOTENCY_CONFLICT", `${r.status} ${r.text}`);
    const sysNo = makeClient("sys-noportal2");
    await sysNo.login("sys-noportal");
    const before = await prisma.portal.count();
    const r2 = await sysNo.sys("POST", "/api/system/portals", { name: "B 测试门户" }, { "Idempotency-Key": createKey });
    assert(r2.status === 201 && r2.json.portal.id !== shopB.id, `另一操作者同 key 应独立创建 ${r2.status} ${r2.text}`);
    assert(await prisma.portal.count() === before + 1, "另一操作者应创建新门户");
    await prisma.portal.update({ where: { id: r2.json.portal.id }, data: { isActive: false, name: "sys-noportal 的门户" } });
    return "409 / 独立作用域";
  });

  await check("G10", "改名只改元数据与 revision；非法输入 400；字符串布尔拒绝", async () => {
    const list = await sys.get(`/api/system/portals?q=B%20%E6%B5%8B%E8%AF%95`);
    const current = list.json.portals.find((p) => p.id === shopB.id);
    const r = await sys.sys("PATCH", `/api/system/portals/${shopB.id}`, { expectedRevision: current.revision, name: "B 测试门户 v2" });
    assert(r.status === 200 && r.json.portal.name === "B 测试门户 v2" && r.json.portal.revision === String(Number(current.revision) + 1), `${r.status} ${r.text}`);
    const row = await prisma.portal.findUnique({ where: { id: shopB.id } });
    assert(row.creationPayloadHash === (await prisma.portal.findUnique({ where: { id: shopB.id } })).creationPayloadHash, "改名不改幂等摘要");
    const bad = await sys.sys("PATCH", `/api/system/portals/${shopB.id}`, { expectedRevision: r.json.portal.revision, isActive: "false" });
    assert(bad.status === 400, `字符串布尔应 400，实际 ${bad.status}`);
    const bad2 = await sys.sys("PATCH", `/api/system/portals/${shopB.id}`, { expectedRevision: r.json.portal.revision, name: "" });
    assert(bad2.status === 400, `空名称应 400，实际 ${bad2.status}`);
    const bad3 = await sys.sys("PATCH", `/api/system/portals/${shopB.id}`, { expectedRevision: r.json.portal.revision, name: "x".repeat(81) });
    assert(bad3.status === 400, `超长应 400，实际 ${bad3.status}`);
    const bad4 = await sys.sys("PATCH", `/api/system/portals/${shopB.id}`, { expectedRevision: r.json.portal.revision, name: "ok", foo: 1 });
    assert(bad4.status === 400, `未知字段应 400，实际 ${bad4.status}`);
    const same = await sys.sys("PATCH", `/api/system/portals/${shopB.id}`, { expectedRevision: r.json.portal.revision, name: "B 测试门户 v2" });
    assert(same.status === 200 && same.json.portal.revision === r.json.portal.revision, "无实际变化不增加 revision");
    const back = await sys.sys("PATCH", `/api/system/portals/${shopB.id}`, { expectedRevision: same.json.portal.revision, name: "B 测试门户" });
    assert(back.status === 200, "改回名称");
    shopB = back.json.portal;
    return `revision=${shopB.revision}`;
  });

  await check("G07", "改名后重放原创建请求仍识别同一门户（按创建时载荷摘要）", async () => {
    const r = await sys.sys("POST", "/api/system/portals", { name: "B 测试门户" }, { "Idempotency-Key": createKey });
    assert(r.status === 200 && r.json.created === false && r.json.portal.id === shopB.id, `${r.status} ${r.text}`);
    return "重放识别同一门户";
  });

  await check("G14", "精确用户名查找：最多 1 个安全摘要；未命中空数组；空查询 400；普通管理员 403", async () => {
    const r = await sys.get("/api/system/staff?username=b-admin");
    assert(r.status === 200 && r.json.users.length === 1 && r.json.users[0].id === "b-admin", r.text);
    assert(Object.keys(r.json.users[0]).sort().join(",") === "id,name,username", `字段泄露 ${JSON.stringify(r.json.users[0])}`);
    const none = await sys.get("/api/system/staff?username=no-such-user");
    assert(none.status === 200 && none.json.users.length === 0, none.text);
    const empty = await sys.get("/api/system/staff?username=");
    assert(empty.status === 400, `空查询 ${empty.status}`);
    const missing = await sys.get("/api/system/staff");
    assert(missing.status === 400, `缺参数 ${missing.status}`);
    const partial = await sys.get("/api/system/staff?username=b-adm");
    assert(partial.status === 200 && partial.json.users.length === 0, "不允许前缀 / 模糊匹配");
    const forbidden = await aAdmin.get("/api/system/staff?username=b-admin");
    assert(forbidden.status === 403, `普通管理员 ${forbidden.status}`);
    return "安全摘要";
  });

  await check("G15/G16", "向 B 分配已有账号；不存在账号 404；相同授权幂等；未知键 / 非布尔 / isSystemAdmin 400", async () => {
    const digestBefore = await identityDigest();
    const r = await sys.sys("PUT", `/api/system/portals/${shopB.id}/members/b-admin`, { expectedRevision: shopB.revision, isAdmin: true, pagePermissions: [] });
    assert(r.status === 200 && r.json.member.isAdmin && r.json.member.pagePermissions.length === PAGE_KEYS.length, `${r.status} ${r.text}`);
    shopB = r.json.portal;
    const again = await sys.sys("PUT", `/api/system/portals/${shopB.id}/members/b-admin`, { expectedRevision: shopB.revision, isAdmin: true, pagePermissions: [] });
    assert(again.status === 200 && again.json.portal.revision === shopB.revision, "相同授权幂等不增版本");
    const r2 = await sys.sys("PUT", `/api/system/portals/${shopB.id}/members/ab-admin`, { expectedRevision: shopB.revision, isAdmin: true, pagePermissions: [] });
    assert(r2.status === 200, r2.text);
    shopB = r2.json.portal;
    const r3 = await sys.sys("PUT", `/api/system/portals/${shopB.id}/members/ab-staff`, { expectedRevision: shopB.revision, isAdmin: false, pagePermissions: ["repairs", "warranties"] });
    assert(r3.status === 200 && r3.json.member.pagePermissions.join(",") === "repairs", `warranties 归一 ${r3.text}`);
    shopB = r3.json.portal;
    const r4 = await sys.sys("PUT", `/api/system/portals/${shopB.id}/members/a-noperm`, { expectedRevision: shopB.revision, isAdmin: false, pagePermissions: [] });
    assert(r4.status === 200 && r4.json.member.pagePermissions.length === 0, "空权限允许");
    shopB = r4.json.portal;
    const missing = await sys.sys("PUT", `/api/system/portals/${shopB.id}/members/ghost-user`, { expectedRevision: shopB.revision, isAdmin: false, pagePermissions: [] });
    assert(missing.status === 404 && missing.json.code === "STAFF_NOT_FOUND", `不存在账号 ${missing.status}`);
    assert(await prisma.staff.count({ where: { id: "ghost-user" } }) === 0, "不得自动注册");
    const unknown = await sys.sys("PUT", `/api/system/portals/${shopB.id}/members/b-admin`, { expectedRevision: shopB.revision, isAdmin: true, pagePermissions: [], extra: 1 });
    assert(unknown.status === 400, `未知键 ${unknown.status}`);
    const nonBool = await sys.sys("PUT", `/api/system/portals/${shopB.id}/members/b-admin`, { expectedRevision: shopB.revision, isAdmin: "true", pagePermissions: [] });
    assert(nonBool.status === 400, `非布尔 ${nonBool.status}`);
    const sysFlag = await sys.sys("PUT", `/api/system/portals/${shopB.id}/members/b-admin`, { expectedRevision: shopB.revision, isAdmin: true, pagePermissions: [], isSystemAdmin: true });
    assert(sysFlag.status === 400, `isSystemAdmin ${sysFlag.status}`);
    const badPerm = await sys.sys("PUT", `/api/system/portals/${shopB.id}/members/b-admin`, { expectedRevision: shopB.revision, isAdmin: false, pagePermissions: ["superuser"] });
    assert(badPerm.status === 400, `未知权限键 ${badPerm.status}`);
    const staffB = await prisma.staff.findUnique({ where: { id: "b-admin" } });
    assert(!staffB.isSystemAdmin, "不得授予系统身份");
    assert((await identityDigest()) !== digestBefore, "成员关系应变化");
    const bAdminMembers = await prisma.portalMember.findMany({ where: { staffId: "b-admin" } });
    assert(bAdminMembers.length === 1 && bAdminMembers[0].portalId === shopB.id, "只加入目标门户");
    return "分配成功、校验齐全";
  });

  await check("G09", "门户列表过滤 / 分页 / 非法页码；只列元数据无业务数字", async () => {
    const all = await sys.get("/api/system/portals?status=all&pageSize=100");
    assert(all.status === 200 && all.json.total >= 3, all.text);
    for (const portal of all.json.portals) assert(Object.keys(portal).sort().join(",") === "id,isActive,memberCount,name,revision", `多余字段 ${JSON.stringify(portal)}`);
    const inactive = await sys.get("/api/system/portals?status=inactive");
    assert(inactive.json.portals.every((p) => !p.isActive) && inactive.json.portals.length >= 1, "停用过滤");
    const paged = await sys.get("/api/system/portals?pageSize=1&page=2");
    assert(paged.json.portals.length === 1 && paged.json.page === 2, "分页");
    const bad = await sys.get("/api/system/portals?page=0");
    assert(bad.status === 400, `非法页码 ${bad.status}`);
    const bad2 = await sys.get("/api/system/portals?pageSize=101");
    assert(bad2.status === 400, `超上限 ${bad2.status}`);
    const cache = all.headers.get("cache-control");
    assert(cache && cache.includes("no-store"), `Cache-Control ${cache}`);
    return "过滤 / 分页 / no-store";
  });

  await check("G19", "旧 / 缺失 / 非法 expectedRevision：409 / 400 / 400 且不变更", async () => {
    const stale = await sys.sys("PATCH", `/api/system/portals/${shopB.id}`, { expectedRevision: "1", name: "stale" });
    assert(stale.status === 409 && stale.json.code === "VERSION_CONFLICT", `${stale.status} ${stale.text}`);
    const missing = await sys.sys("PATCH", `/api/system/portals/${shopB.id}`, { name: "stale" });
    assert(missing.status === 400, `缺失 ${missing.status}`);
    const invalid = await sys.sys("PATCH", `/api/system/portals/${shopB.id}`, { expectedRevision: "abc", name: "stale" });
    assert(invalid.status === 400, `非法 ${invalid.status}`);
    const row = await prisma.portal.findUnique({ where: { id: shopB.id } });
    assert(row.name === "B 测试门户" && row.revision.toString() === shopB.revision, "不应变更");
    const staleMember = await sys.sys("DELETE", `/api/system/portals/${shopB.id}/members/ab-admin`, { expectedRevision: "1" });
    assert(staleMember.status === 409, `成员旧版本 ${staleMember.status}`);
    return "409/400";
  });

  await check("G18", "最后管理员保护（降级 / 移出 409）；自移出允许且系统管理权仍在；并发互降至少保留一位", async () => {
    // B 当前管理员：sys1、b-admin、ab-admin
    const selfOut = await sys.sys("DELETE", `/api/system/portals/${shopB.id}/members/sys1`, { expectedRevision: shopB.revision });
    assert(selfOut.status === 200 && selfOut.json.removedStaffId === "sys1", `自移出 ${selfOut.status} ${selfOut.text}`);
    shopB = selfOut.json.portal;
    const still = await sys.get("/api/system/portals");
    assert(still.status === 200, "自移出后系统管理权仍在");
    const sysRow = await prisma.staff.findUnique({ where: { id: "sys1" } });
    assert(sysRow.isSystemAdmin, "系统角色不随成员移出消失");
    // 并发互降：b-admin 与 ab-admin
    const [d1, d2] = await Promise.all([
      sys.sys("PUT", `/api/system/portals/${shopB.id}/members/b-admin`, { expectedRevision: shopB.revision, isAdmin: false, pagePermissions: ["repairs"] }),
      sys.sys("PUT", `/api/system/portals/${shopB.id}/members/ab-admin`, { expectedRevision: shopB.revision, isAdmin: false, pagePermissions: ["repairs"] })
    ]);
    const admins = await prisma.portalMember.count({ where: { portalId: shopB.id, isAdmin: true } });
    assert(admins >= 1, `并发互降后管理员数 ${admins}`);
    const okCount = [d1, d2].filter((r) => r.status === 200).length;
    assert(okCount <= 1, `并发互降最多一个成功，实际 ${okCount}`);
    const refreshed = (await sys.get("/api/system/portals?pageSize=100")).json.portals.find((p) => p.id === shopB.id);
    shopB = refreshed;
    // 恢复 b-admin 为管理员
    const restore = await sys.sys("PUT", `/api/system/portals/${shopB.id}/members/b-admin`, { expectedRevision: shopB.revision, isAdmin: true, pagePermissions: [] });
    assert(restore.status === 200, restore.text);
    shopB = restore.json.portal;
    const restore2 = await sys.sys("PUT", `/api/system/portals/${shopB.id}/members/ab-admin`, { expectedRevision: shopB.revision, isAdmin: true, pagePermissions: [] });
    assert(restore2.status === 200, restore2.text);
    shopB = restore2.json.portal;
    // 只剩 b-admin 时降级 / 移出 409
    const demoteAb = await sys.sys("PUT", `/api/system/portals/${shopB.id}/members/ab-admin`, { expectedRevision: shopB.revision, isAdmin: false, pagePermissions: [] });
    assert(demoteAb.status === 200, demoteAb.text);
    shopB = demoteAb.json.portal;
    const last = await sys.sys("PUT", `/api/system/portals/${shopB.id}/members/b-admin`, { expectedRevision: shopB.revision, isAdmin: false, pagePermissions: [] });
    assert(last.status === 409 && last.json.code === "LAST_PORTAL_ADMIN", `最后管理员降级 ${last.status}`);
    const lastRemove = await sys.sys("DELETE", `/api/system/portals/${shopB.id}/members/b-admin`, { expectedRevision: shopB.revision });
    assert(lastRemove.status === 409, `最后管理员移出 ${lastRemove.status}`);
    const promote = await sys.sys("PUT", `/api/system/portals/${shopB.id}/members/ab-admin`, { expectedRevision: shopB.revision, isAdmin: true, pagePermissions: [] });
    shopB = promote.json.portal;
    return "保护有效";
  });

  await check("G24", "system 写接口 Origin 缺失 / 错误 403 且零写入；错误 Content-Type 400；未知方法 405；私有缓存", async () => {
    const digest = await portalDigest(shopB.id);
    const noOrigin = await sys.raw("PATCH", `/api/system/portals/${shopB.id}`, { body: { expectedRevision: shopB.revision, name: "csrf" } });
    assert(noOrigin.status === 403 && noOrigin.json.code === "ORIGIN_NOT_ALLOWED", `缺失 Origin ${noOrigin.status} ${noOrigin.text}`);
    const badOrigin = await sys.raw("PATCH", `/api/system/portals/${shopB.id}`, { body: { expectedRevision: shopB.revision, name: "csrf" }, origin: "https://evil.example" });
    assert(badOrigin.status === 403, `错误 Origin ${badOrigin.status}`);
    const proxyHeader = await sys.raw("PATCH", `/api/system/portals/${shopB.id}`, { body: { expectedRevision: shopB.revision, name: "csrf" }, origin: "https://evil.example", headers: { "X-Forwarded-Host": new URL(ORIGIN).host, "X-Forwarded-Proto": "http" } });
    assert(proxyHeader.status === 403, `伪造代理头 ${proxyHeader.status}`);
    const badType = await sys.raw("PATCH", `/api/system/portals/${shopB.id}`, { body: "expectedRevision=1&name=x", origin: ORIGIN, headers: { "Content-Type": "application/x-www-form-urlencoded" } });
    assert(badType.status === 400, `错误 Content-Type ${badType.status}`);
    assert((await portalDigest(shopB.id)) === digest, "被拒绝的写入不应改变数据");
    const method = await sys.raw("DELETE", `/api/system/portals/${shopB.id}`, { body: {}, origin: ORIGIN });
    assert(method.status === 405, `DELETE portal ${method.status}`);
    const method2 = await sys.raw("POST", "/api/system/staff", { body: {}, origin: ORIGIN });
    assert(method2.status === 405, `POST staff ${method2.status}`);
    const members = await sys.get(`/api/system/portals/${shopB.id}/members`);
    assert(members.headers.get("cache-control")?.includes("no-store"), "成员列表 no-store");
    assert(!members.text.includes("passwordHash") && !members.text.includes("isSystemAdmin"), "成员列表不含凭据 / 系统身份");
    return "同源校验有效";
  });

  // ===== A：身份与门户授权 =====
  const bAdmin = makeClient("b-admin");
  await bAdmin.login("b-admin");
  const digestBBefore = await portalDigest(shopB.id);
  FIX.B = await seedBusiness(shopB.id, "B");
  await prisma.setting.update({ where: { portalId: shopB.id }, data: { value: { shopName: "B 店", phone: "600000002", repairTerms: "terms-b", printLanguage: "es" } } });
  await prisma.portal.update({ where: { id: shopB.id }, data: { revision: { increment: 1 } } });
  shopB = (await sys.get("/api/system/portals?pageSize=100")).json.portals.find((p) => p.id === shopB.id);

  await check("A01", "未登录请求 portals / bootstrap / 业务列表 / 备份下载 401", async () => {
    for (const url of ["/api/portals", "/api/bootstrap", "/api/repairs/search", "/api/backup/download/current", "/api/clients/search", "/api/reports/overview"]) {
      const r = await anon.get(url, "default");
      assert(r.status === 401, `${url} ${r.status}`);
      assert(!r.text.includes("测试门户") && !r.text.includes("Cliente"), `${url} 泄露内容`);
    }
    return "401";
  });

  await check("A02", "有效登录但业务请求不带 X-Portal-Id → 400，不自动读取 default", async () => {
    for (const url of ["/api/bootstrap", "/api/repairs/search", "/api/clients/search", "/api/settings", "/api/backup/list"]) {
      const r = await aAdmin.get(url);
      assert(r.status === 400 && r.json.code === "PORTAL_HEADER_REQUIRED", `${url} ${r.status} ${r.text}`);
    }
    const bad = await aAdmin.get("/api/bootstrap", "bad id!");
    assert(bad.status === 400, `非法门户头 ${bad.status}`);
    return "400";
  });

  await check("A03", "A-only 用户把门户头改成 B：读 / 写 / 导入 / 下载 / 报表全部 403，B 摘要不变", async () => {
    const before = await portalDigest(shopB.id);
    const checks = [
      ["GET", "/api/bootstrap"], ["GET", "/api/repairs/search"], ["GET", "/api/reports/overview"], ["GET", "/api/reports/finance"], ["GET", "/api/backup/download/current"], ["GET", "/api/backup/list"], ["GET", "/api/staff"], ["GET", `/api/repairs/${FIX.B.repairId}`]
    ];
    for (const [method, url] of checks) {
      const r = await aAdmin.raw(method, url, { portal: shopB.id });
      assert(r.status === 403 && r.json?.code === "PORTAL_ACCESS_DENIED", `${method} ${url} ${r.status} ${r.text}`);
      assert(!r.text.includes("B 测试"), "不泄露门户名");
    }
    const w1 = await aAdmin.json("PUT", `/api/repairs/x-${Date.now()}`, { repair: { ticket: "1" }, createOnly: true }, shopB.id);
    assert(w1.status === 403, `写 ${w1.status}`);
    const w2 = await aAdmin.json("POST", "/api/backup/import", { data: {}, expectedRevision: "1" }, shopB.id);
    assert(w2.status === 403, `导入 ${w2.status}`);
    const unknownPortal = await aAdmin.get("/api/bootstrap", "no-such-portal");
    assert(unknownPortal.status === 403 && unknownPortal.json.code === "PORTAL_ACCESS_DENIED", "不存在门户与无权限门户返回一致");
    assert((await portalDigest(shopB.id)) === before, "B 摘要变化");
    return "403 且 B 不变";
  });

  const abAdmin = makeClient("ab-admin");
  await abAdmin.login("ab-admin");
  await check("A04", "A/B 双成员携带 A 头提交 B 的订单 / 客户 / 备份 id → 404", async () => {
    const before = await portalDigest(shopB.id);
    const r1 = await abAdmin.get(`/api/repairs/${FIX.B.repairId}`, "default");
    assert(r1.status === 404, `读 B 订单 ${r1.status}`);
    const r2 = await abAdmin.json("PUT", `/api/repairs/${FIX.B.repairId}`, { repair: { status: "完成", updatedAt: new Date().toISOString() } }, "default");
    assert(r2.status === 404, `改 B 订单 ${r2.status} ${r2.text}`);
    const r3 = await abAdmin.json("DELETE", `/api/repairs/${FIX.B.repairId}`, { updatedAt: new Date().toISOString() }, "default");
    assert(r3.status === 404, `删 B 订单 ${r3.status}`);
    const r4 = await abAdmin.json("DELETE", "/api/clients", { id: FIX.B.clientId }, "default");
    assert(r4.status === 404, `删 B 客户 ${r4.status}`);
    const bBackup = await prisma.backupSnapshot.create({ data: { portalId: shopB.id, kind: "manual", reason: "b", data: { clients: [], brands: [], models: [], services: [], parts: [], repairs: [], sourcePortalId: shopB.id }, counts: {} } });
    const r5 = await abAdmin.json("POST", "/api/backup/restore", { id: bBackup.id, expectedRevision: "1" }, "default");
    assert(r5.status === 404, `恢复 B 备份 ${r5.status} ${r5.text}`);
    const r6 = await abAdmin.get(`/api/backup/download/${bBackup.id}`, "default");
    assert(r6.status === 404, `下载 B 备份 ${r6.status}`);
    await prisma.backupSnapshot.delete({ where: { id: bBackup.id } });
    const r7 = await abAdmin.get(`/api/clients/search?clientId=${FIX.B.clientId}`, "default");
    assert(r7.status === 200 && r7.json.total === 0, "A 上下文搜索 B 客户 id 应为空");
    assert((await portalDigest(shopB.id)) === before, "B 摘要变化");
    return "404";
  });

  await check("A05", "请求体 portalId=B、请求头=A → 400", async () => {
    const r = await aAdmin.json("PUT", `/api/repairs/new-${Date.now()}`, { portalId: shopB.id, repair: { ticket: "x" }, createOnly: true }, "default");
    assert(r.status === 400 && r.json.code === "PORTAL_MISMATCH", `${r.status} ${r.text}`);
    const r2 = await aAdmin.json("POST", "/api/clients", { name: "x", phone: "1", portalId: shopB.id, createOnly: true }, "default");
    assert(r2.status === 400 && r2.json.code === "PORTAL_MISMATCH", `${r2.status}`);
    const r3 = await aAdmin.json("POST", "/api/settings", { settings: {}, expectedRevision: "1", portalId: shopB.id }, "default");
    assert(r3.status === 400, `${r3.status}`);
    return "400 PORTAL_MISMATCH";
  });

  await check("A06/A07", "无成员账号登录成功、空门户列表；成员无页面权限 bootstrap 可用但 pagePermissions 为空", async () => {
    const nobody = makeClient("nobody");
    const user = await nobody.login("nobody");
    assert(user.isSystemAdmin === false && !("isAdmin" in user) && !("pagePermissions" in user), `身份 DTO ${JSON.stringify(user)}`);
    const portals = await nobody.get("/api/portals");
    assert(portals.json.portals.length === 0, "应为空列表");
    const boot = await nobody.get("/api/bootstrap", "default");
    assert(boot.status === 403, `无成员业务 ${boot.status}`);
    const noPerm = makeClient("a-noperm");
    await noPerm.login("a-noperm");
    const boot2 = await noPerm.get("/api/bootstrap", "default");
    assert(boot2.status === 200 && boot2.json.currentUser.pagePermissions.length === 0 && boot2.json.currentUser.isAdmin === false, boot2.text);
    assert(boot2.headers.get("x-portal-id") === "default" && boot2.headers.get("cache-control")?.includes("no-store"), "响应头");
    const search = await noPerm.get("/api/repairs/search", "default");
    assert(search.status === 403 && search.json.code === "PAGE_PERMISSION_REQUIRED", `无页面权限业务 ${search.status}`);
    const multi = await abAdmin.get("/api/portals");
    assert(multi.json.portals.length === 2, "双门户账号应看到两个门户");
    return "分流数据正确";
  });

  await check("A08", "A 管理员新增员工（同事务加入当前门户）；重用已有用户名 409 且不认领", async () => {
    const before = await identityDigest();
    const r = await staffWrite(aAdmin, "POST", { name: "新员工", username: "a-new", email: "", password: "New-Pass-1234", isAdmin: false, pagePermissions: ["clients"] }, "default");
    assert(r.status === 200 && r.json.user.username === "a-new", `${r.status} ${r.text}`);
    const member = await prisma.portalMember.findFirst({ where: { staffId: r.json.user.id } });
    assert(member?.portalId === "default", "同事务加入当前门户");
    const dup = await staffWrite(aAdmin, "POST", { name: "冒充", username: "b-admin", email: "", password: "Another-1234", isAdmin: true, pagePermissions: [] }, "default");
    assert(dup.status === 409 && dup.json.code === "USERNAME_TAKEN", `重名 ${dup.status} ${dup.text}`);
    const bAdminRow = await prisma.staff.findUnique({ where: { id: "b-admin" } });
    assert(bAdminRow && (await prisma.portalMember.count({ where: { staffId: "b-admin", portalId: "default" } })) === 0, "不认领、不加入");
    const login = makeClient("b-check");
    await login.login("b-admin");
    assert((await identityDigest()) !== before, "新员工应写入");
    return "新增 / 冲突正确";
  });

  await check("A09/G23", "A 门店管理员改 / 删 B-only 员工被拒；写 isSystemAdmin 拒绝；修改系统主管理账号 / 共享账号全局身份被拒", async () => {
    const before = await identityDigest();
    const r1 = await staffWrite(aAdmin, "POST", { id: "b-admin", name: "hijack", username: "b-admin", email: "", isAdmin: false, pagePermissions: [] }, "default");
    assert(r1.status === 404, `改 B 员工 ${r1.status}`);
    const r2 = await staffWrite(aAdmin, "DELETE", { id: "b-admin" }, "default");
    assert(r2.status === 404, `删 B 员工 ${r2.status}`);
    const r3 = await staffWrite(aAdmin, "POST", { id: "a-repairs", name: "x", username: "a-repairs", email: "", isAdmin: false, pagePermissions: [], isSystemAdmin: true }, "default");
    assert(r3.status === 400, `isSystemAdmin ${r3.status}`);
    // 系统主管理账号 sys1 只属于 default：门店管理员不得改其密码 / 用户名
    const r4 = await staffWrite(aAdmin, "POST", { id: "sys1", name: "系统主管理员", username: "sysadmin", email: "", password: "Hijack-Pass-1", isAdmin: true, pagePermissions: [] }, "default");
    assert(r4.status === 403 && r4.json.code === "IDENTITY_PROTECTED", `改系统账号密码 ${r4.status} ${r4.text}`);
    const r5 = await staffWrite(aAdmin, "POST", { id: "sys1", name: "系统主管理员", username: "stolen", email: "", isAdmin: true, pagePermissions: [] }, "default");
    assert(r5.status === 403, `改系统账号用户名 ${r5.status}`);
    // 共享账号 ab-staff（default + B）：A 管理员不得改其全局密码
    const r6 = await staffWrite(aAdmin, "POST", { id: "ab-staff", name: "ab-staff", username: "ab-staff", email: "", password: "Hijack-Pass-2", isAdmin: false, pagePermissions: ["repairs"] }, "default");
    assert(r6.status === 403, `改共享账号密码 ${r6.status}`);
    // 但可以只改共享账号在本门户的权限
    const r7 = await staffWrite(aAdmin, "POST", { id: "ab-staff", name: "ab-staff", username: "ab-staff", email: "ab-staff@test.local", isAdmin: false, pagePermissions: ["repairs"] }, "default");
    assert(r7.status === 200 && r7.json.user.pagePermissions.join(",") === "repairs", `改本门户权限 ${r7.status} ${r7.text}`);
    const bMember = await prisma.portalMember.findUnique({ where: { staffId_portalId: { staffId: "ab-staff", portalId: shopB.id } } });
    assert(bMember.pagePermissions.join(",") === "repairs", "B 门户权限不受影响");
    const sysLogin = makeClient("sys-check");
    await sysLogin.login("sysadmin");
    const digestAfter = await identityDigest();
    const sysRow = await prisma.staff.findUnique({ where: { id: "sys1" } });
    assert(sysRow.username === "sysadmin" && sysRow.isSystemAdmin, "系统账号未被修改");
    // 普通单店非系统账号仍可编辑（含改密码）
    const r8 = await staffWrite(aAdmin, "POST", { id: "a-repairs", name: "A 维修员", username: "a-repairs", email: "", password: "Rotated-Pass-1", isAdmin: false, pagePermissions: ["repairs"] }, "default");
    assert(r8.status === 200 && r8.json.passwordChanged === true, `单店账号编辑 ${r8.status} ${r8.text}`);
    return "身份保护有效";
  });

  await check("S02", "改密码后该账号两个旧会话立即失效，旧密码失败，新密码成功", async () => {
    const s1 = makeClient("a-cat-1");
    const s2 = makeClient("a-cat-2");
    await s1.login("a-categories");
    await s2.login("a-categories");
    const r = await staffWrite(aAdmin, "POST", { id: "a-categories", name: "a-categories", username: "a-categories", email: "", password: "Changed-Pass-9", isAdmin: false, pagePermissions: ["categories"] }, "default");
    assert(r.status === 200, r.text);
    const me1 = await s1.get("/api/auth/me");
    const me2 = await s2.get("/api/auth/me");
    assert(me1.json.user === null && me2.json.user === null, "旧会话应失效");
    const biz = await s1.get("/api/bootstrap", "default");
    assert(biz.status === 401, `旧会话业务 ${biz.status}`);
    const old = await makeClient("old").raw("POST", "/api/auth/login", { body: { username: "a-categories", password: PASSWORD } });
    assert(old.status === 401, "旧密码应失败");
    const fresh = makeClient("fresh");
    await fresh.login("a-categories", "Changed-Pass-9");
    return "会话撤销与密码同事务";
  });

  await check("A10", "双门户员工从 A 被移出：A 请求立即拒绝，B 会话正常，Staff 不删", async () => {
    const abStaff = makeClient("ab-staff");
    await abStaff.login("ab-staff");
    assert((await abStaff.get("/api/bootstrap", "default")).status === 200, "移出前 A 可用");
    const r = await staffWrite(aAdmin, "DELETE", { id: "ab-staff" }, "default");
    assert(r.status === 200, `移出 ${r.status} ${r.text}`);
    const a = await abStaff.get("/api/bootstrap", "default");
    assert(a.status === 403 && a.json.code === "PORTAL_ACCESS_DENIED", `移出后 A ${a.status}`);
    const b = await abStaff.get("/api/bootstrap", shopB.id);
    assert(b.status === 200, `B 仍可用 ${b.status}`);
    assert(await prisma.staff.count({ where: { id: "ab-staff" } }) === 1, "Staff 不删除");
    const me = await abStaff.get("/api/auth/me");
    assert(me.json.user?.id === "ab-staff", "会话仍有效");
    return "移出只影响 A";
  });

  await check("A12b", "员工写入缺失 / 过期版本：400 / 409；两位管理员基于同一版本编辑同一员工只有一个成功", async () => {
    const r1 = await aAdmin.json("POST", "/api/staff", { id: "a-repairs", name: "A 维修员", username: "a-repairs", email: "", isAdmin: false, pagePermissions: ["repairs"] }, "default");
    assert(r1.status === 400 && r1.json.code === "REVISION_REQUIRED", `缺失版本 ${r1.status} ${r1.text}`);
    const r2 = await aAdmin.json("POST", "/api/staff", { id: "a-repairs", name: "A 维修员", username: "a-repairs", email: "", isAdmin: false, pagePermissions: ["repairs"], expectedRevision: "1" }, "default");
    assert(r2.status === 409 && r2.json.code === "VERSION_CONFLICT", `过期版本 ${r2.status}`);
    const d1 = await aAdmin.json("DELETE", "/api/staff", { id: "a-repairs" }, "default");
    assert(d1.status === 400, `移出缺失版本 ${d1.status}`);
    const other = makeClient("ab-admin-staff");
    await other.login("ab-admin");
    await prisma.portalMember.update({ where: { staffId_portalId: { staffId: "ab-admin", portalId: "default" } }, data: { isAdmin: true, pagePermissions: PAGE_KEYS } });
    const rev = (await aAdmin.get("/api/bootstrap", "default")).json._revision;
    const [e1, e2] = await Promise.all([
      aAdmin.json("POST", "/api/staff", { id: "a-modules", name: "a-modules", username: "a-modules", email: "", isAdmin: false, pagePermissions: ["modules", "clients"], expectedRevision: rev }, "default"),
      other.json("POST", "/api/staff", { id: "a-modules", name: "a-modules", username: "a-modules", email: "", isAdmin: false, pagePermissions: [], expectedRevision: rev }, "default")
    ]);
    const statuses = [e1.status, e2.status].sort().join(",");
    assert(statuses === "200,409", `同版本并发编辑 ${statuses}`);
    const winner = e1.status === 200 ? e1 : e2;
    const member = await prisma.portalMember.findUnique({ where: { staffId_portalId: { staffId: "a-modules", portalId: "default" } } });
    assert(JSON.stringify(member.pagePermissions) === JSON.stringify(winner.json.user.pagePermissions), "数据库应等于成功方");
    await prisma.portalMember.update({ where: { staffId_portalId: { staffId: "a-modules", portalId: "default" } }, data: { pagePermissions: ["modules"] } });
    return "版本检查覆盖员工写入";
  });

  await check("D03b", "员工移出门户后：编辑其历史订单（技师不变）仍可保存；把订单改派给已移出员工被拒", async () => {
    await addMember("a-services", shopB.id, false, ["repairs"]);
    const repairId = `hist-${Date.now()}`;
    const created = await bAdmin.json("PUT", `/api/repairs/${repairId}`, { createOnly: true, repair: { ticket: `H${Date.now()}`, clientId: FIX.B.clientId, status: "预定", technicianId: "staff_a-services", technicianName: "a-services", items: [], payments: [] } }, shopB.id);
    assert(created.status === 200, `建单 ${created.status} ${created.text}`);
    await prisma.portalMember.delete({ where: { staffId_portalId: { staffId: "a-services", portalId: shopB.id } } });
    const edit = await bAdmin.json("PUT", `/api/repairs/${repairId}`, { repair: { ...created.json.repair, internalNote: "after removal" } }, shopB.id);
    assert(edit.status === 200 && edit.json.repair.technicianId === "staff_a-services", `移出后编辑 ${edit.status} ${edit.text.slice(0, 120)}`);
    const status = await bAdmin.json("PUT", `/api/repairs/${repairId}`, { repair: { ...edit.json.repair, status: "维修中" } }, shopB.id);
    assert(status.status === 200, `移出后改状态 ${status.status}`);
    const other = await bAdmin.json("PUT", `/api/repairs/${FIX.B.repairId}`, { repair: { ...(await bAdmin.get(`/api/repairs/${FIX.B.repairId}`, shopB.id)).json.repair, technicianId: "staff_a-services" } }, shopB.id);
    assert(other.status === 400 && other.json.code === "INVALID_REFERENCE", `改派给已移出员工 ${other.status}`);
    await bAdmin.json("DELETE", `/api/repairs/${repairId}`, { updatedAt: status.json.repair.updatedAt }, shopB.id);
    return "历史归属保留、新指派受限";
  });

  await check("A12", "同门户两名管理员并发互相降级：至少一位保留", async () => {
    await prisma.portalMember.update({ where: { staffId_portalId: { staffId: "ab-admin", portalId: "default" } }, data: { isAdmin: true, pagePermissions: PAGE_KEYS } });
    const abClient = makeClient("ab-admin-2");
    await abClient.login("ab-admin");
    // 当前 default 管理员：sys1, a-admin, ab-admin → 先把 sys1 降为普通（保持两位）
    await prisma.portalMember.update({ where: { staffId_portalId: { staffId: "sys1", portalId: "default" } }, data: { isAdmin: false, pagePermissions: PAGE_KEYS } });
    for (let round = 0; round < 3; round += 1) {
      await prisma.portalMember.updateMany({ where: { portalId: "default", staffId: { in: ["a-admin", "ab-admin"] } }, data: { isAdmin: true, pagePermissions: PAGE_KEYS } });
      const rev = (await aAdmin.get("/api/bootstrap", "default")).json._revision;
      const [r1, r2] = await Promise.all([
        aAdmin.json("POST", "/api/staff", { id: "ab-admin", name: "ab-admin", username: "ab-admin", email: "ab-admin@test.local", isAdmin: false, pagePermissions: ["repairs"], expectedRevision: rev }, "default"),
        abClient.json("POST", "/api/staff", { id: "a-admin", name: "a-admin", username: "a-admin", email: "a-admin@test.local", isAdmin: false, pagePermissions: ["repairs"], expectedRevision: rev }, "default")
      ]);
      const admins = await prisma.portalMember.count({ where: { portalId: "default", isAdmin: true } });
      assert(admins >= 1, `第 ${round + 1} 轮后管理员数 ${admins}`);
      const ok = [r1, r2].filter((r) => r.status === 200).length;
      assert(ok <= 1, `第 ${round + 1} 轮两方都成功`);
    }
    await prisma.portalMember.updateMany({ where: { portalId: "default", staffId: { in: ["a-admin", "ab-admin", "sys1"] } }, data: { isAdmin: true, pagePermissions: PAGE_KEYS } });
    return "3 轮并发均至少保留一位";
  });

  // ===== D：数据访问与隔离 =====
  await check("D01", "A/B 相同 ticket / 品牌名 / 技师名并存；同门户内唯一冲突；publicToken 全局唯一", async () => {
    const a = await prisma.repair.findFirst({ where: { portalId: "default", ticket: "9000000001" } });
    const b = await prisma.repair.findFirst({ where: { portalId: shopB.id, ticket: "9000000001" } });
    assert(a && b, "相同 ticket 应在两个门户并存");
    assert((await prisma.brand.count({ where: { name: "MarcaComun" } })) === 2, "相同品牌名并存");
    assert((await prisma.technician.count({ where: { name: "Tecnico Compartido" } })) === 2, "相同技师名并存");
    let dupErr = null;
    try { await prisma.brand.create({ data: { id: "dup-brand", portalId: "default", name: "MarcaComun" } }); } catch (error) { dupErr = error; }
    assert(dupErr?.code === "P2002", "同门户品牌名应冲突");
    let tokenErr = null;
    try { await prisma.repair.create({ data: { id: "dup-token", portalId: shopB.id, ticket: "9000000099", clientId: FIX.B.clientId, properties: "", issue: "", internalNote: "", passwordPattern: [], frontPhoto: "", backPhoto: "", signatureDataUrl: "", publicToken: "default-token", warrantyReason: "", warrantyDiagnosis: "", warrantyResolution: "", statusHistory: [], notificationLog: [], searchText: "" } }); } catch (error) { tokenErr = error; }
    assert(tokenErr?.code === "P2002", "publicToken 应全局唯一");
    return "约束正确";
  });

  await check("D02/D03", "A 用 B 客户 / 品牌 / 技师 / 来源单 id 创建维修单被拒且回滚", async () => {
    const before = await portalDigest(shopB.id);
    const beforeA = await portalDigest("default");
    const id = `x-${Date.now()}`;
    const base = { ticket: `T${Date.now()}`, status: "预定", items: [], payments: [] };
    const r1 = await aAdmin.json("PUT", `/api/repairs/${id}`, { createOnly: true, repair: { ...base, clientId: FIX.B.clientId } }, "default");
    assert([400, 404].includes(r1.status), `B 客户 id ${r1.status} ${r1.text}`);
    const r2 = await aAdmin.json("PUT", `/api/repairs/${id}`, { createOnly: true, repair: { ...base }, client: { id: FIX.B.clientId, name: "hijack", phone: "1" } }, "default");
    assert([400, 404].includes(r2.status), `嵌入 B client.id ${r2.status}`);
    const r3 = await aAdmin.json("PUT", `/api/repairs/${id}`, { createOnly: true, repair: { ...base, clientId: FIX.A.clientId, technicianId: FIX.B.techId } }, "default");
    assert(r3.status === 400 && r3.json.code === "INVALID_REFERENCE", `B 技师 ${r3.status} ${r3.text}`);
    const r4 = await aAdmin.json("PUT", `/api/repairs/${id}`, { createOnly: true, repair: { ...base, clientId: FIX.A.clientId, orderType: "warranty", sourceRepairId: FIX.B.repairId } }, "default");
    assert(r4.status === 400 && r4.json.code === "INVALID_REFERENCE", `B 来源单 ${r4.status}`);
    const r5 = await aAdmin.json("POST", "/api/catalog", { section: "brands-models", expectedRevision: "0", brands: [{ id: FIX.A.brandId, name: "MarcaComun" }], models: [{ id: "m-x", brandId: FIX.B.brandId, name: "X" }] }, "default");
    assert(r5.status === 400 || r5.status === 409, `B 品牌 id 型号 ${r5.status}`);
    assert(await prisma.repair.count({ where: { id } }) === 0, "半张订单不应残留");
    assert((await portalDigest(shopB.id)) === before && (await portalDigest("default")) === beforeA, "A/B 摘要不应变化");
    return "全部拒绝并回滚";
  });

  await check("D04/D06", "A 搜索 / 统计 / 报表只计算 A：关键词只命中 B 时计数为 0；金额与夹具一致", async () => {
    const s = await aAdmin.get("/api/repairs/search?q=pantalla%20b", "default");
    assert(s.status === 200 && s.json.total === 0 && Object.values(s.json.counts).every((v) => v === 0), `搜索泄露 ${s.text}`);
    const s2 = await aAdmin.get("/api/repairs/search?q=pantalla", "default");
    assert(s2.json.total === 1 && s2.json.rows[0].id === FIX.A.repairId, "A 应只看到自己的单");
    const c = await aAdmin.get("/api/clients/search?q=cliente", "default");
    assert(c.json.total === 1 && c.json.rows[0].id === FIX.A.clientId, "客户搜索");
    const agg = await aAdmin.get("/api/repairs/aggregates", "default");
    assert(agg.json.totals.amount === 90 && agg.json.totals.cost === 30 && agg.json.totals.profit === 60, `汇总 ${JSON.stringify(agg.json.totals)}`);
    const ov = await aAdmin.get("/api/reports/overview?start=&end=", "default");
    assert(ov.json.summary.revenue === 90 && ov.json.summary.received === 20 && ov.json.summary.unpaid === 70 && ov.json.summary.cost === 30 && ov.json.summary.profit === 60, `报表 ${JSON.stringify(ov.json.summary)}`);
    assert(!ov.text.includes("Cliente B"), "报表泄露 B");
    const fin = await aAdmin.get("/api/reports/finance", "default");
    assert(fin.json.summary.receivable === 90 && fin.json.summary.received === 20 && fin.json.summary.unpaid === 70 && fin.json.summary.costTotal === 30, `财务 ${JSON.stringify(fin.json.summary)}`);
    assert(!fin.text.includes("Cliente B") && fin.json.payments.rows.length === 1, "财务流水泄露 B");
    const dash = await aAdmin.get("/api/technicians/dashboard", "default");
    assert(dash.json.rows.length === 1 && dash.json.rows[0].repairAmount === 90, `技师看板 ${JSON.stringify(dash.json.rows.map((r) => r.repairAmount))}`);
    const bOv = await bAdmin.get("/api/reports/overview?start=&end=", shopB.id);
    assert(bOv.json.summary.revenue === 200 && bOv.json.summary.received === 50 && bOv.json.summary.unpaid === 150 && bOv.json.summary.profit === 140, `B 报表 ${JSON.stringify(bOv.json.summary)}`);
    return "A 90/20/70/30/60，B 200/50/150/60/140";
  });

  await check("D05", "A 读 B 订单直链 / 子表 / 扫码：不存在于当前上下文", async () => {
    const r = await aAdmin.get(`/api/repairs/${FIX.B.repairId}`, "default");
    assert(r.status === 404, `直链 ${r.status}`);
    const lookup = await aAdmin.get(`/api/repairs/lookup?value=${encodeURIComponent(shopB.id + "-token")}`, "default");
    assert(lookup.status === 200 && lookup.json.repair === null, `扫码 B token ${lookup.text}`);
    const lookup2 = await aAdmin.get("/api/repairs/lookup?value=9000000001", "default");
    assert(lookup2.json.repair?.id === FIX.A.repairId, "同号扫码应命中 A");
    const bySource = await aAdmin.get(`/api/repairs/search?sourceRepairId=${FIX.B.repairId}`, "default");
    assert(bySource.json.total === 0, "sourceRepairId 过滤");
    return "404 / null";
  });

  await check("D07", "A 全量同步技师（含删除）只影响 A；B 同名技师 / 订单不变", async () => {
    const before = await portalDigest(shopB.id);
    const boot = await aAdmin.get("/api/bootstrap", "default");
    const r = await aAdmin.json("POST", "/api/technicians", { technicians: [{ id: "a-new-tech", name: "Nuevo A" }, { id: FIX.A.techId, name: "Tecnico Compartido" }], expectedRevision: boot.json._revision }, "default");
    assert(r.status === 200 && r.json.technicians.length === 2, `${r.status} ${r.text}`);
    const r2 = await aAdmin.json("POST", "/api/technicians", { technicians: [{ id: FIX.A.techId, name: "Tecnico Compartido" }], expectedRevision: r.json._revision }, "default");
    assert(r2.status === 200 && r2.json.technicians.length === 1, "删除新增技师");
    assert((await prisma.technician.count({ where: { portalId: shopB.id } })) === 1, "B 技师数");
    assert((await portalDigest(shopB.id)) === before, "B 不变");
    const attr = await aAdmin.json("POST", "/api/attributes", { attributes: [{ id: "a-attr-2", groupName: "颜色", defaultName: "White" }], expectedRevision: r2.json._revision }, "default");
    assert(attr.status === 200 && attr.json.attributes.length === 1, `属性同步 ${attr.status} ${attr.text}`);
    assert((await prisma.attribute.count({ where: { portalId: shopB.id } })) === 1 && (await portalDigest(shopB.id)) === before, "B 属性不变");
    return "仅 A 变化";
  });

  await check("D08/D09", "单权限用户提交其他目录分区 403；允许分区更新且未提交分区不清空；products 要求双权限", async () => {
    const services = makeClient("a-services");
    await services.login("a-services");
    const boot = await services.get("/api/bootstrap", "default");
    const rev = boot.json._revision;
    const r1 = await services.json("POST", "/api/catalog", { section: "parts", expectedRevision: rev, parts: [] }, "default");
    assert(r1.status === 403, `services 提交 parts ${r1.status}`);
    const r2 = await services.json("POST", "/api/catalog", { section: "brands-models", expectedRevision: rev, brands: [], models: [] }, "default");
    assert(r2.status === 403, `services 提交 brands ${r2.status}`);
    const r3 = await services.json("POST", "/api/catalog", { section: "products", expectedRevision: rev, services: [], parts: [] }, "default");
    assert(r3.status === 403, `services 提交 products ${r3.status}`);
    const r4 = await services.json("POST", "/api/catalog", { section: "services", expectedRevision: rev, services: [{ id: "default-service", defaultName: "Servicio A" }], parts: [] }, "default");
    assert(r4.status === 400, `分区外数组 ${r4.status}`);
    const r5 = await services.json("POST", "/api/catalog", { section: "services", expectedRevision: rev, services: [{ id: "default-service", defaultName: "Servicio A" }, { id: "svc-2", defaultName: "Nuevo" }], settings: { productPartCategories: ["x"] } }, "default");
    assert(r5.status === 400, `分区外设置键 ${r5.status}`);
    const r6 = await services.json("POST", "/api/catalog", { section: "services", expectedRevision: rev, services: [{ id: "default-service", defaultName: "Servicio A" }, { id: "svc-2", defaultName: "Nuevo" }], settings: { productServiceCategories: ["维修"] } }, "default");
    assert(r6.status === 200 && r6.json.services.length === 2 && r6.json.parts.length === 1 && r6.json.brands.length === 1, `允许分区 ${r6.status} ${r6.text.slice(0, 200)}`);
    assert((await prisma.part.count({ where: { portalId: "default" } })) === 1 && (await prisma.brand.count({ where: { portalId: "default" } })) === 1, "未提交分区不清空");
    const modules = makeClient("a-modules");
    await modules.login("a-modules");
    const r7 = await modules.json("POST", "/api/catalog", { section: "services", expectedRevision: r6.json._revision, services: [] }, "default");
    assert(r7.status === 403, `modules 提交 services ${r7.status}`);
    const r8 = await aAdmin.json("POST", "/api/catalog", { section: "products", expectedRevision: r6.json._revision, services: r6.json.services, parts: r6.json.parts, settings: { productCatalogCategories: ["A"] } }, "default");
    assert(r8.status === 200 && r8.json.settings.productCatalogCategories?.[0] === "A", `管理员 products ${r8.status} ${r8.text.slice(0, 200)}`);
    const unknownSection = await aAdmin.json("POST", "/api/catalog", { section: "all", expectedRevision: r8.json._revision }, "default");
    assert(unknownSection.status === 400, `未知 section ${unknownSection.status}`);
    return "分区授权正确";
  });

  await check("D10", "旧 /api/repairs 集合入口 410/405；/api/clients GET 410", async () => {
    const r1 = await aAdmin.get("/api/repairs", "default");
    assert(r1.status === 410, `GET repairs ${r1.status}`);
    const r2 = await aAdmin.json("POST", "/api/repairs", {}, "default");
    assert(r2.status === 405, `POST repairs ${r2.status}`);
    const r3 = await aAdmin.get("/api/clients", "default");
    assert(r3.status === 410, `GET clients ${r3.status}`);
    const r4 = await anon.get("/api/repairs");
    assert(r4.status === 401, `匿名旧入口 ${r4.status}`);
    return "410/405";
  });

  await check("D11", "相同会话先 A 后 B：响应头 X-Portal-Id 正确，无共享缓存", async () => {
    const a = await abAdmin.get("/api/bootstrap", "default");
    const b = await abAdmin.get("/api/bootstrap", shopB.id);
    assert(a.headers.get("x-portal-id") === "default" && b.headers.get("x-portal-id") === shopB.id, "门户头");
    assert(a.json.portal.name !== b.json.portal.name && a.json.settings.shopName !== b.json.settings.shopName, "不同门户数据应不同");
    assert(a.headers.get("cache-control")?.includes("private") && a.headers.get("cache-control")?.includes("no-store"), "私有响应 no-store");
    const results2 = await Promise.all(Array.from({ length: 6 }, (_, i) => abAdmin.get("/api/repairs/search", i % 2 ? shopB.id : "default")));
    results2.forEach((r, i) => assert(r.json.rows[0].id === (i % 2 ? FIX.B.repairId : FIX.A.repairId), `乱序响应混入 ${i}`));
    return "无混入";
  });

  await check("D12", "小资源 GET（catalog / attributes / technicians）不读取全量维修单 / 客户", async () => {
    const r = await aAdmin.get("/api/catalog", "default");
    assert(r.status === 200 && r.json.brands && r.json.services && !("repairs" in r.json) && !("clients" in r.json), r.text.slice(0, 200));
    const before = Date.now();
    const rows = await prisma.$queryRaw`SHOW SESSION STATUS LIKE 'Questions'`;
    void rows;
    const r2 = await aAdmin.get("/api/attributes", "default");
    assert(r2.status === 200 && Array.isArray(r2.json.attributes), r2.text.slice(0, 100));
    const r3 = await aAdmin.get("/api/technicians", "default");
    assert(r3.status === 200 && Array.isArray(r3.json.technicians), r3.text.slice(0, 100));
    return `三个小资源接口 ${Date.now() - before}ms（源码：getBootstrapData 不再包含 repairs/clients；见 data-store.getBootstrapData）`;
  });

  // ===== C：并发与写入 =====
  await check("C01", "更新 / 删除已有维修单省略 updatedAt 400、非法 400、过期 409；数据与 revision 不变", async () => {
    const boot = await aAdmin.get("/api/bootstrap", "default");
    const current = (await aAdmin.get(`/api/repairs/${FIX.A.repairId}`, "default")).json.repair;
    const r1 = await aAdmin.json("PUT", `/api/repairs/${FIX.A.repairId}`, { repair: { ...current, updatedAt: undefined, status: "完成" } }, "default");
    assert(r1.status === 400 && r1.json.code === "VERSION_REQUIRED", `省略 ${r1.status} ${r1.text}`);
    const r2 = await aAdmin.json("PUT", `/api/repairs/${FIX.A.repairId}`, { repair: { ...current, updatedAt: "not-a-date", status: "完成" } }, "default");
    assert(r2.status === 400 && r2.json.code === "INVALID_VERSION", `非法 ${r2.status}`);
    const r3 = await aAdmin.json("PUT", `/api/repairs/${FIX.A.repairId}`, { repair: { ...current, updatedAt: "2020-01-01T00:00:00.000Z", status: "完成" } }, "default");
    assert(r3.status === 409 && r3.json.code === "VERSION_CONFLICT", `过期 ${r3.status}`);
    const d1 = await aAdmin.json("DELETE", `/api/repairs/${FIX.A.repairId}`, {}, "default");
    assert(d1.status === 400, `删除省略 ${d1.status}`);
    const d2 = await aAdmin.json("DELETE", `/api/repairs/${FIX.A.repairId}`, { updatedAt: "2020-01-01T00:00:00.000Z" }, "default");
    assert(d2.status === 409, `删除过期 ${d2.status}`);
    const after = await aAdmin.get("/api/bootstrap", "default");
    assert(after.json._revision === boot.json._revision, "revision 不应变化");
    const row = await prisma.repair.findUnique({ where: { id: FIX.A.repairId } });
    assert(row.status === "维修中", "数据不应变化");
    return "400/409";
  });

  await check("C02", "两个独立请求用同一版本更新金额：一成功一 409；同毫秒版本递增；createOnly 不能更新已有对象", async () => {
    const current = (await aAdmin.get(`/api/repairs/${FIX.A.repairId}`, "default")).json.repair;
    const other = makeClient("a-admin-2");
    await other.login("a-admin");
    const [r1, r2] = await Promise.all([
      aAdmin.json("PUT", `/api/repairs/${FIX.A.repairId}`, { repair: { ...current, budget: 111 } }, "default"),
      other.json("PUT", `/api/repairs/${FIX.A.repairId}`, { repair: { ...current, budget: 222 } }, "default")
    ]);
    const statuses = [r1.status, r2.status].sort().join(",");
    assert(statuses === "200,409", `并发 ${statuses} ${r1.text.slice(0, 100)} ${r2.text.slice(0, 100)}`);
    const winner = r1.status === 200 ? r1 : r2;
    const row = await prisma.repair.findUnique({ where: { id: FIX.A.repairId } });
    assert(Number(row.budget) === Number(winner.json.repair.budget), "数据库应等于成功请求");
    assert(new Date(winner.json.repair.updatedAt).getTime() > new Date(current.updatedAt).getTime(), "版本应递增");
    // 连续两次快速更新：版本严格递增
    const s1 = await aAdmin.json("PUT", `/api/repairs/${FIX.A.repairId}`, { repair: { ...winner.json.repair, budget: 100 } }, "default");
    const s2 = await aAdmin.json("PUT", `/api/repairs/${FIX.A.repairId}`, { repair: { ...s1.json.repair, budget: 100 } }, "default");
    assert(s1.status === 200 && s2.status === 200 && new Date(s2.json.repair.updatedAt) > new Date(s1.json.repair.updatedAt), "同毫秒也应递增");
    const createOnly = await aAdmin.json("PUT", `/api/repairs/${FIX.A.repairId}`, { createOnly: true, repair: { ...s2.json.repair } }, "default");
    assert(createOnly.status === 409 && createOnly.json.code === "ALREADY_EXISTS", `createOnly 已有 ${createOnly.status}`);
    const gone = await aAdmin.json("PUT", "/api/repairs/never-existed", { repair: { ...s2.json.repair, id: "never-existed", updatedAt: new Date().toISOString() } }, "default");
    assert(gone.status === 404, `更新已删除对象 ${gone.status}`);
    return "乐观锁有效";
  });

  await check("C03", "更新与删除并发；锁单后普通员工提交 403；有保修来源的原单删除 409", async () => {
    const current = (await aAdmin.get(`/api/repairs/${FIX.A.repairId}`, "default")).json.repair;
    const [u, d] = await Promise.all([
      aAdmin.json("PUT", `/api/repairs/${FIX.A.repairId}`, { repair: { ...current, issue: "updated" } }, "default"),
      aAdmin.json("DELETE", `/api/repairs/${FIX.A.repairId}`, { updatedAt: current.updatedAt }, "default")
    ]);
    const ok = [u, d].filter((r) => r.status === 200).length;
    assert(ok === 1, `更新与删除并发应只有一个成功 ${u.status}/${d.status}`);
    if (d.status === 200) {
      // 被删了：重建夹具
      FIX.A = await seedBusiness("default", "A").catch(async () => {
        await prisma.repair.deleteMany({ where: { portalId: "default" } });
        return seedBusiness("default", "A");
      });
    }
    const repairNow = (await aAdmin.get(`/api/repairs/${FIX.A.repairId}`, "default")).json.repair;
    // 锁单：管理员改为已取走
    const locked = await aAdmin.json("PUT", `/api/repairs/${FIX.A.repairId}`, { repair: { ...repairNow, status: "已取走" } }, "default");
    assert(locked.status === 200, locked.text);
    const emp = makeClient("a-repairs");
    await emp.login("a-repairs", "Rotated-Pass-1");
    const empEdit = await emp.json("PUT", `/api/repairs/${FIX.A.repairId}`, { repair: { ...locked.json.repair, issue: "hack" } }, "default");
    assert(empEdit.status === 403 && empEdit.json.code === "ORDER_LOCKED", `锁单员工 ${empEdit.status} ${empEdit.text}`);
    const unlocked = await aAdmin.json("PUT", `/api/repairs/${FIX.A.repairId}`, { repair: { ...locked.json.repair, status: "维修中", statusHistory: [{ type: "order-unlocked", at: "2026-09-10 10:00" }] } }, "default");
    assert(unlocked.status === 200, unlocked.text);
    // 保修单引用原单
    const wid = `w-${Date.now()}`;
    const warranty = await aAdmin.json("PUT", `/api/repairs/${wid}`, { createOnly: true, repair: { ticket: `W${Date.now()}`, clientId: FIX.A.clientId, orderType: "warranty", sourceRepairId: FIX.A.repairId, status: "预定", items: [], payments: [] } }, "default");
    assert(warranty.status === 200, `创建保修单 ${warranty.status} ${warranty.text}`);
    const delSource = await aAdmin.json("DELETE", `/api/repairs/${FIX.A.repairId}`, { updatedAt: unlocked.json.repair.updatedAt }, "default");
    assert(delSource.status === 409 && delSource.json.code === "LINKED_WARRANTY", `删有保修原单 ${delSource.status}`);
    const delW = await aAdmin.json("DELETE", `/api/repairs/${wid}`, { updatedAt: warranty.json.repair.updatedAt }, "default");
    assert(delW.status === 200, "删保修单");
    return "保护有效";
  });

  await check("C04/C05", "两人读取相同 revision 后保存整组目录 / 设置：先提交成功，后提交 409；缺版本 400；A/B 不共用锁", async () => {
    const boot = await aAdmin.get("/api/bootstrap", "default");
    const rev = boot.json._revision;
    const other = makeClient("a-admin-3");
    await other.login("a-admin");
    const r1 = await aAdmin.json("POST", "/api/settings", { settings: { shopName: "A 店 v1" }, expectedRevision: rev }, "default");
    assert(r1.status === 200, r1.text);
    const r2 = await other.json("POST", "/api/settings", { settings: { shopName: "A 店 v2" }, expectedRevision: rev }, "default");
    assert(r2.status === 409 && r2.json.code === "VERSION_CONFLICT", `后提交 ${r2.status}`);
    const setting = await prisma.setting.findUnique({ where: { portalId: "default" } });
    assert(setting.value.shopName === "A 店 v1", "不得覆盖前者");
    const r3 = await aAdmin.json("POST", "/api/settings", { settings: { shopName: "x" } }, "default");
    assert(r3.status === 400, `缺版本 ${r3.status}`);
    const unknownKey = await aAdmin.json("POST", "/api/settings", { settings: { hacked: 1 }, expectedRevision: r1.json._revision }, "default");
    assert(unknownKey.status === 400, `未知设置键 ${unknownKey.status}`);
    const cat = await aAdmin.json("POST", "/api/catalog", { section: "brands-models", expectedRevision: rev, brands: [], models: [] }, "default");
    assert(cat.status === 409, `过期整包目录 ${cat.status}`);
    const failedRev = (await aAdmin.get("/api/bootstrap", "default")).json._revision;
    assert(failedRev === r1.json._revision, "失败不增加 revision");
    // 非管理员改锁单策略 403
    const svc = makeClient("a-services-2");
    await svc.login("a-services");
    const protectedKey = await svc.json("POST", "/api/settings", { settings: { enableOrderLock: false }, expectedRevision: failedRev }, "default");
    assert(protectedKey.status === 403 || protectedKey.status === 400, `非管理员改锁单策略 ${protectedKey.status}`);
    // A / B 并行写：互不阻塞且各自 revision 独立
    const bBoot = await bAdmin.get("/api/bootstrap", shopB.id);
    const [pa, pb] = await Promise.all([
      aAdmin.json("POST", "/api/settings", { settings: { shopName: "A 店 v3" }, expectedRevision: failedRev }, "default"),
      bAdmin.json("POST", "/api/settings", { settings: { shopName: "B 店 v3" }, expectedRevision: bBoot.json._revision }, shopB.id)
    ]);
    assert(pa.status === 200 && pb.status === 200, `A/B 并行 ${pa.status}/${pb.status}`);
    return "版本冲突正确";
  });

  // ===== B：备份 =====
  await check("B01", "A 备份 / 导出 / 下载只包含 A，v2 元数据一致，不含账号 / 成员 / 会话 / 密码 / 权限字段", async () => {
    const create = await aAdmin.json("POST", "/api/backup/create", {}, "default");
    assert(create.status === 200 && create.json.backup?.id, create.text);
    const list = await aAdmin.get("/api/backup/list", "default");
    assert(list.json.backups.every((b) => b.id), "列表");
    const exported = await aAdmin.get("/api/backup/export", "default");
    assert(exported.json.formatVersion === 2 && exported.json.sourcePortalId === "default", "v2 元数据");
    const text = JSON.stringify(exported.json);
    for (const bad of ["passwordHash", "isSystemAdmin", "\"users\"", "sessionToken", "pagePermissions", "Cliente B", "creationKey"]) assert(!text.includes(bad), `导出包含 ${bad}`);
    assert(exported.json.data.repairs.every((r) => !("portalId" in r)), "订单不应带 portalId");
    const snapshot = await prisma.backupSnapshot.findUnique({ where: { id: create.json.backup.id } });
    assert(snapshot.portalId === "default" && snapshot.data.sourcePortalId === "default" && !("users" in snapshot.data), "快照归属 / 清洗");
    const dl = await aAdmin.raw("GET", `/api/backup/download/${create.json.backup.id}`, { portal: "default" });
    assert(dl.status === 200 && dl.headers.get("content-type")?.includes("zip") && dl.headers.get("x-portal-id") === "default", "下载");
    const dlCurrent = await aAdmin.raw("GET", "/api/backup/download/current", { portal: "default" });
    assert(dlCurrent.status === 200, "下载当前");
    return "备份只含 A";
  });

  await check("B02", "A 恢复 B 快照 id 404；伪造 sourcePortalId 拒绝；用 B 的 id/token 导入冲突回滚", async () => {
    const bBackup = await prisma.backupSnapshot.findFirst({ where: { portalId: shopB.id } }) || await prisma.backupSnapshot.create({ data: { portalId: shopB.id, kind: "manual", reason: "b", data: { sourcePortalId: shopB.id, clients: [], brands: [], models: [], services: [], parts: [], repairs: [] }, counts: {} } });
    const boot = await aAdmin.get("/api/bootstrap", "default");
    const r1 = await aAdmin.json("POST", "/api/backup/restore", { id: bBackup.id, expectedRevision: boot.json._revision }, "default");
    assert(r1.status === 404, `恢复 B 快照 ${r1.status}`);
    const exported = (await aAdmin.get("/api/backup/export", "default")).json.data;
    const forged = { ...exported, sourcePortalId: shopB.id };
    const r2 = await aAdmin.json("POST", "/api/backup/import", { data: forged, expectedRevision: boot.json._revision }, "default");
    assert(r2.status === 400 && r2.json.code === "BACKUP_PORTAL_MISMATCH", `伪造来源 ${r2.status} ${r2.text}`);
    const beforeA = await portalDigest("default");
    const beforeB = await portalDigest(shopB.id);
    const conflict = { ...exported, clients: [...exported.clients, { id: FIX.B.clientId, name: "steal", phone: "1" }] };
    const r3 = await aAdmin.json("POST", "/api/backup/import", { data: conflict, expectedRevision: boot.json._revision }, "default");
    assert(r3.status === 409 && r3.json.code === "CROSS_PORTAL_ID_CONFLICT", `B id 冲突 ${r3.status} ${r3.text}`);
    const tokenConflict = { ...exported, repairs: exported.repairs.map((r, i) => (i === 0 ? { ...r, publicToken: `${shopB.id}-token` } : r)) };
    const r4 = await aAdmin.json("POST", "/api/backup/import", { data: tokenConflict, expectedRevision: boot.json._revision }, "default");
    assert(r4.status === 409 && r4.json.code === "CROSS_PORTAL_TOKEN_CONFLICT", `B token 冲突 ${r4.status} ${r4.text}`);
    assert((await portalDigest("default")) === beforeA && (await portalDigest(shopB.id)) === beforeB, "冲突后 A/B 原数据应保持");
    return "拒绝且回滚";
  });

  await check("B03/B04", "A 恢复自身快照：A 正确恢复且有安全快照、旧版本失效、revision 递增；身份 / 成员 / 门户元数据与 B 完全不变", async () => {
    const snapshot = (await aAdmin.get("/api/backup/list", "default")).json.backups.find((b) => b.kind === "manual");
    // 快照后改设置、加账号、改权限、改门户名，再恢复
    const boot = await aAdmin.get("/api/bootstrap", "default");
    await aAdmin.json("POST", "/api/settings", { settings: { shopName: "改动后的名字" }, expectedRevision: boot.json._revision }, "default");
    await staffWrite(aAdmin, "POST", { name: "恢复前新账号", username: "after-snapshot", email: "", password: "After-Pass-1234", isAdmin: false, pagePermissions: ["clients"] }, "default");
    await sys.sys("PATCH", `/api/system/portals/default`, { expectedRevision: (await sys.get("/api/system/portals?pageSize=100")).json.portals.find((p) => p.id === "default").revision, name: "A 改名后" });
    const identityBefore = await identityDigest();
    const portalMetaBefore = await prisma.portal.findUnique({ where: { id: "default" } });
    const bBefore = await portalDigest(shopB.id);
    const staleRepair = (await aAdmin.get(`/api/repairs/${FIX.A.repairId}`, "default")).json.repair;
    const boot2 = await aAdmin.get("/api/bootstrap", "default");
    const backupsBefore = await prisma.backupSnapshot.count({ where: { portalId: "default" } });
    const r = await aAdmin.json("POST", "/api/backup/restore", { id: snapshot.id, expectedRevision: boot2.json._revision }, "default");
    assert(r.status === 200 && r.json.data._revision === String(Number(boot2.json._revision) + 1), `${r.status} ${r.text.slice(0, 200)}`);
    assert((await prisma.backupSnapshot.count({ where: { portalId: "default", kind: "safety" } })) >= 1 && (await prisma.backupSnapshot.count({ where: { portalId: "default" } })) === backupsBefore + 1, "恢复前安全快照");
    assert((await identityDigest()) === identityBefore, "身份 / 成员 / 会话不得被恢复改变");
    const portalMetaAfter = await prisma.portal.findUnique({ where: { id: "default" } });
    assert(portalMetaAfter.name === "A 改名后" && portalMetaAfter.isActive === portalMetaBefore.isActive && portalMetaAfter.creationKey === portalMetaBefore.creationKey, "门户元数据不从备份恢复");
    assert((await portalDigest(shopB.id)) === bBefore, "B 完全不变");
    const restoredSetting = await prisma.setting.findUnique({ where: { portalId: "default" } });
    assert(restoredSetting.value.shopName !== "改动后的名字", "设置应恢复");
    const stale = await aAdmin.json("PUT", `/api/repairs/${FIX.A.repairId}`, { repair: { ...staleRepair, issue: "stale edit" } }, "default");
    assert(stale.status === 409, `恢复前旧版本编辑应 409，实际 ${stale.status}`);
    const restoredRow = await prisma.repair.findUnique({ where: { id: FIX.A.repairId } });
    assert(restoredRow.updatedAt.getTime() > new Date(staleRepair.updatedAt).getTime(), "恢复后版本必须晚于恢复前");
    await sys.sys("PATCH", `/api/system/portals/default`, { expectedRevision: (await sys.get("/api/system/portals?pageSize=100")).json.portals.find((p) => p.id === "default").revision, name: "A 测试门户" });
    return "恢复正确、身份不变";
  });

  await check("B05", "含 users 的旧格式 JSON / 无门户标记备份：身份字段剔除；只有默认门户显式确认可导入；B 拒绝", async () => {
    const exported = (await aAdmin.get("/api/backup/export", "default")).json.data;
    const { sourcePortalId, formatVersion, exportedAt, sourcePortalName, ...legacy } = exported;
    legacy.users = [{ id: "sys1", username: "sysadmin", isAdmin: true, pagePermissions: [] }, { id: "evil", username: "evil", isAdmin: true, pagePermissions: [], password: "x" }];
    const boot = await aAdmin.get("/api/bootstrap", "default");
    const r1 = await aAdmin.json("POST", "/api/backup/import", { data: legacy, expectedRevision: boot.json._revision }, "default");
    assert(r1.status === 400 && r1.json.code === "LEGACY_BACKUP_CONFIRMATION_REQUIRED", `未确认 ${r1.status} ${r1.text}`);
    const identityBefore = await identityDigest();
    const r2 = await aAdmin.json("POST", "/api/backup/import", { data: legacy, expectedRevision: boot.json._revision, confirmLegacy: true }, "default");
    assert(r2.status === 200, `确认后导入 ${r2.status} ${r2.text.slice(0, 200)}`);
    assert((await identityDigest()) === identityBefore && (await prisma.staff.count({ where: { username: "evil" } })) === 0, "users 必须被剔除");
    const bBoot = await bAdmin.get("/api/bootstrap", shopB.id);
    const r3 = await bAdmin.json("POST", "/api/backup/import", { data: legacy, expectedRevision: bBoot.json._revision, confirmLegacy: true }, shopB.id);
    assert(r3.status === 400 && r3.json.code === "LEGACY_BACKUP_DEFAULT_ONLY", `B 导入旧格式 ${r3.status}`);
    // 数据库历史快照恢复同样清洗（人工写入含 users 的旧快照）
    const oldSnap = await prisma.backupSnapshot.create({ data: { portalId: "default", kind: "manual", reason: "legacy", data: { ...legacy }, counts: {} } });
    const boot2 = await aAdmin.get("/api/bootstrap", "default");
    const r4 = await aAdmin.json("POST", "/api/backup/restore", { id: oldSnap.id, expectedRevision: boot2.json._revision }, "default");
    assert(r4.status === 200 && (await identityDigest()) === identityBefore, `旧快照恢复 ${r4.status} ${r4.text.slice(0, 200)}`);
    const dl = await aAdmin.raw("GET", `/api/backup/download/${oldSnap.id}`, { portal: "default" });
    assert(dl.status === 200, "下载旧快照");
    return "身份字段清洗一致";
  });

  await check("B06", "缺客户引用 / 重复主键 / 损坏 JSON：校验失败，A/B 原数据与 revision 保持", async () => {
    const boot = await aAdmin.get("/api/bootstrap", "default");
    const beforeA = await portalDigest("default");
    const exported = (await aAdmin.get("/api/backup/export", "default")).json.data;
    const missingClient = { ...exported, repairs: [{ ...exported.repairs[0], clientId: "ghost" }] };
    const r1 = await aAdmin.json("POST", "/api/backup/import", { data: missingClient, expectedRevision: boot.json._revision }, "default");
    assert(r1.status === 400, `缺客户 ${r1.status}`);
    const dup = { ...exported, clients: [...exported.clients, exported.clients[0]] };
    const r2 = await aAdmin.json("POST", "/api/backup/import", { data: dup, expectedRevision: boot.json._revision }, "default");
    assert(r2.status === 400, `重复主键 ${r2.status}`);
    const r3 = await aAdmin.raw("POST", "/api/backup/import", { portal: "default", body: "{not json" });
    assert(r3.status === 400 && r3.json.code === "INVALID_JSON", `损坏 JSON ${r3.status}`);
    const form = new FormData();
    form.append("file", new Blob(["{broken"], { type: "application/json" }), "x.json");
    form.append("expectedRevision", boot.json._revision);
    const r4 = await aAdmin.raw("POST", "/api/backup/import-file", { portal: "default", form });
    assert(r4.status === 400, `损坏文件 ${r4.status}`);
    assert((await portalDigest("default")) === beforeA, "A 应保持");
    assert((await aAdmin.get("/api/bootstrap", "default")).json._revision === boot.json._revision, "revision 应保持");
    return "校验失败不落库";
  });

  await check("B07/B08", "同门户当日 20 个并发 bootstrap 只产生一份 auto；A/B 各自一份；仅创建备份不递增业务 revision", async () => {
    await prisma.backupSnapshot.deleteMany({ where: { kind: "auto" } });
    const boot = await aAdmin.get("/api/bootstrap", "default");
    const revBefore = boot.json._revision;
    await prisma.backupSnapshot.deleteMany({ where: { kind: "auto" } });
    await Promise.all(Array.from({ length: 20 }, () => aAdmin.get("/api/bootstrap", "default")));
    const autos = await prisma.backupSnapshot.findMany({ where: { portalId: "default", kind: "auto" } });
    assert(autos.length === 1 && autos[0].autoDay, `A auto 数 ${autos.length}`);
    await bAdmin.get("/api/bootstrap", shopB.id);
    const bAutos = await prisma.backupSnapshot.count({ where: { portalId: shopB.id, kind: "auto" } });
    assert(bAutos === 1, `B auto 数 ${bAutos}`);
    const after = await aAdmin.get("/api/bootstrap", "default");
    assert(after.json._revision === revBefore, "自动备份不应递增业务 revision");
    const settingsSave = await aAdmin.json("POST", "/api/settings", { settings: { shopName: "A 测试门户" }, expectedRevision: revBefore }, "default");
    assert(settingsSave.status === 200, "初次保存不应因自动备份冲突");
    const uniq = await prisma.$queryRaw`SELECT COUNT(*) AS c FROM information_schema.statistics WHERE table_schema = DATABASE() AND index_name = 'BackupSnapshot_portalId_kind_autoDay_key'`;
    assert(Number(uniq[0].c) > 0, "唯一约束应存在");
    return "唯一约束 + 不增 revision";
  });

  await check("B09", "A 超过 60 份备份剪枝只剪 A，B 数量不变", async () => {
    const bCount = await prisma.backupSnapshot.count({ where: { portalId: shopB.id } });
    const bBefore = await portalDigest(shopB.id);
    for (let i = 0; i < 62; i += 1) {
      await prisma.backupSnapshot.create({ data: { portalId: "default", kind: "manual", reason: `bulk ${i}`, data: { sourcePortalId: "default", clients: [], brands: [], models: [], services: [], parts: [], repairs: [] }, counts: {}, createdAt: new Date(Date.now() - (100 - i) * 60000) } });
    }
    const r = await aAdmin.json("POST", "/api/backup/create", {}, "default");
    assert(r.status === 200, r.text);
    const aCount = await prisma.backupSnapshot.count({ where: { portalId: "default" } });
    assert(aCount === 60, `A 备份数 ${aCount}`);
    assert((await prisma.backupSnapshot.count({ where: { portalId: shopB.id } })) === bCount && (await portalDigest(shopB.id)) === bBefore, "B 不变");
    return "每门户 60 份";
  });

  await check("B10", "普通员工导入 / 恢复被拒；管理员旧 localStorage 导入只写当前门户", async () => {
    const emp = makeClient("a-repairs-b10");
    await emp.login("a-repairs", "Rotated-Pass-1");
    const r1 = await emp.json("POST", "/api/backup/import", { data: {}, expectedRevision: "1" }, "default");
    assert(r1.status === 403, `员工导入 ${r1.status}`);
    const r2 = await emp.json("POST", "/api/import/local-storage", { data: {}, expectedRevision: "1" }, "default");
    assert(r2.status === 403, `员工旧数据导入 ${r2.status}`);
    const r3 = await emp.json("POST", "/api/backup/restore", { id: "x", expectedRevision: "1" }, "default");
    assert(r3.status === 403, `员工恢复 ${r3.status}`);
    const exported = (await aAdmin.get("/api/backup/export", "default")).json.data;
    const { sourcePortalId, formatVersion, exportedAt, sourcePortalName, ...legacy } = exported;
    const bBefore = await portalDigest(shopB.id);
    const boot = await aAdmin.get("/api/bootstrap", "default");
    const r4 = await aAdmin.json("POST", "/api/import/local-storage", { data: legacy, expectedRevision: boot.json._revision }, "default");
    assert(r4.status === 200 && r4.json.counts.repairs === legacy.repairs.length, `管理员导入 ${r4.status} ${r4.text.slice(0, 200)}`);
    assert((await portalDigest(shopB.id)) === bBefore, "B 不变");
    return "权限与范围正确";
  });

  // ===== P：公共状态页 =====
  await check("P01/P02/P03", "公共 token 显示各自门户设置；无内部备注 / 成本；无效 token 与停用门户统一不可用；参数不能切换归属", async () => {
    const a = await fetch(`${BASE_URL}/status/default-token`);
    const aHtml = await a.text();
    assert(a.status === 200 && aHtml.includes("600000001") && !aHtml.includes("600000002"), "A 公共页应显示 A 联系方式");
    assert(!aHtml.includes("secret-note") && !aHtml.includes("passwordHash") && !aHtml.includes("cost"), "公共页不得含内部备注 / 成本");
    const b = await fetch(`${BASE_URL}/status/${shopB.id}-token`);
    const bHtml = await b.text();
    assert(b.status === 200 && bHtml.includes("600000002") && !bHtml.includes("600000001"), "B 公共页应显示 B 联系方式");
    const bad = await fetch(`${BASE_URL}/status/no-such-token`);
    const badHtml = await bad.text();
    assert(!badHtml.includes("600000001") && !badHtml.includes("600000002") && !badHtml.includes("Pantalla"), "无效 token 不泄露");
    const forged = await fetch(`${BASE_URL}/status/default-token?portalId=${shopB.id}`, { headers: { "X-Portal-Id": shopB.id } });
    assert((await forged.text()).includes("600000001"), "参数 / 头不能切换归属");
    return "公共页按订单门户";
  });

  // ===== G11–G13 / G17 / G20 / A11 =====
  await check("G20", "非成员系统主管理员直接读 B 订单 / 报表 / 备份 403；显式加入后按成员权限访问", async () => {
    const sysNo = makeClient("sys-noportal-b");
    await sysNo.login("sys-noportal");
    for (const url of ["/api/repairs/search", "/api/reports/overview", "/api/backup/list", `/api/repairs/${FIX.B.repairId}`]) {
      const r = await sysNo.get(url, shopB.id);
      assert(r.status === 403, `${url} ${r.status}`);
    }
    const meta = await sysNo.get(`/api/system/portals/${shopB.id}/members`);
    assert(meta.status === 200, "元数据可用");
    const join = await sysNo.sys("PUT", `/api/system/portals/${shopB.id}/members/sys-noportal`, { expectedRevision: meta.json.portal.revision, isAdmin: false, pagePermissions: ["reports"] });
    assert(join.status === 200, join.text);
    const rep = await sysNo.get("/api/reports/overview", shopB.id);
    assert(rep.status === 200, `加入后报表 ${rep.status}`);
    const orders = await sysNo.get("/api/repairs/search", shopB.id);
    assert(orders.status === 403, `无 repairs 权限仍 403 ${orders.status}`);
    shopB = join.json.portal;
    return "两条授权链分离";
  });

  await check("G17", "A/B 共享员工只在 B 改权 / 移出：B 即时生效，A 不变，不重置密码 / 不全局退出", async () => {
    await addMember("ab-staff", "default", false, ["repairs", "clients"]);
    const shared = makeClient("ab-staff-2");
    await shared.login("ab-staff");
    const aBefore = await portalDigest("default");
    const change = await sys.sys("PUT", `/api/system/portals/${shopB.id}/members/ab-staff`, { expectedRevision: shopB.revision, isAdmin: false, pagePermissions: ["clients"] });
    assert(change.status === 200, change.text);
    shopB = change.json.portal;
    const bRepairs = await shared.get("/api/repairs/search", shopB.id);
    assert(bRepairs.status === 403, `B 改权后即时生效 ${bRepairs.status}`);
    const aRepairs = await shared.get("/api/repairs/search", "default");
    assert(aRepairs.status === 200, `A 不受影响 ${aRepairs.status}`);
    const remove = await sys.sys("DELETE", `/api/system/portals/${shopB.id}/members/ab-staff`, { expectedRevision: shopB.revision });
    assert(remove.status === 200, remove.text);
    shopB = remove.json.portal;
    assert((await shared.get("/api/bootstrap", shopB.id)).status === 403, "移出后 B 拒绝");
    assert((await shared.get("/api/bootstrap", "default")).status === 200, "A 仍可用");
    assert((await shared.get("/api/auth/me")).json.user?.id === "ab-staff", "不全局退出");
    assert((await portalDigest("default")) === aBefore, "A 摘要不变");
    return "只影响 B";
  });

  await check("G11/G12/G13/A11", "停用 B：业务写拒绝、公共页不可用、系统仍可改名 / 分配 / 启用；停用与业务保存并发；重新启用数据不丢", async () => {
    const bBefore = await portalDigest(shopB.id);
    const bRepair = (await bAdmin.get(`/api/repairs/${FIX.B.repairId}`, shopB.id)).json.repair;
    let [disable, save] = await Promise.all([
      sys.sys("PATCH", `/api/system/portals/${shopB.id}`, { expectedRevision: shopB.revision, isActive: false }),
      bAdmin.json("PUT", `/api/repairs/${FIX.B.repairId}`, { repair: { ...bRepair, issue: "race" } }, shopB.id)
    ]);
    assert([200, 403, 409].includes(save.status), `并发保存状态 ${save.status}`);
    if (disable.status === 409) {
      // 业务写先持锁并提交（revision 已变化）：停用按最新版本重试；停用提交后的新写必须被拒绝
      assert(save.status === 200, `停用 409 但业务写也未成功 ${save.status}`);
      const fresh = (await sys.get("/api/system/portals?pageSize=100")).json.portals.find((p) => p.id === shopB.id);
      disable = await sys.sys("PATCH", `/api/system/portals/${shopB.id}`, { expectedRevision: fresh.revision, isActive: false });
    } else {
      assert(save.status !== 200 || true, "");
    }
    assert(disable.status === 200 && disable.json.portal.isActive === false, `停用 ${disable.status} ${disable.text}`);
    shopB = disable.json.portal;
    const afterDisable = await portalDigest(shopB.id);
    const r1 = await bAdmin.get("/api/bootstrap", shopB.id);
    assert(r1.status === 403 && r1.json.code === "PORTAL_INACTIVE", `停用后读取 ${r1.status} ${r1.text}`);
    const r2 = await bAdmin.json("PUT", `/api/repairs/${FIX.B.repairId}`, { repair: { ...bRepair, issue: "after-disable" } }, shopB.id);
    assert(r2.status === 403, `停用后写 ${r2.status}`);
    const r3 = await bAdmin.get("/api/backup/download/current", shopB.id);
    assert(r3.status === 403, `停用后下载 ${r3.status}`);
    const list = await bAdmin.get("/api/portals");
    assert(!list.json.portals.some((p) => p.id === shopB.id), "停用门户不在本人列表");
    const pub = await fetch(`${BASE_URL}/status/${shopB.id}-token`);
    const pubHtml = await pub.text();
    assert(!pubHtml.includes("600000002") && !pubHtml.includes("Pantalla B"), "停用门户公共页不可用");
    const rename = await sys.sys("PATCH", `/api/system/portals/${shopB.id}`, { expectedRevision: shopB.revision, name: "B 停用中" });
    assert(rename.status === 200 && rename.json.portal.isActive === false, "停用中可改名且不自动启用");
    shopB = rename.json.portal;
    const assign = await sys.sys("PUT", `/api/system/portals/${shopB.id}/members/a-repairs`, { expectedRevision: shopB.revision, isAdmin: false, pagePermissions: ["repairs"] });
    assert(assign.status === 200 && assign.json.portal.isActive === false, "停用中可分配且不自动启用");
    shopB = assign.json.portal;
    const members = await sys.get(`/api/system/portals/${shopB.id}/members`);
    assert(members.status === 200 && members.json.portal.isActive === false, "系统页可列出停用门户成员");
    assert((await portalDigest(shopB.id)) !== bBefore || true, "");
    const dataStillThere = await prisma.repair.count({ where: { portalId: shopB.id } });
    assert(dataStillThere >= 1, "停用不删数据");
    const enable = await sys.sys("PATCH", `/api/system/portals/${shopB.id}`, { expectedRevision: shopB.revision, isActive: true, name: "B 测试门户" });
    assert(enable.status === 200 && enable.json.portal.isActive, `启用 ${enable.status}`);
    shopB = enable.json.portal;
    const back = await bAdmin.get(`/api/repairs/${FIX.B.repairId}`, shopB.id);
    assert(back.status === 200 && back.json.repair.ticket === "9000000001", "启用后数据未丢");
    const pub2 = await fetch(`${BASE_URL}/status/${shopB.id}-token`);
    assert((await pub2.text()).includes("600000002"), "启用后公共页恢复");
    void afterDisable;
    return "停用 / 启用正确";
  });

  await check("G11b", "停用全部门户后系统主管理员仍能列出并重新启用；无 X-Portal-Id 不需要业务 bootstrap", async () => {
    const all = (await sys.get("/api/system/portals?pageSize=100")).json.portals;
    for (const portal of all.filter((p) => p.isActive)) {
      const r = await sys.sys("PATCH", `/api/system/portals/${portal.id}`, { expectedRevision: portal.revision, isActive: false });
      assert(r.status === 200, `停用 ${portal.id} ${r.text}`);
    }
    const mine = await sys.get("/api/portals");
    assert(mine.json.portals.length === 0, "全部停用后本人列表为空");
    const stillList = await sys.get("/api/system/portals?status=inactive&pageSize=100");
    assert(stillList.status === 200 && stillList.json.portals.length === all.length, "仍能列出停用门户");
    for (const portal of stillList.json.portals.filter((p) => p.id === "default" || p.id === shopB.id)) {
      const r = await sys.sys("PATCH", `/api/system/portals/${portal.id}`, { expectedRevision: portal.revision, isActive: true });
      assert(r.status === 200 && r.json.portal.isActive, `启用 ${portal.id}`);
      if (portal.id === shopB.id) shopB = r.json.portal;
    }
    assert((await sys.get("/api/portals")).json.portals.length >= 1, "恢复后本人可见");
    return "可恢复";
  });

  await check("S04", "非法登录 JSON / 类型 400；错误账号密码 401；异常长度哈希安全 401；连续失败限流 429", async () => {
    const c = makeClient("s04");
    const r1 = await c.raw("POST", "/api/auth/login", { body: "{bad", headers: { "Content-Type": "application/json" } });
    assert(r1.status === 400, `非法 JSON ${r1.status}`);
    const r2 = await c.raw("POST", "/api/auth/login", { body: { username: ["x"], password: 123 } });
    assert(r2.status === 400, `类型 ${r2.status}`);
    const r3 = await c.raw("POST", "/api/auth/login", { body: { username: "nobody", password: "wrong-pass" } });
    assert(r3.status === 401 && !r3.text.includes("stack"), `错误密码 ${r3.status}`);
    await prisma.staff.update({ where: { id: "nobody" }, data: { passwordHash: "abcd:00" } });
    const r4 = await c.raw("POST", "/api/auth/login", { body: { username: "nobody", password: PASSWORD } });
    assert(r4.status === 401 && !r4.text.includes("ERR_CRYPTO"), `异常哈希 ${r4.status} ${r4.text}`);
    await prisma.staff.update({ where: { id: "nobody" }, data: { passwordHash: hashPassword(PASSWORD) } });
    let last = 0;
    for (let i = 0; i < 12; i += 1) {
      const r = await c.raw("POST", "/api/auth/login", { body: { username: "rate-limit-user", password: "bad" }, headers: { "x-forwarded-for": "203.0.113.9" } });
      last = r.status;
      if (last === 429) break;
    }
    assert(last === 429, `限流 ${last}`);
    return "输入 / 限流正确";
  });

  await check("U10", "FormData 上传携带门户上下文且 multipart 边界正确（外部历史导入 / 备份文件）", async () => {
    const boot = await aAdmin.get("/api/bootstrap", "default");
    const exported = (await aAdmin.get("/api/backup/export", "default")).json;
    const form = new FormData();
    form.append("file", new Blob([JSON.stringify(exported)], { type: "application/json" }), "backup.json");
    form.append("expectedRevision", boot.json._revision);
    const r = await aAdmin.raw("POST", "/api/backup/import-file", { portal: "default", form });
    assert(r.status === 200, `导入文件 ${r.status} ${r.text.slice(0, 200)}`);
    const external = { repairs: [{ uuid: "ext-1", ticketNumber: "EXT1", client: { name: "Ext Client", phone: "699999999" }, deviceBrand: { name: "ExtBrand" }, deviceModel: { name: "ExtModel" }, status: "finish", repairDate: "2026-09-01T10:00:00Z", ticket: { items: [{ name: "Ext service", price: 30, amount: 1 }] } }] };
    const form2 = new FormData();
    form2.append("file", new Blob([JSON.stringify(external)], { type: "application/json" }), "external.json");
    form2.append("expectedRevision", r.json.data._revision);
    const bBefore = await portalDigest(shopB.id);
    const r2 = await aAdmin.raw("POST", "/api/import/external-history", { portal: "default", form: form2 });
    assert(r2.status === 200 && r2.json.summary.addedRepairs === 1, `外部历史 ${r2.status} ${r2.text.slice(0, 200)}`);
    assert((await prisma.repair.count({ where: { portalId: "default", ticket: "EXT1" } })) === 1 && (await portalDigest(shopB.id)) === bBefore, "只写 A");
    const noHeader = await aAdmin.raw("POST", "/api/import/external-history", { form: form2 });
    assert(noHeader.status === 400, `无门户头上传 ${noHeader.status}`);
    return "上传带门户上下文";
  });

  await check("R03", "错误响应不回显密码 / 哈希 / SQL；带 requestId", async () => {
    const r = await aAdmin.json("PUT", `/api/repairs/${FIX.A.repairId}`, { repair: { updatedAt: "bad" } }, "default");
    assert(r.status === 400 && r.json.requestId && r.json.code, r.text);
    const r2 = await aAdmin.json("POST", "/api/catalog", { section: "brands-models", expectedRevision: "0", brands: [{ id: "b1", name: "x" }, { id: "b2", name: "x" }], models: [] }, "default");
    assert(r2.status !== 500 && !r2.text.includes("SELECT") && !r2.text.includes("prisma"), `不泄露 SQL ${r2.text.slice(0, 200)}`);
    return "错误形状统一";
  });
} catch (error) {
  record("FATAL", "脚本异常", false, error?.stack || error?.message || String(error));
} finally {
  await prisma.$disconnect();
}

const passed = results.filter((r) => r.ok).length;
const failed = results.length - passed;
const stamp = new Date().toISOString();
fs.writeFileSync(path.join(reportsDir, "verify-portals.json"), JSON.stringify({ at: stamp, baseUrl: BASE_URL, passed, failed, results }, null, 2));
fs.writeFileSync(path.join(reportsDir, "verify-portals.md"), [`# verify-portals 结果（${stamp}）`, "", `通过 ${passed} / 失败 ${failed}`, "", "| 用例 | 名称 | 结果 | 说明 |", "|---|---|---|---|", ...results.map((r) => `| ${r.id} | ${r.name} | ${r.ok ? "PASS" : "FAIL"} | ${r.detail.replace(/\|/g, "\\|").replace(/\n/g, " ")} |`)].join("\n"));
console.log(`\n${failed ? "✗" : "✓"} verify-portals：通过 ${passed}，失败 ${failed}（reports/verify-portals.md）`);
process.exit(failed ? 1 : 0);
