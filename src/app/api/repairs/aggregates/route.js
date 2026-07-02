import { authErrorResponse, requireAnyPageAccess } from "@/lib/auth";
import { aggregateRepairs } from "@/lib/data-store";

export async function GET(request) {
  try {
    await requireAnyPageAccess(["repairs", "warranties"]);
    const params = new URL(request.url).searchParams;
    const result = await aggregateRepairs({
      q: params.get("q") || "",
      status: params.get("status") || "",
      orderType: params.get("orderType") || "",
      start: params.get("start") || "",
      end: params.get("end") || "",
      clientId: params.get("clientId") || "",
      sourceRepairId: params.get("sourceRepairId") || "",
      technicianKey: params.get("technicianKey") || ""
    });
    return Response.json(result);
  } catch (error) {
    return authErrorResponse(error);
  }
}
