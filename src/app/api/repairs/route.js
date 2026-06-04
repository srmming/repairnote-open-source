import { collectionRoute } from "@/lib/api-crud";

const route = collectionRoute("repairs");
export const GET = route.GET;
export const POST = route.POST;
