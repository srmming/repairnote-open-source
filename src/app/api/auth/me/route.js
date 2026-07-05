import { getCurrentStaff } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await getCurrentStaff();
  if (!user) return Response.json({ user: null, setupRequired: await prisma.staff.count() === 0 });
  return Response.json({ user });
}
