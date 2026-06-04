import { collectionRoute } from "@/lib/api-crud";
import { authErrorResponse, requireAnyPageAccess } from "@/lib/auth";
import { getRevisionPatch } from "@/lib/data-store";
import { prisma } from "@/lib/prisma";

const route = collectionRoute("clients");
export const GET = route.GET;
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

export async function POST(request) {
  try {
    await requireAnyPageAccess(["clients", "repairs"]);
    const body = await request.json();
    const clientId = body.id || crypto.randomUUID();
    const name = formatClientName(body.name);
    const phone = String(body.phone || "").trim();
    if (!name || !phone) return Response.json({ error: "客户姓名和电话必填" }, { status: 400 });
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
    const client = await prisma.client.upsert({
      where: { id: clientId },
      create: { id: clientId, ...payload },
      update: payload
    });
    return Response.json({ client, _revisionPatch: await getRevisionPatch(["clients"]) });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function DELETE(request) {
  try {
    await requireAnyPageAccess(["clients"]);
    const body = await request.json();
    const clientId = String(body?.id || "").trim();
    if (!clientId) throwBadRequest("缺少客户");
    const existing = await prisma.client.findUnique({ where: { id: clientId } });
    if (!existing) throwNotFound("没有找到客户");
    const repairCount = await prisma.repair.count({ where: { clientId } });
    if (repairCount > 0) throwBadRequest("客户已有维修记录，不能删除");
    await prisma.client.delete({ where: { id: clientId } });
    return Response.json({ ok: true, id: clientId, _revisionPatch: await getRevisionPatch(["clients"]) });
  } catch (error) {
    return authErrorResponse(error);
  }
}

function throwBadRequest(message) {
  const error = new Error(message);
  error.status = 400;
  throw error;
}

function throwNotFound(message) {
  const error = new Error(message);
  error.status = 404;
  throw error;
}
