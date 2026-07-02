# TASKS：前端去全量化改造任务清单

依据 SPEC.md 拆解。按顺序执行，`[x]` 表示完成；每完成一项单独 commit，信息注明任务编号。

## 盘点清单：src/app/page.jsx 全量 data.repairs 依赖点

| 行号 | 所在功能 | 现状（本地全量计算） | 改用的服务端接口 | 接口缺口 |
|---|---|---|---|---|
| 1537 | 顶栏快速查单/扫码 `findRepairByTicket` | 全量内存按单号找 | GET `/api/repairs/search?q=` | 无（前端取精确匹配即可） |
| 2098, 2107 | TopbarActions 打印：按 id 找单 + 关联保修单 | 全量 find/filter | GET `/api/repairs/[id]`（已有）+ search 按来源单 | search 缺 `sourceRepairId` 参数 |
| 2373, 2756 | RepairsPage 列表 `repairLookup` | 全量分页/筛选/汇总在前端 | GET `/api/repairs/search` + `/api/repairs/aggregates`（已有） | 无重大缺口 |
| 2748+ | QuickFindPage 快速查找页 | 全量模糊搜索 | GET `/api/repairs/search?q=` | 无 |
| 2966-2975 | ClientsPage 每客户订单计数 | 遍历全量 repairs 计数 | 客户列表接口随行返回 repairCount | 缺：`/api/clients` 无分页/搜索/计数查询 |
| 3010 | 删除客户前"有单不可删"校验 | 前端全量 some() | DELETE `/api/clients` 服务端校验 | 缺：服务端未校验 |
| 3259 | CategoriesPage 删除型号占用校验 | 前端全量 some() | 服务端占用校验 | 缺：无接口 |
| 3079+ | ClientOrdersPage 客户订单列表 | 全量 filter | search 按客户 | search 缺 `clientId` 参数 |
| 3514 | TechniciansPage 删除技师占用校验 | 前端全量 some() | 服务端占用校验 | 缺：无接口 |
| 3592+ | TechnicianOrdersPage 技师订单列表 | 全量 filter | search 按技师 | search 缺 `technicianKey`（id/历史名）参数 |
| 3712-3730 | ReportsPage 报表统计 | 全量 filter+reduce | GET `/api/reports/overview` | 已有但①内部是全表读内存（违反 SPEC 护栏，需重写为 SQL 聚合）②缺趋势(日/周/月)维度③金额口径需与前端 chargeAmount/repairPaidAmount 对齐 |
| 3839-3906 | FinancePage 收支流水/未收款 | 全量遍历生成流水 | 需新接口 GET `/api/reports/finance` | 缺：整个接口（汇总+付款流水+未收款列表+搜索+分页） |
| 4235, 4297 | BackupPage 导入校验/当前计数 | 依赖内存全量 | `/api/backup/*`（已有）+ 服务端计数 | 缺：当前库计数轻接口（可并入 bootstrap light） |
| 4568 | RepairForm 按 id 读单 | 全量 find | GET `/api/repairs/[id]`（已有） | 无 |
| 4768-4778 | RepairForm 状态计数/单号候选 | 全量 reduce | search 已返回 counts | 无 |
| 4928-4929 | RepairForm 保修来源单/关联单 | 全量 find/filter | `/api/repairs/[id]` + search `sourceRepairId` | 同上，缺参数 |
| 6999-7011 | mergeRepairAndClient/removeRepairFromData 本地缓存合并 | 维护全量数组 | 阶段 5 移除（改按页刷新） | — |
| 7054 | mergeFullBootstrap 全量合并 | Worker 全量拉取合并 | 阶段 5 整体删除 | — |
| 7725 | technicianDashboardRows 技师看板 | 全量遍历汇总 | 需 search/aggregates 按技师维度汇总 | 缺：技师看板聚合接口 |

