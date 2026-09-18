import { getCurrentStaff } from "@/lib/auth";
import { errorResponse, jsonResponse, requestIdOf } from "@/lib/api-errors";

// 全局身份：{ user: {id,name,username,email,isSystemAdmin} | null }。isSystemAdmin 只用于界面分流，不能替代业务成员校验。
export async function GET(request) {
  try {
    const user = await getCurrentStaff();
    return jsonResponse({ user: user || null });
  } catch (error) {
    return errorResponse(error, { requestId: requestIdOf(request) });
  }
}
