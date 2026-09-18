# 多门户验收结果（ACCEPTANCE.md 91 项）

- 提交：见分支 `claude/multi-portal-handoff-f84f3c` 最终提交（基线 `aa035f88a67aae5b9c0f80aa3830c61a6bd0d87b`，本分支起点 HEAD 与基线一致）。
- 环境：macOS，Node v26.7.0（项目要求 ≥24），MySQL 8.4（docker `mysql:8.4`，InnoDB，默认 REPEATABLE READ）与 MariaDB 10.11.19（docker `mariadb:10.11`，旧库升级演练），Chrome（Playwright channel）。
- 测试库：`repairnote_test`（API / 浏览器验收，脚本每次清空重建）、`repairnote_upgrade_test`（旧库升级演练）、`repairnote_partial_test`（残缺库预检）。测试服务 `NODE_ENV=production node server.js`，`REPAIRNOTE_PUBLIC_ORIGIN=http://localhost:3010`。
- 证据：`reports/verify-portals.md`（API+数据库断言，58 条检查）、`reports/smoke-portals.json` + `reports/screenshots/*.png`（网页路径，桌面 / 窄屏）、`reports/migration-before.json` / `migration-after.json`（升级演练）、`reports/BUG-REVIEW-处理结论.md`。
- 状态定义：PASS = 实际执行并通过；BLOCKED = 本环境无法执行（说明原因），**不视为通过**；不存在“默认通过”。
- 命令（退出码 0 除非注明）：`npm ci`、`npx prisma validate`、`npx prisma generate`、`npm run build`、`npm run lint`、`npm run smoke`、`npm run smoke:mobile`、`npm run smoke:mobile:boss`、`node scripts/verify-reports-parity.mjs`、`node scripts/verify-portal-migration.mjs --before/--after`、`node scripts/verify-portals.mjs`、`node scripts/smoke-portals.mjs`、`npm audit --omit=dev`（退出码 1，见 R05）、`npm run plesk:pack`。

## A. 身份与门户授权

| ID | 结果 | 证据 / 说明 |
|---|---|---|
| A01 | PASS | VP A01：6 个入口未登录 401，无门户 / 客户内容 |
| A02 | PASS | VP A02：无 X-Portal-Id 400 `PORTAL_HEADER_REQUIRED`，非法头 400 |
| A03 | PASS | VP A03：读 / 写 / 导入 / 下载 / 报表 / 员工全部 403，B 摘要不变；不存在门户与无权门户同样 403 |
| A04 | PASS | VP A04：B 订单 / 客户 / 备份 id 在 A 上下文 404，B 摘要不变 |
| A05 | PASS | VP A05：请求体 portalId 覆盖 400 `PORTAL_MISMATCH` |
| A06 | PASS | VP A06/A07：无成员账号登录成功、空列表、业务 403；身份 DTO 无 isAdmin/pagePermissions |
| A07 | PASS | VP A06/A07 + smoke-portals（单门户自动进入、多门户选择页、无页面权限空态） |
| A08 | PASS | VP A08：新账号同事务加入门户；重名 409 `USERNAME_TAKEN` 不认领 |
| A09 | PASS | VP A09/G23：改 / 删 B 员工 404；isSystemAdmin 400；系统账号与共享账号全局身份 403 `IDENTITY_PROTECTED` |
| A10 | PASS | VP A10：移出后 A 403、B 200、Staff 保留、会话仍在 |
| A11 | PASS | VP G11/G12/G13/A11：停用后旧会话下一次请求 403 `PORTAL_INACTIVE`；G17 改权即时生效 |
| A12 | PASS | VP A12：3 轮并发互降至少保留一位管理员，最多一方成功；VP A12b：已有成员的修改 / 移出用成员记录自身 `updatedAt` 做版本（缺失 400、非法 400、过期 409），同版本并发编辑只有一个成功；VP A12c：B 撤销权限 → A 保存无关客户推进门户版本 → A 用旧员工数据 + 最新门户版本提交仍被 409，已撤销权限不会恢复 |

## D. 数据访问与隔离

