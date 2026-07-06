import { getCurrentSuperAdmin } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentSuperAdmin();
  return Response.json({ user });
}
