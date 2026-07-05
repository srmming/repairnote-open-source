import { authErrorResponse, requirePageAccess } from "@/lib/auth";
import { backupJsonFileName, backupJsonPayload, backupZipFileName, zipResponse } from "@/lib/backup-zip";
import { getBootstrapData } from "@/lib/data-store";

export async function GET() {
  try {
    const staff = await requirePageAccess("backup");
    const data = await getBootstrapData({ shopId: staff.shopId, includeRepairItems: true });
    const now = new Date();
    return zipResponse({
      json: backupJsonPayload(data),
      zipName: backupZipFileName(now),
      jsonName: backupJsonFileName(now)
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
