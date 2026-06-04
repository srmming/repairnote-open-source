# RepairNOTE Docker 安装说明

这份说明给 Docker / Synology Container Manager 用户使用。推荐用 Stack / Compose 安装，最省事。

## 默认登录账号

- 地址：`http://你的设备IP:3000`
- 用户名：`admin`
- 密码：`admin123`

第一次启动时，系统会自动建表并初始化这个管理员账号。已经有员工账号的数据库不会被覆盖。

上线后建议马上登录系统，把管理员密码改成自己的强密码。

重要提醒：`admin123` 只适合首次安装。不要把这个端口直接暴露到公网；如果要给外网访问，请先改密码，再配置 HTTPS。

## 方法一：用 Stack / Compose 安装

1. 把整个项目文件夹上传到 NAS 或服务器。
2. 打开 Synology Container Manager / Docker 面板。
3. 新建 Project / Stack，选择项目里的 `docker-compose.prod.yml`。
4. 启动项目。
5. 浏览器打开 `http://NAS的IP:3000`。

这个方式需要 Docker 面板支持从 Dockerfile 构建镜像，并且 NAS / 服务器能联网下载依赖。上传时要上传整个项目文件夹，不要只上传 `docker-compose.prod.yml`。

`docker-compose.prod.yml` 已经包含：

- RepairNOTE 应用
- MySQL 数据库
- 数据库持久化 volume
- 对外端口 `3000`
- 默认管理员 `admin / admin123`

如果 3000 端口被占用，可以在 Stack 环境变量里加：

```env
REPAIRNOTE_PORT=3001
```

然后访问 `http://NAS的IP:3001`。

## 方法二：没有 Stack 时用命令安装

在项目目录里执行：

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

如果你的 Docker 版本不识别 compose 文件里的项目名，就用这一条：

```bash
docker compose -p repairnote -f docker-compose.prod.yml up -d --build
```

查看运行状态：

```bash
docker compose -f docker-compose.prod.yml ps
```

停止服务：

```bash
docker compose -f docker-compose.prod.yml down
```

注意：不要随便删除 volume。数据库数据保存在名为 `repairnote-mysql-data` 的 volume 里，删除它会清空系统数据。

## 可选：修改默认参数

如果想提前改默认密码，可以复制 `.env.vps.example` 为 `.env`，再修改里面的值：

```env
REPAIRNOTE_ADMIN_USERNAME=admin
REPAIRNOTE_ADMIN_PASSWORD=你的新密码
MYSQL_PASSWORD=你的数据库密码
REPAIRNOTE_PORT=3000
```

注意：`REPAIRNOTE_ADMIN_PASSWORD` 不能使用 `change-this-before-deploy`。如果数据库里已经有员工账号，seed 不会覆盖原账号。

## 启动时系统会做什么

每次容器启动时会自动执行：

1. 数据库迁移：把表结构更新到当前版本。
2. 初始数据：空库时创建管理员和基础品牌、服务、配件等数据。
3. 启动网页服务。

正常启动后，普通用户只需要打开浏览器访问端口即可。
