const { PrismaClient } = require("@prisma/client");
const crypto = require("crypto");

const prisma = new PrismaClient();

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

function shouldSeedDemoData() {
  const flag = String(process.env.REPAIRNOTE_SEED_DEMO || "").trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(flag)) return true;
  if (["0", "false", "no", "off"].includes(flag)) return false;
  return process.env.NODE_ENV !== "production";
}

async function main() {
  const hasStaff = (await prisma.staff.count()) > 0;
  if (!hasStaff) {
    const adminUsername = process.env.REPAIRNOTE_ADMIN_USERNAME || (process.env.NODE_ENV === "production" ? "admin" : "ming");
    const adminPassword = process.env.REPAIRNOTE_ADMIN_PASSWORD || (process.env.NODE_ENV === "production" ? "admin123" : "123456");
    const placeholderPassword = adminPassword === "change-this-before-deploy";
    if (!adminUsername || !adminPassword || placeholderPassword) {
      throw new Error("请先设置 REPAIRNOTE_ADMIN_USERNAME 和真实的 REPAIRNOTE_ADMIN_PASSWORD，不能使用 change-this-before-deploy");
    }
    await prisma.staff.create({ data: { id: "u1", name: adminUsername, username: adminUsername, email: "", passwordHash: hashPassword(adminPassword), isAdmin: true, pagePermissions: ["repairs", "warranties", "clients", "categories", "modules", "services", "attributes", "technicians", "reports", "finance", "settings", "backup"] } });
  }

  await prisma.setting.upsert({ where: { id: "main" }, create: { id: "main", value: defaultSettings }, update: {} });

  const hasBusinessData = (await prisma.client.count()) > 0 || (await prisma.brand.count()) > 0 || (await prisma.repair.count()) > 0;
  if (!shouldSeedDemoData() || hasBusinessData) return;

  const brands = ["Acer", "Apple", "Samsung", "Xiaomi", "Huawei", "Oppo", "Sony", "Portatil"].map((name, index) => ({ id: id(), name, sortOrder: index }));
  const brandByName = Object.fromEntries(brands.map((brand) => [brand.name, brand.id]));
  const models = [["Acer", "Allegro"], ["Apple", "IPHONE 13"], ["Apple", "IPHONE 15 PRO"], ["Samsung", "A12"], ["Samsung", "A13"], ["Samsung", "A14 5G"], ["Samsung", "S22"], ["Samsung", "S23 ULTRA"], ["Xiaomi", "REDMI NOTE 8 PRO"], ["Portatil", "PAVILION"]].map(([brand, name], index) => ({ id: id(), brandId: brandByName[brand], name, sortOrder: index }));
  const services = [
    ["Cambiar Pantalla Color Negro Con 3 Meses De Garantía", "更换黑色屏幕，三个月保修", "", 79],
    ["Cambiar Batería Original Con 3 meses Garantia", "更换原装电池，三个月保修", "", 49],
    ["Conector De Carga", "更换充电接口", "", 45],
    ["Protector cristal templado", "钢化膜", "", 12],
    ["Funda de movil", "手机壳", "", 12]
  ].map(([defaultName, zh, es, price], index) => ({ id: id(), defaultName, category: "维修", zh, es, price, sortOrder: index }));
  const parts = [["Volume Button", "音量按钮", "Boton Volumen"], ["Power Button", "电源按钮", "Boton Power"], ["Battery", "电池", "Bateria"], ["Glass", "玻璃", "Cristal"]].map(([defaultName, zh, es], index) => ({ id: id(), defaultName, category: "配件", zh, es, price: 0, sortOrder: index }));
  const technicians = [{ id: id(), name: "ming", phone: "", email: "", color: "#16a34a", active: true, sortOrder: 0 }];
  const clients = ["OLGA", "FERNANDO", "VICENTE", "CARLOS", "JULIO", "JAVIER"].map((name, index) => ({ id: id(), name, docType: "DNI", identity: "", email: "", phone: `6${String(60000000 + index * 12345).slice(0, 8)}`, address: "", comment: "" }));
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
  const color = await prisma.attributeGroup.create({ data: { name: "颜色" } });
  const other = await prisma.attributeGroup.create({ data: { name: "其他" } });
  await prisma.attribute.createMany({ data: [
    { id: id(), groupId: color.id, defaultName: "Black", zh: "黑色", es: "Negro", sortOrder: 0 },
    { id: id(), groupId: color.id, defaultName: "White", zh: "白色", es: "Blanco", sortOrder: 1 },
    { id: id(), groupId: other.id, defaultName: "No testable", zh: "无法检测", es: "No se puede testear", sortOrder: 2 }
  ] });
  for (const [ticket, clientName, brand, model, issue, status, repairTime, warrantyStart, price] of repairs) {
    const repairId = id();
    await prisma.repair.create({
      data: {
        id: repairId, ticket, clientId: clientByName[clientName], brand: brand.toUpperCase(), model,
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

main().finally(async () => prisma.$disconnect());
