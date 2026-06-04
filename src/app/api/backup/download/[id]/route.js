import { authErrorResponse, requirePageAccess } from "@/lib/auth";
import { backupJsonPayload, zipResponse } from "@/lib/backup-zip";
import { backupFileName, getBackupSnapshot } from "@/lib/backup-store";

export async function GET(_request, { params }) {
  try {
    await requirePageAccess("backup");
    const { id } = await params;
    const snapshot = await getBackupSnapshot(id);
    const baseName = backupFileName(snapshot);
    return zipResponse({
      json: backupJsonPayload(snapshot.data, { backupId: snapshot.id }),
      zipName: `${baseName}.zip`,
      jsonName: `${baseName}.json`
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
