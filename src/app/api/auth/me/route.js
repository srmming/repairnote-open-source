import { authErrorResponse, requireStaff } from "@/lib/auth";

export async function GET() {
  try {
    return Response.json({ user: await requireStaff() });
  } catch (error) {
    return authErrorResponse(error);
  }
}
