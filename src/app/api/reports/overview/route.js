import { authErrorResponse, requirePageAccess } from "@/lib/auth";
import { getBootstrapData } from "@/lib/data-store";
import { normalizeStatus, statusOrder } from "@/lib/seed-data";

export async function GET(request) {
  try {
    const staff = await requirePageAccess("reports");
    const url = new URL(request.url);
    const range = getRange(url.searchParams);
    const data = await getBootstrapData({ shopId: staff.shopId, includeRepairItems: true });
    const orders = data.repairs
      .map((repair) => ({ ...repair, status: normalizeStatus(repair.status) }))
      .filter((repair) => repair.status !== "取消" && inRange(repair.repairTime, range.start, range.end));
    const repairs = orders.filter((repair) => (repair.orderType || "repair") !== "warranty");
    const warranties = orders.filter((repair) => repair.orderType === "warranty");
    const technicianById = new Map((data.technicians || []).map((technician) => [technician.id, technician]));
    const repairAmount = (repair) => {
      if (isHistoricalAmountRepair(repair, technicianById)) return 0;
      if (repair.orderType === "warranty" && !repair.warrantyChargeable) return 0;
      const itemTotal = repair.items.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.price || 0), 0);
      return itemTotal || Number(repair.budget || 0);
    };
    const repairCost = (repair) => {
      if (isHistoricalAmountRepair(repair, technicianById)) return 0;
      const itemCost = repair.items.reduce((sum, item) => sum + Number(item.qty || 1) * Number(item.cost || 0), 0);
      return itemCost || Number(repair.costAmount || 0);
    };
    const revenue = orders.reduce((sum, repair) => sum + repairAmount(repair), 0);
    const cost = orders.reduce((sum, repair) => sum + repairCost(repair), 0);
    const received = orders.reduce((sum, repair) => sum + Math.min(repairAmount(repair), repairPaid(repair)), 0);
    const unpaid = orders.reduce((sum, repair) => sum + Math.max(0, repairAmount(repair) - repairPaid(repair)), 0);
    return Response.json({
      range,
      summary: {
        revenue,
        repairCount: repairs.length,
        warrantyCount: warranties.length,
        orderCount: orders.length,
        averageTicket: repairs.length ? revenue / repairs.length : 0,
        cost,
        profit: revenue - cost,
        received,
        unpaid
      },
      technicianStats: technicianStats(orders, data.technicians || [], repairAmount, repairCost),
      topModels: topBy(orders, (repair) => `${repair.brand} ${repair.model}`, (repair) => repairAmount(repair)),
      topBrands: topBy(orders, (repair) => repair.brand || "未填写", (repair) => repairAmount(repair)),
      topServices: topBy(orders.flatMap((repair) => repair.items.length ? repair.items.map((item) => ({ name: item.name, amount: isHistoricalAmountRepair(repair, technicianById) || repair.orderType === "warranty" && !repair.warrantyChargeable ? 0 : Number(item.qty || 0) * Number(item.price || 0) })) : [{ name: repair.issue || "未填写", amount: repairAmount(repair) }]), (item) => item.name, (item) => item.amount),
      statusDistribution: statusOrder.map((status) => ({ status, count: repairs.filter((repair) => repair.status === status).length }))
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

function getRange(params) {
  const today = new Date();
  const preset = params.get("preset") || "month";
  if (params.get("start") && params.get("end")) return { preset: "custom", start: params.get("start"), end: params.get("end") };
  const start = new Date(today);
  if (preset === "today") {
    return { preset, start: dateOnly(today), end: dateOnly(today) };
  }
  if (preset === "week") {
    const day = today.getDay() || 7;
    start.setDate(today.getDate() - day + 1);
    return { preset, start: dateOnly(start), end: dateOnly(today) };
  }
  start.setDate(1);
  return { preset: "month", start: dateOnly(start), end: dateOnly(today) };
}

function dateOnly(date) {
  return date.toISOString().slice(0, 10);
}

function inRange(value, start, end) {
  const day = String(value || "").slice(0, 10);
  return day >= start && day <= end;
}

function topBy(items, keyFn, amountFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    const current = map.get(key) || { name: key, count: 0, amount: 0 };
    current.count += 1;
    current.amount += amountFn(item);
    map.set(key, current);
  }
  return [...map.values()].sort((a, b) => b.count - a.count || b.amount - a.amount).slice(0, 10);
}

function repairPaid(repair) {
  const payments = Array.isArray(repair.payments) ? repair.payments : [];
  const total = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  return payments.length ? total : Number(repair.deposit || 0);
}

function isHistoricalAmountRepair(repair, technicianById = new Map()) {
  return false;
}

function technicianStats(repairs, technicians, amountFn, costFn) {
  const map = new Map();
  const technicianById = new Map((technicians || []).map((technician) => [technician.id, technician]));
  const technicianByName = technicianNameLookup(technicians);
  for (const repair of repairs) {
    const legacyName = String(repair.technicianName || "").trim();
    const technician = technicianById.get(repair.technicianId) || technicianByName.get(legacyName.toLowerCase());
    const name = technician?.name || legacyName || "未分配";
    const key = technician?.id ? `id:${technician.id}` : legacyName ? `name:${legacyName}` : "unassigned";
    const current = map.get(key) || { id: key, name, count: 0, amount: 0, cost: 0, profit: 0, received: 0, unpaid: 0 };
    const amount = amountFn(repair);
    const cost = costFn(repair);
    const received = Math.min(amount, repairPaid(repair));
    current.count += 1;
    current.amount += amount;
    current.cost += cost;
    current.profit += amount - cost;
    current.received += received;
    current.unpaid += Math.max(0, amount - received);
    map.set(key, current);
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount || b.count - a.count || a.name.localeCompare(b.name));
}

function technicianNameLookup(technicians = []) {
  const map = new Map();
  for (const technician of technicians || []) {
    const name = String(technician.name || "").trim().toLowerCase();
    if (name && !map.has(name)) map.set(name, technician);
  }
  return map;
}
