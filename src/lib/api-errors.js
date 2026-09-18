import crypto from "crypto";

// 统一错误形状：{ error: 可展示文案, code: 固定代码, requestId: 关联编号 }。
// 服务端异常细节只进日志，不回显 SQL / 堆栈 / 账号原行。

const DEFAULT_CODES = {
  400: "INVALID_INPUT",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  405: "METHOD_NOT_ALLOWED",
  409: "CONFLICT",
  410: "GONE",
  413: "PAYLOAD_TOO_LARGE",
  429: "TOO_MANY_REQUESTS",
  500: "INTERNAL_ERROR"
};

const DEFAULT_MESSAGES = {
  400: "请求格式不正确",
  401: "请先登录",
  403: "没有权限",
  404: "没有找到数据",
  405: "不支持的请求方法",
  409: "数据已被更新，请刷新后重试",
  410: "该接口已停用",
  413: "请求内容超过允许上限",
  429: "请求过于频繁，请稍后再试",
  500: "服务器错误"
};

export class ApiError extends Error {
  constructor(status, message, code) {
    super(message || DEFAULT_MESSAGES[status] || "服务器错误");
    this.status = status;
    this.code = code || DEFAULT_CODES[status] || "INTERNAL_ERROR";
  }
}

export const badRequest = (message, code = "INVALID_INPUT") => new ApiError(400, message, code);
export const unauthorized = (message = "请先登录") => new ApiError(401, message, "UNAUTHORIZED");
export const forbidden = (message, code = "FORBIDDEN") => new ApiError(403, message, code);
export const notFound = (message, code = "NOT_FOUND") => new ApiError(404, message, code);
export const conflict = (message, code = "CONFLICT") => new ApiError(409, message, code);
export const methodNotAllowed = () => new ApiError(405, DEFAULT_MESSAGES[405], "METHOD_NOT_ALLOWED");

export function newRequestId() {
  return crypto.randomBytes(8).toString("hex");
}

export function requestIdOf(request) {
  const header = request?.headers?.get?.("x-request-id");
  if (header && /^[A-Za-z0-9_-]{4,64}$/.test(header)) return header;
  return newRequestId();
}

export const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" };

export function jsonResponse(body, init = {}, extraHeaders = {}) {
  const headers = { ...PRIVATE_HEADERS, ...extraHeaders, ...(init.headers || {}) };
  return Response.json(body, { ...init, headers });
}

function isPrismaUniqueError(error) {
  return error?.code === "P2002";
}

function isPrismaForeignKeyError(error) {
  return error?.code === "P2003";
}

export function normalizeError(error) {
  if (error instanceof ApiError) return error;
  if (error?.status && DEFAULT_CODES[error.status]) {
    const normalized = new ApiError(error.status, error.message, error.code);
    return normalized;
  }
  if (error instanceof SyntaxError) return new ApiError(400, "请求内容不是合法的 JSON", "INVALID_JSON");
  if (isPrismaUniqueError(error)) return new ApiError(409, "数据与已有记录冲突（重复的名称、单号或编号）", "UNIQUE_CONFLICT");
  if (isPrismaForeignKeyError(error)) return new ApiError(400, "引用的对象不存在或不属于当前门户", "INVALID_REFERENCE");
  return null;
}

export function errorResponse(error, options = {}) {
  const requestId = options.requestId || newRequestId();
  const normalized = normalizeError(error);
  const headers = { ...PRIVATE_HEADERS, ...(options.headers || {}) };
  if (normalized) {
    if (normalized.status >= 500) {
      console.error(`[${requestId}] ${normalized.code}:`, error);
    } else if (options.log !== false) {
      console.info(`[${requestId}] ${normalized.status} ${normalized.code}: ${normalized.message}`);
    }
    return Response.json({ error: normalized.message, code: normalized.code, requestId }, { status: normalized.status, headers });
  }
  console.error(`[${requestId}] INTERNAL_ERROR:`, error);
  return Response.json({ error: DEFAULT_MESSAGES[500], code: "INTERNAL_ERROR", requestId }, { status: 500, headers });
}

export async function readJsonBody(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    throw badRequest("请求内容不是合法的 JSON", "INVALID_JSON");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw badRequest("请求内容必须是 JSON 对象", "INVALID_JSON");
  return body;
}

export function parsePositiveInt(value, { name = "参数", fallback = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (value === undefined || value === null || value === "") return fallback;
  const text = String(value).trim();
  if (!/^\d+$/.test(text)) throw badRequest(`${name}必须是正整数`);
  const number = Number(text);
  if (!Number.isSafeInteger(number) || number < 1) throw badRequest(`${name}必须是正整数`);
  return Math.min(number, max);
}
