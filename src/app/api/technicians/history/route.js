import { errorResponse, readJsonBody, requestIdOf } from "@/lib/api-errors";
import { assertNoPortalOverride, portalJson, requirePortalContext } from "@/lib/portal-context";
import { deleteTechnicianHistory } from "@/lib/data-store";

// 批量删除历史维修师名下的维修单：属于维修单写操作，要求同时具备 technicians 与 repairs 两个权限。
export async function DELETE(request) {
  const requestId = requestIdOf(request);
  try {
    const ctx = await requirePortalContext(request, { allOf: ["technicians", "repairs"] });
    const body = await readJsonBody(request);
    assertNoPortalOverride(ctx, body);
    const result = await deleteTechnicianHistory(ctx, body?.key || "");
    if (result.deleted) console.info(`[${requestId}] 历史维修师记录删除：门户 ${ctx.portalId} ${body?.key || ""} 共 ${result.deleted} 单（操作人 ${ctx.staff.username || ctx.staff.id}）`);
    return portalJson(ctx, result);
  } catch (error) {
    return errorResponse(error, { requestId });
  }
}
