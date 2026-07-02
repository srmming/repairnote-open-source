import { authErrorResponse, requireAnyPageAccess } from "@/lib/auth";
import { searchClients } from "@/lib/data-store";

export async function GET(request) {
  try {
    await requireAnyPageAccess(["clients", "repairs"]);
    const params = new URL(request.url).searchParams;
    const result = await searchClients({
      q: params.get("q") || "",
      clientId: params.get("clientId") || "",
      phone: params.get("phone") || "",
      filter: params.get("filter") || "all",
      sort: params.get("sort") || "latest",
      page: params.get("page") || "1",
      pageSize: params.get("pageSize") || ""
    });
    return Response.json(result);
  } catch (error) {
    return authErrorResponse(error);
  }
}
