// 压测/对账用种子：生成约 40000 条维修单（含客户/技师/明细/付款）。
// 幂等：单号前缀 PF-，重复运行会先清掉旧的 PF- 数据再生成。
// 用法：node scripts/seed-40k.mjs [数量]（默认 40000）
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { loadDotEnv } from "./load-env.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadDotEnv(root);

const prisma = new PrismaClient();
const TOTAL = Math.max(1000, Number(process.argv[2]) || 40000);
const CLIENT_COUNT = 400;
const TECH_NAMES = ["压测技师A", "压测技师B", "压测技师C", "压测技师D", "压测技师E", "压测技师F"];
const STATUSES = ["预定", "预定到货", "维修中", "完成", "已取走", "取消"];
const STATUS_WEIGHTS = [0.05, 0.05, 0.15, 0.2, 0.5, 0.05];
const BRANDS = [["Apple", ["iPhone 12", "iPhone 13", "iPhone 15 Pro"]], ["Samsung", ["Galaxy S21", "Galaxy A54"]], ["Xiaomi", ["Redmi Note 12", "Mi 11"]], ["Huawei", ["P30", "Mate 40"]]];
const ISSUES = ["pantalla rota", "no enciende", "cambiar bateria", "无法充电", "进水维修", "摄像头模糊", "altavoz no suena"];
const ITEM_NAMES = ["Cambiar pantalla", "Cambiar bateria", "清洁主板", "Conector de carga", "后盖更换"];
const METHODS = ["cash", "card", "bizum", "transfer"];

// 可复现的伪随机
let rngState = 20260702;
function rand() {
  rngState = (rngState * 1103515245 + 12345) % 2147483648;
  return rngState / 2147483648;
}
function pick(list) { return list[Math.floor(rand() * list.length)]; }
function pickWeighted(list, weights) {
  let roll = rand();
  for (let i = 0; i < list.length; i++) { roll -= weights[i]; if (roll <= 0) return list[i]; }
  return list[list.length - 1];
}
function money(value) { return Math.round(value * 100) / 100; }
function pad(value, width) { return String(value).padStart(width, "0"); }

