import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PAGE_PERMISSION_KEYS } from "@/lib/auth";
import { badRequest, conflict, forbidden, notFound } from "@/lib/api-errors";
import { parseExpectedRevision, withPortalWrite } from "@/lib/portal-write";
import { serializeMemberUser } from "@/lib/portal-store";
import { defaultSettings, normalizeStatus, SETTING_KEYS, statusOrder } from "@/lib/seed-data";
import { buildRepairSearchText, ticketSortValue } from "@/lib/search-text";
import crypto from "crypto";

// 所有业务数据函数都必须显式接收已校验的门户上下文 ctx（requirePortalContext 的返回值）。
// ctx 缺失直接抛错，不允许回退 default 或全库查询；写入一律经过 withPortalWrite（门户写锁 + 版本）。

const moneyNumber = (value) => Number(value || 0);
// LIKE 参数中的 % _ \ 转成字面量，保持与前端「包含」语义一致。
const likePattern = (value) => String(value).replace(/[\\%_]/g, (ch) => `\\${ch}`);
const DEFAULT_CLIENT_LEVEL = "VIP";
const CLIENT_LEVELS = [DEFAULT_CLIENT_LEVEL, "超级 VIP", "黑名单"];
const dbMoney = (value, fallback = 0) => {
  const number = Number(String(value ?? fallback).replace(",", "."));
  return Number.isFinite(number) ? number : fallback;
};
const dbSortOrder = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
};
const DEFAULT_TECHNICIAN_COLOR = "#16a34a";
const ID_CHUNK = 1000;

export function requireCtx(ctx) {
  if (!ctx || typeof ctx.portalId !== "string" || !ctx.portalId || !ctx.staff?.id) {
    throw new Error("业务数据函数必须传入已校验的门户上下文 ctx");
  }
  return ctx.portalId;
}

function formatClientName(value) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("es-ES")
    .replace(/(^|\s)(\S)/g, (match) => match.toLocaleUpperCase("es-ES"));
}

function clientNameForSave(value) {
  return formatClientName(value) || "客户";
}

function normalizeClientLevel(level) {
  return CLIENT_LEVELS.includes(level) ? level : DEFAULT_CLIENT_LEVEL;
}

// 服务端订单锁定判定（与前端 isLockingFinalStatus / isOrderLocked 一致），用于强制“仅本门户管理员可改锁定单”。
function isLockingFinalStatus(status) {
  return ["已取走", "取消"].includes(normalizeStatus(status));
}
function isOrderLockedRecord(repair, settings = {}) {
  if (settings?.enableOrderLock === false) return false;
  if (!repair || !isLockingFinalStatus(repair.status)) return false;
  const history = Array.isArray(repair.statusHistory) ? repair.statusHistory : [];
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const item = history[index] || {};
    if (item.type === "order-unlocked") return false;
    if (item.type === "order-locked") return true;
  }
  return true;
}

// 已有对象的更新 / 删除必须携带合法的 updatedAt：缺失 / 非法 400，过期 409，不允许绕过。
function assertFreshRecord(existing, expectedUpdatedAt, label = "数据") {
  if (!existing) return;
  if (expectedUpdatedAt === undefined || expectedUpdatedAt === null || expectedUpdatedAt === "") {
    throw badRequest(`缺少${label}版本（updatedAt），请刷新后重试`, "VERSION_REQUIRED");
  }
  const expected = validDate(expectedUpdatedAt);
  if (!expected) throw badRequest(`${label}版本（updatedAt）格式不正确`, "INVALID_VERSION");
  if (existing.updatedAt.getTime() !== expected.getTime()) {
    throw conflict(`${label}已被更新，请刷新后重试`, "VERSION_CONFLICT");
  }
}

// 服务端更新版本：至少为 max(当前时间, 旧 updatedAt + 1ms)，同毫秒连续写入也产生不同版本。
function nextUpdatedAt(existing) {
  const now = Date.now();
  const previous = existing?.updatedAt instanceof Date ? existing.updatedAt.getTime() : 0;
  return new Date(Math.max(now, previous + 1));
}

async function orderLockSettings(ctx, db = prisma) {
  const setting = await db.setting.findUnique({ where: { portalId: ctx.portalId } });
  const value = setting?.value || {};
  return {
    enableOrderLock: value.enableOrderLock !== false,
    allowOrderUnlock: value.allowOrderUnlock !== false
  };
}

export async function getPortalSettings(ctx, db = prisma) {
  const portalId = requireCtx(ctx);
  const setting = await db.setting.findUnique({ where: { portalId } });
  return { settings: { ...defaultSettings, ...(setting?.value || {}) }, updatedAt: setting?.updatedAt?.toISOString?.() || "" };
}

export async function getBusinessRevision(ctx, db = prisma) {
  const portalId = requireCtx(ctx);
  const portal = await db.portal.findUnique({ where: { id: portalId }, select: { revision: true } });
  if (!portal) throw forbidden("没有权限访问该门户", "PORTAL_ACCESS_DENIED");
  return portal.revision.toString();
}

// 当前门户成员（供员工页与开单技师选项）。非门户管理员只拿到本人。
export async function listPortalUsers(ctx, db = prisma) {
  const portalId = requireCtx(ctx);
  const members = await db.portalMember.findMany({
    where: { portalId },
    include: { staff: { select: { id: true, name: true, username: true, email: true, createdAt: true } } }
  });
  return members
    .sort((a, b) => a.staff.createdAt - b.staff.createdAt || a.staffId.localeCompare(b.staffId))
    .map((member) => serializeMemberUser(member.staff, member));
}

