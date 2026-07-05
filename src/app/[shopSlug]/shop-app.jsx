"use client";

import AppPage from "@/components/repairnote-app";

export default function ShopApp({ shopSlug, shopName, shopId }) {
  return <AppPage shopSlug={shopSlug} shopName={shopName} shopId={shopId} />;
}
