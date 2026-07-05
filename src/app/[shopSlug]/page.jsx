import { notFound } from "next/navigation";
import { requireActiveShopBySlug } from "@/lib/shop";
import ShopApp from "./shop-app";

export default async function ShopSlugPage({ params }) {
  const { shopSlug } = await params;
  let shop;
  try {
    shop = await requireActiveShopBySlug(shopSlug);
  } catch (error) {
    if (error?.status === 404) notFound();
    throw error;
  }
  return <ShopApp shopSlug={shop.slug} shopName={shop.name} shopId={shop.id} />;
}
