import { serviceZhMap } from "@/lib/seed-data";

// 西班牙文 -> 中文 与 中文 -> 西班牙文 双向映射，用于让搜索文本同时包含两种语言，
// 这样无论用中文还是西班牙文搜索常见服务/配件都能命中（与前端 contentLabel 本地化搜索行为对齐）。
const ES_TO_ZH = Object.entries(serviceZhMap).map(([es, zh]) => [es.toLowerCase(), zh]);
const ZH_TO_ES = Object.entries(serviceZhMap).map(([es, zh]) => [zh.toLowerCase(), es]);

function localizedExtras(text) {
  const lower = String(text || "").toLowerCase();
  if (!lower) return [];
  const extras = [];
  for (const [es, zh] of ES_TO_ZH) {
    if (lower.includes(es)) extras.push(zh);
  }
  for (const [zh, es] of ZH_TO_ES) {
    if (lower.includes(zh)) extras.push(es);
  }
  return extras;
}

// 把一张维修单的可搜索内容拼成一个小写字符串，存入 Repair.searchText（带 FULLTEXT 索引）。
// context: { client, items, sourceTicket }
export function buildRepairSearchText(repair = {}, context = {}) {
  const client = context.client || {};
  const items = Array.isArray(context.items)
    ? context.items
    : Array.isArray(repair.items)
      ? repair.items
      : [];
  const itemNames = items.map((item) => item?.name).filter(Boolean);
  const base = [
    repair.ticket,
    context.sourceTicket,
    repair.brand,
    repair.model,
    repair.imei,
    repair.issue,
    repair.properties,
    repair.status,
    repair.technicianName,
    repair.warrantyReason,
    repair.warrantyDiagnosis,
    repair.warrantyResolution,
    client.name,
    client.phone,
    client.identity,
    ...itemNames
  ];
  const localized = [repair.issue, ...itemNames].flatMap(localizedExtras);
  const text = [...base, ...localized]
    .filter(Boolean)
    .map((value) => String(value).trim())
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  // 控制长度，避免极端长文本撑爆行/索引（FULLTEXT 只需关键词）。
  return text.length > 8000 ? text.slice(0, 8000) : text;
}

// 取单号里第一段 6 位以上的数字作为排序键，与前端 ticketSortValue 完全一致。
// 用于服务端列表“按单号数字降序”分页排序（存入 Repair.ticketSort，带索引）。
export function ticketSortValue(ticket) {
  const numeric = String(ticket || "").match(/\d{6,}/)?.[0];
  return numeric ? Number(numeric) : 0;
}
