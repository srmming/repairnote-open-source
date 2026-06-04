import { authErrorResponse, canAccessPage, requireAnyPageAccess } from "@/lib/auth";
import { ensureDailyAutoBackup } from "@/lib/backup-store";
import { getBootstrapData, syncFromClientData, syncNonRepairBusinessData } from "@/lib/data-store";
import { validateBusinessDataShape } from "@/lib/data-validation";

export async function GET() {
  try {
    const staff = await requireAnyPageAccess();
    const data = await getBootstrapData();
    return Response.json(compactBootstrap(staff.isAdmin ? data : { ...data, users: [{ ...staff }] }));
  } catch (error) {
    return authErrorResponse(error);
  }
}

const clientColumns = ["id", "name", "docType", "identity", "email", "phone", "address", "comment", "level", "createdAt", "updatedAt"];
const repairColumns = ["id", "ticket", "clientId", "brand", "model", "properties", "imei", "issue", "internalNote", "passwordType", "passwordText", "passwordPattern", "status", "repairTime", "warrantyStart", "technicianId", "technicianName", "budget", "deposit", "paymentMethod", "discountAmount", "costAmount", "frontPhoto", "backPhoto", "signatureDataUrl", "signedAt", "publicToken", "orderType", "sourceRepairId", "warrantyReason", "warrantyDiagnosis", "warrantyResolution", "warrantyChargeable", "statusHistory", "notificationLog", "createdAt", "updatedAt", "itemsTotal", "itemsCostTotal", "itemsCount", "itemsSummary", "itemsLoaded", "items", "payments"];

const bootstrapWriteSections = [
  { permission: "repairs", keys: ["repairs", "clients"] },
  { permission: "clients", keys: ["clients"] },
  { permission: "categories", keys: ["brands", "models"] },
  { permission: "modules", keys: ["parts"] },
  { permission: "services", keys: ["services"] },
  { permission: "attributes", keys: ["attributes"] },
  { permission: "technicians", keys: ["technicians"] },
  { permission: "settings", keys: ["settings"] }
];

function compactBootstrap(data) {
  return {
    ...data,
    clients: undefined,
    repairs: undefined,
    clientsCompact: compactRows(data.clients || [], clientColumns),
    repairsCompact: compactRows(data.repairs || [], repairColumns)
  };
}

function compactRows(rows, columns) {
  return {
    columns,
    rows: rows.map((row) => columns.map((column) => row[column] ?? null))
  };
}

export async function PUT(request) {
  try {
    const staff = await requireAnyPageAccess();
    const data = await request.json();
    const current = await getBootstrapData();
    if (data._revision && data._revision !== current._revision) {
      const error = new Error("数据已被其他设备更新，请刷新页面后再保存");
      error.status = 409;
      throw error;
    }
    const validated = validateBusinessDataShape(data, "保存数据");
    const { data: safeData, shouldPersist } = staff.isAdmin
      ? { data: validated, shouldPersist: true }
      : permittedBootstrapData(staff, validated, current);
    if (!shouldPersist) return Response.json(current);
    const saved = canUseNonRepairSave(validated, current)
      ? await syncNonRepairBusinessData(safeData, { syncClients: !sameIdSet(validated.clients || [], current.clients || []) })
      : await syncFromClientData(safeData);
    try {
      await ensureDailyAutoBackup({ staff, data: saved });
    } catch (backupError) {
      console.warn("Daily auto backup skipped after business save:", backupError?.message || backupError);
    }
    return Response.json(compactBootstrap(staff.isAdmin ? saved : { ...saved, users: [{ ...staff }] }));
  } catch (error) {
    return authErrorResponse(error);
  }
}

function canUseNonRepairSave(requested, current) {
  return sameIdSet(requested.repairs || [], current.repairs || []) && sameIdSet(requested.users || [], current.users || []);
}

function sameIdSet(leftRows, rightRows) {
  if (leftRows.length !== rightRows.length) return false;
  const ids = new Set(rightRows.map((row) => row.id).filter(Boolean));
  return leftRows.every((row) => row?.id && ids.has(row.id));
}

function permittedBootstrapData(staff, requested, current) {
  const writableKeys = new Set();
  for (const section of bootstrapWriteSections) {
    if (canAccessPage(staff, section.permission)) {
      section.keys.forEach((key) => writableKeys.add(key));
    }
  }
  if (!writableKeys.size) return { data: current, shouldPersist: false };

  const safeData = { ...current, users: current.users };
  for (const key of writableKeys) {
    if (requested[key] !== undefined) safeData[key] = requested[key];
  }
  return { data: safeData, shouldPersist: true };
}
