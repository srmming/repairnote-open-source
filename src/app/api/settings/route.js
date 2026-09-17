import { badRequest, errorResponse, forbidden, readJsonBody, requestIdOf } from "@/lib/api-errors";
import { assertNoPortalOverride, portalJson, requirePortalContext } from "@/lib/portal-context";
import { parseExpectedRevision, withPortalWrite } from "@/lib/portal-write";
import { getPortalSettings, PROTECTED_SETTING_KEYS, sanitizeSettings, SETTING_KEYS } from "@/lib/data-store";
import { defaultSettings } from "@/lib/seed-data";

export async function GET(request) {
  const requestId = requestIdOf(request);
  try {
    const ctx = await requirePortalContext(request, { anyOf: ["settings"] });
    const { settings, updatedAt } = await getPortalSettings(ctx);
    return portalJson(ctx, { settings, _settingsUpdatedAt: updatedAt, _revision: ctx.portal.revision });
  } catch (error) {
    return errorResponse(error, { requestId });
  }
}

// 协议：{ settings: {...白名单键...}, expectedRevision }。锁单策略键只有本门户管理员可修改。
export async function POST(request) {
  const requestId = requestIdOf(request);
  try {
    const ctx = await requirePortalContext(request, { anyOf: ["settings"] });
    const body = await readJsonBody(request);
    assertNoPortalOverride(ctx, body);
    const input = body.settings;
    if (!input || typeof input !== "object" || Array.isArray(input)) throw badRequest("settings 必须是对象");
    const unknown = Object.keys(input).filter((key) => !SETTING_KEYS.includes(key));
    if (unknown.length) throw badRequest(`不支持的设置字段：${unknown.slice(0, 5).join(", ")}`);
    const expectedRevision = parseExpectedRevision(body.expectedRevision);
    const { result, revision } = await withPortalWrite(ctx, { expectedRevision }, async (tx, { member }) => {
      const current = await tx.setting.findUnique({ where: { portalId: ctx.portalId } });
      const currentValue = { ...defaultSettings, ...(current?.value || {}) };
      if (!member.isAdmin) {
        for (const key of PROTECTED_SETTING_KEYS) {
          if (input[key] !== undefined && input[key] !== currentValue[key]) throw forbidden("只有本门户管理员可以修改订单锁定策略", "PORTAL_ADMIN_REQUIRED");
        }
      }
      const payload = sanitizeSettings({ ...currentValue, ...input });
      return tx.setting.upsert({
        where: { portalId: ctx.portalId },
        create: { portalId: ctx.portalId, value: payload },
        update: { value: payload }
      });
    });
    return portalJson(ctx, {
      settings: { ...defaultSettings, ...(result.value || {}) },
      _settingsUpdatedAt: result.updatedAt?.toISOString?.() || "",
      _revision: revision
    });
  } catch (error) {
    return errorResponse(error, { requestId });
  }
}
