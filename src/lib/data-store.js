import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { defaultSettings, normalizeStatus, statusOrder } from "@/lib/seed-data";
import { buildRepairSearchText, ticketSortValue } from "@/lib/search-text";
import { DEFAULT_SHOP_ID, ensureDefaultShop } from "@/lib/shop";
import crypto from "crypto";

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

// 服务端订单锁定判定（与前端 isLockingFinalStatus / isOrderLocked 一致），用于强制“仅管理员可改锁定单”。
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
async function orderLockSettings(shopId = DEFAULT_SHOP_ID) {
  const setting = await prisma.setting.findUnique({ where: { shopId_key: { shopId, key: "main" } } });
  const value = setting?.value || {};
  return {
    enableOrderLock: value.enableOrderLock !== false,
    allowOrderUnlock: value.allowOrderUnlock !== false
  };
}

export async function getBootstrapData(options = {}) {
  const shopId = await currentShopId(options);
  const includeRepairItems = options.includeRepairItems === true;
  const includeRepairs = options.includeRepairs !== false;
  const includeClients = options.includeClients !== false;
  const repairInclude = includeRepairItems
    ? { items: true, payments: { orderBy: { paidAt: "desc" } } }
    : { payments: { orderBy: { paidAt: "desc" } } };
  const repairQuery = includeRepairs ? prisma.repair.findMany({ where: { shopId }, include: repairInclude, orderBy: { createdAt: "desc" } }) : Promise.resolve([]);
  const clientQuery = includeClients ? prisma.client.findMany({ where: { shopId }, orderBy: { createdAt: "desc" } }) : Promise.resolve([]);
  const [staff, technicians, clients, brands, models, services, parts, groups, repairs, itemTotals, settings] = await Promise.all([
    prisma.staff.findMany({ where: { shopId }, orderBy: { createdAt: "asc" } }),
    prisma.technician.findMany({ where: { shopId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    clientQuery,
    prisma.brand.findMany({ where: { shopId }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.model.findMany({ where: { shopId }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.service.findMany({ where: { shopId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    prisma.part.findMany({ where: { shopId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    prisma.attributeGroup.findMany({ where: { shopId }, include: { attributes: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } }, orderBy: { name: "asc" } }),
    repairQuery,
    includeRepairs && !includeRepairItems ? repairItemTotals(shopId) : Promise.resolve([]),
    prisma.setting.findUnique({ where: { shopId_key: { shopId, key: "main" } } })
  ]);
  const totalsByRepair = new Map((itemTotals || []).map((row) => [row.repairId, row]));

  const data = {
    users: staff.map(({ passwordHash, sessionTokenHash, sessionExpiresAt, ...item }) => item),
    technicians,
    clients,
    brands,
    models,
    services: services.map((item) => ({ ...item, category: item.category || "", price: moneyNumber(item.price) })),
    parts: parts.map((item) => ({ ...item, category: item.category || "", price: moneyNumber(item.price) })),
    attributes: groups.flatMap((group) => group.attributes.map((item) => ({ ...item, groupName: group.name }))),
    settings: { ...defaultSettings, ...(settings?.value || {}) },
    _settingsUpdatedAt: settings?.updatedAt?.toISOString?.() || "",
    repairs: repairs.map((repair) => serializeRepair(repair, totalsByRepair.get(repair.id), includeRepairItems))
  };
  return { ...data, _revision: await getBusinessRevision({ shopId }) };
}

export async function getRepairById(id, options = {}) {
  const shopId = await currentShopId(options);
  const repair = await prisma.repair.findFirst({ where: { id, shopId }, include: { items: true, payments: { orderBy: { paidAt: "desc" } } } });
  return repair ? serializeRepair(repair, null, true) : null;
}

const SEARCH_PAGE_SIZE = 20;

// 服务端维修单搜索：searchText 子串匹配（与前端“包含”一致）+ 结构化过滤（走索引）+ 服务端分页。
// 返回当页序列化维修单、总数、按状态/类型的计数，用于列表页直接渲染，避免前端全表扫描 4 万单。
export async function searchRepairs(params = {}) {
  const shopId = await currentShopId(params);
  const q = String(params.q || "").trim().toLowerCase();
  const status = String(params.status || "").trim();
  const orderType = String(params.orderType || "").trim();
  const start = String(params.start || "").trim();
  const end = String(params.end || "").trim();
  const clientId = String(params.clientId || "").trim();
  const sourceRepairId = String(params.sourceRepairId || "").trim();
  const technicianKey = String(params.technicianKey || "").trim();
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || SEARCH_PAGE_SIZE));

  const baseFilters = [{ shopId }];
  if (q) baseFilters.push({ searchText: { contains: q } });
  if (orderType) baseFilters.push({ orderType });
  if (clientId) baseFilters.push({ clientId });
  if (sourceRepairId) baseFilters.push({ sourceRepairId });
  if (technicianKey) baseFilters.push(await technicianKeyFilter(technicianKey, { shopId }));
  if (start) baseFilters.push({ repairTime: { gte: start } });
  // repairTime 形如 "YYYY-MM-DD HH:mm"；"~"(0x7E) 大于空格与数字，故 <= end+"~" 含 end 当天全部时间且不含次日。
  if (end) baseFilters.push({ repairTime: { lte: `${end}~` } });
  const baseWhere = baseFilters.length ? { AND: baseFilters } : {};
  const where = status ? { AND: [...baseFilters, { status }] } : baseWhere;

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
    ? await prisma.repairItem.findMany({ where: { shopId, repairId: { in: ids } }, orderBy: { createdAt: "asc" } })
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

// 客户列表页：服务端搜索 + 每客户维修统计（总数/未完结数/最近一单）+ 排序 + 分页。
// 口径与前端 ClientsPage 一致：未完结 = 状态归一后不是「已取走/取消」；
// 最近一单按 (repairTime 为空则回退 ticket) 字符串降序。
const OPEN_EXCLUDED_STATUSES = ["已取走", "Entregado", "取消", "Cerrado", "Cancelar", "关闭", "拒保"];

export async function searchClients(params = {}) {
  const shopId = await currentShopId(params);
  const q = String(params.q || "").trim().toLowerCase();
  const clientId = String(params.clientId || "").trim();
  const phone = String(params.phone || "").trim();
  const filter = String(params.filter || "all");
  const sort = String(params.sort || "latest");
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 20));

  // 只作用于 Client 表本身的条件（q/clientId/phone），也用于把统计子查询窄化到候选客户。
  const clientConds = [Prisma.sql`c.shopId = ${shopId}`];
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

  // 统计只对候选客户做 GROUP BY，避免每次搜索都全表聚合。
  const statsSql = Prisma.sql`
    SELECT clientId,
           COUNT(*) AS repairTotal,
           COALESCE(SUM(status COLLATE utf8mb4_bin NOT IN (${Prisma.join(OPEN_EXCLUDED_STATUSES)})), 0) AS openTotal,
           MAX(CASE WHEN COALESCE(repairTime, '') <> '' THEN repairTime ELSE ticket END) AS latestSortKey
    FROM Repair
    WHERE shopId = ${shopId} AND clientId IN (SELECT c.id FROM Client c WHERE ${clientCondSql})
    GROUP BY clientId
  `;

  const [countRows, rows] = await Promise.all([
    prisma.$queryRaw(Prisma.sql`
      SELECT COUNT(*) AS total FROM Client c LEFT JOIN (${statsSql}) s ON s.clientId = c.id WHERE ${whereSql}
    `),
    prisma.$queryRaw(Prisma.sql`
      SELECT c.id, c.name, c.docType, c.identity, c.email, c.phone, c.address, c.comment, c.level,
             COALESCE(s.repairTotal, 0) AS repairTotal, COALESCE(s.openTotal, 0) AS openTotal
      FROM Client c LEFT JOIN (${statsSql}) s ON s.clientId = c.id
      WHERE ${whereSql} ORDER BY ${orderSql}
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
    `)
  ]);

  // 当页客户的「最近一单」：窗口函数按每客户取第一条，只查当页涉及的客户。
  const clientIds = rows.map((row) => row.id);
  const latestRows = clientIds.length
    ? await prisma.$queryRaw(Prisma.sql`
        SELECT id, clientId, ticket, brand, model, status, repairTime FROM (
          SELECT r.id, r.clientId, r.ticket, r.brand, r.model, r.status, r.repairTime,
                 ROW_NUMBER() OVER (PARTITION BY r.clientId ORDER BY (CASE WHEN COALESCE(r.repairTime, '') <> '' THEN r.repairTime ELSE r.ticket END) DESC) AS rowNo
          FROM Repair r WHERE r.shopId = ${shopId} AND r.clientId IN (${Prisma.join(clientIds)})
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

// 删除某个「历史维修师」（不在册、仅按姓名记录）名下的全部维修单。
// 只允许 name: 前缀且姓名非空的历史桶：空姓名会命中「未分配」桶，等于误删无技师的单。
// 与单删接口保持同一条业务约束：名下有单已被（桶外的）保修单引用时拒绝删除。
export async function deleteTechnicianHistory(technicianKey, options = {}) {
  const shopId = await currentShopId(options);
  const key = String(technicianKey || "").trim();
  if (!key.startsWith("name:")) throwBadRequest("只能删除历史维修师的记录");
  if (!key.slice(5).trim()) throwBadRequest("必须指定要删除的历史维修师姓名");
  const where = await technicianKeyFilter(key, { shopId });
  const result = await prisma.$transaction(async (tx) => {
    const targets = await tx.repair.findMany({ where, select: { id: true } });
    if (!targets.length) return { count: 0 };
    const ids = targets.map((row) => row.id);
    const linked = await tx.repair.count({ where: { shopId, orderType: "warranty", sourceRepairId: { in: ids }, id: { notIn: ids } } });
    if (linked) {
      const error = new Error("该维修师名下有维修单已创建保修单，不能删除");
      error.status = 409;
      throw error;
    }
    return tx.repair.deleteMany({ where: { shopId, id: { in: ids } } });
  }, { timeout: 60000 });
  return { ok: true, deleted: result.count, _revisionPatch: await getRevisionPatch({ keys: ["repairs"], shopId }) };
}

// 扫码/快速开单：候选值（原文、票号数字、URL 片段）精确匹配 ticket / publicToken / id，
// 全部走唯一索引；口径与前端 findRepairByTicket/scanCandidates 一致。
export async function lookupRepairByScan(rawValue, options = {}) {
  const shopId = await currentShopId(options);
  const candidates = scanLookupCandidates(rawValue);
  if (!candidates.length) return null;
  const repair = await prisma.repair.findFirst({
    where: { shopId, OR: [{ ticket: { in: candidates } }, { publicToken: { in: candidates } }, { id: { in: candidates } }] },
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

// 技师筛选口径与前端 repairMatchesTechnicianKey 完全一致：
// - "unassigned"：technicianId 不是在册技师，且 technicianName 为空
// - "id:<技师id>"：technicianId 精确匹配，或（technicianId 不在册且 technicianName 等于该技师姓名，兼容历史单）
// - "name:<历史姓名>"：technicianId 不在册且 technicianName 等于该姓名（MySQL 排序规则天然忽略大小写）
async function technicianKeyFilter(technicianKey, options = {}) {
  const shopId = await currentShopId(options);
  const technicians = await prisma.technician.findMany({ where: { shopId }, select: { id: true, name: true } });
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
  // 未知格式：不产生任何命中，避免误返回全表
  return { id: "" };
}

// 列表页的「合计金额 / 技师汇总」：基于与 searchRepairs 相同的筛选集（含 imei/properties/证件号），
// 在服务端用一条 JOIN 聚合出每单的 itemsTotal/itemsCostTotal，再按金额规则汇总，保证与列表口径一致。
// 不分页（覆盖整个筛选集），也不依赖 page，避免翻页时重算。
export async function aggregateRepairs(params = {}) {
  const shopId = await currentShopId(params);
  const q = String(params.q || "").trim().toLowerCase();
  const status = String(params.status || "").trim();
  const orderType = String(params.orderType || "").trim();
  const start = String(params.start || "").trim();
  const end = String(params.end || "").trim();
  const clientId = String(params.clientId || "").trim();
  const sourceRepairId = String(params.sourceRepairId || "").trim();
  const technicianKey = String(params.technicianKey || "").trim();

  const conds = [Prisma.sql`r.shopId = ${shopId}`];
  if (q) conds.push(Prisma.sql`r.searchText LIKE ${`%${likePattern(q)}%`}`);
  if (status) conds.push(Prisma.sql`r.status = ${status}`);
  if (orderType) conds.push(Prisma.sql`r.orderType = ${orderType}`);
  if (clientId) conds.push(Prisma.sql`r.clientId = ${clientId}`);
  if (sourceRepairId) conds.push(Prisma.sql`r.sourceRepairId = ${sourceRepairId}`);
  if (technicianKey) conds.push(await technicianKeyRawSql(technicianKey, { shopId }));
  if (start) conds.push(Prisma.sql`r.repairTime >= ${start}`);
  if (end) conds.push(Prisma.sql`r.repairTime <= ${`${end}~`}`);
  const whereSql = Prisma.join(conds, " AND ");

  // 全部聚合在 SQL 完成（应用内存只有每技师一行的分组结果）。金额口径与前端一致：
  // charge = 保修不收费 ? 0 : max(0, (有明细行 ? 明细合计 : 预算) - 折扣)；cost = 明细成本>0 ? 明细成本 : 成本。
  // 状态判定按原始值精确匹配（COLLATE utf8mb4_bin），与前端 normalizeStatus 的映射口径一致。
  const derivedSql = Prisma.sql`
    SELECT r.technicianId, r.technicianName COLLATE utf8mb4_bin AS technicianName, r.orderType,
           (r.status COLLATE utf8mb4_bin IN (${Prisma.join(AGG_CANCELED_STATUSES)})) AS canceled,
           (r.status COLLATE utf8mb4_bin IN (${Prisma.join(AGG_LOCKED_STATUSES)})) AS locked,
           CASE WHEN r.orderType = 'warranty' AND r.warrantyChargeable = 0 THEN 0
                ELSE GREATEST(0, (CASE WHEN COALESCE(i.itemsCount, 0) > 0 THEN COALESCE(i.itemsTotal, 0) ELSE r.budget END) - r.discountAmount) END AS charge,
           CASE WHEN COALESCE(i.itemsCostTotal, 0) > 0 THEN i.itemsCostTotal ELSE r.costAmount END AS cost
    FROM Repair r
    LEFT JOIN (SELECT repairId, COUNT(*) AS itemsCount, SUM(qty * price) AS itemsTotal, SUM(qty * cost) AS itemsCostTotal FROM RepairItem WHERE shopId = ${shopId} GROUP BY repairId) i ON i.repairId = r.id
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
    prisma.technician.findMany({ where: { shopId } })
  ]);

  // JS 只负责把（技师 id / 历史姓名）小分组归并成前端桶，口径同旧 computeListAggregates。
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

// normalizeStatus 会归一为「取消 / 已取走」的全部原始值（含旧数据的西语/别名）。
const AGG_CANCELED_STATUSES = ["取消", "Cerrado", "Cancelar", "关闭", "拒保"];
const AGG_LOCKED_STATUSES = ["已取走", "Entregado", ...AGG_CANCELED_STATUSES];


// technicianKey 的原生 SQL 版本（口径同 technicianKeyFilter / 前端 repairMatchesTechnicianKey）。
async function technicianKeyRawSql(technicianKey, options = {}) {
  const shopId = await currentShopId(options);
  const technicians = await prisma.technician.findMany({ where: { shopId }, select: { id: true, name: true } });
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

async function repairItemTotals(shopId = DEFAULT_SHOP_ID) {
  const url = String(process.env.DATABASE_URL || "");
  if (!url.startsWith("mysql://")) {
    throw new Error("RepairNOTE 现在只支持 MySQL/MariaDB，请设置 DATABASE_URL=mysql://...");
  }
  // MySQL / MariaDB。标识符大小写敏感（Linux），保持与 Prisma 建表一致。
  return prisma.$queryRawUnsafe(
    "SELECT repairId," +
    " CAST(COALESCE(SUM(qty * price), 0) AS CHAR) AS itemsTotal," +
    " CAST(COALESCE(SUM(qty * cost), 0) AS CHAR) AS itemsCostTotal," +
    " CAST(COUNT(*) AS CHAR) AS itemsCount," +
    " GROUP_CONCAT(NULLIF(name, '') ORDER BY createdAt ASC SEPARATOR '，') AS itemsSummary" +
    ` FROM RepairItem WHERE shopId = '${shopId.replaceAll("'", "''")}' GROUP BY repairId`
  );
}

function serializeRepair(repair, totals = null, includeItems = false) {
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
  // ticketSort 是 BigInt（无法 JSON 序列化），searchText 是内部检索字段（最长 8000 字），都不应回传/写入备份。
  const { ticketSort, searchText, client: _client, ...repairRest } = repair;
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

export async function saveRepairRecord({ repair, client, actor } = {}) {
  const shopId = actor?.shopId || DEFAULT_SHOP_ID;
  if (!repair?.id) throwBadRequest("维修单数据不完整");
  const lockSettings = await orderLockSettings(shopId);
  const result = await prisma.$transaction(async (tx) => {
    let savedClient = null;
    if (client?.id) {
      const clientOwner = await tx.client.findUnique({ where: { id: client.id }, select: { shopId: true } });
      if (clientOwner && clientOwner.shopId !== shopId) {
        const error = new Error("客户不属于当前门店");
        error.status = 403;
        throw error;
      }
      const clientName = clientNameForSave(client.name);
      savedClient = await tx.client.upsert({
        where: { id: client.id },
        create: { id: client.id, shopId, name: clientName, docType: client.docType || "DNI", identity: client.identity || "", email: client.email || "", phone: client.phone || "", address: client.address || "", comment: client.comment || "", level: normalizeClientLevel(client.level) },
        update: { name: clientName, docType: client.docType || "DNI", identity: client.identity || "", email: client.email || "", phone: client.phone || "", address: client.address || "", comment: client.comment || "", level: normalizeClientLevel(client.level) }
      });
    }

    const existing = await tx.repair.findFirst({ where: { id: repair.id, shopId }, include: { items: true, payments: true } });
    if (!existing) {
      const repairOwner = await tx.repair.findUnique({ where: { id: repair.id }, select: { shopId: true } });
      if (repairOwner && repairOwner.shopId !== shopId) {
        const error = new Error("没有找到这张订单");
        error.status = 404;
        throw error;
      }
    }
    // 服务端强制：库里这张单若已锁定（已取走/取消且未解锁），只有管理员且开启「允许解除订单锁定」才能修改，
    // 防止普通员工绕过前端直接 PUT 篡改已锁定订单。
    if (existing && isOrderLockedRecord(existing, lockSettings) && !(actor?.isAdmin && lockSettings.allowOrderUnlock)) {
      const error = new Error("订单已锁定，只有管理员可以解除锁定后再修改");
      error.status = 403;
      throw error;
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
    if (!repairData.clientId) throwBadRequest("维修单缺少客户");
    const repairItems = repair.itemsLoaded === false && existing ? existing.items : (Array.isArray(repair.items) ? repair.items : []);
    const paymentCreates = repairPaymentsForSave(repairData, existing?.payments || []);
    const searchClient = savedClient || (repairData.clientId ? await tx.client.findFirst({ where: { id: repairData.clientId, shopId } }) : null);
    if (!searchClient) throwBadRequest("维修单客户不属于当前门店");
    let sourceTicket = "";
    if ((repairData.orderType || "repair") === "warranty" && repairData.sourceRepairId) {
      const source = await tx.repair.findFirst({ where: { id: repairData.sourceRepairId, shopId }, select: { ticket: true } });
      sourceTicket = source?.ticket || "";
    }
    const searchText = buildRepairSearchText(repairData, { client: searchClient || {}, items: repairItems, sourceTicket });
    const dbData = { ...repairPrismaData(repairData), shopId, deposit: paymentCreates.length ? depositPaymentTotal(paymentCreates) : dbMoney(repairData.deposit), searchText, ticketSort: BigInt(ticketSortValue(repairTicket(repairData))) };
    const itemCreates = repairItems.map((item) => repairItemPrismaData(item, shopId));
    const savedRepair = existing
      ? await tx.repair.update({ where: { id: repair.id }, data: { ...dbData, items: { deleteMany: {}, create: itemCreates }, payments: { deleteMany: {}, create: paymentCreates.map((payment) => paymentPrismaData(payment, shopId)) } }, include: { items: true, payments: { orderBy: { paidAt: "desc" } } } })
      : await tx.repair.create({ data: { id: repair.id, ...dbData, items: { create: itemCreates }, payments: { create: paymentCreates.map((payment) => paymentPrismaData(payment, shopId)) } }, include: { items: true, payments: { orderBy: { paidAt: "desc" } } } });
    return { repair: savedRepair, client: savedClient };
  });
  return {
    repair: serializeRepair(result.repair, null, true),
    client: result.client,
    _revision: await getBusinessRevision({ shopId })
  };
}

export async function deleteRepairRecord(id, options = {}) {
  const shopId = await currentShopId(options);
  const existing = await prisma.repair.findFirst({ where: { id, shopId } });
  if (!existing) {
    const error = new Error("没有找到这张订单");
    error.status = 404;
    throw error;
  }
  if ((existing.orderType || "repair") !== "warranty") {
    const linkedWarrantyCount = await prisma.repair.count({ where: { shopId, orderType: "warranty", sourceRepairId: id } });
    if (linkedWarrantyCount) {
      const error = new Error("这张维修单已有保修单，不能删除");
      error.status = 409;
      throw error;
    }
  }
  await prisma.repair.delete({ where: { id } });
  return { ok: true, _revision: await getBusinessRevision({ shopId }) };
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

function repairItemPrismaData(item, shopId = DEFAULT_SHOP_ID) {
  return {
    id: item.id || cryptoId(),
    shopId,
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

function isManualPaymentAdjustment(payment = {}) {
  const note = paymentNote(payment);
  return note.includes("手动收款调整") || note.includes("手动退款调整");
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

function paymentPrismaData(payment, shopId = DEFAULT_SHOP_ID) {
  const normalized = normalizePaymentInput(payment);
  return {
    id: normalized.id,
    shopId,
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

const REVISION_KEYS = ["users", "technicians", "clients", "brands", "models", "services", "parts", "attributes", "repairs", "settings"];

export async function getRevisionPatch(keys = []) {
  const options = keys && !Array.isArray(keys) ? keys : {};
  if (!Array.isArray(keys)) keys = options.keys || [];
  const shopId = await currentShopId(options);
  const uniqueKeys = [...new Set(keys)].filter((key) => REVISION_KEYS.includes(key));
  const entries = await Promise.all(uniqueKeys.map(async (key) => [key, await getRevisionSegment(key, shopId)]));
  return Object.fromEntries(entries);
}

export async function getBusinessRevision(options = {}) {
  const shopId = await currentShopId(options);
  const patch = await getRevisionPatch({ keys: REVISION_KEYS, shopId });
  return REVISION_KEYS.map((key) => patch[key]).join("|");
}

async function getRevisionSegment(key, shopId) {
  const where = { shopId };
  if (key === "users") return revisionPart("users", await revisionAggregate(prisma.staff, where));
  if (key === "technicians") return revisionPart("technicians", await revisionAggregate(prisma.technician, where));
  if (key === "clients") return revisionPart("clients", await revisionAggregate(prisma.client, where));
  if (key === "brands") return revisionPart("brands", await revisionAggregate(prisma.brand, where));
  if (key === "models") return revisionPart("models", await revisionAggregate(prisma.model, where));
  if (key === "services") return revisionPart("services", await revisionAggregate(prisma.service, where));
  if (key === "parts") return revisionPart("parts", await revisionAggregate(prisma.part, where));
  if (key === "attributes") return revisionPart("attributes", await revisionAggregate(prisma.attribute, where));
  if (key === "settings") {
    const settings = await prisma.setting.findUnique({ where: { shopId_key: { shopId, key: "main" } }, select: { updatedAt: true } });
    return `settings:${settings?.updatedAt?.toISOString?.() || ""}`;
  }
  if (key === "repairs") {
    const [repairs, repairItems, payments] = await Promise.all([
      revisionAggregate(prisma.repair, where),
      revisionAggregate(prisma.repairItem, where),
      revisionAggregate(prisma.payment, where)
    ]);
    const repairLatest = Math.max(repairs.latest, repairItems.latest, payments.latest);
    return `repairs:${repairs.count}:${repairLatest}:${repairItems.count}:${payments.count}`;
  }
  return "";
}

async function revisionAggregate(model, where) {
  const result = await model.aggregate({ where, _count: { _all: true }, _max: { updatedAt: true } });
  return { count: result._count._all, latest: Date.parse(result._max.updatedAt?.toISOString?.() || "") || 0 };
}

function revisionPart(key, value) {
  return `${key}:${value.count}:${value.latest}`;
}

export async function replaceBusinessData(data, options = {}) {
  const shopId = await currentShopId(options);
  const attributes = Array.isArray(data.attributes) ? data.attributes : [];
  const settings = { ...defaultSettings, ...(data.settings || {}) };
  const clientById = new Map((data.clients || []).map((client) => [client.id, { ...client, name: clientNameForSave(client.name) }]));
  const ticketById = new Map((data.repairs || []).map((repair, index) => [repair.id, repairTicket(repair, index)]));
  const preserveItemIds = (data.repairs || []).filter((repair) => repair?.id && repair.itemsLoaded === false).map((repair) => repair.id);
  const [preservedItems, preservedRepairs] = preserveItemIds.length
    ? await Promise.all([
      prisma.repairItem.findMany({ where: { shopId, repairId: { in: preserveItemIds } }, orderBy: { createdAt: "asc" } }),
      prisma.repair.findMany({ where: { shopId, id: { in: preserveItemIds } } })
    ])
    : [[], []];
  const preservedItemsByRepair = new Map();
  const preservedRepairById = new Map(preservedRepairs.map((repair) => [repair.id, repair]));
  for (const item of preservedItems) {
    const rows = preservedItemsByRepair.get(item.repairId) || [];
    rows.push(item);
    preservedItemsByRepair.set(item.repairId, rows);
  }
  await prisma.$transaction(async (tx) => {
    await tx.payment.deleteMany({ where: { shopId } });
    await tx.repairItem.deleteMany({ where: { shopId } });
    await tx.repair.deleteMany({ where: { shopId } });
    await tx.attribute.deleteMany({ where: { shopId } });
    await tx.attributeGroup.deleteMany({ where: { shopId } });
    await tx.model.deleteMany({ where: { shopId } });
    await tx.brand.deleteMany({ where: { shopId } });
    await tx.part.deleteMany({ where: { shopId } });
    await tx.service.deleteMany({ where: { shopId } });
    await tx.technician.deleteMany({ where: { shopId } });
    await tx.client.deleteMany({ where: { shopId } });
    if (options.replaceStaff) await tx.staff.deleteMany({ where: { shopId } });

    if (options.replaceStaff && Array.isArray(data.users)) {
      for (const user of data.users) {
        await tx.staff.create({
          data: {
            id: user.id,
            shopId,
            name: user.name || user.username || "员工",
            username: user.username,
            email: user.email || "",
            passwordHash: user.passwordHash || user.password || "",
            isAdmin: user.isAdmin ?? user.username === "ming",
            pagePermissions: Array.isArray(user.pagePermissions) ? user.pagePermissions : [],
            ...timestamps(user)
          }
        });
      }
    }
    if (!options.replaceStaff && Array.isArray(data.users)) {
      const currentStaff = await tx.staff.findMany({ where: { shopId } });
      const nextIds = new Set(data.users.map((user) => user.id).filter(Boolean));
      for (const existing of currentStaff) {
        if (!nextIds.has(existing.id) && currentStaff.length > 1) await tx.staff.delete({ where: { id: existing.id } });
      }
      for (const user of data.users) {
        const existing = user.id ? await tx.staff.findFirst({ where: { id: user.id, shopId } }) : null;
        if (!user.id && !user.password) {
          throwBadRequest("新增员工必须设置密码");
        }
        const passwordHash = user.password ? hashPassword(user.password) : existing?.passwordHash;
        if (!passwordHash) throwBadRequest("员工密码不完整");
        const row = { name: user.name || user.username || "员工", username: user.username, email: user.email || "", passwordHash, isAdmin: Boolean(user.isAdmin), pagePermissions: Array.isArray(user.pagePermissions) ? user.pagePermissions : [] };
        if (existing) await tx.staff.update({ where: { id: existing.id }, data: row });
        else await tx.staff.create({ data: { id: user.id || cryptoId(), shopId, ...row, ...timestamps(user) } });
      }
    }

    for (const client of data.clients || []) {
      await tx.client.create({ data: { shopId, ...pick(client, ["id", "docType", "identity", "email", "phone", "address", "comment"]), name: clientNameForSave(client.name), level: normalizeClientLevel(client.level), ...timestamps(client) } });
    }
    for (const [index, brand] of (data.brands || []).entries()) {
      await tx.brand.create({ data: { shopId, ...pick(brand, ["id", "name"]), sortOrder: dbSortOrder(brand.sortOrder, index), ...timestamps(brand) } });
    }
    for (const [index, model] of (data.models || []).entries()) {
      await tx.model.create({ data: { shopId, ...pick(model, ["id", "brandId", "name"]), sortOrder: dbSortOrder(model.sortOrder, index), ...timestamps(model) } });
    }
    for (const [index, service] of (data.services || []).entries()) {
      await tx.service.create({ data: { shopId, ...pick(service, ["id", "defaultName", "category", "zh", "es"]), category: service.category || "", price: service.price || 0, sortOrder: dbSortOrder(service.sortOrder, index), ...timestamps(service) } });
    }
    for (const [index, part] of (data.parts || []).entries()) {
      await tx.part.create({ data: { shopId, ...pick(part, ["id", "defaultName", "category", "zh", "es"]), category: part.category || "", price: part.price || 0, sortOrder: dbSortOrder(part.sortOrder, index), ...timestamps(part) } });
    }
    for (const [index, technician] of (data.technicians || []).entries()) {
      await tx.technician.create({
        data: {
          id: technician.id,
          shopId,
          name: technician.name || "维修师",
          phone: technician.phone || "",
          email: technician.email || "",
          color: normalizeTechnicianColor(technician.color),
          active: technician.active !== false,
          sortOrder: dbSortOrder(technician.sortOrder, index),
          ...timestamps(technician)
        }
      });
    }
    const groupNames = [...new Set(attributes.map((item) => item.groupName || "其他"))];
    const groupIds = {};
    for (const groupName of groupNames.length ? groupNames : ["颜色", "其他"]) {
      const group = await tx.attributeGroup.create({ data: { shopId, name: groupName } });
      groupIds[groupName] = group.id;
    }
    for (const [index, attr] of attributes.entries()) {
      await tx.attribute.create({
        data: {
          id: attr.id,
          shopId,
          groupId: groupIds[attr.groupName || "其他"],
          defaultName: attr.defaultName || "",
          zh: attr.zh || "",
          es: attr.es || "",
          sortOrder: dbSortOrder(attr.sortOrder, index),
          ...timestamps(attr)
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
          shopId,
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
          budget: repairData.budget || 0,
          deposit: repairPayments.length ? depositPaymentTotal(repairPayments) : repairData.deposit || 0,
          paymentMethod: normalizeRepairPaymentMethod(repairData.paymentMethod),
          discountAmount: repairData.discountAmount || 0,
          costAmount: repairData.costAmount || 0,
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
          ...timestamps(repairData),
          items: { create: repairItems.map((item) => ({ id: item.id, shopId, name: item.name || "", qty: dbMoney(item.qty, 1), price: dbMoney(item.price), cost: dbMoney(item.cost) })) },
          payments: { create: repairPayments.map((payment) => paymentPrismaData(payment, shopId)) }
        }
      });
    }
    await tx.setting.upsert({ where: { shopId_key: { shopId, key: "main" } }, create: { shopId, key: "main", value: settings }, update: { value: settings } });
  }, { timeout: options.transactionTimeout || 300000 });
}

export async function syncFromClientData(data, options = {}) {
  await replaceBusinessData(data, { ...options, replaceStaff: false });
  return getBootstrapData(options);
}

export async function syncTechniciansData(technicians = [], options = {}) {
  const shopId = await currentShopId(options);
  const rows = requireRows(technicians, "维修师").map((technician, index) => ({
    id: String(technician.id || cryptoId()).trim(),
    shopId,
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

  await prisma.$transaction(async (tx) => {
    const existing = await tx.technician.findMany({ where: { shopId }, select: { id: true, name: true } });
    const nextIds = new Set(rows.map((row) => row.id));
    const removed = existing.filter((item) => !nextIds.has(item.id));
    if (removed.length) {
      const removedIds = removed.map((item) => item.id);
      const removedNames = removed.map((item) => item.name).filter(Boolean);
      const usedCount = await tx.repair.count({
        where: {
          shopId,
          OR: [
            { technicianId: { in: removedIds } },
            { technicianName: { in: removedNames } }
          ]
        }
      });
      if (usedCount > 0) throwBadRequest("已有维修单使用该维修师，不能删除");
    }

    await tx.technician.deleteMany({ where: { shopId } });
    for (const row of rows) {
      await tx.technician.create({ data: row });
    }
  }, { timeout: 30000 });

  const savedRows = await prisma.technician.findMany({ where: { shopId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  return { technicians: savedRows, _revisionPatch: await getRevisionPatch({ keys: ["technicians"], shopId }) };
}

const CATALOG_SETTING_KEYS = ["productCatalogCategories", "productServiceCategories", "productPartCategories"];

export async function syncCatalogData(data = {}, options = {}) {
  const shopId = await currentShopId(options);
  const brands = requireRows(data.brands, "品牌").map((brand, index) => ({
    id: String(brand.id || cryptoId()).trim(),
    shopId,
    name: String(brand.name || "").trim(),
    sortOrder: dbSortOrder(brand.sortOrder, index),
    ...timestamps(brand)
  }));
  const models = requireRows(data.models, "型号").map((model, index) => ({
    id: String(model.id || cryptoId()).trim(),
    shopId,
    brandId: String(model.brandId || "").trim(),
    name: String(model.name || "").trim(),
    sortOrder: dbSortOrder(model.sortOrder, index),
    ...timestamps(model)
  }));
  const services = requireRows(data.services, "服务").map((service, index) => ({
    id: String(service.id || cryptoId()).trim(),
    shopId,
    defaultName: String(service.defaultName || "").trim(),
    category: String(service.category || ""),
    zh: String(service.zh || ""),
    es: String(service.es || ""),
    price: dbMoney(service.price),
    sortOrder: dbSortOrder(service.sortOrder, index),
    ...timestamps(service)
  }));
  const parts = requireRows(data.parts, "配件").map((part, index) => ({
    id: String(part.id || cryptoId()).trim(),
    shopId,
    defaultName: String(part.defaultName || "").trim(),
    category: String(part.category || ""),
    zh: String(part.zh || ""),
    es: String(part.es || ""),
    price: dbMoney(part.price),
    sortOrder: dbSortOrder(part.sortOrder, index),
    ...timestamps(part)
  }));
  validateCatalogRows({ brands, models, services, parts });

  const settingsInput = data.settings && typeof data.settings === "object" && !Array.isArray(data.settings) ? data.settings : {};
  const settingsPatch = Object.fromEntries(CATALOG_SETTING_KEYS.filter((key) => settingsInput[key] !== undefined).map((key) => [key, settingsInput[key]]));
  let settingsUpdatedAt = "";

  await prisma.$transaction(async (tx) => {
    // 服务端强制：要删除的型号若已有维修单使用（品牌不区分大小写、型号精确匹配，与前端口径一致），拒绝删除。
    const nextModelIds = new Set(models.map((row) => row.id));
    const existingModels = await tx.model.findMany({ where: { shopId }, include: { brand: { select: { name: true } } } });
    for (const model of existingModels) {
      if (nextModelIds.has(model.id)) continue;
      const used = await tx.$queryRaw(Prisma.sql`
        SELECT COUNT(*) AS total FROM Repair
        WHERE shopId = ${shopId}
          AND LOWER(brand) = ${String(model.brand?.name || "").toLowerCase()}
          AND model COLLATE utf8mb4_bin = ${model.name}
      `);
      if (Number(used[0]?.total || 0) > 0) throwBadRequest("该型号已有维修单，不能直接删除");
    }
    await deleteMissingRows(tx.model, models, { shopId });
    await deleteMissingRows(tx.brand, brands, { shopId });
    await syncTableRows(tx.brand, brands, ["name", "sortOrder"], { deleteMissing: false, shopId });
    await syncTableRows(tx.model, models, ["brandId", "name", "sortOrder"], { deleteMissing: false, shopId });
    await syncTableRows(tx.service, services, ["defaultName", "category", "zh", "es", "price", "sortOrder"], { shopId });
    await syncTableRows(tx.part, parts, ["defaultName", "category", "zh", "es", "price", "sortOrder"], { shopId });

    if (Object.keys(settingsPatch).length) {
      const current = await tx.setting.findUnique({ where: { shopId_key: { shopId, key: "main" } } });
      const saved = await tx.setting.upsert({
        where: { shopId_key: { shopId, key: "main" } },
        create: { shopId, key: "main", value: { ...defaultSettings, ...settingsPatch } },
        update: { value: { ...(current?.value || defaultSettings), ...settingsPatch } }
      });
      settingsUpdatedAt = saved.updatedAt?.toISOString?.() || "";
    }
  }, { timeout: 60000 });

  const [savedBrands, savedModels, savedServices, savedParts, settings] = await Promise.all([
    prisma.brand.findMany({ where: { shopId }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.model.findMany({ where: { shopId }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.service.findMany({ where: { shopId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    prisma.part.findMany({ where: { shopId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    prisma.setting.findUnique({ where: { shopId_key: { shopId, key: "main" } } })
  ]);
  const revisionKeys = ["brands", "models", "services", "parts", "settings"];
  return {
    brands: savedBrands,
    models: savedModels,
    services: savedServices.map((item) => ({ ...item, category: item.category || "", price: moneyNumber(item.price) })),
    parts: savedParts.map((item) => ({ ...item, category: item.category || "", price: moneyNumber(item.price) })),
    settings: { ...defaultSettings, ...(settings?.value || {}) },
    _settingsUpdatedAt: settingsUpdatedAt || settings?.updatedAt?.toISOString?.() || "",
    _revisionPatch: await getRevisionPatch({ keys: revisionKeys, shopId })
  };
}

export async function syncAttributesData(attributes = [], options = {}) {
  const shopId = await currentShopId(options);
  const rows = requireRows(attributes, "属性").map((attr, index) => ({
    id: String(attr.id || cryptoId()).trim(),
    shopId,
    groupName: String(attr.groupName || "其他").trim() || "其他",
    defaultName: String(attr.defaultName || "").trim(),
    zh: String(attr.zh || ""),
    es: String(attr.es || ""),
    sortOrder: dbSortOrder(attr.sortOrder, index),
    ...timestamps(attr)
  }));
  validateUniqueField(rows, "属性", "id");
  rows.forEach((row) => {
    if (!row.defaultName) throwBadRequest("属性名称不能为空");
  });

  await prisma.$transaction(async (tx) => {
    await tx.attribute.deleteMany({ where: { shopId } });
    await tx.attributeGroup.deleteMany({ where: { shopId } });
    const groupNames = [...new Set(rows.map((item) => item.groupName || "其他"))];
    for (const groupName of groupNames.length ? groupNames : ["颜色", "其他"]) {
      await tx.attributeGroup.create({
        data: {
          shopId,
          name: groupName,
          attributes: {
            create: rows
              .filter((attr) => (attr.groupName || "其他") === groupName)
              .map((attr) => ({
                id: attr.id,
                shopId,
                defaultName: attr.defaultName || "",
                zh: attr.zh || "",
                es: attr.es || "",
                sortOrder: attr.sortOrder,
                ...timestamps(attr)
              }))
          }
        }
      });
    }
  }, { timeout: 30000 });

  const groups = await prisma.attributeGroup.findMany({ where: { shopId }, include: { attributes: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } }, orderBy: { name: "asc" } });
  return {
    attributes: groups.flatMap((group) => group.attributes.map((item) => ({ ...item, groupName: group.name }))),
    _revisionPatch: await getRevisionPatch({ keys: ["attributes"], shopId })
  };
}

export async function syncNonRepairBusinessData(data, options = {}) {
  const shopId = await currentShopId(options);
  const attributes = Array.isArray(data.attributes) ? data.attributes : [];
  const settings = { ...defaultSettings, ...(data.settings || {}) };
  await prisma.$transaction(async (tx) => {
    if (options.syncClients !== false && Array.isArray(data.clients)) {
      const nextClientIds = new Set(data.clients.map((client) => client.id).filter(Boolean));
      const existingClients = await tx.client.findMany({ where: { shopId }, select: { id: true } });
      for (const existing of existingClients) {
        if (!nextClientIds.has(existing.id)) await tx.client.delete({ where: { id: existing.id } });
      }
      for (const client of data.clients) {
        const existing = client.id ? await tx.client.findFirst({ where: { id: client.id, shopId } }) : null;
        const row = { docType: client.docType || "DNI", identity: client.identity || "", email: client.email || "", phone: client.phone || "", address: client.address || "", comment: client.comment || "", name: clientNameForSave(client.name), level: normalizeClientLevel(client.level) };
        if (existing) await tx.client.update({ where: { id: existing.id }, data: row });
        else await tx.client.create({ data: { shopId, ...pick(client, ["id"]), ...row, ...timestamps(client) } });
      }
    }

    await tx.attribute.deleteMany({ where: { shopId } });
    await tx.attributeGroup.deleteMany({ where: { shopId } });
    await tx.model.deleteMany({ where: { shopId } });
    await tx.brand.deleteMany({ where: { shopId } });
    await tx.part.deleteMany({ where: { shopId } });
    await tx.service.deleteMany({ where: { shopId } });
    await tx.technician.deleteMany({ where: { shopId } });

    for (const [index, brand] of (data.brands || []).entries()) {
      await tx.brand.create({ data: { shopId, ...pick(brand, ["id", "name"]), sortOrder: dbSortOrder(brand.sortOrder, index), ...timestamps(brand) } });
    }
    for (const [index, model] of (data.models || []).entries()) {
      await tx.model.create({ data: { shopId, ...pick(model, ["id", "brandId", "name"]), sortOrder: dbSortOrder(model.sortOrder, index), ...timestamps(model) } });
    }
    for (const [index, service] of (data.services || []).entries()) {
      await tx.service.create({ data: { shopId, ...pick(service, ["id", "defaultName", "category", "zh", "es"]), category: service.category || "", price: service.price || 0, sortOrder: dbSortOrder(service.sortOrder, index), ...timestamps(service) } });
    }
    for (const [index, part] of (data.parts || []).entries()) {
      await tx.part.create({ data: { shopId, ...pick(part, ["id", "defaultName", "category", "zh", "es"]), category: part.category || "", price: part.price || 0, sortOrder: dbSortOrder(part.sortOrder, index), ...timestamps(part) } });
    }
    for (const [index, technician] of (data.technicians || []).entries()) {
      await tx.technician.create({
        data: {
          id: technician.id,
          shopId,
          name: technician.name || "维修师",
          phone: technician.phone || "",
          email: technician.email || "",
          color: normalizeTechnicianColor(technician.color),
          active: technician.active !== false,
          sortOrder: dbSortOrder(technician.sortOrder, index),
          ...timestamps(technician)
        }
      });
    }
    const groupNames = [...new Set(attributes.map((item) => item.groupName || "其他"))];
    for (const groupName of groupNames.length ? groupNames : ["颜色", "其他"]) {
      await tx.attributeGroup.create({
        data: {
          shopId,
          name: groupName,
          attributes: {
            create: attributes
              .filter((attr) => (attr.groupName || "其他") === groupName)
              .map((attr, index) => ({
                id: attr.id,
                shopId,
                defaultName: attr.defaultName || "",
                zh: attr.zh || "",
                es: attr.es || "",
                sortOrder: dbSortOrder(attr.sortOrder, index),
                ...timestamps(attr)
              }))
          }
        }
      });
    }
    await tx.setting.upsert({ where: { shopId_key: { shopId, key: "main" } }, create: { shopId, key: "main", value: settings }, update: { value: settings } });
  }, { timeout: options.transactionTimeout || 120000 });
  return getBootstrapData({ shopId, includeRepairs: options.includeRepairs !== false });
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
      ...currentData,
      users: currentData.users || [],
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

export function businessRevision(data) {
  const keys = ["users", "technicians", "clients", "brands", "models", "services", "parts", "attributes", "repairs"];
  return keys
    .map((key) => {
      const rows = Array.isArray(data[key]) ? data[key] : [];
      const latest = rows.reduce((max, row) => Math.max(max, Date.parse(row.updatedAt || row.createdAt || "") || 0), 0);
      const nestedCount = key === "repairs" ? rows.reduce((sum, row) => sum + (Array.isArray(row.payments) ? row.payments.length : 0), 0) : 0;
      return `${key}:${rows.length}:${latest}${key === "repairs" ? `:${nestedCount}` : ""}`;
    })
    .concat(`settings:${data._settingsUpdatedAt || ""}`)
    .join("|");
}

export async function ensureDefaultSettings() {
  const shopId = (await ensureDefaultShop()).id;
  await prisma.setting.upsert({
    where: { shopId_key: { shopId, key: "main" } },
    create: { shopId, key: "main", value: defaultSettings },
    update: {}
  });
}

async function currentShopId(options = {}) {
  if (options.shopId) return options.shopId;
  return (await ensureDefaultShop()).id;
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

function timestamps(source) {
  const createdAt = validDate(source?.createdAt);
  return createdAt ? { createdAt } : {};
}

function validDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function cryptoId() {
  return crypto.randomUUID();
}

async function syncTableRows(model, rows, updateFields, options = {}) {
  if (options.deleteMissing !== false) await deleteMissingRows(model, rows, options);
  const existingRows = await model.findMany({ where: options.shopId ? { shopId: options.shopId } : undefined });
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

async function deleteMissingRows(model, rows, options = {}) {
  const nextIds = new Set(rows.map((row) => row.id));
  const existingRows = await model.findMany({ where: options.shopId ? { shopId: options.shopId } : undefined, select: { id: true } });
  const deleteIds = existingRows.map((row) => row.id).filter((idValue) => !nextIds.has(idValue));
  if (deleteIds.length) await model.deleteMany({ where: { id: { in: deleteIds }, ...(options.shopId ? { shopId: options.shopId } : {}) } });
}

function sameDbValue(left, right) {
  if (typeof right === "number") return dbMoney(left) === dbMoney(right);
  if (typeof right === "boolean") return Boolean(left) === right;
  return String(left ?? "") === String(right ?? "");
}

function requireRows(value, label) {
  if (!Array.isArray(value)) throwBadRequest(`${label}必须是数组`);
  return value;
}

function validateUniqueField(rows, label, field, suffix = "重复") {
  const seen = new Set();
  rows.forEach((row, index) => {
    const value = String(row[field] || "").trim();
    if (!value) throwBadRequest(`${label}第 ${index + 1} 行缺少 ${field}`);
    const key = value.toLowerCase();
    if (seen.has(key)) throwBadRequest(`${label}${suffix}`);
    seen.add(key);
  });
}

function validateCatalogRows({ brands, models, services, parts }) {
  validateUniqueField(brands, "品牌", "id");
  validateUniqueField(brands, "品牌", "name", "名称重复");
  validateUniqueField(models, "型号", "id");
  validateUniqueField(services, "服务", "id");
  validateUniqueField(parts, "配件", "id");
  const brandIds = new Set(brands.map((brand) => brand.id));
  models.forEach((model, index) => {
    if (!model.name) throwBadRequest(`型号第 ${index + 1} 行名称不能为空`);
    if (!brandIds.has(model.brandId)) throwBadRequest(`型号第 ${index + 1} 行品牌不存在`);
  });
  services.forEach((service, index) => {
    if (!service.defaultName) throwBadRequest(`服务第 ${index + 1} 行名称不能为空`);
  });
  parts.forEach((part, index) => {
    if (!part.defaultName) throwBadRequest(`配件第 ${index + 1} 行名称不能为空`);
  });
}

function throwBadRequest(message) {
  const error = new Error(message);
  error.status = 400;
  throw error;
}
