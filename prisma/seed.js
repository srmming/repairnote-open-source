const { PrismaClient } = require("@prisma/client");
const crypto = require("crypto");

// 首次安装：只有在提供有效的、非默认、非占位的管理员凭据后，才创建首位 Staff，
// 并在同一事务里把它设为系统主管理员和默认门户 "default" 的门户管理员（同时建立默认门户空设置）。
// 已有账号时重复 seed 不新增系统角色、不重设密码、不覆盖门户权限。演示数据只在明确的非生产条件下写入。

const prisma = new PrismaClient();
const DEFAULT_PORTAL_ID = "default";
const DEFAULT_PORTAL_NAME = "默认门户";
const PAGE_PERMISSION_KEYS = ["repairs", "clients", "categories", "modules", "services", "attributes", "technicians", "reports", "finance", "settings", "backup"];
const WEAK_PASSWORDS = new Set(["admin123", "123456", "12345678", "password", "admin", "change-this-before-deploy", "changeme", "repairnote"]);

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function id() {
  return crypto.randomUUID();
}

const defaultSettings = {
  phone: "",
  taxRate: 21,
  uiLanguage: "zh",
  printLanguage: "zh",
  scanShortcut: "F2",
  defaultWarrantyDays: 90,
  defaultWarrantyMonths: 3,
  hideIssuer: false,
  allowOrderUnlock: true,
  enableOrderLock: true,
  showPasswordSection: true,
  showPhotoSection: true,
  showSignatureSection: true,
  showQrNoticeSection: true,
  reservationTerms: "",
  repairTerms: "",
  warrantyTerms: "",
  whatsappProgressTemplate: "Hola {name},\n\nSomos {shop}.\nPuede consultar el estado de su reparación aquí:\n{url}\n\nNº de orden: {ticket}\nEquipo: {device}\n\nGracias."
};

