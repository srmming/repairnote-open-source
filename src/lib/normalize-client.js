export const PAGE_PERMISSION_KEYS = ["repairs", "clients", "categories", "modules", "services", "attributes", "technicians", "reports", "finance", "settings", "backup"];

const DEFAULT_CLIENT_LEVEL = "VIP";
const clientLevels = [DEFAULT_CLIENT_LEVEL, "超级 VIP", "黑名单"];
const technicianColorOptions = ["#16a34a", "#2563eb", "#dc2626", "#9333ea", "#ea580c", "#0f766e", "#111827"];

export function normalizedPagePermissions(user) {
  if (user?.isAdmin) return PAGE_PERMISSION_KEYS;
  const rawPermissions = Array.isArray(user?.pagePermissions) ? user.pagePermissions : [];
  const permissions = rawPermissions.map((key) => key === "warranties" ? "repairs" : key).filter((key) => PAGE_PERMISSION_KEYS.includes(key));
  return [...new Set(permissions)];
}

export function normalizeClientLevel(level) {
  return clientLevels.includes(level) ? level : DEFAULT_CLIENT_LEVEL;
}

function withSortOrders(rows = []) {
  return rows.map((row, index) => ({ ...row, sortOrder: Number(row.sortOrder ?? index) }));
}

export { withSortOrders };

export function normalizeTechnicianColor(color) {
  const value = String(color || "").trim();
  return /^#[0-9a-f]{6}$/i.test(value) ? value : technicianColorOptions[0];
}

function expandCompactRows(compact) {
  if (!compact?.columns || !Array.isArray(compact.rows)) return null;
  return compact.rows.map((row) => Object.fromEntries(compact.columns.map((column, index) => [column, row[index]])));
}

