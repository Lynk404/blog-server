# 部署与上线准备

本文说明把当前项目部署到单台云服务器（VPS）时的拓扑、必须调整的配置、Nginx 示例、备份和上线检查清单。

当前图片仍存本地 `uploads/`，**不做 GridFS / 对象存储改造**。本方案适用于：

- 单台 VPS / 云服务器，系统盘或数据盘持久；
- Node、MongoDB、Nginx 可以装在同一台机器；
- 只有一个 Node 实例（或所有实例共享同一份 `uploads`）。

Serverless、PaaS 的临时文件系统、无持久卷的容器、多实例负载均衡都不适合本地 `uploads/`，需要另换对象存储或 GridFS。

---

## 1. 部署拓扑

```text
浏览器
  │ HTTPS 443
  ▼
Nginx（forum.example.com）
  ├─ /                → blog-web/dist（SPA）
  ├─ /api/            → Node 127.0.0.1:3000
  ├─ /admin/          → Node
  ├─ /keys /index     → Node
  ├─ /upload/         → Node
  ├─ /articles/search → Node
  ├─ /articles/likes/ → Node
  ├─ /user            → Node（API；/user/xxx.jpg 走下面的图片正则）
  ├─ /article/*.jpg   → /var/www/yesforum/uploads/article/
  ├─ /user/*.jpg      → /var/www/yesforum/uploads/user/
  └─ /images/         → Node（默认头像等 public 资源）
Node（127.0.0.1:3000，PM2 或 systemd）
MongoDB（127.0.0.1:27017/db_blog）
```

- Nginx 对公网只开放 80/443；Node 与 MongoDB 只监听本机或只允许本机访问。
- 图片 URL 是**绝对地址**，`uploadURL` 必须等于用户浏览器能访问的 HTTPS 根地址。
- 前端与后端建议使用同一个域名，通过 Nginx 路径分流，避免额外 CORS 配置。

---

## 2. 上线前必须调整

### 2.1 应用配置（`blog-server/config.js`）

上线时应用侧只需要改这个文件。主要字段：

| 字段 | 说明 |
| --- | --- |
| `uploadURL` | 图片对外根地址，必须改成 `https://实际域名/` |
| `dbURL` | MongoDB 地址；服务、密钥脚本、迁移脚本、回归脚本都读取这里 |
| `host` / `port` | Node 监听地址与端口，`bin/www` 使用 |
| `keyPath` | 密钥目录；四把密钥路径由它派生，可用 `KEY_PATH` 覆盖 |
| `uploadPath` | 上传目录；可改为发布目录之外的绝对路径 |
| `legacyUploadURL` | 旧图片地址，仅 `scripts/update-image-urls.js` 使用 |
| `corsOrigins` | CORS 来源；开发为 `true`，上线建议改为 `['https://实际域名']` |
| `maxFileSize` | 单文件上限，默认 2MB |

生产示例：

```js
module.exports = {
  host: '127.0.0.1',                 // 只经 Nginx 暴露
  port: 3000,
  dbURL: 'mongodb://127.0.0.1:27017/db_blog',
  keyPath: '/var/www/yesforum/server/auth',
  uploadPath: '/var/www/yesforum/uploads',
  uploadURL: 'https://forum.example.com/',
  legacyUploadURL: 'http://127.0.0.1:3000/',
  corsOrigins: ['https://forum.example.com'],
  // maxFileSize 保持原值；四把密钥路径由 keyPath 自动派生
}
```

要求：

- `uploadURL` 使用 `https://`，否则 HTTPS 页面会拦截图片（混合内容）。
- 保留末尾 `/`；上传接口按 `${uploadURL}/article/<文件名>` 的规则拼接。
- 不要写 `localhost`、`127.0.0.1` 或只写域名不带协议。
- `dbURL` 改了以后，所有脚本都跟着变，不需要再逐个改 `sync-key.js`、迁移脚本、回归脚本。
- **新用户不再有默认头像，新文章不再有默认封面**：`models/User.js` 与 `models/Article.js` 的 `default` 已移除。头像缺失时前端显示昵称首字；封面缺失时不渲染封面区域。
- 已有用户仍保留数据库里的旧默认头像；已有文章如果仍保存旧默认封面，用 2.2 的 `--unset-default-covers` 清空。旧用户头像按当前决定不清空。
- 改完配置后需要重启 Node 进程。

### 2.2 历史图片 URL（`scripts/update-image-urls.js`）

现有数据库里的 `Article.cover`、`User.avatar` 是旧的 `http://127.0.0.1:3000/...` 绝对地址。只改配置不会改历史数据，上线后会坏图。

如果保留现有数据，先备份数据库（见第 4 节），然后在 `blog-server` 目录执行：

