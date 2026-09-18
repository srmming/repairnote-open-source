import { errorResponse, requestIdOf } from "@/lib/api-errors";
import { portalJson, requirePortalContext } from "@/lib/portal-context";
import { exportPortalBusinessData } from "@/lib/backup-store";

export async function GET(request) {
  const requestId = requestIdOf(request);
  try {
    const ctx = await requirePortalContext(request, { anyOf: ["backup"] });
    const data = await exportPortalBusinessData(ctx);
    return portalJson(ctx, { exportedAt: data.exportedAt, formatVersion: data.formatVersion, sourcePortalId: data.sourcePortalId, data });
  } catch (error) {
    return errorResponse(error, { requestId });
  }
}
