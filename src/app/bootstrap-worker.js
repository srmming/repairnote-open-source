import { normalizeData } from "@/lib/normalize-client";

self.onmessage = async (event) => {
  const { type, epoch } = event.data || {};
  if (type !== "fetch") return;
  try {
    const response = await fetch("/api/bootstrap");
    const raw = await response.json().catch(() => ({}));
    if (!response.ok) {
      self.postMessage({ type: "error", epoch, message: raw.error || "请求失败" });
      return;
    }
    const normalized = normalizeData(raw);
    self.postMessage({ type: "ok", epoch, data: normalized });
  } catch (error) {
    self.postMessage({ type: "error", epoch, message: error?.message || "请求失败" });
  }
};
