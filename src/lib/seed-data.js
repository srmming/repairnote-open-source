export const serviceZhMap = {
  "OFERTA BLACK FRIDAY 2025": "黑五优惠 2025",
  "GARANTIA DE 3 MESES": "三个月保修",
  "Funda de movil": "手机壳",
  "Cambiar camara trasera": "更换后置摄像头",
  "Protector hidrogel": "水凝膜",
  "Protector cristal templado iPhone": "iPhone 钢化膜",
  "Protector Cristal UV": "UV 钢化膜",
  "Protector Hidrogel Curvo": "曲面水凝膜",
  "Protector cristal templado": "钢化膜",
  "Cambiar Pantalla Color Negro Con 3 Meses De Garantía": "更换黑色屏幕，三个月保修",
  "Cambiar Pantalla Color Blanco con 3 Meses Garantia": "更换白色屏幕，三个月保修",
  "Cambiar Pantalla Original COLOR NEGRO Con 3 meses Garantia": "更换原装黑色屏幕，三个月保修",
  "Cambiar Pantalla Original COLOR BLANCO Con 3 meses de Garantia": "更换原装白色屏幕，三个月保修",
  "Cambiar Cristal De Pantalla": "更换外屏玻璃",
  "Cambiar Cristal De Cámara Trasera": "更换后摄玻璃",
  "Cambiar Tapa Trasera": "更换后盖",
  "Conector De Carga": "更换充电接口",
  "Cambiar Batería con 3 meses Garantia": "更换电池，三个月保修",
  "Cambiar Batería Original Con 3 meses Garantia": "更换原装电池，三个月保修",
  "Botón Volumen": "音量键",
  "Liberar móvil": "手机解锁",
  "Eliminar Cuenta FRP": "移除 FRP 账号锁",
  "No Enciende / Revisar": "不开机 / 检测",
  "Mojado / No enciende / Revisar": "进水 / 不开机 / 检测",
  "Copia Datos A Móvil Nuevo": "数据转移到新手机",
  "Móvil de Sustitución": "备用手机",
  "Telefono entra apagado, no se puede testear": "手机进店已关机，无法检测",
  "Telefono entra con la pantalla rota,no se puede testear": "手机进店屏幕损坏，无法检测",
  "No se puede testear": "无法检测",
  "Tapa de movil esta rota": "手机后盖损坏",
  "DESCUENTO CLIENTE": "客户折扣",
  "HIDROGEL DESCUENTO": "水凝膜折扣",
  "PROTECTOR DESCUENTO": "贴膜折扣",
  "LE HABIA SALIDO EL MENSAJE DE DETECTADO HUMEDAD": "之前提示检测到潮湿",
  "AHORA NO CARGA": "现在无法充电",
  "BOTON POWER": "电源键",
  "FUNDA": "手机壳",
  "REVIVIR LA BATERIA": "激活电池",
  "REPARAR BISAGRA": "维修转轴"
};

export const statusOrder = ["预定", "预定到货", "维修中", "完成", "已取走", "取消"];

export const defaultRepairTerms = `Las condiciones de la reparación del dispositivo móviles son las siguientes:1) No se hace responsable de posibles pérdidas de datos en cualquier soporte. Se recomienda hacer copia de la información previamente al depósito del equipo. El usuario se hace responsable en caso de no efectuar las correspondientes copias de seguridad.2) El móvil que se entregue mojado o caído, tenga desperfectos o esté quemado, así como en el caso de que tengamos que abrirlo y se compruebe que haya daños en la placa base o se descubran fallos ocultos como no arrancar, reiniciar u otros fallos, la empresa no tendrá responsabilidad alguna y el coste de dicha reparación será a cargo del cliente.3) A cada cliente se le entregará una ficha técnica con sus datos que será imprescindible aportar a la hora de recoger el dispositivo. En el caso de que vaya otra persona a retirarlo en su nombre, deberá aportar tal ficha así como su DNI.4) Todas las reparaciones están garantizadas por TRES MESES, según título iv, artículo 8, del r.d. 58/1988, de 29 de enero.5) Las pantallas reparadas, si llevan golpes o están mojados, así como cualquier otro daño ajeno a la reparación, ANULA A LA GARANTIA.Este Tiket caduca en 3 meses o cuando recoger móvil.`;

