# BUG-REVIEW 逐项处理结论

基线 `aa035f88a67aae5b9c0f80aa3830c61a6bd0d87b`（本分支起点 HEAD 与基线相同，已核对）。每项给出：修复位置、验证方式、结论。验证均在独立测试库（MySQL 8.4 容器，`repairnote_test`）用真实 HTTP + 真实数据库执行，脚本 `scripts/verify-portals.mjs`（下文简称 VP）；结果见 `reports/verify-portals.md`。

| ID | 结论 | 修复 | 验证 |
|---|---|---|---|
| BUG-01 生产 seed 默认密码 | 已修复 | `prisma/seed.js`：首次初始化必须提供非空、非占位、非弱密码（`admin123`/`123456`/`change-this-before-deploy` 等拒绝，生产 ≥8 位），失败非零退出且不创建账号；已有账号时不重置密码、不改系统身份。`server.js`/`plesk-setup.mjs`/`docker-compose.prod.yml`/`.env*.example` 删除所有默认凭据。 | 空库四组初始化实测：缺失 / `admin123` / 占位 → 失败且 Staff=0；有效密码 → 创建 1 个系统主管理员；重复 seed（换密码）→ 哈希不变。见本报告附录 S01。 |
| BUG-02 改密码不撤销会话 | 已修复 | `api/staff` 改密码与 `revokeStaffSessions` 同一事务；`portal-admin.mjs reset-password/update-identity` 同样撤销会话。门店管理员只能改“只属于本门户且非系统主管理员”账号的全局身份。 | VP S02：两个旧会话 `/api/auth/me` 为空、业务 401，旧密码 401，新密码成功。VP A09/G23：系统账号与共享账号的密码 / 用户名修改被 403 `IDENTITY_PROTECTED`。 |
| BUG-03 维修单版本可省略 / 非原子 | 已修复 | `data-store.saveRepairRecord/deleteRepairRecord` 在门户写锁事务内：已有对象缺 updatedAt → 400 `VERSION_REQUIRED`，非法 → 400，过期 → 409；更新 updatedAt = max(now, 旧+1ms)；新建显式 `createOnly`，已有 id 冲突 409，已删除对象 404。 | VP C01/C02/C03：并发同版本更新一成功一 409，连续写版本严格递增，更新与删除并发只一个成功。 |
| BUG-04 目录 ANY 权限写全目录 | 已修复 | `api-crud.saveCatalog` + `CATALOG_SECTIONS`：`brands-models`(categories) / `services` / `parts`(modules) / `products`(services 且 modules)；分区外数组或设置键 400，权限不足 403；未提交分区不清空。 | VP D08/D09。 |
| BUG-05 恢复快照回写账号权限 | 已修复 | 备份 v2 只含业务数据；`cleanBusinessBackupData` 对上传文件、粘贴 JSON、数据库历史快照、下载统一剔除 users / 身份 / 门户元数据；`replaceBusinessData` 不再含 Staff 分支。 | VP B01/B03/B04/B05：恢复前后 Staff / PortalMember / StaffSession / Portal 元数据摘要完全一致，含 users 的旧快照恢复后账号不变。 |
| BUG-06 最后管理员检查可并发穿透 | 已修复 | 成员写入先按 ID 锁 Staff 行再锁 Portal 行（`withPortalWrite`/`withSystemPortalWrite`），最后管理员检查在锁内；员工页、系统管理页同一规则。 | VP A12（3 轮并发互降至少保留一位）、G18（系统页并发互降、最后管理员 409）。 |
| BUG-07 登录输入 / 哈希 / 限流 | 已修复（应用层）；部署层限流为部署检查项 | `verifyPassword` 异常哈希安全返回 false；登录 JSON / 类型 / 长度 400；限流表容量上限 5000 并淘汰过期项。跨进程限流与可信代理头写入 `docs/多门户升级与运维说明.md` §7（R04），需部署时实测。 | VP S04：非法 JSON 400、类型 400、异常长度哈希 401 无堆栈、连续失败 429。 |
| BUG-08 临时错误当登出 | 已修复 | 前端外壳只在 401 清身份；门户 403（`PORTAL_ACCESS_DENIED/INACTIVE`）清工作区回选择页；5xx / 断网显示重试并保留登录。 | `scripts/smoke-portals.mjs`「临时错误不假登出」：bootstrap 拦截为 500 → 出现重试，未回登录页，重试后恢复。 |
| BUG-09 小资源 GET 全量读取；lint 名称误导 | 已修复 | `getBootstrapData` 默认不读 repairs/clients，集合 GET 只返回本资源；`npm run lint` 改为真实静态检查（`scripts/lint.mjs`：tsc 语法 / 模块解析 + API 路由鉴权入口检查），`next build` 单独执行。 | VP D12；`npm run lint` 通过；`npm run build` 通过。 |
| BUG-10 盲标基线迁移 | 已修复 | `scripts/db-preflight.mjs` 逐表比较列 / 索引 / 外键与初始迁移，一致才 `migrate resolve`；旧库升级另检查 `REPAIRNOTE_SYSTEM_ADMIN_STAFF_ID`、悬空引用。`prisma-baseline.mjs` 仅转发。 | 只有 Staff 表的库：列出全部差异并停止，未写迁移记录（M03 实测）；完整旧库：标记基线后进入多门户升级前置检查。 |
| BUG-11 自动备份去重 / 触发 | 已修复 | `BackupSnapshot(portalId, kind, autoDay)` 唯一约束，autoDay 按 `Europe/Madrid`；bootstrap 内可靠 await，失败只记日志；剪枝按门户 60 份；备份用 `backup-metadata` 模式不递增业务 revision。 | VP B07/B08/B09：20 个并发 bootstrap 只 1 份 auto，A/B 各 1 份，不增 revision，A 剪枝不动 B。 |

