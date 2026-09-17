import { errorResponse, requestIdOf } from "@/lib/api-errors";
import { portalJson, requirePortalContext } from "@/lib/portal-context";
import { lookupRepairByScan } from "@/lib/data-store";

export async function GET(request) {
  const requestId = requestIdOf(request);
  try {
    const ctx = await requirePortalContext(request, { anyOf: ["repairs"] });
    const value = new URL(request.url).searchParams.get("value") || "";
    const repair = await lookupRepairByScan(ctx, value);
    return portalJson(ctx, { repair });
  } catch (error) {
    return errorResponse(error, { requestId });
  }
}