export const defaultWhatsappProgressTemplate = `Hola {name},

Somos {shop}.
Puede consultar el estado de su reparación aquí:
{url}

Nº de orden: {ticket}
Equipo: {device}

Gracias.`;

export const defaultSettings = {
  shopName: "",
  shopAddress: "",
  shopTaxId: "",
  publicBaseUrl: "",
  whatsappProgressTemplate: defaultWhatsappProgressTemplate,
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
  repairTerms: defaultRepairTerms,
  warrantyTerms: ""
};

export function seedData() {
  const brands = ["Acer", "Alcatel", "Amazon", "Apple", "Archos", "Asus", "BQ", "BenQ", "BlackBerry", "Energizer", "Google", "HTC", "Haier", "Honor", "Huawei", "LG", "Lenovo", "Meizu", "Microsoft", "Motorola", "Nokia", "OnePlus", "Oppo", "Panasonic", "Samsung", "Sony", "Vertu", "Vivo", "Vodafone", "Wiko", "Xiaomi", "ZTE", "Portatil"].map((name, index) => ({ id: id(), name, sortOrder: index }));
  const brandByName = Object.fromEntries(brands.map((brand) => [brand.name, brand.id]));
  const models = [["Acer", "Allegro"], ["Apple", "IPHONE 13"], ["Apple", "IPHONE 15 PRO"], ["Samsung", "A12"], ["Samsung", "A13"], ["Samsung", "A14 5G"], ["Samsung", "S22"], ["Samsung", "S23 ULTRA"], ["Xiaomi", "REDMI NOTE 8 PRO"], ["Portatil", "PAVILION"]].filter(([brand]) => brandByName[brand]).map(([brand, name], index) => ({ id: id(), brandId: brandByName[brand], name, sortOrder: index }));
  const services = Object.entries(serviceZhMap).slice(0, 30).map(([defaultName, zh], index) => ({ id: id(), defaultName, zh, es: "", price: ["手机壳", "水凝膜", "iPhone 钢化膜", "UV 钢化膜", "曲面水凝膜", "钢化膜"].includes(zh) ? 12 : 0, sortOrder: index }));
  const parts = [["Volume Button", "音量按钮", "Boton Volumen"], ["Power Button", "电源按钮", "Boton Power"], ["Battery Cover", "电池后盖", "Tapa Bateria"], ["Battery", "电池", "Bateria"], ["Glass", "玻璃", "Cristal"], ["Wireless Antenna", "无线排线", "Antena Wifi"], ["Flex", "排线", "Flex"], ["Finger Flex", "指纹排线", "Flex huella"], ["Vibrator", "振动器", "Vibrador"], ["No signal", "无信号", "No Hay Señal"]].map(([defaultName, zh, es], index) => ({ id: id(), defaultName, zh, es, price: 0, sortOrder: index }));
  const technicians = [{ id: id(), name: "ming", phone: "", email: "", color: "#16a34a", active: true, sortOrder: 0 }];
  const attributes = [
    ["颜色", "Black", "黑色", "Negro"],
    ["颜色", "White", "白色", "Blanco"],
    ["颜色", "Blue", "蓝色", "Azul"],
    ["其他", "No testable", "无法检测", "No se puede testear"],
    ["其他", "Back cover broken", "后盖损坏", "Tapa rota"]
  ].map(([groupName, defaultName, zh, es], index) => ({ id: id(), groupName, defaultName, zh, es, sortOrder: index }));
  const clients = ["VICENTE", "LUIS", "BLANCA", "JUAN JOSE RODRIGUEZ", "NESTOR", "JORGE", "IÑIGO", "VICTOR", "MANUEL LOPEZ LOPEZ", "OLGA", "FERNANDO", "CARLOS", "JESUS", "JOSE MAYOR", "JULIO", "RAFAEL PEÑAFIEL", "JAVIER"].map((name, index) => ({ id: id(), name, docType: "DNI", identity: "", email: "", phone: `6${String(60000000 + index * 12345).slice(0, 8)}`, address: "", comment: "" }));
  const clientByName = Object.fromEntries(clients.map((client) => [client.name, client.id]));
  const repairs = [
    ["1777979211613", "OLGA", "APPLE", "IPHONE 15 PRO", "Cambiar Pantalla Color Negro Con 3 Meses De Garantía, DESCUENTO CLIENTE, No se puede testear", "已取走", "2026-05-05 13:06", "2026-05-05 15:22"],
    ["1777978684161", "FERNANDO", "Samsung", "A14 5G", "Cambiar Pantalla Color Negro Con 3 Meses De Garantía, Protector cristal templado", "已取走", "2026-05-05 12:57", "2026-05-05 14:03"],
    ["1777976592283", "VICENTE", "Xiaomi", "REDMI NOTE 8 PRO", "Cambiar Pantalla Color Negro Con 3 Meses De Garantía", "已取走", "2026-05-05 12:22", "2026-05-05 13:19"],
    ["1777974613576", "CARLOS", "Samsung", "S22", "Cambiar Batería Original Con 3 meses Garantia", "已取走", "2026-05-05 11:49", "2026-05-05 12:32"],
    ["1777972045054", "JESUS", "APPLE", "IPHONE 13", "Conector De Carga, LE HABIA SALIDO EL MENSAJE DE DETECTADO HUMEDAD, AHORA NO CARGA", "已取走", "2026-05-05 11:06", "2026-05-05 12:11"],
    ["1777970180682", "JOSE MAYOR", "Samsung", "A13", "BOTON POWER, FUNDA", "已取走", "2026-05-05 10:35", "2026-05-05 11:08"],
    ["1777913104015", "JULIO", "Samsung", "T580", "REVIVIR LA BATERIA", "预定", "2026-05-04 18:44", ""],
    ["1777911287012", "RAFAEL PEÑAFIEL", "Samsung", "S23 ULTRA", "Cambiar Pantalla Original COLOR NEGRO Con 3 meses Garantia, No se puede testear, HIDROGEL DESCUENTO", "已取走", "2026-05-04 18:14", "2026-05-04 19:03"],
    ["1777908313805", "JAVIER", "Portatil", "PAVILION", "REPARAR BISAGRA", "预定", "2026-05-04 17:24", ""],
    ["1777905244294", "JAVIER", "Samsung", "A12", "Cambiar Pantalla Color Negro Con 3 Meses De Garantía, No se puede testear, PROTECTOR DESCUENTO", "已取走", "2026-05-04 16:33", "2026-05-05 11:58"]
  ].map(([ticket, clientName, brand, model, issue, status, repairTime, warrantyStart], index) => ({
    id: id(),
    ticket,
    clientId: clientByName[clientName] || clients[0].id,
    brand: brand.toUpperCase(),
    model,
    properties: "",
    imei: "",
    issue,
    internalNote: "",
    passwordType: "",
    passwordText: "",
    passwordPattern: [],
    status,
    repairTime,
    warrantyStart,
    technicianId: technicians[0].id,
    technicianName: technicians[0].name,
    budget: 49 + index * 5,
    deposit: 0,
    items: [{ name: issue.split(",")[0], qty: 1, price: 49 + index * 5, cost: 0 }]
  }));
  return {
    users: [{ id: "u1", name: "ming", username: "ming", email: "", isAdmin: true, pagePermissions: ["repairs", "warranties", "clients", "categories", "modules", "services", "attributes", "technicians", "reports", "finance", "settings", "backup"] }],
    technicians,
    clients,
    brands,
    models,
    services,
    parts,
    attributes,
    settings: defaultSettings,
    repairs
  };
}

export function id() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function normalizeStatus(status) {
  const map = { reserva: "预定", Reserva: "预定", "预定已到货": "预定到货", "Reserva recibida": "预定到货", "Reserva llegado": "预定到货", "待开始": "预定", "En espera": "预定", Reparando: "维修中", Terminado: "完成", Finalizado: "完成", Entregado: "已取走", Cerrado: "取消", Cancelar: "取消", "关闭": "取消", "待检测": "预定", "处理中": "维修中", "等客户确认": "预定到货", "已完成": "完成", "拒保": "取消" };
  return map[status] || status || "预定";
}
