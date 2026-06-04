# RepairNOTE Open Source Checklist

更新时间：2026-06-04

## 结论

不要直接把当前私有 GitHub 仓库改成公开仓库。公开现有仓库会公开完整 Git 历史，而历史和当前跟踪文件里出现过内部输出、截图、部署日志和数据库文件痕迹。

推荐做法：创建一个干净的公开仓库，只提交清理后的源码和公开文档，把当前私有仓库继续作为内部开发与部署仓库。

## 必须先处理

- 不公开现有 Git 历史。
- 不公开 `.env`、数据库 dump、客户备份、清洗输出、Plesk 打包 ZIP。
- 从公开版移除 `outputs/`、`screenshots/`、根目录验收图片、PPT 产物、缩略图缓存。
- 脱敏或移除 `project-log.md` 中的服务器 IP、远端路径、备份路径和内部运维记录。
- 检查 `docs/开单维修系统-PRD.md`、`MySQL迁移说明.md`、`AGENTS.md` 是否适合公开。
- 决定开源许可证，例如 MIT、Apache-2.0 或 GPL。

## 建议公开保留

- `src/`
- `prisma/schema.prisma`
- `prisma/migrations/`
- `scripts/` 中不包含真实数据的部署、测试、打包脚本
- `Dockerfile`
- `docker-compose.yml`
- `docker-compose.prod.yml`
- `.env.example`
- `.env.vps.example`
- `.env.plesk.example`
- `README.md`
- `package.json`
- `package-lock.json`
- `next.config.mjs`
- `jsconfig.json`

## 建议公开前改造

- 补 `LICENSE`。
- 给 `package.json` 增加公开项目描述、仓库地址、license 和 engines。
- 将示例密码改成明确的占位符或只保留安装提示。
- 将品牌信息统一成公开 demo 口径，避免混入真实门店资料。
- 给导入真实历史数据的脚本加说明，确认只包含公开可复用逻辑。

## GitHub 发布路径

推荐路径：

1. 在本地生成一个干净目录或 orphan 分支。
2. 只复制公开允许的源码和文档。
3. 重新初始化 Git，并做第一条公开提交。
4. 新建公开仓库，例如 `repairnote` 或 `repairnote-open-source`。
5. 推送干净仓库。
6. 私有仓库继续用于真实部署、客户数据、内部日志和历史记录。

不推荐路径：

- 直接把当前私有仓库从 private 改成 public。
- 在没有历史清理的情况下删除当前文件后公开。
- 把部署 ZIP 或真实备份作为 release 附件发布。
