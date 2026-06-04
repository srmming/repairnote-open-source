const REQUIRED_COLLECTIONS = ["clients", "brands", "models", "services", "parts", "repairs"];
const OPTIONAL_COLLECTIONS = ["users", "attributes", "technicians"];

export function validateBusinessDataShape(data, label = "数据") {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throwBadRequest(`${label}格式不正确`);
  }

  for (const key of REQUIRED_COLLECTIONS) {
    if (!Array.isArray(data[key])) {
      throwBadRequest(`${label}缺少 ${key} 列表`);
    }
  }

  for (const key of OPTIONAL_COLLECTIONS) {
    if (data[key] !== undefined && !Array.isArray(data[key])) {
      throwBadRequest(`${label}中的 ${key} 必须是列表`);
    }
  }

  if (data.settings !== undefined && (!data.settings || typeof data.settings !== "object" || Array.isArray(data.settings))) {
    throwBadRequest(`${label}中的 settings 必须是对象`);
  }

  validateRows(data.clients, "客户", ["id", "name"]);
  validateRows(data.brands, "品牌", ["id", "name"]);
  validateRows(data.models, "型号", ["id", "brandId", "name"]);
  validateRows(data.services, "服务", ["id", "defaultName"]);
  validateRows(data.parts, "配件", ["id", "defaultName"]);
  validateRows(data.repairs, "维修单", ["id", "clientId"]);
  validateOptionalRows(data.users || [], "员工", ["id", "username"]);
  validateOptionalRows(data.attributes || [], "属性", ["id", "defaultName"]);
  validateOptionalRows(data.technicians || [], "维修师", ["id", "name"]);
  validateSortOrders(data.brands, "品牌");
  validateSortOrders(data.models, "型号");
  validateSortOrders(data.services, "服务");
  validateSortOrders(data.parts, "配件");
  validateSortOrders(data.attributes || [], "属性");
  validateSortOrders(data.technicians || [], "维修师");
  validateTechnicianColors(data.technicians || []);
  validateUnique(data.clients, "客户", "id");
  validateUnique(data.brands, "品牌", "id");
  validateUnique(data.brands, "品牌", "name", "名称重复");
  validateUnique(data.models, "型号", "id");
  validateUnique(data.services, "服务", "id");
  validateUnique(data.parts, "配件", "id");
  validateUnique(data.repairs, "维修单", "id");
  validateUnique(data.repairs.filter((row) => row.ticket), "维修单", "ticket", "单号重复");
  validateEffectiveRepairTickets(data.repairs);
  validateUnique(data.repairs.filter((row) => row.publicToken), "维修单", "publicToken", "二维码编号重复");
  validateUnique(data.users || [], "员工", "id");
  validateUnique(data.users || [], "员工", "username", "账号重复");
  validateUnique(data.technicians || [], "维修师", "id");
  validateUnique(data.technicians || [], "维修师", "name", "名称重复");
  validateRelations(data);

  return data;
}

export function withoutImportedUsers(data) {
  if (!data || typeof data !== "object") return data;
  const { users, ...businessData } = data;
  return businessData;
}

function validateRows(rows, label, requiredKeys) {
  rows.forEach((row, index) => validateRow(row, label, index, requiredKeys));
}

function validateOptionalRows(rows, label, requiredKeys) {
  rows.forEach((row, index) => validateRow(row, label, index, requiredKeys));
}

function validateRow(row, label, index, requiredKeys) {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throwBadRequest(`${label}第 ${index + 1} 行格式不正确`);
  }
  for (const key of requiredKeys) {
    if (typeof row[key] !== "string" || !row[key].trim()) {
      throwBadRequest(`${label}第 ${index + 1} 行缺少 ${key}`);
    }
  }
  if (row.items !== undefined && !Array.isArray(row.items)) {
    throwBadRequest(`${label}第 ${index + 1} 行的 items 必须是列表`);
  }
}

function validateUnique(rows, label, key, message = `${key} 重复`) {
  const seen = new Set();
  rows.forEach((row, index) => {
    const value = row?.[key];
    if (value === undefined || value === null || value === "") return;
    if (seen.has(value)) throwBadRequest(`${label}第 ${index + 1} 行${message}`);
    seen.add(value);
  });
}

function validateSortOrders(rows, label) {
  rows.forEach((row, index) => {
    if (row?.sortOrder === undefined || row?.sortOrder === null || row?.sortOrder === "") return;
    if (!Number.isFinite(Number(row.sortOrder))) {
      throwBadRequest(`${label}第 ${index + 1} 行 sortOrder 必须是数字`);
    }
  });
}

function validateTechnicianColors(rows) {
  rows.forEach((row, index) => {
    if (row?.color === undefined || row?.color === null || row?.color === "") return;
    if (typeof row.color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(row.color.trim())) {
      throwBadRequest(`维修师第 ${index + 1} 行 color 格式不正确`);
    }
  });
}

function validateEffectiveRepairTickets(rows) {
  const seen = new Set();
  rows.forEach((row, index) => {
    const ticket = String(row?.ticket || "").trim() || `M-${row?.id}`;
    if (seen.has(ticket)) throwBadRequest(`维修单第 ${index + 1} 行单号重复`);
    seen.add(ticket);
  });
}

function validateRelations(data) {
  const clientIds = new Set(data.clients.map((client) => client.id));
  const brandIds = new Set(data.brands.map((brand) => brand.id));
  data.models.forEach((model, index) => {
    if (!brandIds.has(model.brandId)) {
      throwBadRequest(`型号第 ${index + 1} 行关联的品牌不存在`);
    }
  });
  data.repairs.forEach((repair, index) => {
    if (!clientIds.has(repair.clientId)) {
      throwBadRequest(`维修单第 ${index + 1} 行关联的客户不存在`);
    }
    if (repair.items !== undefined) {
      repair.items.forEach((item, itemIndex) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
          throwBadRequest(`维修单第 ${index + 1} 行第 ${itemIndex + 1} 个价格项目格式不正确`);
        }
      });
    }
    if (repair.payments !== undefined) {
      if (!Array.isArray(repair.payments)) throwBadRequest(`维修单第 ${index + 1} 行的 payments 必须是列表`);
      repair.payments.forEach((payment, paymentIndex) => {
        if (!payment || typeof payment !== "object" || Array.isArray(payment)) {
          throwBadRequest(`维修单第 ${index + 1} 行第 ${paymentIndex + 1} 个收款记录格式不正确`);
        }
      });
    }
  });
}

function throwBadRequest(message) {
  const error = new Error(message);
  error.status = 400;
  throw error;
}
