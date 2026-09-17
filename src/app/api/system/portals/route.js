import { systemRead, systemWrite } from "@/app/api/system/_shared";
import { assertOnlyKeys, createSystemPortal, listSystemPortals } from "@/lib/system-portal-store";

export async function GET(request) {
  return systemRead(request, (actor) => {
    const params = new URL(request.url).searchParams;
    return listSystemPortals(actor, {
      q: params.get("q") || "",
      status: params.get("status") || "all",
      page: params.get("page") || "",
      pageSize: params.get("pageSize") || ""
    });
  });
}

export async function POST(request) {
  return systemWrite(request, async (actor, body) => {
    assertOnlyKeys(body, ["name"], "创建门户请求");
    const result = await createSystemPortal(actor, { name: body.name, idempotencyKey: request.headers.get("idempotency-key") });
    return { status: result.created ? 201 : 200, body: result };
  });
}
