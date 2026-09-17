import { errorResponse, methodNotAllowed, readJsonBody, requestIdOf } from "@/lib/api-errors";
import { assertNoPortalOverride, portalJson, requirePortalContext } from "@/lib/portal-context";
import { CATALOG_SECTIONS, getBootstrapData, syncAttributesData, syncCatalogData, syncTechniciansData } from "@/lib/data-store";

// 小资源集合路由：只读取当前门户对应的资源（不再走全量 bootstrap），写入按资源 / 分区授权并携带 expectedRevision。
const readAccess = {
  catalog: { anyOf: ["categories", "modules", "services"] },
  attributes: { anyOf: ["attributes"] },
  technicians: { anyOf: ["technicians"] }
};

const writeAccess = {
  attributes: { anyOf: ["attributes"] },
  technicians: { anyOf: ["technicians"] }
};

export function collectionRoute(resource) {
  return {
    async GET(request) {
      const requestId = requestIdOf(request);
      try {
        const access = readAccess[resource];
        if (!access) throw methodNotAllowed();
        const ctx = await requirePortalContext(request, access);
        const data = await getBootstrapData(ctx, { includeUsers: false });
        if (resource === "catalog") return portalJson(ctx, { brands: data.brands, models: data.models, services: data.services, parts: data.parts, settings: pickCatalogSettings(data.settings), _revision: data._revision });
        return portalJson(ctx, { [resource]: data[resource], _revision: data._revision });
      } catch (error) {
        return errorResponse(error, { requestId });
      }
    },
    async POST(request) {
      const requestId = requestIdOf(request);
      try {
        if (resource === "catalog") return await saveCatalog(request);
        const access = writeAccess[resource];
        if (!access) throw methodNotAllowed();
        const ctx = await requirePortalContext(request, access);
        const body = await readJsonBody(request);
        assertNoPortalOverride(ctx, body);
        const rows = body[resource];
        if (resource === "technicians") return portalJson(ctx, await syncTechniciansData(ctx, rows, { expectedRevision: body.expectedRevision }));
        if (resource === "attributes") return portalJson(ctx, await syncAttributesData(ctx, rows, { expectedRevision: body.expectedRevision }));
        throw methodNotAllowed();
      } catch (error) {
        return errorResponse(error, { requestId });
      }
    }
  };
}

function pickCatalogSettings(settings = {}) {
  return Object.fromEntries(["productCatalogCategories", "productServiceCategories", "productPartCategories"].filter((key) => settings[key] !== undefined).map((key) => [key, settings[key]]));
}

// 目录写入协议：{ section, brands?, models?, services?, parts?, settings?, expectedRevision }；section 决定权限与允许修改的内容。
async function saveCatalog(request) {
  const requestId = requestIdOf(request);
  try {
    const body = await readJsonBody(request);
    const section = CATALOG_SECTIONS[body.section];
    if (!section) {
      // 先验会话，再报 section 错误，避免未登录探测
      await requirePortalContext(request, { member: true });
      return errorResponse({ status: 400, code: "INVALID_SECTION", message: "未知的目录分区（section）" }, { requestId });
    }
    const ctx = await requirePortalContext(request, section.permissions.length > 1 ? { allOf: section.permissions } : { anyOf: section.permissions });
    assertNoPortalOverride(ctx, body);
    const { section: sectionName, expectedRevision, ...payload } = body;
    return portalJson(ctx, await syncCatalogData(ctx, payload, { section: sectionName, expectedRevision }));
  } catch (error) {
    return errorResponse(error, { requestId });
  }
}
