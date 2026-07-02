# SPEC：前端去全量化改造（按需加载）

## 1. 目标（Objective）

**一句话**：前端不再把全部维修单（约 4 万单，还会增长）加载进浏览器内存，所有页面改为按需向服务器请求数据；保存操作从"整包提交"收敛为"按资源增量提交"。

**要解决的问题**：
- 登录后后台 Worker 会拉取全量数据合并进内存（`src/app/page.jsx` 的 `fetchFullBootstrapViaWorker`），数据量越大，加载越慢、内存占用越高。
- `saveData` 走 `/api/bootstrap` 整包 PUT，改一个小东西也可能提交一大包，传输浪费且有并发互相覆盖的风险。

**目标用户**：维修店店员/老板，日常在局域网或普通宽带环境使用，非技术人员。体验要求：页面秒开、操作流畅、功能和现在完全一样。

**最终验收标准（全部完成后）**：
- 登录后不再发起全量 `/api/bootstrap` 请求，`bootstrap-worker.js` 移除。
- 浏览器内存中的维修单数量 = 当前页面正在展示的数量（分页大小级别），而不是全库。
- 所有写操作走按资源接口（如 `/api/repairs/[id]`），不再有整包 PUT。
- 所有现有功能行为等价：列表/搜索/筛选/报表/财务/客户/技师/保修关联/备份导入导出，结果与改造前一致。
- 用 4 万单量级的测试数据验证：登录首屏 < 2 秒，列表翻页/搜索 < 1 秒（局域网）。

## 2. 改造策略（已确认的决定）

| 决定点 | 结论 |
|---|---|
| 节奏 | **分阶段逐页改**，每阶段可独立上线、可回退；改完所有页面后才移除全量加载 |
| 列表体验 | 接受服务器分页：翻页/搜索/筛选每次请求服务器 |
| 备份 | 改为**服务器端导出**（后端 `/api/backup/*` 已有基础） |

### 分阶段计划

- **阶段 0 — 接口盘点补齐**：核对 `/api/repairs/search`、`/api/repairs/aggregates`、`/api/reports/overview`、`/api/backup/*` 是否覆盖前端所有场景（筛选维度、排序、聚合口径），缺什么补什么。数据库按查询模式补索引。
- **阶段 1 — 维修单列表 + 快速查单**：`RepairsPage` 改为服务器分页/搜索/筛选；顶栏快速查单（`findRepairByTicket`）改走搜索接口。
- **阶段 2 — 报表/财务**：报表页、财务统计改走 `/api/reports/overview` 与 `/api/repairs/aggregates`，前端不再本地遍历全量单子计算。
- **阶段 3 — 客户页 + 技师页**：客户订单列表、技师订单列表、"客户是否有单不可删"等校验改走服务端接口。
- **阶段 4 — 表单内关联查询**：维修单表单里的保修单关联、按来源单查询、单号计数等改为按需接口查询。
- **阶段 5 — 备份与收尾**：备份导出/导入全部走服务器端；移除 `bootstrap-worker.js` 和全量 scope；`saveData` 整包 PUT 路径删除，各资源（catalog/attributes/technicians/clients/users/settings）全部走各自的增量接口。

**每个阶段的通用验收**：功能与改造前等价；`npm run build` 通过；smoke 脚本通过；单独一个（或一组）commit，可整体 revert。

## 3. 常用命令（Commands）

```bash
npm run dev            # 本地开发（0.0.0.0）
npm run build          # 构建，同时作为 lint 检查
npm run smoke          # 桌面端 UI 冒烟测试（Playwright）
npm run smoke:mobile   # 移动端冒烟
npm run audit:real-user # 真实用户路径审计
npm run db:migrate     # Prisma 迁移（开发）
npm run db:seed        # 填充种子数据
```

## 4. 项目结构（涉及范围）

```
src/app/page.jsx              # 8300+ 行单文件前端，本次改造的主战场
src/app/bootstrap-worker.js   # 后台全量拉取 Worker（阶段 5 移除）
src/app/api/bootstrap/        # 轻量+全量引导接口（全量 scope 最终移除）
src/app/api/repairs/          # search / aggregates / [id]（已有，按需增强）
src/app/api/reports/overview/ # 报表汇总接口（已有）
src/app/api/backup/           # 服务器端备份（已有 create/download/export/import/restore）
prisma/                       # 数据库 schema，加索引在这里改
scripts/smoke-*.mjs           # Playwright 冒烟脚本
```

## 5. 代码风格（Code Style）

- 跟随现有代码：JavaScript（非 TS 源码）、React 函数组件 + hooks、`page.jsx` 内现有的命名与组件划分方式。
- API 路由跟随现有 `route.js` 写法与鉴权模式（参考 `api/repairs/search/route.js`）。
- UI 文案保持现有中英双语字典（`t()`）机制，不新增硬编码文案。
- 新增服务端查询逻辑必须走 Prisma 查询/聚合，不要在 Node 里把全表读出来再过滤（否则只是把内存问题从浏览器挪到服务器）。

## 6. 测试策略（Testing）

- 每阶段完成后跑：`npm run build` + `npm run smoke`（+ 涉及移动端时 `smoke:mobile`）。
- 阶段 2（报表/财务）必须做**新旧对账**：同一份数据下，新接口汇总结果与旧的前端本地计算结果逐项一致后才切换。
- 用种子脚本生成 4 万单量级测试库做性能验收（首屏、翻页、搜索、报表耗时）。
- 上线前过一遍 `docs/门店试用验收清单.md` 的人工验收项。

## 7. 边界（Boundaries）

**始终（Always）**
- 每个阶段独立提交、独立可回退；旧路径在新路径验证通过前保留。
- 保持所有金额、报表统计口径与现状完全一致。
- 保持备份文件格式向后兼容（旧备份文件必须还能导入）。

**先问再做（Ask First）**
- 修改 Prisma schema / 数据库迁移（含加索引）之前。
- 删除 `/api/bootstrap` 全量 scope、`bootstrap-worker.js` 之前（阶段 5 的破坏性收尾）。
- 任何会改变用户可见交互方式的调整（不只是数据来源变化）。

**绝不（Never）**
- 不改变任何业务规则和计算口径（订金、折扣、保修逻辑等）。
- 不在服务器端用"全表读入内存再过滤"的方式实现接口。
- 不在中间阶段留下"部分数据来自内存、部分来自接口"却口径不一致的页面。
