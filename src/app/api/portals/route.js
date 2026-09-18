import { requireStaff } from "@/lib/auth";
import { errorResponse, jsonResponse, requestIdOf } from "@/lib/api-errors";
import { listStaffPortals } from "@/lib/portal-store";

// 已登录账号本人可进入的门户列表（只含启用门户及本门户权限；不含其他成员和业务数据）。
export async function GET(request) {
  const requestId = requestIdOf(request);
  try {
    const staff = await requireStaff();
    return jsonResponse({ portals: await listStaffPortals(staff.id) });
  } catch (error) {
    return errorResponse(error, { requestId });
  }
}
