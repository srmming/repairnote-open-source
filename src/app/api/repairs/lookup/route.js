import { authErrorResponse, requireAnyPageAccess } from "@/lib/auth";
import { lookupRepairByScan } from "@/lib/data-store";

export async function GET(request) {
  try {
    const staff = await requireAnyPageAccess(["repairs", "warranties"]);
    const value = new URL(request.url).searchParams.get("value") || "";
    const repair = await lookupRepairByScan(value, { shopId: staff.shopId });
    return Response.json({ repair });
  } catch (error) {
    return authErrorResponse(error);
  }
}
