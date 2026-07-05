import { authErrorResponse, requireAnyPageAccess } from "@/lib/auth";
import { searchRepairs } from "@/lib/data-store";

export async function GET(request) {
  try {
    const staff = await requireAnyPageAccess(["repairs", "warranties"]);
    const url = new URL(request.url);
    const params = url.searchParams;
    const result = await searchRepairs({
      q: params.get("q") || "",
      status: params.get("status") || "",
      orderType: params.get("orderType") || "",
      start: params.get("start") || "",
      end: params.get("end") || "",
      page: params.get("page") || "1",
      pageSize: params.get("pageSize") || "",
      shopId: staff.shopId
    });
    return Response.json(result);
  } catch (error) {
    return authErrorResponse(error);
  }
}
