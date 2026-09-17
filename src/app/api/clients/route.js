import { badRequest, conflict, errorResponse, notFound, readJsonBody, requestIdOf } from "@/lib/api-errors";
import { assertNoPortalOverride, portalJson, requirePortalContext } from "@/lib/portal-context";
import { withPortalWrite } from "@/lib/portal-write";
import crypto from "crypto";

const DEFAULT_CLIENT_LEVEL = "VIP";
const CLIENT_LEVELS = [DEFAULT_CLIENT_LEVEL, "超级 VIP", "黑名单"];

function formatClientName(value) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("es-ES")
    .replace(/(^|\s)(\S)/g, (match) => match.toLocaleUpperCase("es-ES"));
}

function normalizeClientLevel(level) {
  return CLIENT_LEVELS.includes(level) ? level : DEFAULT_CLIENT_LEVEL;
}

function validDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

// 客户列表统一走 /api/clients/search；集合 GET 已停用。
export async function GET(request) {
  const requestId = requestIdOf(request);
  try {
    await requirePortalContext(request, { anyOf: ["clients", "repairs"] });
    return errorResponse({ status: 410, code: "ENDPOINT_RETIRED", message: "请使用 /api/clients/search 查询客户" }, { requestId });
  } catch (error) {
    return errorResponse(error, { requestId });
  }
}

// 新建：createOnly:true（不允许接管已有 ID）；更新：必须带旧 updatedAt。
export async function POST(request) {
  const requestId = requestIdOf(request);
  try {
    const ctx = await requirePortalContext(request, { anyOf: ["clients", "repairs"] });
    const body = await readJsonBody(request);
    assertNoPortalOverride(ctx, body);
    const clientId = String(body.id || "").trim() || crypto.randomUUID();
    const name = formatClientName(body.name);
    const phone = String(body.phone || "").trim();
    if (!name || !phone) throw badRequest("客户姓名和电话必填");
    if (body.createOnly !== undefined && typeof body.createOnly !== "boolean") throw badRequest("createOnly 必须是布尔值");
    const createOnly = body.createOnly === true;
    const payload = {
      name,
      phone,
      level: normalizeClientLevel(body.level),
      docType: body.docType || "DNI",
      identity: body.identity || "",
      email: body.email || "",
      address: body.address || "",
      comment: body.comment || ""
    };
    const { result, revision } = await withPortalWrite(ctx, {}, async (tx) => {
      const existing = await tx.client.findUnique({ where: { id: clientId } });
      if (existing && existing.portalId !== ctx.portalId) {
        if (createOnly) throw conflict("客户编号已被使用，请刷新后重试", "ALREADY_EXISTS");
        throw notFound("没有找到客户", "CLIENT_NOT_FOUND");
      }
      if (createOnly && existing) throw conflict("这位客户已存在，请刷新后重试", "ALREADY_EXISTS");
      if (!createOnly && !existing) throw notFound("这位客户已被删除或不存在，请刷新后重试", "CLIENT_NOT_FOUND");
      if (!existing) return tx.client.create({ data: { id: clientId, portalId: ctx.portalId, ...payload } });
      if (body.updatedAt === undefined || body.updatedAt === null || body.updatedAt === "") throw badRequest("缺少客户版本（updatedAt），请刷新后重试", "VERSION_REQUIRED");
      const expected = validDate(body.updatedAt);
      if (!expected) throw badRequest("客户版本（updatedAt）格式不正确", "INVALID_VERSION");
      if (expected.getTime() !== existing.updatedAt.getTime()) throw conflict("客户资料已被更新，请刷新后重试", "VERSION_CONFLICT");
      return tx.client.update({ where: { id: clientId }, data: { ...payload, updatedAt: new Date(Math.max(Date.now(), existing.updatedAt.getTime() + 1)) } });
    });
    const { portalId, ...client } = result;
    return portalJson(ctx, { client, _revision: revision });
  } catch (error) {
    return errorResponse(error, { requestId });
  }
}

export async function DELETE(request) {
  const requestId = requestIdOf(request);
  try {
    const ctx = await requirePortalContext(request, { anyOf: ["clients"] });
    const body = await readJsonBody(request);
    assertNoPortalOverride(ctx, body);
    const clientId = String(body?.id || "").trim();
    if (!clientId) throw badRequest("缺少客户");
    const { revision } = await withPortalWrite(ctx, {}, async (tx) => {
      const existing = await tx.client.findFirst({ where: { id: clientId, portalId: ctx.portalId } });
      if (!existing) throw notFound("没有找到客户", "CLIENT_NOT_FOUND");
      const repairCount = await tx.repair.count({ where: { portalId: ctx.portalId, clientId } });
      if (repairCount > 0) throw badRequest("客户已有维修记录，不能删除");
      await tx.client.delete({ where: { id: clientId } });
      return true;
    });
    return portalJson(ctx, { ok: true, id: clientId, _revision: revision });
  } catch (error) {
    return errorResponse(error, { requestId });
  }
}
