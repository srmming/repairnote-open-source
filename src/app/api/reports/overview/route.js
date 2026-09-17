import { errorResponse, requestIdOf } from "@/lib/api-errors";
import { portalJson, requirePortalContext } from "@/lib/portal-context";
import { reportOverview } from "@/lib/report-store";

export async function GET(request) {
  const requestId = requestIdOf(request);
  try {
    const ctx = await requirePortalContext(request, { anyOf: ["reports"] });
    const params = new URL(request.url).searchParams;
    const range = getRange(params);
    const result = await reportOverview(ctx, {
      start: range.start,
      end: range.end,
      granularity: params.get("granularity") || "day"
    });
    return portalJson(ctx, { ...result, range: { preset: range.preset, ...result.range } });
  } catch (error) {
    return errorResponse(error, { requestId });
  }
}

function getRange(params) {
  const today = new Date();
  const preset = params.get("preset") || "month";
  // 显式带 start/end 参数（哪怕为空串，表示“不限日期”）时按 custom 处理，只有完全不带才用预设。
  if (params.has("start") || params.has("end")) {
    return { preset: "custom", start: params.get("start") || "", end: params.get("end") || "" };
  }
  const start = new Date(today);
  if (preset === "today") {
    return { preset, start: dateOnly(today), end: dateOnly(today) };
  }
  if (preset === "week") {
    const day = today.getDay() || 7;
    start.setDate(today.getDate() - day + 1);
    return { preset, start: dateOnly(start), end: dateOnly(today) };
  }
  start.setDate(1);
  return { preset: "month", start: dateOnly(start), end: dateOnly(today) };
}

function dateOnly(date) {
  const pad = (num) => String(num).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
