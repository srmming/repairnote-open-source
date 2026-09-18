"use client";

import { Building2, LogOut, RefreshCw, Settings2 } from "lucide-react";
import { Button, Card, CardContent, Empty, Select } from "@/components/ui";

const TEXT = {
  zh: {
    title: "选择门户",
    subtitle: "选择要进入的门店工作区",
    enter: "进入",
    admin: "门户管理员",
    employee: "员工",
    noPortals: "尚未分配门户，请联系管理员",
    noPortalsSystem: "还没有可进入的门户。你是系统主管理员，可以到门户管理里新建或重新启用门户。",
    manage: "门户管理",
    logout: "退出登录",
    loadFailed: "门户列表加载失败，请重试",
    retry: "重试",
    loading: "正在加载…",
    signedInAs: "当前账号"
  },
  es: {
    title: "Elegir portal",
    subtitle: "Elige el espacio de trabajo de la tienda",
    enter: "Entrar",
    admin: "Administrador del portal",
    employee: "Empleado",
    noPortals: "Todavía no tienes ningún portal asignado. Contacta con el administrador.",
    noPortalsSystem: "No hay portales disponibles. Como administrador del sistema puedes crear o reactivar portales en Gestión de portales.",
    manage: "Gestión de portales",
    logout: "Cerrar sesión",
    loadFailed: "No se pudo cargar la lista de portales",
    retry: "Reintentar",
    loading: "Cargando…",
    signedInAs: "Usuario"
  }
};

const ICON = { size: 16, strokeWidth: 1.75 };

export function PortalPicker({ identity, portals = [], loading = false, error = "", onSelect, onOpenSystem, onLogout, onRetry, lang = "zh", onLangChange, languages = [] }) {
  const t = (key) => TEXT[lang]?.[key] || TEXT.zh[key] || key;
  return (
    <main className="login-page portal-picker-page">
      <div className="login-logo">repuestomovil</div>
      <Card className="login-card portal-picker-card">
        <CardContent>
          <div className="login-tools">
            <span className="portal-picker-user">{t("signedInAs")}：{identity?.name || identity?.username || ""}</span>
            {onLangChange ? (
              <Select value={lang} onChange={(event) => onLangChange(event.target.value)}>
                {languages.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </Select>
            ) : null}
          </div>
          <h1 className="login-title">{t("title")}</h1>
          <p className="portal-picker-subtitle">{t("subtitle")}</p>
          {loading ? <Empty compact>{t("loading")}</Empty> : null}
          {!loading && error ? (
            <div className="portal-picker-error">
              <span>{t("loadFailed")}</span>
              <Button variant="outline" size="sm" type="button" onClick={onRetry}><RefreshCw {...ICON} /> {t("retry")}</Button>
            </div>
          ) : null}
          {!loading && !error ? (
            portals.length ? (
              <ul className="portal-list" aria-label={t("title")}>
                {portals.map((portal) => (
                  <li key={portal.id}>
                    <button type="button" className="portal-list-item" onClick={() => onSelect(portal)}>
                      <span className="portal-list-icon"><Building2 {...ICON} /></span>
                      <span className="portal-list-name">{portal.name}</span>
                      <span className="portal-list-role">{portal.isAdmin ? t("admin") : t("employee")}</span>
                      <span className="portal-list-enter">{t("enter")}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty compact>{identity?.isSystemAdmin ? t("noPortalsSystem") : t("noPortals")}</Empty>
            )
          ) : null}
          <div className="portal-picker-actions">
            {identity?.isSystemAdmin ? <Button variant="outline" type="button" onClick={onOpenSystem}><Settings2 {...ICON} /> {t("manage")}</Button> : null}
            <Button variant="ghost" type="button" onClick={onLogout}><LogOut {...ICON} /> {t("logout")}</Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
