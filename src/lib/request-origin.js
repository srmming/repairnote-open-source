// REPAIRNOTE_PUBLIC_ORIGIN：浏览器访问此应用的唯一 origin（不带路径 / 查询 / 凭据）。
// 系统管理写接口的同源校验只信任这个配置，不信任任何客户端可伪造的代理头。

export function parsePublicOrigin(value) {
  const text = String(value || "").trim();
  if (!text) return { ok: false, reason: "REPAIRNOTE_PUBLIC_ORIGIN 未设置" };
  let url;
  try {
    url = new URL(text);
  } catch {
    return { ok: false, reason: "REPAIRNOTE_PUBLIC_ORIGIN 不是合法的 URL" };
  }
  if (!["http:", "https:"].includes(url.protocol)) return { ok: false, reason: "REPAIRNOTE_PUBLIC_ORIGIN 必须以 http:// 或 https:// 开头" };
  if (url.username || url.password) return { ok: false, reason: "REPAIRNOTE_PUBLIC_ORIGIN 不能包含用户名或密码" };
  if (url.search || url.hash || (url.pathname && url.pathname !== "/")) return { ok: false, reason: "REPAIRNOTE_PUBLIC_ORIGIN 只能是 origin，不能带路径、查询或 #" };
  if (text.endsWith("/") && text !== `${url.origin}/`) return { ok: false, reason: "REPAIRNOTE_PUBLIC_ORIGIN 不能带路径" };
  const localhost = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  const secureRequired = process.env.REPAIRNOTE_COOKIE_SECURE === "true" || (process.env.REPAIRNOTE_COOKIE_SECURE !== "false" && process.env.NODE_ENV === "production");
  if (secureRequired && url.protocol !== "https:" && !localhost) {
    return { ok: false, reason: "生产环境（REPAIRNOTE_COOKIE_SECURE=true）的 REPAIRNOTE_PUBLIC_ORIGIN 必须是 https:// 地址" };
  }
  return { ok: true, origin: url.origin };
}

export function publicOrigin() {
  const parsed = parsePublicOrigin(process.env.REPAIRNOTE_PUBLIC_ORIGIN);
  return parsed.ok ? parsed.origin : "";
}

// 启动预检：生产环境缺失 / 非法时直接失败，避免系统管理写接口全部 403 才被发现。
export function assertPublicOriginConfigured({ strict = process.env.NODE_ENV === "production" } = {}) {
  const parsed = parsePublicOrigin(process.env.REPAIRNOTE_PUBLIC_ORIGIN);
  if (parsed.ok) return parsed.origin;
  const message = `${parsed.reason}。请把 REPAIRNOTE_PUBLIC_ORIGIN 设为浏览器访问本系统的地址，例如 https://repair.example.com`;
  if (strict) throw new Error(message);
  console.warn(`⚠ ${message}`);
  return "";
}
