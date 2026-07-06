import { authErrorResponse, requirePageAccess } from "@/lib/auth";
import { createBackupSnapshot } from "@/lib/backup-store";
import { getBootstrapData, syncFromClientData } from "@/lib/data-store";
import { validateBusinessDataShape, withoutImportedUsers } from "@/lib/data-validation";

export async function POST(request) {
  try {
    const staff = await requirePageAccess("backup");
    if (!staff.isAdmin) return Response.json({ error: "只有管理员可导入备份" }, { status: 403 });
    const payload = await request.json();
    const cleanData = withoutImportedUsers(validateBusinessDataShape(payload.data || payload, "备份文件"));
    await createBackupSnapshot({ kind: "safety", reason: "导入前自动备份", staff });
    await syncFromClientData(cleanData, { shopId: staff.shopId });
    return Response.json({ ok: true, data: await getBootstrapData({ shopId: staff.shopId }) });
  } catch (error) {
    return authErrorResponse(error);
  }
}
