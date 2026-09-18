import { errorResponse, requestIdOf } from "@/lib/api-errors";
import { portalJson, requirePortalContext } from "@/lib/portal-context";
import { searchClients } from "@/lib/data-store";

export async function GET(request) {
  const requestId = requestIdOf(request);
  try {
    const ctx = await requirePortalContext(request, { anyOf: ["clients", "repairs"] });
    const params = new URL(request.url).searchParams;
    const result = await searchClients(ctx, {
      q: params.get("q") || "",
      clientId: params.get("clientId") || "",
      phone: params.get("phone") || "",
      filter: params.get("filter") || "all",
      sort: params.get("sort") || "latest",
      page: params.get("page") || "1",
      pageSize: params.get("pageSize") || ""
    });
    return portalJson(ctx, result);
  } catch (error) {
    return errorResponse(error, { requestId });
  }
}