function flagOn(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function shouldSeedDemoData() {
  return process.env.NODE_ENV !== "production" && flagOn(process.env.REPAIRNOTE_SEED_DEMO);
}

// 严格凭据：非空、非占位、非已知弱密码；生产至少 8 位。错误信息不回显密码。
function readInitialCredentials() {
  const username = String(process.env.REPAIRNOTE_ADMIN_USERNAME || "").trim();
  const password = String(process.env.REPAIRNOTE_ADMIN_PASSWORD || "");
  const production = process.env.NODE_ENV === "production";
  const problems = [];
  if (!username) problems.push("REPAIRNOTE_ADMIN_USERNAME 未设置");
  if (username.length > 64) problems.push("REPAIRNOTE_ADMIN_USERNAME 过长");
  if (!password) problems.push("REPAIRNOTE_ADMIN_PASSWORD 未设置");
  else if (WEAK_PASSWORDS.has(password.toLowerCase())) problems.push("REPAIRNOTE_ADMIN_PASSWORD 是默认 / 占位 / 弱密码，必须换成真实密码");
  else if (password.length < (production ? 8 : 6)) problems.push(`REPAIRNOTE_ADMIN_PASSWORD 太短（至少 ${production ? 8 : 6} 位）`);
  if (problems.length) {
    throw new Error(`首次初始化管理员失败：${problems.join("；")}。请在 .env 中设置真实的管理员用户名和密码后重试（未创建任何账号）。`);
  }
  return { username, password };
}

async function main() {
  const staffCount = await prisma.staff.count();
  if (staffCount === 0) {
    const { username, password } = readInitialCredentials();
    await prisma.$transaction(async (tx) => {
      await tx.portal.upsert({
        where: { id: DEFAULT_PORTAL_ID },
        create: { id: DEFAULT_PORTAL_ID, name: DEFAULT_PORTAL_NAME, isActive: true, revision: 1n },
        update: {}
      });
      await tx.setting.upsert({ where: { portalId: DEFAULT_PORTAL_ID }, create: { portalId: DEFAULT_PORTAL_ID, value: defaultSettings }, update: {} });
      await tx.staff.create({
        data: {
          id: "u1",
          name: username,
          username,
          email: "",
          passwordHash: hashPassword(password),
          isSystemAdmin: true,
          memberships: { create: { portalId: DEFAULT_PORTAL_ID, isAdmin: true, pagePermissions: PAGE_PERMISSION_KEYS } }
        }
      });
    });
    console.log(`已创建首位系统主管理员 ${username}（同时是默认门户管理员）。`);
  } else {
    console.log(`已有 ${staffCount} 个账号，跳过管理员初始化（不重置密码、不改变系统身份或门户权限）。`);
  }

  const defaultPortal = await prisma.portal.findUnique({ where: { id: DEFAULT_PORTAL_ID } });
  if (defaultPortal) {
    await prisma.setting.upsert({ where: { portalId: DEFAULT_PORTAL_ID }, create: { portalId: DEFAULT_PORTAL_ID, value: defaultSettings }, update: {} });
  }

  if (!shouldSeedDemoData() || !defaultPortal) return;
  const hasBusinessData = (await prisma.client.count()) > 0 || (await prisma.brand.count()) > 0 || (await prisma.repair.count()) > 0;
  if (hasBusinessData) return;
  await seedDemoData(DEFAULT_PORTAL_ID);
  console.log("已写入演示数据（仅非生产环境、REPAIRNOTE_SEED_DEMO 明确开启时）。");
}

async function seedDemoData(portalId) {
  const brands = ["Acer", "Apple", "Samsung", "Xiaomi", "Huawei", "Oppo", "Sony", "Portatil"].map((name, index) => ({ id: id(), portalId, name, sortOrder: index }));
  const brandByName = Object.fromEntries(brands.map((brand) => [brand.name, brand.id]));
  const models = [["Acer", "Allegro"], ["Apple", "IPHONE 13"], ["Apple", "IPHONE 15 PRO"], ["Samsung", "A12"], ["Samsung", "A13"], ["Samsung", "A14 5G"], ["Samsung", "S22"], ["Samsung", "S23 ULTRA"], ["Xiaomi", "REDMI NOTE 8 PRO"], ["Portatil", "PAVILION"]].map(([brand, name], index) => ({ id: id(), portalId, brandId: brandByName[brand], name, sortOrder: index }));
  const services = [
    ["Cambiar Pantalla Color Negro Con 3 Meses De Garantía", "更换黑色屏幕，三个月保修", "", 79],
    ["Cambiar Batería Original Con 3 meses Garantia", "更换原装电池，三个月保修", "", 49],
    ["Conector De Carga", "更换充电接口", "", 45],
    ["Protector cristal templado", "钢化膜", "", 12],
    ["Funda de movil", "手机壳", "", 12]
  ].map(([defaultName, zh, es, price], index) => ({ id: id(), portalId, defaultName, category: "维修", zh, es, price, sortOrder: index }));
  const parts = [["Volume Button", "音量按钮", "Boton Volumen"], ["Power Button", "电源按钮", "Boton Power"], ["Battery", "电池", "Bateria"], ["Glass", "玻璃", "Cristal"]].map(([defaultName, zh, es], index) => ({ id: id(), portalId, defaultName, category: "配件", zh, es, price: 0, sortOrder: index }));
  const technicians = [{ id: id(), portalId, name: "ming", phone: "", email: "", color: "#16a34a", active: true, sortOrder: 0 }];
  const clients = ["OLGA", "FERNANDO", "VICENTE", "CARLOS", "JULIO", "JAVIER"].map((name, index) => ({ id: id(), portalId, name, docType: "DNI", identity: "", email: "", phone: `6${String(60000000 + index * 12345).slice(0, 8)}`, address: "", comment: "" }));
  const clientByName = Object.fromEntries(clients.map((client) => [client.name, client.id]));
  const repairs = [
    ["1777979211613", "OLGA", "APPLE", "IPHONE 15 PRO", "Cambiar Pantalla Color Negro Con 3 Meses De Garantía", "已取走", "2026-05-05 13:06", "2026-05-05 15:22", 89],
    ["1777978684161", "FERNANDO", "Samsung", "A14 5G", "Cambiar Pantalla Color Negro Con 3 Meses De Garantía", "已取走", "2026-05-05 12:57", "2026-05-05 14:03", 79],
    ["1777976592283", "VICENTE", "Xiaomi", "REDMI NOTE 8 PRO", "Cambiar Pantalla Color Negro Con 3 Meses De Garantía", "已取走", "2026-05-05 12:22", "2026-05-05 13:19", 69],
    ["1777913104015", "JULIO", "Samsung", "T580", "REVIVIR LA BATERIA", "预定", "2026-05-04 18:44", "", 35]
  ];

  await prisma.client.createMany({ data: clients });
  await prisma.brand.createMany({ data: brands });
  await prisma.model.createMany({ data: models });
  await prisma.service.createMany({ data: services });
  await prisma.part.createMany({ data: parts });
  await prisma.technician.createMany({ data: technicians });
  const color = await prisma.attributeGroup.create({ data: { portalId, name: "颜色" } });
  const other = await prisma.attributeGroup.create({ data: { portalId, name: "其他" } });
  await prisma.attribute.createMany({ data: [
    { id: id(), portalId, groupId: color.id, defaultName: "Black", zh: "黑色", es: "Negro", sortOrder: 0 },
    { id: id(), portalId, groupId: color.id, defaultName: "White", zh: "白色", es: "Blanco", sortOrder: 1 },
    { id: id(), portalId, groupId: other.id, defaultName: "No testable", zh: "无法检测", es: "No se puede testear", sortOrder: 2 }
  ] });
  for (const [ticket, clientName, brand, model, issue, status, repairTime, warrantyStart, price] of repairs) {
    const repairId = id();
    await prisma.repair.create({
      data: {
        id: repairId, portalId, ticket, clientId: clientByName[clientName], brand: brand.toUpperCase(), model,
        properties: "", imei: "", issue, internalNote: "", passwordType: "", passwordText: "", passwordPattern: [],
        status, repairTime, warrantyStart, technicianId: technicians[0].id, technicianName: technicians[0].name, budget: price, deposit: 0,
        frontPhoto: "", backPhoto: "", signatureDataUrl: "",
        warrantyReason: "", warrantyDiagnosis: "", warrantyResolution: "",
        statusHistory: [],
        notificationLog: [],
        searchText: [ticket, clientName, brand, model, issue].join(" ").toLowerCase(),
        ticketSort: BigInt(ticket),
        items: { create: [{ name: issue, qty: 1, price, cost: 0 }] }
      }
    });
  }
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
