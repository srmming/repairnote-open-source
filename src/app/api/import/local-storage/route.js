import { authErrorResponse, requireStaff } from "@/lib/auth";
import { getBootstrapData, syncFromClientData } from "@/lib/data-store";
import { validateBusinessDataShape, withoutImportedUsers } from "@/lib/data-validation";

export async function POST(request) {
  try {
    const staff = await requireStaff();
    if (!staff.isAdmin) return Response.json({ error: "只有管理员可导入旧数据" }, { status: 403 });
    const data = await request.json();
    await syncFromClientData(withoutImportedUsers(validateBusinessDataShape(data, "旧 localStorage 数据")));
    const imported = await getBootstrapData();
    return Response.json({
      ok: true,
      counts: {
        clients: imported.clients.length,
        brands: imported.brands.length,
        models: imported.models.length,
        services: imported.services.length,
        parts: imported.parts.length,
        attributes: imported.attributes.length,
        repairs: imported.repairs.length
      },
      data: imported
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