function repairTimeAt(index) {
  // 均匀铺在最近 730 天内，格式与业务一致 "YYYY-MM-DD HH:mm"
  const end = new Date("2026-07-01T20:00:00");
  const ms = end.getTime() - Math.floor((index / TOTAL) * 730 * 24 * 3600 * 1000) - Math.floor(rand() * 3600 * 1000);
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)} ${pad(d.getHours(), 2)}:${pad(d.getMinutes(), 2)}`;
}

function buildSearchText(parts) {
  return parts.filter(Boolean).map((v) => String(v).trim()).filter(Boolean).join(" ").toLowerCase().slice(0, 8000);
}

async function cleanup() {
  const old = await prisma.repair.count({ where: { ticket: { startsWith: "PF-" } } });
  if (old) {
    console.log(`清理旧压测数据：${old} 单`);
    // Cascade 会带走 items/payments；分批删避免超大事务
    while (true) {
      const batch = await prisma.repair.findMany({ where: { ticket: { startsWith: "PF-" } }, select: { id: true }, take: 5000 });
      if (!batch.length) break;
      await prisma.repair.deleteMany({ where: { id: { in: batch.map((row) => row.id) } } });
    }
  }
  await prisma.client.deleteMany({ where: { comment: "PF-SEED" } });
  await prisma.technician.deleteMany({ where: { name: { in: TECH_NAMES }, phone: "PF-SEED" } });
}

async function main() {
  console.time("seed-40k");
  await cleanup();

  await prisma.technician.createMany({
    data: TECH_NAMES.map((name, index) => ({ id: `pftech${index + 1}`, name, phone: "PF-SEED", sortOrder: 90 + index })),
    skipDuplicates: true
  });
  const technicians = await prisma.technician.findMany({ where: { phone: "PF-SEED" } });

  const clients = Array.from({ length: CLIENT_COUNT }, (_, index) => ({
    id: `pfclient${pad(index + 1, 5)}`,
    name: `压测客户${pad(index + 1, 4)}`,
    phone: `6${pad(10000000 + index, 8)}`,
    identity: `PF${pad(index + 1, 6)}X`,
    address: "",
    comment: "PF-SEED"
  }));
  await prisma.client.createMany({ data: clients, skipDuplicates: true });

  const BATCH = 1000;
  let itemCount = 0;
  let paymentCount = 0;
  const repairIdsForWarranty = [];

  for (let offset = 0; offset < TOTAL; offset += BATCH) {
    const size = Math.min(BATCH, TOTAL - offset);
    const repairRows = [];
    const itemRows = [];
    const paymentRows = [];

    for (let i = 0; i < size; i++) {
      const index = offset + i;
      const id = `pfrepair${pad(index + 1, 6)}`;
      const ticket = `PF-${pad(10000001 + index, 8)}`;
      const client = clients[Math.floor(rand() * clients.length)];
      const [brand, models] = pick(BRANDS);
      const model = pick(models);
      const issue = pick(ISSUES);
      const status = pickWeighted(STATUSES, STATUS_WEIGHTS);
      const repairTime = repairTimeAt(index);
      const useTechnician = rand() < 0.85;
      const technician = useTechnician ? technicians[Math.floor(rand() * technicians.length)] : null;
      const legacyNameOnly = useTechnician && rand() < 0.08;
      const isWarranty = rand() < 0.08 && repairIdsForWarranty.length > 50;
      const warrantyChargeable = isWarranty && rand() < 0.15;

      const hasItems = rand() < 0.6;
      let itemsTotal = 0;
      const names = [];
      if (hasItems) {
        const count = 1 + Math.floor(rand() * 3);
        for (let j = 0; j < count; j++) {
          const price = money(10 + rand() * 290);
          const cost = money(price * (0.3 + rand() * 0.3));
          itemsTotal = money(itemsTotal + price);
          const name = pick(ITEM_NAMES);
          names.push(name);
          itemRows.push({ repairId: id, name, qty: 1, price, cost });
          itemCount++;
        }
      }
      const budget = hasItems ? 0 : money(20 + rand() * 230);
      const costAmount = hasItems ? 0 : money(budget * (0.3 + rand() * 0.3));
      const discountAmount = rand() < 0.06 ? money(5 + rand() * 20) : 0;
      const total = isWarranty && !warrantyChargeable ? 0 : Math.max(0, money((hasItems ? itemsTotal : budget) - discountAmount));

      const canceled = status === "取消";
      if (!canceled && total > 0 && rand() < 0.75) {
        const paidRatio = rand() < 0.7 ? 1 : 0.3 + rand() * 0.5;
        const paidTotal = money(total * paidRatio);
        const twoPayments = paidTotal > 30 && rand() < 0.3;
        const first = twoPayments ? money(paidTotal * 0.4) : paidTotal;
        paymentRows.push({ repairId: id, amount: first, method: pick(METHODS), paidAt: new Date(repairTime.replace(" ", "T") + ":00") });
        paymentCount++;
        if (twoPayments) {
          paymentRows.push({ repairId: id, amount: money(paidTotal - first), method: pick(METHODS), paidAt: new Date(new Date(repairTime.replace(" ", "T") + ":00").getTime() + 86400000) });
          paymentCount++;
        }
      }

      const sourceRepairId = isWarranty ? repairIdsForWarranty[Math.floor(rand() * repairIdsForWarranty.length)] : "";
      const technicianName = technician ? technician.name : "";
      repairRows.push({
        id,
        ticket,
        clientId: client.id,
        brand,
        model,
        properties: "",
        imei: rand() < 0.5 ? `35${pad(Math.floor(rand() * 1e13), 13)}` : "",
        issue,
        internalNote: "",
        passwordType: "",
        passwordText: "",
        passwordPattern: [],
        status,
        repairTime,
        warrantyStart: status === "已取走" ? repairTime.slice(0, 10) : "",
        technicianId: technician && !legacyNameOnly ? technician.id : "",
        technicianName,
        budget,
        deposit: 0,
        paymentMethod: "none",
        discountAmount,
        costAmount,
        frontPhoto: "",
        backPhoto: "",
        signatureDataUrl: "",
        signedAt: "",
        publicToken: `pftoken${pad(index + 1, 8)}`,
        orderType: isWarranty ? "warranty" : "repair",
        sourceRepairId,
        warrantyReason: isWarranty ? "保修返修" : "",
        warrantyDiagnosis: "",
        warrantyResolution: "",
        warrantyChargeable,
        statusHistory: [{ status, at: repairTime }],
        notificationLog: [],
        searchText: buildSearchText([ticket, brand, model, issue, status, technicianName, client.name, client.phone, client.identity, ...names]),
        ticketSort: BigInt(10000001 + index)
      });
      if (!isWarranty && !canceled) repairIdsForWarranty.push(id);
      if (repairIdsForWarranty.length > 20000) repairIdsForWarranty.splice(0, 10000);
    }

    await prisma.repair.createMany({ data: repairRows });
    if (itemRows.length) await prisma.repairItem.createMany({ data: itemRows });
    if (paymentRows.length) await prisma.payment.createMany({ data: paymentRows });
    if ((offset / BATCH) % 5 === 4) console.log(`已写入 ${offset + size}/${TOTAL}`);
  }

  const repairTotal = await prisma.repair.count();
  const pfTotal = await prisma.repair.count({ where: { ticket: { startsWith: "PF-" } } });
  console.log(`完成：压测单 ${pfTotal} 条（库内维修单总数 ${repairTotal}），明细 ${itemCount} 条，付款 ${paymentCount} 条`);
  console.timeEnd("seed-40k");
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
