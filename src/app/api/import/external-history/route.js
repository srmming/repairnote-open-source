import { badRequest, errorResponse, requestIdOf } from "@/lib/api-errors";
import { portalJson, requirePortalContext } from "@/lib/portal-context";
import { createBackupSnapshotInTx, exportPortalBusinessData } from "@/lib/backup-store";
import { convertExternalHistoryData } from "@/lib/external-history-import";
import { mergeExternalHistoryData, syncFromClientData } from "@/lib/data-store";
import { cleanBusinessBackupData, validateBusinessDataShape } from "@/lib/data-validation";

const MAX_EXTERNAL_HISTORY_FILE_SIZE = 80 * 1024 * 1024;

// 外部历史导入：与当前门户现有业务数据合并后整包替换当前门户；版本用 expectedRevision 校验，写锁内完成。
export async function POST(request) {
  const requestId = requestIdOf(request);
  try {
    const ctx = await requirePortalContext(request, { admin: true });
    const form = await request.formData();
    const file = form.get("file");
    if (!file || typeof file.arrayBuffer !== "function") throw badRequest("请选择外部历史 JSON 文件");
    if (file.size > MAX_EXTERNAL_HISTORY_FILE_SIZE) return errorResponse({ status: 413, code: "PAYLOAD_TOO_LARGE", message: "外部历史文件太大，最多 80MB" }, { requestId });
    const formPortalId = form.get("portalId");
    if (formPortalId !== null && String(formPortalId) !== ctx.portalId) throw badRequest("请求中的门户与当前门户不一致", "PORTAL_MISMATCH");

    const text = Buffer.from(await file.arrayBuffer()).toString("utf8");
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw badRequest("外部历史 JSON 文件格式不正确", "INVALID_JSON");
    }
    const converted = convertExternalHistoryData(parsed, {
      amountStartDate: form.get("amountStartDate"),
      amountEndDate: form.get("amountEndDate")
    });
    validateBusinessDataShape(converted.data, "外部历史文件");

    const currentData = cleanBusinessBackupData(await exportPortalBusinessData(ctx));
    const merged = mergeExternalHistoryData(currentData, converted.data);
    validateBusinessDataShape(merged.data, "合并后的外部历史数据");
    const data = await syncFromClientData(ctx, merged.data, {
      expectedRevision: form.get("expectedRevision"),
      beforeReplace: (tx) => createBackupSnapshotInTx(ctx, tx, { kind: "safety", reason: "导入外部历史数据前自动备份" })
    });

    return portalJson(ctx, {
      ok: true,
      summary: { ...converted.summary, ...merged.summary },
      data
    });
  } catch (error) {
    return errorResponse(error, { requestId });
  }
}