| ID | 结果 | 证据 / 说明 |
|---|---|---|
| D01 | PASS | VP D01：同 ticket / 品牌名 / 技师名跨门户并存，同门户 P2002，publicToken 全局唯一 |
| D02 | PASS | VP D02/D03：B 客户 id / 嵌入 client.id 拒绝，无半张订单，A/B 摘要不变 |
| D03 | PASS | VP D02/D03：B 技师、B 来源单、B 品牌 id 拒绝；VP D03b：员工移出门户后其历史订单（技师不变）仍可编辑 / 改状态，改派给已移出员工被拒 |
| D04 | PASS | VP D04/D06：关键词只命中 B 时 total/counts 全 0 |
| D05 | PASS | VP D05：直链 404、扫码 B token null、同号扫码命中 A |
| D06 | PASS | VP D04/D06：A 90/20/70/30/60，B 200/50/150/60/140，技师看板、财务流水无 B |
| D07 | PASS | VP D07：技师 / 属性整组同步只影响 A |
| D08 | PASS | VP D08/D09：单权限提交其他分区 403，分区外数组 / 设置键 400 |
| D09 | PASS | VP D08/D09：允许分区更新、未提交分区不清空、products 需双权限 |
| D10 | PASS | VP D10：`/api/repairs` GET 410 / POST 405，`/api/clients` GET 410；lint 检查每个路由有鉴权入口 |
| D11 | PASS | VP D11：X-Portal-Id 响应头、private no-store、乱序响应不混入 |
| D12 | PASS | VP D12：catalog/attributes/technicians GET 不含 repairs/clients（源码 `getBootstrapData` 默认不读两表）；三接口合计 8ms |

## C. 并发与写入

| ID | 结果 | 证据 / 说明 |
|---|---|---|
| C01 | PASS | VP C01：省略 400 `VERSION_REQUIRED`，非法 400，过期 409，revision 不变 |
| C02 | PASS | VP C02：同版本并发一 200 一 409，同毫秒版本递增，createOnly 冲突 409，已删除 404 |
| C03 | PASS | VP C03：更新 / 删除并发只一个成功；锁单员工 403 `ORDER_LOCKED`；有保修来源删除 409 |
| C04 | PASS | VP C04/C05：设置 / 目录后提交 409，缺版本 400，未知键 400 |
| C05 | PASS | VP C04/C05：A/B 并行 200/200，失败不增 revision，非管理员改锁单策略拒绝 |

## U. 前端与切换

| ID | 结果 | 证据 / 说明 |
|---|---|---|
| U01 | PASS | smoke-portals：桌面 / 窄屏登录、门户选择、工作区、管理页；窄屏无横向溢出；普通用户不见系统入口（截图 01–08） |
| U02 | PASS | smoke-portals：单门户自动进入、多门户选择、侧栏显示当前门户名与切换 |
| U03 | PASS | 维修单草稿、设置表单、任何打开中的编辑弹窗、门户管理表单都接入同一离开保护；smoke-portals「设置页有未保存改动」实测：进管理页 / 切换门户各弹一次确认，取消后留在原页且输入保留 |
| U04 | PASS | 写队列计数 + API 实例内所有进行中的非 GET 请求（客户 / 设置 / 备份恢复 / 导入 / 外部历史等直接调用 api 的路径全部计入），未结束时切换被阻止并提示“正在保存” |
| U05 | PASS | smoke-portals「双标签页」：同账号两页分别停在 A / 第二门户互不跳店 |
| U06 | PASS（代码级）| `createPortalApi` 捕获不可变 portalId，`dispose()` 后迟到响应作废；实例在 effect 挂载时 activate、清理时 dispose（不在 useMemo 计算阶段做副作用），`next dev` 严格模式下 smoke-portals 14/14 通过；未构造人工慢响应自动化用例 |
| U07 | PASS | smoke-ui 全程使用旧 `#/dashboard/...` 深链接（映射到唯一门户）；刷新 / 深链接恢复在 smoke-portals 覆盖 |
| U08 | PASS | 侧栏、客户 / 技师历史、changelog 链接改为 `api.href()`；扫码 lookup 限定当前门户（VP D05） |
| U09 | PASS | smoke-portals「临时错误不假登出」；VP A03/A11 覆盖 403 分类 |
| U10 | PASS | VP U10：备份文件 / 外部历史 FormData 带门户头，multipart 边界正确，无头 400 |

## B. 备份与历史导入

| ID | 结果 | 证据 / 说明 |
|---|---|---|
| B01 | PASS | VP B01 |
| B02 | PASS | VP B02：B 快照 404、伪造来源 400、B id/token 冲突 409 并回滚 |
| B03 | PASS | VP B03/B04：安全快照、旧版本 409、revision +1、B 不变 |
| B04 | PASS | VP B03/B04：Staff/isSystemAdmin/PortalMember/会话/门户名称与幂等字段均不受恢复影响 |
| B05 | PASS | VP B05：users 剔除、旧格式仅默认门户显式确认、B 拒绝、数据库旧快照同样清洗 |
| B06 | PASS | VP B06 |
| B07 | PASS | VP B07/B08：20 并发只 1 份 auto，A/B 各 1，唯一约束存在，不增 revision |
| B08 | PASS（部分）| 失败后重试与 Europe/Madrid 业务日由 `businessDay()` 实现；跨午夜 / 夏令时转换日未做时钟模拟验证 |
| B09 | PASS | VP B09 |
| B10 | PASS | VP B10 |

