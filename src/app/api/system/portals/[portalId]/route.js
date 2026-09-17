import { systemWrite } from "@/app/api/system/_shared";
import { updateSystemPortal } from "@/lib/system-portal-store";

export async function PATCH(request, { params }) {
  const { portalId } = await params;
  return systemWrite(request, (actor, body) => updateSystemPortal(actor, portalId, body));
}
