import { errorResponse, requestIdOf } from "@/lib/api-errors";
import { requirePortalContext } from "@/lib/portal-context";
import { backupJsonFileName, backupJsonPayload, backupZipFileName, zipResponse } from "@/lib/backup-zip";
import { exportPortalBusinessData } from "@/lib/backup-store";

export async function GET(request) {
  const requestId = requestIdOf(request);
  try {
    const ctx = await requirePortalContext(request, { anyOf: ["backup"] });
    const data = await exportPortalBusinessData(ctx);
    const now = new Date();
    return zipResponse({
      json: backupJsonPayload(data, { formatVersion: data.formatVersion, sourcePortalId: data.sourcePortalId, sourcePortalName: data.sourcePortalName }),
      zipName: backupZipFileName(now),
      jsonName: backupJsonFileName(now),
      headers: { "X-Portal-Id": ctx.portalId, "Cache-Control": "private, no-store" }
    });
  } catch (error) {
    return errorResponse(error, { requestId });
  }
}
