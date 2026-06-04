import { authErrorResponse, requirePageAccess } from "@/lib/auth";
import { getRevisionPatch } from "@/lib/data-store";
import { prisma } from "@/lib/prisma";
import { defaultSettings } from "@/lib/seed-data";

export async function GET() {
  try {
    await requirePageAccess("settings");
    const settings = await prisma.setting.findUnique({ where: { id: "main" } });
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
    await requirePageAccess("settings");
    const body = await request.json();
    const payload = { ...defaultSettings, ...(body || {}) };
    const saved = await prisma.setting.upsert({
      where: { id: "main" },
      create: { id: "main", value: payload },
      update: { value: payload }
    });
    return Response.json({
      settings: { ...defaultSettings, ...(saved.value || {}) },
      _settingsUpdatedAt: saved.updatedAt?.toISOString?.() || "",
      _revisionPatch: await getRevisionPatch(["settings"])
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
