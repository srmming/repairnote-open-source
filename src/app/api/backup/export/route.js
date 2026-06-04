import { authErrorResponse, requirePageAccess } from "@/lib/auth";
import { getBootstrapData } from "@/lib/data-store";

export async function GET() {
  try {
    await requirePageAccess("backup");
    const data = await getBootstrapData({ includeRepairItems: true });
    return Response.json({ exportedAt: new Date().toISOString(), data });
  } catch (error) {
    return authErrorResponse(error);
  }
}
