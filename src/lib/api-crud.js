import { hashPassword, requireAnyPageAccess, requirePageAccess } from "@/lib/auth";
import { getBootstrapData, syncAttributesData, syncCatalogData, syncFromClientData, syncTechniciansData } from "@/lib/data-store";
import { validateBusinessDataShape } from "@/lib/data-validation";

const resourceMap = {
  clients: "clients",
  catalog: null,
  attributes: "attributes",
  staff: "users",
  technicians: "technicians",
  settings: "settings",
  repairs: "repairs"
};

const resourcePermissions = {
  clients: ["clients"],
  catalog: ["categories", "modules", "services"],
  attributes: ["attributes"],
  technicians: ["technicians"],
  settings: ["settings"],
  repairs: ["repairs", "warranties"]
};

export function collectionRoute(resource) {
  return {
    async GET() {
      try {
        const staff = await requireResourceAccess(resource, "read");
        const data = await getBootstrapData({ shopId: staff.shopId });
        if (resource === "staff" && !staff.isAdmin) return Response.json({ error: "只有管理员可查看员工" }, { status: 403 });
        if (resource === "catalog") return Response.json({ brands: data.brands, models: data.models, services: data.services, parts: data.parts });
        return Response.json(data[resourceMap[resource]]);
      } catch (error) {
        return errorResponse(error);
      }
    },
    async POST(request) {
      try {
        const staff = await requireResourceAccess(resource, "write");
        const body = await request.json();
        if (resource === "staff" && !staff.isAdmin) return Response.json({ error: "只有管理员可管理员工" }, { status: 403 });
        if (resource === "technicians") return Response.json(await syncTechniciansData(body, { shopId: staff.shopId }));
        if (resource === "catalog") return Response.json(await syncCatalogData(body, { shopId: staff.shopId }));
        if (resource === "attributes") return Response.json(await syncAttributesData(body, { shopId: staff.shopId }));
        const data = await getBootstrapData({ shopId: staff.shopId });
        const next = applyBody(data, resource, body);
        return Response.json(await syncFromClientData(validateBusinessDataShape(next, "保存数据"), { shopId: staff.shopId }));
      } catch (error) {
        return errorResponse(error);
      }
    }
  };
}

async function requireResourceAccess(resource, action) {
  if (resource === "staff") {
    const staff = await requirePageAccess("settings");
    if (!staff.isAdmin) {
      const error = new Error(action === "read" ? "只有管理员可查看员工" : "只有管理员可管理员工");
      error.status = 403;
      throw error;
    }
    return staff;
  }
  const keys = resourcePermissions[resource] || [];
  return keys.length === 1 ? requirePageAccess(keys[0]) : requireAnyPageAccess(keys);
}

function applyBody(data, resource, body) {
  if (resource === "catalog") return { ...data, ...body };
  if (resource === "settings") return { ...data, settings: body };
  if (resource === "staff") {
    const payload = { ...body, isAdmin: Boolean(body.isAdmin) };
    payload.pagePermissions = Array.isArray(body.pagePermissions) ? body.pagePermissions : [];
    if (body.password) payload.passwordHash = hashPassword(body.password);
    delete payload.password;
    const users = payload.id ? data.users.map((item) => item.id === payload.id ? { ...item, ...payload } : item) : [{ ...payload, id: cryptoId() }, ...data.users];
    return { ...data, users };
  }
  const key = resourceMap[resource];
  const rows = Array.isArray(body) ? body : body.id ? data[key].map((item) => item.id === body.id ? { ...item, ...body } : item) : [{ ...body, id: cryptoId() }, ...data[key]];
  return { ...data, [key]: rows };
}

function cryptoId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function errorResponse(error) {
  if (error?.status === 401) return Response.json({ error: "请先登录" }, { status: 401 });
  if (error?.status === 400) return Response.json({ error: error.message || "请求格式不正确" }, { status: 400 });
  if (error?.status === 403) return Response.json({ error: error.message || "没有权限" }, { status: 403 });
  if (error?.status === 409) return Response.json({ error: error.message || "数据已被更新，请刷新后重试" }, { status: 409 });
  if (error?.status === 404) return Response.json({ error: error.message || "没有找到数据" }, { status: 404 });
  return Response.json({ error: error?.message || "服务器错误" }, { status: 500 });
}
