import { prisma } from "@/lib/prisma";

export const DEFAULT_SHOP_ID = "default-shop";
export const DEFAULT_SHOP_SLUG = "default";

export async function ensureDefaultShop() {
  return prisma.shop.upsert({
    where: { slug: DEFAULT_SHOP_SLUG },
    create: { id: DEFAULT_SHOP_ID, slug: DEFAULT_SHOP_SLUG, name: "默认门店", active: true },
    update: {}
  });
}

export function shopSlugFromRequest(request) {
  const headerSlug = cleanSlug(request?.headers?.get("x-repairnote-shop-slug"));
  if (headerSlug) return headerSlug;
  const referer = request?.headers?.get("referer");
  if (!referer) return DEFAULT_SHOP_SLUG;
  try {
    return cleanSlug(new URL(referer).pathname.split("/").filter(Boolean)[0]) || DEFAULT_SHOP_SLUG;
  } catch {
    return DEFAULT_SHOP_SLUG;
  }
}

export async function requireActiveShopBySlug(slug) {
  const normalized = cleanSlug(slug) || DEFAULT_SHOP_SLUG;
  const shop = await prisma.shop.findUnique({ where: { slug: normalized } });
  if (!shop || !shop.active) {
    const error = new Error("门店不存在或已停用");
    error.status = 404;
    throw error;
  }
  return shop;
}

function cleanSlug(value) {
  const slug = String(value || "").trim().toLowerCase();
  return /^[a-z0-9][a-z0-9-]{0,62}$/.test(slug) ? slug : "";
}
