import { authErrorResponse, requirePageAccess } from "@/lib/auth";
import { listBackupSnapshots } from "@/lib/backup-store";

export async function GET() {
  try {
    await requirePageAccess("backup");
    return Response.json({ backups: await listBackupSnapshots() });
  } catch (error) {
    return authErrorResponse(error);
  }
}
