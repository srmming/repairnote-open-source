import { errorResponse, requestIdOf } from "@/lib/api-errors";
import { portalJson, requirePortalContext } from "@/lib/portal-context";
import { ensureDailyAutoBackup } from "@/lib/backup-store";
import { getBootstrapData } from "@/lib/data-store";
import { serializeMemberUser } from "@/lib/portal-store";
import { prisma } from "@/lib/prisma";

// 轻量引导：只返回当前门户的目录 / 技师 / 设置 / 成员等小数据 + 总量计数 + 当前成员权限 + portalId / _revision。
export async function GET(request) {
  const requestId = requestIdOf(request);
  try {
    const ctx = await requirePortalContext(request, { member: true });
    const [data, repairCount, clientCount] = await Promise.all([
      getBootstrapData(ctx),
      prisma.repair.count({ where: { portalId: ctx.portalId } }),
      prisma.client.count({ where: { portalId: ctx.portalId } })
    ]);
    // 每日自动备份挂在“当天第一次打开系统”上：可靠等待，失败只记录日志、不影响登录，下次打开允许重试。
    try {
      await ensureDailyAutoBackup(ctx);
    } catch (error) {
      console.warn(`[${requestId}] 门户 ${ctx.portalId} 每日自动备份失败：`, error?.message || error);
    }
    const currentUser = serializeMemberUser(ctx.staff, ctx.member);
    const users = ctx.isAdmin ? data.users : [currentUser];
    return portalJson(ctx, {
      ...data,
      users,
      currentUser,
      clients: undefined,
      repairs: undefined,
      counts: { repairs: repairCount, clients: clientCount }
    });
  } catch (error) {
    return errorResponse(error, { requestId });
  }
}
