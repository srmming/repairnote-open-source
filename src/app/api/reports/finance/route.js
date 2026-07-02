import { authErrorResponse, requirePageAccess } from "@/lib/auth";
import { reportFinance } from "@/lib/report-store";

export async function GET(request) {
  try {
    await requirePageAccess("finance");
    const params = new URL(request.url).searchParams;
    const result = await reportFinance({
      start: params.get("start") || "",
      end: params.get("end") || "",
      q: params.get("q") || "",
      paymentsPage: params.get("paymentsPage") || "1",
      unpaidPage: params.get("unpaidPage") || "1",
      pageSize: params.get("pageSize") || ""
    });
    return Response.json(result);
  } catch (error) {
    return authErrorResponse(error);
  }
}
