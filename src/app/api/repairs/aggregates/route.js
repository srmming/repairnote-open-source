import { errorResponse, requestIdOf } from "@/lib/api-errors";
import { portalJson, requirePortalContext } from "@/lib/portal-context";
import { aggregateRepairs } from "@/lib/data-store";

export async function GET(request) {
  const requestId = requestIdOf(request);
  try {
    const ctx = await requirePortalContext(request, { anyOf: ["repairs"] });
    const params = new URL(request.url).searchParams;
    const result = await aggregateRepairs(ctx, {
      q: params.get("q") || "",
      status: params.get("status") || "",
      orderType: params.get("orderType") || "",
      start: params.get("start") || "",
      end: params.get("end") || "",
      clientId: params.get("clientId") || "",
      sourceRepairId: params.get("sourceRepairId") || "",
      technicianKey: params.get("technicianKey") || ""
    });
    return portalJson(ctx, result);
  } catch (error) {
    return errorResponse(error, { requestId });
  }
}
