import crypto from "crypto";

const EXTERNAL_PREFIX = "external-history";
const HISTORICAL_TECHNICIAN = "历史";

export function convertExternalHistoryData(payload, options = {}) {
  const source = payload?.data && typeof payload.data === "object" ? payload.data : payload;
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throwBadRequest("外部历史文件格式不正确");
  }
  if (!Array.isArray(source.repairs)) {
    throwBadRequest("外部历史文件缺少 repairs 列表");
  }

  const amountStartDate = normalizeDateOnly(options.amountStartDate);
  const amountEndDate = normalizeDateOnly(options.amountEndDate);
  if (amountStartDate && amountEndDate && amountStartDate > amountEndDate) {
    throwBadRequest("金额保留开始日期不能晚于结束日期");
  }

  const clients = new Map();
  const brands = new Map();
  const models = new Map();
  const services = new Map();
  const parts = new Map();
  const attributes = new Map();
  const repairs = [];
  const tickets = new Set();
  let amountZeroedRepairs = 0;

  for (const client of source.clients || []) {
    addClient(clients, client);
  }
  for (const service of source.services || []) {
    addCatalogRow(services, service, "service");
  }
  for (const module of source.modules || []) {
    addCatalogRow(parts, module, "part");
  }
  for (const property of source.deviceProperty || []) {
    addAttribute(attributes, property);
  }

  source.repairs.forEach((externalRepair, index) => {
    if (!externalRepair || typeof externalRepair !== "object" || Array.isArray(externalRepair)) return;
    const repairId = externalId("repair", externalRepair.uuid || stableHash([index, externalRepair.createdDate, externalRepair.repairDate]));
    const client = addClient(clients, externalRepair.client || {});
    const brandName = textValue(externalRepair.deviceBrand?.name || externalRepair.deviceBrand?.nameLocales?.es || externalRepair.deviceBrand?.nameLocales?.zh);
    const modelName = textValue(externalRepair.deviceModel?.name || externalRepair.deviceModel?.nameLocales?.es || externalRepair.deviceModel?.nameLocales?.zh);
    const brand = addBrand(brands, brandName);
    if (modelName) addModel(models, brand, modelName);

    const repairDate = formatDateTimeString(externalRepair.repairDate || externalRepair.createdDate);
    const warrantyDate = formatDateTimeString(externalRepair.warrantyDate);
    const keepAmount = shouldKeepAmount(repairDate, amountStartDate, amountEndDate);
    const items = repairItems(externalRepair, repairId, keepAmount);
    const totalAmount = keepAmount ? repairTotal(externalRepair, items) : 0;
    const deposit = keepAmount ? moneyNumber(externalRepair.deposit) : 0;
    if (!keepAmount) amountZeroedRepairs += 1;

    const ticket = uniqueTicket(externalRepair.ticketNumber || String(index + 1), tickets);
    repairs.push({
      id: repairId,
      ticket,
      clientId: client.id,
      brand: brand?.name || brandName,
      model: modelName,
      properties: propertiesText(externalRepair.deviceProperties),
      imei: textValue(externalRepair.imei),
      issue: repairIssue(externalRepair, items),
      internalNote: [textValue(externalRepair.comment), textValue(externalRepair.notPrintComment)].filter(Boolean).join("\n"),
      passwordType: textValue(externalRepair.passwordType),
      passwordText: textValue(externalRepair.password),
      passwordPattern: [],
      status: mapExternalStatus(externalRepair.status),
      repairTime: repairDate,
      warrantyStart: warrantyDate,
      technicianId: "",
      technicianName: HISTORICAL_TECHNICIAN,
      budget: totalAmount,
      deposit,
      paymentMethod: deposit > 0 ? "ledger" : "none",
      discountAmount: 0,
      costAmount: 0,
      frontPhoto: "",
      backPhoto: "",
      signatureDataUrl: "",
      signedAt: "",
      publicToken: externalId("token", externalRepair.uuid || repairId),
      orderType: "repair",
      sourceRepairId: "",
      warrantyReason: "",
      warrantyDiagnosis: "",
      warrantyResolution: "",
      warrantyChargeable: false,
      statusHistory: [{ status: mapExternalStatus(externalRepair.status), at: repairDate || formatDateTimeString(externalRepair.createdDate) }],
      notificationLog: [],
      payments: [],
      items,
      createdAt: validIsoString(externalRepair.createdDate) || repairDate,
      updatedAt: validIsoString(externalRepair.updatedDate) || repairDate
    });
  });

  return {
    data: {
      users: [],
      technicians: [],
      clients: [...clients.values()],
      brands: [...brands.values()],
      models: [...models.values()],
      services: [...services.values()],
      parts: [...parts.values()],
      attributes: [...attributes.values()],
      settings: {},
      repairs
    },
    summary: {
      externalRepairs: source.repairs.length,
      convertedRepairs: repairs.length,
      amountZeroedRepairs,
      amountKeptRepairs: repairs.length - amountZeroedRepairs,
      clients: clients.size,
      brands: brands.size,
      models: models.size
    }
  };
}

function addClient(clients, client = {}) {
  const fallbackName = textValue(client.name) || "历史客户";
  const key = client.uuid || stableHash([fallbackName, client.phone, client.identification]);
  const id = externalId("client", key);
  if (!clients.has(id)) {
    clients.set(id, {
      id,
      name: fallbackName,
      level: "VIP",
      docType: textValue(client.identificationType) || "DNI",
      identity: textValue(client.identification),
      email: textValue(client.email),
      phone: textValue(client.phone),
      address: textValue(client.address),
      comment: textValue(client.comment),
      createdAt: validIsoString(client.createdDate),
      updatedAt: validIsoString(client.updatedDate)
    });
  }
  return clients.get(id);
}

