import { authErrorResponse, requirePageAccess } from "@/lib/auth";
import { deleteTechnicianHistory } from "@/lib/data-store";

export async function DELETE(request) {
  try {
    await requirePageAccess("technicians");
    const body = await request.json();
    const result = await deleteTechnicianHistory(body?.key || "");
    return Response.json(result);
  } catch (error) {
    return authErrorResponse(error);
  }
}
