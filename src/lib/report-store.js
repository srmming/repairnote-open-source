import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// 报表 / 财务的服务端聚合。金额口径必须与 src/app/page.jsx 前端函数保持一致：
// chargeAmount / repairCostAmount / repairPaidAmount / isCanceledRepair /
// technicianStats / topBy / revenueTrendRows / FinancePage 的 finance & daily 计算。
// 全部在 SQL 里过滤与分组，应用内存只保留分组后的结果行，绝不把全量单子读进内存。

const money = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

// normalizeStatus 里会归一为「取消」的所有原始值（含旧数据的西语/别名）。
const CANCELED_STATUSES = ["取消", "Cerrado", "Cancelar", "关闭", "拒保"];

// 与前端一致的每单派生列：
// charge = 保修且不收费 ? 0 : max(0, (明细合计>0 ? 明细合计 : 预算) - 折扣)
// cost   = 明细成本合计>0 ? 明细成本合计 : 成本
// paid   = 有付款记录 ? 付款合计 : (订金>=0.01 ? 订金 : 0)
const DERIVED_REPAIRS_SQL = Prisma.sql`
  SELECT r.id, r.ticket, r.status, r.orderType, r.technicianId, r.technicianName,
         r.brand, r.model, r.issue, r.clientId,
         LEFT(r.repairTime, 10) AS repairDay,
         COALESCE(NULLIF(LEFT(r.repairTime, 10), ''), DATE_FORMAT(r.createdAt, '%Y-%m-%d')) AS effectiveDay,
         CASE WHEN r.orderType = 'warranty' AND r.warrantyChargeable = 0 THEN 0
              ELSE GREATEST(0, (CASE WHEN COALESCE(i.itemsTotal, 0) > 0 THEN i.itemsTotal ELSE r.budget END) - r.discountAmount) END AS charge,
         CASE WHEN COALESCE(i.itemsCostTotal, 0) > 0 THEN i.itemsCostTotal ELSE r.costAmount END AS cost,
         CASE WHEN COALESCE(p.payCount, 0) > 0 THEN p.paidTotal WHEN r.deposit >= 0.01 THEN r.deposit ELSE 0 END AS paid
  FROM Repair r
  LEFT JOIN (SELECT repairId, SUM(qty * price) AS itemsTotal, SUM(qty * cost) AS itemsCostTotal FROM RepairItem GROUP BY repairId) i ON i.repairId = r.id
  LEFT JOIN (SELECT repairId, SUM(amount) AS paidTotal, COUNT(*) AS payCount FROM Payment GROUP BY repairId) p ON p.repairId = r.id
  WHERE r.status NOT IN (${Prisma.join(CANCELED_STATUSES)})
`;

// 报表页口径：按 repairTime 的日期部分过滤（repairTime 为空时，只有「不限日期」才会包含，与前端一致）。
function overviewRangeSql(start, end) {
  const conds = [Prisma.sql`1 = 1`];
  if (start) conds.push(Prisma.sql`d.repairDay >= ${start}`);
  if (end) conds.push(Prisma.sql`d.repairDay <= ${end}`);
  return Prisma.join(conds, " AND ");
}

// 财务页口径：repairTime 为空时回退 createdAt（与前端 dateInRange(repairTime || createdAt) 一致）。
function financeRangeSql(start, end) {
  const conds = [Prisma.sql`1 = 1`];
  if (start) conds.push(Prisma.sql`d.effectiveDay >= ${start}`);
  if (end) conds.push(Prisma.sql`d.effectiveDay <= ${end}`);
  return Prisma.join(conds, " AND ");
}

