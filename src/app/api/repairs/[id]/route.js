import { authErrorResponse, requireAnyPageAccess } from "@/lib/auth";
import { deleteRepairRecord, getRepairById, saveRepairRecord } from "@/lib/data-store";

export async function GET(_request, { params }) {
  try {
    await requireAnyPageAccess(["repairs", "warranties"]);
    const { id } = await params;
    const repair = await getRepairById(id);
    if (!repair) return Response.json({ error: "没有找到这张订单" }, { status: 404 });
    return Response.json({ repair });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function PUT(request, { params }) {
  try {
    const staff = await requireAnyPageAccess(["repairs", "warranties"]);
    const { id } = await params;
    const body = await request.json();
    const repair = { ...(body.repair || {}), id };
    return Response.json(await saveRepairRecord({ repair, client: body.client || null, actor: { isAdmin: staff.isAdmin } }));
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function DELETE(_request, { params }) {
  try {
    await requireAnyPageAccess(["repairs", "warranties"]);
    const { id } = await params;
    return Response.json(await deleteRepairRecord(id));
  } catch (error) {
    return authErrorResponse(error);
  }
}
