import { errorResponse, readJsonBody, requestIdOf } from "@/lib/api-errors";
import { assertNoPortalOverride, portalJson, requirePortalContext } from "@/lib/portal-context";
import { assertBackupBelongsToPortal, createBackupSnapshotInTx } from "@/lib/backup-store";
import { syncFromClientData } from "@/lib/data-store";
import { cleanBusinessBackupData, validateBusinessDataShape } from "@/lib/data-validation";

// 旧 localStorage 数据：只由门户管理员显式触发；属于升级前的无门户数据，只能导入默认门户。
export async function POST(request) {
  const requestId = requestIdOf(request);
  try {
    const ctx = await requirePortalContext(request, { admin: true });
    const body = await readJsonBody(request);
    assertNoPortalOverride(ctx, body);
    const payload = body.data && typeof body.data === "object" ? body.data : body;
    assertBackupBelongsToPortal(ctx, payload, { legacyConfirmed: true, source: "旧 localStorage 数据" });
    const cleanData = cleanBusinessBackupData(validateBusinessDataShape(payload, "旧 localStorage 数据"));
    const imported = await syncFromClientData(ctx, cleanData, {
      expectedRevision: body.expectedRevision,
      beforeReplace: (tx) => createBackupSnapshotInTx(ctx, tx, { kind: "safety", reason: "导入旧数据前自动备份" })
    });
    return portalJson(ctx, {
      ok: true,
      counts: {
        clients: cleanData.clients.length,
        brands: cleanData.brands.length,
        models: cleanData.models.length,
        services: cleanData.services.length,
        parts: cleanData.parts.length,
        attributes: (cleanData.attributes || []).length,
        repairs: cleanData.repairs.length
      },
      data: imported
    });
  } catch (error) {
    return errorResponse(error, { requestId });
  }
}
