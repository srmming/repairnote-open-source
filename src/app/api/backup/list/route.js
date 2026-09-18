import { errorResponse, requestIdOf } from "@/lib/api-errors";
import { portalJson, requirePortalContext } from "@/lib/portal-context";
import { listBackupSnapshots } from "@/lib/backup-store";

export async function GET(request) {
  const requestId = requestIdOf(request);
  try {
    const ctx = await requirePortalContext(request, { anyOf: ["backup"] });
    return portalJson(ctx, { backups: await listBackupSnapshots(ctx) });
  } catch (error) {
    return errorResponse(error, { requestId });
  }
}