## P. 公共状态、打印与二维码

| ID | 结果 | 证据 / 说明 |
|---|---|---|
| P01 | PASS | VP P01/P02/P03 + 升级演练中旧 token `tok-r1/tok-r2` 保留 |
| P02 | PASS | VP：公共 HTML 无内部备注 / 成本 / 密码字段 |
| P03 | PASS | VP：无效 token 与停用门户统一不可用；参数 / 头不能切换归属 |
| P04 | PASS（部分）| smoke-ui / smoke-mobile 打印小票与 A4、公开页通过；双门户同号打印仅通过 D05 扫码隔离与打印取单接口隔离间接覆盖 |

## M. 安装与迁移

| ID | 结果 | 证据 / 说明 |
|---|---|---|
| M01 | PASS | 空库 `db-setup`：严格凭据创建首位系统 / default 管理员，可从设置创建门户（smoke-portals） |
| M02 | PASS | MySQL 8.4 `repairnote_upgrade_test` 与 MariaDB 10.11 `repairnote_maria_test` 各演练一次：旧结构 + 数据 → 预检要求显式 ID → 升级 → `verify-portal-migration --after` 通过（15 表行数 / 金额 / token / id 一致，全部 default，权限回填，旧会话清空）；MariaDB 升级后应用启动、登录、创建门户、报表、公共页均正常 |
| M03 | PASS | 预检从初始迁移 SQL 解析完整结构逐项比对：每列类型 / 可空、主键列、索引（表 + 名称 + 唯一性 / 全文 + 字段及顺序）、外键（本表列 + 引用表 + 引用列）；MariaDB 下 JSON 列按 `longtext + CHECK json_valid` 校验。实测检出：只有 Staff 表、缺 `Client_name_idx`、`Payment.note` 改 TEXT、`Repair_publicToken_key` 由 UNIQUE 改普通索引、`Attribute_groupId_idx` 字段顺序变化、`Payment_repairId_fkey` 引用错表、MariaDB 上 JSON 列丢失 json_valid 约束；完整 MariaDB 旧库预检通过 |
| M04 | PASS | 在 `repairnote_upgrade_test` 演练：mysqldump 备份 → 人为删掉迁移会 DROP 的索引并绕过预检直接 `migrate deploy` → 迁移在中途失败（Portal 表、`Staff.isSystemAdmin` 已因隐式提交留下，`_prisma_migrations` 记录未完成）→ 再跑 `db-setup` 被预检拒绝 → 从备份恢复 → 重新升级并 `verify-portal-migration --after` 通过 |
| M05 | PASS | `npm run plesk:pack` 生成包含 migrations、`db-setup`/`db-preflight`/`portal-admin`/`verify-portal-migration`、文档的 ZIP；`docker build` 成功，镜像用空库 `repairnote_docker_test` 启动：预检 → 迁移 → 严格凭据创建系统主管理员 → check 通过，登录 / 门户列表 / 创建第二门户 API 均成功；缺少 `REPAIRNOTE_PUBLIC_ORIGIN` 时容器拒绝启动（非零退出） |

## S. 安全修复

| ID | 结果 | 证据 / 说明 |
|---|---|---|
| S01 | PASS | 四组初始化实测（缺失 / admin123 / 占位失败且 Staff=0；有效成功；重复 seed 不改哈希） |
| S02 | PASS | VP S02 |
| S03 | PASS | VP A09/G23、A10 |
| S04 | PASS | VP S04 |

## R. 原功能和交付

| ID | 结果 | 证据 / 说明 |
|---|---|---|
| R01 | PASS | smoke-ui 15/15、smoke-mobile 4/4、smoke-mobile-boss 5/5（演示数据库，账号 ming 单门户）；脚本仅做门户 / 账号 / 标签适配（`SMOKE_PORTAL_ID`、“移出门户”、旧 hash 映射），断言未削弱 |
| R02 | PASS | `verify-reports-parity.mjs` 全部 PASS（限定 default 门户）；双门户金额隔离见 D06 |
| R03 | PASS | VP R03：统一 `{error,code,requestId}`，无密码 / 哈希 / SQL |
| R04 | BLOCKED | 需在真实部署核对 HTTPS / Cookie / 代理头 / 多进程限流 / 上传上限；清单见运维说明 §7 |
| R05 | PASS（带说明）| build、lint、smoke、pack 退出码 0；`npm audit --omit=dev` 经 `npm audit fix` 后剩 3 个 high（prisma CLI 依赖 deepmerge-ts，修复需降级 prisma，属破坏性变更；不在请求路径），退出码 1，记录为已知项 |

