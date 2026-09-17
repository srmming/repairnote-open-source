import { errorResponse, requestIdOf } from "@/lib/api-errors";
import { portalJson, requirePortalContext } from "@/lib/portal-context";
import { createBackupSnapshot } from "@/lib/backup-store";

export async function POST(request) {
  const requestId = requestIdOf(request);
  try {
    const ctx = await requirePortalContext(request, { anyOf: ["backup"] });
    const backup = await createBackupSnapshot(ctx, { kind: "manual", reason: "手动备份" });
    return portalJson(ctx, { ok: true, backup });
  } catch (error) {
    return errorResponse(error, { requestId });
  }
}