另：ClientsPage 的客户列表本身也依赖全量 `data.clients`（bootstrap 全量返回），需要 `/api/clients` 分页搜索接口，随阶段 3 处理。

## 阶段 0：基建与取证（无 UI 改动）

- [ ] **T0.1** 40k 种子脚本：新增 `scripts/seed-40k.mjs`，可幂等生成约 40000 条维修单（含 items/payments/客户）供对账与压测。验收：脚本运行成功，输出 Repair 总数 ≈ 40000。
- [ ] **T0.2** Prisma 索引补齐：为 Repair 新增 `@@index([technicianId])`、`@@index([technicianName])`（技师订单/看板查询）；核对 searchText 查询路径。只新增索引，不删改字段。验收：迁移文件生成，`git diff prisma/` 展示，`npx prisma migrate dev` 成功。
- [ ] **T0.3** search 接口补参数：`/api/repairs/search` 与 `searchRepairs()` 支持 `clientId`、`sourceRepairId`、`technicianKey`（id 或历史姓名或 unassigned）。验收：curl 三种参数各返回正确过滤结果。

**检查点 CP0**：`npm run build` exit 0；commit。

## 阶段 1：维修单列表 + 快速查单

- [ ] **T1.1** RepairsPage 改服务器分页：列表数据、筛选（状态/类型/日期/关键词）、翻页、状态计数走 `/api/repairs/search`，金额/技师汇总条走 `/api/repairs/aggregates`；移除对 `data.repairs` 的依赖。验收：页面功能等价（筛选/翻页/计数/汇总一致），网络面板单次响应 ≤ pageSize 条。
- [ ] **T1.2** 顶栏快速查单/扫码 + QuickFindPage 改走 `/api/repairs/search?q=`。验收：输入完整单号直达该单；模糊词返回列表。
- [ ] **T1.3** 保存/删除后的本地合并改为"按页刷新"：`mergeRepairAndClient`/`removeRepairFromData` 在列表场景改为重新拉当前页。验收：新建/编辑/删除单后列表即时正确。

**检查点 CP1**：`npm run build` + `npm run smoke` 通过；commit。

## 阶段 2：报表/财务改服务端计算

- [ ] **T2.1** 重写 `/api/reports/overview` 为 SQL/Prisma 聚合（禁止 getBootstrapData 全量读内存），口径对齐前端：`chargeAmount`/`repairCostAmount`/`repairPaidAmount`/`isCanceledRepair`；新增趋势数据（日/周/月 × 金额/单量）与 topModels(limit 0)。验收：接口返回含 summary/technicianStats/topModels/trend。
- [ ] **T2.2** 新增 GET `/api/reports/finance`：汇总（receivable/cost/received/unpaid）+ 付款流水（分页、搜索、时间范围）+ 未收款列表（分页、搜索）。SQL/Prisma 聚合实现。验收：curl 返回结构完整。
- [ ] **T2.3** 对账脚本 `scripts/verify-reports-parity.mjs`：同一数据库下，用旧前端口径（从 page.jsx 复刻的纯函数）全量计算 vs 新接口输出，逐项对比 overview 与 finance 汇总。验收：脚本运行输出全部一致（PASS）。**全部一致后才允许执行 T2.4/T2.5。**
- [ ] **T2.4** ReportsPage 切换到 `/api/reports/overview`，移除本地全量计算。验收：页面数字与切换前一致。
- [ ] **T2.5** FinancePage 切换到 `/api/reports/finance`，流水/未收款分页加载。验收：汇总与切换前一致，流水分页可用。

**检查点 CP2**：对账脚本 PASS；`npm run build` + `npm run smoke`；commit。

## 阶段 3：客户页 + 技师页

