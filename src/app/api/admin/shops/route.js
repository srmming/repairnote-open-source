import { authErrorResponse, hashPassword, PAGE_PERMISSION_KEYS, requireSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizeShopSlug, seedShopDefaults } from "@/lib/shop";

export async function GET() {
  try {
    await requireSuperAdmin();
    return Response.json({ shops: await shopList() });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request) {
  try {
    await requireSuperAdmin();
    const body = await request.json();
    const action = body.action || "createShop";
    if (action === "createShop") return Response.json({ shop: await createShop(body), shops: await shopList() });
    if (action === "toggleShop") return Response.json({ shop: await toggleShop(body), shops: await shopList() });
    if (action === "createAdmin") return Response.json({ staff: await createShopAdmin(body), shops: await shopList() });
    if (action === "resetPassword") return Response.json({ staff: await resetShopPassword(body), shops: await shopList() });
    return Response.json({ error: "未知操作" }, { status: 400 });
  } catch (error) {
    return authErrorResponse(error);
  }
}

async function createShop(body) {
  const slug = normalizeShopSlug(body.slug);
  const name = String(body.name || "").trim();
  if (!slug || !name) throwBadRequest("门店 slug 和名称必填");
  return prisma.$transaction(async (tx) => {
    const shop = await tx.shop.create({ data: { slug, name, active: true } });
    await seedShopDefaults(tx, shop.id);
    return shop;
  });
}

async function toggleShop(body) {
  const shopId = String(body.shopId || "").trim();
  if (!shopId) throwBadRequest("缺少门店");
  return prisma.shop.update({ where: { id: shopId }, data: { active: Boolean(body.active) } });
}

async function createShopAdmin(body) {
  const shopId = String(body.shopId || "").trim();
  const username = String(body.username || "").trim();
  const name = String(body.name || username || "").trim();
  const password = String(body.password || "");
  if (!shopId || !username || !password) throwBadRequest("门店、账号和密码必填");
  await ensureShop(shopId);
  const existing = await prisma.staff.findUnique({ where: { shopId_username: { shopId, username } } });
  if (existing) {
    const error = new Error("该门店已有这个账号");
    error.status = 409;
    throw error;
  }
  return prisma.staff.create({
    data: {
      shopId,
      name,
      username,
      email: String(body.email || ""),
      passwordHash: hashPassword(password),
      isAdmin: true,
      pagePermissions: PAGE_PERMISSION_KEYS
    },
    select: staffSelect()
  });
}

async function resetShopPassword(body) {
  const staffId = String(body.staffId || "").trim();
  const password = String(body.password || "");
  if (!staffId || !password) throwBadRequest("账号和新密码必填");
  const existing = await prisma.staff.findUnique({ where: { id: staffId } });
  if (!existing) throwNotFound("没有找到账号");
  return prisma.staff.update({
    where: { id: staffId },
    data: { passwordHash: hashPassword(password), sessionTokenHash: null, sessionExpiresAt: null },
    select: staffSelect()
  });
}

async function shopList() {
  return prisma.shop.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      staff: {
        where: { isAdmin: true },
        orderBy: { createdAt: "asc" },
        select: staffSelect()
      },
      _count: { select: { clients: true, repairs: true, staff: true } }
    }
  });
}

async function ensureShop(shopId) {
  const shop = await prisma.shop.findUnique({ where: { id: shopId }, select: { id: true } });
  if (!shop) throwNotFound("没有找到门店");
}

function staffSelect() {
  return { id: true, shopId: true, name: true, username: true, email: true, isAdmin: true, createdAt: true, updatedAt: true };
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
