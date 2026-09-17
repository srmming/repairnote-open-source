import { badRequest, errorResponse, requestIdOf } from "@/lib/api-errors";
import { portalJson, requirePortalContext } from "@/lib/portal-context";
import { readBackupTextFromZip } from "@/lib/backup-zip";
import { assertBackupBelongsToPortal, createBackupSnapshotInTx } from "@/lib/backup-store";
import { syncFromClientData } from "@/lib/data-store";
import { cleanBusinessBackupData, validateBusinessDataShape } from "@/lib/data-validation";

const MAX_BACKUP_FILE_SIZE = 200 * 1024 * 1024;

export async function POST(request) {
  const requestId = requestIdOf(request);
  try {
    const ctx = await requirePortalContext(request, { admin: true });
    const form = await request.formData();
    const file = form.get("file");
    if (!file || typeof file.arrayBuffer !== "function") throw badRequest("请选择备份文件");
    if (file.size > MAX_BACKUP_FILE_SIZE) return errorResponse({ status: 413, code: "PAYLOAD_TOO_LARGE", message: "备份文件太大，最多 200MB" }, { requestId });
    const formPortalId = form.get("portalId");
    if (formPortalId !== null && String(formPortalId) !== ctx.portalId) throw badRequest("请求中的门户与当前门户不一致", "PORTAL_MISMATCH");

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = String(file.name || "").toLowerCase();
    const text = fileName.endsWith(".zip") ? readBackupTextFromZip(buffer) : buffer.toString("utf8");
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw badRequest("备份文件格式不正确", "INVALID_JSON");
    }
    const payload = parsed?.data && typeof parsed.data === "object" ? parsed.data : parsed;
    const sourcePortalId = payload?.sourcePortalId ?? parsed?.sourcePortalId;
    assertBackupBelongsToPortal(ctx, { ...payload, sourcePortalId }, { legacyConfirmed: String(form.get("confirmLegacy") || "") === "true" });
    const cleanData = cleanBusinessBackupData(validateBusinessDataShape(payload, "备份文件"));
    const data = await syncFromClientData(ctx, cleanData, {
      expectedRevision: form.get("expectedRevision"),
      beforeReplace: (tx) => createBackupSnapshotInTx(ctx, tx, { kind: "safety", reason: "导入文件前自动备份" })
    });
    return portalJson(ctx, { ok: true, data });
  } catch (error) {
    return errorResponse(error, { requestId });
  }
}