function addBrand(brands, name) {
  if (!name) return null;
  const key = name.toLowerCase();
  if (!brands.has(key)) {
    brands.set(key, { id: externalId("brand", key), name });
  }
  return brands.get(key);
}

function addModel(models, brand, name) {
  if (!brand || !name) return null;
  const key = `${brand.id}:${name.toLowerCase()}`;
  if (!models.has(key)) {
    models.set(key, { id: externalId("model", stableHash(key)), brandId: brand.id, name });
  }
  return models.get(key);
}

function addCatalogRow(rows, row = {}, type) {
  const name = textValue(row.name);
  if (!name) return;
  const key = name.toLowerCase();
  if (rows.has(key)) return;
  const locales = row.nameLocales || {};
  rows.set(key, {
    id: externalId(type, row.uuid || key),
    defaultName: name,
    category: "",
    zh: textValue(locales.zh),
    es: textValue(locales.es),
    price: moneyNumber(row.price),
    createdAt: validIsoString(row.createdDate),
    updatedAt: validIsoString(row.updatedDate)
  });
}

function addAttribute(attributes, row = {}) {
  const name = textValue(row.name);
  if (!name) return;
  const locales = row.nameLocales || {};
  const groupName = textValue(locales.zh) === "白色" || textValue(locales.es).toLowerCase() === "blanco" ? "颜色" : "颜色";
  const key = `${groupName}:${name.toLowerCase()}`;
  if (attributes.has(key)) return;
  attributes.set(key, {
    id: externalId("attribute", row.uuid || key),
    groupName,
    defaultName: name,
    zh: textValue(locales.zh),
    es: textValue(locales.es),
    createdAt: validIsoString(row.createdDate),
    updatedAt: validIsoString(row.updatedDate)
  });
}

function repairItems(repair, repairId, keepAmount) {
  const ticketItems = Array.isArray(repair.ticket?.items) ? repair.ticket.items : [];
  const rows = ticketItems.map((item, index) => ({
    id: externalId("item", `${repairId}:${index}`),
    name: textValue(item.name || item.nameLocales?.es || item.nameLocales?.zh) || "历史项目",
    qty: moneyNumber(item.amount, 1) || 1,
    price: keepAmount ? moneyNumber(item.price) : 0,
    cost: 0
  }));
  if (rows.length) return rows;
  const totalPrice = keepAmount ? moneyNumber(repair.ticket?.totalPrice || repair.budget) : 0;
  return [{ id: externalId("item", `${repairId}:0`), name: "历史项目", qty: 1, price: totalPrice, cost: 0 }];
}

function repairTotal(repair, items) {
  const itemTotal = items.reduce((sum, item) => sum + moneyNumber(item.qty, 1) * moneyNumber(item.price), 0);
  return itemTotal || moneyNumber(repair.ticket?.totalPrice || repair.budget);
}

function repairIssue(repair, items) {
  const itemNames = items.map((item) => item.name).filter(Boolean);
  return itemNames.join(", ") || textValue(repair.comment) || "历史维修";
}

function propertiesText(properties) {
  if (!Array.isArray(properties)) return "";
  return properties
    .map((item) => textValue(item?.name || item?.nameLocales?.zh || item?.nameLocales?.es))
    .filter(Boolean)
    .join(", ");
}

function mapExternalStatus(status) {
  const map = {
    deliver: "已取走",
    cancel: "取消",
    reserve: "预定",
    pending: "预定",
    repairing: "维修中",
    finish: "完成"
  };
  return map[String(status || "").trim()] || "预定";
}

function shouldKeepAmount(value, start, end) {
  if (!start && !end) return true;
  const day = normalizeDateOnly(value);
  if (!day) return false;
  return (!start || day >= start) && (!end || day <= end);
}

function uniqueTicket(value, tickets) {
  const base = String(value || "").trim() || String(tickets.size + 1);
  let ticket = base;
  let suffix = 1;
  while (tickets.has(ticket)) {
    suffix += 1;
    ticket = `${base}-${suffix}`;
  }
  tickets.add(ticket);
  return ticket;
}

function formatDateTimeString(value) {
  const date = validDate(value);
  if (!date) return "";
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function normalizeDateOnly(value) {
  const date = validDate(value);
  if (!date) return "";
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function validIsoString(value) {
  const date = validDate(value);
  return date ? date.toISOString() : "";
}

function validDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function textValue(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function moneyNumber(value, fallback = 0) {
  const number = Number(String(value ?? fallback).replace(",", "."));
  return Number.isFinite(number) ? number : fallback;
}

function externalId(type, value) {
  const source = String(value || crypto.randomUUID());
  const safe = source.replace(/[^a-zA-Z0-9_-]/g, "-");
  const token = safe.length > 48 ? stableHash(source) : safe;
  return `${EXTERNAL_PREFIX}-${type}-${token}`;
}

function stableHash(parts) {
  return crypto.createHash("sha1").update(JSON.stringify(parts)).digest("hex").slice(0, 16);
}

function throwBadRequest(message) {
  const error = new Error(message);
  error.status = 400;
  throw error;
}
