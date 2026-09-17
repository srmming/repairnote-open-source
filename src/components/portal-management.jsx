"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Building2, LogOut, Pencil, Plus, Power, RefreshCw, Search, Trash2, UserPlus, Users } from "lucide-react";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Checkbox, CheckboxLine, Dialog, DialogBody, DialogFooter, Empty, Field, FieldGroup, Input, LabeledField, Select, Table, TableBody, TableCell, TableContainer, TableHead, TableHeader, TableRow, Toolbar } from "@/components/ui";
import { createSystemApi, newIdempotencyKey } from "@/lib/system-portal-client";
import { PAGE_PERMISSION_KEYS } from "@/lib/normalize-client";

// 设置 → 门户管理：同一应用外壳内的全局管理页（不依赖当前门户、成员关系或 settings 页面权限，只看 Staff.isSystemAdmin）。
// 只做新增 / 改名 / 启停 / 分配已有账号；没有删除门户、全局账号编辑、系统角色开关。

const ICON = { size: 16, strokeWidth: 1.75 };
const ICON_SM = { size: 14, strokeWidth: 1.75 };
const PAGE_SIZE = 20;

const TEXT = {
  zh: {
    title: "门户管理",
    breadcrumb: "设置 / 门户管理",
    back: "返回",
    backToPicker: "返回门户选择",
    logout: "退出登录",
    addPortal: "新增门户",
    searchByName: "按名称搜索",
    all: "全部",
    active: "启用",
    inactive: "停用",
    name: "门户名称",
    status: "状态",
    members: "成员数",
    operation: "操作",
    rename: "改名",
    assign: "分配账号",
    disable: "停用",
    enable: "启用",
    prev: "上一页",
    next: "下一页",
    pageOf: (page, pages) => `第 ${page} 页 / 共 ${pages} 页`,
    noPortals: "还没有门户",
    loading: "正在加载…",
    loadFailed: "加载失败，请重试",
    retry: "重试",
    create: "创建",
    save: "保存",
    cancel: "取消",
    close: "关闭",
    portalNamePlaceholder: "门户名称（1–80 个字符）",
    createHint: "只需填写名称。系统会自动建立空的门店设置，并把你加为这个门户的管理员；业务数据不会复制。打印抬头请到该门户的设置页填写。",
    createAdminToggle: "同时为这个门户创建一个独立的管理员账号（发给使用者）",
    createAdminHint: "这个账号只属于这个门户，登录后直接进入自己的工作区，看不到其他门户。",
    adminUsername: "登录用户名",
    adminPassword: "登录密码（至少 6 位）",
    adminName: "显示姓名（可不填）",
    createdWithAdmin: (username) => `门户已创建，账号 ${username} 可以登录了`,
    usernameTaken: "该用户名已被使用，请换一个",
    created: "门户已创建",
    renamed: "名称已更新",
    disableConfirm: "停用后，成员将无法进入此门户，客户查询链接暂不可用；数据会保留，可随时重新启用。确定停用吗？",
    disabled: "门户已停用",
    enabled: "门户已启用",
    idHint: "ID",
    memberDialogTitle: "分配账号",
    currentMembers: "当前成员",
    noMembers: "还没有成员",
    findAccount: "按完整用户名查找已有账号",
    usernamePlaceholder: "输入完整用户名",
    find: "查找",
    notFound: "账号不存在，请先在现有员工页面创建账号，再返回分配",
    role: "角色",
    portalAdmin: "本门户管理员",
    employee: "普通员工",
    adminHint: "沿用全部门户页面权限",
    pagePermissions: "页面权限",
    emptyPermissionsHint: "允许不勾选任何页面，该账号登录后会看到“尚未分配页面权限”。",
    assignSave: "保存分配",
    remove: "移出",
    removeConfirm: "确定把该账号移出此门户？账号本身不会被删除，其他门户不受影响。",
    memberSaved: "成员已保存",
    memberRemoved: "已移出",
    edit: "编辑",
    admin: "管理员",
    versionConflict: "门户信息刚被其他人更新，列表已刷新；请核对后重新提交。",
    originError: "安全校验失败：请求来源不被允许，请联系部署负责人核对 REPAIRNOTE_PUBLIC_ORIGIN。",
    lastAdmin: "该门户至少要保留一位门户管理员",
    you: "你",
    selfAssignHint: "把自己加入门户后，才能按成员权限进入该门户的业务。",
    permissionsFor: (name) => `${name} 的权限`,
    noPermission: "没有权限访问门户管理",
    workspaceBack: "返回工作区",
    saving: "正在保存…",
    systemRoleLost: "你的系统管理员身份已失效，管理页已关闭。"
  },
  es: {
    title: "Gestión de portales",
    breadcrumb: "Ajustes / Gestión de portales",
    back: "Volver",
    backToPicker: "Volver a elegir portal",
    logout: "Cerrar sesión",
    addPortal: "Nuevo portal",
    searchByName: "Buscar por nombre",
    all: "Todos",
    active: "Activos",
    inactive: "Desactivados",
    name: "Nombre del portal",
    status: "Estado",
    members: "Miembros",
    operation: "Acciones",
    rename: "Renombrar",
    assign: "Asignar cuenta",
    disable: "Desactivar",
    enable: "Activar",
    prev: "Anterior",
    next: "Siguiente",
    pageOf: (page, pages) => `Página ${page} de ${pages}`,
    noPortals: "Todavía no hay portales",
    loading: "Cargando…",
    loadFailed: "Error al cargar, reintenta",
    retry: "Reintentar",
    create: "Crear",
    save: "Guardar",
    cancel: "Cancelar",
    close: "Cerrar",
    portalNamePlaceholder: "Nombre del portal (1–80 caracteres)",
    createHint: "Solo hace falta el nombre. Se crearán ajustes vacíos y serás administrador de este portal; no se copian datos. El nombre de impresión se configura en los ajustes de ese portal.",
    createAdminToggle: "Crear también una cuenta de administrador independiente para este portal",
    createAdminHint: "Esta cuenta solo pertenece a este portal; al entrar irá directo a su espacio y no verá otros portales.",
    adminUsername: "Usuario",
    adminPassword: "Contraseña (mínimo 6 caracteres)",
    adminName: "Nombre visible (opcional)",
    createdWithAdmin: (username) => `Portal creado; la cuenta ${username} ya puede entrar`,
    usernameTaken: "Ese usuario ya existe, elige otro",
    created: "Portal creado",
    renamed: "Nombre actualizado",
    disableConfirm: "Al desactivar, los miembros no podrán entrar y los enlaces de consulta dejarán de funcionar temporalmente; los datos se conservan y se puede reactivar. ¿Desactivar?",
    disabled: "Portal desactivado",
    enabled: "Portal activado",
    idHint: "ID",
    memberDialogTitle: "Asignar cuenta",
    currentMembers: "Miembros actuales",
    noMembers: "Sin miembros",
    findAccount: "Buscar una cuenta existente por su nombre de usuario completo",
    usernamePlaceholder: "Nombre de usuario completo",
    find: "Buscar",
    notFound: "La cuenta no existe. Créala primero en la página de empleados y vuelve a asignarla.",
    role: "Rol",
    portalAdmin: "Administrador del portal",
    employee: "Empleado",
    adminHint: "Tiene todos los permisos de página del portal",
    pagePermissions: "Permisos de página",
    emptyPermissionsHint: "Se permite no marcar ninguna página; al entrar verá “sin permisos asignados”.",
    assignSave: "Guardar asignación",
    remove: "Quitar",
    removeConfirm: "¿Quitar esta cuenta del portal? La cuenta no se elimina y los demás portales no cambian.",
    memberSaved: "Miembro guardado",
    memberRemoved: "Quitado",
    edit: "Editar",
    admin: "Admin",
    versionConflict: "El portal fue actualizado por otra persona; la lista se ha refrescado. Revisa y vuelve a enviar.",
    originError: "Fallo de seguridad: origen no permitido. Revisa REPAIRNOTE_PUBLIC_ORIGIN con el responsable del despliegue.",
    lastAdmin: "El portal debe conservar al menos un administrador",
    you: "tú",
    selfAssignHint: "Después de añadirte a un portal podrás entrar a su negocio según los permisos del miembro.",
    permissionsFor: (name) => `Permisos de ${name}`,
    noPermission: "No tienes permiso para gestionar portales",
    workspaceBack: "Volver al espacio de trabajo",
    saving: "Guardando…",
    systemRoleLost: "Tu rol de administrador del sistema ya no es válido; la página se ha cerrado."
  }
};

