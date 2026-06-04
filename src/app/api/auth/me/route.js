import { getCurrentStaff } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentStaff();
  if (!user) return Response.json({ user: null });
  return Response.json({ user });
}
