import { prisma } from "@/lib/prisma";

const attempts = new Map();
const WINDOW_MS = 60 * 1000;
const MAX_ATTEMPTS = 60;

export async function GET(request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  if (tooManyAttempts(ip)) {
    return Response.json({ error: "请求过于频繁，请稍后再试" }, { status: 429 });
  }
  recordAttempt(ip);

  const slug = cleanSlug(new URL(request.url).searchParams.get("slug"));
  if (!slug) return Response.json(notFound());

  const shop = await prisma.shop.findUnique({
    where: { slug },
    select: { name: true, active: true }
  });
  if (!shop) return Response.json(notFound());
  return Response.json({ exists: true, name: shop.name, active: shop.active });
}

function cleanSlug(value) {
  const slug = String(value || "").trim().toLowerCase();
  return /^[a-z0-9][a-z0-9-]{0,62}$/.test(slug) ? slug : "";
}

function notFound() {
  return { exists: false, name: null, active: null };
}

function tooManyAttempts(key) {
  const item = attempts.get(key);
  if (!item) return false;
  if (item.resetAt <= Date.now()) {
    attempts.delete(key);
    return false;
  }
  return item.count >= MAX_ATTEMPTS;
}

function recordAttempt(key) {
  const now = Date.now();
  const item = attempts.get(key);
  if (!item || item.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  item.count += 1;
}