export async function reportOverview({ start = "", end = "", granularity = "day" } = {}) {
  const range = overviewRangeSql(start, end);

  const [summaryRows, technicianGroups, modelGroups, trendGroups, technicians] = await Promise.all([
    prisma.$queryRaw(Prisma.sql`
      SELECT COUNT(*) AS orderCount,
             COALESCE(SUM(d.orderType = 'warranty'), 0) AS warrantyCount,
             COALESCE(SUM(d.charge), 0) AS revenue,
             COALESCE(SUM(d.cost), 0) AS cost,
             COALESCE(SUM(LEAST(d.charge, d.paid)), 0) AS received,
             COALESCE(SUM(GREATEST(0, d.charge - d.paid)), 0) AS unpaid
      FROM (${DERIVED_REPAIRS_SQL}) d WHERE ${range}
    `),
    // COLLATE utf8mb4_bin：前端分组区分大小写，避免 MySQL 默认排序规则把大小写不同的桶合并。
    prisma.$queryRaw(Prisma.sql`
      SELECT d.technicianId, d.technicianName COLLATE utf8mb4_bin AS technicianName, COUNT(*) AS count,
             COALESCE(SUM(d.charge), 0) AS amount,
             COALESCE(SUM(d.cost), 0) AS cost,
             COALESCE(SUM(LEAST(d.charge, d.paid)), 0) AS received,
             COALESCE(SUM(GREATEST(0, d.charge - d.paid)), 0) AS unpaid
      FROM (${DERIVED_REPAIRS_SQL}) d WHERE ${range}
      GROUP BY d.technicianId, d.technicianName COLLATE utf8mb4_bin
    `),
    prisma.$queryRaw(Prisma.sql`
      SELECT d.model COLLATE utf8mb4_bin AS name, COUNT(*) AS count, COALESCE(SUM(d.charge), 0) AS amount
      FROM (${DERIVED_REPAIRS_SQL}) d WHERE ${range}
      GROUP BY d.model COLLATE utf8mb4_bin
    `),
    prisma.$queryRaw(Prisma.sql`
      SELECT ${trendKeySql(granularity)} AS bucket, COUNT(*) AS count, COALESCE(SUM(d.charge), 0) AS amount
      FROM (${DERIVED_REPAIRS_SQL}) d WHERE ${range} AND d.effectiveDay IS NOT NULL
      GROUP BY bucket ORDER BY bucket ASC
    `),
    prisma.technician.findMany()
  ]);

  const summaryRow = summaryRows[0] || {};
  const orderCount = Number(summaryRow.orderCount || 0);
  const warrantyCount = Number(summaryRow.warrantyCount || 0);
  const repairCount = orderCount - warrantyCount;
  const revenue = money(summaryRow.revenue);
  const cost = money(summaryRow.cost);

  return {
    range: { start, end },
    summary: {
      revenue,
      repairCount,
      warrantyCount,
      orderCount,
      averageTicket: repairCount ? revenue / repairCount : 0,
      cost,
      profit: revenue - cost,
      received: money(summaryRow.received),
      unpaid: money(summaryRow.unpaid)
    },
    technicianRows: mergeTechnicianGroups(technicianGroups, technicians),
    topModels: modelGroups
      .map((row) => ({ name: row.name || "", count: Number(row.count), amount: money(row.amount) }))
      .sort((a, b) => b.count - a.count || b.amount - a.amount || String(a.name || "").localeCompare(String(b.name || ""))),
    trendRows: trendGroups
      .map((row) => ({
        key: row.bucket,
        label: granularity === "week" ? `${row.bucket} W` : row.bucket,
        count: Number(row.count),
        amount: money(row.amount)
      }))
      .slice(-36),
    granularity
  };
}

function trendKeySql(granularity) {
  if (granularity === "month") return Prisma.sql`LEFT(d.effectiveDay, 7)`;
  if (granularity === "week") {
    // 周一为一周起点，与前端 trendKey 一致（getDay()||7 回退到周一）。
    return Prisma.sql`DATE_FORMAT(DATE_SUB(STR_TO_DATE(d.effectiveDay, '%Y-%m-%d'), INTERVAL WEEKDAY(STR_TO_DATE(d.effectiveDay, '%Y-%m-%d')) DAY), '%Y-%m-%d')`;
  }
  return Prisma.sql`d.effectiveDay`;
}

// 与前端 technicianStats 一致：在册技师按 id 聚桶（历史姓名单归并进同名技师），
// 其余按姓名聚桶，都没有则记「未分配」。received/unpaid 为逐单 min/max 后求和。
function mergeTechnicianGroups(groups, technicians) {
  const technicianById = new Map(technicians.map((technician) => [technician.id, technician]));
  const technicianByName = new Map();
  for (const technician of technicians) {
    const name = String(technician.name || "").trim().toLowerCase();
    if (name && !technicianByName.has(name)) technicianByName.set(name, technician);
  }
  const rows = new Map();
  for (const group of groups) {
    const legacyName = String(group.technicianName || "").trim();
    const technician = technicianById.get(group.technicianId) || technicianByName.get(legacyName.toLowerCase());
    const key = technician?.id ? `id:${technician.id}` : legacyName ? `name:${legacyName}` : "unassigned";
    const name = technician?.name || legacyName || "";
    const current = rows.get(key) || { id: key, name, isUnassigned: key === "unassigned", count: 0, amount: 0, cost: 0, profit: 0, received: 0, unpaid: 0 };
    current.count += Number(group.count);
    current.amount += money(group.amount);
    current.cost += money(group.cost);
    current.received += money(group.received);
    current.unpaid += money(group.unpaid);
    current.profit = current.amount - current.cost;
    rows.set(key, current);
  }
  return [...rows.values()]
    .filter((row) => row.count > 0)
    .sort((a, b) => b.amount - a.amount || b.count - a.count || String(a.name).localeCompare(String(b.name)));
}

