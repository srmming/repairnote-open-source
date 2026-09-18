import { errorResponse, requestIdOf } from "@/lib/api-errors";
import { requirePortalContext } from "@/lib/portal-context";
import { backupJsonPayload, zipResponse } from "@/lib/backup-zip";
import { backupFileName, getBackupSnapshot, snapshotDataForDownload } from "@/lib/backup-store";

export async function GET(request, { params }) {
  const requestId = requestIdOf(request);
  try {
    const ctx = await requirePortalContext(request, { anyOf: ["backup"] });
    const { id } = await params;
    const snapshot = await getBackupSnapshot(ctx, id);
    const baseName = backupFileName(snapshot);
    const data = snapshotDataForDownload(ctx, snapshot);
    return zipResponse({
      json: backupJsonPayload(data, { backupId: snapshot.id, formatVersion: data.formatVersion, sourcePortalId: data.sourcePortalId, sourcePortalName: data.sourcePortalName }),
      zipName: `${baseName}.zip`,
      jsonName: `${baseName}.json`,
      headers: { "X-Portal-Id": ctx.portalId, "Cache-Control": "private, no-store" }
    });
  } catch (error) {
    return errorResponse(error, { requestId });
  }
}
