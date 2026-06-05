import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { defaultSettings, normalizeStatus, statusOrder } from "@/lib/seed-data";
import { buildRepairSearchText, ticketSortValue } from "@/lib/search-text";
import { computeListAggregates } from "@/lib/repair-amounts";
import crypto from "crypto";

const moneyNumber = (value) => Number(value || 0);
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
async function orderLockSettings() {
  const setting = await prisma.setting.findUnique({ where: { id: "main" } });
  const value = setting?.value || {};
  return {
    enableOrderLock: value.enableOrderLock !== false,
    allowOrderUnlock: value.allowOrderUnlock !== false
  };
}

export async function getBootstrapData(options = {}) {
  const includeRepairItems = options.includeRepairItems === true;
  const includeRepairs = options.includeRepairs !== false;
  const repairInclude = includeRepairItems
    ? { items: true, payments: { orderBy: { paidAt: "desc" } } }
    : { payments: { orderBy: { paidAt: "desc" } } };
  const repairQuery = includeRepairs ? prisma.repair.findMany({ include: repairInclude, orderBy: { createdAt: "desc" } }) : Promise.resolve([]);
  const [staff, technicians, clients, brands, models, services, parts, groups, repairs, itemTotals, settings] = await Promise.all([
    prisma.staff.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.technician.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    prisma.client.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.brand.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.model.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.service.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    prisma.part.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    prisma.attributeGroup.findMany({ include: { attributes: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } }, orderBy: { name: "asc" } }),
    repairQuery,
    includeRepairs && !includeRepairItems ? repairItemTotals() : Promise.resolve([]),
    prisma.setting.findUnique({ where: { id: "main" } })
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
  return { ...data, _revision: await getBusinessRevision() };
}

export async function getRepairById(id) {
  const repair = await prisma.repair.findUnique({ where: { id }, include: { items: true, payments: { orderBy: { paidAt: "desc" } } } });
  return repair ? serializeRepair(repair, null, true) : null;
}

const SEARCH_PAGE_SIZE = 20;

// 服务端维修单搜索：searchText 子串匹配（与前端“包含”一致）+ 结构化过滤（走索引）+ 服务端分页。
// 返回当页序列化维修单、总数、按状态/类型的计数，用于列表页直接渲染，避免前端全表扫描 4 万单。
export async function searchRepairs(params = {}) {
  const q = String(params.q || "").trim().toLowerCase();
  const status = String(params.status || "").trim();
  const orderType = String(params.orderType || "").trim();
  const start = String(params.start || "").trim();
  const end = String(params.end || "").trim();
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || SEARCH_PAGE_SIZE));

  const baseFilters = [];
  if (q) baseFilters.push({ searchText: { contains: q } });
  if (orderType) baseFilters.push({ orderType });
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
      include: { payments: { orderBy: { paidAt: "desc" } } }
    })
  ]);

  const ids = pageRows.map((row) => row.id);
  const items = ids.length
    ? await prisma.repairItem.findMany({ where: { repairId: { in: ids } }, orderBy: { createdAt: "asc" } })
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

// 列表页的「合计金额 / 技师汇总」：基于与 searchRepairs 相同的筛选集（含 imei/properties/证件号），
// 在服务端用一条 JOIN 聚合出每单的 itemsTotal/itemsCostTotal，再按金额规则汇总，保证与列表口径一致。
// 不分页（覆盖整个筛选集），也不依赖 page，避免翻页时重算。
export async function aggregateRepairs(params = {}) {
  const q = String(params.q || "").trim().toLowerCase();
  const status = String(params.status || "").trim();
  const orderType = String(params.orderType || "").trim();
  const start = String(params.start || "").trim();
  const end = String(params.end || "").trim();

  const conds = [Prisma.sql`1 = 1`];
  if (q) conds.push(Prisma.sql`r.searchText LIKE ${`%${q}%`}`);
  if (status) conds.push(Prisma.sql`r.status = ${status}`);
  if (orderType) conds.push(Prisma.sql`r.orderType = ${orderType}`);
  if (start) conds.push(Prisma.sql`r.repairTime >= ${start}`);
  if (end) conds.push(Prisma.sql`r.repairTime <= ${`${end}~`}`);
  const whereSql = Prisma.join(conds, " AND ");

  const [rows, technicians] = await Promise.all([
    prisma.$queryRaw(Prisma.sql`
      SELECT r.id AS id, r.status AS status, r.orderType AS orderType,
             (r.warrantyChargeable + 0) AS warrantyChargeable,
             r.budget AS budget, r.discountAmount AS discountAmount, r.costAmount AS costAmount,
             r.technicianId AS technicianId, r.technicianName AS technicianName,
             COALESCE(SUM(i.qty * i.price), 0) AS itemsTotal,
             COALESCE(SUM(i.qty * i.cost), 0) AS itemsCostTotal
      FROM Repair r LEFT JOIN RepairItem i ON i.repairId = r.id
      WHERE ${whereSql}
      GROUP BY r.id
    `),
    prisma.technician.findMany()
  ]);

  const lite = rows.map((row) => ({
    status: row.status,
    orderType: row.orderType,
    warrantyChargeable: Number(row.warrantyChargeable) !== 0,
    budget: row.budget,
    discountAmount: row.discountAmount,
    costAmount: row.costAmount,
    itemsTotal: row.itemsTotal,
    itemsCostTotal: row.itemsCostTotal,
    technicianId: row.technicianId,
    technicianName: row.technicianName
  }));
  return computeListAggregates(lite, technicians);
}

