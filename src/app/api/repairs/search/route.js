import { errorResponse, requestIdOf } from "@/lib/api-errors";
import { portalJson, requirePortalContext } from "@/lib/portal-context";
import { searchRepairs } from "@/lib/data-store";

export async function GET(request) {
  const requestId = requestIdOf(request);
  try {
    const ctx = await requirePortalContext(request, { anyOf: ["repairs"] });
    const params = new URL(request.url).searchParams;
    const result = await searchRepairs(ctx, {
      q: params.get("q") || "",
      status: params.get("status") || "",
      orderType: params.get("orderType") || "",
      start: params.get("start") || "",
      end: params.get("end") || "",
      clientId: params.get("clientId") || "",
      sourceRepairId: params.get("sourceRepairId") || "",
      technicianKey: params.get("technicianKey") || "",
      page: params.get("page") || "1",
      pageSize: params.get("pageSize") || ""
    });
    return portalJson(ctx, result);
  } catch (error) {
    return errorResponse(error, { requestId });
  }
}
