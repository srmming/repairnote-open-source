import { errorResponse, requestIdOf } from "@/lib/api-errors";
import { portalJson, requirePortalContext } from "@/lib/portal-context";
import { reportFinance } from "@/lib/report-store";

export async function GET(request) {
  const requestId = requestIdOf(request);
  try {
    const ctx = await requirePortalContext(request, { anyOf: ["finance"] });
    const params = new URL(request.url).searchParams;
    const result = await reportFinance(ctx, {
      start: params.get("start") || "",
      end: params.get("end") || "",
      q: params.get("q") || "",
      today: params.get("today") || "",
      paymentsPage: params.get("paymentsPage") || "1",
      unpaidPage: params.get("unpaidPage") || "1",
      pageSize: params.get("pageSize") || ""
    });
    return portalJson(ctx, result);
  } catch (error) {
    return errorResponse(error, { requestId });
  }
}