- [ ] **T3.1** `/api/clients` 增加 GET：分页 + 搜索 + 每客户 repairCount（SQL 聚合）；DELETE 增加服务端"有单不可删"校验。验收：curl 分页/搜索正确；删除有单客户返回 409/错误。
- [ ] **T3.2** ClientsPage 改服务器分页搜索，删除校验交给服务端错误提示。验收：功能等价。
- [ ] **T3.3** ClientOrdersPage 改 `search?clientId=`。验收：某客户订单列表与改前一致。
- [ ] **T3.4** 技师维度聚合接口：`/api/technicians` 增加看板聚合（按技师汇总单量/金额/最新单，支持日期筛选），或扩展 aggregates；TechniciansPage 看板 + TechnicianOrdersPage(`search?technicianKey=`) 切换；删除技师占用校验移到服务端。验收：看板数字与改前一致。
- [ ] **T3.5** CategoriesPage 删除型号占用校验走服务端（catalog DELETE 校验或轻量 count 接口）。验收：删除被占用型号被服务端拒绝。

**检查点 CP3**：`npm run build` + `npm run smoke`；commit。

## 阶段 4：表单内关联查询

- [ ] **T4.1** RepairForm/TopbarActions 按 id 读单改 GET `/api/repairs/[id]`（直开链接、打印场景不再依赖全量）。验收：直接打开 `/dashboard/repairs/<id>` 正常显示与打印。
- [ ] **T4.2** 保修来源单/关联保修单改 `/api/repairs/[id]` + `search?sourceRepairId=`。验收：保修单表单显示来源单信息、原始单显示关联保修单，与改前一致。
- [ ] **T4.3** RepairForm 状态计数改用 search 返回的 counts（或去除依赖）。验收：表单页不再读取 `data.repairs`。

**检查点 CP4**：`npm run build` + `npm run smoke`；commit。

## 阶段 5：备份收尾 + 移除全量路径

- [ ] **T5.1** BackupPage 去 `data.repairs` 依赖：当前计数走服务端（bootstrap light 返回 counts），导入/恢复全走 `/api/backup/*`；旧备份文件格式保持可导入。验收：备份页展示计数正确，导入旧格式备份成功。
- [ ] **T5.2** 删除全量加载：删 `src/app/bootstrap-worker.js`、`fetchFullBootstrapViaWorker`、`mergeFullBootstrap`；`/api/bootstrap` GET 不再返回全量 repairs/clients（light 语义成为唯一语义，返回 counts）。验收：`grep -rn "bootstrap-worker" src/` 0 命中；bootstrap 响应无全量 repairs。
- [ ] **T5.3** 删除整包 PUT：page.jsx 中 `saveData` 的 `/api/bootstrap` PUT 路径移除，所有写操作走按资源接口（repairs/clients/staff/settings/catalog/attributes/technicians）；`/api/bootstrap` 的 PUT handler 删除。验收：`grep -n "api/bootstrap" src/app/page.jsx` 无 PUT 用法。
- [ ] **T5.4** 性能取证：40k 库下展示 bootstrap 响应 repairs 数量为 0 或仅一页、search 单次响应 ≤ pageSize、记录接口耗时。
- [ ] **T5.5** 全量验证：`npm run build` exit 0；`npm run smoke` 全绿（必要时 docker-compose 起库 + `npm run db:seed`）。

**检查点 CP5**：commit。

## 阶段 6：收尾审查

- [ ] **T6.1** 调用 agent-skills:review 对整个分支做五维审查（正确性/可读性/架构/安全/性能），展示结论。
- [ ] **T6.2** 修复审查发现的 critical/high 问题并重跑 T5.5 验证，最终严重问题为 0。

## 全局护栏（每个任务都适用）

- 不改变任何业务计算口径（订金/折扣/保修/报表金额）。
- 不修改 `scripts/smoke-*.mjs` 等测试脚本断言；不修改对账脚本来凑一致。
- Prisma 只允许新增索引；不新增 npm 依赖；不改 `docs/` 与 `README.md`。
- 服务端接口不得全表读内存再过滤。
- 旧备份文件保持可导入。
