// 报表/财务 新旧口径对账：
// 旧口径 = 从 src/app/page.jsx 复刻的前端全量计算（ReportsPage / FinancePage）；
// 新口径 = /api/reports/overview 与 /api/reports/finance 的服务端 SQL 聚合。
// 同一数据库下逐项对比，全部一致输出 PASS，任何一项不一致输出 FAIL 并退出码 1。
// 用法：BASE_URL=http://localhost:3000 node scripts/verify-reports-parity.mjs
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { loadDotEnv } from "./load-env.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadDotEnv(root);

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const username = process.env.SMOKE_USERNAME || process.env.REPAIRNOTE_ADMIN_USERNAME || "admin";
const password = process.env.SMOKE_PASSWORD || process.env.REPAIRNOTE_ADMIN_PASSWORD || "admin123";
const prisma = new PrismaClient();
const EPS = 0.011;
let failures = 0;

// ---------- 旧前端口径（逐行复刻 page.jsx，不得为对账修改） ----------
function normalizeStatus(status) {
  const map = { reserva: "预定", Reserva: "预定", "预定已到货": "预定到货", "Reserva recibida": "预定到货", "Reserva llegado": "预定到货", "待开始": "预定", "En espera": "预定", Reparando: "维修中", Terminado: "完成", Finalizado: "完成", Entregado: "已取走", Cerrado: "取消", Cancelar: "取消", "关闭": "取消", "待检测": "预定", "处理中": "维修中", "等客户确认": "预定到货", "已完成": "完成", "拒保": "取消" };
  return map[status] || status || "预定";
}
const num = (value) => {
  const n = Number(String(value ?? 0).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const isCanceled = (repair) => normalizeStatus(repair.status) === "取消";
const repairAmount = (repair) => repair.items?.length ? repair.items.reduce((sum, item) => sum + num(item.qty) * num(item.price), 0) : num(repair.budget);
const itemCostTotal = (items = []) => items.reduce((sum, item) => sum + num(item.qty || 1) * num(item.cost), 0);
const repairCostAmount = (repair) => itemCostTotal(repair.items || []) || num(repair.costAmount);
const chargeAmount = (repair) => (repair.orderType === "warranty" && !repair.warrantyChargeable) ? 0 : Math.max(0, repairAmount(repair) - num(repair.discountAmount));
const shouldUseLegacyDeposit = (repair) => repair?.id && repair.id !== "new" && num(repair.deposit) >= 0.01;
const repairPaidAmount = (repair) => {
  const payments = repair.payments || [];
  if (payments.length) return payments.reduce((sum, payment) => sum + num(payment.amount), 0);
  return shouldUseLegacyDeposit(repair) ? num(repair.deposit) : 0;
};
function paymentsForDisplay(repair) {
  const payments = (repair.payments || []).filter((payment) => Math.abs(num(payment.amount)) >= 0.005);
  if (payments.length || !shouldUseLegacyDeposit(repair)) return payments;
  return [{ id: `legacy-${repair.id}`, amount: num(repair.deposit), method: "ledger", note: "订金", paidAt: repair.repairTime || isoLocalish(repair.createdAt) }];
}
const dateInRange = (value, start, end) => {
  const day = String(value || "").slice(0, 10);
  if (start && day < start) return false;
  if (end && day > end) return false;
  return true;
};
function isoLocalish(createdAt) {
  return createdAt instanceof Date ? createdAt.toISOString() : String(createdAt || "");
}

function oldOverview(repairs, technicians, { start, end, granularity = "day" }) {
  const orders = repairs.filter((repair) => {
    if (isCanceled(repair)) return false;
    const day = String(repair.repairTime || "").slice(0, 10);
    return (!start || day >= start) && (!end || day <= end);
  });
  const repairsOnly = orders.filter((repair) => (repair.orderType || "repair") !== "warranty");
  const warranties = orders.filter((repair) => repair.orderType === "warranty");
  const amount = chargeAmount;
  const cost = repairCostAmount;
  const revenue = orders.reduce((sum, repair) => sum + amount(repair), 0);
  const costTotal = orders.reduce((sum, repair) => sum + cost(repair), 0);
  const received = orders.reduce((sum, repair) => sum + Math.min(amount(repair), repairPaidAmount(repair)), 0);
  const unpaid = orders.reduce((sum, repair) => sum + Math.max(0, amount(repair) - repairPaidAmount(repair)), 0);

  const technicianById = new Map(technicians.map((technician) => [technician.id, technician]));
  const technicianByName = new Map();
  for (const technician of technicians) {
    const name = String(technician.name || "").trim().toLowerCase();
    if (name && !technicianByName.has(name)) technicianByName.set(name, technician);
  }
  const techMap = new Map();
  for (const technician of technicians) {
    techMap.set(`id:${technician.id}`, { id: `id:${technician.id}`, name: technician.name || "", count: 0, amount: 0, cost: 0, profit: 0, received: 0, unpaid: 0 });
  }
  for (const repair of orders) {
    const legacyName = (repair.technicianName || "").trim();
    const technician = technicianById.get(repair.technicianId) || technicianByName.get(legacyName.toLowerCase());
    const key = technician?.id ? `id:${technician.id}` : legacyName ? `name:${legacyName}` : "unassigned";
    const name = technician?.name || legacyName || "";
    const current = techMap.get(key) || { id: key, name, count: 0, amount: 0, cost: 0, profit: 0, received: 0, unpaid: 0 };
    const a = amount(repair);
    const c = cost(repair);
    const r = Math.min(a, repairPaidAmount(repair));
    current.count += 1;
    current.amount += a;
    current.cost += c;
    current.profit += a - c;
    current.received += r;
    current.unpaid += Math.max(0, a - r);
    techMap.set(key, current);
  }
  const technicianRows = [...techMap.values()].filter((row) => row.count > 0);

  const modelMap = new Map();
  for (const repair of orders) {
    const key = repair.model || "";
    const current = modelMap.get(key) || { name: key, count: 0, amount: 0 };
    current.count += 1;
    current.amount += amount(repair);
    modelMap.set(key, current);
  }

  const trendMap = new Map();
  for (const repair of orders) {
    const raw = String(repair.repairTime || isoLocalish(repair.createdAt) || "").trim();
    if (!raw) continue;
    const date = new Date(raw.replace(" ", "T"));
    if (Number.isNaN(date.getTime())) continue;
    const key = trendKey(date, granularity);
    const current = trendMap.get(key) || { key, count: 0, amount: 0 };
    current.count += 1;
    current.amount += amount(repair);
    trendMap.set(key, current);
  }

  return {
    summary: { revenue, repairCount: repairsOnly.length, warrantyCount: warranties.length, orderCount: orders.length, cost: costTotal, profit: revenue - costTotal, received, unpaid },
    technicianRows,
    topModels: [...modelMap.values()],
    trendRows: [...trendMap.values()]
  };
}

function trendKey(date, granularity) {
  const pad = (n) => String(n).padStart(2, "0");
  if (granularity === "month") return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
  if (granularity === "week") {
    const start = new Date(date);
    const day = start.getDay() || 7;
    start.setDate(start.getDate() - day + 1);
    return `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
  }
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function oldFinance(repairs, clients, { start, end, q = "" }) {
  const search = q.trim().toLowerCase();
  const clientById = new Map(clients.map((client) => [client.id, client]));
  const matchesSearch = (...values) => !search || values.join(" ").toLowerCase().includes(search);
  const paymentRows = [];
  const unpaidRows = [];
  let receivable = 0;
  let costTotal = 0;
  let received = 0;
  let unpaid = 0;
  for (const repair of repairs) {
    const client = clientById.get(repair.clientId) || {};
    const ticket = repair.ticket || "-";
    const businessOrder = !isCanceled(repair);
    const orderInRange = businessOrder && dateInRange(repair.repairTime || isoLocalish(repair.createdAt), start, end);
    if (orderInRange) {
      const total = chargeAmount(repair);
      const paid = repairPaidAmount(repair);
      const cost = repairCostAmount(repair);
      const due = Math.max(0, total - paid);
      receivable += total;
      costTotal += cost;
      unpaid += due;
      if (due > 0.005 && matchesSearch(ticket, client.name || "", client.phone || "", repair.brand || "", repair.model || "", repair.issue || "")) {
        unpaidRows.push({ ticket, total, paid, due });
      }
    }
    if (!businessOrder) continue;
    for (const payment of paymentsForDisplay(repair)) {
      const paidAt = payment.paidAt || repair.repairTime || isoLocalish(repair.createdAt);
      if (!dateInRange(paidAt, start, end)) continue;
      if (!matchesSearch(ticket, client.name || "", client.phone || "", payment.note || "")) continue;
      received += num(payment.amount);
      paymentRows.push({ ticket, amount: num(payment.amount), note: payment.note || "", paidAt });
    }
  }
  return { receivable, costTotal, received, unpaid, paymentCount: paymentRows.length, unpaidCount: unpaidRows.length };
}

// ---------- 对比工具 ----------
function check(label, oldValue, newValue) {
  const equal = Math.abs(num(oldValue) - num(newValue)) < EPS;
  if (!equal) {
    failures += 1;
    console.log(`FAIL ${label}: 旧=${oldValue} 新=${newValue}`);
  } else {
    console.log(`PASS ${label}: ${round2(num(newValue))}`);
  }
}
const round2 = (value) => Math.round(value * 100) / 100;

function checkGroupList(label, oldRows, newRows, keyFn, fields) {
  const oldMap = new Map(oldRows.map((row) => [keyFn(row), row]));
  const newMap = new Map(newRows.map((row) => [keyFn(row), row]));
  let ok = true;
  const keys = new Set([...oldMap.keys(), ...newMap.keys()]);
  for (const key of keys) {
    const oldRow = oldMap.get(key);
    const newRow = newMap.get(key);
    if (!oldRow || !newRow) {
      ok = false;
      console.log(`FAIL ${label} 桶缺失 [${key}]: 旧=${JSON.stringify(oldRow)} 新=${JSON.stringify(newRow)}`);
      continue;
    }
    for (const field of fields) {
      if (Math.abs(num(oldRow[field]) - num(newRow[field])) >= EPS) {
        ok = false;
        console.log(`FAIL ${label} [${key}].${field}: 旧=${oldRow[field]} 新=${newRow[field]}`);
      }
    }
  }
  if (ok) console.log(`PASS ${label}: ${keys.size} 个桶全部一致`);
  else failures += 1;
}

async function api(pathname, cookie) {
  const response = await fetch(`${baseUrl}${pathname}`, { headers: { cookie } });
  if (!response.ok) throw new Error(`${pathname} -> HTTP ${response.status}`);
  return response.json();
}

async function main() {
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  if (!login.ok) throw new Error(`登录失败 HTTP ${login.status}`);
  const cookie = (login.headers.getSetCookie?.() || [login.headers.get("set-cookie")]).filter(Boolean).map((item) => item.split(";")[0]).join("; ");

  console.log("加载全量数据（对账脚本专用，旧口径基准）…");
  const [repairs, clients, technicians] = await Promise.all([
    prisma.repair.findMany({ include: { items: true, payments: { orderBy: { paidAt: "desc" } } } }),
    prisma.client.findMany(),
    prisma.technician.findMany()
  ]);
  const liteRepairs = repairs.map((repair) => ({
    ...repair,
    budget: num(repair.budget),
    deposit: num(repair.deposit),
    discountAmount: num(repair.discountAmount),
    costAmount: num(repair.costAmount),
    items: repair.items.map((item) => ({ qty: num(item.qty), price: num(item.price), cost: num(item.cost) })),
    payments: repair.payments.map((payment) => ({ amount: num(payment.amount), note: payment.note || "", paidAt: payment.paidAt?.toISOString?.() || "" }))
  }));
  console.log(`基准数据：${liteRepairs.length} 单 / ${clients.length} 客户 / ${technicians.length} 技师`);

  const ranges = [
    { name: "近30天", start: "2026-06-02", end: "2026-07-02" },
    { name: "单日", start: "2026-06-15", end: "2026-06-15" },
    { name: "全历史", start: "2000-01-01", end: "2099-12-31" },
    { name: "不限日期", start: "", end: "" }
  ];

  for (const range of ranges) {
    for (const granularity of ["day", "week", "month"]) {
      const label = `overview[${range.name}/${granularity}]`;
      const oldResult = oldOverview(liteRepairs, technicians, { ...range, granularity });
      const newResult = await api(`/api/reports/overview?start=${range.start}&end=${range.end}&granularity=${granularity}`, cookie);
      for (const field of ["revenue", "repairCount", "warrantyCount", "orderCount", "cost", "profit", "received", "unpaid"]) {
        check(`${label}.summary.${field}`, oldResult.summary[field], newResult.summary[field]);
      }
      checkGroupList(`${label}.technicianRows`, oldResult.technicianRows, newResult.technicianRows, (row) => row.id, ["count", "amount", "cost", "profit", "received", "unpaid"]);
      checkGroupList(`${label}.topModels`, oldResult.topModels, newResult.topModels, (row) => row.name, ["count", "amount"]);
      checkGroupList(`${label}.trendRows`, oldResult.trendRows.sort((a, b) => a.key.localeCompare(b.key)).slice(-36), newResult.trendRows, (row) => row.key, ["count", "amount"]);
      if (granularity !== "day") continue;
      for (const q of ["", "压测客户0001", "订金"]) {
        const financeLabel = `finance[${range.name}/q=${q || "无"}]`;
        const oldFin = oldFinance(liteRepairs, clients, { ...range, q });
        const newFin = await api(`/api/reports/finance?start=${range.start}&end=${range.end}&q=${encodeURIComponent(q)}`, cookie);
        check(`${financeLabel}.receivable`, oldFin.receivable, newFin.summary.receivable);
        check(`${financeLabel}.costTotal`, oldFin.costTotal, newFin.summary.costTotal);
        check(`${financeLabel}.received`, oldFin.received, newFin.summary.received);
        check(`${financeLabel}.unpaid`, oldFin.unpaid, newFin.summary.unpaid);
        check(`${financeLabel}.paymentCount`, oldFin.paymentCount, newFin.summary.paymentCount);
        check(`${financeLabel}.unpaidCount`, oldFin.unpaidCount, newFin.unpaidOrders.total);
      }
    }
  }

  console.log(failures ? `\n对账结果：FAIL（${failures} 处不一致）` : "\n对账结果：全部 PASS");
  process.exitCode = failures ? 1 : 0;
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