// 轻量引导：只返回当前门户的目录 / 技师 / 设置 / 成员等小数据；维修单与客户不整包下发。
export async function getBootstrapData(ctx, options = {}) {
  const portalId = requireCtx(ctx);
  const db = options.db || prisma;
  const includeRepairs = options.includeRepairs === true;
  const includeClients = options.includeClients === true;
  const includeRepairItems = options.includeRepairItems === true;
  const includeUsers = options.includeUsers !== false;
  const repairInclude = includeRepairItems
    ? { items: { orderBy: { createdAt: "asc" } }, payments: { orderBy: { paidAt: "desc" } } }
    : { payments: { orderBy: { paidAt: "desc" } } };
  const [users, technicians, clients, brands, models, services, parts, groups, repairs, itemTotals, setting, portal] = await Promise.all([
    includeUsers ? listPortalUsers(ctx, db) : Promise.resolve([]),
    db.technician.findMany({ where: { portalId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    includeClients ? db.client.findMany({ where: { portalId }, orderBy: { createdAt: "desc" } }) : Promise.resolve([]),
    db.brand.findMany({ where: { portalId }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    db.model.findMany({ where: { portalId }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    db.service.findMany({ where: { portalId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    db.part.findMany({ where: { portalId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    db.attributeGroup.findMany({ where: { portalId }, include: { attributes: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } }, orderBy: { name: "asc" } }),
    includeRepairs ? db.repair.findMany({ where: { portalId }, include: repairInclude, orderBy: { createdAt: "desc" } }) : Promise.resolve([]),
    includeRepairs && !includeRepairItems ? repairItemTotals(ctx, db) : Promise.resolve([]),
    db.setting.findUnique({ where: { portalId } }),
    db.portal.findUnique({ where: { id: portalId }, select: { id: true, name: true, revision: true } })
  ]);
  if (!portal) throw forbidden("没有权限访问该门户", "PORTAL_ACCESS_DENIED");
  const totalsByRepair = new Map((itemTotals || []).map((row) => [row.repairId, row]));

  return {
    portalId,
    portal: { id: portal.id, name: portal.name },
    users,
    technicians: technicians.map(stripPortal),
    clients: clients.map(stripPortal),
    brands: brands.map(stripPortal),
    models: models.map(stripPortal),
    services: services.map((item) => ({ ...stripPortal(item), category: item.category || "", price: moneyNumber(item.price) })),
    parts: parts.map((item) => ({ ...stripPortal(item), category: item.category || "", price: moneyNumber(item.price) })),
    attributes: groups.flatMap((group) => group.attributes.map((item) => ({ ...stripPortal(item), groupName: group.name }))),
    settings: { ...defaultSettings, ...(setting?.value || {}) },
    _settingsUpdatedAt: setting?.updatedAt?.toISOString?.() || "",
    repairs: repairs.map((repair) => serializeRepair(repair, totalsByRepair.get(repair.id), includeRepairItems)),
    _revision: portal.revision.toString()
  };
}

function stripPortal(row) {
  if (!row || typeof row !== "object") return row;
  const { portalId, ...rest } = row;
  return rest;
}

export async function getRepairById(ctx, id) {
  const portalId = requireCtx(ctx);
  const repairId = String(id || "").trim();
  if (!repairId) return null;
  const repair = await prisma.repair.findFirst({ where: { id: repairId, portalId }, include: { client: true, items: { orderBy: { createdAt: "asc" } }, payments: { orderBy: { paidAt: "desc" } } } });
  return repair ? serializeRepair(repair, null, true) : null;
}

const SEARCH_PAGE_SIZE = 20;
const STATUS_ALIASES = {
  预定: ["预定", "reserva", "Reserva", "待开始", "En espera", "待检测"],
  预定到货: ["预定到货", "预定已到货", "Reserva recibida", "Reserva recibido", "Reserva llegado", "等客户确认"],
  维修中: ["维修中", "Reparando", "处理中"],
  完成: ["完成", "Terminado", "Finalizado", "已完成"],
  已取走: ["已取走", "Entregado"],
  取消: ["取消", "Cerrado", "Cancelar", "关闭", "拒保"]
};

function statusWhere(status) {
  const aliases = STATUS_ALIASES[normalizeStatus(status)] || [status];
  return { status: { in: aliases } };
}

function statusRawSql(status) {
  const aliases = STATUS_ALIASES[normalizeStatus(status)] || [status];
  return Prisma.sql`r.status IN (${Prisma.join(aliases)})`;
}

function parsePage(value, fallback = 1) {
  if (value === undefined || value === null || value === "") return fallback;
  const text = String(value).trim();
  if (!/^\d+$/.test(text)) throw badRequest("页码必须是正整数");
  const number = Number(text);
  if (!Number.isSafeInteger(number) || number < 1) throw badRequest("页码必须是正整数");
  return number;
}

function parsePageSize(value, fallback, max = 100) {
  if (value === undefined || value === null || value === "") return fallback;
  const text = String(value).trim();
  if (!/^\d+$/.test(text)) throw badRequest("pageSize 必须是正整数");
  const number = Number(text);
  if (!Number.isSafeInteger(number) || number < 1) throw badRequest("pageSize 必须是正整数");
  return Math.min(max, number);
}

// 服务端维修单搜索：searchText 子串匹配（与前端“包含”一致）+ 结构化过滤（走索引）+ 服务端分页，全部限定当前门户。
export async function searchRepairs(ctx, params = {}) {
  const portalId = requireCtx(ctx);
  const q = String(params.q || "").trim().toLowerCase();
  const status = String(params.status || "").trim();
  const orderType = String(params.orderType || "").trim();
  const start = String(params.start || "").trim();
  const end = String(params.end || "").trim();
  const clientId = String(params.clientId || "").trim();
  const sourceRepairId = String(params.sourceRepairId || "").trim();
  const technicianKey = String(params.technicianKey || "").trim();
  const page = parsePage(params.page);
  const pageSize = parsePageSize(params.pageSize, SEARCH_PAGE_SIZE);

  const baseFilters = [{ portalId }];
  if (q) baseFilters.push({ searchText: { contains: q } });
  if (orderType) baseFilters.push({ orderType });
  if (clientId) baseFilters.push({ clientId });
  if (sourceRepairId) baseFilters.push({ sourceRepairId });
  if (technicianKey) baseFilters.push(await technicianKeyFilter(ctx, technicianKey));
  if (start) baseFilters.push({ repairTime: { gte: start } });
  // repairTime 形如 "YYYY-MM-DD HH:mm"；"~"(0x7E) 大于空格与数字，故 <= end+"~" 含 end 当天全部时间且不含次日。
  if (end) baseFilters.push({ repairTime: { lte: `${end}~` } });
  const baseWhere = { AND: baseFilters };
  const where = status ? { AND: [...baseFilters, statusWhere(status)] } : baseWhere;

  const [total, statusGroups, typeGroups, pageRows] = await Promise.all([
    prisma.repair.count({ where }),
    prisma.repair.groupBy({ by: ["status"], where: baseWhere, _count: { _all: true } }),
    prisma.repair.groupBy({ by: ["orderType"], where, _count: { _all: true } }),
    prisma.repair.findMany({
      where,
      orderBy: [{ ticketSort: "desc" }, { repairTime: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        client: { select: { name: true, phone: true } },
        payments: { orderBy: { paidAt: "desc" } }
      }
    })
  ]);

  const ids = pageRows.map((row) => row.id);
  const items = ids.length
    ? await prisma.repairItem.findMany({ where: { repairId: { in: ids }, repair: { portalId } }, orderBy: { createdAt: "asc" } })
    : [];
  const totalsByRepair = new Map();
  for (const item of items) {
    const current = totalsByRepair.get(item.repairId) || { repairId: item.repairId, itemsTotal: 0, itemsCostTotal: 0, itemsCount: 0, names: [] };
    current.itemsTotal += moneyNumber(item.qty) * moneyNumber(item.price);
    current.itemsCostTotal += moneyNumber(item.qty) * moneyNumber(item.cost);
    current.itemsCount += 1;
    if (item.name) current.names.push(item.name);
    totalsByRepair.set(item.repairId, current);
  }
  for (const current of totalsByRepair.values()) current.itemsSummary = current.names.join("，");

  const counts = Object.fromEntries(statusOrder.map((statusKey) => [statusKey, 0]));
  for (const group of statusGroups) {
    const key = normalizeStatus(group.status);
    counts[key] = (counts[key] || 0) + group._count._all;
  }
  const summary = { repairs: 0, warranties: 0 };
  for (const group of typeGroups) {
    if ((group.orderType || "repair") === "warranty") summary.warranties += group._count._all;
    else summary.repairs += group._count._all;
  }

  return {
    rows: pageRows.map((repair) => serializeRepair(repair, totalsByRepair.get(repair.id), false)),
    total,
    page,
    pageSize,
    counts,
    summary
  };
}

// 客户列表页：服务端搜索 + 每客户维修统计 + 排序 + 分页，全部限定当前门户。
const OPEN_EXCLUDED_STATUSES = ["已取走", "Entregado", "取消", "Cerrado", "Cancelar", "关闭", "拒保"];

export async function searchClients(ctx, params = {}) {
  const portalId = requireCtx(ctx);
  const q = String(params.q || "").trim().toLowerCase();
  const clientId = String(params.clientId || "").trim();
  const phone = String(params.phone || "").trim();
  const filter = String(params.filter || "all");
  const sort = String(params.sort || "latest");
  const page = parsePage(params.page);
  const pageSize = parsePageSize(params.pageSize, 20);

  const clientConds = [Prisma.sql`c.portalId = ${portalId}`];
  if (q) clientConds.push(Prisma.sql`LOWER(CONCAT_WS(' ', c.name, c.identity, c.email, c.phone, c.address)) LIKE ${`%${likePattern(q)}%`}`);
  if (clientId) clientConds.push(Prisma.sql`c.id = ${clientId}`);
  if (phone) clientConds.push(Prisma.sql`c.phone = ${phone}`);
  const clientCondSql = Prisma.join(clientConds, " AND ");

  const conds = [clientCondSql];
  if (filter === "open") conds.push(Prisma.sql`COALESCE(s.openTotal, 0) > 0`);
  if (filter === "records") conds.push(Prisma.sql`COALESCE(s.repairTotal, 0) > 0`);
  if (filter === "no-records") conds.push(Prisma.sql`COALESCE(s.repairTotal, 0) = 0`);
  const whereSql = Prisma.join(conds, " AND ");

  const orderSql = sort === "records"
    ? Prisma.sql`COALESCE(s.repairTotal, 0) DESC, c.name ASC`
    : sort === "open"
      ? Prisma.sql`COALESCE(s.openTotal, 0) DESC, COALESCE(s.repairTotal, 0) DESC, c.name ASC`
      : sort === "name"
        ? Prisma.sql`c.name ASC`
        : Prisma.sql`COALESCE(s.latestSortKey, '') DESC, COALESCE(s.repairTotal, 0) DESC, c.name ASC`;

  const statsSql = Prisma.sql`
    SELECT clientId,
           COUNT(*) AS repairTotal,
           COALESCE(SUM(status COLLATE utf8mb4_bin NOT IN (${Prisma.join(OPEN_EXCLUDED_STATUSES)})), 0) AS openTotal,
           MAX(CASE WHEN COALESCE(repairTime, '') <> '' THEN repairTime ELSE ticket END) AS latestSortKey
    FROM Repair
    WHERE portalId = ${portalId} AND clientId IN (SELECT c.id FROM Client c WHERE ${clientCondSql})
    GROUP BY clientId
  `;

  const [countRows, rows] = await Promise.all([
    prisma.$queryRaw(Prisma.sql`
      SELECT COUNT(*) AS total FROM Client c LEFT JOIN (${statsSql}) s ON s.clientId = c.id WHERE ${whereSql}
    `),
    prisma.$queryRaw(Prisma.sql`
      SELECT c.id, c.name, c.docType, c.identity, c.email, c.phone, c.address, c.comment, c.level, c.updatedAt,
             COALESCE(s.repairTotal, 0) AS repairTotal, COALESCE(s.openTotal, 0) AS openTotal
      FROM Client c LEFT JOIN (${statsSql}) s ON s.clientId = c.id
      WHERE ${whereSql} ORDER BY ${orderSql}
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
    `)
  ]);

  const clientIds = rows.map((row) => row.id);
  const latestRows = clientIds.length
    ? await prisma.$queryRaw(Prisma.sql`
        SELECT id, clientId, ticket, brand, model, status, repairTime FROM (
          SELECT r.id, r.clientId, r.ticket, r.brand, r.model, r.status, r.repairTime,
                 ROW_NUMBER() OVER (PARTITION BY r.clientId ORDER BY (CASE WHEN COALESCE(r.repairTime, '') <> '' THEN r.repairTime ELSE r.ticket END) DESC) AS rowNo
          FROM Repair r WHERE r.portalId = ${portalId} AND r.clientId IN (${Prisma.join(clientIds)})
        ) ranked WHERE rowNo = 1
      `)
    : [];
  const latestByClient = new Map(latestRows.map((row) => [row.clientId, row]));

  return {
    rows: rows.map((row) => ({
      id: row.id,
      name: row.name,
      docType: row.docType,
      identity: row.identity,
      email: row.email,
      phone: row.phone,
      address: row.address,
      comment: row.comment,
      level: row.level,
      updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
      stats: {
        total: Number(row.repairTotal || 0),
        open: Number(row.openTotal || 0),
        latest: latestByClient.get(row.id) || null
      }
    })),
    total: Number(countRows[0]?.total || 0),
    page,
    pageSize
  };
}

// 删除某个「历史维修师」（不在册、仅按姓名记录）名下的全部维修单（当前门户）。
export async function deleteTechnicianHistory(ctx, technicianKey) {
  const portalId = requireCtx(ctx);
  const key = String(technicianKey || "").trim();
  if (!key.startsWith("name:")) throw badRequest("只能删除历史维修师的记录");
  if (!key.slice(5).trim()) throw badRequest("必须指定要删除的历史维修师姓名");
  const { result, revision } = await withPortalWrite(ctx, { timeout: 60000 }, async (tx) => {
    const where = { AND: [{ portalId }, await technicianKeyFilter(ctx, key, tx)] };
    const targets = await tx.repair.findMany({ where, select: { id: true } });
    if (!targets.length) return { count: 0 };
    const ids = targets.map((row) => row.id);
    const linked = await tx.repair.count({ where: { portalId, orderType: "warranty", sourceRepairId: { in: ids }, id: { notIn: ids } } });
    if (linked) throw conflict("该维修师名下有维修单已创建保修单，不能删除", "LINKED_WARRANTY");
    return tx.repair.deleteMany({ where: { portalId, id: { in: ids } } });
  });
  return { ok: true, deleted: result.count, _revision: revision };
}

// 扫码/快速开单：候选值精确匹配当前门户的 ticket / publicToken / id。
export async function lookupRepairByScan(ctx, rawValue) {
  const portalId = requireCtx(ctx);
  const candidates = scanLookupCandidates(rawValue);
  if (!candidates.length) return null;
  const repair = await prisma.repair.findFirst({
    where: { portalId, OR: [{ ticket: { in: candidates } }, { publicToken: { in: candidates } }, { id: { in: candidates } }] },
    select: { id: true, ticket: true, orderType: true }
  });
  return repair || null;
}

function scannedTicketDigits(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) return "";
  const direct = value.match(/\bW?\d{8,}\b/i);
  if (direct) return direct[0];
  const digits = value.replace(/[^\d]/g, "");
  return digits.length >= 8 ? digits : value;
}

function scanLookupCandidates(rawValue) {
  const value = String(rawValue || "").trim();
  const candidates = new Set();
  const add = (item) => {
    const next = String(item || "").trim().toLowerCase();
    if (next) candidates.add(next);
  };
  add(value);
  add(scannedTicketDigits(value));
  try {
    const url = new URL(value);
    url.pathname.split("/").filter(Boolean).forEach(add);
    url.hash.split(/[/?#=&\s]+/).filter(Boolean).forEach(add);
    add(url.searchParams.get("ticket"));
    add(url.searchParams.get("id"));
    add(url.searchParams.get("token"));
  } catch {
    value.split(/[/?#=&\s]+/).forEach(add);
  }
  return [...candidates];
}

// 技师筛选口径与前端 repairMatchesTechnicianKey 一致，在册技师只取当前门户。
async function technicianKeyFilter(ctx, technicianKey, db = prisma) {
  const portalId = requireCtx(ctx);
  const technicians = await db.technician.findMany({ where: { portalId }, select: { id: true, name: true } });
  const knownIds = technicians.map((technician) => technician.id);
  const notKnownTechnician = knownIds.length ? { OR: [{ technicianId: "" }, { technicianId: { notIn: knownIds } }] } : {};
  if (technicianKey === "unassigned") return { AND: [notKnownTechnician, { technicianName: "" }] };
  if (technicianKey.startsWith("id:")) {
    const technicianId = technicianKey.slice(3);
    const technician = technicians.find((row) => row.id === technicianId);
    const legacyMatch = technician?.name ? [{ AND: [notKnownTechnician, { technicianName: technician.name }] }] : [];
    return { OR: [{ technicianId }, ...legacyMatch] };
  }
  if (technicianKey.startsWith("name:")) {
    return { AND: [notKnownTechnician, { technicianName: technicianKey.slice(5) }] };
  }
  return { id: "" };
}

// 列表页的「合计金额 / 技师汇总」：与 searchRepairs 相同筛选集，SQL 聚合，限定当前门户。
export async function aggregateRepairs(ctx, params = {}) {
  const portalId = requireCtx(ctx);
  const q = String(params.q || "").trim().toLowerCase();
  const status = String(params.status || "").trim();
  const orderType = String(params.orderType || "").trim();
  const start = String(params.start || "").trim();
  const end = String(params.end || "").trim();
  const clientId = String(params.clientId || "").trim();
  const sourceRepairId = String(params.sourceRepairId || "").trim();
  const technicianKey = String(params.technicianKey || "").trim();

  const conds = [Prisma.sql`r.portalId = ${portalId}`];
  if (q) conds.push(Prisma.sql`r.searchText LIKE ${`%${likePattern(q)}%`}`);
  if (status) conds.push(statusRawSql(status));
  if (orderType) conds.push(Prisma.sql`r.orderType = ${orderType}`);
  if (clientId) conds.push(Prisma.sql`r.clientId = ${clientId}`);
  if (sourceRepairId) conds.push(Prisma.sql`r.sourceRepairId = ${sourceRepairId}`);
  if (technicianKey) conds.push(await technicianKeyRawSql(ctx, technicianKey));
  if (start) conds.push(Prisma.sql`r.repairTime >= ${start}`);
  if (end) conds.push(Prisma.sql`r.repairTime <= ${`${end}~`}`);
  const whereSql = Prisma.join(conds, " AND ");

  const derivedSql = Prisma.sql`
    SELECT r.technicianId, r.technicianName COLLATE utf8mb4_bin AS technicianName, r.orderType,
           (r.status COLLATE utf8mb4_bin IN (${Prisma.join(AGG_CANCELED_STATUSES)})) AS canceled,
           (r.status COLLATE utf8mb4_bin IN (${Prisma.join(AGG_LOCKED_STATUSES)})) AS locked,
           CASE WHEN r.orderType = 'warranty' AND r.warrantyChargeable = 0 THEN 0
                ELSE GREATEST(0, (CASE WHEN COALESCE(i.itemsCount, 0) > 0 THEN COALESCE(i.itemsTotal, 0) ELSE r.budget END) - r.discountAmount) END AS charge,
           CASE WHEN COALESCE(i.itemsCostTotal, 0) > 0 THEN i.itemsCostTotal ELSE r.costAmount END AS cost
    FROM Repair r
    LEFT JOIN (${repairItemTotalsSql(portalId)}) i ON i.repairId = r.id
    WHERE ${whereSql}`;

  const [groups, technicians] = await Promise.all([
    prisma.$queryRaw(Prisma.sql`
      SELECT d.technicianId, d.technicianName,
             COALESCE(SUM(d.canceled = 0 AND d.orderType = 'warranty'), 0) AS warrantyCount,
             COALESCE(SUM(d.canceled = 0 AND d.orderType <> 'warranty'), 0) AS repairCount,
             COALESCE(SUM(CASE WHEN d.canceled = 0 THEN d.charge ELSE 0 END), 0) AS amount,
             COALESCE(SUM(CASE WHEN d.canceled = 0 THEN d.cost ELSE 0 END), 0) AS cost,
             COALESCE(SUM(d.locked = 0), 0) AS openCount
      FROM (${derivedSql}) d
      GROUP BY d.technicianId, d.technicianName
    `),
    prisma.technician.findMany({ where: { portalId } })
  ]);

  const technicianById = new Map(technicians.map((technician) => [technician.id, technician]));
  const technicianByName = new Map();
  for (const technician of technicians) {
    const name = String(technician.name || "").trim().toLowerCase();
    if (name && !technicianByName.has(name)) technicianByName.set(name, technician);
  }
  const buckets = new Map();
  const totals = { amount: 0, cost: 0, profit: 0 };
  let businessCount = 0;
  let openCount = 0;
  for (const group of groups) {
    const legacyName = String(group.technicianName || "").trim();
    const technician = technicianById.get(group.technicianId) || technicianByName.get(legacyName.toLowerCase());
    const key = technician?.id ? `id:${technician.id}` : legacyName ? `name:${legacyName}` : "unassigned";
    const bucket = buckets.get(key) || { id: key, name: technician?.name || legacyName || "", isUnassigned: key === "unassigned", orderCount: 0, repairCount: 0, warrantyCount: 0, amount: 0, cost: 0, profit: 0 };
    const repairCountValue = Number(group.repairCount);
    const warrantyCountValue = Number(group.warrantyCount);
    bucket.repairCount += repairCountValue;
    bucket.warrantyCount += warrantyCountValue;
    bucket.orderCount += repairCountValue + warrantyCountValue;
    bucket.amount += moneyNumber(group.amount);
    bucket.cost += moneyNumber(group.cost);
    bucket.profit = bucket.amount - bucket.cost;
    buckets.set(key, bucket);
    totals.amount += moneyNumber(group.amount);
    totals.cost += moneyNumber(group.cost);
    businessCount += repairCountValue + warrantyCountValue;
    openCount += Number(group.openCount);
  }
  totals.profit = totals.amount - totals.cost;

  const technicianRows = [...buckets.values()]
    .filter((row) => row.orderCount)
    .sort((a, b) => Number(a.isUnassigned) - Number(b.isUnassigned) || b.profit - a.profit || b.amount - a.amount || b.orderCount - a.orderCount || String(a.name).localeCompare(String(b.name)));

  return { totals, technicianRows, businessCount, openCount };
}

const AGG_CANCELED_STATUSES = ["取消", "Cerrado", "Cancelar", "关闭", "拒保"];
const AGG_LOCKED_STATUSES = ["已取走", "Entregado", ...AGG_CANCELED_STATUSES];

// 明细合计子查询：只统计当前门户父单下的明细（子表没有 portalId，经父单 JOIN 限定）。
export function repairItemTotalsSql(portalId) {
  return Prisma.sql`
    SELECT ri.repairId, COUNT(*) AS itemsCount, SUM(ri.qty * ri.price) AS itemsTotal, SUM(ri.qty * ri.cost) AS itemsCostTotal
    FROM RepairItem ri JOIN Repair rp ON rp.id = ri.repairId AND rp.portalId = ${portalId}
    GROUP BY ri.repairId`;
}

async function technicianKeyRawSql(ctx, technicianKey) {
  const portalId = requireCtx(ctx);
  const technicians = await prisma.technician.findMany({ where: { portalId }, select: { id: true, name: true } });
  const knownIds = technicians.map((technician) => technician.id);
  const notKnown = knownIds.length
    ? Prisma.sql`(r.technicianId = '' OR r.technicianId NOT IN (${Prisma.join(knownIds)}))`
    : Prisma.sql`1 = 1`;
  if (technicianKey === "unassigned") return Prisma.sql`(${notKnown} AND r.technicianName = '')`;
  if (technicianKey.startsWith("id:")) {
    const technicianId = technicianKey.slice(3);
    const technician = technicians.find((row) => row.id === technicianId);
    if (!technician?.name) return Prisma.sql`r.technicianId = ${technicianId}`;
    return Prisma.sql`(r.technicianId = ${technicianId} OR (${notKnown} AND r.technicianName = ${technician.name}))`;
  }
  if (technicianKey.startsWith("name:")) {
    return Prisma.sql`(${notKnown} AND r.technicianName = ${technicianKey.slice(5)})`;
  }
  return Prisma.sql`1 = 0`;
}

async function repairItemTotals(ctx, db = prisma) {
  const portalId = requireCtx(ctx);
  return db.$queryRaw(Prisma.sql`
    SELECT ri.repairId,
           CAST(COALESCE(SUM(ri.qty * ri.price), 0) AS CHAR) AS itemsTotal,
           CAST(COALESCE(SUM(ri.qty * ri.cost), 0) AS CHAR) AS itemsCostTotal,
           CAST(COUNT(*) AS CHAR) AS itemsCount,
           GROUP_CONCAT(NULLIF(ri.name, '') ORDER BY ri.createdAt ASC SEPARATOR '，') AS itemsSummary
    FROM RepairItem ri JOIN Repair rp ON rp.id = ri.repairId AND rp.portalId = ${portalId}
    GROUP BY ri.repairId`);
}

export function serializeRepair(repair, totals = null, includeItems = false) {
  const itemRows = Array.isArray(repair.items) ? repair.items : [];
  const computedItemsTotal = includeItems ? itemRows.reduce((sum, item) => sum + moneyNumber(item.qty) * moneyNumber(item.price), 0) : 0;
  const computedItemsCostTotal = includeItems ? itemRows.reduce((sum, item) => sum + moneyNumber(item.qty) * moneyNumber(item.cost), 0) : 0;
  const shared = {
    id: repair.id,
    ticket: repair.ticket,
    clientId: repair.clientId,
    brand: repair.brand,
    model: repair.model,
    issue: repair.issue,
    status: repair.status,
    repairTime: repair.repairTime,
    warrantyStart: repair.warrantyStart,
    technicianId: repair.technicianId,
    technicianName: repair.technicianName,
    budget: moneyNumber(repair.budget),
    deposit: moneyNumber(repair.deposit),
    paymentMethod: normalizeRepairPaymentMethod(repair.paymentMethod),
    discountAmount: moneyNumber(repair.discountAmount),
    costAmount: moneyNumber(repair.costAmount),
    publicToken: repair.publicToken,
    orderType: repair.orderType,
    sourceRepairId: repair.sourceRepairId,
    warrantyReason: repair.warrantyReason,
    warrantyDiagnosis: repair.warrantyDiagnosis,
    warrantyResolution: repair.warrantyResolution,
    warrantyChargeable: Boolean(repair.warrantyChargeable),
    createdAt: repair.createdAt,
    updatedAt: repair.updatedAt,
    itemsTotal: totals ? moneyNumber(totals.itemsTotal) : computedItemsTotal,
    itemsCostTotal: totals ? moneyNumber(totals.itemsCostTotal) : computedItemsCostTotal,
    itemsCount: totals ? Number(totals.itemsCount || 0) : itemRows.length,
    itemsSummary: totals ? totals.itemsSummary || "" : itemRows.map((item) => item.name).filter(Boolean).join("，"),
    itemsLoaded: includeItems,
    statusHistory: Array.isArray(repair.statusHistory) ? repair.statusHistory : [],
    clientName: repair.client?.name || "",
    clientPhone: repair.client?.phone || "",
    clientLevel: repair.client?.level || "",
    docType: repair.client?.docType || "",
    identity: repair.client?.identity || "",
    email: repair.client?.email || "",
    phone: repair.client?.phone || "",
    address: repair.client?.address || "",
    payments: Array.isArray(repair.payments) ? repair.payments.map(serializePayment) : [],
    items: includeItems
      ? itemRows.map((item) => ({ id: item.id, name: item.name, qty: moneyNumber(item.qty), price: moneyNumber(item.price), cost: moneyNumber(item.cost) }))
      : []
  };
  if (!includeItems) return shared;
  // ticketSort 是 BigInt（无法 JSON 序列化），searchText 是内部检索字段，portalId 是归属字段，都不应回传 / 写入备份。
  const { ticketSort, searchText, client: _client, portalId: _portalId, ...repairRest } = repair;
  return {
    ...repairRest,
    ...shared,
    properties: repair.properties || "",
    imei: repair.imei || "",
    internalNote: repair.internalNote || "",
    passwordType: repair.passwordType || "",
    passwordText: repair.passwordText || "",
    passwordPattern: Array.isArray(repair.passwordPattern) ? repair.passwordPattern : [],
    frontPhoto: repair.frontPhoto || "",
    backPhoto: repair.backPhoto || "",
    signatureDataUrl: repair.signatureDataUrl || "",
    signedAt: repair.signedAt || "",
    notificationLog: Array.isArray(repair.notificationLog) ? repair.notificationLog : []
  };
}

function serializePayment(payment) {
  return {
    id: payment.id,
    repairId: payment.repairId,
    amount: moneyNumber(payment.amount),
    method: payment.method || "ledger",
    note: payment.note || "",
    paidAt: payment.paidAt?.toISOString?.() || payment.paidAt || "",
    createdBy: payment.createdBy || "",
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt
  };
}

function mergeJsonRows(existing = [], incoming = []) {
  const rows = Array.isArray(existing) ? [...existing] : [];
  const seen = new Set(rows.map((row) => JSON.stringify(row)));
  for (const row of Array.isArray(incoming) ? incoming : []) {
    const key = JSON.stringify(row);
    if (!seen.has(key)) rows.push(row);
  }
  return rows;
}

const COMPACT_REPAIR_PRESERVED_FIELDS = [
  "properties",
  "imei",
  "internalNote",
  "passwordType",
  "passwordText",
  "passwordPattern",
  "frontPhoto",
  "backPhoto",
  "signatureDataUrl",
  "signedAt",
  "notificationLog"
];

function mergeCompactRepairForReplace(preservedRepair, repair) {
  const merged = { ...preservedRepair, ...repair };
  COMPACT_REPAIR_PRESERVED_FIELDS.forEach((key) => {
    merged[key] = preservedRepair[key];
  });
  merged.statusHistory = Array.isArray(repair.statusHistory) ? repair.statusHistory : (preservedRepair.statusHistory || []);
  return merged;
}

// 技师引用校验：非空 technicianId 必须是本门户在册技师，或本门户成员派生的 staff_<staffId>。
async function assertTechnicianReference(ctx, tx, technicianId) {
  const value = String(technicianId || "").trim();
  if (!value) return;
  if (value.startsWith("staff_")) {
    const member = await tx.portalMember.findUnique({ where: { staffId_portalId: { staffId: value.slice(6), portalId: ctx.portalId } }, select: { staffId: true } });
    if (!member) throw badRequest("维修师不属于当前门户", "INVALID_REFERENCE");
    return;
  }
  const technician = await tx.technician.findFirst({ where: { id: value, portalId: ctx.portalId }, select: { id: true } });
  if (!technician) throw badRequest("维修师不属于当前门户", "INVALID_REFERENCE");
}

export async function saveRepairRecord(ctx, { repair, client, createOnly = false } = {}) {
  const portalId = requireCtx(ctx);
  if (!repair?.id || typeof repair.id !== "string") throw badRequest("维修单数据不完整");
  if (repair.portalId !== undefined && repair.portalId !== portalId) throw badRequest("请求中的门户与当前门户不一致", "PORTAL_MISMATCH");
  if (client?.portalId !== undefined && client.portalId !== portalId) throw badRequest("请求中的门户与当前门户不一致", "PORTAL_MISMATCH");
  const { result, revision } = await withPortalWrite(ctx, {}, async (tx, { member }) => {
    const lockSettings = await orderLockSettings(ctx, tx);
    let savedClient = null;
    if (client?.id) {
      const clientId = String(client.id);
      const existingClient = await tx.client.findUnique({ where: { id: clientId } });
      if (existingClient && existingClient.portalId !== portalId) throw notFound("没有找到客户", "CLIENT_NOT_FOUND");
      const clientData = { name: clientNameForSave(client.name), docType: client.docType || "DNI", identity: client.identity || "", email: client.email || "", phone: client.phone || "", address: client.address || "", comment: client.comment || "", level: normalizeClientLevel(client.level) };
      if (!existingClient) {
        savedClient = await tx.client.create({ data: { id: clientId, portalId, ...clientData } });
      } else if (client.updatedAt !== undefined && client.updatedAt !== null && client.updatedAt !== "") {
        assertFreshRecord(existingClient, client.updatedAt, "客户");
        savedClient = await tx.client.update({ where: { id: clientId }, data: { ...clientData, updatedAt: nextUpdatedAt(existingClient) } });
      } else {
        // 只是引用已有客户：不重写客户资料
        savedClient = existingClient;
      }
    }

    const existing = await tx.repair.findFirst({ where: { id: repair.id, portalId }, include: { items: true, payments: true } });
    if (createOnly && existing) throw conflict("这张维修单已存在，请刷新后重试", "ALREADY_EXISTS");
    if (!createOnly && !existing) {
      const foreign = await tx.repair.findUnique({ where: { id: repair.id }, select: { id: true } });
      if (foreign) throw notFound("没有找到这张订单", "REPAIR_NOT_FOUND");
      throw notFound("这张维修单已被删除或不存在，请刷新后重试", "REPAIR_NOT_FOUND");
    }
    if (createOnly) {
      const foreign = await tx.repair.findUnique({ where: { id: repair.id }, select: { id: true } });
      if (foreign) throw conflict("维修单编号已被使用，请刷新后重试", "ALREADY_EXISTS");
    }
    if (existing) assertFreshRecord(existing, repair.updatedAt, "维修单");
    // 服务端强制：库里这张单若已锁定（已取走/取消且未解锁），只有本门户管理员且开启「允许解除订单锁定」才能修改。
    if (existing && isOrderLockedRecord(existing, lockSettings) && !(member.isAdmin && lockSettings.allowOrderUnlock)) {
      throw forbidden("订单已锁定，只有管理员可以解除锁定后再修改", "ORDER_LOCKED");
    }
    const existingRepair = existing ? serializeRepair(existing, null, true) : null;
    const repairData = { ...(existingRepair || {}), ...repair, clientId: repair.clientId || savedClient?.id || existingRepair?.clientId || "" };
    if (existingRepair && repair.itemsLoaded === false) {
      COMPACT_REPAIR_PRESERVED_FIELDS.forEach((key) => {
        repairData[key] = existingRepair[key];
      });
      repairData.statusHistory = mergeJsonRows(existingRepair.statusHistory, repair.statusHistory);
      repairData.notificationLog = mergeJsonRows(existingRepair.notificationLog, repair.notificationLog);
    }
    if (!repairData.clientId) throw badRequest("维修单缺少客户");
    const searchClient = savedClient?.id === repairData.clientId ? savedClient : await tx.client.findFirst({ where: { id: repairData.clientId, portalId } });
    if (!searchClient) throw notFound("没有找到客户", "CLIENT_NOT_FOUND");
    await assertTechnicianReference(ctx, tx, repairData.technicianId);
    const repairItems = repair.itemsLoaded === false && existing ? existing.items : (Array.isArray(repair.items) ? repair.items : []);
    const paymentCreates = repairPaymentsForSave(repairData, existing?.payments || []);
    let sourceTicket = "";
    if ((repairData.orderType || "repair") === "warranty" && repairData.sourceRepairId) {
      const source = await tx.repair.findFirst({ where: { id: repairData.sourceRepairId, portalId }, select: { ticket: true } });
      if (!source) throw badRequest("保修来源订单不存在或不属于当前门户", "INVALID_REFERENCE");
      sourceTicket = source.ticket || "";
    } else if (repairData.sourceRepairId) {
      const source = await tx.repair.findFirst({ where: { id: repairData.sourceRepairId, portalId }, select: { id: true } });
      if (!source) throw badRequest("来源订单不存在或不属于当前门户", "INVALID_REFERENCE");
    }
    const searchText = buildRepairSearchText(repairData, { client: searchClient || {}, items: repairItems, sourceTicket });
    const dbData = { ...repairPrismaData(repairData), deposit: paymentCreates.length ? depositPaymentTotal(paymentCreates) : dbMoney(repairData.deposit), searchText, ticketSort: BigInt(ticketSortValue(repairTicket(repairData))) };
    const itemCreates = repairItems.map(repairItemPrismaData);
    const repairInclude = { client: true, items: true, payments: { orderBy: { paidAt: "desc" } } };
    const savedRepair = existing
      ? await tx.repair.update({ where: { id: repair.id }, data: { ...dbData, updatedAt: nextUpdatedAt(existing), items: { deleteMany: {}, create: itemCreates }, payments: { deleteMany: {}, create: paymentCreates.map(paymentPrismaData) } }, include: repairInclude })
      : await tx.repair.create({ data: { id: repair.id, portalId, ...dbData, items: { create: itemCreates }, payments: { create: paymentCreates.map(paymentPrismaData) } }, include: repairInclude });
    return { repair: savedRepair, client: savedClient };
  });
  return {
    repair: serializeRepair(result.repair, null, true),
    client: result.client ? stripPortal(result.client) : null,
    _revision: revision
  };
}

export async function deleteRepairRecord(ctx, id, options = {}) {
  const portalId = requireCtx(ctx);
  const { revision } = await withPortalWrite(ctx, {}, async (tx, { member }) => {
    const existing = await tx.repair.findFirst({ where: { id: String(id || ""), portalId } });
    if (!existing) throw notFound("没有找到这张订单", "REPAIR_NOT_FOUND");
    assertFreshRecord(existing, options.updatedAt, "维修单");
    const lockSettings = await orderLockSettings(ctx, tx);
    if (isOrderLockedRecord(existing, lockSettings) && !(member.isAdmin && lockSettings.allowOrderUnlock)) {
      throw forbidden("订单已锁定，只有管理员可以解除锁定后再删除", "ORDER_LOCKED");
    }
    if ((existing.orderType || "repair") !== "warranty") {
      const linkedWarrantyCount = await tx.repair.count({ where: { portalId, orderType: "warranty", sourceRepairId: existing.id } });
      if (linkedWarrantyCount) throw conflict("这张维修单已有保修单，不能删除", "LINKED_WARRANTY");
    }
    await tx.repair.delete({ where: { id: existing.id } });
    return { ok: true };
  });
  return { ok: true, _revision: revision };
}

function repairPrismaData(repairData) {
  return {
    ticket: repairTicket(repairData),
    clientId: repairData.clientId,
    brand: repairData.brand || "",
    model: repairData.model || "",
    properties: repairData.properties || "",
    imei: repairData.imei || "",
    issue: repairData.issue || "",
    internalNote: repairData.internalNote || "",
    passwordType: repairData.passwordType || "",
    passwordText: repairData.passwordText || "",
    passwordPattern: Array.isArray(repairData.passwordPattern) ? repairData.passwordPattern : [],
    status: normalizeStatus(repairData.status),
    repairTime: repairData.repairTime || "",
    warrantyStart: repairData.warrantyStart || "",
    technicianId: repairData.technicianId || "",
    technicianName: repairData.technicianName || "",
    budget: dbMoney(repairData.budget),
    deposit: dbMoney(repairData.deposit),
    paymentMethod: normalizeRepairPaymentMethod(repairData.paymentMethod),
    discountAmount: dbMoney(repairData.discountAmount),
    costAmount: dbMoney(repairData.costAmount),
    frontPhoto: repairData.frontPhoto || "",
    backPhoto: repairData.backPhoto || "",
    signatureDataUrl: repairData.signatureDataUrl || "",
    signedAt: repairData.signedAt || "",
    publicToken: repairData.publicToken || cryptoId(),
    orderType: repairData.orderType || "repair",
    sourceRepairId: repairData.sourceRepairId || "",
    warrantyReason: repairData.warrantyReason || "",
    warrantyDiagnosis: repairData.warrantyDiagnosis || "",
    warrantyResolution: repairData.warrantyResolution || "",
    warrantyChargeable: Boolean(repairData.warrantyChargeable),
    statusHistory: Array.isArray(repairData.statusHistory) ? repairData.statusHistory : [],
    notificationLog: Array.isArray(repairData.notificationLog) ? repairData.notificationLog : []
  };
}

function repairItemPrismaData(item) {
  return {
    id: item.id || cryptoId(),
    name: item.name || "",
    qty: dbMoney(item.qty, 1),
    price: dbMoney(item.price),
    cost: dbMoney(item.cost)
  };
}

function repairPaymentsForSave(repairData, existingPayments = []) {
  if (Array.isArray(repairData.payments)) {
    const desired = repairData.payments.map(normalizePaymentInput).filter((payment) => payment.amount !== 0);
    if (desired.length) return desired;
    const legacyDeposit = dbMoney(repairData.deposit);
    if (legacyDeposit < 0.01) return [];
  }
  const existing = existingPayments.map(serializePayment).map(normalizePaymentInput).filter((payment) => payment.amount !== 0);
  if (existing.length) return existing;
  const legacyDeposit = dbMoney(repairData.deposit);
  if (legacyDeposit < 0.01) return [];
  return [{
    id: cryptoId(),
    amount: legacyDeposit,
    method: normalizePaymentMethod(repairData.paymentMethod, "ledger"),
    note: "历史订金",
    paidAt: validPaymentDate(repairData.repairTime || repairData.createdAt),
    createdBy: ""
  }];
}

function paymentNote(payment = {}) {
  return String(payment.note || "").trim().toLowerCase();
}

function isDepositPayment(payment = {}) {
  const note = paymentNote(payment);
  return !isDepositAdjustment(payment) && (note.includes("订金") || note.includes("历史订金") || note.includes("depósito") || note.includes("deposito"));
}

function isDepositAdjustment(payment = {}) {
  const note = paymentNote(payment);
  return note.includes("订金调整") || note.includes("ajuste de depósito") || note.includes("ajuste de deposito") || note.includes("depósito ajustado") || note.includes("deposito ajustado");
}

function normalizeRepairPaymentMethod(method) {
  const value = String(method || "").trim().toLowerCase();
  return ["none", "cash", "card"].includes(value) ? value : "none";
}

function normalizePaymentMethod(method, fallback = "ledger") {
  const value = String(method || "").trim().toLowerCase();
  if (["cash", "card", "ledger"].includes(value)) return value;
  return ["cash", "card", "ledger"].includes(fallback) ? fallback : "ledger";
}

function repairPaymentsForImport(repairData) {
  const payments = Array.isArray(repairData.payments) ? repairData.payments.map(normalizePaymentInput).filter((payment) => payment.amount !== 0) : [];
  if (payments.length || !dbMoney(repairData.deposit)) return payments;
  return [{ id: cryptoId(), amount: dbMoney(repairData.deposit), method: normalizePaymentMethod(repairData.paymentMethod, "ledger"), note: "历史订金", paidAt: validPaymentDate(repairData.repairTime || repairData.createdAt), createdBy: "" }];
}

function normalizePaymentInput(payment = {}) {
  return {
    id: payment.id || cryptoId(),
    amount: dbMoney(payment.amount),
    method: normalizePaymentMethod(payment.method, "ledger"),
    note: payment.note || "",
    paidAt: validPaymentDate(payment.paidAt || payment.createdAt),
    createdBy: payment.createdBy || ""
  };
}

function paymentPrismaData(payment) {
  const normalized = normalizePaymentInput(payment);
  return {
    id: normalized.id,
    amount: dbMoney(normalized.amount),
    method: normalizePaymentMethod(normalized.method, "ledger"),
    note: normalized.note,
    paidAt: new Date(normalized.paidAt),
    createdBy: normalized.createdBy
  };
}

function paymentTotal(payments = []) {
  return payments.reduce((sum, payment) => sum + dbMoney(payment.amount), 0);
}

function depositPaymentTotal(payments = []) {
  return Math.max(0, roundMoney(paymentTotal(payments.filter((payment) => isDepositPayment(payment) || isDepositAdjustment(payment)))));
}

function roundMoney(value) {
  return Math.round(dbMoney(value) * 100) / 100;
}

function validPaymentDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

function chunk(list, size = ID_CHUNK) {
  const chunks = [];
  for (let index = 0; index < list.length; index += size) chunks.push(list.slice(index, index + size));
  return chunks;
}

// 恢复 / 导入前：本门户要写入的 id / publicToken 若已被其他门户占用，整体拒绝（不先清空再发现冲突）。
async function assertNoCrossPortalConflicts(ctx, tx, data) {
  const portalId = requireCtx(ctx);
  const checks = [
    ["client", (data.clients || []).map((row) => row.id), "客户"],
    ["brand", (data.brands || []).map((row) => row.id), "品牌"],
    ["model", (data.models || []).map((row) => row.id), "型号"],
    ["service", (data.services || []).map((row) => row.id), "服务"],
    ["part", (data.parts || []).map((row) => row.id), "配件"],
    ["technician", (data.technicians || []).map((row) => row.id), "维修师"],
    ["attribute", (data.attributes || []).map((row) => row.id), "属性"],
    ["repair", (data.repairs || []).map((row) => row.id), "维修单"]
  ];
  for (const [model, ids, label] of checks) {
    const valid = ids.filter((value) => typeof value === "string" && value);
    for (const part of chunk(valid)) {
      const used = await tx[model].count({ where: { id: { in: part }, portalId: { not: portalId } } });
      if (used) throw conflict(`${label}编号与其他门户的数据冲突，无法恢复到当前门户`, "CROSS_PORTAL_ID_CONFLICT");
    }
  }
  const tokens = (data.repairs || []).map((row) => String(row.publicToken || "").trim()).filter(Boolean);
  for (const part of chunk(tokens)) {
    const used = await tx.repair.count({ where: { publicToken: { in: part }, portalId: { not: portalId } } });
    if (used) throw conflict("二维码编号与其他门户的维修单冲突，无法恢复到当前门户", "CROSS_PORTAL_TOKEN_CONFLICT");
  }
}

// 只删除并重建当前门户的业务数据（客户 / 目录 / 技师 / 属性 / 订单及子记录 / 设置）。
// 不触碰 Staff / PortalMember / StaffSession / Portal 管理元数据。必须在 withPortalWrite 事务内调用。
export async function replaceBusinessData(ctx, tx, data, options = {}) {
  const portalId = requireCtx(ctx);
  if (!tx) throw new Error("replaceBusinessData 必须在门户写事务内调用");
  const attributes = Array.isArray(data.attributes) ? data.attributes : [];
  const settings = sanitizeSettings({ ...defaultSettings, ...(data.settings || {}) });
  // 恢复 / 导入后的 updatedAt 统一为当前时刻，避免恢复旧时间戳让旧标签页的编辑再次被接受。
  const stampAt = options.stampAt instanceof Date ? options.stampAt : new Date();
  const clientById = new Map((data.clients || []).map((client) => [client.id, { ...client, name: clientNameForSave(client.name) }]));
  const ticketById = new Map((data.repairs || []).map((repair, index) => [repair.id, repairTicket(repair, index)]));
  const preserveItemIds = (data.repairs || []).filter((repair) => repair?.id && repair.itemsLoaded === false).map((repair) => repair.id);
  const [preservedItems, preservedRepairs] = preserveItemIds.length
    ? await Promise.all([
      tx.repairItem.findMany({ where: { repairId: { in: preserveItemIds }, repair: { portalId } }, orderBy: { createdAt: "asc" } }),
      tx.repair.findMany({ where: { id: { in: preserveItemIds }, portalId } })
    ])
    : [[], []];
  const preservedItemsByRepair = new Map();
  const preservedRepairById = new Map(preservedRepairs.map((repair) => [repair.id, repair]));
  for (const item of preservedItems) {
    const rows = preservedItemsByRepair.get(item.repairId) || [];
    rows.push(item);
    preservedItemsByRepair.set(item.repairId, rows);
  }

  await assertNoCrossPortalConflicts(ctx, tx, data);

  await tx.payment.deleteMany({ where: { repair: { portalId } } });
  await tx.repairItem.deleteMany({ where: { repair: { portalId } } });
  await tx.repair.deleteMany({ where: { portalId } });
  await tx.attribute.deleteMany({ where: { portalId } });
  await tx.attributeGroup.deleteMany({ where: { portalId } });
  await tx.model.deleteMany({ where: { portalId } });
  await tx.brand.deleteMany({ where: { portalId } });
  await tx.part.deleteMany({ where: { portalId } });
  await tx.service.deleteMany({ where: { portalId } });
  await tx.technician.deleteMany({ where: { portalId } });
  await tx.client.deleteMany({ where: { portalId } });

  const stamps = (source) => ({ ...(validDate(source?.createdAt) ? { createdAt: validDate(source.createdAt) } : {}), updatedAt: stampAt });

  for (const client of data.clients || []) {
    await tx.client.create({ data: { ...pick(client, ["id", "docType", "identity", "email", "phone", "address", "comment"]), portalId, name: clientNameForSave(client.name), level: normalizeClientLevel(client.level), ...stamps(client) } });
  }
  for (const [index, brand] of (data.brands || []).entries()) {
    await tx.brand.create({ data: { ...pick(brand, ["id", "name"]), portalId, sortOrder: dbSortOrder(brand.sortOrder, index), ...stamps(brand) } });
  }
  for (const [index, model] of (data.models || []).entries()) {
    await tx.model.create({ data: { ...pick(model, ["id", "brandId", "name"]), portalId, sortOrder: dbSortOrder(model.sortOrder, index), ...stamps(model) } });
  }
  for (const [index, service] of (data.services || []).entries()) {
    await tx.service.create({ data: { ...pick(service, ["id", "defaultName", "category", "zh", "es"]), portalId, category: service.category || "", price: dbMoney(service.price), sortOrder: dbSortOrder(service.sortOrder, index), ...stamps(service) } });
  }
  for (const [index, part] of (data.parts || []).entries()) {
    await tx.part.create({ data: { ...pick(part, ["id", "defaultName", "category", "zh", "es"]), portalId, category: part.category || "", price: dbMoney(part.price), sortOrder: dbSortOrder(part.sortOrder, index), ...stamps(part) } });
  }
  for (const [index, technician] of (data.technicians || []).entries()) {
    await tx.technician.create({
      data: {
        id: technician.id,
        portalId,
        name: technician.name || "维修师",
        phone: technician.phone || "",
        email: technician.email || "",
        color: normalizeTechnicianColor(technician.color),
        active: technician.active !== false,
        sortOrder: dbSortOrder(technician.sortOrder, index),
        ...stamps(technician)
      }
    });
  }
  const groupNames = [...new Set(attributes.map((item) => item.groupName || "其他"))];
  const groupIds = {};
  for (const groupName of groupNames.length ? groupNames : ["颜色", "其他"]) {
    const group = await tx.attributeGroup.create({ data: { portalId, name: groupName } });
    groupIds[groupName] = group.id;
  }
  for (const [index, attr] of attributes.entries()) {
    await tx.attribute.create({
      data: {
        id: attr.id,
        portalId,
        groupId: groupIds[attr.groupName || "其他"],
        defaultName: attr.defaultName || "",
        zh: attr.zh || "",
        es: attr.es || "",
        sortOrder: dbSortOrder(attr.sortOrder, index),
        ...stamps(attr)
      }
    });
  }
  for (const [index, repair] of (data.repairs || []).entries()) {
    const preservedRepair = repair.itemsLoaded === false ? preservedRepairById.get(repair.id) : null;
    const repairData = preservedRepair ? mergeCompactRepairForReplace(preservedRepair, repair) : repair;
    const repairItems = repair.itemsLoaded === false ? (preservedItemsByRepair.get(repair.id) || []) : (repair.items || []);
    const repairPayments = repairPaymentsForImport(repairData);
    await tx.repair.create({
      data: {
        id: repairData.id,
        portalId,
        ticket: repairTicket(repairData, index),
        clientId: repairData.clientId,
        brand: repairData.brand || "",
        model: repairData.model || "",
        properties: repairData.properties || "",
        imei: repairData.imei || "",
        issue: repairData.issue || "",
        internalNote: repairData.internalNote || "",
        passwordType: repairData.passwordType || "",
        passwordText: repairData.passwordText || "",
        passwordPattern: repairData.passwordPattern || [],
        status: normalizeStatus(repairData.status),
        repairTime: repairData.repairTime || "",
        warrantyStart: repairData.warrantyStart || "",
        technicianId: repairData.technicianId || "",
        technicianName: repairData.technicianName || "",
        budget: dbMoney(repairData.budget),
        deposit: repairPayments.length ? depositPaymentTotal(repairPayments) : dbMoney(repairData.deposit),
        paymentMethod: normalizeRepairPaymentMethod(repairData.paymentMethod),
        discountAmount: dbMoney(repairData.discountAmount),
        costAmount: dbMoney(repairData.costAmount),
        frontPhoto: repairData.frontPhoto || "",
        backPhoto: repairData.backPhoto || "",
        signatureDataUrl: repairData.signatureDataUrl || "",
        signedAt: repairData.signedAt || "",
        publicToken: repairData.publicToken || cryptoId(),
        orderType: repairData.orderType || "repair",
        sourceRepairId: repairData.sourceRepairId || "",
        warrantyReason: repairData.warrantyReason || "",
        warrantyDiagnosis: repairData.warrantyDiagnosis || "",
        warrantyResolution: repairData.warrantyResolution || "",
        warrantyChargeable: Boolean(repairData.warrantyChargeable),
        statusHistory: repairData.statusHistory || [],
        notificationLog: repairData.notificationLog || [],
        searchText: buildRepairSearchText(repairData, { client: clientById.get(repairData.clientId) || {}, items: repairItems, sourceTicket: ticketById.get(repairData.sourceRepairId) || "" }),
        ticketSort: BigInt(ticketSortValue(repairTicket(repairData, index))),
        ...stamps(repairData),
        items: { create: repairItems.map((item) => ({ id: item.id, name: item.name || "", qty: dbMoney(item.qty, 1), price: dbMoney(item.price), cost: dbMoney(item.cost) })) },
        payments: { create: repairPayments.map(paymentPrismaData) }
      }
    });
  }
  await tx.setting.upsert({ where: { portalId }, create: { portalId, value: settings }, update: { value: settings } });
}

// 整包恢复 / 导入入口：门户写锁 + expectedRevision + 只替换当前门户业务数据。
export async function syncFromClientData(ctx, data, options = {}) {
  parseExpectedRevision(options.expectedRevision);
  const { revision } = await withPortalWrite(ctx, { expectedRevision: options.expectedRevision, timeout: options.transactionTimeout || 300000 }, async (tx) => {
    if (typeof options.beforeReplace === "function") await options.beforeReplace(tx);
    await replaceBusinessData(ctx, tx, data, options);
    return true;
  });
  const bootstrap = await getBootstrapData(ctx);
  return { ...bootstrap, _revision: revision };
}

export async function syncTechniciansData(ctx, technicians = [], options = {}) {
  parseExpectedRevision(options.expectedRevision);
  const portalId = requireCtx(ctx);
  const rows = requireRows(technicians, "维修师").map((technician, index) => ({
    id: String(technician.id || cryptoId()).trim(),
    name: String(technician.name || "维修师").trim(),
    phone: String(technician.phone || ""),
    email: String(technician.email || ""),
    color: normalizeTechnicianColor(technician.color),
    active: technician.active !== false,
    sortOrder: dbSortOrder(technician.sortOrder, index),
    ...timestamps(technician)
  }));
  validateUniqueField(rows, "维修师", "id");
  validateUniqueField(rows, "维修师", "name", "名称重复");

  const { revision } = await withPortalWrite(ctx, { expectedRevision: options.expectedRevision, timeout: 30000 }, async (tx) => {
    const existing = await tx.technician.findMany({ where: { portalId }, select: { id: true, name: true } });
    const nextIds = new Set(rows.map((row) => row.id));
    const removed = existing.filter((item) => !nextIds.has(item.id));
    if (removed.length) {
      const removedIds = removed.map((item) => item.id);
      const removedNames = removed.map((item) => item.name).filter(Boolean);
      const usedCount = await tx.repair.count({
        where: { portalId, OR: [{ technicianId: { in: removedIds } }, { technicianName: { in: removedNames } }] }
      });
      if (usedCount > 0) throw badRequest("已有维修单使用该维修师，不能删除");
    }
    const foreignIds = rows.map((row) => row.id);
    const foreign = await tx.technician.count({ where: { id: { in: foreignIds }, portalId: { not: portalId } } });
    if (foreign) throw conflict("维修师编号与其他门户冲突", "CROSS_PORTAL_ID_CONFLICT");
    await tx.technician.deleteMany({ where: { portalId } });
    for (const row of rows) {
      await tx.technician.create({ data: { ...row, portalId } });
    }
  });

  const savedRows = await prisma.technician.findMany({ where: { portalId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  return { technicians: savedRows.map(stripPortal), _revision: revision };
}

const CATALOG_SETTING_KEYS = ["productCatalogCategories", "productServiceCategories", "productPartCategories"];

// 目录分区（HANDOFF 5.3）：section 决定允许修改的数组与设置键；未列出的数组 / 设置键一律拒绝。
export const CATALOG_SECTIONS = {
  "brands-models": { permissions: ["categories"], arrays: ["brands", "models"], settingKeys: [] },
  services: { permissions: ["services"], arrays: ["services"], settingKeys: ["productServiceCategories"] },
  parts: { permissions: ["modules"], arrays: ["parts"], settingKeys: ["productPartCategories"] },
  products: { permissions: ["services", "modules"], arrays: ["services", "parts"], settingKeys: CATALOG_SETTING_KEYS }
};

export async function syncCatalogData(ctx, data = {}, options = {}) {
  parseExpectedRevision(options.expectedRevision);
  const portalId = requireCtx(ctx);
  const section = CATALOG_SECTIONS[options.section];
  if (!section) throw badRequest("未知的目录分区（section）", "INVALID_SECTION");
  const allowedKeys = new Set([...section.arrays, "settings", "section", "expectedRevision"]);
  for (const key of Object.keys(data || {})) {
    if (!allowedKeys.has(key)) throw badRequest(`目录分区 ${options.section} 不允许提交 ${key}`, "INVALID_INPUT");
  }
  const settingsInput = data.settings && typeof data.settings === "object" && !Array.isArray(data.settings) ? data.settings : {};
  for (const key of Object.keys(settingsInput)) {
    if (!section.settingKeys.includes(key)) throw badRequest(`目录分区 ${options.section} 不允许修改设置 ${key}`, "INVALID_INPUT");
  }
  const settingsPatch = Object.fromEntries(section.settingKeys.filter((key) => settingsInput[key] !== undefined).map((key) => [key, settingsInput[key]]));

  const brands = section.arrays.includes("brands") ? requireRows(data.brands, "品牌").map((brand, index) => ({
    id: String(brand.id || cryptoId()).trim(),
    name: String(brand.name || "").trim(),
    sortOrder: dbSortOrder(brand.sortOrder, index),
    ...timestamps(brand)
  })) : null;
  const models = section.arrays.includes("models") ? requireRows(data.models, "型号").map((model, index) => ({
    id: String(model.id || cryptoId()).trim(),
    brandId: String(model.brandId || "").trim(),
    name: String(model.name || "").trim(),
    sortOrder: dbSortOrder(model.sortOrder, index),
    ...timestamps(model)
  })) : null;
  const services = section.arrays.includes("services") ? requireRows(data.services, "服务").map((service, index) => ({
    id: String(service.id || cryptoId()).trim(),
    defaultName: String(service.defaultName || "").trim(),
    category: String(service.category || ""),
    zh: String(service.zh || ""),
    es: String(service.es || ""),
    price: dbMoney(service.price),
    sortOrder: dbSortOrder(service.sortOrder, index),
    ...timestamps(service)
  })) : null;
  const parts = section.arrays.includes("parts") ? requireRows(data.parts, "配件").map((part, index) => ({
    id: String(part.id || cryptoId()).trim(),
    defaultName: String(part.defaultName || "").trim(),
    category: String(part.category || ""),
    zh: String(part.zh || ""),
    es: String(part.es || ""),
    price: dbMoney(part.price),
    sortOrder: dbSortOrder(part.sortOrder, index),
    ...timestamps(part)
  })) : null;
  validateCatalogRows({ brands, models, services, parts });

  const { revision } = await withPortalWrite(ctx, { expectedRevision: options.expectedRevision, timeout: 60000 }, async (tx) => {
    const scoped = (model) => scopedTable(tx, model, portalId);
    if (brands && models) {
      const nextModelIds = new Set(models.map((row) => row.id));
      const existingModels = await tx.model.findMany({ where: { portalId }, include: { brand: { select: { name: true } } } });
      for (const model of existingModels) {
        if (nextModelIds.has(model.id)) continue;
        const used = await tx.$queryRaw(Prisma.sql`
          SELECT COUNT(*) AS total FROM Repair
          WHERE portalId = ${portalId} AND LOWER(brand) = ${String(model.brand?.name || "").toLowerCase()}
            AND model COLLATE utf8mb4_bin = ${model.name}
        `);
        if (Number(used[0]?.total || 0) > 0) throw badRequest("该型号已有维修单，不能直接删除");
      }
      await assertNoForeignIds(tx, "model", models, portalId, "型号");
      await assertNoForeignIds(tx, "brand", brands, portalId, "品牌");
      await deleteMissingRows(scoped("model"), models);
      await deleteMissingRows(scoped("brand"), brands);
      await syncTableRows(scoped("brand"), brands, ["name", "sortOrder"], { deleteMissing: false });
      await syncTableRows(scoped("model"), models, ["brandId", "name", "sortOrder"], { deleteMissing: false });
    }
    if (services) {
      await assertNoForeignIds(tx, "service", services, portalId, "服务");
      await syncTableRows(scoped("service"), services, ["defaultName", "category", "zh", "es", "price", "sortOrder"]);
    }
    if (parts) {
      await assertNoForeignIds(tx, "part", parts, portalId, "配件");
      await syncTableRows(scoped("part"), parts, ["defaultName", "category", "zh", "es", "price", "sortOrder"]);
    }
    if (Object.keys(settingsPatch).length) {
      const current = await tx.setting.findUnique({ where: { portalId } });
      await tx.setting.upsert({
        where: { portalId },
        create: { portalId, value: { ...defaultSettings, ...settingsPatch } },
        update: { value: { ...(current?.value || defaultSettings), ...settingsPatch } }
      });
    }
  });

  const [savedBrands, savedModels, savedServices, savedParts, setting] = await Promise.all([
    prisma.brand.findMany({ where: { portalId }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.model.findMany({ where: { portalId }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.service.findMany({ where: { portalId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    prisma.part.findMany({ where: { portalId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    prisma.setting.findUnique({ where: { portalId } })
  ]);
  return {
    brands: savedBrands.map(stripPortal),
    models: savedModels.map(stripPortal),
    services: savedServices.map((item) => ({ ...stripPortal(item), category: item.category || "", price: moneyNumber(item.price) })),
    parts: savedParts.map((item) => ({ ...stripPortal(item), category: item.category || "", price: moneyNumber(item.price) })),
    settings: { ...defaultSettings, ...(setting?.value || {}) },
    _settingsUpdatedAt: setting?.updatedAt?.toISOString?.() || "",
    _revision: revision
  };
}

export async function syncAttributesData(ctx, attributes = [], options = {}) {
  parseExpectedRevision(options.expectedRevision);
  const portalId = requireCtx(ctx);
  const rows = requireRows(attributes, "属性").map((attr, index) => ({
    id: String(attr.id || cryptoId()).trim(),
    groupName: String(attr.groupName || "其他").trim() || "其他",
    defaultName: String(attr.defaultName || "").trim(),
    zh: String(attr.zh || ""),
    es: String(attr.es || ""),
    sortOrder: dbSortOrder(attr.sortOrder, index),
    ...timestamps(attr)
  }));
  validateUniqueField(rows, "属性", "id");
  rows.forEach((row) => {
    if (!row.defaultName) throw badRequest("属性名称不能为空");
  });

  const { revision } = await withPortalWrite(ctx, { expectedRevision: options.expectedRevision, timeout: 30000 }, async (tx) => {
    await assertNoForeignIds(tx, "attribute", rows, portalId, "属性");
    await tx.attribute.deleteMany({ where: { portalId } });
    await tx.attributeGroup.deleteMany({ where: { portalId } });
    const groupNames = [...new Set(rows.map((item) => item.groupName || "其他"))];
    for (const groupName of groupNames.length ? groupNames : ["颜色", "其他"]) {
      const group = await tx.attributeGroup.create({ data: { portalId, name: groupName } });
      const groupRows = rows.filter((attr) => (attr.groupName || "其他") === groupName);
      if (groupRows.length) {
        await tx.attribute.createMany({
          data: groupRows.map((attr) => ({
            id: attr.id,
            portalId,
            groupId: group.id,
            defaultName: attr.defaultName || "",
            zh: attr.zh || "",
            es: attr.es || "",
            sortOrder: attr.sortOrder,
            ...timestamps(attr)
          }))
        });
      }
    }
  });

  const groups = await prisma.attributeGroup.findMany({ where: { portalId }, include: { attributes: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } }, orderBy: { name: "asc" } });
  return {
    attributes: groups.flatMap((group) => group.attributes.map((item) => ({ ...stripPortal(item), groupName: group.name }))),
    _revision: revision
  };
}

export function mergeExternalHistoryData(currentData = {}, incomingData = {}) {
  const clients = mergeById(currentData.clients, incomingData.clients);
  const { rows: brands, idMap: brandIdMap } = mergeNamedRows(currentData.brands, incomingData.brands, "name");
  const models = mergeModels(currentData.models, incomingData.models, brandIdMap);
  const services = mergeNamedRows(currentData.services, incomingData.services, "defaultName").rows;
  const parts = mergeNamedRows(currentData.parts, incomingData.parts, "defaultName").rows;
  const attributes = mergeAttributes(currentData.attributes, incomingData.attributes);
  const { repairs, summary } = mergeRepairs(currentData.repairs, incomingData.repairs);

  return {
    data: {
      technicians: currentData.technicians || [],
      clients,
      brands,
      models,
      services,
      parts,
      attributes,
      settings: currentData.settings || incomingData.settings || defaultSettings,
      repairs
    },
    summary: {
      incomingRepairs: incomingData.repairs?.length || 0,
      ...summary
    }
  };
}

// 设置字段白名单：只保留系统已知的设置键；锁单策略键由路由按门户管理员权限单独放行。
export { SETTING_KEYS };
export const PROTECTED_SETTING_KEYS = ["allowOrderUnlock", "enableOrderLock"];

export function sanitizeSettings(value = {}) {
  const result = {};
  for (const key of SETTING_KEYS) {
    if (value[key] !== undefined) result[key] = value[key];
  }
  return result;
}

function pick(source, keys) {
  return Object.fromEntries(keys.map((key) => [key, source?.[key] ?? ""]));
}

function mergeById(currentRows = [], incomingRows = []) {
  const rows = [];
  const ids = new Set();
  for (const row of currentRows || []) {
    if (!row?.id || ids.has(row.id)) continue;
    rows.push(row);
    ids.add(row.id);
  }
  for (const row of incomingRows || []) {
    if (!row?.id || ids.has(row.id)) continue;
    rows.push(row);
    ids.add(row.id);
  }
  return rows;
}

function mergeNamedRows(currentRows = [], incomingRows = [], nameKey) {
  const rows = [];
  const idMap = new Map();
  const names = new Map();
  for (const row of currentRows || []) {
    if (!row?.id) continue;
    rows.push(row);
    const key = normalizedKey(row[nameKey]);
    if (key) names.set(key, row);
  }
  for (const row of incomingRows || []) {
    const key = normalizedKey(row?.[nameKey]);
    const existing = key ? names.get(key) : null;
    if (existing) {
      if (row?.id) idMap.set(row.id, existing.id);
      continue;
    }
    if (!row?.id) continue;
    rows.push(row);
    if (key) names.set(key, row);
    idMap.set(row.id, row.id);
  }
  return { rows, idMap };
}

function mergeModels(currentRows = [], incomingRows = [], brandIdMap = new Map()) {
  const rows = [];
  const keys = new Set();
  for (const row of currentRows || []) {
    if (!row?.id) continue;
    rows.push(row);
    keys.add(`${row.brandId}:${normalizedKey(row.name)}`);
  }
  for (const row of incomingRows || []) {
    if (!row?.id) continue;
    const brandId = brandIdMap.get(row.brandId) || row.brandId;
    const key = `${brandId}:${normalizedKey(row.name)}`;
    if (keys.has(key)) continue;
    rows.push({ ...row, brandId });
    keys.add(key);
  }
  return rows;
}

function mergeAttributes(currentRows = [], incomingRows = []) {
  const rows = [];
  const keys = new Set();
  for (const row of currentRows || []) {
    if (!row?.id) continue;
    rows.push(row);
    keys.add(`${normalizedKey(row.groupName)}:${normalizedKey(row.defaultName)}`);
  }
  for (const row of incomingRows || []) {
    if (!row?.id) continue;
    const key = `${normalizedKey(row.groupName)}:${normalizedKey(row.defaultName)}`;
    if (keys.has(key)) continue;
    rows.push(row);
    keys.add(key);
  }
  return rows;
}

function mergeRepairs(currentRows = [], incomingRows = []) {
  const rows = [];
  const ids = new Set();
  const tickets = new Set();
  const publicTokens = new Set();
  let addedRepairs = 0;
  let skippedRepairs = 0;
  let reticketedRepairs = 0;
  for (const row of currentRows || []) {
    if (!row?.id) continue;
    rows.push(row);
    ids.add(row.id);
    if (row.ticket) tickets.add(String(row.ticket));
    if (row.publicToken) publicTokens.add(String(row.publicToken));
  }
  for (const row of incomingRows || []) {
    if (!row?.id || ids.has(row.id)) {
      skippedRepairs += 1;
      continue;
    }
    let ticket = repairTicket(row, rows.length);
    if (tickets.has(ticket)) {
      reticketedRepairs += 1;
      ticket = uniqueMergedValue(`H-${ticket}`, tickets);
    }
    let publicToken = String(row.publicToken || "").trim() || cryptoId();
    if (publicTokens.has(publicToken)) publicToken = uniqueMergedValue(publicToken, publicTokens);
    rows.push({ ...row, ticket, publicToken });
    ids.add(row.id);
    tickets.add(ticket);
    publicTokens.add(publicToken);
    addedRepairs += 1;
  }
  return { repairs: rows, summary: { addedRepairs, skippedRepairs, reticketedRepairs } };
}

function uniqueMergedValue(base, usedValues) {
  let value = base;
  let index = 2;
  while (usedValues.has(value)) {
    value = `${base}-${index}`;
    index += 1;
  }
  return value;
}

function repairTicket(repairData = {}, index = 0) {
  const ticket = String(repairData.ticket || "").trim();
  if (ticket) return ticket;
  const id = String(repairData.id || "").trim();
  if (id) return `M-${id}`;
  return `M-${Date.now()}-${index + 1}`;
}

function normalizedKey(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeTechnicianColor(color) {
  const value = String(color || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : DEFAULT_TECHNICIAN_COLOR;
}

function timestamps(source, preserveUpdatedAt = false) {
  const createdAt = validDate(source?.createdAt);
  const updatedAt = validDate(source?.updatedAt);
  return {
    ...(createdAt ? { createdAt } : {}),
    ...(preserveUpdatedAt && updatedAt ? { updatedAt } : {})
  };
}

function validDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function cryptoId() {
  return crypto.randomUUID();
}

// 把 Prisma 模型委托包装成只操作当前门户的表：findMany / create / update / deleteMany 自动带 portalId。
function scopedTable(tx, modelName, portalId) {
  const model = tx[modelName];
  return {
    findMany: (args = {}) => model.findMany({ ...args, where: { ...(args.where || {}), portalId } }),
    create: ({ data }) => model.create({ data: { ...data, portalId } }),
    update: ({ where, data }) => model.update({ where, data }),
    deleteMany: ({ where }) => model.deleteMany({ where: { ...(where || {}), portalId } })
  };
}

async function assertNoForeignIds(tx, modelName, rows, portalId, label) {
  const ids = rows.map((row) => row.id).filter(Boolean);
  for (const part of chunk(ids)) {
    const used = await tx[modelName].count({ where: { id: { in: part }, portalId: { not: portalId } } });
    if (used) throw conflict(`${label}编号与其他门户冲突，请刷新后重试`, "CROSS_PORTAL_ID_CONFLICT");
  }
}

async function syncTableRows(model, rows, updateFields, options = {}) {
  if (options.deleteMissing !== false) await deleteMissingRows(model, rows);
  const existingRows = await model.findMany();
  const existingById = new Map(existingRows.map((row) => [row.id, row]));
  for (const row of rows) {
    const existing = existingById.get(row.id);
    if (!existing) {
      await model.create({ data: row });
      continue;
    }
    const updateData = Object.fromEntries(updateFields.map((field) => [field, row[field]]));
    if (updateFields.some((field) => !sameDbValue(existing[field], row[field]))) {
      await model.update({ where: { id: row.id }, data: updateData });
    }
  }
}

async function deleteMissingRows(model, rows) {
  const nextIds = new Set(rows.map((row) => row.id));
  const existingRows = await model.findMany({ select: { id: true } });
  const deleteIds = existingRows.map((row) => row.id).filter((idValue) => !nextIds.has(idValue));
  if (deleteIds.length) await model.deleteMany({ where: { id: { in: deleteIds } } });
}

function sameDbValue(left, right) {
  if (typeof right === "number") return dbMoney(left) === dbMoney(right);
  if (typeof right === "boolean") return Boolean(left) === right;
  return String(left ?? "") === String(right ?? "");
}

function requireRows(value, label) {
  if (!Array.isArray(value)) throw badRequest(`${label}必须是数组`);
  return value;
}

function validateUniqueField(rows, label, field, suffix = "重复") {
  const seen = new Set();
  rows.forEach((row, index) => {
    const value = String(row[field] || "").trim();
    if (!value) throw badRequest(`${label}第 ${index + 1} 行缺少 ${field}`);
    const key = value.toLowerCase();
    if (seen.has(key)) throw badRequest(`${label}${suffix}`);
    seen.add(key);
  });
}

function validateCatalogRows({ brands, models, services, parts }) {
  if (brands) {
    validateUniqueField(brands, "品牌", "id");
    validateUniqueField(brands, "品牌", "name", "名称重复");
  }
  if (models) {
    validateUniqueField(models, "型号", "id");
    const brandIds = new Set((brands || []).map((brand) => brand.id));
    models.forEach((model, index) => {
      if (!model.name) throw badRequest(`型号第 ${index + 1} 行名称不能为空`);
      if (!brandIds.has(model.brandId)) throw badRequest(`型号第 ${index + 1} 行品牌不存在`);
    });
  }
  if (services) {
    validateUniqueField(services, "服务", "id");
    services.forEach((service, index) => {
      if (!service.defaultName) throw badRequest(`服务第 ${index + 1} 行名称不能为空`);
    });
  }
  if (parts) {
    validateUniqueField(parts, "配件", "id");
    parts.forEach((part, index) => {
      if (!part.defaultName) throw badRequest(`配件第 ${index + 1} 行名称不能为空`);
    });
  }
}

export { PAGE_PERMISSION_KEYS };