function id() {
  return crypto?.randomUUID?.() || Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function formatDateTime(date) {
  const pad = (num) => String(num).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function parseMoneyInput(value) {
  const normalized = String(value ?? "").trim().replace(",", ".");
  if (!normalized) return 0;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function roundMoney(value) {
  return Math.round(parseMoneyInput(value) * 100) / 100;
}

export function nonNegativeMoney(value) {
  return Math.max(0, roundMoney(value));
}

function normalizeMoneyDraftValue(value) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";
    if (/^\d*[.,]?\d{0,2}$/.test(trimmed)) return trimmed;
  }
  return nonNegativeMoney(value);
}

export function normalizeStatus(status) {
  const map = {
    reserva: "预定",
    Reserva: "预定",
    "预定已到货": "预定到货",
    "Reserva recibida": "预定到货",
    "Reserva llegado": "预定到货",
    "待开始": "预定",
    "En espera": "预定",
    Reparando: "维修中",
    Terminado: "完成",
    Finalizado: "完成",
    Entregado: "已取走",
    Cerrado: "取消",
    Cancelar: "取消",
    "关闭": "取消",
    "待检测": "预定",
    "处理中": "维修中",
    "等客户确认": "预定到货",
    "已完成": "完成",
    "拒保": "取消"
  };
  return map[status] || status || "预定";
}

export function normalizeRepairItem(item = {}) {
  return {
    ...item,
    name: item.name || "",
    qty: normalizeMoneyDraftValue(item.qty),
    price: normalizeMoneyDraftValue(item.price),
    cost: normalizeMoneyDraftValue(item.cost)
  };
}

export function normalizePaymentDraft(payment = {}) {
  return {
    ...payment,
    id: payment.id || id(),
    amount: parseMoneyInput(payment.amount),
    method: payment.method || "ledger",
    note: payment.note || "",
    paidAt: payment.paidAt || payment.createdAt || formatDateTime(new Date()),
    createdBy: payment.createdBy || ""
  };
}

export function normalizeRepairDraft(repair) {
  const items = Array.isArray(repair.items) ? repair.items.map(normalizeRepairItem) : [];
  const payments = Array.isArray(repair.payments) ? repair.payments.map(normalizePaymentDraft) : [];
  return {
    ...repair,
    passwordType: repair.passwordType === "PIN" ? "" : repair.passwordType || "",
    passwordText: repair.passwordText || "",
    properties: repair.properties || "",
    imei: repair.imei || "",
    internalNote: repair.internalNote || "",
    technicianId: repair.technicianId || "",
    technicianName: repair.technicianName || "",
    budget: nonNegativeMoney(repair.budget),
    deposit: nonNegativeMoney(repair.deposit),
    discountAmount: nonNegativeMoney(repair.discountAmount),
    costAmount: nonNegativeMoney(repair.costAmount),
    frontPhoto: repair.frontPhoto || "",
    backPhoto: repair.backPhoto || "",
    signatureDataUrl: repair.signatureDataUrl || "",
    signedAt: repair.signedAt || "",
    publicToken: repair.publicToken || id(),
    orderType: repair.orderType || "repair",
    sourceRepairId: repair.sourceRepairId || "",
    warrantyReason: repair.warrantyReason || "",
    warrantyDiagnosis: repair.warrantyDiagnosis || "",
    warrantyResolution: repair.warrantyResolution || "",
    warrantyChargeable: Boolean(repair.warrantyChargeable),
    paymentMethod: repair.paymentMethod || "none",
    itemsTotal: nonNegativeMoney(repair.itemsTotal),
    itemsCostTotal: nonNegativeMoney(repair.itemsCostTotal),
    itemsCount: repair.itemsCount ?? items.length,
    itemsSummary: repair.itemsSummary || "",
    itemsLoaded: repair.itemsLoaded !== false,
    statusHistory: Array.isArray(repair.statusHistory) ? repair.statusHistory : [],
    notificationLog: Array.isArray(repair.notificationLog) ? repair.notificationLog : [],
    payments,
    items
  };
}

function normalizeTechnicians(technicians = [], users = []) {
  const rows = [];
  const names = new Set();
  const ids = new Set();
  const add = (item) => {
    const name = String(item?.name || "").trim();
    if (!name) return;
    const key = name.toLowerCase();
    const idValue = String(item?.id || `tech_${key}`).trim();
    if (names.has(key) || ids.has(idValue)) return;
    rows.push({ id: idValue, name, phone: item.phone || "", email: item.email || "", color: normalizeTechnicianColor(item.color), active: item.active !== false, sortOrder: Number(item.sortOrder ?? rows.length) });
    names.add(key);
    ids.add(idValue);
  };
  technicians.forEach(add);
  users.forEach((user) => {
    const permissions = normalizedPagePermissions(user);
    const canRepair = user.isAdmin || permissions.includes("repairs") || permissions.includes("technicians");
    if (canRepair) add({ id: `staff_${user.id}`, name: user.name || user.username, email: user.email, active: true });
  });
  return rows;
}

export function normalizeData(data) {
  const clients = expandCompactRows(data.clientsCompact) || data.clients || [];
  const repairs = expandCompactRows(data.repairsCompact) || data.repairs || [];
  const users = (data.users || []).map((user) => ({ ...user, pagePermissions: user.isAdmin ? PAGE_PERMISSION_KEYS : normalizedPagePermissions(user) }));
  return {
    _revision: data._revision || "",
    _settingsUpdatedAt: data._settingsUpdatedAt || "",
    _fullLoaded: data._fullLoaded,
    users,
    technicians: normalizeTechnicians(data.technicians || [], users),
    clients: clients.map((client) => ({ ...client, level: normalizeClientLevel(client.level) })),
    brands: withSortOrders(data.brands || []),
    models: withSortOrders(data.models || []),
    services: withSortOrders(data.services || []),
    parts: withSortOrders(data.parts || []),
    attributes: withSortOrders(data.attributes || []),
    settings: {
      uiLanguage: "zh",
      printLanguage: "zh",
      scanShortcut: "F2",
      defaultWarrantyDays: 90,
      defaultWarrantyMonths: 3,
      enableOrderLock: true,
      showPasswordSection: true,
      showPhotoSection: true,
      showSignatureSection: true,
      showQrNoticeSection: true,
      ...(data.settings || {})
    },
    repairs: repairs.map((repair) => normalizeRepairDraft({ ...repair, status: normalizeStatus(repair.status), items: repair.items || [] }))
  };
}
