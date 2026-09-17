import { systemRead } from "@/app/api/system/_shared";
import { findAssignableStaff } from "@/lib/system-portal-store";

export async function GET(request) {
  return systemRead(request, (actor) => {
    const params = new URL(request.url).searchParams;
    return findAssignableStaff(actor, params.has("username") ? params.get("username") : undefined);
  });
}
