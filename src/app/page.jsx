import { redirect } from "next/navigation";
import { DEFAULT_SHOP_SLUG } from "@/lib/shop";

export default function RootPage() {
  redirect(`/${DEFAULT_SHOP_SLUG}`);
}