// 付款流水（含无付款记录时按订金合成的「订金」行，与前端 repairPaymentsForDisplay 一致）。
// paidAt：真实付款为 UTC ISO 串（与序列化一致）；合成行回退 repairTime/createdAt 文本。
function paymentsUnionSql() {
  return Prisma.sql`
    SELECT p.id AS id, r.id AS repairId, r.ticket AS ticket,
           COALESCE(c.name, '') AS clientName, COALESCE(c.phone, '') AS clientPhone,
           p.amount AS amount, p.method AS method, p.note AS note,
           DATE_FORMAT(p.paidAt, '%Y-%m-%dT%H:%i:%s.000Z') AS paidAt,
           DATE_FORMAT(p.paidAt, '%Y-%m-%d') AS paidDay
    FROM Payment p
    JOIN Repair r ON r.id = p.repairId AND r.status NOT IN (${Prisma.join(CANCELED_STATUSES)})
    LEFT JOIN Client c ON c.id = r.clientId
    WHERE ABS(p.amount) >= 0.005
    UNION ALL
    SELECT CONCAT('legacy-', r.id) AS id, r.id AS repairId, r.ticket AS ticket,
           COALESCE(c.name, '') AS clientName, COALESCE(c.phone, '') AS clientPhone,
           r.deposit AS amount, 'ledger' AS method, '订金' AS note,
           COALESCE(NULLIF(r.repairTime, ''), DATE_FORMAT(r.createdAt, '%Y-%m-%d %H:%i')) AS paidAt,
           COALESCE(NULLIF(LEFT(r.repairTime, 10), ''), DATE_FORMAT(r.createdAt, '%Y-%m-%d')) AS paidDay
    FROM Repair r
    LEFT JOIN Client c ON c.id = r.clientId
    WHERE r.status NOT IN (${Prisma.join(CANCELED_STATUSES)})
      AND r.deposit >= 0.01
      AND NOT EXISTS (SELECT 1 FROM Payment px WHERE px.repairId = r.id AND ABS(px.amount) >= 0.005)
  `;
}

function paymentsWhereSql({ start, end, q }) {
  const conds = [Prisma.sql`1 = 1`];
  if (start) conds.push(Prisma.sql`u.paidDay >= ${start}`);
  if (end) conds.push(Prisma.sql`u.paidDay <= ${end}`);
  if (q) conds.push(Prisma.sql`LOWER(CONCAT_WS(' ', u.ticket, u.clientName, u.clientPhone, u.note)) LIKE ${`%${q}%`}`);
  return Prisma.join(conds, " AND ");
}

