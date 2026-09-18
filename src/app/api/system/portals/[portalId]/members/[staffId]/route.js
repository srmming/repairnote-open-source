import { systemWrite } from "@/app/api/system/_shared";
import { removeSystemPortalMember, setSystemPortalMember } from "@/lib/system-portal-store";

export async function PUT(request, { params }) {
  const { portalId, staffId } = await params;
  return systemWrite(request, (actor, body) => setSystemPortalMember(actor, portalId, staffId, body));
}

export async function DELETE(request, { params }) {
  const { portalId, staffId } = await params;
  return systemWrite(request, (actor, body) => removeSystemPortalMember(actor, portalId, staffId, body));
}
