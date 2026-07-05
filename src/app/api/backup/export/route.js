import { authErrorResponse, requirePageAccess } from "@/lib/auth";
import { getBootstrapData } from "@/lib/data-store";

export async function GET() {
  try {
    const staff = await requirePageAccess("backup");
    const data = await getBootstrapData({ shopId: staff.shopId, includeRepairItems: true });
    return Response.json({ exportedAt: new Date().toISOString(), data });
  } catch (error) {
    return authErrorResponse(error);
  }
}
