import { clearSession } from "@/lib/auth";
import { errorResponse, jsonResponse, requestIdOf } from "@/lib/api-errors";

export async function POST(request) {
  try {
    await clearSession();
    return jsonResponse({ ok: true });
  } catch (error) {
    return errorResponse(error, { requestId: requestIdOf(request) });
  }
}
