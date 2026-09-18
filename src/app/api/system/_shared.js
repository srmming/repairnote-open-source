import { errorResponse, jsonResponse, readJsonBody, requestIdOf } from "@/lib/api-errors";
import { requireSystemAdmin, requireSystemWriteRequest } from "@/lib/system-admin";

// /api/system/* 公共壳：先验会话与系统角色，再校验写请求的同源 / JSON 协议，最后才处理参数。
export async function systemRead(request, handler) {
  const requestId = requestIdOf(request);
  try {
    const actor = await requireSystemAdmin(request);
    const body = await handler(actor);
    return jsonResponse(body);
  } catch (error) {
    return errorResponse(error, { requestId });
  }
}

export async function systemWrite(request, handler, { status = 200 } = {}) {
  const requestId = requestIdOf(request);
  try {
    const actor = await requireSystemAdmin(request);
    requireSystemWriteRequest(request);
    const body = await readJsonBody(request);
    const result = await handler(actor, body);
    const responseStatus = typeof result?.status === "number" ? result.status : status;
    const payload = result && typeof result === "object" && "body" in result ? result.body : result;
    return jsonResponse(payload, { status: responseStatus });
  } catch (error) {
    return errorResponse(error, { requestId });
  }
}
