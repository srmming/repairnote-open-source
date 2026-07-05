"use client";

// 多门店入口页（T4）：输入店名 → 校验 → 跳转 /{shopSlug}
// 店名校验走公共接口 GET /api/shops/lookup?slug=<slug>

import { useCallback, useEffect, useRef, useState } from "react";

const APP_DISPLAY_NAME = "repuestomovil";
const RECENT_KEY = "repairnote_recent_shops";

function normalizeSlug(raw) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

async function lookupShop(slug) {
  const res = await fetch(`/api/shops/lookup?slug=${encodeURIComponent(slug)}`);
  if (!res.ok) throw new Error("lookup failed");
  return res.json();
}

export default function ShopEntryPage() {
  const [value, setValue] = useState("");
  const [state, setState] = useState("idle"); // idle | checking | error | leaving
  const [errorMsg, setErrorMsg] = useState("");
  const [recentShops, setRecentShops] = useState([]);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    try {
      const saved = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
      if (Array.isArray(saved)) setRecentShops(saved.slice(0, 3));
    } catch {}
  }, []);

  const go = useCallback(
    async (rawSlug) => {
      const slug = normalizeSlug(rawSlug);
      if (!slug) {
        setState("error");
        setErrorMsg("请输入门店名称 / Introduce el nombre de la tienda");
        return;
      }
      setState("checking");
      setErrorMsg("");
      try {
        const shop = await lookupShop(slug);
        if (!shop.exists) {
          setState("error");
          setErrorMsg(`找不到门店「${slug}」，请检查拼写`);
          return;
        }
        if (shop.active === false) {
          setState("error");
          setErrorMsg("该门店已停用，请联系管理员");
          return;
        }
        const next = [slug, ...recentShops.filter((s) => s !== slug)].slice(0, 3);
        try {
          localStorage.setItem(RECENT_KEY, JSON.stringify(next));
        } catch {}
        setState("leaving");
        window.location.assign(`/${slug}`);
      } catch {
        setState("error");
        setErrorMsg("网络异常，请稍后再试");
      }
    },
    [recentShops]
  );

  const busy = state === "checking" || state === "leaving";

  return (
    <main style={styles.page}>
      <div
        aria-hidden
        style={{
          ...styles.glow,
          top: "-160px",
          left: "-120px",
          background:
            "radial-gradient(circle, rgba(56,132,255,0.28), transparent 65%)",
        }}
      />
      <div
        aria-hidden
        style={{
          ...styles.glow,
          bottom: "-180px",
          right: "-140px",
          background:
            "radial-gradient(circle, rgba(255,122,61,0.22), transparent 65%)",
        }}
      />

      <section style={{ ...styles.card, opacity: state === "leaving" ? 0.4 : 1 }}>
        <div style={styles.logoRow}>
          <div style={styles.logoMark}>🔧</div>
          <div>
            <h1 style={styles.brand}>{APP_DISPLAY_NAME}</h1>
            <p style={styles.tagline}>多门店维修管理系统</p>
          </div>
        </div>

        <label htmlFor="shop-slug" style={styles.label}>
          输入你的门店名称
        </label>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            go(value);
          }}
          style={styles.form}
        >
          <div
            style={{
              ...styles.inputWrap,
              borderColor:
                state === "error" ? "#e5484d" : "rgba(255,255,255,0.14)",
            }}
          >
            <span style={styles.inputPrefix}>/</span>
            <input
              id="shop-slug"
              ref={inputRef}
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                if (state === "error") setState("idle");
              }}
              placeholder="tienda1"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              style={styles.input}
              disabled={busy}
            />
          </div>

          <button
            type="submit"
            style={{ ...styles.button, opacity: busy ? 0.7 : 1 }}
            disabled={busy}
          >
            {state === "checking"
              ? "查找门店…"
              : state === "leaving"
              ? "正在进入…"
              : "进入门店 →"}
          </button>
        </form>

        <p
          role="alert"
          style={{
            ...styles.error,
            visibility: state === "error" ? "visible" : "hidden",
          }}
        >
          {errorMsg || " "}
        </p>

        {recentShops.length > 0 && (
          <div style={styles.recent}>
            <span style={styles.recentLabel}>最近进入：</span>
            {recentShops.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => go(s)}
                style={styles.recentChip}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </section>

      <footer style={styles.footer}>
        © {new Date().getFullYear()} {APP_DISPLAY_NAME} · 每家门店数据独立、安全隔离
      </footer>
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100dvh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "28px",
    padding: "24px",
    background: "#0b0f17",
    color: "#e8ecf4",
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC', 'Noto Sans SC', sans-serif",
    position: "relative",
    overflow: "hidden",
  },
  glow: {
    position: "absolute",
    width: "480px",
    height: "480px",
    filter: "blur(20px)",
    pointerEvents: "none",
  },
  card: {
    width: "min(420px, 100%)",
    background: "rgba(255,255,255,0.045)",
    border: "1px solid rgba(255,255,255,0.09)",
    borderRadius: "20px",
    padding: "36px 32px 28px",
    backdropFilter: "blur(18px)",
    WebkitBackdropFilter: "blur(18px)",
    boxShadow: "0 24px 64px rgba(0,0,0,0.42)",
    transition: "opacity .3s ease",
    position: "relative",
    zIndex: 1,
  },
  logoRow: {
    display: "flex",
    alignItems: "center",
    gap: "14px",
    marginBottom: "30px",
  },
  logoMark: {
    width: "48px",
    height: "48px",
    borderRadius: "14px",
    display: "grid",
    placeItems: "center",
    fontSize: "22px",
    background: "linear-gradient(135deg, #2f6bff 0%, #6d3bff 100%)",
    boxShadow: "0 8px 24px rgba(47,107,255,0.35)",
  },
  brand: { margin: 0, fontSize: "20px", fontWeight: 700, letterSpacing: "0.2px" },
  tagline: { margin: "2px 0 0", fontSize: "13px", color: "rgba(232,236,244,0.55)" },
  label: {
    display: "block",
    fontSize: "14px",
    fontWeight: 600,
    marginBottom: "10px",
    color: "rgba(232,236,244,0.85)",
  },
  form: { display: "flex", flexDirection: "column", gap: "12px" },
  inputWrap: {
    display: "flex",
    alignItems: "center",
    background: "rgba(0,0,0,0.35)",
    border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: "12px",
    padding: "0 14px",
    transition: "border-color .15s ease",
  },
  inputPrefix: {
    fontSize: "15px",
    color: "rgba(232,236,244,0.4)",
    userSelect: "none",
  },
  input: {
    flex: 1,
    border: "none",
    outline: "none",
    background: "transparent",
    color: "#e8ecf4",
    fontSize: "16px",
    padding: "14px 6px",
    caretColor: "#4f8cff",
  },
  button: {
    border: "none",
    borderRadius: "12px",
    padding: "14px",
    fontSize: "15px",
    fontWeight: 700,
    color: "#fff",
    cursor: "pointer",
    background: "linear-gradient(135deg, #2f6bff 0%, #6d3bff 100%)",
    boxShadow: "0 10px 28px rgba(47,107,255,0.35)",
    transition: "transform .12s ease, opacity .2s ease",
  },
  error: { minHeight: "20px", margin: "10px 2px 0", fontSize: "13px", color: "#ff7b81" },
  recent: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "8px",
    marginTop: "14px",
    paddingTop: "16px",
    borderTop: "1px solid rgba(255,255,255,0.07)",
  },
  recentLabel: { fontSize: "12px", color: "rgba(232,236,244,0.45)" },
  recentChip: {
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.05)",
    color: "#cfd8ea",
    borderRadius: "999px",
    padding: "5px 14px",
    fontSize: "13px",
    cursor: "pointer",
  },
  footer: {
    fontSize: "12px",
    color: "rgba(232,236,244,0.35)",
    position: "relative",
    zIndex: 1,
  },
};