const PERMISSION_LABELS = {
  zh: { repairs: "维修单", clients: "客户", categories: "品牌 / 型号", modules: "配件", services: "服务", attributes: "属性", technicians: "维修师", reports: "报表", finance: "财务", settings: "设置", backup: "备份" },
  es: { repairs: "Reparaciones", clients: "Clientes", categories: "Marcas / modelos", modules: "Piezas", services: "Servicios", attributes: "Atributos", technicians: "Técnicos", reports: "Informes", finance: "Finanzas", settings: "Ajustes", backup: "Copias" }
};

function useText(lang) {
  return useCallback((key, ...args) => {
    const value = TEXT[lang]?.[key] ?? TEXT.zh[key] ?? key;
    return typeof value === "function" ? value(...args) : value;
  }, [lang]);
}

export function PortalManagementPage({ identity, lang = "zh", onBack, backLabel, onLogout, onUnauthorized, onSystemRoleLost, registerLeaveGuard, toast }) {
  const t = useText(lang);
  const api = useMemo(() => createSystemApi({ onUnauthorized, onSystemRoleLost }), [onUnauthorized, onSystemRoleLost]);
  useEffect(() => () => api.dispose(), [api]);

  const [filters, setFilters] = useState({ q: "", status: "all", page: 1 });
  const [committedQuery, setCommittedQuery] = useState("");
  const [list, setList] = useState({ portals: [], total: 0, page: 1, pageSize: PAGE_SIZE });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createAdmin, setCreateAdmin] = useState(false);
  const [adminForm, setAdminForm] = useState({ username: "", password: "", name: "" });
  const createKeyRef = useRef(newIdempotencyKey());
  const [renameTarget, setRenameTarget] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [memberTarget, setMemberTarget] = useState(null);
  const listGeneration = useRef(0);
  const pendingRef = useRef(0);
  const dirtyRef = useRef(() => false);

  // 未保存离开保护：创建 / 改名 / 成员表单有输入或请求进行中时，外层切换会先确认。
  useEffect(() => {
    if (!registerLeaveGuard) return undefined;
    return registerLeaveGuard({
      isDirty: () => (createOpen && (createName.trim().length > 0 || adminForm.username || adminForm.password)) || (renameTarget && renameValue.trim() !== renameTarget.name) || dirtyRef.current(),
      isSaving: () => pendingRef.current > 0
    });
  }, [registerLeaveGuard, createOpen, createName, adminForm, renameTarget, renameValue]);

  const showNotice = useCallback((message) => {
    if (toast) toast(message);
    else {
      setNotice(message);
      window.setTimeout(() => setNotice(""), 2000);
    }
  }, [toast]);

  const loadList = useCallback(async () => {
    const generation = ++listGeneration.current;
    setLoading(true);
    setLoadError("");
    try {
      const result = await api.listPortals({ q: committedQuery, status: filters.status, page: filters.page, pageSize: PAGE_SIZE });
      if (generation !== listGeneration.current) return;
      setList(result);
    } catch (error) {
      if (generation !== listGeneration.current) return;
      setLoadError(error.message || t("loadFailed"));
    } finally {
      if (generation === listGeneration.current) setLoading(false);
    }
  }, [api, committedQuery, filters.status, filters.page, t]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  async function runWrite(task, { onConflict } = {}) {
    pendingRef.current += 1;
    setBusy(true);
    try {
      return await task();
    } catch (error) {
      if (error.code === "VERSION_CONFLICT") {
        showNotice(t("versionConflict"));
        await loadList();
        onConflict?.();
        return null;
      }
      if (error.code === "ORIGIN_NOT_ALLOWED") {
        showNotice(t("originError"));
        return null;
      }
      if (error.code === "LAST_PORTAL_ADMIN") {
        showNotice(t("lastAdmin"));
        return null;
      }
      if (error.code === "USERNAME_TAKEN") {
        showNotice(t("usernameTaken"));
        return null;
      }
      if (error.code === "STALE_VIEW") return null;
      showNotice(error.message || t("loadFailed"));
      return null;
    } finally {
      pendingRef.current -= 1;
      setBusy(false);
    }
  }

  const adminFormValid = !createAdmin || (adminForm.username.trim().length > 0 && adminForm.password.length >= 6);

  const submitCreate = async (event) => {
    event.preventDefault();
    if (busy || !adminFormValid) return;
    const name = createName.trim();
    if (!name) return;
    const initialAdmin = createAdmin ? { username: adminForm.username.trim(), password: adminForm.password, ...(adminForm.name.trim() ? { name: adminForm.name.trim() } : {}) } : null;
    // 一次创建尝试使用同一个 Idempotency-Key；网络失败后的重试复用它，成功后才更换。
    const result = await runWrite(() => api.createPortal(name, createKeyRef.current, initialAdmin));
    if (!result) return;
    createKeyRef.current = newIdempotencyKey();
    const createdUsername = result.initialAdmin?.username || "";
    setCreateName("");
    setCreateAdmin(false);
    setAdminForm({ username: "", password: "", name: "" });
    setCreateOpen(false);
    showNotice(createdUsername ? t("createdWithAdmin", createdUsername) : t("created"));
    await loadList();
  };

  const submitRename = async (event) => {
    event.preventDefault();
    if (!renameTarget || busy) return;
    const name = renameValue.trim();
    if (!name) return;
    const result = await runWrite(() => api.updatePortal(renameTarget.id, { expectedRevision: renameTarget.revision, name }));
    if (!result) return;
    setRenameTarget(null);
    showNotice(t("renamed"));
    await loadList();
  };

  const toggleActive = async (portal) => {
    if (busy) return;
    if (portal.isActive && !window.confirm(t("disableConfirm"))) return;
    const result = await runWrite(() => api.updatePortal(portal.id, { expectedRevision: portal.revision, isActive: !portal.isActive }));
    if (!result) return;
    showNotice(portal.isActive ? t("disabled") : t("enabled"));
    await loadList();
  };

  const totalPages = Math.max(1, Math.ceil((list.total || 0) / PAGE_SIZE));

  return (
    <div className="app-shell portal-management-shell">
      <main className="main">
        <header className="topbar">
          <h1>{t("title")}</h1>
          <div className="topbar-actions portal-management-topbar">
            {onBack ? <Button variant="outline" type="button" onClick={onBack}><ArrowLeft {...ICON_SM} /> {backLabel || t("back")}</Button> : null}
            {onLogout ? <Button variant="ghost" type="button" onClick={onLogout}><LogOut {...ICON_SM} /> {t("logout")}</Button> : null}
          </div>
        </header>
        <section className="page portal-management">
          <Card>
            <CardHeader>
              <CardTitle>{t("breadcrumb")}</CardTitle>
            </CardHeader>
            <CardContent>
              <Toolbar>
                <Button type="button" onClick={() => { setCreateOpen(true); }} disabled={busy}><Plus {...ICON_SM} /> {t("addPortal")}</Button>
                <form className="portal-search" onSubmit={(event) => { event.preventDefault(); setCommittedQuery(filters.q.trim()); setFilters((current) => ({ ...current, page: 1 })); }}>
                  <Input value={filters.q} onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value }))} placeholder={t("searchByName")} aria-label={t("searchByName")} />
                  <Button variant="outline" type="submit"><Search {...ICON_SM} /></Button>
                </form>
                <Select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value, page: 1 }))} aria-label={t("status")}>
                  <option value="all">{t("all")}</option>
                  <option value="active">{t("active")}</option>
                  <option value="inactive">{t("inactive")}</option>
                </Select>
                <div className="toolbar-spacer" />
                <Button variant="ghost" type="button" onClick={loadList} disabled={loading}><RefreshCw {...ICON_SM} /></Button>
              </Toolbar>
              {loadError ? (
                <div className="portal-picker-error">
                  <span>{loadError}</span>
                  <Button variant="outline" size="sm" type="button" onClick={loadList}>{t("retry")}</Button>
                </div>
              ) : null}
              <TableContainer>
                <Table className="portal-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("name")}</TableHead>
                      <TableHead>{t("status")}</TableHead>
                      <TableHead>{t("members")}</TableHead>
                      <TableHead>{t("operation")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading && !list.portals.length ? (
                      <TableRow><TableCell colSpan={4}><Empty compact>{t("loading")}</Empty></TableCell></TableRow>
                    ) : list.portals.length ? list.portals.map((portal) => (
                      <TableRow key={portal.id} className={portal.isActive ? "" : "portal-row-inactive"}>
                        <TableCell data-label={t("name")}>
                          <div className="portal-name-cell">
                            <Building2 {...ICON_SM} />
                            <span>{portal.name}</span>
                            <small className="portal-id-hint" title={portal.id}>{t("idHint")}: {portal.id.slice(0, 8)}</small>
                          </div>
                        </TableCell>
                        <TableCell data-label={t("status")}>{portal.isActive ? <Badge>{t("active")}</Badge> : <Badge className="badge-muted">{t("inactive")}</Badge>}</TableCell>
                        <TableCell data-label={t("members")}>{portal.memberCount}</TableCell>
                        <TableCell data-label={t("operation")}>
                          <div className="portal-row-actions">
                            <Button size="sm" variant="outline" type="button" disabled={busy} onClick={() => { setRenameTarget(portal); setRenameValue(portal.name); }}><Pencil {...ICON_SM} /> {t("rename")}</Button>
                            <Button size="sm" variant="outline" type="button" disabled={busy} onClick={() => setMemberTarget(portal)}><Users {...ICON_SM} /> {t("assign")}</Button>
                            <Button size="sm" variant={portal.isActive ? "danger" : "default"} type="button" disabled={busy} onClick={() => toggleActive(portal)}><Power {...ICON_SM} /> {portal.isActive ? t("disable") : t("enable")}</Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )) : (
                      <TableRow><TableCell colSpan={4}><Empty compact>{t("noPortals")}</Empty></TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
              <div className="portal-pagination">
                <Button size="sm" variant="outline" type="button" disabled={filters.page <= 1 || loading} onClick={() => setFilters((current) => ({ ...current, page: current.page - 1 }))}>{t("prev")}</Button>
                <span>{t("pageOf", list.page || filters.page, totalPages)}</span>
                <Button size="sm" variant="outline" type="button" disabled={filters.page >= totalPages || loading} onClick={() => setFilters((current) => ({ ...current, page: current.page + 1 }))}>{t("next")}</Button>
              </div>
            </CardContent>
          </Card>
          {notice ? <div className="toast">{notice}</div> : null}
        </section>
      </main>

      <Dialog open={createOpen} onOpenChange={(open) => { if (!open && !busy) setCreateOpen(false); }} title={t("addPortal")}>
        <DialogBody>
          <form onSubmit={submitCreate} autoComplete="off">
            <Field><Input value={createName} onChange={(event) => setCreateName(event.target.value)} placeholder={t("portalNamePlaceholder")} maxLength={80} required autoFocus /></Field>
            <p className="portal-form-hint">{t("createHint")}</p>
            <CheckboxLine className="portal-create-admin-toggle"><Checkbox checked={createAdmin} onChange={(event) => setCreateAdmin(event.target.checked)} /> {t("createAdminToggle")}</CheckboxLine>
            {createAdmin ? (
              <div className="portal-create-admin">
                <FieldGroup>
                  <Field className="col-6"><Input value={adminForm.username} onChange={(event) => setAdminForm((current) => ({ ...current, username: event.target.value }))} placeholder={t("adminUsername")} autoComplete="off" required /></Field>
                  <Field className="col-6"><Input type="password" value={adminForm.password} onChange={(event) => setAdminForm((current) => ({ ...current, password: event.target.value }))} placeholder={t("adminPassword")} autoComplete="new-password" required minLength={6} /></Field>
                  <Field className="col-12"><Input value={adminForm.name} onChange={(event) => setAdminForm((current) => ({ ...current, name: event.target.value }))} placeholder={t("adminName")} /></Field>
                </FieldGroup>
                <p className="portal-form-hint">{t("createAdminHint")}</p>
              </div>
            ) : null}
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setCreateOpen(false)} disabled={busy}>{t("cancel")}</Button>
              <Button type="submit" disabled={busy || !createName.trim() || !adminFormValid}>{busy ? t("saving") : t("create")}</Button>
            </DialogFooter>
          </form>
        </DialogBody>
      </Dialog>

      <Dialog open={Boolean(renameTarget)} onOpenChange={(open) => { if (!open && !busy) setRenameTarget(null); }} title={t("rename")}>
        <DialogBody>
          <form onSubmit={submitRename}>
            <Field><Input value={renameValue} onChange={(event) => setRenameValue(event.target.value)} placeholder={t("portalNamePlaceholder")} maxLength={80} required autoFocus /></Field>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setRenameTarget(null)} disabled={busy}>{t("cancel")}</Button>
              <Button type="submit" disabled={busy || !renameValue.trim()}>{busy ? t("saving") : t("save")}</Button>
            </DialogFooter>
          </form>
        </DialogBody>
      </Dialog>

      {memberTarget ? (
        <MemberDialog
          key={memberTarget.id}
          api={api}
          identity={identity}
          portal={memberTarget}
          lang={lang}
          onClose={() => setMemberTarget(null)}
          onChanged={loadList}
          showNotice={showNotice}
          pendingRef={pendingRef}
          dirtyRef={dirtyRef}
        />
      ) : null}
    </div>
  );
}

