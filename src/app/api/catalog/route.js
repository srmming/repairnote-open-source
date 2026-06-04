import { collectionRoute } from "@/lib/api-crud";

const route = collectionRoute("catalog");
export const GET = route.GET;
export const POST = route.POST;