```bash
# 1. 只统计，不写库
node scripts/update-image-urls.js

# 2. 确认数量无误后写库
node scripts/update-image-urls.js --apply

# 3. 如需清空已有文章的旧默认封面
node scripts/update-image-urls.js --apply --unset-default-covers
```

- 脚本读取 `config.legacyUploadURL` 和 `config.uploadURL`，不需要再改脚本。
- 默认是 dry-run；`--apply` 才写库。
- 更新 `Article.cover`、`Article.content`、`User.avatar`；使用原生集合更新，避免触发 `Article.content` 的 Mongoose setter（`decodeURIComponent` / 引号替换）。
- `--unset-default-avatars` 可以把仍等于旧默认头像的 `User.avatar` 清空；当前决定是**旧用户继续显示默认头像**，所以默认不加这个参数。
- `--unset-default-covers` 会把 `cover` 等于旧默认封面（`legacyUploadURL + article/article-cover.jpg`）的文章清空封面；不加则旧文章继续显示默认封面。
- 当前数据中正文没有内部上传 URL；脚本仍会处理 `content`，防止以后有遗漏。
- 如果上线使用**全新数据库**，可以跳过替换；新用户和新文章本来就不会再写入默认头像/封面。
- 替换前先统计数量，替换后抽查若干帖子/用户。

### 2.3 `uploads/` 持久化

`config.js` 的 `uploadPath` 默认是 `path.join(process.cwd(), '/uploads')`；`keyPath` 默认是 `path.join(process.cwd(), '/auth')`，四把密钥路径由它派生。推荐直接在 `config.js` 改成发布目录之外的绝对路径：

```js
uploadPath: '/var/www/yesforum/uploads',
keyPath: '/var/www/yesforum/server/auth',
```

- 这样可以避免软链接；Nginx 的图片 `root` 指向同一个目录即可。
- 如果保留默认相对路径，**必须从 `blog-server` 目录启动服务**，否则 `auth/` 和 `uploads/` 会写错位置。
- Docker 需要把 `config.uploadPath`、`config.keyPath` 对应的目录挂到持久 volume，否则重建容器会丢密钥和图片。
- `uploads/` 需要 Node 进程可写；如果 Nginx 直接读图片，Nginx 用户也要可读。
- **不要在服务器工作目录执行 `git clean -fd`**：新上传的图片是未跟踪文件，会被直接删除。

### 2.4 Nginx

关键点：

- `client_max_body_size` 默认 1 MB，小于上传上限 2 MB；必须调大，否则上传会在 Nginx 层返回 413。
- 图片路径 `/article/...`、`/user/...` 必须用**带扩展名的正则 location**，否则 `/user/` 会把后端 `GET /user` 接口截走。
- `/articles/search`、`/articles/likes/` 是后端接口，必须在 SPA 的 `try_files` 之前代理到 Node。

示例（按实际域名、目录调整）：

```nginx
server {
    listen 443 ssl http2;
    server_name forum.example.com;

    # 证书路径按实际填写（certbot 生成）
    ssl_certificate     /etc/letsencrypt/live/forum.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/forum.example.com/privkey.pem;

    # 2 MB 文件 + multipart 开销，留余量
    client_max_body_size 3m;

    root /var/www/yesforum/web;   # blog-web/dist
    index index.html;

    # 1) 后端 API 与上传
    location /api/            { proxy_pass http://127.0.0.1:3000; include /etc/nginx/proxy_params; }
    location /admin/          { proxy_pass http://127.0.0.1:3000; include /etc/nginx/proxy_params; }
    location = /keys          { proxy_pass http://127.0.0.1:3000; include /etc/nginx/proxy_params; }
    location = /index         { proxy_pass http://127.0.0.1:3000; include /etc/nginx/proxy_params; }
    location /upload/         { proxy_pass http://127.0.0.1:3000; include /etc/nginx/proxy_params; }
    location = /articles/search { proxy_pass http://127.0.0.1:3000; include /etc/nginx/proxy_params; }
    location ^~ /articles/likes/ { proxy_pass http://127.0.0.1:3000; include /etc/nginx/proxy_params; }
    location /user            { proxy_pass http://127.0.0.1:3000; include /etc/nginx/proxy_params; }

    # 2) 默认头像等 public 资源
    location /images/         { proxy_pass http://127.0.0.1:3000; include /etc/nginx/proxy_params; }

    # 3) 上传图片：只匹配带图片扩展名的路径（~* 兼容 .JPG 等大写后缀）
    location ~* ^/(article|user)/[^/]+\.(jpg|jpeg|png|gif|webp)$ {
        root /var/www/yesforum/uploads;
        expires 30d;
        add_header Cache-Control "public";
        add_header X-Content-Type-Options nosniff;
    }

    # 4) 前端 SPA
    location / {
        try_files $uri $uri/ /index.html;
    }
}

server {
    listen 80;
    server_name forum.example.com;
    return 301 https://$host$request_uri;
}
```