export async function reportFinance({ start = "", end = "", q = "", paymentsPage = 1, unpaidPage = 1, pageSize = 10 } = {}) {
  const query = String(q || "").trim().toLowerCase();
  const size = Math.min(100, Math.max(1, Number(pageSize) || 10));
  const payPage = Math.max(1, Number(paymentsPage) || 1);
  const duePage = Math.max(1, Number(unpaidPage) || 1);
  const range = financeRangeSql(start, end);
  const payWhere = paymentsWhereSql({ start, end, q: query });
  const unpaidSearch = query
    ? Prisma.sql`AND LOWER(CONCAT_WS(' ', d.ticket, d.clientName, d.clientPhone, d.brand, d.model, d.issue)) LIKE ${`%${query}%`}`
    : Prisma.sql``;
  const today = dateOnly(new Date());

  const derivedWithClient = Prisma.sql`
    SELECT d0.*, COALESCE(c.name, '') AS clientName, COALESCE(c.phone, '') AS clientPhone
    FROM (${DERIVED_REPAIRS_SQL}) d0 LEFT JOIN Client c ON c.id = d0.clientId
  `;

  const [summaryRows, receivedRows, payRows, unpaidCountRows, unpaidRows, dailyOrderRows, dailyPayRows] = await Promise.all([
    // 应收/成本/未收：范围内全部有效订单，不受搜索影响（与前端一致）
    prisma.$queryRaw(Prisma.sql`
      SELECT COALESCE(SUM(d.charge), 0) AS receivable,
             COALESCE(SUM(d.cost), 0) AS costTotal,
             COALESCE(SUM(GREATEST(0, d.charge - d.paid)), 0) AS unpaid
      FROM (${DERIVED_REPAIRS_SQL}) d WHERE ${range}
    `),
    // 已收 + 笔数：按付款时间过滤，受搜索影响（与前端一致）
    prisma.$queryRaw(Prisma.sql`
      SELECT COALESCE(SUM(u.amount), 0) AS received, COUNT(*) AS paymentCount
      FROM (${paymentsUnionSql()}) u WHERE ${payWhere}
    `),
    prisma.$queryRaw(Prisma.sql`
      SELECT u.* FROM (${paymentsUnionSql()}) u WHERE ${payWhere}
      ORDER BY u.paidAt DESC, u.id DESC
      LIMIT ${size} OFFSET ${(payPage - 1) * size}
    `),
    prisma.$queryRaw(Prisma.sql`
      SELECT COUNT(*) AS total FROM (${derivedWithClient}) d
      WHERE ${range} AND GREATEST(0, d.charge - d.paid) > 0.005 ${unpaidSearch}
    `),
    prisma.$queryRaw(Prisma.sql`
      SELECT d.id AS repairId, d.ticket, d.status, d.clientName, d.clientPhone,
             d.charge AS total, d.paid AS paid, GREATEST(0, d.charge - d.paid) AS due
      FROM (${derivedWithClient}) d
      WHERE ${range} AND GREATEST(0, d.charge - d.paid) > 0.005 ${unpaidSearch}
      ORDER BY due DESC, d.ticket DESC
      LIMIT ${size} OFFSET ${(duePage - 1) * size}
    `),
    // 今日经营：订单指标（当日下单）
    prisma.$queryRaw(Prisma.sql`
      SELECT COUNT(*) AS orderCount,
             COALESCE(SUM(GREATEST(0, d.charge - d.paid)), 0) AS unpaid,
             COALESCE(SUM(d.cost), 0) AS cost,
             COALESCE(SUM(d.charge - d.cost), 0) AS profit
      FROM (${DERIVED_REPAIRS_SQL}) d WHERE d.effectiveDay = ${today}
    `),
    // 今日经营：收款指标（当日收款，含订金/尾款拆分）
    prisma.$queryRaw(Prisma.sql`
      SELECT COALESCE(SUM(u.amount), 0) AS collected, COUNT(*) AS paymentCount,
             COALESCE(SUM(CASE WHEN LOWER(u.note) LIKE '%订金%' OR LOWER(u.note) LIKE '%depósito%' OR LOWER(u.note) LIKE '%deposito%' THEN u.amount ELSE 0 END), 0) AS depositCollected,
             COALESCE(SUM(CASE WHEN LOWER(u.note) LIKE '%尾款%' OR LOWER(u.note) LIKE '%pago final%' THEN u.amount ELSE 0 END), 0) AS finalCollected
      FROM (${paymentsUnionSql()}) u WHERE u.paidDay = ${today}
    `)
  ]);

  const summaryRow = summaryRows[0] || {};
  const receivedRow = receivedRows[0] || {};
  const dailyOrder = dailyOrderRows[0] || {};
  const dailyPay = dailyPayRows[0] || {};

  return {
    range: { start, end },
    summary: {
      receivable: money(summaryRow.receivable),
      costTotal: money(summaryRow.costTotal),
      unpaid: money(summaryRow.unpaid),
      received: money(receivedRow.received),
      paymentCount: Number(receivedRow.paymentCount || 0)
    },
    daily: {
      collected: money(dailyPay.collected),
      depositCollected: money(dailyPay.depositCollected),
      finalCollected: money(dailyPay.finalCollected),
      paymentCount: Number(dailyPay.paymentCount || 0),
      orderCount: Number(dailyOrder.orderCount || 0),
      unpaid: money(dailyOrder.unpaid),
      cost: money(dailyOrder.cost),
      profit: money(dailyOrder.profit)
    },
    payments: {
      rows: payRows.map((row) => ({
        id: row.id,
        repairId: row.repairId,
        ticket: row.ticket || "-",
        clientName: row.clientName || "-",
        clientPhone: row.clientPhone || "",
        amount: money(row.amount),
        method: row.method || "",
        note: row.note || "",
        paidAt: row.paidAt || ""
      })),
      total: Number(receivedRow.paymentCount || 0),
      page: payPage,
      pageSize: size
    },
    unpaidOrders: {
      rows: unpaidRows.map((row) => ({
        repairId: row.repairId,
        ticket: row.ticket || "-",
        status: row.status || "",
        clientName: row.clientName || "-",
        clientPhone: row.clientPhone || "",
        total: money(row.total),
        paid: money(row.paid),
        due: money(row.due)
      })),
      total: Number(unpaidCountRows[0]?.total || 0),
      page: duePage,
      pageSize: size
    }
  };
}

function dateOnly(date) {
  const pad = (num) => String(num).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
