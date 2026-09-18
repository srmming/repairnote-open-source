import { errorResponse, requestIdOf } from "@/lib/api-errors";
import { requirePortalContext } from "@/lib/portal-context";

// 旧的维修单集合入口已停用：列表走 /api/repairs/search，保存走 /api/repairs/[id]。
// 保留路由只为返回明确的 410 / 405，不再调用任何无范围的全局数据函数。
export async function GET(request) {
  const requestId = requestIdOf(request);
  try {
    await requirePortalContext(request, { anyOf: ["repairs"] });
    return errorResponse({ status: 410, code: "ENDPOINT_RETIRED", message: "请使用 /api/repairs/search 查询维修单" }, { requestId });
  } catch (error) {
    return errorResponse(error, { requestId });
  }
}

export async function POST(request) {
  const requestId = requestIdOf(request);
  try {
    await requirePortalContext(request, { anyOf: ["repairs"] });
    return errorResponse({ status: 405, code: "METHOD_NOT_ALLOWED", message: "请使用单张维修单接口保存" }, { requestId });
  } catch (error) {
    return errorResponse(error, { requestId });
  }
}
