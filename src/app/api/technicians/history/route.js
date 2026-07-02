import { authErrorResponse, canAccessPage, requirePageAccess } from "@/lib/auth";
import { deleteTechnicianHistory } from "@/lib/data-store";

// 批量删除历史维修师名下的维修单：属于维修单写操作，
// 要求同时具备 technicians（入口页面）与 repairs（删单）两个权限。
export async function DELETE(request) {
  try {
    const staff = await requirePageAccess("technicians");
    if (!staff.isAdmin && !canAccessPage(staff, "repairs")) {
      const error = new Error("需要维修单管理权限才能删除历史记录");
      error.status = 403;
      throw error;
    }
    const body = await request.json();
    const result = await deleteTechnicianHistory(body?.key || "");
    if (result.deleted) console.info(`历史维修师记录删除：${body?.key || ""} 共 ${result.deleted} 单（操作人 ${staff.username || staff.id}）`);
    return Response.json(result);
  } catch (error) {
    return authErrorResponse(error);
  }
}
