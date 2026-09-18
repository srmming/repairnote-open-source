"use client";

import { createContext, useContext } from "react";

// 外层 hash 路由：/#/login、/#/portals、/#/p/<portalId>/dashboard/...、/#/settings/portals。
// 内部 RouteView 继续使用 /dashboard/... 逻辑路径；统一在这里解析 / 构造，不到处手工拼字符串。
export const SYSTEM_ROUTE = "/settings/portals";
export const PICKER_ROUTE = "/portals";
export const LOGIN_ROUTE = "/login";
const PORTAL_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function isValidPortalId(value) {
  return typeof value === "string" && PORTAL_ID_PATTERN.test(value);
}

export function parsePortalHash(hash) {
  const raw = String(hash || "").replace(/^#/, "") || LOGIN_ROUTE;
  const path = raw.split("?")[0];
  if (path === LOGIN_ROUTE) return { kind: "login", portalId: null, logicalRoute: null };
  if (path === PICKER_ROUTE) return { kind: "picker", portalId: null, logicalRoute: null };
  if (path === SYSTEM_ROUTE) return { kind: "system", portalId: null, logicalRoute: null };
  const match = raw.match(/^\/p\/([^/?#]+)(\/.*)?$/);
  if (match) {
    let portalId = "";
    try {
      portalId = decodeURIComponent(match[1]);
    } catch {
      return { kind: "invalid", portalId: null, logicalRoute: null };
    }
    if (!isValidPortalId(portalId)) return { kind: "invalid", portalId: null, logicalRoute: null };
    const logicalRoute = match[2] && match[2].startsWith("/dashboard") ? match[2] : "/dashboard/repairs";
    return { kind: "workspace", portalId, logicalRoute };
  }
  // 旧 /#/dashboard/... 链接：只有一个可用门户时映射过去；多个门户时先选择。
  if (path.startsWith("/dashboard")) return { kind: "legacy", portalId: null, logicalRoute: raw };
  return { kind: "invalid", portalId: null, logicalRoute: null };
}

export function buildPortalHash(portalId, logicalRoute = "/dashboard/repairs") {
  if (!isValidPortalId(portalId)) throw new Error("buildPortalHash: 门户标识不合法");
  const route = typeof logicalRoute === "string" && logicalRoute.startsWith("/dashboard") ? logicalRoute : "/dashboard/repairs";
  return `#/p/${encodeURIComponent(portalId)}${route}`;
}

export class ApiError extends Error {
  constructor(status, code, message, requestId = "") {
    super(message || "请求失败");
    this.status = status;
    this.code = code || "";
    this.requestId = requestId;
  }
}

export const PORTAL_LOST_CODES = ["PORTAL_ACCESS_DENIED", "PORTAL_INACTIVE"];

async function parseResponse(response) {
  const text = await response.text().catch(() => "");
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function toApiError(response, data) {
  return new ApiError(response.status, data.code || "", data.error || (response.status === 401 ? "请先登录" : "请求失败"), data.requestId || "");
}

// 每个实例捕获不可变的 portalId：排队时就绑定，不在请求发送时读取可变的“当前门户”。
// 切走后（dispose）的迟到响应一律作废，不更新新工作区。
export function createPortalApi(portalId, handlers = {}) {
  if (!isValidPortalId(portalId)) throw new Error("createPortalApi: 门户标识不合法");
  let disposed = false;
  let pendingWrites = 0;

  function assertLive() {
    if (disposed) throw new ApiError(0, "STALE_WORKSPACE", "工作区已切换，响应已忽略");
  }

  function handleFailure(response, data) {
    const error = toApiError(response, data);
    if (response.status === 401) handlers.onUnauthorized?.(error);
    else if (response.status === 403 && PORTAL_LOST_CODES.includes(error.code)) handlers.onPortalLost?.(error);
    throw error;
  }

  function verifyPortalHeader(response) {
    const header = response.headers.get("x-portal-id");
    if (header && header !== portalId) throw new ApiError(0, "PORTAL_MISMATCH", "服务器返回的门户与当前门户不一致");
  }

  async function request(url, init = {}) {
    assertLive();
    const headers = { ...(init.headers || {}), "X-Portal-Id": portalId };
    const response = await fetch(url, { ...init, headers, credentials: "same-origin" });
    assertLive();
    const data = await parseResponse(response);
    assertLive();
    if (!response.ok) handleFailure(response, data);
    verifyPortalHeader(response);
    return data;
  }

  // 所有非 GET 请求都计入“进行中的写入”，外层离开保护据此阻止切换门户 / 进管理页 / 退出。
  function tracked(promise) {
    pendingWrites += 1;
    return promise.finally(() => {
      pendingWrites -= 1;
    });
  }

  return {
    portalId,
    get: (url) => request(url),
    json: (url, method, body) => tracked(request(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })),
    // FormData 只加门户头：保留浏览器自动生成的 multipart 边界，不手写 Content-Type。
    formData: (url, method, body) => tracked(request(url, { method, body })),
    pendingWrites: () => pendingWrites,
    async download(url, filename) {
      assertLive();
      const response = await fetch(url, { headers: { "X-Portal-Id": portalId }, credentials: "same-origin" });
      assertLive();
      if (!response.ok) {
        const data = await parseResponse(response);
        handleFailure(response, data);
      }
      verifyPortalHeader(response);
      const blob = await response.blob();
      assertLive();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = downloadFileName(response.headers.get("content-disposition")) || filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    },
    href: (logicalRoute) => buildPortalHash(portalId, logicalRoute),
    isDisposed: () => disposed,
    // React 严格模式会把 effect 先清理再重跑：挂载时 activate，清理时 dispose，实例本身可复用。
    activate: () => {
      disposed = false;
    },
    dispose: () => {
      disposed = true;
    }
  };
}

function downloadFileName(contentDisposition) {
  const match = contentDisposition?.match(/filename="([^"]+)"/i) || contentDisposition?.match(/filename=([^;]+)/i);
  return match?.[1]?.trim() || "";
}

// 全局身份接口（登录 / 退出 / me / portals）：不带门户头。
export async function identityRequest(url, method = "GET", body) {
  const init = { method, credentials: "same-origin" };
  if (body !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }
  const response = await fetch(url, init);
  const data = await parseResponse(response);
  if (!response.ok) throw toApiError(response, data);
  return data;
}

export const PortalApiContext = createContext(null);

export function usePortalApi() {
  const api = useContext(PortalApiContext);
  if (!api) throw new Error("usePortalApi 必须在工作区（PortalApiContext）内使用");
  return api;
}

// 临时错误（断网 / 5xx / 0）与身份 / 门户失效区分：只有后者才清空登录或工作区。
export function isTransientError(error) {
  if (!error) return true;
  if (error instanceof ApiError) return !error.status || error.status >= 500;
  return true;
}
