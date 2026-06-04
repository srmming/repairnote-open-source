import { createBackupSnapshot } from "@/lib/backup-store";
import { authErrorResponse, requirePageAccess } from "@/lib/auth";
import { convertExternalHistoryData } from "@/lib/external-history-import";
import { getBootstrapData, getBusinessRevision, mergeExternalHistoryData, syncFromClientData } from "@/lib/data-store";
import { validateBusinessDataShape } from "@/lib/data-validation";

const MAX_EXTERNAL_HISTORY_FILE_SIZE = 80 * 1024 * 1024;

export async function POST(request) {
  try {
    const staff = await requirePageAccess("backup");
    if (!staff.isAdmin) return Response.json({ error: "只有管理员可导入外部历史数据" }, { status: 403 });

    const form = await request.formData();
    const file = form.get("file");
    if (!file || typeof file.arrayBuffer !== "function") {
      return Response.json({ error: "请选择外部历史 JSON 文件" }, { status: 400 });
    }
    if (file.size > MAX_EXTERNAL_HISTORY_FILE_SIZE) {
      return Response.json({ error: "外部历史文件太大，最多 80MB" }, { status: 400 });
    }

    const text = Buffer.from(await file.arrayBuffer()).toString("utf8");
    const parsed = JSON.parse(text);
    const converted = convertExternalHistoryData(parsed, {
      amountStartDate: form.get("amountStartDate"),
      amountEndDate: form.get("amountEndDate")
    });
    validateBusinessDataShape(converted.data, "外部历史文件");

    await createBackupSnapshot({ kind: "safety", reason: "导入外部历史数据前自动备份", staff });
    const currentData = await getBootstrapData({ includeRepairItems: true });
    const currentRevision = currentData._revision;
    const merged = mergeExternalHistoryData(currentData, converted.data);
    validateBusinessDataShape(merged.data, "合并后的外部历史数据");
    const latestRevision = await getBusinessRevision();
    if (currentRevision !== latestRevision) {
      const error = new Error("数据已被其他设备更新，请刷新页面后再导入");
      error.status = 409;
      throw error;
    }
    await syncFromClientData(merged.data);

    return Response.json({
      ok: true,
      summary: {
        ...converted.summary,
        ...merged.summary
      },
      data: await getBootstrapData()
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      error.message = "外部历史 JSON 文件格式不正确";
      error.status = 400;
    }
    return authErrorResponse(error);
  }
}