说明：

- 上面的 `root /var/www/yesforum/uploads` 会让 `/article/a.jpg` 映射到 `/var/www/yesforum/uploads/article/a.jpg`，与当前 `express.static(uploads)` 的路径一致。
- 如果图片改为由 Node 提供，可把第 3 段换成 `proxy_pass http://127.0.0.1:3000;`；性能不如 Nginx 直接读文件，但配置更少。
- 如果 API 使用独立子域名（如 `api.example.com`），`uploadURL` 和前端 `VITE_APP_BASE_URL` 都改成该子域名，并在后端配置 CORS 白名单。
- `include /etc/nginx/proxy_params` 是常见发行版自带文件；若没有，至少设置 `proxy_set_header Host $host;`、`X-Real-IP`、`X-Forwarded-For`、`X-Forwarded-Proto $scheme;`。
- 图片文件名带时间戳，内容不会原地覆盖，30 天缓存是安全的。

### 2.5 前端生产构建

`src/api/request.ts` 的 `baseURL` 是 `import.meta.env.VITE_APP_BASE_URL || ''`：

- **推荐：前后端同域名**（Nginx 路径分流）。生产构建不需要 `.env.production`，请求走同源。
- **只有 API 使用独立域名时**，才创建 `blog-web/.env.production`：

```bash
VITE_APP_BASE_URL=https://api.example.com
```

- 值不要带末尾 `/`，与 axios 的 `baseURL` 用法一致。
- 开发环境仍由 `.env.development` 指向 `http://127.0.0.1:3000`，不需要改。
- `VITE_APP_FILE_UPLOAD_PATH` 是预留变量，当前 `src/` 未引用，不要依赖它。
- 构建：

```bash
cd blog-web
npm ci
npm run build
```

- 产物在 `blog-web/dist/`，部署到 Nginx 的 `root`。
- 生产必须启用 HTTPS：密码加密使用 WebCrypto，`crypto.subtle` 只在 HTTPS 或 localhost 下可用。
- 如果前端与后端不同域，确认 `config.corsOrigins` 包含前端域名。

### 2.6 密钥、MongoDB 与进程

**密钥**

- `config.keyPath` 下需要四个文件：`public.cer`、`private.cer`、`jwt-public.pem`、`jwt-private.pem`；默认是 `auth/`，四把密钥路径由 `keyPath` 派生。
- `sync-key.js` 和两个密钥迁移脚本都读取 config 的密钥路径，因此只改 `keyPath` 即可整体移动密钥目录。
- 新环境按 `README.md` 的命令生成，然后执行 `node scripts/sync-key.js`。
- 默认的 `auth/` 被 `.gitignore` 忽略，不会随代码发布；自定义 `keyPath` 时也要确保目录不进入 Git，并单独备份。
- 不要在生产环境重新生成密码密钥，否则存量用户密码全部失效。

**MongoDB**

- 数据库地址已集中到 `config.dbURL`；`plugins/db.js`、`scripts/sync-key.js`、迁移脚本、回归脚本都读取它。
- 单机本地 Mongo 可以直接用；如果开启 Mongo 认证或换远程地址，只改 `config.dbURL` 并重启。
- 建议 MongoDB 只监听 `127.0.0.1`，不要暴露 27017。
- 定期备份 `db_blog`。

**进程**

- `bin/www` 使用 `config.port` 和 `config.host`；生产可以在 `config.js` 里把 `host` 改成 `127.0.0.1`，只让 Nginx 访问。
- 生产用 PM2 或 systemd 托管，工作目录必须是后端根目录：

```js
// ecosystem.config.js（示例）
module.exports = {
  apps: [{
    name: 'yesforum-api',
    cwd: '/var/www/yesforum/server',
    script: 'bin/www',
    env: { NODE_ENV: 'production' } // 端口/数据库从 config.js 读取
  }]
}
```

- `npm start` 调用的 nodemon 没有写进 `package.json`；生产可以直接 `node ./bin/www` 或用 PM2 的 `script: 'bin/www'`。
- Node 版本要求 ≥ 20。

### 2.7 CORS

`app.js` 使用 `config.corsOrigins`：

```js
cors({ origin: corsOrigins, credentials: true, ... })
```

- 开发默认 `corsOrigins: true`，反射任意来源。
- 上线时在 `config.js` 改为前端域名数组：

```js
corsOrigins: ['https://forum.example.com']
```

