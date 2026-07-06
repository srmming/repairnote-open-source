import { authErrorResponse, requirePageAccess } from "@/lib/auth";
import { listBackupSnapshots } from "@/lib/backup-store";

export async function GET() {
  try {
    const staff = await requirePageAccess("backup");
    return Response.json({ backups: await listBackupSnapshots(staff) });
  } catch (error) {
    return authErrorResponse(error);
  }
}