function MemberDialog({ api, identity, portal: initialPortal, lang, onClose, onChanged, showNotice, pendingRef, dirtyRef }) {
  const t = useText(lang);
  const [portal, setPortal] = useState(initialPortal);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [username, setUsername] = useState("");
  const [searchMessage, setSearchMessage] = useState("");
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ isAdmin: false, pagePermissions: [] });
  const generation = useRef(0);

  useEffect(() => {
    dirtyRef.current = () => Boolean(selected) || username.trim().length > 0;
    return () => {
      dirtyRef.current = () => false;
    };
  }, [dirtyRef, selected, username]);

  // 成员弹窗切换目标门户时（key 变化重建组件），世代计数保证迟到响应不会绘入另一门户的弹窗。
  const load = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true);
    setLoadError("");
    try {
      const result = await api.listMembers(initialPortal.id, { page: 1, pageSize: 100 });
      if (current !== generation.current) return;
      setPortal(result.portal);
      setMembers(result.members);
    } catch (error) {
      if (current !== generation.current) return;
      setLoadError(error.message || t("loadFailed"));
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, [api, initialPortal.id, t]);

  useEffect(() => {
    load();
    return () => {
      generation.current += 1;
    };
  }, [load]);

  async function runWrite(task) {
    pendingRef.current += 1;
    setBusy(true);
    try {
      return await task();
    } catch (error) {
      if (error.code === "VERSION_CONFLICT") {
        showNotice(t("versionConflict"));
        await load();
        return null;
      }
      if (error.code === "LAST_PORTAL_ADMIN") {
        showNotice(t("lastAdmin"));
        return null;
      }
      if (error.code === "ORIGIN_NOT_ALLOWED") {
        showNotice(t("originError"));
        return null;
      }
      if (error.code === "STAFF_NOT_FOUND") {
        setSearchMessage(t("notFound"));
        return null;
      }
      if (error.code === "STALE_VIEW") return null;
      showNotice(error.message || t("loadFailed"));
      return null;
    } finally {
      pendingRef.current -= 1;
      setBusy(false);
    }
  }

  const findAccount = async (event) => {
    event.preventDefault();
    const value = username.trim();
    if (!value || busy) return;
    setSearchMessage("");
    const current = ++generation.current;
    try {
      const result = await api.findStaff(value);
      if (current !== generation.current) return;
      const user = result.users?.[0];
      if (!user) {
        setSelected(null);
        setSearchMessage(t("notFound"));
        return;
      }
      const existing = members.find((member) => member.staffId === user.id);
      setSelected({ staffId: user.id, name: user.name, username: user.username, existing: Boolean(existing) });
      setForm(existing ? { isAdmin: existing.isAdmin, pagePermissions: existing.pagePermissions } : { isAdmin: false, pagePermissions: [] });
    } catch (error) {
      if (current !== generation.current) return;
      setSearchMessage(error.message || t("loadFailed"));
    }
  };

  const editMember = (member) => {
    setUsername(member.username);
    setSearchMessage("");
    setSelected({ staffId: member.staffId, name: member.name, username: member.username, existing: true });
    setForm({ isAdmin: member.isAdmin, pagePermissions: member.pagePermissions });
  };

  const togglePermission = (key, checked) => {
    setForm((current) => {
      const next = new Set(current.pagePermissions);
      if (checked) next.add(key);
      else next.delete(key);
      return { ...current, pagePermissions: [...next] };
    });
  };

  const saveMember = async (event) => {
    event.preventDefault();
    if (!selected || busy) return;
    const result = await runWrite(() => api.setMember(portal.id, selected.staffId, {
      expectedRevision: portal.revision,
      isAdmin: form.isAdmin,
      pagePermissions: form.isAdmin ? [] : form.pagePermissions
    }));
    if (!result) return;
    showNotice(t("memberSaved"));
    setSelected(null);
    setUsername("");
    await load();
    onChanged?.();
  };

  const removeMember = async (member) => {
    if (busy || !window.confirm(t("removeConfirm"))) return;
    const result = await runWrite(() => api.removeMember(portal.id, member.staffId, portal.revision));
    if (!result) return;
    showNotice(t("memberRemoved"));
    if (selected?.staffId === member.staffId) setSelected(null);
    await load();
    onChanged?.();
  };

  const labels = PERMISSION_LABELS[lang] || PERMISSION_LABELS.zh;

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }} title={`${t("memberDialogTitle")} · ${portal.name}`} contentClassName="portal-member-dialog">
      <DialogBody>
        <div className="portal-member-head">
          <span>{portal.name}</span>
          {portal.isActive ? <Badge>{t("active")}</Badge> : <Badge className="badge-muted">{t("inactive")}</Badge>}
          <small className="portal-id-hint">{t("idHint")}: {portal.id}</small>
        </div>
        <h3 className="portal-section-title">{t("currentMembers")}</h3>
        {loadError ? <div className="portal-picker-error"><span>{loadError}</span><Button size="sm" variant="outline" type="button" onClick={load}>{t("retry")}</Button></div> : null}
        {loading ? <Empty compact>{t("loading")}</Empty> : members.length ? (
          <ul className="portal-member-list">
            {members.map((member) => (
              <li key={member.staffId} className="portal-member-item">
                <div className="portal-member-info">
                  <strong>{member.name || member.username}</strong>
                  <span>@{member.username}{member.staffId === identity?.id ? `（${t("you")}）` : ""}</span>
                  <span className="portal-member-role">{member.isAdmin ? t("portalAdmin") : `${t("employee")} · ${member.pagePermissions.length ? member.pagePermissions.map((key) => labels[key] || key).join("、") : "—"}`}</span>
                </div>
                <div className="portal-row-actions">
                  <Button size="sm" variant="outline" type="button" disabled={busy} onClick={() => editMember(member)}><Pencil {...ICON_SM} /> {t("edit")}</Button>
                  <Button size="sm" variant="danger" type="button" disabled={busy} onClick={() => removeMember(member)}><Trash2 {...ICON_SM} /> {t("remove")}</Button>
                </div>
              </li>
            ))}
          </ul>
        ) : <Empty compact>{t("noMembers")}</Empty>}

        <h3 className="portal-section-title"><UserPlus {...ICON_SM} /> {t("findAccount")}</h3>
        <form className="portal-search" onSubmit={findAccount}>
          <Input value={username} onChange={(event) => { setUsername(event.target.value); setSearchMessage(""); }} placeholder={t("usernamePlaceholder")} autoComplete="off" />
          <Button variant="outline" type="submit" disabled={busy || !username.trim()}><Search {...ICON_SM} /> {t("find")}</Button>
        </form>
        {searchMessage ? <p className="portal-form-hint portal-form-warning">{searchMessage}</p> : null}
        {selected ? (
          <form onSubmit={saveMember} className="portal-member-form">
            <div className="portal-member-selected">
              <strong>{selected.name}</strong> <span>@{selected.username}</span>
              {selected.staffId === identity?.id ? <small className="portal-form-hint">{t("selfAssignHint")}</small> : null}
            </div>
            <FieldGroup>
              <LabeledField className="col-12"><span>{t("role")}</span>
                <Select value={form.isAdmin ? "admin" : "employee"} onChange={(event) => setForm((current) => ({ ...current, isAdmin: event.target.value === "admin" }))}>
                  <option value="employee">{t("employee")}</option>
                  <option value="admin">{t("portalAdmin")}</option>
                </Select>
              </LabeledField>
              <div className="permission-panel col-12">
                <div className="permission-panel-title">{t("pagePermissions")}</div>
                {form.isAdmin ? <div className="permission-all">{t("adminHint")}</div> : (
                  <>
                    <div className="permission-grid">
                      {PAGE_PERMISSION_KEYS.map((key) => (
                        <CheckboxLine key={key} className="permission-check"><Checkbox checked={form.pagePermissions.includes(key)} onChange={(event) => togglePermission(key, event.target.checked)} /> {labels[key] || key}</CheckboxLine>
                      ))}
                    </div>
                    <p className="portal-form-hint">{t("emptyPermissionsHint")}</p>
                  </>
                )}
              </div>
            </FieldGroup>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => { setSelected(null); setUsername(""); }} disabled={busy}>{t("cancel")}</Button>
              <Button type="submit" disabled={busy}>{busy ? t("saving") : t("assignSave")}</Button>
            </DialogFooter>
          </form>
        ) : (
          <DialogFooter>
            <Button variant="outline" type="button" onClick={onClose} disabled={busy}>{t("close")}</Button>
          </DialogFooter>
        )}
      </DialogBody>
    </Dialog>
  );
}
