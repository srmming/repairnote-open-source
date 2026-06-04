import { authErrorResponse, requirePageAccess } from "@/lib/auth";
import { readBackupTextFromZip } from "@/lib/backup-zip";
import { createBackupSnapshot } from "@/lib/backup-store";
import { getBootstrapData, syncFromClientData } from "@/lib/data-store";
import { validateBusinessDataShape, withoutImportedUsers } from "@/lib/data-validation";

const MAX_BACKUP_FILE_SIZE = 200 * 1024 * 1024;

export async function POST(request) {
  try {
    const staff = await requirePageAccess("backup");
    if (!staff.isAdmin) return Response.json({ error: "只有管理员可导入备份" }, { status: 403 });

    const form = await request.formData();
    const file = form.get("file");
    if (!file || typeof file.arrayBuffer !== "function") {
      return Response.json({ error: "请选择备份文件" }, { status: 400 });
    }
    if (file.size > MAX_BACKUP_FILE_SIZE) {
      return Response.json({ error: "备份文件太大，最多 200MB" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = String(file.name || "").toLowerCase();
    const text = fileName.endsWith(".zip") ? readBackupTextFromZip(buffer) : buffer.toString("utf8");
    const parsed = JSON.parse(text);
    const cleanData = withoutImportedUsers(validateBusinessDataShape(parsed.data || parsed, "备份文件"));

    await createBackupSnapshot({ kind: "safety", reason: "导入文件前自动备份", staff });
    await syncFromClientData(cleanData);
    return Response.json({ ok: true, data: await getBootstrapData() });
  } catch (error) {
    if (error instanceof SyntaxError) {
      error.message = "备份文件格式不正确";
      error.status = 400;
    }
    return authErrorResponse(error);
  }
}