async function repairItemTotals() {
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
    " FROM RepairItem GROUP BY repairId"
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
    payments: Array.isArray(repair.payments) ? repair.payments.map(serializePayment) : [],
    items: includeItems
      ? itemRows.map((item) => ({ id: item.id, name: item.name, qty: moneyNumber(item.qty), price: moneyNumber(item.price), cost: moneyNumber(item.cost) }))
      : []
  };
  if (!includeItems) return shared;
  // ticketSort 是 BigInt（无法 JSON 序列化），searchText 是内部检索字段（最长 8000 字），都不应回传/写入备份。
  const { ticketSort, searchText, ...repairRest } = repair;
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
    statusHistory: Array.isArray(repair.statusHistory) ? repair.statusHistory : [],
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

export async function saveRepairRecord({ repair, client, actor } = {}) {
  if (!repair?.id) throwBadRequest("维修单数据不完整");
  const lockSettings = await orderLockSettings();
  const result = await prisma.$transaction(async (tx) => {
    let savedClient = null;
    if (client?.id) {
      const clientName = clientNameForSave(client.name);
      savedClient = await tx.client.upsert({
        where: { id: client.id },
        create: { id: client.id, name: clientName, docType: client.docType || "DNI", identity: client.identity || "", email: client.email || "", phone: client.phone || "", address: client.address || "", comment: client.comment || "", level: normalizeClientLevel(client.level) },
        update: { name: clientName, docType: client.docType || "DNI", identity: client.identity || "", email: client.email || "", phone: client.phone || "", address: client.address || "", comment: client.comment || "", level: normalizeClientLevel(client.level) }
      });
    }

    const existing = await tx.repair.findUnique({ where: { id: repair.id }, include: { items: true, payments: true } });
    // 服务端强制：库里这张单若已锁定（已取走/取消且未解锁），只有管理员且开启「允许解除订单锁定」才能修改，
    // 防止普通员工绕过前端直接 PUT 篡改已锁定订单。
    if (existing && isOrderLockedRecord(existing, lockSettings) && !(actor?.isAdmin && lockSettings.allowOrderUnlock)) {
      const error = new Error("订单已锁定，只有管理员可以解除锁定后再修改");
      error.status = 403;
      throw error;
    }
    const existingRepair = existing ? serializeRepair(existing, null, true) : null;
    const repairData = { ...(existingRepair || {}), ...repair, clientId: repair.clientId || savedClient?.id || existingRepair?.clientId || "" };
    if (!repairData.clientId) throwBadRequest("维修单缺少客户");
    const repairItems = repair.itemsLoaded === false && existing ? existing.items : (Array.isArray(repair.items) ? repair.items : []);
    const paymentCreates = repairPaymentsForSave(repairData, existing?.payments || []);
    const searchClient = savedClient || (repairData.clientId ? await tx.client.findUnique({ where: { id: repairData.clientId } }) : null);
    let sourceTicket = "";
    if ((repairData.orderType || "repair") === "warranty" && repairData.sourceRepairId) {
      const source = await tx.repair.findUnique({ where: { id: repairData.sourceRepairId }, select: { ticket: true } });
      sourceTicket = source?.ticket || "";
    }
    const searchText = buildRepairSearchText(repairData, { client: searchClient || {}, items: repairItems, sourceTicket });
    const dbData = { ...repairPrismaData(repairData), deposit: paymentCreates.length ? depositPaymentTotal(paymentCreates) : dbMoney(repairData.deposit), searchText, ticketSort: BigInt(ticketSortValue(repairTicket(repairData))) };
    const itemCreates = repairItems.map(repairItemPrismaData);
    const savedRepair = existing
      ? await tx.repair.update({ where: { id: repair.id }, data: { ...dbData, items: { deleteMany: {}, create: itemCreates }, payments: { deleteMany: {}, create: paymentCreates.map(paymentPrismaData) } }, include: { items: true, payments: { orderBy: { paidAt: "desc" } } } })
      : await tx.repair.create({ data: { id: repair.id, ...dbData, items: { create: itemCreates }, payments: { create: paymentCreates.map(paymentPrismaData) } }, include: { items: true, payments: { orderBy: { paidAt: "desc" } } } });
    return { repair: savedRepair, client: savedClient };
  });
  return {
    repair: serializeRepair(result.repair, null, true),
    client: result.client,
    _revision: await getBusinessRevision()
  };
}

