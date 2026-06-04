import { normalizeStatus } from "@/lib/seed-data";

// 服务端金额聚合逻辑。必须与 src/app/page.jsx 中的同名前端函数保持一致：
// repairAmount / repairCostAmount / chargeAmount / isCanceledRepair /
// isHistoricalAmountRepair / technicianSummaryRows。
// 操作的是“轻量序列化维修单”：{ status, orderType, warrantyChargeable, itemsTotal,
// itemsCostTotal, budget, discountAmount, costAmount, technicianId, technicianName }。

const money = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

function repairAmount(repair) {
  const itemsTotal = money(repair.itemsTotal);
  return itemsTotal > 0 ? itemsTotal : money(repair.budget);
}

function repairCostAmount(repair) {
  const itemsCostTotal = money(repair.itemsCostTotal);
  return itemsCostTotal > 0 ? itemsCostTotal : money(repair.costAmount);
}

function chargeAmount(repair) {
  if ((repair.orderType || "repair") === "warranty" && !repair.warrantyChargeable) return 0;
  return Math.max(0, repairAmount(repair) - money(repair.discountAmount));
}

function isCanceledRepair(repair) {
  return normalizeStatus(repair.status) === "取消";
}

export function technicianNameLookup(technicians = []) {
  const map = new Map();
  for (const technician of technicians) {
    const name = String(technician.name || "").trim().toLowerCase();
    if (name && !map.has(name)) map.set(name, technician);
  }
  return map;
}

function isHistoricalAmountRepair() {
  return false;
}

// 与前端 totals + technicianSummaryRows 等价：返回 { totals, technicianRows }。
// 未分配桶(isUnassigned)由前端本地化为 t("unassignedTechnician")。
export function computeListAggregates(repairs = [], technicians = []) {
  const technicianById = new Map((technicians || []).map((technician) => [technician.id, technician]));
  const technicianByName = technicianNameLookup(technicians);

  const totals = repairs.reduce((sum, repair) => {
    if (isCanceledRepair(repair)) return sum;
    const amount = chargeAmount(repair);
    const cost = repairCostAmount(repair);
    return { amount: sum.amount + amount, cost: sum.cost + cost, profit: sum.profit + amount - cost };
  }, { amount: 0, cost: 0, profit: 0 });

  const rows = new Map();
  const makeRow = (id, name, isUnassigned = false) => ({ id, name, isUnassigned, orderCount: 0, repairCount: 0, warrantyCount: 0, amount: 0, cost: 0, profit: 0 });
  const ensureRow = (repair) => {
    const technician = technicianById.get(repair.technicianId);
    if (technician) {
      const key = `id:${technician.id}`;
      if (!rows.has(key)) rows.set(key, makeRow(key, technician.name || ""));
      return rows.get(key);
    }
    const legacyName = String(repair.technicianName || "").trim();
    const namedTechnician = technicianByName.get(legacyName.toLowerCase());
    if (namedTechnician) {
      const key = `id:${namedTechnician.id}`;
      if (!rows.has(key)) rows.set(key, makeRow(key, namedTechnician.name || ""));
      return rows.get(key);
    }
    if (legacyName) {
      const key = `name:${legacyName}`;
      if (!rows.has(key)) rows.set(key, makeRow(key, legacyName));
      return rows.get(key);
    }
    const key = "unassigned";
    if (!rows.has(key)) rows.set(key, makeRow(key, "", true));
    return rows.get(key);
  };

  for (const repair of repairs) {
    if (isCanceledRepair(repair)) continue;
    const row = ensureRow(repair);
    const skipAmount = isHistoricalAmountRepair(repair, technicianById);
    const amount = skipAmount ? 0 : chargeAmount(repair);
    const cost = skipAmount ? 0 : repairCostAmount(repair);
    row.orderCount += 1;
    if ((repair.orderType || "repair") === "warranty") row.warrantyCount += 1;
    else row.repairCount += 1;
    row.amount += amount;
    row.cost += cost;
    row.profit += amount - cost;
  }

  const technicianRows = [...rows.values()]
    .filter((row) => row.orderCount)
    .sort((a, b) => Number(a.isUnassigned) - Number(b.isUnassigned) || b.profit - a.profit || b.amount - a.amount || b.orderCount - a.orderCount || String(a.name).localeCompare(String(b.name)));

  return { totals, technicianRows };
}
