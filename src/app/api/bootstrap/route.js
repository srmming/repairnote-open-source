import { authErrorResponse, requireAnyPageAccess } from "@/lib/auth";
import { ensureDailyAutoBackup } from "@/lib/backup-store";
import { getBootstrapData } from "@/lib/data-store";
import { prisma } from "@/lib/prisma";

// 轻量引导：只返回目录/技师/设置/员工等小数据 + 总量计数。
// 维修单与客户不再整包下发，列表、统计、搜索一律走各自的服务端接口；
// 写操作走各资源接口（/api/repairs/[id]、/api/clients、/api/catalog…），本路由不再有整包 PUT。
export async function GET() {
  try {
    const staff = await requireAnyPageAccess();
    const [data, repairCount, clientCount] = await Promise.all([
      getBootstrapData({ includeRepairs: false, includeClients: false }),
      prisma.repair.count(),
      prisma.client.count()
    ]);
    // 每日自动备份挂在“当天第一次打开系统”上（有当日备份则直接跳过），失败不影响登录。
    ensureDailyAutoBackup({ staff }).catch((error) => {
      console.warn("Daily auto backup skipped on bootstrap:", error?.message || error);
    });
    const payload = staff.isAdmin ? data : { ...data, users: [{ ...staff }] };
    return Response.json({
      ...payload,
      clients: undefined,
      repairs: undefined,
      counts: { repairs: repairCount, clients: clientCount }
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
