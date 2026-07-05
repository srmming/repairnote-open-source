import { createSuperAdminSession, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request) {
  const { username, password } = await request.json();
  const admin = await prisma.superAdmin.findUnique({ where: { username: String(username || "") } });
  if (!admin || !verifyPassword(password || "", admin.passwordHash)) {
    return Response.json({ error: "账号或密码不正确" }, { status: 401 });
  }
  await createSuperAdminSession(admin);
  return Response.json({ user: { id: admin.id, username: admin.username } });
}
