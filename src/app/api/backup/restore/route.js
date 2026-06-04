import { authErrorResponse, requirePageAccess } from "@/lib/auth";
import { restoreBackupSnapshot } from "@/lib/backup-store";

export async function POST(request) {
  try {
    const staff = await requirePageAccess("backup");
    if (!staff.isAdmin) return Response.json({ error: "只有管理员可恢复备份" }, { status: 403 });
    const { id } = await request.json();
    if (!id) return Response.json({ error: "请选择要恢复的备份" }, { status: 400 });
    return Response.json({ ok: true, data: await restoreBackupSnapshot(id, staff) });
  } catch (error) {
    return authErrorResponse(error);
  }
}
