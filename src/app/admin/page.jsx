"use client";

import { useEffect, useState } from "react";

export default function AdminPage() {
  const [user, setUser] = useState(null);
  const [shops, setShops] = useState([]);
  const [message, setMessage] = useState("");
  const [login, setLogin] = useState({ username: "", password: "" });
  const [shopForm, setShopForm] = useState({ slug: "", name: "" });
  const [adminForm, setAdminForm] = useState({ shopId: "", name: "", username: "", password: "" });
  const [resetForm, setResetForm] = useState({ staffId: "", password: "" });

  useEffect(() => {
    apiGet("/api/admin/auth/me").then((data) => {
      setUser(data.user);
      if (data.user) refreshShops();
    }).catch((error) => setMessage(error.message || "加载失败"));
  }, []);

  async function refreshShops() {
    const data = await apiGet("/api/admin/shops");
    setShops(data.shops || []);
  }

  async function submitLogin(event) {
    event.preventDefault();
    await runAction(async () => {
      const data = await apiPost("/api/admin/auth/login", login);
      setUser(data.user);
      await refreshShops();
    });
  }

  async function createShop(event) {
    event.preventDefault();
    await runAction(async () => {
      const data = await apiPost("/api/admin/shops", { action: "createShop", ...shopForm });
      setShops(data.shops || []);
      setShopForm({ slug: "", name: "" });
      setMessage("门店已创建");
    });
  }

  async function toggleShop(shop) {
    await runAction(async () => {
      const data = await apiPost("/api/admin/shops", { action: "toggleShop", shopId: shop.id, active: !shop.active });
      setShops(data.shops || []);
    });
  }

  async function createAdmin(event) {
    event.preventDefault();
    await runAction(async () => {
      const data = await apiPost("/api/admin/shops", { action: "createAdmin", ...adminForm });
      setShops(data.shops || []);
      setAdminForm({ shopId: adminForm.shopId, name: "", username: "", password: "" });
      setMessage("管理员账号已创建");
    });
  }

  async function resetPassword(event) {
    event.preventDefault();
    await runAction(async () => {
      const data = await apiPost("/api/admin/shops", { action: "resetPassword", ...resetForm });
      setShops(data.shops || []);
      setResetForm({ staffId: "", password: "" });
      setMessage("密码已重置");
    });
  }

  async function runAction(action) {
    try {
      setMessage("");
      await action();
    } catch (error) {
      setMessage(error.message || "操作失败");
    }
  }

  if (!user) {
    return (
      <main style={styles.page}>
        <form style={styles.panel} onSubmit={submitLogin}>
          <h1 style={styles.title}>RepairNOTE Admin</h1>
          <input style={styles.input} placeholder="超级管理员账号" value={login.username} onChange={(event) => setLogin({ ...login, username: event.target.value })} />
          <input style={styles.input} placeholder="密码" type="password" value={login.password} onChange={(event) => setLogin({ ...login, password: event.target.value })} />
          <button style={styles.primary}>登录</button>
        </form>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <section style={styles.header}>
        <div>
          <h1 style={styles.title}>RepairNOTE Admin</h1>
          <p style={styles.muted}>超级管理员：{user.username}</p>
        </div>
        <button style={styles.button} onClick={async () => { await apiPost("/api/admin/auth/logout", {}); setUser(null); }}>退出</button>
      </section>

      {message ? <p style={styles.notice}>{message}</p> : null}

      <section style={styles.grid}>
        <form style={styles.panel} onSubmit={createShop}>
          <h2 style={styles.subtitle}>创建门店</h2>
          <input style={styles.input} placeholder="slug" value={shopForm.slug} onChange={(event) => setShopForm({ ...shopForm, slug: event.target.value })} />
          <input style={styles.input} placeholder="门店名称" value={shopForm.name} onChange={(event) => setShopForm({ ...shopForm, name: event.target.value })} />
          <button style={styles.primary}>创建</button>
        </form>

        <form style={styles.panel} onSubmit={createAdmin}>
          <h2 style={styles.subtitle}>创建门店管理员</h2>
          <select style={styles.input} value={adminForm.shopId} onChange={(event) => setAdminForm({ ...adminForm, shopId: event.target.value })}>
            <option value="">选择门店</option>
            {shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name} / {shop.slug}</option>)}
          </select>
          <input style={styles.input} placeholder="姓名" value={adminForm.name} onChange={(event) => setAdminForm({ ...adminForm, name: event.target.value })} />
          <input style={styles.input} placeholder="账号" value={adminForm.username} onChange={(event) => setAdminForm({ ...adminForm, username: event.target.value })} />
          <input style={styles.input} placeholder="密码" type="password" value={adminForm.password} onChange={(event) => setAdminForm({ ...adminForm, password: event.target.value })} />
          <button style={styles.primary}>创建账号</button>
        </form>

        <form style={styles.panel} onSubmit={resetPassword}>
          <h2 style={styles.subtitle}>重置密码</h2>
          <select style={styles.input} value={resetForm.staffId} onChange={(event) => setResetForm({ ...resetForm, staffId: event.target.value })}>
            <option value="">选择管理员账号</option>
            {shops.flatMap((shop) => (shop.staff || []).map((staff) => <option key={staff.id} value={staff.id}>{shop.slug} / {staff.username}</option>))}
          </select>
          <input style={styles.input} placeholder="新密码" type="password" value={resetForm.password} onChange={(event) => setResetForm({ ...resetForm, password: event.target.value })} />
          <button style={styles.primary}>重置</button>
        </form>
      </section>

      <section style={styles.panel}>
        <h2 style={styles.subtitle}>门店列表</h2>
        <div style={styles.table}>
          {shops.map((shop) => (
            <div key={shop.id} style={styles.row}>
              <div>
                <strong>{shop.name}</strong>
                <div style={styles.muted}>/{shop.slug} · {shop.active ? "启用" : "停用"} · 员工 {shop._count?.staff || 0}</div>
              </div>
              <div style={styles.admins}>{(shop.staff || []).map((staff) => staff.username).join(", ") || "无管理员"}</div>
              <button style={styles.button} onClick={() => toggleShop(shop)}>{shop.active ? "停用" : "启用"}</button>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

async function apiGet(url) {
  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "请求失败");
  return data;
}

async function apiPost(url, body) {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "请求失败");
  return data;
}

const styles = {
  page: { minHeight: "100vh", padding: 32, background: "#f6f7f8", color: "#172026", fontFamily: "system-ui, sans-serif" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16, marginBottom: 16 },
  panel: { background: "#fff", border: "1px solid #d9dee3", borderRadius: 8, padding: 18, boxShadow: "0 1px 2px rgba(0,0,0,.04)" },
  title: { margin: 0, fontSize: 28 },
  subtitle: { margin: "0 0 12px", fontSize: 18 },
  muted: { color: "#65717b", fontSize: 13 },
  notice: { background: "#e8f5ee", border: "1px solid #bfe4ce", borderRadius: 8, padding: 10 },
  input: { display: "block", width: "100%", boxSizing: "border-box", marginBottom: 10, padding: "10px 12px", borderRadius: 6, border: "1px solid #c8d0d8", fontSize: 14 },
  primary: { width: "100%", padding: "10px 12px", border: 0, borderRadius: 6, background: "#14532d", color: "#fff", fontWeight: 700 },
  button: { padding: "8px 12px", borderRadius: 6, border: "1px solid #b9c2cc", background: "#fff" },
  table: { display: "grid", gap: 8 },
  row: { display: "grid", gridTemplateColumns: "1.2fr 1fr auto", gap: 12, alignItems: "center", padding: 12, border: "1px solid #e1e5e9", borderRadius: 6 },
  admins: { color: "#334155", fontSize: 14 }
};