## G. 设置内门户管理

| ID | 结果 | 证据 / 说明 |
|---|---|---|
| G01 | PASS | smoke-portals：系统管理员见入口，门店管理员 / 员工不见；窄屏截图 |
| G02 | PASS | VP G02 + smoke-portals 门店管理员访问管理 hash 无数据 |
| G03 | PASS | VP G03 + smoke-portals 无门户系统管理员直接进管理页并新建 |
| G04 | PASS | VP G04 + smoke-portals 新建门户；VP G04b：新建时可选同时创建只属于该门户的管理员账号（用户确认的范围内补充），重名 409、弱密码 400、重放不重复建账号、新账号不能进其他门户 / 系统接口 |
| G05 | PASS（代码级）| Portal/Setting/Member 在同一 `prisma.$transaction` 创建，任一失败回滚；未做注入失败的自动化用例 |
| G06 | PASS | VP G06、G06b（并发双提交） |
| G07 | PASS | VP G07 |
| G08 | PASS | VP G08 |
| G09 | PASS | VP G09 + 成员弹窗世代计数（代码） |
| G10 | PASS | VP G10 |
| G11 | PASS | VP G11/G11b + smoke-portals 停用 / 启用 |
| G12 | PASS | VP G11/G12 |
| G13 | PASS | VP G11/G12/G13：停用与业务保存并发，先持锁者先提交，停用后新写拒绝 |
| G14 | PASS | VP G14 |
| G15 | PASS | VP G15/G16 |
| G16 | PASS | VP G15/G16 + smoke-portals 权限勾选 |
| G17 | PASS | VP G17 |
| G18 | PASS | VP G18 |
| G19 | PASS | VP G19 |
| G20 | PASS | VP G20 |
| G21 | PASS | 升级演练：有效 ID 提升、缺失 / 不存在 / 非管理员 ID 预检阻断、其他旧管理员不提升 |
| G22 | PASS | 空库严格凭据；重复 seed 不改身份；bootstrap 指定其他账号拒绝；check 检出零管理员（脚本逻辑）；零管理员检出未单独构造 |
| G23 | PASS | VP A09/G23 |
| G24 | PASS | VP G24 |

## 审核意见处理（PR #1 第一轮）

| # | 意见 | 处理 |
|---|---|---|
| 1 | bootstrap 数据与 revision 非同一快照 | `getBootstrapData` 无外部事务时整段读取放进同一个只读事务（REPEATABLE READ 快照）。未做真实并发插入复现，属代码级修复 |
| 2 | 预检结构比对不完整 | 从初始迁移 SQL 解析完整结构逐项比对；补做 M04 中途失败恢复演练（见 M03 / M04） |
| 3 | useMemo 内销毁客户端在严格模式失效 | 改为 effect 挂载 activate / 清理 dispose；`next dev` 严格模式实测 14/14 |
| 4 | 员工移出后历史订单无法保存 | 技师引用只在新建或技师变化时校验（VP D03b） |
| 5 | 保存中切换保护未覆盖全部写入 | API 实例统计所有非 GET 请求；设置表单与编辑弹窗纳入离开保护（U03 / U04） |
| 6 | 员工写入可绕过版本检查 | 前端携带读取时版本，服务端缺失 400 / 过期 409（VP A12b） |

## 审核意见处理（PR #1 第二轮）

| # | 意见 | 处理 |
|---|---|---|
| 1 | 员工数据仍用可被其他操作推进的门户版本 | 已有成员的修改 / 移出改用成员记录自身 `updatedAt`（缺失 400、非法 400、过期 409，成功后严格递增）；员工页打开时重新拉取最新成员列表；新建员工仍带门户版本。VP A12b / A12c |
| 2 | MariaDB 的 JSON 别名被误判 | 预检按 `SELECT VERSION()` 识别 MariaDB：JSON 列要求 `longtext` 且存在 `CHECK json_valid(col)`；真实 MariaDB 10.11 旧库升级演练通过，丢失约束的 longtext 被拦下（M02 / M03） |
| 3 | 索引 / 主键 / 外键只比名称 | 比对表 + 名称 + 唯一性 / 全文 + 字段顺序、主键列、外键本表列 + 引用表 + 引用列；UNIQUE 改普通、字段顺序变化、外键指向错表均被检出（M03） |

## 汇总

- PASS：88；PASS（部分 / 代码级）：5（U06、B08、P04、G05、R05）；BLOCKED：1（R04，需真实部署环境）。
- BLOCKED 项均为需要真实部署环境或破坏性迁移中断演练的内容，已写入运维说明，**上线前必须由部署负责人完成**。
