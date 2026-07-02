import { authErrorResponse, requirePageAccess } from "@/lib/auth";
import { technicianDashboard } from "@/lib/report-store";

export async function GET(request) {
  try {
    await requirePageAccess("technicians");
    const params = new URL(request.url).searchParams;
    const result = await technicianDashboard({ date: params.get("date") || "" });
    return Response.json(result);
  } catch (error) {
    return authErrorResponse(error);
  }
}
