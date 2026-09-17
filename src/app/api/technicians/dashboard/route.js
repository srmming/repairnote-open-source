import { errorResponse, requestIdOf } from "@/lib/api-errors";
import { portalJson, requirePortalContext } from "@/lib/portal-context";
import { technicianDashboard } from "@/lib/report-store";

export async function GET(request) {
  const requestId = requestIdOf(request);
  try {
    const ctx = await requirePortalContext(request, { anyOf: ["technicians"] });
    const params = new URL(request.url).searchParams;
    return portalJson(ctx, await technicianDashboard(ctx, { date: params.get("date") || "" }));
  } catch (error) {
    return errorResponse(error, { requestId });
  }
}
