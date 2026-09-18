import { errorResponse, readJsonBody, requestIdOf } from "@/lib/api-errors";
import { assertNoPortalOverride, portalJson, requirePortalContext } from "@/lib/portal-context";
import { assertBackupBelongsToPortal, createBackupSnapshotInTx } from "@/lib/backup-store";
import { syncFromClientData } from "@/lib/data-store";
import { cleanBusinessBackupData, validateBusinessDataShape } from "@/lib/data-validation";

// 粘贴 JSON 导入：只写当前门户；新格式 sourcePortalId 必须一致，旧无门户格式仅默认门户显式确认（confirmLegacy:true）后导入。
export async function POST(request) {
  const requestId = requestIdOf(request);
  try {
    const ctx = await requirePortalContext(request, { admin: true });
    const body = await readJsonBody(request);
    assertNoPortalOverride(ctx, body);
    const payload = body.data && typeof body.data === "object" ? body.data : body;
    assertBackupBelongsToPortal(ctx, { ...payload, sourcePortalId: payload.sourcePortalId ?? body.sourcePortalId }, { legacyConfirmed: body.confirmLegacy === true });
    const cleanData = cleanBusinessBackupData(validateBusinessDataShape(payload, "备份文件"));
    const data = await syncFromClientData(ctx, cleanData, {
      expectedRevision: body.expectedRevision,
      beforeReplace: (tx) => createBackupSnapshotInTx(ctx, tx, { kind: "safety", reason: "导入前自动备份" })
    });
    return portalJson(ctx, { ok: true, data });
  } catch (error) {
    return errorResponse(error, { requestId });
  }
}
