import { authErrorResponse, requirePageAccess } from "@/lib/auth";
import { createBackupSnapshot } from "@/lib/backup-store";

export async function POST() {
  try {
    const staff = await requirePageAccess("backup");
    const backup = await createBackupSnapshot({ kind: "manual", reason: "手动备份", staff });
    return Response.json({ ok: true, backup });
  } catch (error) {
    return authErrorResponse(error);
  }
}
