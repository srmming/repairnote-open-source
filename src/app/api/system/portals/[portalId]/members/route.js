import { systemRead } from "@/app/api/system/_shared";
import { listSystemPortalMembers } from "@/lib/system-portal-store";

export async function GET(request, { params }) {
  const { portalId } = await params;
  return systemRead(request, (actor) => {
    const search = new URL(request.url).searchParams;
    return listSystemPortalMembers(actor, portalId, { page: search.get("page") || "", pageSize: search.get("pageSize") || "" });
  });
}