## v2 新增设计防护（ADMIN-PORTALS / G01–G24）

| 防护 | 实现 | 验证 |
|---|---|---|
| 网页拒绝任何 isSystemAdmin 写入 | `api/staff`、`system-portal-store.setSystemPortalMember` 拒绝该字段 | VP A09/G23、G15/G16 |
| 系统角色不绕过成员关系 | 业务鉴权只走 `requirePortalContext`（成员关系 + 页面权限）；`requireSystemAdmin` 只用于 `/api/system/*`；自我分配记录安全日志 | VP G03、G20 |
| 无门户 / 全部停用仍可管理 | 管理页不依赖门户头；停用门户仍可列出、改名、分配、启用 | VP G03、G11/G12、G11b；smoke-portals「无门户系统主管理员」 |
| 新建原子 + 幂等 | 同事务建 Portal/Setting/首位成员；`creationKey`=sha256(actor:key)，`creationPayloadHash`=sha256({name})；同 key 同载荷重放 200，不同载荷 409，改名后仍识别 | VP G04、G06、G06b（并发双提交）、G07、G08 |
| 版本与最后管理员 | `withSystemPortalWrite`：expectedRevision 缺失 400 / 过期 409，无实际变化不增版本，最后管理员 409 | VP G10、G18、G19 |
| 同源校验 | 系统写接口要求 `application/json` 且 Origin === `REPAIRNOTE_PUBLIC_ORIGIN`；缺失 / 错误 / 伪造代理头 403 且零写入；未知方法 405；私有响应 no-store | VP G24 |

## 未闭环 / 需部署阶段完成

- 部署层限流、反向代理头覆盖、HTTPS、上传上限（R04）只能在真实部署验证，本次给出配置清单与检查方法，未在本地宣称通过。
- `npm audit --omit=dev`：`npm audit fix` 后剩余 3 个 high，全部来自 `prisma` CLI 依赖链 `@prisma/config → deepmerge-ts`（修复需降级 prisma 到 6.12，属破坏性变更）。该依赖只在迁移 / 生成客户端的命令行阶段运行，不在请求路径中；作为已知项记录，待 Prisma 发布修复版本后升级。