export async function deleteRepairRecord(id) {
  const existing = await prisma.repair.findUnique({ where: { id } });
  if (!existing) {
    const error = new Error("没有找到这张订单");
    error.status = 404;
    throw error;
  }
  if ((existing.orderType || "repair") !== "warranty") {
    const linkedWarrantyCount = await prisma.repair.count({ where: { orderType: "warranty", sourceRepairId: id } });
    if (linkedWarrantyCount) {
      const error = new Error("这张维修单已有保修单，不能删除");
      error.status = 409;
      throw error;
    }
  }
  await prisma.repair.delete({ where: { id } });
  return { ok: true, _revision: await getBusinessRevision() };
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
  return Math.max(0, paymentTotal(payments.filter(isDepositPayment)));
}

function roundMoney(value) {
  return Math.round(dbMoney(value) * 100) / 100;
}

function validPaymentDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

const REVISION_KEYS = ["users", "technicians", "clients", "brands", "models", "services", "parts", "attributes", "repairs", "settings"];

export async function getBusinessRevision() {
  const patch = await getRevisionPatch(REVISION_KEYS);
  return REVISION_KEYS.map((key) => patch[key]).join("|");
}

export async function getRevisionPatch(keys = []) {
  const uniqueKeys = [...new Set(keys)].filter((key) => REVISION_KEYS.includes(key));
  const entries = await Promise.all(uniqueKeys.map(async (key) => [key, await getRevisionSegment(key)]));
  return Object.fromEntries(entries);
}

async function getRevisionSegment(key) {
  if (key === "users") return revisionPart("users", await revisionAggregate(prisma.staff));
  if (key === "technicians") return revisionPart("technicians", await revisionAggregate(prisma.technician));
  if (key === "clients") return revisionPart("clients", await revisionAggregate(prisma.client));
  if (key === "brands") return revisionPart("brands", await revisionAggregate(prisma.brand));
  if (key === "models") return revisionPart("models", await revisionAggregate(prisma.model));
  if (key === "services") return revisionPart("services", await revisionAggregate(prisma.service));
  if (key === "parts") return revisionPart("parts", await revisionAggregate(prisma.part));
  if (key === "attributes") return revisionPart("attributes", await revisionAggregate(prisma.attribute));
  if (key === "settings") {
    const settings = await prisma.setting.findUnique({ where: { id: "main" }, select: { updatedAt: true } });
    return `settings:${settings?.updatedAt?.toISOString?.() || ""}`;
  }
  if (key === "repairs") {
    const [repairs, repairItems, payments] = await Promise.all([
      revisionAggregate(prisma.repair),
      revisionAggregate(prisma.repairItem),
      revisionAggregate(prisma.payment)
    ]);
    const repairLatest = Math.max(repairs.latest, repairItems.latest, payments.latest);
    return `repairs:${repairs.count}:${repairLatest}:${repairItems.count}:${payments.count}`;
  }
  return "";
}

async function revisionAggregate(model) {
  const result = await model.aggregate({ _count: { _all: true }, _max: { updatedAt: true } });
  return { count: result._count._all, latest: Date.parse(result._max.updatedAt?.toISOString?.() || "") || 0 };
}

function revisionPart(key, value) {
  return `${key}:${value.count}:${value.latest}`;
}

