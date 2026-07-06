"use client";

// 多门店入口页（T4）：输入店名 → 校验 → 跳转 /{shopSlug}
// 店名校验走公共接口 GET /api/shops/lookup?slug=<slug>

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./page.module.css";

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
  const inFlightRef = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
    try {
      const saved = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
      if (Array.isArray(saved)) setRecentShops(saved.slice(0, 3));
    } catch {}
  }, []);

  const go = useCallback(
    async (rawSlug) => {
      if (inFlightRef.current) return;

      const slug = normalizeSlug(rawSlug);
      if (!slug) {
        setState("error");
        setErrorMsg("请输入门店名称 / Introduce el nombre de la tienda");
        return;
      }
      inFlightRef.current = true;
      setState("checking");
      setErrorMsg("");
      try {
        const shop = await lookupShop(slug);
        if (!shop.exists) {
          inFlightRef.current = false;
          setState("error");
          setErrorMsg(`找不到门店「${slug}」，请检查拼写`);
          return;
        }
        if (shop.active === false) {
          inFlightRef.current = false;
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
        inFlightRef.current = false;
        setState("error");
        setErrorMsg("网络异常，请稍后再试");
      }
    },
    [recentShops]
  );

  const busy = state === "checking" || state === "leaving";

  return (
    <main className={styles.page}>
      <div
        className={`${styles.main} ${state === "leaving" ? styles.mainLeaving : ""}`}
      >
        <p className={styles.brand}>{APP_DISPLAY_NAME}</p>

        <label htmlFor="shop-slug" className={styles.label}>
          输入门店名称
        </label>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            go(value);
          }}
          className={styles.form}
        >
          <div
            className={`${styles.inputWrap} ${state === "error" ? styles.inputWrapError : ""}`}
          >
            <span className={styles.inputPrefix}>/</span>
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
              className={styles.input}
              disabled={busy}
            />
          </div>

          <button type="submit" className={styles.button} disabled={busy}>
            <span className={styles.buttonInner}>
              {state === "checking" && <span className={styles.spinner} />}
              {state === "checking"
                ? "查找门店…"
                : state === "leaving"
                  ? "正在进入…"
                  : "进入"}
            </span>
          </button>
        </form>

        <p
          role="alert"
          className={`${styles.error} ${state !== "error" ? styles.errorHidden : ""}`}
        >
          {errorMsg || " "}
        </p>

        {recentShops.length > 0 && (
          <div className={styles.recent}>
            <span className={styles.recentLabel}>最近进入：</span>
            {recentShops.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => go(s)}
                className={styles.recentChip}
                disabled={busy}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
