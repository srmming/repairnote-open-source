import { badRequest, errorResponse, readJsonBody, requestIdOf } from "@/lib/api-errors";
import { assertNoPortalOverride, portalJson, requirePortalContext } from "@/lib/portal-context";
import { deleteRepairRecord, getRepairById, saveRepairRecord } from "@/lib/data-store";

const ACCESS = { anyOf: ["repairs"] };

export async function GET(request, { params }) {
  const requestId = requestIdOf(request);
  try {
    const ctx = await requirePortalContext(request, ACCESS);
    const { id } = await params;
    const repair = await getRepairById(ctx, id);
    if (!repair) return errorResponse({ status: 404, code: "REPAIR_NOT_FOUND", message: "没有找到这张订单" }, { requestId, headers: { "X-Portal-Id": ctx.portalId } });
    return portalJson(ctx, { repair });
  } catch (error) {
    return errorResponse(error, { requestId });
  }
}

// 新建：顶层 createOnly:true；已有对象更新必须带旧 updatedAt，不得带 createOnly。
export async function PUT(request, { params }) {
  const requestId = requestIdOf(request);
  try {
    const ctx = await requirePortalContext(request, ACCESS);
    const { id } = await params;
    const body = await readJsonBody(request);
    assertNoPortalOverride(ctx, body);
    assertNoPortalOverride(ctx, body.repair);
    assertNoPortalOverride(ctx, body.client);
    if (body.createOnly !== undefined && typeof body.createOnly !== "boolean") throw badRequest("createOnly 必须是布尔值");
    const repair = { ...(body.repair || {}), id };
    return portalJson(ctx, await saveRepairRecord(ctx, { repair, client: body.client || null, createOnly: body.createOnly === true }));
  } catch (error) {
    return errorResponse(error, { requestId });
  }
}

export async function DELETE(request, { params }) {
  const requestId = requestIdOf(request);
  try {
    const ctx = await requirePortalContext(request, ACCESS);
    const { id } = await params;
    const body = await readJsonBody(request);
    assertNoPortalOverride(ctx, body);
    return portalJson(ctx, await deleteRepairRecord(ctx, id, { updatedAt: body.updatedAt }));
  } catch (error) {
    return errorResponse(error, { requestId });
  }
}
