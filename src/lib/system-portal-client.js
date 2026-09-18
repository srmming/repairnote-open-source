"use client";

import { ApiError } from "@/lib/portal-client";

// 系统管理 API 客户端：独立于 createPortalApi，不注入任何门户头；写请求统一 JSON + 同源 Cookie。
async function parseResponse(response) {
  const text = await response.text().catch(() => "");
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

export function newIdempotencyKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function createSystemApi(handlers = {}) {
  let disposed = false;

  async function request(url, init = {}) {
    if (disposed) throw new ApiError(0, "STALE_VIEW", "管理页已关闭，响应已忽略");
    const response = await fetch(url, { ...init, credentials: "same-origin" });
    if (disposed) throw new ApiError(0, "STALE_VIEW", "管理页已关闭，响应已忽略");
    const data = await parseResponse(response);
    if (!response.ok) {
      const error = new ApiError(response.status, data.code || "", data.error || "请求失败", data.requestId || "");
      if (response.status === 401) handlers.onUnauthorized?.(error);
      else if (response.status === 403 && error.code === "SYSTEM_ADMIN_REQUIRED") handlers.onSystemRoleLost?.(error);
      throw error;
    }
    return data;
  }

  const jsonInit = (method, body, extraHeaders = {}) => ({ method, headers: { "Content-Type": "application/json", ...extraHeaders }, body: JSON.stringify(body) });

  return {
    listPortals: ({ q = "", status = "all", page = 1, pageSize = 20 } = {}) => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      params.set("status", status);
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      return request(`/api/system/portals?${params.toString()}`);
    },
    createPortal: (name, idempotencyKey, initialAdmin = null) => request("/api/system/portals", jsonInit("POST", initialAdmin ? { name, initialAdmin } : { name }, { "Idempotency-Key": idempotencyKey })),
    updatePortal: (portalId, payload) => request(`/api/system/portals/${encodeURIComponent(portalId)}`, jsonInit("PATCH", payload)),
    listMembers: (portalId, { page = 1, pageSize = 100 } = {}) => request(`/api/system/portals/${encodeURIComponent(portalId)}/members?page=${page}&pageSize=${pageSize}`),
    findStaff: (username) => request(`/api/system/staff?username=${encodeURIComponent(username)}`),
    setMember: (portalId, staffId, payload) => request(`/api/system/portals/${encodeURIComponent(portalId)}/members/${encodeURIComponent(staffId)}`, jsonInit("PUT", payload)),
    removeMember: (portalId, staffId, expectedRevision) => request(`/api/system/portals/${encodeURIComponent(portalId)}/members/${encodeURIComponent(staffId)}`, jsonInit("DELETE", { expectedRevision })),
    activate: () => {
      disposed = false;
    },
    dispose: () => {
      disposed = true;
    }
  };
}