export async function replaceBusinessData(data, options = {}) {
  const attributes = Array.isArray(data.attributes) ? data.attributes : [];
  const settings = { ...defaultSettings, ...(data.settings || {}) };
  const clientById = new Map((data.clients || []).map((client) => [client.id, { ...client, name: clientNameForSave(client.name) }]));
  const ticketById = new Map((data.repairs || []).map((repair, index) => [repair.id, repairTicket(repair, index)]));
  const preserveItemIds = (data.repairs || []).filter((repair) => repair?.id && repair.itemsLoaded === false).map((repair) => repair.id);
  const [preservedItems, preservedRepairs] = preserveItemIds.length
    ? await Promise.all([
      prisma.repairItem.findMany({ where: { repairId: { in: preserveItemIds } }, orderBy: { createdAt: "asc" } }),
      prisma.repair.findMany({ where: { id: { in: preserveItemIds } } })
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
    await tx.payment.deleteMany();
    await tx.repairItem.deleteMany();
    await tx.repair.deleteMany();
    await tx.attribute.deleteMany();
    await tx.attributeGroup.deleteMany();
    await tx.model.deleteMany();
    await tx.brand.deleteMany();
    await tx.part.deleteMany();
    await tx.service.deleteMany();
    await tx.technician.deleteMany();
    await tx.client.deleteMany();
    if (options.replaceStaff) await tx.staff.deleteMany();

    if (options.replaceStaff && Array.isArray(data.users)) {
      for (const user of data.users) {
        await tx.staff.create({
          data: {
            id: user.id,
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
      const currentStaff = await tx.staff.findMany();
      const nextIds = new Set(data.users.map((user) => user.id).filter(Boolean));
      for (const existing of currentStaff) {
        if (!nextIds.has(existing.id) && currentStaff.length > 1) await tx.staff.delete({ where: { id: existing.id } });
      }
      for (const user of data.users) {
        const existing = user.id ? await tx.staff.findUnique({ where: { id: user.id } }) : null;
        if (!user.id && !user.password) {
          throwBadRequest("新增员工必须设置密码");
        }
        const passwordHash = user.password ? hashPassword(user.password) : existing?.passwordHash;
        if (!passwordHash) throwBadRequest("员工密码不完整");
        await tx.staff.upsert({
          where: { id: user.id || cryptoId() },
          create: { id: user.id || cryptoId(), name: user.name || user.username || "员工", username: user.username, email: user.email || "", passwordHash, isAdmin: Boolean(user.isAdmin), pagePermissions: Array.isArray(user.pagePermissions) ? user.pagePermissions : [], ...timestamps(user) },
          update: { name: user.name || user.username || "员工", username: user.username, email: user.email || "", passwordHash, isAdmin: Boolean(user.isAdmin), pagePermissions: Array.isArray(user.pagePermissions) ? user.pagePermissions : [] }
        });
      }
    }

    for (const client of data.clients || []) {
      await tx.client.create({ data: { ...pick(client, ["id", "docType", "identity", "email", "phone", "address", "comment"]), name: clientNameForSave(client.name), level: normalizeClientLevel(client.level), ...timestamps(client) } });
    }
    for (const [index, brand] of (data.brands || []).entries()) {
      await tx.brand.create({ data: { ...pick(brand, ["id", "name"]), sortOrder: dbSortOrder(brand.sortOrder, index), ...timestamps(brand) } });
    }
    for (const [index, model] of (data.models || []).entries()) {
      await tx.model.create({ data: { ...pick(model, ["id", "brandId", "name"]), sortOrder: dbSortOrder(model.sortOrder, index), ...timestamps(model) } });
    }
    for (const [index, service] of (data.services || []).entries()) {
      await tx.service.create({ data: { ...pick(service, ["id", "defaultName", "category", "zh", "es"]), category: service.category || "", price: service.price || 0, sortOrder: dbSortOrder(service.sortOrder, index), ...timestamps(service) } });
    }
    for (const [index, part] of (data.parts || []).entries()) {
      await tx.part.create({ data: { ...pick(part, ["id", "defaultName", "category", "zh", "es"]), category: part.category || "", price: part.price || 0, sortOrder: dbSortOrder(part.sortOrder, index), ...timestamps(part) } });
    }
    for (const [index, technician] of (data.technicians || []).entries()) {
      await tx.technician.create({
        data: {
          id: technician.id,
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
      const group = await tx.attributeGroup.create({ data: { name: groupName } });
      groupIds[groupName] = group.id;
    }
    for (const [index, attr] of attributes.entries()) {
      await tx.attribute.create({
        data: {
          id: attr.id,
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
      const repairData = repair.itemsLoaded === false && preservedRepairById.has(repair.id) ? { ...preservedRepairById.get(repair.id), ...repair } : repair;
      const repairItems = repair.itemsLoaded === false ? (preservedItemsByRepair.get(repair.id) || []) : (repair.items || []);
      const repairPayments = repairPaymentsForImport(repairData);
      await tx.repair.create({
        data: {
          id: repairData.id,
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
          items: { create: repairItems.map((item) => ({ id: item.id, name: item.name || "", qty: dbMoney(item.qty, 1), price: dbMoney(item.price), cost: dbMoney(item.cost) })) },
          payments: { create: repairPayments.map(paymentPrismaData) }
        }
      });
    }
    await tx.setting.upsert({ where: { id: "main" }, create: { id: "main", value: settings }, update: { value: settings } });
  }, { timeout: options.transactionTimeout || 300000 });
}

export async function syncFromClientData(data) {
  await replaceBusinessData(data, { replaceStaff: false });
  return getBootstrapData();
}

export async function syncTechniciansData(technicians = []) {
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

  await prisma.$transaction(async (tx) => {
    const existing = await tx.technician.findMany({ select: { id: true, name: true } });
    const nextIds = new Set(rows.map((row) => row.id));
    const removed = existing.filter((item) => !nextIds.has(item.id));
    if (removed.length) {
      const removedIds = removed.map((item) => item.id);
      const removedNames = removed.map((item) => item.name).filter(Boolean);
      const usedCount = await tx.repair.count({
        where: {
          OR: [
            { technicianId: { in: removedIds } },
            { technicianName: { in: removedNames } }
          ]
        }
      });
      if (usedCount > 0) throwBadRequest("已有维修单使用该维修师，不能删除");
    }

    await tx.technician.deleteMany();
    for (const row of rows) {
      await tx.technician.create({ data: row });
    }
  }, { timeout: 30000 });

  const savedRows = await prisma.technician.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  return { technicians: savedRows, _revisionPatch: await getRevisionPatch(["technicians"]) };
}

const CATALOG_SETTING_KEYS = ["productCatalogCategories", "productServiceCategories", "productPartCategories"];

export async function syncCatalogData(data = {}) {
  const brands = requireRows(data.brands, "品牌").map((brand, index) => ({
    id: String(brand.id || cryptoId()).trim(),
    name: String(brand.name || "").trim(),
    sortOrder: dbSortOrder(brand.sortOrder, index),
    ...timestamps(brand)
  }));
  const models = requireRows(data.models, "型号").map((model, index) => ({
    id: String(model.id || cryptoId()).trim(),
    brandId: String(model.brandId || "").trim(),
    name: String(model.name || "").trim(),
    sortOrder: dbSortOrder(model.sortOrder, index),
    ...timestamps(model)
  }));
  const services = requireRows(data.services, "服务").map((service, index) => ({
    id: String(service.id || cryptoId()).trim(),
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
    await deleteMissingRows(tx.model, models);
    await deleteMissingRows(tx.brand, brands);
    await syncTableRows(tx.brand, brands, ["name", "sortOrder"], { deleteMissing: false });
    await syncTableRows(tx.model, models, ["brandId", "name", "sortOrder"], { deleteMissing: false });
    await syncTableRows(tx.service, services, ["defaultName", "category", "zh", "es", "price", "sortOrder"]);
    await syncTableRows(tx.part, parts, ["defaultName", "category", "zh", "es", "price", "sortOrder"]);

    if (Object.keys(settingsPatch).length) {
      const current = await tx.setting.findUnique({ where: { id: "main" } });
      const saved = await tx.setting.upsert({
        where: { id: "main" },
        create: { id: "main", value: { ...defaultSettings, ...settingsPatch } },
        update: { value: { ...(current?.value || defaultSettings), ...settingsPatch } }
      });
      settingsUpdatedAt = saved.updatedAt?.toISOString?.() || "";
    }
  }, { timeout: 60000 });

  const [savedBrands, savedModels, savedServices, savedParts, settings] = await Promise.all([
    prisma.brand.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.model.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.service.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    prisma.part.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    prisma.setting.findUnique({ where: { id: "main" } })
  ]);
  const revisionKeys = ["brands", "models", "services", "parts", "settings"];
  return {
    brands: savedBrands,
    models: savedModels,
    services: savedServices.map((item) => ({ ...item, category: item.category || "", price: moneyNumber(item.price) })),
    parts: savedParts.map((item) => ({ ...item, category: item.category || "", price: moneyNumber(item.price) })),
    settings: { ...defaultSettings, ...(settings?.value || {}) },
    _settingsUpdatedAt: settingsUpdatedAt || settings?.updatedAt?.toISOString?.() || "",
    _revisionPatch: await getRevisionPatch(revisionKeys)
  };
}

export async function syncAttributesData(attributes = []) {
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
    if (!row.defaultName) throwBadRequest("属性名称不能为空");
  });

  await prisma.$transaction(async (tx) => {
    await tx.attribute.deleteMany();
    await tx.attributeGroup.deleteMany();
    const groupNames = [...new Set(rows.map((item) => item.groupName || "其他"))];
    for (const groupName of groupNames.length ? groupNames : ["颜色", "其他"]) {
      await tx.attributeGroup.create({
        data: {
          name: groupName,
          attributes: {
            create: rows
              .filter((attr) => (attr.groupName || "其他") === groupName)
              .map((attr) => ({
                id: attr.id,
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

  const groups = await prisma.attributeGroup.findMany({ include: { attributes: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } }, orderBy: { name: "asc" } });
  return {
    attributes: groups.flatMap((group) => group.attributes.map((item) => ({ ...item, groupName: group.name }))),
    _revisionPatch: await getRevisionPatch(["attributes"])
  };
}

export async function syncNonRepairBusinessData(data, options = {}) {
  const attributes = Array.isArray(data.attributes) ? data.attributes : [];
  const settings = { ...defaultSettings, ...(data.settings || {}) };
  await prisma.$transaction(async (tx) => {
    if (options.syncClients !== false && Array.isArray(data.clients)) {
      const nextClientIds = new Set(data.clients.map((client) => client.id).filter(Boolean));
      const existingClients = await tx.client.findMany({ select: { id: true } });
      for (const existing of existingClients) {
        if (!nextClientIds.has(existing.id)) await tx.client.delete({ where: { id: existing.id } });
      }
      for (const client of data.clients) {
        await tx.client.upsert({
          where: { id: client.id },
          create: { ...pick(client, ["id", "docType", "identity", "email", "phone", "address", "comment"]), name: clientNameForSave(client.name), level: normalizeClientLevel(client.level), ...timestamps(client) },
          update: { docType: client.docType || "DNI", identity: client.identity || "", email: client.email || "", phone: client.phone || "", address: client.address || "", comment: client.comment || "", name: clientNameForSave(client.name), level: normalizeClientLevel(client.level) }
        });
      }
    }

    await tx.attribute.deleteMany();
    await tx.attributeGroup.deleteMany();
    await tx.model.deleteMany();
    await tx.brand.deleteMany();
    await tx.part.deleteMany();
    await tx.service.deleteMany();
    await tx.technician.deleteMany();

    for (const [index, brand] of (data.brands || []).entries()) {
      await tx.brand.create({ data: { ...pick(brand, ["id", "name"]), sortOrder: dbSortOrder(brand.sortOrder, index), ...timestamps(brand) } });
    }
    for (const [index, model] of (data.models || []).entries()) {
      await tx.model.create({ data: { ...pick(model, ["id", "brandId", "name"]), sortOrder: dbSortOrder(model.sortOrder, index), ...timestamps(model) } });
    }
    for (const [index, service] of (data.services || []).entries()) {
      await tx.service.create({ data: { ...pick(service, ["id", "defaultName", "category", "zh", "es"]), category: service.category || "", price: service.price || 0, sortOrder: dbSortOrder(service.sortOrder, index), ...timestamps(service) } });
    }
    for (const [index, part] of (data.parts || []).entries()) {
      await tx.part.create({ data: { ...pick(part, ["id", "defaultName", "category", "zh", "es"]), category: part.category || "", price: part.price || 0, sortOrder: dbSortOrder(part.sortOrder, index), ...timestamps(part) } });
    }
    for (const [index, technician] of (data.technicians || []).entries()) {
      await tx.technician.create({
        data: {
          id: technician.id,
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
          name: groupName,
          attributes: {
            create: attributes
              .filter((attr) => (attr.groupName || "其他") === groupName)
              .map((attr, index) => ({
                id: attr.id,
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
    await tx.setting.upsert({ where: { id: "main" }, create: { id: "main", value: settings }, update: { value: settings } });
  }, { timeout: options.transactionTimeout || 120000 });
  return getBootstrapData({ includeRepairs: options.includeRepairs !== false });
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
  await prisma.setting.upsert({
    where: { id: "main" },
    create: { id: "main", value: defaultSettings },
    update: {}
  });
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
