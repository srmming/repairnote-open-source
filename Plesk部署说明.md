# RepairNOTE Plesk 部署说明

## 需要准备

- Plesk Node.js 支持，Node 版本选 24。
- Plesk MySQL/MariaDB 数据库和数据库用户。数据库需要先在 Plesk 面板创建。
- 一个域名，并开启 HTTPS。
- 项目生成的 Plesk 安装包：`npm run plesk:pack`。

## 本地打包

```bash
npm run plesk:pack
```

生成的 `RepairNOTE-Plesk-MySQL版-日期.zip` 上传到 Plesk 网站目录后解压。

## Plesk Node.js 设置

- Application root：解压后的项目目录
- Document root：同一个网站目录即可
- Application startup file：`server.js`
- Application mode：`production`
- Node.js version：`24`

## 环境变量

在 Plesk Node.js 的环境变量里填：

```env
DATABASE_URL=mysql://数据库用户名:数据库密码@localhost:3306/数据库名
REPAIRNOTE_COOKIE_SECURE=true
```

如果 Plesk 的数据库主机不是 `localhost`，用 Plesk 数据库页面显示的主机名。

Plesk 上不能只靠应用自动创建数据库：应用启动前必须已经有可连接的数据库和用户。Docker 部署才会自动拉起并创建配套 MySQL。

管理员账号不需要提前写进环境变量。空数据库首次打开网页时，会让你创建第一个管理员账号。

如果想在安装命令里直接创建管理员，可以额外填：

```env
REPAIRNOTE_ADMIN_USERNAME=admin
REPAIRNOTE_ADMIN_PASSWORD=换成强密码
```

## 安装命令

在 Plesk Node.js 页面运行：

```bash
npm install --omit=dev
npm run plesk:setup
```

`plesk:setup` 会把 Prisma schema 推到 MySQL/MariaDB、生成 Prisma Client、初始化基础数据，然后构建应用。

然后重启 Node.js 应用。

## 检查

打开域名。如果没有预设管理员账号，页面会要求创建第一个管理员账号。

如果启动失败，先看这三项：

- Node.js 是否是 24。
- `DATABASE_URL` 是否是 `mysql://...`。
- 数据库用户是否有当前数据库的建表和读写权限。