- 鉴权使用 `Authorization` 头而不是 Cookie，CSRF 风险有限；但公网开放后应收敛来源。前后端不同域时必须配置正确，否则浏览器会拦截请求。

---

## 3. 备份与回滚

**上线前备份**

```bash
# 数据库
mongodump --db db_blog --gzip --archive=/var/backups/db_blog-$(date +%F).gz

# 上传图片
tar czf /var/backups/uploads-$(date +%F).tar.gz -C /var/www/yesforum uploads

# 密钥
tar czf /var/backups/auth-$(date +%F).tar.gz -C /var/www/yesforum/server auth
```

**回滚**

```bash
mongorestore --gzip --archive=/var/backups/db_blog-YYYY-MM-DD.gz
tar xzf /var/backups/uploads-YYYY-MM-DD.tar.gz -C /var/www/yesforum
```

- 代码回滚时保留上一版 `dist/` 与后端代码目录。
- 如果改过 `uploadURL` 并替换了数据库图片 URL，回滚代码时要同时恢复数据库，否则新 URL 可能无法解析。
- 上线前记录旧 `uploadURL`、新域名、数据库替换数量。

---

## 4. 建议改进（不阻塞上线）

- **配置环境变量化**：`config.js` 已支持 `PUBLIC_URL`、`MONGODB_URI`、`UPLOAD_PATH`、`HOST`、`PORT` 等环境变量覆盖；默认值仍集中在 `config.js`，只有需要容器/多环境覆盖时才用环境变量。
- **上传校验**：当前只校验扩展名，`upload.any()` 也没有文件数量上限；建议增加文件头魔数校验和 `limits.files`。
- **孤儿文件清理**：删除文章/用户/更换头像不会删除 `uploads/` 里的旧文件；后续可加 dry-run 清理脚本。
- **uploads 与 Git**：`uploads/` 目前未加入 `.gitignore`，共有 30 个图片文件被 Git 跟踪。建议只保留默认封面/头像，其余忽略；删除仓库内文件前单独确认。
- **多实例**：本地磁盘无法在多个 Node 实例间共享；未来上多实例/Serverless 时再评估 GridFS 或对象存储。
- **图片 URL 形式**：当前数据库存绝对 URL，换域名要迁移；未来可改成相对路径 + 前端/接口统一拼域名，减少域名绑定。

---

## 5. 上线检查清单

- [ ] 域名解析到服务器，HTTPS 证书可用
- [ ] `config.js` 的 `uploadURL` 是 `https://实际域名/`
- [ ] `config.js` 的 `dbURL`、`host`/`port`、`corsOrigins`、`keyPath`、`uploadPath` 已按线上环境填写
- [ ] 新用户无默认头像、新文章无默认封面，头像显示昵称首字、封面区域不渲染
- [ ] 历史 `Article.cover` / `User.avatar` 已替换，或确认使用全新数据库
- [ ] 旧默认封面是否清空已确认（`--unset-default-covers`）
- [ ] 同域名部署时未依赖 `.env.production`；跨域时 `VITE_APP_BASE_URL` 正确，`dist/` 已构建
- [ ] `uploads/` 位于持久目录，Node 可写、Nginx 可读，已纳入备份
- [ ] `auth/` 四把密钥就绪，已执行 `sync-key.js`
- [ ] MongoDB 只监听本机，备份任务已配置
- [ ] Nginx `client_max_body_size` ≥ 3m
- [ ] Nginx 图片正则、`/user` API、`/articles/search`、SPA fallback 均验证通过
- [ ] CORS 白名单、防火墙、端口收敛（只开 80/443）
- [ ] 上传封面/头像、列表/详情/评论头像、重启后图片仍可访问
- [ ] `git clean -fd` 不在服务器工作目录执行
- [ ] 若使用相对路径，PM2/systemd 工作目录为后端根目录；否则已在 `config.js` 配好绝对路径，重启自启已配置

---

## 6. 已知限制

- 本地 `uploads/` 只适合单机持久磁盘；容器无 volume、Serverless、多实例不适用。
- 删除文章/用户不会清理图片文件，磁盘会持续增长，需要人工或脚本清理。
- 上传只校验扩展名，没有文件头校验和文件数量上限。
- 图片 URL 是绝对地址，换域名需要更新数据库。
- 后端没有加载 `.env` 的代码；`config.js` 支持环境变量覆盖，生产变量通过 PM2/systemd/容器注入，默认值仍在 `config.js`。
- 前端同域名部署不需要 `.env.production`；跨域部署才需要设置 `VITE_APP_BASE_URL`。
- `uploads/` 中部分演示图片被 Git 跟踪，部署与清理时需要区分默认资源和用户上传。
