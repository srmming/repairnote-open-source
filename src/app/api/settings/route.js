import { authErrorResponse, requirePageAccess } from "@/lib/auth";
import { getRevisionPatch } from "@/lib/data-store";
import { prisma } from "@/lib/prisma";
import { defaultSettings } from "@/lib/seed-data";

export async function GET() {
  try {
    const staff = await requirePageAccess("settings");
    const settings = await prisma.setting.findUnique({ where: { shopId_key: { shopId: staff.shopId, key: "main" } } });
    return Response.json({
      settings: { ...defaultSettings, ...(settings?.value || {}) },
      _settingsUpdatedAt: settings?.updatedAt?.toISOString?.() || ""
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request) {
  try {
    const staff = await requirePageAccess("settings");
    const body = await request.json();
    const payload = { ...defaultSettings, ...(body || {}) };
    const saved = await prisma.setting.upsert({
      where: { shopId_key: { shopId: staff.shopId, key: "main" } },
      create: { shopId: staff.shopId, key: "main", value: payload },
      update: { value: payload }
    });
    return Response.json({
      settings: { ...defaultSettings, ...(saved.value || {}) },
      _settingsUpdatedAt: saved.updatedAt?.toISOString?.() || "",
      _revisionPatch: await getRevisionPatch({ keys: ["settings"], shopId: staff.shopId })
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
