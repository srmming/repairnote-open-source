import { prisma } from "@/lib/prisma";
import { defaultSettings, seedData } from "@/lib/seed-data";

export const DEFAULT_SHOP_ID = "default-shop";
export const DEFAULT_SHOP_SLUG = "default";

export async function ensureDefaultShop() {
  return prisma.shop.upsert({
    where: { slug: DEFAULT_SHOP_SLUG },
    create: { id: DEFAULT_SHOP_ID, slug: DEFAULT_SHOP_SLUG, name: "默认门店", active: true },
    update: {}
  });
}

export async function seedShopDefaults(tx, shopId) {
  const data = seedData();
  await tx.setting.upsert({
    where: { shopId_key: { shopId, key: "main" } },
    create: { shopId, key: "main", value: defaultSettings },
    update: {}
  });
  await tx.brand.createMany({ data: data.brands.map((row) => ({ ...row, shopId })) });
  await tx.model.createMany({ data: data.models.map((row) => ({ ...row, shopId })) });
  await tx.service.createMany({ data: data.services.map((row) => ({ ...row, shopId, category: row.category || "" })) });
  await tx.part.createMany({ data: data.parts.map((row) => ({ ...row, shopId, category: row.category || "" })) });
  await tx.technician.createMany({ data: data.technicians.map((row) => ({ ...row, shopId })) });
  const groupNames = [...new Set(data.attributes.map((row) => row.groupName || "其他"))];
  for (const groupName of groupNames) {
    await tx.attributeGroup.create({
      data: {
        shopId,
        name: groupName,
        attributes: {
          create: data.attributes
            .filter((row) => (row.groupName || "其他") === groupName)
            .map((row) => ({
              id: row.id,
              shopId,
              defaultName: row.defaultName || "",
              zh: row.zh || "",
              es: row.es || "",
              sortOrder: row.sortOrder || 0
            }))
        }
      }
    });
  }
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

export function normalizeShopSlug(value) {
  return cleanSlug(value);
}
