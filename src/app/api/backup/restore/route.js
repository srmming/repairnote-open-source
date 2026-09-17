import { badRequest, errorResponse, readJsonBody, requestIdOf } from "@/lib/api-errors";
import { assertNoPortalOverride, portalJson, requirePortalContext } from "@/lib/portal-context";
import { restoreBackupSnapshot } from "@/lib/backup-store";

export async function POST(request) {
  const requestId = requestIdOf(request);
  try {
    const ctx = await requirePortalContext(request, { admin: true });
    const body = await readJsonBody(request);
    assertNoPortalOverride(ctx, body);
    const id = String(body.id || "").trim();
    if (!id) throw badRequest("请选择要恢复的备份");
    return portalJson(ctx, { ok: true, data: await restoreBackupSnapshot(ctx, id, body.expectedRevision) });
  } catch (error) {
    return errorResponse(error, { requestId });
  }
}
