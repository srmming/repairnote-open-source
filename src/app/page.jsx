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
    <main className={styles.page}>
      <aside className={styles.hero} aria-hidden="false">
        <div className={styles.heroContent}>
          <p className={styles.heroBrand}>{APP_DISPLAY_NAME}</p>
          <h1 className={styles.heroTitle}>多门店维修管理系统</h1>
          <p className={styles.heroDesc}>
            输入门店名称即可进入专属工作台，每家门店数据独立、安全隔离。
          </p>
          <ul className={styles.heroFeatures}>
            <li className={styles.heroFeature}>
              <span className={styles.heroFeatureIcon}>✓</span>
              独立门店空间，互不干扰
            </li>
            <li className={styles.heroFeature}>
              <span className={styles.heroFeatureIcon}>✓</span>
              开单、客户、报表一站管理
            </li>
            <li className={styles.heroFeature}>
              <span className={styles.heroFeatureIcon}>✓</span>
              数据安全隔离，放心使用
            </li>
          </ul>
        </div>
        <footer className={styles.footer}>
          © {new Date().getFullYear()} {APP_DISPLAY_NAME}
          <span className={styles.footerDot} />
          每家门店数据独立、安全隔离
        </footer>
      </aside>

      <section className={styles.panel}>
        <div
          className={`${styles.card} ${state === "leaving" ? styles.cardLeaving : ""}`}
        >
          <div className={styles.brandBlock}>
            <div className={styles.brandRow}>
              <div className={styles.monogram} aria-hidden>
                rm
              </div>
              <div>
                <h1 className={styles.brand}>{APP_DISPLAY_NAME}</h1>
                <p className={styles.tagline}>多门店维修管理系统</p>
              </div>
            </div>
          </div>

          <div className={styles.divider} aria-hidden />

          <label htmlFor="shop-slug" className={styles.label}>
            输入你的门店名称
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
                    : "进入门店 →"}
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
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        <footer className={styles.panelFooter}>
          © {new Date().getFullYear()} {APP_DISPLAY_NAME}
          <span className={styles.footerDot} />
          每家门店数据独立、安全隔离
        </footer>
      </section>
    </main>
  );
}
